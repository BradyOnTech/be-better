import { afterEach, describe, expect, it } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { phaseFor } from "./planning.js";
import { phaseForDate } from "../../../packages/domain/src/index.js";
import { openDatabase } from "./db.js";
import { CoachService } from "./service.js";
import { guidedReply } from "./guided.js";
import { streamCoach } from "./coach.js";
import type { PlanInput } from "../../../packages/domain/src/index.js";

const databases: ReturnType<typeof openDatabase>[] = [];
function setup() {
  const database = openDatabase(":memory:");
  databases.push(database);
  return new CoachService(database, () => new Date("2026-10-06T17:00:00Z"));
}
afterEach(() => {
  databases.splice(0).forEach((database) => {
    if (database.sqlite.open) database.sqlite.close();
  });
});

const session = (patch: Partial<PlanInput> = {}): PlanInput => ({
  date: "2026-10-07",
  sport: "run",
  intent: "easy",
  durationSeconds: 1800,
  rpeTarget: 3,
  title: "Easy run",
  prescription: "30 minutes at RPE 3.",
  reason: "Keep the week easy.",
  ...patch,
});

describe("program examples in the coach", () => {
  it("keeps the block phase and the library phase on one calendar", () => {
    expect(phaseFor("2026-10-06", null)).toBe(phaseForDate("2026-10-06", null));
    expect(
      phaseFor("2026-10-06", {
        id: "race",
        name: "City",
        sport: "run",
        date: "2026-12-15",
        distanceMetres: 42195,
        elevationGainMetres: null,
        priority: "A",
        goal: "",
        terrainNotes: "",
        createdAt: "2026-10-06T00:00:00.000Z",
      }),
    ).toBe("build");
  });

  it("refuses the modifications the examples already warn against", () => {
    const injured = setup();
    injured.updateAthlete(
      { constraint: "injury", longestRunMinutes: 60, weeklyMinutes: 180 },
      "injury",
    );
    expect(() =>
      injured.proposePlan(
        [session({ date: "2026-10-08", intent: "quality", rpeTarget: 7 })],
        "hard-while-hurt",
      ),
    ).toThrow(/injury flag/i);

    const jumper = setup();
    jumper.updateAthlete({ longestRunMinutes: 60 }, "baseline");
    expect(() =>
      jumper.proposePlan(
        [session({ intent: "long", durationSeconds: 5400, rpeTarget: 4 })],
        "jump",
      ),
    ).toThrow(/within 20 minutes/i);

    const stacked = setup();
    stacked.updateAthlete({ longestRunMinutes: 80 }, "baseline");
    stacked.proposePlan(
      [session({ intent: "long", durationSeconds: 4800, rpeTarget: 4 })],
      "long-day",
    );
    expect(() =>
      stacked.proposePlan(
        [session({ date: "2026-10-08", intent: "quality", rpeTarget: 7 })],
        "next-day",
      ),
    ).toThrow(/recover/i);

    const taper = setup();
    taper.updateAthlete({ longestRunMinutes: 120 }, "baseline");
    taper.saveRace(
      {
        name: "City marathon",
        sport: "run",
        date: "2026-10-11",
        distanceMetres: 42195,
        elevationGainMetres: 100,
        priority: "A",
        goal: "Finish",
        terrainNotes: "Road.",
      },
      null,
      "race",
    );
    expect(() =>
      taper.proposePlan(
        [session({ date: "2026-10-09", intent: "long", durationSeconds: 3600, rpeTarget: 4 })],
        "race-week-long",
      ),
    ).toThrow(/final week/i);
  });

  it("names the reference pattern when guided mode proposes a week", () => {
    const service = setup();
    const reply = guidedReply(service, "Plan my week", "week");
    expect(reply.text).toContain("First consistency block");
    expect(reply.text).toMatch(/only as a reference/i);
    expect(reply.text).toContain("Short conversational run");
    expect(reply.text).toContain("Steps:");
  });

  it("puts the matching example in the model prompt and offers the lookup tool", async () => {
    const service = setup();
    service.mode = { mode: "model", model: "test-model" };
    service.updateAthlete(
      { weeklyMinutes: 180, longestRunMinutes: 50 },
      "background",
    );
    service.saveRace(
      {
        name: "City marathon",
        sport: "run",
        date: "2026-12-15",
        distanceMetres: 42195,
        elevationGainMetres: 120,
        priority: "A",
        goal: "Finish",
        terrainNotes: "Rolling road.",
      },
      null,
      "race",
    );
    const usage = {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    };
    const model = new MockLanguageModelV4({
      doStream: [
        {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "answer" },
              { type: "text-delta", id: "answer", delta: "Noted." },
              { type: "text-end", id: "answer" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage,
              },
            ],
            chunkDelayInMs: 0,
          }),
        },
      ],
    });
    const streamed = await streamCoach(
      service,
      [
        {
          id: "ask",
          role: "user",
          parts: [{ type: "text", text: "What should this week look like?" }],
        },
      ],
      "turn-programs",
      model,
    );
    if (!("text" in streamed)) throw new Error("Expected the model stream.");
    await streamed.text;
    const prompt = JSON.stringify(model.doStreamCalls);
    expect(prompt).toContain("marathon-novice");
    expect(prompt).toContain("get_program_examples");
    expect(prompt).toContain("Four-day first marathon");
    expect(prompt).toContain("Long easy run");
    expect(prompt).toContain("About 60 minutes");
    expect(prompt).toContain("Steps:");
  });
});
