import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { CoachService } from "./service.js";
import { buildBlocks, trainingProposal } from "./planning.js";
import { validatePlan } from "./guardrails.js";
import {
  addDays,
  type ActivityInput,
  type PlanInput,
} from "../../../packages/domain/src/index.js";

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});
// Saturday 2026-10-10, 6:50 pm in Chicago, with one week of logged training.
function newRunner(background: Record<string, number> = {}) {
  const database = openDatabase(":memory:");
  databases.push(database);
  const service = new CoachService(
    database,
    () => new Date("2026-10-10T23:50:00Z"),
  );
  service.updateAthlete(
    { timezone: "America/Chicago", longRunDay: 6, ...background },
    "athlete",
  );
  const log = (date: string, sport: ActivityInput["sport"], minutes: number) =>
    service.logActivity(
      {
        date,
        sport,
        durationSeconds: minutes * 60,
        distanceMetres: null,
        rpe: 3,
        intent: sport === "strength" ? "strength" : "easy",
        feel: null,
        pain: null,
      },
      `${date}-${sport}`,
    );
  log("2026-10-06", "run", 25);
  log("2026-10-07", "run", 31);
  log("2026-10-07", "strength", 40);
  log("2026-10-08", "run", 30);
  service.saveRace(
    {
      name: "Vortex 34 Mile",
      sport: "trail",
      date: "2027-04-17",
      distanceMetres: 54718,
      elevationGainMetres: 1003,
      priority: "A",
      goal: "Finish",
      terrainNotes: "",
    },
    null,
    "race",
  );
  return service;
}

const running = (s: PlanInput) => s.intent !== "rest" && s.sport !== "strength";
const weekOf = (week: PlanInput[], from: string) =>
  week.filter((s) => s.date >= from && s.date <= addDays(from, 6));

describe("the athlete's baseline", () => {
  it("uses the weeks the log covers when nothing else is known", () => {
    const blocks = buildBlocks(newRunner(), "blocks");
    // 86 running minutes in the only logged week; strength does not count.
    expect(blocks[0].weeklyMinutes).toBe(85);
    expect(blocks[0].longMinutes).toBe(40);
  });

  it("counts reported training that is not in the log", () => {
    const blocks = buildBlocks(
      newRunner({ weeklyMinutes: 180, longestRunMinutes: 65 }),
      "blocks",
    );
    expect(blocks[0].weeklyMinutes).toBe(180);
    expect(blocks[0].longMinutes).toBe(75);
  });

  it("dates stated background so it can go stale", () => {
    const service = newRunner({ weeklyMinutes: 180 });
    expect(service.athlete().backgroundDate).toBe("2026-10-10");
  });
});

describe("race-oriented training blocks", () => {
  it("builds toward the matching reference program's peak", () => {
    const blocks = buildBlocks(
      newRunner({ weeklyMinutes: 180, longestRunMinutes: 65 }),
      "blocks",
    );
    // A 34-mile trail race matches First 50K: up to about 7 hours a week and
    // a three-hour time-on-feet long run.
    expect(blocks[0].reference).toBe("ultra-first");
    const training = blocks.filter(
      (b) => !["taper", "recovery"].includes(b.phase),
    );
    expect(Math.max(...training.map((b) => b.weeklyMinutes))).toBe(420);
    expect(Math.max(...training.map((b) => b.longMinutes))).toBe(180);
    // The peak comes in the final full weeks before the taper.
    const peakWeek = training.findIndex((b) => b.weeklyMinutes === 420);
    expect(peakWeek).toBeGreaterThan(training.length - 4);
    for (const [i, block] of blocks.entries()) {
      if (
        i === 0 ||
        block.cutback ||
        ["taper", "recovery"].includes(block.phase)
      )
        continue;
      const lastFull = blocks
        .slice(0, i)
        .filter((b) => !b.cutback)
        .at(-1)!;
      expect(block.weeklyMinutes).toBeLessThanOrEqual(
        Math.max(lastFull.weeklyMinutes * 1.1, lastFull.weeklyMinutes + 15) + 5,
      );
      expect(block.longMinutes - lastFull.longMinutes).toBeLessThanOrEqual(20);
    }
    expect(training.filter((b) => b.cutback).length).toBeGreaterThan(3);
    const taper = blocks.filter((b) => b.phase === "taper");
    expect(taper.map((b) => b.weeklyMinutes)).toEqual(
      [...taper.map((b) => b.weeklyMinutes)].sort((a, b) => b - a),
    );
    expect(taper.at(-1)!.longMinutes).toBe(0);
    // A first, moderate 50K-ish race has no back-to-back long days.
    expect(blocks.every((b) => !b.secondMinutes)).toBe(true);
  });

  it("pairs some specific-phase long runs for longer ultras", () => {
    const service = newRunner({ weeklyMinutes: 420, longestRunMinutes: 150 });
    const race = service.races()[0];
    service.saveRace(
      { ...race, name: "Fifty miler", distanceMetres: 80467 },
      race.id,
      "fifty",
    );
    const blocks = buildBlocks(service, "blocks");
    expect(blocks[0].reference).toBe("ultra-long");
    const paired = blocks.filter((b) => b.secondMinutes);
    expect(paired.length).toBeGreaterThan(0);
    expect(paired.every((b) => b.phase === "specific" && !b.cutback)).toBe(
      true,
    );
    expect(paired.every((b) => b.secondMinutes! <= b.longMinutes * 0.75)).toBe(
      true,
    );
  });
});

