import {
  addDays,
  dayOfWeek,
  phaseForDate,
  weekStart,
  isHard,
  type Phase,
  type PlanBlock,
  type PlanInput,
  type Race,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
export function phaseFor(date: string, race: Race | null): Phase {
  return phaseForDate(date, race?.date ?? null);
}
export function buildBlocks(
  service: CoachService,
  operationId: string,
): PlanBlock[] {
  const today = service.today();
  const athlete = service.athlete();
  const recent = service
    .races()
    .filter(
      (race) =>
        race.priority === "A" &&
        race.date < today &&
        race.date >= addDays(today, -7),
    )
    .at(-1);
  const race =
    recent ??
    service
      .races()
      .find((race) => race.priority === "A" && race.date >= today) ??
    null;
  const first = weekStart(today);
  const last = race ? weekStart(addDays(race.date, 7)) : addDays(first, 105);
  const history = service.activities();
  const base =
    athlete.weeklyMinutes ??
    (history.length
      ? Math.round(
          history.reduce((sum, a) => sum + a.durationSeconds / 60, 0) / 4,
        )
      : 120);
  const available = athlete.availableHours
    ? athlete.availableHours * 60
    : Infinity;
  const longest = Math.max(
    athlete.longestRunMinutes ?? 0,
    ...history
      .filter((a) => a.sport === "run" || a.sport === "trail")
      .map((a) => a.durationSeconds / 60),
  );
  const blocks: PlanBlock[] = [];
  for (
    let date = first, index = 0;
    date <= last && index < 105;
    date = addDays(date, 7), index++
  ) {
    const phase = phaseFor(
      date <= today && today <= addDays(date, 6) ? today : date,
      race,
    );
    const trainingStart = race ? weekStart(addDays(race.date, -112)) : first;
    const cutback =
      (phase === "build" || phase === "specific") &&
      Math.floor(daysBetween(trainingStart, date) / 7) % 4 === 3;
    const progression = Math.min(1.3, 1 + index * 0.04);
    const daysOut = race ? daysBetween(date, race.date) : Infinity;
    const factor =
      phase === "recovery"
        ? 0.35
        : phase === "taper"
          ? daysOut <= 6
            ? 0.4
            : daysOut <= 13
              ? 0.6
              : 0.75
          : cutback
            ? 0.8
            : progression;
    const previous = blocks.at(-1)?.weeklyMinutes ?? base;
    const weeklyMinutes = Math.max(
      20,
      Math.floor(
        Math.min(
          available,
          cutback
            ? Math.min(base * progression * 0.8, previous * 0.8)
            : base * factor,
        ) / 5,
      ) * 5,
    );
    const block: PlanBlock = {
      id: `${race?.id ?? "general"}:${date}`,
      raceId: race?.id ?? null,
      startDate: date,
      endDate: addDays(date, 6),
      phase,
      weeklyMinutes,
      longMinutes:
        phase === "taper" || phase === "recovery"
          ? 0
          : Math.min(longest + 10, Math.round(weeklyMinutes * 0.4)),
      cutback,
      reason: `${phase === "taper" ? "Reduce volume while staying fresh" : phase === "recovery" ? "Recover after race day" : cutback ? "A cutback week, at most 80% of the previous week" : "Build consistency from your recent weekly training"}${race ? ` for ${race.name} on ${race.date}` : ""}.`,
    };
    blocks.push(block);
  }
  return service.saveBlocks(blocks, operationId);
}

export function trainingProposal(
  service: CoachService,
  days: number,
  operationId: string,
): PlanInput[] {
  // A chosen program already has an explicitly accepted dated schedule.
  // Review/revise that schedule rather than regenerating it from references.
  if (service.programs.active()) return [];
  buildBlocks(service, `${operationId}:blocks`);
  const today = service.today();
  const athlete = service.athlete();
  const history = service.activities();
  const start = history.some((a) => a.date === today)
    ? addDays(today, 1)
    : today;
  const existing = service.plan(addDays(start, -7), addDays(start, days + 7));
  const longest = Math.max(
    athlete.longestRunMinutes ?? 0,
    ...history
      .filter((a) => ["run", "trail"].includes(a.sport))
      .map((a) => a.durationSeconds / 60),
  );
  const ready =
    athlete.readiness &&
    daysBetween(athlete.readiness.date, today) <= 2 &&
    athlete.readiness.sleep !== "poor" &&
    athlete.readiness.soreness !== "high";
  const output: PlanInput[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const block = service.blockFor(date);
    if (
      existing.some(
        (s) => s.date === date && ["accepted", "done"].includes(s.status),
      )
    )
      continue;
    const race = service.races().find((race) => race.id === block?.raceId);
    if (race?.date === date) continue; // Race event is visible; duration is not invented.
    const ultra =
      !!race && race.sport !== "bike" && race.distanceMetres > 42195;
    const weekday = dayOfWeek(date);
    const restDay = athlete.restDays.length
      ? athlete.restDays.includes(weekday)
      : weekday === (ultra ? 1 : 0);
    const taper = block?.phase === "taper" || block?.phase === "recovery";
    const long =
      !restDay &&
      !taper &&
      athlete.constraint === "none" &&
      weekday === athlete.longRunDay &&
      longest > 0 &&
      race?.sport !== "bike";
    const previousLong =
      output.find((s) => s.date === addDays(date, -1) && s.intent === "long") ??
      existing.find(
        (s) =>
          s.date === addDays(date, -1) &&
          s.intent === "long" &&
          s.status !== "skipped",
      );
    const backToBack =
      ultra &&
      !restDay &&
      !taper &&
      !!previousLong &&
      athlete.constraint === "none";
    const nearbyHard = [...existing, ...output, ...history].some(
      (s) => isHard(s) && Math.abs(daysBetween(s.date, date)) <= 1,
    );
    const quality =
      !long &&
      !backToBack &&
      !restDay &&
      athlete.constraint === "none" &&
      ready &&
      !nearbyHard &&
      !previousLong &&
      (weekday === 2 || weekday === 3) &&
      !output.some((s) => isHard(s) && weekStart(s.date) === weekStart(date)) &&
      block?.phase !== "recovery" &&
      (!taper || !race || daysBetween(date, race.date) > 3);
    const budget = block?.weeklyMinutes ?? 120;
    const longMinutes = long
      ? Math.max(
          10,
          Math.min(longest + 10, block?.longMinutes ?? longest, budget * 0.4),
        )
      : 0;
    const daysAvailable = Math.max(1, 7 - (athlete.restDays.length || 1));
    const easy = Math.max(
      10,
      Math.floor(
        (budget - (taper ? 0 : Math.min(longest + 10, budget * 0.4))) /
          Math.max(1, daysAvailable - 1) /
          5,
      ) * 5,
    );
    let duration = restDay
      ? 0
      : long
        ? longMinutes
        : backToBack
          ? Math.min(easy, Math.max(15, longest * 0.45))
          : easy;
    if (block && (block.cutback || taper) && duration > 0) {
      const committed = [
        ...history,
        ...existing.filter((s) => s.status === "accepted"),
        ...output,
      ]
        .filter((s) => weekStart(s.date) === weekStart(date))
        .reduce((sum, s) => sum + s.durationSeconds / 60, 0);
      const remaining = Math.max(0, budget - committed);
      const remainingDays = Array.from(
        { length: 7 - dayOfWeek(date) + 1 },
        (_, j) => addDays(date, j),
      ).filter(
        (day) =>
          weekStart(day) === weekStart(date) &&
          (!race || day !== race.date) &&
          !athlete.restDays.includes(dayOfWeek(day)) &&
          !existing.some(
            (s) => s.date === day && ["accepted", "done"].includes(s.status),
          ),
      ).length;
      duration =
        Math.floor(
          Math.min(duration, remaining / Math.max(1, remainingDays)) / 5,
        ) * 5;
      if (duration < 5) continue;
    }
    const sport = restDay
      ? "rest"
      : race?.sport === "bike"
        ? "bike"
        : race?.sport === "trail"
          ? "trail"
          : "run";
    const intent = restDay
      ? "rest"
      : long
        ? "long"
        : backToBack
          ? "back-to-back"
          : quality
            ? "quality"
            : sport === "bike" && athlete.constraint !== "injury"
              ? "endurance"
              : "easy";
    const title = restDay
      ? "Room to recover"
      : long
        ? "Your long run"
        : backToBack
          ? "Easy time on tired legs"
          : quality
            ? "A little quality"
            : taper
              ? "Stay fresh"
              : sport === "bike"
                ? "Conversational endurance ride"
                : "Easy, steady miles";
    const prescription = restDay
      ? "Take the day off. A gentle walk is optional."
      : quality
        ? "Keep the warmup and cooldown easy. Include a few short efforts at RPE 7 with full easy recovery."
        : backToBack
          ? "Keep it easy at RPE 3. This is time on feet after the long day, not another hard session."
          : "Keep it conversational at RPE 3. Ease off or stop if anything hurts.";
    const stepSeconds = Math.round(duration * 60);
    output.push({
      date,
      sport,
      intent,
      durationSeconds: stepSeconds,
      rpeTarget: restDay ? 0 : quality ? 7 : 3,
      title,
      prescription,
      reason: backToBack
        ? `An easy second day after ${previousLong?.date}, building ultra time on feet. ${race?.terrainNotes ?? ""}`
        : long
          ? `A small step from your recent longest run of ${Math.round(longest)} minutes. ${block?.reason ?? ""}`
          : (block?.reason ?? "Keep the week manageable."),
      blockId: block?.id ?? null,
      linkedDate: backToBack ? previousLong!.date : null,
      steps: restDay
        ? []
        : quality && stepSeconds >= 900
          ? [
              {
                kind: "warmup",
                durationSeconds: 300,
                distanceMetres: null,
                repeats: 1,
                target: { metric: "rpe", low: 2, high: 3 },
              },
              {
                kind: "work",
                durationSeconds: Math.min(300, stepSeconds - 600),
                distanceMetres: null,
                repeats: 1,
                target: { metric: "rpe", low: 6, high: 7 },
              },
              {
                kind: "cooldown",
                durationSeconds:
                  stepSeconds - 300 - Math.min(300, stepSeconds - 600),
                distanceMetres: null,
                repeats: 1,
                target: { metric: "rpe", low: 2, high: 3 },
              },
            ]
          : [
              {
                kind: "free",
                durationSeconds: stepSeconds,
                distanceMetres: null,
                repeats: 1,
                target: { metric: "rpe", low: 2, high: 3 },
              },
            ],
    });
  }
  return output;
}
