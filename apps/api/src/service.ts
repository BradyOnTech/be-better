import { randomUUID } from "node:crypto";
import { eq, asc, desc, and, gte, lte } from "drizzle-orm";
import { z } from "zod";
import type { UIMessage } from "ai";
import {
  activityInputSchema,
  activitySchema,
  athleteSchema,
  athletePatchSchema,
  planInputSchema,
  addDays,
  dateInTimezone,
  weekStart,
  dayOfWeek,
  isHard,
  DomainError,
  formatDuration,
  type Athlete,
  type Activity,
  type ActivityInput,
  type PlanInput,
  type PlanSession,
  type CoachNote,
  type AppState,
  type Race,
  raceInputSchema,
  type PlanBlock,
  type CoachQuestion,
  type ImportDraft,
  planDecisionSchema,
  type PlanDecision,
} from "../../../packages/domain/src/index.js";
import { tables, type CoachDatabase } from "./db.js";
import { validatePlan } from "./guardrails.js";
import { IntervalsAnalysisStore } from "./intervals-analysis.js";
import { TrainingPrograms } from "./training-programs.js";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export class CoachService {
  public analysis: IntervalsAnalysisStore;
  public programs: TrainingPrograms;
  constructor(
    public database: CoachDatabase,
    public now: () => Date = () => new Date(),
    public mode: AppState["coach"] = { mode: "guided", model: null },
  ) {
    this.analysis = new IntervalsAnalysisStore(this);
    this.programs = new TrainingPrograms(this);
    const athlete = athleteSchema.parse({
      id: "athlete",
      name: "",
      timezone: process.env.ATHLETE_TIMEZONE || "America/Chicago",
      units: "mi",
      longRunDay: 6,
      restDays: [],
      weeklyMinutes: null,
      longestRunMinutes: null,
      constraint: "none",
      constraintNote: "",
    });
    database.db
      .insert(tables.athlete)
      .values({ id: "athlete", data: athleteSchema.parse(athlete) })
      .onConflictDoNothing()
      .run();
  }
  athlete(): Athlete {
    return athleteSchema.parse(
      this.database.db.select().from(tables.athlete).get()!.data,
    );
  }
  today(): string {
    return dateInTimezone(this.now(), this.athlete().timezone);
  }
  activities(from = addDays(this.today(), -27), to = this.today()): Activity[] {
    return this.database.db
      .select()
      .from(tables.activities)
      .where(
        and(gte(tables.activities.date, from), lte(tables.activities.date, to)),
      )
      .orderBy(desc(tables.activities.date))
      .all()
      .filter((row) => row.confirmed)
      .map((row) => activitySchema.parse(row.data));
  }
  plan(
    from = addDays(this.today(), -3),
    to = addDays(this.today(), 13),
  ): PlanSession[] {
    return this.database.db
      .select()
      .from(tables.plan)
      .where(and(gte(tables.plan.date, from), lte(tables.plan.date, to)))
      .orderBy(asc(tables.plan.date))
      .all()
      .map((row) => row.data);
  }
  notes(): CoachNote[] {
    return this.database.db
      .select()
      .from(tables.notes)
      .orderBy(desc(tables.notes.createdAt))
      .limit(30)
      .all()
      .map((row) => row.data);
  }
  messages(): UIMessage[] {
    return this.database.db
      .select()
      .from(tables.messages)
      .orderBy(desc(tables.messages.sequence))
      .limit(100)
      .all()
      .reverse()
      .map((row) => row.data);
  }
  saveMessage(message: UIMessage) {
    const existing = this.database.db
      .select()
      .from(tables.messages)
      .where(eq(tables.messages.id, message.id))
      .get();
    const sequence =
      existing?.sequence ??
      (this.database.db
        .select()
        .from(tables.messages)
        .orderBy(desc(tables.messages.sequence))
        .get()?.sequence ?? 0) + 1;
    this.database.db
      .insert(tables.messages)
      .values({ id: message.id, sequence, data: message })
      .onConflictDoUpdate({
        target: tables.messages.id,
        set: { data: message },
      })
      .run();
  }
  activityLoad(activity: Activity): number {
    const intentWeight =
      activity.planSessionId &&
      this.session(activity.planSessionId).outcome !== "replaced" &&
      this.session(activity.planSessionId).outcome !== "modified"
        ? {
            rest: 0,
            easy: 3,
            endurance: 4,
            long: 5,
            quality: 7,
            hills: 7,
            race: 9,
            strength: 4,
            "back-to-back": 4,
          }[this.session(activity.planSessionId).intent]
        : 4;
    return (activity.durationSeconds / 3600) * (activity.rpe ?? intentWeight);
  }
  state(): AppState {
    const athlete = this.athlete();
    const today = this.today();
    const activities = this.activities();
    const confirmed = activities.filter((activity) => activity.confirmed);
    const monday = weekStart(today);
    const week = confirmed.filter((activity) => activity.date >= monday);
    const previous = confirmed.filter(
      (activity) =>
        activity.date >= addDays(monday, -7) && activity.date < monday,
    );
    const load = (list: Activity[]) =>
      list.reduce((sum, activity) => sum + this.activityLoad(activity), 0);
    return {
      today,
      athlete,
      activities,
      plan: this.plan(addDays(today, -14), addDays(today, 365)),
      program: this.programs.active(),
      programProgress: this.programs.progress(),
      planReviews: activities
        .filter((a) => !a.planSessionId && a.planDecision !== "additional")
        .map((activity) => ({
          activity,
          sessions: this.plan(activity.date, activity.date).filter(
            (s) => s.status === "accepted" && s.intent !== "rest",
          ),
        }))
        .filter((review) => review.sessions.length),
      notes: this.notes(),
      drafts: this.drafts(),
      races: this.races(),
      block: this.blockFor(today),
      blocks: this.blocks(),
      questions: this.questions(),
      sync: this.syncState(),
      analysis: this.analysis.summary(),
      coach: this.mode,
      stats: {
        weeklySeconds: week.reduce(
          (sum, activity) => sum + activity.durationSeconds,
          0,
        ),
        weeklyDistanceMetres: week.reduce(
          (sum, activity) => sum + (activity.distanceMetres ?? 0),
          0,
        ),
        weeklyActivities: week.length,
        previousWeeklySeconds: previous.reduce(
          (sum, activity) => sum + activity.durationSeconds,
          0,
        ),
        acuteLoad: load(
          confirmed.filter((activity) => activity.date >= addDays(today, -6)),
        ),
        fourWeekAverageLoad: load(confirmed) / 4,
        loadEstimated: confirmed.some((activity) => activity.rpe === null),
      },
    };
  }
  mutate<T>(id: string, input: unknown, work: () => T): T {
    if (!id || id.length > 500)
      throw new DomainError(
        "OPERATION_ID",
        "A stable operation ID is required.",
        400,
      );
    const serialized = canonical(input);
    return this.database.sqlite.transaction(() => {
      const previous = this.database.db
        .select()
        .from(tables.operations)
        .where(eq(tables.operations.id, id))
        .get();
      if (previous) {
        if (previous.input !== serialized)
          throw new DomainError(
            "CONFLICT",
            "This request ID was already used for a different change.",
            409,
          );
        return previous.data as T;
      }
      const result = work();
      this.database.db
        .insert(tables.operations)
        .values({ id, input: serialized, data: result })
        .run();
      return result;
    })();
  }
  recordNote(
    input: Pick<CoachNote, "kind" | "text"> &
      Partial<Pick<CoachNote, "key" | "sessionId" | "previous">>,
  ): CoachNote {
    const note: CoachNote = {
      ...input,
      id: randomUUID(),
      createdAt: this.now().toISOString(),
      key: input.key ?? null,
      sessionId: input.sessionId ?? null,
      previous: input.previous ?? null,
    };
    this.database.db
      .insert(tables.notes)
      .values({ id: note.id, createdAt: note.createdAt, data: note })
      .run();
    return note;
  }
  updateAthlete(raw: unknown, operationId: string) {
    const patch = athletePatchSchema.parse(raw);
    return this.mutate(operationId, patch, () => {
      const before = this.athlete();
      if (patch.readiness && patch.readiness.date > this.today())
        throw new DomainError(
          "READINESS_DATE",
          "A readiness check-in is for today or a past day.",
        );
      const after = athleteSchema.parse({
        ...before,
        ...patch,
        zones: { ...before.zones, ...patch.zones },
        thresholds: { ...before.thresholds, ...patch.thresholds },
        ...(patch.constraint && patch.constraint !== before.constraint
          ? { constraintDate: this.today() }
          : {}),
      });
      if (
        Object.values(after.thresholds).some(
          (threshold) => threshold && threshold.date > this.today(),
        )
      )
        throw new DomainError(
          "THRESHOLD_DATE",
          "A threshold date cannot be in the future.",
        );
      if (after.restDays.includes(after.longRunDay))
        throw new DomainError(
          "AVAILABILITY",
          "The long-run day cannot also be a rest day. Choose another day for one of them.",
        );
      this.database.db
        .update(tables.athlete)
        .set({ data: after })
        .where(eq(tables.athlete.id, "athlete"))
        .run();
      for (const [key, value] of Object.entries(patch))
        if (canonical(value) !== canonical(before[key as keyof Athlete]))
          this.recordNote({
            kind: "preference",
            key,
            text: `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
            previous: before[key as keyof Athlete],
          });
      return after;
    });
  }
  logActivity(raw: unknown, operationId: string): Activity {
    const input = activityInputSchema.parse(raw);
    if (input.strengthExercises?.length && input.sport !== "strength")
      throw new DomainError(
        "STRENGTH_SPORT",
        "Exercise sets belong to a strength workout.",
      );
    return this.mutate(operationId, input, () => {
      if (input.date > this.today())
        throw new DomainError(
          "FUTURE_ACTIVITY",
          "Log a workout after it happens. Future workouts belong in the plan.",
        );
      const activity: Activity = {
        ...input,
        id: randomUUID(),
        source: "manual",
        confirmed: true,
        createdAt: this.now().toISOString(),
        planSessionId: null,
      };
      this.database.db
        .insert(tables.activities)
        .values({
          id: activity.id,
          date: activity.date,
          confirmed: true,
          source: "manual",
          data: activity,
        })
        .run();
      return activity;
    });
  }
  resolveActivityPlan(id: string, raw: unknown, operationId: string): Activity {
    const decision = planDecisionSchema.parse(raw);
    return this.mutate(operationId, { id, decision }, () => {
      const row = this.database.sqlite
        .prepare("SELECT data FROM activities WHERE id=? AND confirmed=1")
        .get(id) as { data: string } | undefined;
      if (!row)
        throw new DomainError("NOT_FOUND", "This workout was not found.", 404);
      const before = activitySchema.parse(JSON.parse(row.data));
      if (before.planSessionId)
        throw new DomainError(
          "PLAN_REVIEW",
          "This workout already has a reviewed plan outcome.",
          409,
        );
      let activity: Activity;
      if (decision.outcome === "additional") {
        activity = { ...before, planDecision: "additional" };
      } else {
        const session = this.session(decision.sessionId!);
        if (
          session.status !== "accepted" ||
          session.version !== decision.version
        )
          throw new DomainError(
            "CONFLICT",
            "This planned session changed. Refresh before reviewing the workout.",
            409,
          );
        if (session.date !== before.date || session.intent === "rest")
          throw new DomainError(
            "PLAN_REVIEW",
            "Choose a scheduled workout on the activity's date.",
          );
        if (
          decision.outcome === "completed" &&
          (session.sport !== before.sport ||
            session.intent !== before.intent ||
            Math.abs(session.durationSeconds - before.durationSeconds) >
              Math.max(300, session.durationSeconds * 0.2))
        )
          throw new DomainError(
            "PLAN_REVIEW",
            "These details differ from the prescription. Choose modified or replaced instead of completed as planned.",
          );
        if (decision.outcome === "modified" && session.sport !== before.sport)
          throw new DomainError(
            "PLAN_REVIEW",
            "A different sport replaces the planned session. Choose replaced.",
          );
        activity = {
          ...before,
          planSessionId: session.id,
          planDecision: "reviewed",
        };
        this.saveSession({
          ...session,
          status: decision.outcome === "replaced" ? "skipped" : "done",
          outcome: decision.outcome,
          outcomeReason: decision.reason,
          activityId: id,
          version: session.version + 1,
          updatedAt: this.now().toISOString(),
        });
        this.recordNote({
          kind: "decision",
          sessionId: session.id,
          previous: session,
          text: `${session.title} on ${session.date}: ${decision.outcome}. Actual: ${formatDuration(activity.durationSeconds)} ${activity.sport}, ${activity.intent}${activity.rpe ? `, RPE ${activity.rpe}` : ""}. ${decision.reason}`,
        });
      }
      this.database.sqlite
        .prepare("UPDATE activities SET data=? WHERE id=?")
        .run(JSON.stringify(activity), id);
      if (decision.outcome === "additional")
        this.recordNote({
          kind: "decision",
          previous: before,
          text: `${formatDuration(activity.durationSeconds)} ${activity.sport} on ${activity.date} was additional training. The planned session remains outstanding. ${decision.reason}`,
        });
      return activity;
    });
  }
  editActivity(id: string, raw: unknown, operationId: string) {
    const input = activityInputSchema.parse(raw);
    if (input.strengthExercises?.length && input.sport !== "strength")
      throw new DomainError(
        "STRENGTH_SPORT",
        "Exercise sets belong to a strength workout.",
      );
    return this.mutate(operationId, { id, input }, () => {
      const record = this.database.db
        .select()
        .from(tables.activities)
        .where(eq(tables.activities.id, id))
        .get();
      const before = record?.confirmed
        ? activitySchema.parse(record.data)
        : undefined;
      if (!before || !before.confirmed)
        throw new DomainError("NOT_FOUND", "This workout was not found.", 404);
      if (input.date > this.today())
        throw new DomainError(
          "FUTURE_ACTIVITY",
          "A completed workout cannot have a future date.",
        );
      const activity = this.refreshActivityOutcome(before, {
        ...before,
        ...input,
      });
      if (activity.strengthExercises?.length && activity.sport !== "strength")
        throw new DomainError(
          "STRENGTH_SPORT",
          "Clear the exercise sets before changing this workout's sport.",
        );
      this.database.db
        .update(tables.activities)
        .set({ data: activity, date: activity.date })
        .where(eq(tables.activities.id, id))
        .run();
      this.recordNote({
        kind: "decision",
        text: `Corrected ${formatDuration(activity.durationSeconds)} ${activity.sport} on ${activity.date}.`,
        previous: before,
      });
      return activity;
    });
  }
  refreshActivityOutcome(before: Activity, after: Activity): Activity {
    const changed =
      before.date !== after.date ||
      before.sport !== after.sport ||
      before.intent !== after.intent ||
      before.durationSeconds !== after.durationSeconds ||
      JSON.stringify(before.strengthExercises ?? []) !==
        JSON.stringify(after.strengthExercises ?? []);
    if (!changed || !before.planSessionId) {
      return before.planDecision === "additional" && before.date !== after.date
        ? { ...after, planDecision: undefined }
        : after;
    }
    const session = this.session(before.planSessionId);
    if (
      session.activityId !== before.id ||
      !["done", "skipped"].includes(session.status)
    )
      throw new DomainError(
        "CONFLICT",
        "This plan outcome changed. Refresh before correcting the activity.",
        409,
      );
    const { outcome, outcomeReason, ...prescription } = session;
    this.saveSession({
      ...prescription,
      status: "accepted",
      activityId: null,
      version: session.version + 1,
      updatedAt: this.now().toISOString(),
    });
    this.recordNote({
      kind: "decision",
      sessionId: session.id,
      previous: session,
      text: `Reopened the outcome for ${session.title} on ${session.date} because its linked activity was corrected. The original prescription is unchanged; review how the corrected activity fits the plan.`,
    });
    return { ...after, planSessionId: null, planDecision: undefined };
  }
  saveSession(session: PlanSession) {
    this.database.db
      .insert(tables.plan)
      .values({
        id: session.id,
        date: session.date,
        status: session.status,
        data: session,
      })
      .onConflictDoUpdate({
        target: tables.plan.id,
        set: { date: session.date, status: session.status, data: session },
      })
      .run();
  }
  proposePlan(raw: unknown, operationId: string): PlanSession[] {
    const request = z.array(planInputSchema).min(1).max(14).parse(raw);
    return this.mutate(operationId, request, () => {
      if (this.drafts().length)
        throw new DomainError(
          "DRAFTS",
          "Confirm or discard the waiting workout drafts before we plan from them.",
        );
      if (
        new Set(request.map((day) => `${day.date}:${day.sport}`)).size !==
        request.length
      )
        throw new DomainError(
          "DUPLICATE_PLAN",
          "Keep one planned session per sport per day. Put intervals in its structured steps.",
        );
      const input = request.map((day) => ({
        ...day,
        blockId: this.blockFor(day.date)?.id ?? null,
      }));
      const existing = this.plan(
        addDays(
          [...input.map((day) => weekStart(day.date)), this.today()].sort()[0],
          -1,
        ),
        addDays(
          input
            .map((day) => weekStart(day.date))
            .sort()
            .at(-1)!,
          7,
        ),
      );
      const replacements = existing.filter(
        (session) =>
          session.status === "proposed" &&
          input.some(
            (newDay) =>
              newDay.date === session.date && newDay.sport === session.sport,
          ),
      );
      if (
        input.some((newDay) =>
          existing.some(
            (session) =>
              session.date === newDay.date &&
              session.sport === newDay.sport &&
              ["accepted", "done"].includes(session.status),
          ),
        )
      )
        throw new DomainError(
          "ACCEPTED_PLAN",
          "That day already has an accepted or completed session. Revise the accepted session explicitly.",
        );
      validatePlan(
        input,
        existing.filter(
          (session) =>
            !replacements.some((replaced) => replaced.id === session.id),
        ),
        this.activities(addDays(this.today(), -28)),
        this.athlete(),
        this.today(),
        { races: this.races(), blocks: this.blocks() },
      );
      const sessions = input.map((day) => {
        const previous = replacements.find(
          (session) => session.date === day.date && session.sport === day.sport,
        );
        const session: PlanSession = {
          ...day,
          id: previous?.id ?? randomUUID(),
          status: "proposed",
          version: (previous?.version ?? 0) + 1,
          activityId: null,
          updatedAt: this.now().toISOString(),
        };
        this.saveSession(session);
        return session;
      });
      return sessions;
    });
  }
  acceptPlan(ids: string[], operationId: string): PlanSession[] {
    return this.mutate(operationId, { ids }, () => {
      const sessions = ids.map((id) => this.session(id));
      if (sessions.some((session) => session.status !== "proposed"))
        throw new DomainError("PLAN_STATUS", "Only proposals can be accepted.");
      const other = this.plan(
        addDays(sessions.map((day) => weekStart(day.date)).sort()[0], -1),
        addDays(
          sessions
            .map((day) => weekStart(day.date))
            .sort()
            .at(-1)!,
          7,
        ),
      ).filter((session) => !ids.includes(session.id));
      validatePlan(
        sessions,
        other,
        this.activities(addDays(this.today(), -28)),
        this.athlete(),
        this.today(),
        { races: this.races(), blocks: this.blocks() },
      );
      return sessions.map((session) => {
        const accepted: PlanSession = {
          ...session,
          status: "accepted",
          version: session.version + 1,
          updatedAt: this.now().toISOString(),
        };
        this.saveSession(accepted);
        return accepted;
      });
    });
  }
  session(id: string): PlanSession {
    const session = this.database.db
      .select()
      .from(tables.plan)
      .where(eq(tables.plan.id, id))
      .get()?.data;
    if (!session)
      throw new DomainError("NOT_FOUND", "This session was not found.", 404);
    return session;
  }
  discardProposal(id: string, version: number, operationId: string) {
    return this.mutate(operationId, { id, version }, () => {
      const before = this.session(id);
      if (before.version !== version)
        throw new DomainError(
          "CONFLICT",
          "Refresh the proposal before discarding it.",
          409,
        );
      if (before.status !== "proposed")
        throw new DomainError(
          "HISTORY",
          "Only an unaccepted proposal can be discarded.",
        );
      this.database.db.delete(tables.plan).where(eq(tables.plan.id, id)).run();
      this.recordNote({
        kind: "decision",
        text: `Discarded proposal: ${before.title} on ${before.date}.`,
        previous: before,
      });
      return { discarded: true };
    });
  }
  reviseSession(
    id: string,
    raw: unknown,
    version: number,
    operationId: string,
  ): PlanSession {
    const request = planInputSchema.parse(raw);
    return this.mutate(operationId, { id, input: request, version }, () => {
      const input = {
        ...request,
        blockId: this.blockFor(request.date)?.id ?? null,
      };
      const before = this.session(id);
      if (before.version !== version)
        throw new DomainError(
          "CONFLICT",
          "The plan has changed. Refresh before editing this session.",
          409,
        );
      if (["done", "skipped"].includes(before.status))
        throw new DomainError(
          "HISTORY",
          "Keep completed and skipped sessions as history.",
        );
      const other = this.plan(
        addDays(weekStart(input.date), -1),
        addDays(weekStart(input.date), 7),
      ).filter((session) => session.id !== id);
      validatePlan(
        [input],
        other,
        this.activities(addDays(this.today(), -28)),
        this.athlete(),
        this.today(),
        { races: this.races(), blocks: this.blocks() },
      );
      const after = {
        ...before,
        ...input,
        programId: before.programId,
        version: before.version + 1,
        updatedAt: this.now().toISOString(),
      };
      this.saveSession(after);
      if (before.status === "accepted")
        this.recordNote({
          kind: "decision",
          text: `${before.title} changed from ${before.date} to ${after.date}, ${formatDuration(after.durationSeconds)}. ${after.reason}`,
          sessionId: id,
          previous: before,
        });
      return after;
    });
  }
  skipSession(
    id: string,
    reason: string,
    version: number,
    operationId: string,
  ): PlanSession {
    return this.mutate(operationId, { id, reason, version }, () => {
      const before = this.session(id);
      if (before.version !== version)
        throw new DomainError(
          "CONFLICT",
          "This session changed. Refresh before updating it.",
          409,
        );
      if (before.status !== "accepted")
        throw new DomainError(
          "PLAN_STATUS",
          "Only an accepted session can be marked missed.",
        );
      const after: PlanSession = {
        ...before,
        status: "skipped",
        outcome: "skipped",
        outcomeReason: reason,
        version: before.version + 1,
        updatedAt: this.now().toISOString(),
      };
      this.saveSession(after);
      this.recordNote({
        kind: "decision",
        text: `${before.title} on ${before.date} was missed. ${reason}`,
        sessionId: id,
        previous: before,
      });
      return after;
    });
  }
  races(): Race[] {
    return (
      this.database.sqlite
        .prepare("SELECT data FROM races ORDER BY date")
        .all() as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  }
  preferences(): CoachNote[] {
    const rows = this.database.sqlite
      .prepare(
        "SELECT data FROM coach_notes WHERE json_extract(data,'$.kind')='preference' ORDER BY created_at DESC,rowid DESC",
      )
      .all() as { data: string }[];
    const latest = new Map<string, CoachNote>();
    for (const row of rows) {
      const note = JSON.parse(row.data) as CoachNote;
      const key = note.key ?? note.text;
      if (!latest.has(key)) latest.set(key, note);
    }
    return [...latest.values()].slice(0, 60);
  }
  askQuestion(
    key: string,
    text: string,
    priority: number,
    operationId: string,
  ) {
    return this.mutate(operationId, { key, text, priority }, () => {
      const row = this.database.sqlite
        .prepare("SELECT data FROM questions WHERE key=?")
        .get(key) as { data: string } | undefined;
      if (row) return JSON.parse(row.data) as CoachQuestion;
      const question: CoachQuestion = {
        id: randomUUID(),
        key,
        text,
        priority,
        activityId: null,
        sessionId: null,
        raceId: null,
        createdAt: this.now().toISOString(),
        answeredAt: null,
        answer: null,
      };
      this.database.sqlite
        .prepare(
          "INSERT INTO questions (id,key,priority,answered,data) VALUES (?,?,?,0,?)",
        )
        .run(question.id, key, priority, JSON.stringify(question));
      return question;
    });
  }
  saveRace(raw: unknown, id: string | null, operationId: string): Race {
    const input = raceInputSchema.parse(raw);
    return this.mutate(operationId, { input, id }, () => {
      const before = id ? this.races().find((race) => race.id === id) : null;
      if (id && !before)
        throw new DomainError("NOT_FOUND", "That race was not found.", 404);
      const race: Race = {
        ...input,
        id: before?.id ?? randomUUID(),
        createdAt: before?.createdAt ?? this.now().toISOString(),
      };
      this.database.sqlite
        .prepare(
          "INSERT INTO races (id,date,data) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,data=excluded.data",
        )
        .run(race.id, race.date, JSON.stringify(race));
      if (
        before &&
        (before.date !== race.date ||
          before.sport !== race.sport ||
          before.priority !== race.priority)
      )
        for (const block of this.blocks().filter(
          (block) => block.raceId === race.id,
        ))
          this.database.sqlite
            .prepare("DELETE FROM plan_blocks WHERE id=?")
            .run(block.id);
      this.recordNote({
        kind: "decision",
        text: `${before ? "Updated" : "Added"} ${race.priority} race: ${race.name} on ${race.date}. ${race.goal}`,
        previous: before,
      });
      return race;
    });
  }
  deleteRace(id: string, operationId: string) {
    return this.mutate(operationId, { id }, () => {
      const race = this.races().find((race) => race.id === id);
      if (!race)
        throw new DomainError("NOT_FOUND", "That race was not found.", 404);
      this.database.sqlite.prepare("DELETE FROM races WHERE id=?").run(id);
      this.recordNote({
        kind: "decision",
        text: `Removed ${race.name} from the race calendar. Accepted sessions are kept until you choose to revise them.`,
        previous: race,
      });
      return { ok: true };
    });
  }
  blocks(): PlanBlock[] {
    return (
      this.database.sqlite
        .prepare("SELECT data FROM plan_blocks ORDER BY start_date")
        .all() as { data: string }[]
    ).map((row) => JSON.parse(row.data));
  }
  blockFor(date: string): PlanBlock | null {
    const recent = this.races()
      .filter(
        (race) =>
          race.priority === "A" &&
          race.date < this.today() &&
          race.date >= addDays(this.today(), -7),
      )
      .at(-1);
    const race =
      recent ??
      this.races().find(
        (race) => race.priority === "A" && race.date >= this.today(),
      );
    return (
      this.blocks().find(
        (block) =>
          block.raceId === (race?.id ?? null) &&
          block.startDate <= date &&
          block.endDate >= date,
      ) ?? null
    );
  }
  saveBlocks(blocks: PlanBlock[], operationId: string) {
    return this.mutate(operationId, { blocks }, () => {
      const write = this.database.sqlite.prepare(
        "INSERT INTO plan_blocks (id,start_date,end_date,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,data=excluded.data",
      );
      for (const block of blocks)
        write.run(
          block.id,
          block.startDate,
          block.endDate,
          JSON.stringify(block),
        );
      return blocks;
    });
  }
  drafts(): ImportDraft[] {
    return (
      this.database.sqlite
        .prepare(
          "SELECT data FROM activities WHERE confirmed=0 ORDER BY rowid DESC",
        )
        .all() as { data: string }[]
    )
      .map((row) => JSON.parse(row.data))
      .filter((draft) => draft.values);
  }
  draft(id: string): ImportDraft {
    const draft = this.drafts().find((draft) => draft.id === id);
    if (!draft)
      throw new DomainError(
        "NOT_FOUND",
        "That draft was not found. It may already be confirmed.",
        404,
      );
    return draft;
  }
  saveDraft(draft: ImportDraft) {
    this.database.sqlite
      .prepare(
        "INSERT INTO activities (id,date,confirmed,source,data) VALUES (?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,data=excluded.data WHERE activities.confirmed=0",
      )
      .run(draft.id, draft.date, draft.source, JSON.stringify(draft));
    return draft;
  }
  syncState(): AppState["sync"] {
    const row = this.database.sqlite
      .prepare("SELECT data FROM sync_state WHERE provider='intervals'")
      .get() as { data: string } | undefined;
    const saved = row ? JSON.parse(row.data) : {};
    return {
      provider: "intervals",
      configured: !!process.env.INTERVALS_API_KEY,
      lastSync: saved.lastSync ?? null,
      error: saved.error ?? null,
    };
  }
  questions(): CoachQuestion[] {
    const history = this.activities();
    const pending: Omit<
      CoachQuestion,
      "id" | "createdAt" | "answeredAt" | "answer"
    >[] = [];
    const latestPain = history.find(
      (activity) =>
        activity.pain &&
        !/^(?:none|no|no pain(?: today| reported| at all)?|pain[- ]free|without pain|0(?:\/10)?)[.!]?$/i.test(
          activity.pain.trim(),
        ),
    );
    if (latestPain)
      pending.push({
        key: `pain:${latestPain.id}`,
        priority: 1,
        text: `How did the pain from your ${latestPain.sport} on ${latestPain.date} feel after you stopped?`,
        activityId: latestPain.id,
        sessionId: null,
        raceId: null,
      });
    const painAnswered = latestPain
      ? !!(
          this.database.sqlite
            .prepare("SELECT answered FROM questions WHERE key=?")
            .get(`pain:${latestPain.id}`) as { answered: number } | undefined
        )?.answered
      : false;
    if (this.athlete().constraint === "injury" && (!latestPain || painAnswered))
      pending.push({
        key: `injury:${this.athlete().constraintDate ?? "current"}`,
        priority: 1,
        text: "Does the injury hurt during ordinary walking, and what movement currently feels comfortable?",
        activityId: null,
        sessionId: null,
        raceId: null,
      });
    const race = this.races().find(
      (race) =>
        race.priority === "A" &&
        race.date >= this.today() &&
        race.date <= addDays(this.today(), 112) &&
        !this.blocks().some((block) => block.raceId === race.id),
    );
    if (race)
      pending.push({
        key: `race:${race.id}`,
        priority: 2,
        text: `${race.name} is on ${race.date}. What does your recent training week look like so we can build toward it?`,
        activityId: null,
        sessionId: null,
        raceId: race.id,
      });
    const effort = history.find(
      (activity) =>
        (isHard(activity) || activity.intent === "long") &&
        activity.rpe === null,
    );
    if (effort)
      pending.push({
        key: `rpe:${effort.id}`,
        priority: 3,
        text: `How hard was your ${effort.intent} ${effort.sport} on ${effort.date}, from 1 to 10?`,
        activityId: effort.id,
        sessionId: null,
        raceId: null,
      });
    const missed = this.plan(
      addDays(this.today(), -14),
      addDays(this.today(), -1),
    ).find(
      (session) =>
        session.status === "accepted" &&
        (isHard(session) || session.intent === "long"),
    );
    if (missed)
      pending.push({
        key: `missed:${missed.id}`,
        priority: 4,
        text: `Did you complete ${missed.title} on ${missed.date}, or should we mark it missed?`,
        activityId: null,
        sessionId: missed.id,
        raceId: null,
      });
    if (!history.length && !this.athlete().weeklyMinutes)
      pending.push({
        key: "interview:volume",
        priority: 7,
        text: "About how many minutes did you train in a usual recent week?",
        activityId: null,
        sessionId: null,
        raceId: null,
      });
    if (!history.length && !this.athlete().longestRunMinutes)
      pending.push({
        key: "interview:long",
        priority: 8,
        text: "What was your longest comfortable run in the last month?",
        activityId: null,
        sessionId: null,
        raceId: null,
      });
    const insert = this.database.sqlite.prepare(
      "INSERT INTO questions (id,key,priority,answered,data) VALUES (?,?,?,0,?) ON CONFLICT(key) DO NOTHING",
    );
    for (const item of pending) {
      const question: CoachQuestion = {
        ...item,
        id: randomUUID(),
        createdAt: this.now().toISOString(),
        answeredAt: null,
        answer: null,
      };
      insert.run(
        question.id,
        question.key,
        question.priority,
        JSON.stringify(question),
      );
    }
    const keys = new Set(pending.map((question) => question.key));
    return (
      this.database.sqlite
        .prepare(
          "SELECT data FROM questions WHERE answered=0 ORDER BY priority,rowid",
        )
        .all() as { data: string }[]
    )
      .map((row) => JSON.parse(row.data) as CoachQuestion)
      .filter(
        (question) =>
          keys.has(question.key) ||
          (question.key.startsWith("coach:") &&
            !(
              question.key.startsWith("coach:readiness:") &&
              this.athlete().readiness?.date === this.today()
            )),
      )
      .slice(0, 2);
  }
  answerQuestion(id: string, answer: string, operationId: string) {
    answer = z.string().trim().min(1).max(1500).parse(answer);
    return this.mutate(operationId, { id, answer }, () => {
      const row = this.database.sqlite
        .prepare("SELECT data FROM questions WHERE id=?")
        .get(id) as { data: string } | undefined;
      if (!row)
        throw new DomainError("NOT_FOUND", "That question was not found.", 404);
      const before = JSON.parse(row.data) as CoachQuestion;
      if (before.answeredAt) return before;
      const number = Number(answer.match(/\b\d+(?:\.\d+)?\b/)?.[0]);
      if (
        before.key.startsWith("rpe:") &&
        number >= 1 &&
        number <= 10 &&
        before.activityId
      ) {
        const activity = this.activities(
          addDays(this.today(), -365),
          this.today(),
        ).find((activity) => activity.id === before.activityId);
        if (activity)
          this.editActivity(
            activity.id,
            { ...activity, rpe: Math.round(number) },
            `${operationId}:effort`,
          );
      }
      if (before.key === "interview:volume" && number > 0)
        this.updateAthlete(
          {
            weeklyMinutes: Math.round(number * (/hour/i.test(answer) ? 60 : 1)),
          },
          `${operationId}:volume`,
        );
      if (before.key === "interview:long" && number > 0)
        this.updateAthlete(
          {
            longestRunMinutes: Math.round(
              number * (/hour/i.test(answer) ? 60 : 1),
            ),
          },
          `${operationId}:long`,
        );
      const after = { ...before, answer, answeredAt: this.now().toISOString() };
      this.database.sqlite
        .prepare("UPDATE questions SET answered=1,data=? WHERE id=?")
        .run(JSON.stringify(after), id);
      this.recordNote({
        kind: "answer",
        key: before.key,
        text: answer,
        sessionId: before.sessionId,
      });
      return after;
    });
  }
  makeEasyPlan(days: number): PlanInput[] {
    const athlete = this.athlete();
    const today = this.today();
    const history = this.activities().filter((activity) => activity.confirmed);
    const longest = Math.max(
      athlete.longestRunMinutes ?? 0,
      ...history
        .filter((activity) => ["run", "trail"].includes(activity.sport))
        .map((activity) => activity.durationSeconds / 60),
    );
    const typical = history.length
      ? Math.round(
          history.reduce(
            (sum, activity) => sum + activity.durationSeconds / 60,
            0,
          ) / history.length,
        )
      : 25;
    const easy = Math.min(
      45,
      Math.max(
        15,
        Math.round(
          (athlete.weeklyMinutes
            ? athlete.weeklyMinutes / Math.max(1, 7 - athlete.restDays.length)
            : typical) / 5,
        ) * 5,
      ),
    );
    const start = history.some((activity) => activity.date === today)
      ? addDays(today, 1)
      : today;
    const existing = this.plan(start, addDays(start, days - 1));
    return Array.from({ length: days }, (_, i): PlanInput | null => {
      const date = addDays(start, i);
      if (
        existing.some(
          (session) =>
            session.date === date &&
            ["accepted", "done"].includes(session.status),
        )
      )
        return null;
      const previousHard = history.some(
        (activity) => activity.date === addDays(date, -1) && isHard(activity),
      );
      const chosenRest = athlete.restDays.includes(dayOfWeek(date));
      const rest =
        chosenRest ||
        (days >= 7 && athlete.restDays.length === 0 && dayOfWeek(date) === 0);
      const long =
        !rest &&
        !previousHard &&
        athlete.constraint === "none" &&
        dayOfWeek(date) === athlete.longRunDay &&
        longest > 0;
      return {
        date,
        sport: rest ? "rest" : "run",
        intent: rest ? "rest" : long ? "long" : "easy",
        title: rest
          ? "Room to recover"
          : long
            ? "Your long run"
            : previousHard
              ? "An easy reset"
              : "Easy, steady miles",
        durationSeconds: rest
          ? 0
          : (long ? Math.min(longest + 10, Math.max(longest, easy)) : easy) *
            60,
        rpeTarget: rest ? 0 : 3,
        prescription: rest
          ? "Take the day off. A gentle walk is optional."
          : "Keep it conversational, at RPE 3 out of 10. Ease off or stop if anything hurts.",
        reason: rest
          ? chosenRest
            ? "Protecting the rest day you chose."
            : "Leaving a day free for recovery and the rest of your life."
          : long
            ? "Your preferred long-run day, with a small step from your recent longest run."
            : previousHard
              ? "Recovery after your hard session matters more than adding intensity."
              : history.length
                ? `Building consistency around your ${formatDuration(history[0].durationSeconds)} ${history[0].sport}, with room to recover.`
                : "A short, easy starting point while we learn your training history.",
      } satisfies PlanInput;
    }).filter((session): session is PlanInput => session !== null);
  }
}
