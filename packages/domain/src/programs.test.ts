import { describe, expect, it } from "vitest";
import {
  describeWorkout,
  exampleWorkouts,
  workoutHold,
  phaseForDate,
  programEvents,
  programLibrary,
  programQueryFromContext,
  renderProgramContext,
  retrievePrograms,
  type ProgramQuery,
} from "./programs.js";

const top = (query: ProgramQuery) => retrievePrograms(query).map((item) => item.id);

describe("program library", () => {
  it("covers the sports this coach plans, and stores no published week", () => {
    const covered = new Set(programLibrary.flatMap((pattern) => pattern.events));
    for (const event of programEvents) expect(covered.has(event)).toBe(true);
    const text = JSON.stringify(programLibrary);
    expect(text).not.toMatch(/WEEK \d|Monday|3 mi run|6 x \(200m|2x20/);
    for (const pattern of programLibrary) {
      expect(pattern.purpose.length).toBeGreaterThan(40);
      expect(pattern.athlete.length).toBeGreaterThan(40);
      expect(pattern.progression.length).toBeGreaterThan(40);
      expect(pattern.recovery.length).toBeGreaterThan(20);
      expect(pattern.modifications.length).toBeGreaterThan(1);
      expect(pattern.sources.every((source) => source.url.startsWith("https://"))).toBe(
        true,
      );
    }
  });

  it("uses the same phase boundaries as the race block", () => {
    expect(phaseForDate("2026-10-06", null)).toBe("base");
    expect(phaseForDate("2026-10-06", "2026-10-11")).toBe("taper");
    expect(phaseForDate("2026-10-06", "2026-11-15")).toBe("specific");
    expect(phaseForDate("2026-10-06", "2026-12-20")).toBe("build");
    expect(phaseForDate("2026-10-06", "2027-02-06")).toBe("base");
    expect(phaseForDate("2026-10-06", "2026-10-04")).toBe("recovery");
    expect(phaseForDate("2026-10-06", "2026-09-01")).toBe("base");
  });
});

describe("realistic coaching scenarios", () => {
  it("gives a first marathon the four-day pattern, not the heavy specific block", () => {
    const query: ProgramQuery = {
      event: "marathon",
      phase: "build",
      experience: "new",
      sports: ["run"],
      weeklyMinutes: 180,
      distanceMetres: 42195,
      longestMinutes: 50,
    };
    expect(top(query)[0]).toBe("marathon-novice");
    expect(top(query)).not.toContain("ultra-long");
    const text = renderProgramContext(query);
    expect(text).toContain("at most 20 minutes");
    expect(text).toContain("Four-day first marathon");
    expect(text.indexOf("20 minutes")).toBeLessThan(text.indexOf("Four-day"));
  });

  it("gives an experienced marathoner the phased specific pattern", () => {
    expect(
      top({
        event: "marathon",
        phase: "specific",
        experience: "experienced",
        sports: ["run"],
        weeklyMinutes: 480,
        distanceMetres: 42195,
        longestMinutes: 150,
      })[0],
    ).toBe("marathon-phased");
  });

  it("keeps a first half marathon off the marathon long run", () => {
    const ids = top({
      event: "half-marathon",
      phase: "build",
      experience: "new",
      sports: ["run"],
      weeklyMinutes: 150,
      distanceMetres: 21098,
      longestMinutes: 40,
      horizonWeeks: 12,
    });
    expect(ids[0]).toBe("half-novice");
    expect(ids).not.toContain("marathon-phased");
  });

  it("gives a fitter half marathoner one steady session, not a 20-mile long run", () => {
    const [first] = retrievePrograms({
      event: "half-marathon",
      phase: "specific",
      experience: "experienced",
      sports: ["run"],
      weeklyMinutes: 300,
      distanceMetres: 21098,
      longestMinutes: 100,
    });
    expect(first.id).toBe("half-developing");
    expect(first.modifications.join(" ")).toMatch(/not borrow a marathon long run/i);
  });

  it("keeps a first 50K to time on feet, without a back-to-back", () => {
    const [first] = retrievePrograms({
      event: "ultra",
      phase: "build",
      experience: "developing",
      sports: ["trail"],
      weeklyMinutes: 300,
      distanceMetres: 50000,
      longestMinutes: 100,
    });
    expect(first.id).toBe("ultra-first");
    expect(first.modifications.join(" ")).toMatch(/back-to-back/i);
    expect(first.modifications.join(" ")).toMatch(/do not run the 50K/i);
  });

  it("uses a back-to-back for a long ultra and keeps the second day easy", () => {
    const [first] = retrievePrograms({
      event: "ultra",
      phase: "specific",
      experience: "experienced",
      sports: ["trail"],
      weeklyMinutes: 500,
      distanceMetres: 100000,
      longestMinutes: 180,
    });
    expect(first.id).toBe("ultra-long");
    expect(first.recovery).toMatch(/easy/i);
    expect(first.modifications.join(" ")).toMatch(/never a quality/i);
  });

  it("trains a trail marathon by terrain, not by a road pace table", () => {
    expect(
      top({
        event: "trail",
        phase: "specific",
        experience: "developing",
        sports: ["trail"],
        weeklyMinutes: 300,
        distanceMetres: 42195,
        longestMinutes: 120,
      })[0],
    ).toBe("trail-race");
  });

  it("plans a road sportive as cycling endurance", () => {
    const ids = top({
      event: "road-bike",
      phase: "build",
      experience: "developing",
      sports: ["bike"],
      weeklyMinutes: 420,
    });
    expect(ids[0]).toBe("road-endurance");
    expect(ids).not.toContain("marathon-novice");
  });

  it("plans a mountain-bike event around skills and one intense day", () => {
    const [first] = retrievePrograms({
      event: "mountain-bike",
      phase: "build",
      experience: "developing",
      sports: ["bike"],
      weeklyMinutes: 300,
    });
    expect(first.id).toBe("mountain-bike");
    expect(first.modifications.join(" ")).toMatch(/skills/i);
  });

  it("uses an eight-week hike build, and a long horizon for a thru-hike", () => {
    expect(
      top({
        event: "hike",
        phase: "build",
        experience: "new",
        sports: ["walk"],
        weeklyMinutes: 180,
        horizonWeeks: 8,
      })[0],
    ).toBe("hike-objective");
    expect(
      top({
        event: "hike",
        phase: "base",
        experience: "developing",
        sports: ["walk"],
        weeklyMinutes: 400,
        horizonWeeks: 26,
      })[0],
    ).toBe("thru-hike");
  });

  it("puts the weeks after a race on the return pattern", () => {
    expect(
      top({
        event: "marathon",
        phase: "recovery",
        experience: "developing",
        sports: ["run"],
        weeklyMinutes: 40,
        longestMinutes: 180,
      })[0],
    ).toBe("post-race");
  });

  it("lets an injury, a niggle, travel, a cutback, and a taper override the example", () => {
    const injury = renderProgramContext({
      event: "marathon",
      phase: "build",
      experience: "new",
      sports: ["run"],
      weeklyMinutes: 180,
      constraint: "injury",
      longestMinutes: 60,
    });
    expect(injury).toMatch(/rest, easy movement, or suitable strength/i);
    expect(injury.indexOf("injury flag")).toBeLessThan(injury.indexOf("Four-day"));
    expect(
      renderProgramContext({
        event: "trail",
        phase: "build",
        experience: "developing",
        sports: ["trail"],
        constraint: "niggle",
        longestMinutes: 90,
      }),
    ).toMatch(/drop hills, speed, and downhills/i);
    expect(
      renderProgramContext({
        event: "marathon",
        phase: "build",
        experience: "developing",
        sports: ["run"],
        constraint: "travel",
        longestMinutes: 90,
      }),
    ).toMatch(/do not stack missed days/i);
    expect(
      renderProgramContext({
        event: "marathon",
        phase: "build",
        experience: "developing",
        sports: ["run"],
        cutback: true,
        longestMinutes: 90,
      }),
    ).toMatch(/80 percent/i);
    expect(
      renderProgramContext({
        event: "marathon",
        phase: "taper",
        experience: "developing",
        sports: ["run"],
        longestMinutes: 150,
      }),
    ).toMatch(/race week has no long session/i);
  });

  it("asks for volume when the log and the background are both empty", () => {
    expect(
      renderProgramContext({ event: "base", phase: "base", experience: "new", sports: ["run"] }),
    ).toMatch(/usual weekly volume/i);
  });

  it("reads a marathon build from the athlete, the race, and the block", () => {
    const query = programQueryFromContext({
      today: "2026-10-06",
      athlete: {
        weeklyMinutes: 180,
        longestRunMinutes: 50,
        constraint: "none",
      },
      block: { phase: "build", cutback: false },
      races: [
        {
          name: "City marathon",
          sport: "run",
          date: "2026-12-15",
          distanceMetres: 42195,
          elevationGainMetres: 150,
          priority: "A",
          terrainNotes: "Road.",
        },
      ],
      activities: [],
    });
    expect(query).toMatchObject({
      event: "marathon",
      phase: "build",
      experience: "new",
      weeklyMinutes: 180,
      longestMinutes: 50,
    });
    expect(top(query)[0]).toBe("marathon-novice");
  });

  it("treats a named mountain-bike race as mountain biking, not a road sportive", () => {
    const query = programQueryFromContext({
      today: "2026-10-06",
      athlete: {
        weeklyMinutes: 300,
        longestRunMinutes: null,
        constraint: "none",
      },
      block: null,
      races: [
        {
          name: "Range MTB",
          sport: "bike",
          date: "2026-12-20",
          distanceMetres: 60000,
          elevationGainMetres: 1200,
          priority: "A",
          terrainNotes: "Singletrack and fire road.",
        },
      ],
      activities: [],
    });
    expect(query.event).toBe("mountain-bike");
    expect(top(query)[0]).toBe("mountain-bike");
  });

  it("prefers logged weeks over a stale background number", () => {
    const query = programQueryFromContext({
      today: "2026-10-06",
      athlete: {
        weeklyMinutes: 600,
        longestRunMinutes: 40,
        constraint: "none",
      },
      block: { phase: "build", cutback: false },
      races: [
        {
          name: "City marathon",
          sport: "run",
          date: "2026-12-15",
          distanceMetres: 42195,
          elevationGainMetres: null,
          priority: "A",
          terrainNotes: "",
        },
      ],
      activities: [
        { sport: "run", date: "2026-10-03", durationSeconds: 2400, confirmed: true },
        { sport: "run", date: "2026-10-01", durationSeconds: 2400, confirmed: true },
        { sport: "run", date: "2026-09-27", durationSeconds: 3600, confirmed: true },
        { sport: "run", date: "2026-09-20", durationSeconds: 3000, confirmed: true },
      ],
    });
    expect(query.weeklyMinutes).toBeLessThan(200);
    expect(query.experience).toBe("new");
  });
});

describe("example workouts", () => {
  const marathon: ProgramQuery = {
    event: "marathon",
    phase: "build",
    experience: "new",
    sports: ["run"],
    weeklyMinutes: 180,
    distanceMetres: 42195,
    longestMinutes: 50,
  };

  it("has original sessions for every pattern, and no published week", () => {
    for (const pattern of programLibrary) {
      expect(exampleWorkouts[pattern.id]?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
    const text = JSON.stringify(exampleWorkouts);
    expect(text).not.toMatch(/WEEK \d|Monday|3 mi run|6 x \(200m|2x20/);
  });

  it("scales a first-marathon long run to the recent longest session", () => {
    const chosen = retrievePrograms(marathon)[0];
    expect(chosen?.id).toBe("marathon-novice");
    const long = chosen?.workouts.find((item) => item.intent === "long");
    expect(long?.name).toBe("Long easy run");
    expect(long?.description).toContain("About 60 minutes");
    expect(long?.description).toContain("cap is 70");
    expect(long?.description).not.toMatch(/20 miles/);
    expect(describeWorkout(long!, marathon)).toBe(long?.description);
  });

  it("keeps only easy, rest, or strength sessions while injured", () => {
    const chosen = retrievePrograms({ ...marathon, constraint: "injury" })[0];
    expect(chosen?.workouts.length).toBeGreaterThan(0);
    for (const item of chosen?.workouts ?? []) {
      expect(["easy", "rest", "strength"]).toContain(item.intent);
    }
    expect(chosen?.workouts.some((item) => item.intent === "long")).toBe(false);
    const long = exampleWorkouts["marathon-novice"]?.find((item) => item.intent === "long");
    expect(workoutHold(long!, { constraint: "injury" })).toMatch(/injury flag/i);
    expect(workoutHold(exampleWorkouts["marathon-novice"]![0]!, { constraint: "injury" })).toBe(
      null,
    );
  });

  it("prints the scaled steps on the closest example", () => {
    const text = renderProgramContext(marathon);
    expect(text).toContain("Steps:");
    expect(text).toContain("Long easy run");
    expect(text).toContain("About 60 minutes");
    expect(text).toContain("Workouts to adapt");
  });
});
