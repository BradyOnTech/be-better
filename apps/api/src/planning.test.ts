import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { CoachService } from "./service.js";
import { buildBlocks, trainingProposal } from "./planning.js";
import {
  addDays,
  type ActivityInput,
} from "../../../packages/domain/src/index.js";

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});
// Saturday 2026-10-10 in Chicago, with one week of logged training.
function newRunner() {
  const database = openDatabase(":memory:");
  databases.push(database);
  const service = new CoachService(
    database,
    () => new Date("2026-10-10T23:50:00Z"),
  );
  service.updateAthlete(
    { timezone: "America/Chicago", longRunDay: 6 },
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

describe("race-oriented training blocks", () => {
  it("starts from the weeks the log covers, not a four-week divisor", () => {
    const blocks = buildBlocks(newRunner(), "blocks");
    // 86 running minutes in the only logged week; strength does not count.
    expect(blocks[0].weeklyMinutes).toBe(85);
    expect(blocks[0].longMinutes).toBe(41);
  });

  it("builds toward an ultra with cutbacks and a taper", () => {
    const blocks = buildBlocks(newRunner(), "blocks");
    const training = blocks.filter(
      (b) => !["taper", "recovery"].includes(b.phase),
    );
    const peak = Math.max(...training.map((b) => b.weeklyMinutes));
    const longest = Math.max(...training.map((b) => b.longMinutes));
    expect(peak).toBeGreaterThan(300);
    expect(peak).toBeLessThanOrEqual(480);
    expect(longest).toBeGreaterThanOrEqual(150);
    expect(longest).toBeLessThanOrEqual(240);
    for (const [i, block] of blocks.entries()) {
      if (i === 0) continue;
      const previous = blocks[i - 1];
      if (!block.cutback && !["taper", "recovery"].includes(block.phase))
        expect(block.weeklyMinutes).toBeLessThanOrEqual(
          Math.ceil(
            Math.max(previous.weeklyMinutes, training[0].weeklyMinutes) * 1.4,
          ),
        );
      if (block.cutback)
        expect(block.weeklyMinutes).toBeLessThan(previous.weeklyMinutes);
    }
    expect(training.some((b) => b.cutback)).toBe(true);
    const taper = blocks.filter((b) => b.phase === "taper");
    expect(taper.length).toBeGreaterThan(0);
    expect(
      taper.every((b) => b.weeklyMinutes < peak && b.longMinutes === 0),
    ).toBe(true);
  });

  it("follows an explicit weekly volume when the athlete has set one", () => {
    const service = newRunner();
    service.updateAthlete({ weeklyMinutes: 240 }, "weekly");
    expect(buildBlocks(service, "blocks")[0].weeklyMinutes).toBe(240);
  });
});

describe("the proposed training week", () => {
  it("fits a new runner's week instead of filling every day", () => {
    const service = newRunner();
    const week = trainingProposal(service, 9, "week");
    const training = week.filter((s) => s.intent !== "rest");
    // This week's volume is already done; next week holds three or four runs.
    expect(
      week
        .filter((s) => s.date <= "2026-10-11")
        .every((s) => s.intent === "rest"),
    ).toBe(true);
    const next = training.filter((s) => s.date >= "2026-10-12");
    expect(next.length).toBeGreaterThanOrEqual(3);
    expect(next.length).toBeLessThanOrEqual(4);
    expect(next.every((s) => s.durationSeconds >= 20 * 60)).toBe(true);
    const long = next.find((s) => s.intent === "long")!;
    expect(long.date).toBe("2026-10-17");
    expect(long.durationSeconds).toBeGreaterThan(31 * 60);
    expect(long.durationSeconds).toBeLessThanOrEqual(51 * 60);
    // No ultra back-to-backs before the long run is substantial.
    expect(week.some((s) => s.intent === "back-to-back")).toBe(false);
    const total = next.reduce((sum, s) => sum + s.durationSeconds / 60, 0);
    expect(total).toBeLessThanOrEqual(95);
    expect(total).toBeGreaterThanOrEqual(75);
    // The guardrails accept the proposal.
    expect(() => service.proposeWeek(week, "save")).not.toThrow();
  });

  it("sizes a week the window cuts short as a full week", () => {
    // Fourteen days end on Friday 10/23, before that week's long run.
    const week = trainingProposal(newRunner(), 14, "week");
    const partial = week.filter(
      (s) => s.date >= "2026-10-19" && s.intent !== "rest",
    );
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.every((s) => s.durationSeconds <= 30 * 60)).toBe(true);
  });

  it("adds an easy back-to-back day once the ultra build is underway", () => {
    const service = newRunner();
    service.updateAthlete(
      { weeklyMinutes: 360, longestRunMinutes: 150 },
      "experienced",
    );
    // Move the race closer so this week is in the build phase.
    const race = service.races()[0];
    service.saveRace(
      { ...race, date: addDays("2026-10-10", 90) },
      race.id,
      "race-sooner",
    );
    const week = trainingProposal(service, 9, "week");
    const long = week.find((s) => s.intent === "long")!;
    const second = week.find((s) => s.intent === "back-to-back")!;
    expect(second.date).toBe(addDays(long.date, 1));
    expect(second.durationSeconds).toBeLessThan(long.durationSeconds);
    expect(second.linkedDate).toBe(long.date);
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
