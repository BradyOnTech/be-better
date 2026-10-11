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
  exampleWorkouts,
  programLibrary,
  programQueryFromContext,
  retrievePrograms,
  trainingBaseline,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";
import { progressWeeks, type WeekFrame } from "./progression.js";
import { toSession } from "./training-programs.js";

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
export function phaseFor(date: string, race: Race | null): Phase {
  return phaseForDate(date, race?.date ?? null);
}
// Minutes that count toward the race's training volume. Strength is recovery
// context, not endurance volume, and cycling does not stand in for running.
export function countsToward(race: Race | null) {
  const sports =
    race?.sport === "bike" ? ["bike"] : race ? ["run", "trail", "walk"] : null;
  return (sport: string) =>
    sports ? sports.includes(sport) : !["strength", "rest"].includes(sport);
}
// The reference program that matches the race supplies the destination: its
// usual peak week and its longest example session.
export function raceDestination(service: CoachService, race: Race) {
  const query = programQueryFromContext({
    today: service.today(),
    athlete: service.athlete(),
    activities: service.activities(),
    block: null,
    races: [race],
  });
  const pattern = programLibrary.find(
    (p) =>
      p.id === retrievePrograms({ ...query, phase: "build", limit: 1 })[0]?.id,
  );
  const longest = Math.max(
    0,
    ...(exampleWorkouts[pattern?.id ?? ""] ?? [])
      .filter((w) => w.intent === "long" || /long/i.test(w.name))
      .map((w) => w.minutes.high),
  );
  return {
    pattern: pattern ?? null,
    weeklyMinutes: pattern?.weeklyMinutes?.high ?? null,
    longMinutes: longest || null,
  };
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
  const baseline = trainingBaseline({
    today,
    athlete,
    activities: service.activities(),
    counts: countsToward(race),
  });
  const weekly = Math.max(20, baseline.weeklyMinutes ?? 120);
  const longest =
    race?.sport === "bike" ? 0 : (baseline.longestRunMinutes ?? 0);
  const destination = race ? raceDestination(service, race) : null;
  const ultra = !!race && race.sport !== "bike" && race.distanceMetres > 42195;
  const frames: WeekFrame[] = [];
  const dates: string[] = [];
  for (
    let date = first, index = 0;
    date <= last && index < 105;
    date = addDays(date, 7), index++
  ) {
    const phase = phaseFor(
      date <= today && today <= addDays(date, 6) ? today : date,
      race,
    );
    frames.push({
      phase,
      cutback: phase !== "taper" && phase !== "recovery" && index % 4 === 3,
      daysOut: race ? daysBetween(date, race.date) : Infinity,
    });
    dates.push(date);
  }
  const loads = progressWeeks(frames, {
    weeklyMinutes: weekly,
    longestMinutes: longest,
    // Without a race, consolidate rather than build toward a distance.
    peakWeeklyMinutes:
      destination?.weeklyMinutes ?? Math.round(weekly * (race ? 1.5 : 1.2)),
    peakLongMinutes: destination?.longMinutes ?? longest + (race ? 60 : 20),
    availableMinutes: athlete.availableHours
      ? athlete.availableHours * 60
      : undefined,
    backToBack: ultra && race.distanceMetres > 60000,
    ultra,
  });
  const reference = destination?.pattern?.title;
  const blocks = frames.map((frame, index): PlanBlock => {
    const load = loads[index];
    const why =
      frame.phase === "taper"
        ? "Reduce volume while staying fresh"
        : frame.phase === "recovery"
          ? "Recover after race day"
          : frame.cutback
            ? "A cutback week, about 80% of the last full week"
            : index === 0
              ? `Start from your current ${weekly} minutes a week`
              : reference
                ? `Build toward the ${reference} peak of about ${destination?.weeklyMinutes} minutes a week`
                : "Build gradually from the previous full week";
    return {
      id: `${race?.id ?? "general"}:${dates[index]}`,
      raceId: race?.id ?? null,
      startDate: dates[index],
      endDate: addDays(dates[index], 6),
      phase: frame.phase,
      weeklyMinutes: load.weeklyMinutes,
      longMinutes: load.longMinutes,
      secondMinutes: load.secondMinutes,
      reference: destination?.pattern?.id ?? null,
      cutback: frame.cutback,
      reason: `${why}${race ? ` for ${race.name} on ${race.date}` : ""}.`,
    };
  });
  return service.saveBlocks(blocks, operationId);
}

