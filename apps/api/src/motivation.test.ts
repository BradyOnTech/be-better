import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "./db.js";
import { CoachService } from "./service.js";
import { createApp } from "./app.js";
import type { ActivityInput } from "../../../packages/domain/src/index.js";

const databases: ReturnType<typeof openDatabase>[] = [];
function setup() {
  const database = openDatabase(":memory:");
  databases.push(database);
  return new CoachService(database, () => new Date("2026-10-06T17:00:00Z"));
}
afterEach(() => {
  databases.splice(0).forEach((database) => database.sqlite.close());
});
const workout = (patch: Partial<ActivityInput>): ActivityInput => ({
  date: "2026-10-06",
  sport: "run",
  durationSeconds: 1800,
  distanceMetres: null,
  rpe: 4,
  intent: "easy",
  feel: null,
  pain: null,
  ...patch,
});

describe("motivation", () => {
  it("finds receipts across the whole log, not only recent weeks", () => {
    const service = setup();
    expect(service.state().motivation.records.sessions).toBe(0);
    service.logActivity(
      workout({
        date: "2026-03-01",
        durationSeconds: 9000,
        distanceMetres: 30000,
        intent: "long",
      }),
      "long",
    );
    service.logActivity(
      workout({
        date: "2026-09-24",
        sport: "trail",
        durationSeconds: 4500,
        elevationGainMetres: 900,
        rpe: 9,
      }),
      "climb",
    );
    service.logActivity(
      workout({ date: "2026-09-30", elevationGainMetres: 300 }),
      "hill",
    );
    service.logActivity(workout({ date: "2026-10-06", rpe: 8 }), "today");
    const records = service.state().motivation.records;
    expect(records).toMatchObject({
      sessions: 4,
      seconds: 9000 + 4500 + 1800 + 1800,
      distanceMetres: 30000,
      climbMetres: 1200,
      streak: { weeks: 3, since: "2026-09-21", thisWeek: true },
    });
    expect(records.longest?.date).toBe("2026-03-01");
    expect(records.biggestClimb?.date).toBe("2026-09-24");
    expect(records.hardest?.rpe).toBe(9);
  });
  it("keeps a streak alive until the current week ends", () => {
    const service = setup();
    service.logActivity(workout({ date: "2026-09-25" }), "one");
    service.logActivity(workout({ date: "2026-10-02" }), "two");
    expect(service.state().motivation.records.streak).toEqual({
      weeks: 2,
      since: "2026-09-21",
      thisWeek: false,
    });
  });
  it("writes, keeps, and removes the athlete's own cards", () => {
    const service = setup();
    const card = service.motivation.saveCard(
      { front: "Earn the *coffee*.", back: "", mood: "dawn" },
      null,
      "write",
    );
    expect(
      service.motivation.saveCard(
        { front: "Earn the *coffee*.", back: "", mood: "dawn" },
        null,
        "write",
      ).id,
    ).toBe(card.id);
    const edited = service.motivation.saveCard(
      { front: "Earn the *breakfast*.", back: "Then eat it.", mood: "moss" },
      card.id,
      "edit",
    );
    expect(edited).toMatchObject({ id: card.id, createdAt: card.createdAt });
    service.motivation.keep({ cardId: "same-things", kept: true }, "k1");
    service.motivation.keep({ cardId: card.id, kept: true }, "k2");
    expect(service.state().motivation).toMatchObject({
      cards: [{ front: "Earn the *breakfast*.", back: "Then eat it." }],
      kept: expect.arrayContaining(["same-things", card.id]),
    });
    expect(() =>
      service.motivation.keep({ cardId: "made-up", kept: true }, "k3"),
    ).toThrow("That card was not found.");
    service.motivation.deleteCard(card.id, "delete");
    expect(service.state().motivation).toMatchObject({
      cards: [],
      kept: ["same-things"],
    });
    service.motivation.keep({ cardId: "same-things", kept: false }, "k4");
    expect(service.state().motivation.kept).toEqual([]);
  });
  it("validates cards over HTTP and returns them in the app state", async () => {
    const service = setup();
    const app = createApp(service, "");
    const post = (card: unknown, operationId: string) =>
      app.request("/api/motivation/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, operationId }),
      });
    expect(
      (await post({ front: " ", back: "", mood: "dawn" }, "blank")).status,
    ).toBe(400);
    expect(
      (await post({ front: "Go.", back: "", mood: "neon" }, "mood")).status,
    ).toBe(400);
    expect(
      (await post({ front: "Go *now*.", back: "", mood: "night" }, "ok"))
        .status,
    ).toBe(201);
    const state = await (await app.request("/api/state")).json();
    expect(state.motivation.cards[0].front).toBe("Go *now*.");
  });
});
