import { describe, expect, it } from "vitest";
import { trainingBaseline } from "./baseline.js";

const run = (date: string, minutes: number, sport = "run") => ({
  date,
  sport,
  durationSeconds: minutes * 60,
  confirmed: true,
});

describe("the training baseline", () => {
  it("uses stated background when the log has not caught up", () => {
    const baseline = trainingBaseline({
      today: "2026-10-10",
      athlete: {
        weeklyMinutes: 180,
        longestRunMinutes: 65,
        backgroundDate: "2026-10-10",
      },
      activities: [run("2026-10-06", 25), run("2026-10-08", 31)],
    });
    expect(baseline.weeklyMinutes).toBe(180);
    expect(baseline.longestRunMinutes).toBe(65);
    expect(baseline.logged.weeklyMinutes).toBe(56);
  });

  it("does not divide one logged week as if it were four", () => {
    const baseline = trainingBaseline({
      today: "2026-10-10",
      athlete: { weeklyMinutes: null, longestRunMinutes: null },
      activities: [
        run("2026-10-06", 25),
        run("2026-10-07", 31),
        run("2026-10-07", 40, "strength"),
        run("2026-10-08", 30),
      ],
    });
    expect(baseline.weeklyMinutes).toBe(86);
    expect(baseline.logged.weeks).toBe(1);
  });

  it("lets an older stated number give way to a well-covered log", () => {
    const activities = [
      run("2026-09-20", 50),
      run("2026-09-27", 60),
      run("2026-10-01", 40),
      run("2026-10-03", 40),
    ];
    const old = trainingBaseline({
      today: "2026-10-06",
      athlete: {
        weeklyMinutes: 600,
        longestRunMinutes: 180,
        backgroundDate: "2026-07-01",
      },
      activities,
    });
    expect(old.reported.stale).toBe(true);
    expect(old.weeklyMinutes).toBeLessThan(200);
    const recent = trainingBaseline({
      today: "2026-10-06",
      athlete: {
        weeklyMinutes: 300,
        longestRunMinutes: 90,
        backgroundDate: "2026-10-01",
      },
      activities,
    });
    expect(recent.weeklyMinutes).toBe(300);
  });
});