describe("the proposed training week", () => {
  it("starts tomorrow late in the day and fits a new runner's week", () => {
    const service = newRunner();
    const week = trainingProposal(service, 9, "week");
    expect(week[0].date).toBe("2026-10-11");
    const next = weekOf(week, "2026-10-12").filter(running);
    expect(next.length).toBeGreaterThanOrEqual(3);
    expect(next.length).toBeLessThanOrEqual(4);
    expect(next.every((s) => s.durationSeconds >= 20 * 60)).toBe(true);
    const long = next.find((s) => s.intent === "long")!;
    expect(long.date).toBe("2026-10-17");
    expect(long.durationSeconds).toBeGreaterThan(31 * 60);
    expect(long.durationSeconds).toBeLessThanOrEqual(51 * 60);
    const total = next.reduce((sum, s) => sum + s.durationSeconds / 60, 0);
    expect(total).toBeGreaterThanOrEqual(85);
    expect(total).toBeLessThanOrEqual(105);
    expect(() => service.proposeWeek(week, "save")).not.toThrow();
  });

  it("prescribes the reference program's sessions", () => {
    const week = trainingProposal(
      newRunner({ weeklyMinutes: 180, longestRunMinutes: 65 }),
      9,
      "week",
    );
    const long = week.find((s) => s.intent === "long")!;
    expect(long.exampleWorkoutId).toBe("u50-long");
    expect(long.reason).toContain("First 50K");
    const easy = week.filter((s) => s.intent === "easy");
    expect(easy.every((s) => s.durationSeconds <= 60 * 60)).toBe(true);
  });

  it("sizes a week the window cuts short as a full week", () => {
    // Fourteen days end on Saturday 10/24 with that week's long run.
    const week = trainingProposal(newRunner(), 13, "week");
    const partial = weekOf(week, "2026-10-19").filter(running);
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.every((s) => s.durationSeconds <= 35 * 60)).toBe(true);
  });

  it("adds an easy back-to-back day in a longer ultra's specific weeks", () => {
    const service = newRunner({ weeklyMinutes: 420, longestRunMinutes: 150 });
    const race = service.races()[0];
    service.saveRace(
      // This week is the build; next week is the first specific week.
      { ...race, distanceMetres: 80467, date: addDays("2026-10-10", 57) },
      race.id,
      "race-sooner",
    );
    const week = trainingProposal(service, 14, "week");
    const second = week.find((s) => s.intent === "back-to-back")!;
    const long = week.find((s) => s.date === second.linkedDate)!;
    expect(long.intent).toBe("long");
    expect(second.date).toBe(addDays(long.date, 1));
    expect(second.durationSeconds).toBeLessThan(long.durationSeconds);
  });

  it("replaces earlier unaccepted proposals on the same dates", () => {
    const service = newRunner();
    service.proposePlan(
      [
        {
          date: "2026-10-13",
          sport: "trail",
          intent: "back-to-back",
          durationSeconds: 600,
          rpeTarget: 3,
          title: "Old",
          prescription: "Old proposal.",
          reason: "Old.",
        },
      ],
      "old",
    );
    service.proposeWeek(trainingProposal(service, 9, "week"), "save");
    const day = service.plan("2026-10-13", "2026-10-13");
    expect(day.some((s) => s.title === "Old")).toBe(false);
    expect(day).toHaveLength(1);
  });
});

describe("long-run progression guardrail", () => {
  const long = (date: string, minutes: number): PlanInput => ({
    date,
    sport: "trail",
    intent: "long",
    durationSeconds: minutes * 60,
    rpeTarget: 3,
    title: "Long run",
    prescription: "Easy.",
    reason: "Build.",
  });
  it("lets later long runs build on the ones planned before them", () => {
    const service = newRunner({ longestRunMinutes: 60 });
    const check = (plan: PlanInput[]) =>
      validatePlan(
        plan,
        [],
        service.activities(),
        service.athlete(),
        service.today(),
      );
    expect(() =>
      check([
        long("2026-10-17", 75),
        long("2026-10-24", 90),
        long("2026-10-31", 105),
      ]),
    ).not.toThrow();
    expect(() =>
      check([long("2026-10-17", 75), long("2026-10-24", 100)]),
    ).toThrow(/within 20 minutes/);
    expect(() => check([long("2026-11-28", 90)])).toThrow(/within 20 minutes/);
  });
});

describe("Programs previews", () => {
  it("build from the current level toward the chosen weekly time", () => {
    const service = newRunner({ weeklyMinutes: 180, longestRunMinutes: 65 });
    const preview = service.programs.preview({
      patternId: "ultra-first",
      goal: "Vortex 34",
      startDate: "2026-10-12",
      weeks: 24,
      trainingDays: [0, 2, 3, 4, 6],
      weeklyMinutes: 420,
      includeStrength: false,
      targetDate: "2027-03-27",
    });
    expect(preview.weeks[0].minutes).toBeLessThanOrEqual(185);
    expect(Math.max(...preview.weeks.map((w) => w.minutes))).toBeGreaterThan(
      400,
    );
    const longs = preview.sessions
      .filter((s) => s.intent === "long")
      .map((s) => s.durationSeconds / 60);
    expect(longs[0]).toBeLessThanOrEqual(85);
    expect(Math.max(...longs)).toBe(180);
  });
});
