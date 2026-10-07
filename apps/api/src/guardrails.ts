import {
  addDays,
  dayOfWeek,
  DomainError,
  isHard,
  weekStart,
  type Activity,
  type Athlete,
  type PlanInput,
  type PlanSession,
  type PlanBlock,
  type Race,
} from "../../../packages/domain/src/index.js";

export function validatePlan(
  candidate: PlanInput[],
  existing: PlanSession[],
  activities: Activity[],
  athlete: Athlete,
  today: string,
  context: { blocks: PlanBlock[]; races: Race[] } = { blocks: [], races: [] },
) {
  const completed = activities.filter((activity) => activity.confirmed);
  const schedule = [
    ...existing.filter((session) =>
      ["proposed", "accepted"].includes(session.status),
    ),
    ...candidate,
  ];
  const performed = completed.map((activity) => ({
    ...activity,
    rpeTarget: activity.rpe ?? 0,
  }));
  // A completed session replaces its prescription for effort and volume checks.
  const all = [...schedule, ...performed];
  const hard = (session: (typeof all)[number]) =>
    isHard(session) ||
    ("steps" in session &&
      !!session.steps?.some((step) => {
        const target = step.target;
        if (!target) return false;
        const threshold =
          target.metric === "power"
            ? athlete.thresholds.ftp
            : target.metric === "heartRate"
              ? athlete.thresholds.heartRate
              : target.metric === "pace"
                ? athlete.thresholds.pace
                : null;
        return (
          !!threshold &&
          (target.metric === "pace"
            ? target.low <= threshold.value / 0.9
            : target.high >= threshold.value * 0.9)
        );
      }));
  for (const session of candidate) {
    const prescription = `${session.title} ${session.prescription}`;
    const unsupportedTarget =
      /\b\d+(?:[.:]\d+)?\s*(?:bpm\b|watts?\b|w\b|mph\b|kph\b|km\/h\b|(?:mins?|minutes?)\s*(?:\/|per\s+)(?:km|kilomet(?:er|re)s?|mi|miles?)\b)|\b\d{1,2}:\d{2}\s*(?:\/|per\s+)(?:km|mi|miles?)\b|\b(?:goal|race|threshold|marathon|half.marathon)\s+pace\b|\b(?:heart.rate|power|pace)\s+zone\b|\bzone\s*[1-5]\b/i;
    const zones = athlete.zones ?? { pace: [], heartRate: [], power: [] };
    const targets =
      session.steps?.flatMap((step) => (step.target ? [step.target] : [])) ??
      [];
    for (const target of targets) {
      if (target.metric === "rpe") {
        if (target.high > 10)
          throw new DomainError(
            "TARGET",
            "RPE targets must be between 1 and 10.",
          );
        continue;
      }
      if (
        !zones[target.metric].some(
          (zone) => target.low >= zone.low && target.high <= zone.high,
        )
      )
        throw new DomainError(
          "ZONES",
          `The ${target.metric} target is outside your saved zones. Use RPE or update the zones first.`,
        );
    }
    if (unsupportedTarget.test(prescription))
      throw new DomainError(
        "ZONES",
        "Use an RPE target, or put numeric pace, heart-rate, and power bounds in structured steps inside your saved zones. Keep the instructions to effort cues.",
      );
    const total =
      session.steps?.reduce(
        (sum, step) => sum + (step.durationSeconds ?? 0) * step.repeats,
        0,
      ) ?? 0;
    if (
      session.steps?.length &&
      session.steps.every((step) => step.durationSeconds !== null) &&
      Math.abs(total - session.durationSeconds) > 1
    )
      throw new DomainError(
        "STEPS",
        "The workout steps must add up to its planned duration.",
      );
    const race = context.races.find(
      (race) =>
        race.priority === "A" &&
        race.date >= session.date &&
        race.date <= addDays(session.date, 6),
    );
    if (race && session.intent === "long")
      throw new DomainError(
        "TAPER",
        "A long run is blocked in the final week before an A race. Keep the taper short.",
      );
    const block =
      context.blocks.find((block) => block.id === session.blockId) ??
      context.blocks.find(
        (block) =>
          block.startDate <= session.date &&
          block.endDate >= session.date &&
          context.races.some((race) => race.id === block.raceId),
      );
    if (block?.phase === "taper" && hard(session)) {
      const quality = new Set(
        all
          .filter(
            (other) =>
              weekStart(other.date) === weekStart(session.date) && hard(other),
          )
          .map((other) => other.date),
      );
      if (quality.size > 1 || session.durationSeconds > 2700)
        throw new DomainError(
          "TAPER_QUALITY",
          "Keep the taper to one short quality session per week, at most 45 minutes.",
        );
    }
    if (block && (block.cutback || block.phase === "taper")) {
      const week = schedule.filter(
        (other) => weekStart(other.date) === weekStart(session.date),
      );
      const actual = performed.filter(
        (other) => weekStart(other.date) === weekStart(session.date),
      );
      const volume = [...week, ...actual].reduce(
        (sum, other) => sum + other.durationSeconds / 60,
        0,
      );
      if (volume > block.weeklyMinutes + 1 && session.durationSeconds > 0)
        throw new DomainError(
          block.cutback ? "CUTBACK" : "TAPER",
          `This ${block.cutback ? "cutback" : "taper"} week is capped at ${block.weeklyMinutes} minutes. Shorten the proposal to leave recovery room.`,
        );
    }
    if (session.date < today)
      throw new DomainError(
        "PAST_PLAN",
        "Completed days are history. Plan from today onward.",
      );
    if (
      athlete.restDays.includes(dayOfWeek(session.date)) &&
      session.intent !== "rest"
    )
      throw new DomainError(
        "REST_DAY",
        `${session.date} is one of your rest days. Keep it free or change your availability first.`,
      );
    if (
      athlete.constraint === "injury" &&
      !["rest", "easy", "strength"].includes(session.intent)
    )
      throw new DomainError(
        "INJURY",
        "With an injury flag active, keep the plan to rest, easy movement, or suitable strength work.",
      );
    if (athlete.constraint === "injury" && hard(session))
      throw new DomainError(
        "INJURY",
        "A hard session is blocked while an injury flag is active.",
      );
    if (hard(session)) {
      const previous = all.filter(
        (other) => other.date === addDays(session.date, -1),
      );
      const following = all.filter(
        (other) => other.date === addDays(session.date, 1),
      );
      if (
        previous.some((other) => hard(other) || other.intent === "long") ||
        following.some((other) => hard(other))
      )
        throw new DomainError(
          "RECOVERY",
          "Leave an easy or rest day between hard sessions, and recover after a long run.",
        );
      if (
        all.filter((other) => other.date === session.date && hard(other))
          .length > 1
      )
        throw new DomainError(
          "SAME_DAY",
          "Keep one hard session per day, across running and cycling.",
        );
      const hardDates = new Set(
        all
          .filter(
            (other) =>
              hard(other) && weekStart(other.date) === weekStart(session.date),
          )
          .map((other) => other.date),
      );
      if (hardDates.size > 2)
        throw new DomainError(
          "WEEKLY_QUALITY",
          "This would make more than two hard days in the same week.",
        );
    }
    if (
      session.intent === "long" &&
      all.some(
        (other) => other.date === addDays(session.date, 1) && hard(other),
      )
    )
      throw new DomainError(
        "RECOVERY",
        "The day after this long run already has a hard session. Leave room to recover.",
      );
    if (session.intent === "long" && ["run", "trail"].includes(session.sport)) {
      const history = completed.filter(
        (activity) =>
          ["run", "trail"].includes(activity.sport) &&
          activity.date >= addDays(today, -27) &&
          activity.date <= today,
      );
      const baseline = Math.max(
        athlete.longestRunMinutes ? athlete.longestRunMinutes * 60 : 0,
        ...history.map((activity) => activity.durationSeconds),
      );
      if (!baseline)
        throw new DomainError(
          "BASELINE",
          "Tell me your recent longest run before I add a long run.",
        );
      if (session.durationSeconds > baseline + 1200)
        throw new DomainError(
          "LONG_RUN",
          "Keep the long run within 20 minutes of your recent longest run.",
        );
    }
  }
}
