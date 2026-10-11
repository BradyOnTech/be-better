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
// Conservative finish-goal peaks for a full build, in minutes per week and for
// the longest single session. A shorter runway simply never reaches them.
function peaks(race: Race | null) {
  if (!race) return null;
  const km = race.distanceMetres / 1000;
  if (race.sport === "bike") return { weekly: 600, long: 240 };
  if (km <= 10.5) return { weekly: 240, long: 75 };
  if (km <= 21.5) return { weekly: 300, long: 120 };
  if (km <= 42.5) return { weekly: 390, long: 180 };
  if (km <= 60) return { weekly: 480, long: 240 };
  if (km <= 100) return { weekly: 570, long: 300 };
  return { weekly: 630, long: 360 };
}
// Minutes that count toward the race's training volume. Strength is recovery
// context, not endurance volume, and cycling does not stand in for running.
export function countsToward(race: Race | null) {
  const sports =
    race?.sport === "bike" ? ["bike"] : race ? ["run", "trail", "walk"] : null;
  return (sport: string) =>
    sports ? sports.includes(sport) : !["strength", "rest"].includes(sport);
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
  const counts = countsToward(race);
  const history = service.activities().filter((a) => counts(a.sport));
  // Average over the weeks the log actually covers (up to four), so a new log
  // with one week of training is not divided as if it held four.
  const earliest = history.map((a) => a.date).sort()[0];
  const weeksLogged = earliest
    ? Math.min(
        4,
        Math.max(1, Math.ceil((daysBetween(earliest, today) + 1) / 7)),
      )
    : 0;
  const base = Math.max(
    20,
    athlete.weeklyMinutes ??
      (weeksLogged
        ? Math.round(
            history.reduce((sum, a) => sum + a.durationSeconds / 60, 0) /
              weeksLogged,
          )
        : 120),
  );
  const available = athlete.availableHours
    ? athlete.availableHours * 60
    : Infinity;
  const longest = Math.max(
    athlete.longestRunMinutes ?? 0,
    ...history
      .filter((a) => race?.sport === "bike" || a.sport !== "bike")
      .map((a) => a.durationSeconds / 60),
  );
  const peak = peaks(race);
  // Without a race, consolidate rather than build toward a distance.
  const peakWeekly = Math.min(
    available,
    Math.max(base, peak?.weekly ?? Math.round(base * 1.3)),
  );
  const peakLong = Math.max(longest, peak?.long ?? longest + 30);
  const blocks: PlanBlock[] = [];
  // The last full training week sets the reference for cutbacks and taper.
  let level = base;
  let long = longest;
  let reached = base;
  for (
    let date = first, index = 0;
    date <= last && index < 105;
    date = addDays(date, 7), index++
  ) {
    const phase = phaseFor(
      date <= today && today <= addDays(date, 6) ? today : date,
      race,
    );
    const taper = phase === "taper" || phase === "recovery";
    const cutback = !taper && index % 4 === 3;
    const daysOut = race ? daysBetween(date, race.date) : Infinity;
    let weeklyMinutes: number;
    let longMinutes: number;
    if (taper) {
      const factor =
        phase === "recovery"
          ? 0.35
          : daysOut <= 6
            ? 0.4
            : daysOut <= 13
              ? 0.6
              : 0.75;
      weeklyMinutes = reached * factor;
      longMinutes = 0;
    } else if (cutback) {
      weeklyMinutes = level * 0.8;
      longMinutes = long * 0.75;
    } else {
      // Grow about 10% a week from the last full week, and the long session
      // by ten minutes, until the race-specific peak.
      level = Math.min(peakWeekly, index > 0 ? level * 1.1 : level);
      long = Math.min(peakLong, long + 10);
      weeklyMinutes = level;
      longMinutes = long;
      reached = level;
    }
    weeklyMinutes = Math.max(
      20,
      Math.floor(Math.min(available, weeklyMinutes) / 5) * 5,
    );
    if (longMinutes > 0)
      longMinutes = Math.round(
        Math.min(
          longMinutes,
          // Low-volume weeks can hold half their time in the long session;
          // larger weeks keep it near 40%.
          Math.max(weeklyMinutes * 0.42, Math.min(weeklyMinutes * 0.5, 90)),
        ),
      );
    const block: PlanBlock = {
      id: `${race?.id ?? "general"}:${date}`,
      raceId: race?.id ?? null,
      startDate: date,
      endDate: addDays(date, 6),
      phase,
      weeklyMinutes,
      longMinutes,
      cutback,
      reason: `${phase === "taper" ? "Reduce volume while staying fresh" : phase === "recovery" ? "Recover after race day" : cutback ? "A cutback week, about 80% of the previous week" : index === 0 ? `Start from your recent ${Math.round(base)} minutes a week` : "Build about 10% from the previous full week"}${race ? ` for ${race.name} on ${race.date}` : ""}.`,
    };
    blocks.push(block);
  }
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
  const start = history.some((a) => a.date === today)
    ? addDays(today, 1)
    : today;
  const end = addDays(start, days - 1);
  const existing = service.plan(addDays(weekStart(start), -7), addDays(end, 7));
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
    const ultra =
      !!race && race.sport !== "bike" && race.distanceMetres > 42195;
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
    const long =
      !taper &&
      athlete.constraint === "none" &&
      longest > 0 &&
      race?.sport !== "bike" &&
      free(longDay) &&
      !(race && race.date >= longDay && race.date <= addDays(longDay, 6));
    const longTarget = long
      ? Math.min(block?.longMinutes ?? longest + 10, longest + 20)
      : 0;
    // Ultra back-to-backs start once the long run is substantial, in the
    // build and race-specific phases.
    const secondDay = addDays(longDay, 1);
    const backToBack =
      ultra &&
      long &&
      ["build", "specific"].includes(block?.phase ?? "") &&
      longTarget >= 90 &&
      weekStart(secondDay) === week &&
      free(secondDay);
    const runDays = budget < 120 ? 3 : budget < 200 ? 4 : budget < 300 ? 5 : 6;
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
      secondMinutes = round5(Math.min(longMinutes * 0.5, remaining));
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
    if (longMinutes) easyMinutes = Math.min(easyMinutes, longMinutes);
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
      output.push({
        date,
        sport,
        intent,
        durationSeconds: stepSeconds,
        rpeTarget: rest ? 0 : intent === "quality" ? 7 : 3,
        title,
        prescription,
        reason:
          intent === "back-to-back"
            ? `An easy second day after the ${longMinutes}-minute long run, building ultra time on feet. ${race?.terrainNotes ?? ""}`.trim()
            : intent === "long"
              ? `Builds from your recent longest run of ${Math.round(longest)} minutes. ${block?.reason ?? ""}`.trim()
              : rest
                ? `A ${budget}-minute week leaves room to recover between runs.`
                : (block?.reason ?? "Keep the week manageable."),
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
