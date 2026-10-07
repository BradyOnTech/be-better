import { randomUUID, createHash } from "node:crypto";
import {
  addDays,
  dayOfWeek,
  programChoiceSchema,
  programWeekShape,
  programLibrary,
  exampleWorkouts,
  programQueryFromContext,
  workoutHold,
  DomainError,
  formatDuration,
  type ProgramChoice,
  type TrainingProgram,
  type ProgramPreview,
  type ProgramProgress,
  type PlanInput,
  type PlanSession,
  type ExampleWorkout,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";
import { validatePlan } from "./guardrails.js";

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export class TrainingPrograms {
  constructor(private service: CoachService) {}
  active(): TrainingProgram | null {
    const row = this.service.database.sqlite
      .prepare("SELECT data FROM training_programs WHERE status='active'")
      .get() as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  progress(program = this.active()): ProgramProgress | null {
    if (!program) return null;
    const sessions = this.service
      .plan(program.startDate, program.endDate)
      .filter((s) => s.programId === program.id && s.intent !== "rest");
    return {
      week: Math.min(
        program.weeks,
        Math.max(
          1,
          Math.floor(daysBetween(program.startDate, this.service.today()) / 7) +
            1,
        ),
      ),
      total: sessions.length,
      completed: sessions.filter(
        (s) => s.status === "done" && s.outcome !== "modified",
      ).length,
      modified: sessions.filter((s) => s.outcome === "modified").length,
      replaced: sessions.filter((s) => s.outcome === "replaced").length,
      skipped: sessions.filter(
        (s) => s.status === "skipped" && s.outcome !== "replaced",
      ).length,
      outstanding: sessions.filter(
        (s) => s.status === "accepted" && s.date < this.service.today(),
      ).length,
    };
  }
  preview(raw: unknown): ProgramPreview {
    const choice = programChoiceSchema.parse(raw);
    const service = this.service,
      athlete = service.athlete(),
      today = service.today();
    const pattern = programLibrary.find((p) => p.id === choice.patternId);
    if (!pattern)
      throw new DomainError("PROGRAM", "Choose a program from the library.");
    if (choice.startDate < today || choice.startDate > addDays(today, 90))
      throw new DomainError(
        "PROGRAM_DATE",
        "Start from today through the next 90 days.",
      );
    const endDate = addDays(choice.startDate, choice.weeks * 7 - 1);
    if (
      choice.targetDate &&
      (choice.targetDate < choice.startDate || choice.targetDate > endDate)
    )
      throw new DomainError(
        "PROGRAM_DATE",
        "The goal date needs to fall within this program's dates.",
      );
    if (choice.targetDate && choice.targetDate < addDays(endDate, -13))
      throw new DomainError(
        "PROGRAM_DATE",
        "Put the goal date in the final two weeks, or shorten the program.",
      );
    if (choice.trainingDays.some((d) => athlete.restDays.includes(d)))
      throw new DomainError(
        "REST_DAY",
        "Your selected training days include a saved rest day. Change the days here or update Training settings first.",
      );
    const history = service.activities();
    const query = programQueryFromContext({
      today,
      athlete,
      activities: history,
      block: null,
      races: [],
    });
    const reference = query.weeklyMinutes ?? 120;
    const base = Math.min(
      choice.weeklyMinutes,
      reference,
      athlete.availableHours ? athlete.availableHours * 60 : Infinity,
    );
    if (
      base <
      choice.trainingDays.length * 10 + (choice.includeStrength ? 15 : 0)
    )
      throw new DomainError(
        "PROGRAM_TIME",
        "Leave at least ten minutes per endurance day and fifteen minutes for supporting strength, or choose fewer days.",
      );
    const retained = service
      .plan(choice.startDate, endDate)
      .filter((s) => ["accepted", "proposed", "done"].includes(s.status));
    const warnings: string[] = [];
    if (base < choice.weeklyMinutes)
      warnings.push(
        `The first week is capped at ${Math.round(base)} minutes from your current training and availability. Your chosen ${choice.weeklyMinutes} minutes is a time budget.`,
      );
    if (pattern.weeklyMinutes && base < pattern.weeklyMinutes.low)
      warnings.push(
        `This approach usually starts around ${pattern.weeklyMinutes.low} minutes per week. Your schedule begins at your current level; review readiness for the goal with your coach before treating this as race preparation.`,
      );
    if (choice.trainingDays.length < pattern.daysPerWeek.low)
      warnings.push(
        `This approach usually uses at least ${pattern.daysPerWeek.low} endurance days. With fewer days, this is a starting block; review your goal and schedule with the coach.`,
      );
    if (!query.longestMinutes)
      warnings.push(
        "Long runs stay easy until you record your recent longest run.",
      );
    if (retained.length)
      warnings.push(
        `${retained.length} existing calendar sessions stay in place. This program fills the remaining days; it does not replace accepted workouts.`,
      );
    if (choice.targetDate)
      warnings.push(
        "The goal day stays open for your event. Days after it are recovery days; review your return to training with the coach.",
      );
    warnings.push(
      "Later weeks are a conservative starting schedule. Future long runs stay within your current baseline; review progression with your coach as new training is logged.",
    );
    const ready =
      athlete.readiness &&
      daysBetween(athlete.readiness.date, today) <= 2 &&
      athlete.readiness.sleep !== "poor" &&
      athlete.readiness.soreness !== "high";
    if (
      !ready &&
      exampleWorkouts[pattern.id].some((w) =>
        ["quality", "hills"].includes(w.intent),
      )
    )
      warnings.push(
        "Intensity starts with easy sessions until you provide a recent readiness check-in. Ask the coach to review it before adding quality work.",
      );
    const sessions: PlanInput[] = [],
      weeks: ProgramPreview["weeks"] = [];
    const mainSport = pattern.sports.includes("bike")
      ? "bike"
      : pattern.events.includes("hike")
        ? "walk"
        : pattern.sports.includes("trail")
          ? "trail"
          : "run";
    for (let index = 0; index < choice.weeks; index++) {
      const start = addDays(choice.startDate, index * 7);
      const { phase, cutback, daysOut } = programWeekShape(
        choice,
        index,
        pattern.phases,
      );
      const factor =
        phase === "taper"
          ? daysOut <= 6
            ? 0.5
            : 0.7
          : cutback
            ? 0.8
            : Math.min(1.15, 1 + index * 0.03);
      const budget = Math.round(Math.min(choice.weeklyMinutes, base * factor));
      const templates = (exampleWorkouts[pattern.id] ?? []).filter(
        (w) =>
          w.phases.includes(phase) &&
          !workoutHold(w, { phase, cutback, constraint: athlete.constraint }),
      );
      const all = exampleWorkouts[pattern.id] ?? [];
      const easy =
        templates.find(
          (w) =>
            w.sport === mainSport && ["easy", "endurance"].includes(w.intent),
        ) ??
        all.find(
          (w) =>
            (w.sport === mainSport ||
              (mainSport === "trail" && w.sport === "run")) &&
            ["easy", "endurance"].includes(w.intent),
        );
      if (!easy)
        throw new DomainError(
          "PROGRAM",
          "This program has no appropriate easy session.",
        );
      const dates = Array.from({ length: 7 }, (_, i) =>
        addDays(start, i),
      ).filter((d) => choice.trainingDays.includes(dayOfWeek(d)));
      const longDate =
        dates.find((d) => dayOfWeek(d) === athlete.longRunDay) ?? dates.at(-1)!;
      const long =
        phase !== "taper" &&
        phase !== "recovery" &&
        (query.longestMinutes || mainSport === "bike" || mainSport === "walk")
          ? templates.find(
              (w) =>
                w.intent === "long" ||
                (mainSport === "bike" &&
                  w.intent === "endurance" &&
                  w.name.toLowerCase().includes("long")),
            )
          : undefined;
      const quality =
        ready &&
        index > 0 &&
        !cutback &&
        phase !== "taper" &&
        phase !== "recovery"
          ? templates.find((w) => ["quality", "hills"].includes(w.intent))
          : undefined;
      const qualityDate = quality
        ? dates.find((d) => Math.abs(daysBetween(d, longDate)) > 1)
        : undefined;
      const reserved =
        retained
          .filter(
            (s) =>
              s.status !== "done" &&
              s.date >= start &&
              s.date <= addDays(start, 6),
          )
          .reduce((sum, s) => sum + s.durationSeconds / 60, 0) +
        history
          .filter((a) => a.date >= start && a.date <= addDays(start, 6))
          .reduce((sum, a) => sum + a.durationSeconds / 60, 0);
      const strengthMinutes = choice.includeStrength ? 15 : 0;
      const available = Math.max(0, budget - reserved - strengthMinutes);
      const normal = Math.max(
        10,
        Math.floor(available / (dates.length + (long ? 0.5 : 0))),
      );
      let used = 0;
      const weekSessions: PlanInput[] = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(start, i);
        if (
          retained.some((s) => s.date === date) ||
          history.some((a) => a.date === date) ||
          choice.targetDate === date ||
          service.races().some((r) => r.date === date)
        )
          continue;
        if (choice.targetDate && date > choice.targetDate) {
          weekSessions.push({
            date,
            sport: "rest",
            intent: "rest",
            durationSeconds: 0,
            rpeTarget: 0,
            title: "Recovery after your goal",
            prescription:
              "Rest and check in with the coach before resuming training. Do not make up missed sessions.",
            reason: `${pattern.title}, week ${index + 1}. Recovery after your goal date.`,
            steps: [],
          });
          continue;
        }
        const training = dates.includes(date);
        let example = training
          ? date === longDate && long
            ? long
            : date === qualityDate && quality
              ? quality
              : easy
          : all.find((w) => w.intent === "rest");
        if (!example) continue;
        let minutes = training
          ? Math.min(
              example.minutes.high,
              Math.round(normal * (example === long ? 1.5 : 1)),
            )
          : 0;
        if (
          example.intent === "long" &&
          ["run", "trail"].includes(example.sport)
        )
          minutes = Math.min(minutes, (query.longestMinutes ?? 0) + 20);
        minutes = Math.min(minutes, Math.max(0, available - used));
        if (training && minutes < 10) {
          example = all.find((w) => w.intent === "rest");
          minutes = 0;
        }
        if (!example) continue;
        const day = toSession(
          example,
          date,
          minutes,
          pattern.title,
          index + 1,
          phase,
          cutback,
        );
        weekSessions.push(day);
        used += minutes;
      }
      if (choice.includeStrength) {
        const date = weekSessions.find(
          (s) => s.intent === "easy" || s.intent === "endurance",
        )?.date;
        if (date && (!choice.targetDate || date < choice.targetDate))
          weekSessions.push({
            date,
            sport: "strength",
            intent: "strength",
            durationSeconds: 900,
            rpeTarget: 4,
            title: "Supporting strength",
            prescription:
              "A short, moderate strength session using familiar movements. Record the exercises and sets you actually do. Skip painful movements and finish with energy left.",
            reason: `Supporting fitness and injury prevention within ${pattern.title}, week ${index + 1}.`,
            steps: [
              {
                kind: "free",
                durationSeconds: 900,
                distanceMetres: null,
                repeats: 1,
                target: { metric: "rpe", low: 4, high: 4 },
              },
            ],
          });
      }
      sessions.push(...weekSessions);
      weeks.push({
        number: index + 1,
        startDate: start,
        minutes: Math.round(
          weekSessions.reduce((n, s) => n + s.durationSeconds, 0) / 60 +
            reserved,
        ),
        phase,
        cutback,
      });
    }
    validatePlan(
      sessions,
      service.plan(addDays(choice.startDate, -1), addDays(endDate, 1)),
      history,
      athlete,
      today,
      { races: service.races(), blocks: service.blocks() },
    );
    const preview = {
      choice,
      title: pattern.title,
      endDate,
      sessions,
      warnings,
      retained,
      weeks,
    };
    return {
      ...preview,
      previewKey: createHash("sha256")
        .update(JSON.stringify(preview))
        .digest("hex"),
    };
  }
  follow(
    raw: unknown,
    operationId: string,
    previewKey: string,
  ): TrainingProgram {
    const choice = programChoiceSchema.parse(raw);
    return this.service.mutate(operationId, { choice, previewKey }, () => {
      const old = this.active();
      if (old && old.endDate >= this.service.today())
        throw new DomainError(
          "ACTIVE_PROGRAM",
          "End your current program before following another one.",
        );
      if (old)
        this.service.database.sqlite
          .prepare(
            "UPDATE training_programs SET status='completed',data=? WHERE id=?",
          )
          .run(JSON.stringify({ ...old, status: "completed" }), old.id);
      const preview = this.preview(choice);
      if (preview.previewKey !== previewKey)
        throw new DomainError(
          "PREVIEW_CHANGED",
          "Your log or calendar changed since this preview. Preview the schedule again before following it.",
          409,
        );
      if (!preview.sessions.some((s) => s.intent !== "rest"))
        throw new DomainError(
          "PROGRAM_EMPTY",
          "Existing calendar sessions fill this block. Adjust the start date or review the existing plan first.",
        );
      const program: TrainingProgram = {
        ...choice,
        id: randomUUID(),
        title: preview.title,
        endDate: preview.endDate,
        status: "active",
        createdAt: this.service.now().toISOString(),
      };
      this.service.database.sqlite
        .prepare(
          "INSERT INTO training_programs(id,status,data) VALUES(?,'active',?)",
        )
        .run(program.id, JSON.stringify(program));
      for (const input of preview.sessions)
        this.service.saveSession({
          ...input,
          programId: program.id,
          id: randomUUID(),
          status: "accepted",
          version: 1,
          activityId: null,
          updatedAt: this.service.now().toISOString(),
        });
      this.service.recordNote({
        kind: "decision",
        text: `Started ${program.title}: ${program.goal}, ${program.startDate} to ${program.endDate}. The athlete chose to follow the previewed schedule.`,
      });
      return program;
    });
  }
  end(id: string, operationId: string) {
    return this.service.mutate(operationId, { id }, () => {
      const program = this.active();
      if (!program || program.id !== id)
        throw new DomainError(
          "PROGRAM",
          "This program is no longer active.",
          409,
        );
      const ended = { ...program, status: "ended" as const };
      this.service.database.sqlite
        .prepare(
          "UPDATE training_programs SET status='ended',data=? WHERE id=?",
        )
        .run(JSON.stringify(ended), id);
      for (const session of this.service
        .plan(this.service.today(), program.endDate)
        .filter((s) => s.programId === id && s.status === "accepted")) {
        this.service.saveSession({
          ...session,
          status: "skipped",
          outcome: "skipped",
          outcomeReason: "Program ended by the athlete.",
          version: session.version + 1,
          updatedAt: this.service.now().toISOString(),
        });
        this.service.recordNote({
          kind: "decision",
          sessionId: session.id,
          previous: session,
          text: `Cancelled ${session.title} on ${session.date} because the athlete ended ${program.title}.`,
        });
      }
      this.service.recordNote({
        kind: "decision",
        text: `Ended ${program.title}. Completed training and prior decisions remain in history.`,
      });
      return ended;
    });
  }
}
function toSession(
  example: ExampleWorkout,
  date: string,
  minutes: number,
  title: string,
  week: number,
  phase: string,
  cutback: boolean,
): PlanInput {
  const durationSeconds = Math.round(minutes * 60);
  const rpe =
    example.intent === "rest"
      ? 0
      : ["quality", "hills"].includes(example.intent)
        ? 6
        : example.intent === "strength"
          ? 4
          : example.intent === "endurance"
            ? 4
            : 3;
  const original = example.steps.reduce(
    (n, s) => n + s.minutes * 60 * s.repeats,
    0,
  );
  const steps =
    example.intent === "rest"
      ? []
      : example.steps.map((s) => ({
          kind: s.kind,
          durationSeconds: Math.max(
            1,
            Math.round(
              s.minutes *
                60 *
                (durationSeconds / (original || durationSeconds)),
            ),
          ),
          distanceMetres: null,
          repeats: s.repeats,
          target: {
            metric: "rpe" as const,
            low: Number(s.effort.match(/RPE\s*(\d+)/i)?.[1] ?? rpe),
            high: Number(s.effort.match(/RPE\s*(\d+)/i)?.[1] ?? rpe),
          },
        }));
  const difference =
    durationSeconds -
    steps.reduce((n, s) => n + s.durationSeconds * s.repeats, 0);
  if (steps.length && difference) {
    const last = steps.at(-1)!;
    if (last.repeats === 1 && last.durationSeconds + difference > 0)
      last.durationSeconds += difference;
    else {
      steps.length = 0;
      steps.push({
        kind: "free",
        durationSeconds,
        distanceMetres: null,
        repeats: 1,
        target: { metric: "rpe", low: rpe, high: rpe },
      });
    }
  }
  return {
    date,
    sport: example.sport,
    intent: example.intent,
    durationSeconds,
    rpeTarget: rpe,
    title: example.name,
    exampleWorkoutId: example.id,
    prescription:
      example.intent === "rest"
        ? example.prescription
        : `${formatDuration(durationSeconds)} total. ${example.prescription}`,
    reason: `${title}, week ${week} · ${phase}${cutback ? " · cutback" : ""}. Scaled to current training and the weekly time budget.`,
    steps,
  };
}