const round5 = (minutes: number) => Math.floor(minutes / 5) * 5;
// Easy days in order of preference, as offsets from the long-run weekday:
// midweek first, then the day after the long run, then the rest.
const easyOffsets = [3, 5, 1, 4, 6, 2];

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
  // Start tomorrow once today's training is logged or the day is mostly over.
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: athlete.timezone,
    }).format(service.now()),
  );
  const start =
    history.some((a) => a.date === today) || hour >= 16
      ? addDays(today, 1)
      : today;
  const end = addDays(start, days - 1);
  const existing = service.plan(addDays(weekStart(start), -7), addDays(end, 7));
  // Reported background counts alongside the log.
  const longest =
    trainingBaseline({ today, athlete, activities: history })
      .longestRunMinutes ?? 0;
  const ready =
    athlete.readiness &&
    daysBetween(athlete.readiness.date, today) <= 2 &&
    athlete.readiness.sleep !== "poor" &&
    athlete.readiness.soreness !== "high";
  const settled = (date: string) =>
    existing.some(
      (s) => s.date === date && ["accepted", "done"].includes(s.status),
    );
  const free = (date: string) => !athlete.restDays.includes(dayOfWeek(date));
  const output: PlanInput[] = [];
  for (let week = weekStart(start); week <= end; week = addDays(week, 7)) {
    const dates = Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const block = service.blockFor(week < start ? start : week);
    const race = service.races().find((race) => race.id === block?.raceId);
    const counts = countsToward(race ?? null);
    const taper = block?.phase === "taper" || block?.phase === "recovery";
    const budget = block?.weeklyMinutes ?? 120;
    // Training already done or accepted this week comes out of the budget.
    const committed = [
      ...history,
      ...existing.filter((s) => s.status === "accepted"),
    ]
      .filter((s) => weekStart(s.date) === week && counts(s.sport))
      .reduce((sum, s) => sum + s.durationSeconds / 60, 0);
    // Size the whole remaining week, then emit only the days in the window.
    const upcoming = dates.filter(
      (date) => date >= start && !settled(date) && race?.date !== date,
    );
    const open = upcoming.filter((date) => date <= end);
    if (!open.length) continue;
    const longDay = dates.find((d) => dayOfWeek(d) === athlete.longRunDay)!;
    // The block keeps a shortened long run early in the taper, none in the
    // final week.
    const long =
      (block ? block.longMinutes > 0 : !taper) &&
      athlete.constraint === "none" &&
      longest > 0 &&
      race?.sport !== "bike" &&
      free(longDay) &&
      !(race && race.date >= longDay && race.date <= addDays(longDay, 6));
    const longTarget = long
      ? Math.min(block?.longMinutes ?? longest + 10, longest + 20)
      : 0;
    // The block decides which ultra weeks pair the long run with an easy day.
    const secondDay = addDays(longDay, 1);
    const backToBack =
      long &&
      (block?.secondMinutes ?? 0) > 0 &&
      weekStart(secondDay) === week &&
      free(secondDay);
    const runDays = budget < 150 ? 3 : budget < 240 ? 4 : budget < 330 ? 5 : 6;
    const candidates = [
      ...(long ? [] : [longDay]),
      ...easyOffsets.map(
        (offset) =>
          dates.find(
            (d) => dayOfWeek(d) === (athlete.longRunDay + offset) % 7,
          )!,
      ),
    ].filter(
      (d) =>
        free(d) &&
        d !== (long ? longDay : null) &&
        !(backToBack && d === secondDay),
    );
    let easyDays = candidates.slice(
      0,
      Math.max(0, runDays - (long ? 1 : 0) - (backToBack ? 1 : 0)),
    );
    let remaining = Math.max(0, budget - committed);
    let longMinutes = 0;
    if (long && upcoming.includes(longDay)) {
      longMinutes = round5(Math.min(longTarget, remaining));
      if (longMinutes < 20) longMinutes = 0;
      remaining -= longMinutes;
    }
    let secondMinutes = 0;
    if (backToBack && longMinutes && upcoming.includes(secondDay)) {
      secondMinutes = round5(
        Math.min(block?.secondMinutes ?? 0, longMinutes * 0.75, remaining),
      );
      if (secondMinutes < 20) secondMinutes = 0;
      remaining -= secondMinutes;
    }
    easyDays = easyDays.filter((d) => upcoming.includes(d));
    let easyMinutes = 0;
    while (easyDays.length) {
      easyMinutes = round5(remaining / easyDays.length);
      if (easyMinutes >= 20) break;
      easyDays = easyDays.slice(0, -1);
    }
    // A short remainder of a week is not a reason for one big easy day.
    const easyExample = (exampleWorkouts[block?.reference ?? ""] ?? []).find(
      (w) => w.intent === "easy",
    );
    easyMinutes = round5(
      Math.min(
        easyMinutes,
        Math.max(30, 0.75 * (longTarget || longest)),
        easyExample?.minutes.high ?? Infinity,
      ),
    );
    const reference =
      programLibrary.find((p) => p.id === block?.reference) ?? null;
    const examples = reference ? (exampleWorkouts[reference.id] ?? []) : [];
    let qualityUsed = false;
    for (const date of open) {
      const weekday = dayOfWeek(date);
      let duration = 0;
      let intent: PlanInput["intent"] = "rest";
      if (date === longDay && longMinutes) {
        duration = longMinutes;
        intent = "long";
      } else if (date === secondDay && secondMinutes) {
        duration = secondMinutes;
        intent = "back-to-back";
      } else if (easyDays.includes(date)) {
        duration = easyMinutes;
        const nearbyHard = [...existing, ...output, ...history].some(
          (s) => isHard(s) && Math.abs(daysBetween(s.date, date)) <= 1,
        );
        const afterLong = [...existing, ...output].some(
          (s) =>
            s.date === addDays(date, -1) &&
            s.intent === "long" &&
            (!("status" in s) || s.status !== "skipped"),
        );
        const hard =
          !qualityUsed &&
          athlete.constraint === "none" &&
          !!ready &&
          !nearbyHard &&
          !afterLong &&
          (weekday === 2 || weekday === 3) &&
          block?.phase !== "recovery" &&
          (!taper || !race || daysBetween(date, race.date) > 3);
        if (hard) qualityUsed = true;
        intent = hard
          ? "quality"
          : race?.sport === "bike" && athlete.constraint !== "injury"
            ? "endurance"
            : "easy";
      }
      const rest = intent === "rest";
      const sport = rest
        ? "rest"
        : race?.sport === "bike"
          ? "bike"
          : race?.sport === "trail" && intent !== "easy" && intent !== "quality"
            ? "trail"
            : "run";
      const title = rest
        ? "Room to recover"
        : intent === "long"
          ? "Your long run"
          : intent === "back-to-back"
            ? "Easy time on tired legs"
            : intent === "quality"
              ? "A little quality"
              : taper
                ? "Stay fresh"
                : sport === "bike"
                  ? "Conversational endurance ride"
                  : "Easy, steady miles";
      const prescription = rest
        ? "Take the day off. A gentle walk is optional."
        : intent === "quality"
          ? "Keep the warmup and cooldown easy. Include a few short efforts at RPE 7 with full easy recovery."
          : intent === "back-to-back"
            ? "Keep it easy at RPE 3. This is time on feet after the long day, not another hard session."
            : "Keep it conversational at RPE 3. Walk breaks are fine. Ease off or stop if anything hurts.";
      const stepSeconds = duration * 60;
      const reason =
        intent === "back-to-back"
          ? `An easy second day after the ${longMinutes}-minute long run, building ultra time on feet. ${race?.terrainNotes ?? ""}`.trim()
          : intent === "long"
            ? `Builds from your recent longest run of ${Math.round(longest)} minutes. ${block?.reason ?? ""}`.trim()
            : rest
              ? `A ${budget}-minute week leaves room to recover between runs.`
              : (block?.reason ?? "Keep the week manageable.");
      // Prescribe from the reference program's own session when it has one.
      const example =
        examples.find(
          (w) =>
            (intent === "quality"
              ? ["quality", "hills"].includes(w.intent)
              : w.intent === intent) &&
            (!block || w.phases.includes(block.phase)),
        ) ??
        (intent === "quality"
          ? undefined
          : examples.find((w) => w.intent === intent));
      if (example && reference) {
        output.push({
          ...toSession(
            example,
            date,
            duration,
            reference.title,
            1,
            block?.phase ?? "base",
            !!block?.cutback,
          ),
          reason: `${reference.title}: ${reason}`,
          blockId: block?.id ?? null,
          linkedDate: intent === "back-to-back" ? longDay : null,
        });
        continue;
      }
      output.push({
        date,
        sport,
        intent,
        durationSeconds: stepSeconds,
        rpeTarget: rest ? 0 : intent === "quality" ? 7 : 3,
        title,
        prescription,
        reason,
        blockId: block?.id ?? null,
        linkedDate: intent === "back-to-back" ? longDay : null,
        steps: rest
          ? []
          : intent === "quality" && stepSeconds >= 900
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
  }
  return output;
}
