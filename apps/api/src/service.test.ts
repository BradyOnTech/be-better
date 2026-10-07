import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase } from "./db.js";
import { CoachService } from "./service.js";
import { createApp } from "./app.js";
import { guidedReply } from "./guided.js";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import {
  addDays,
  dateInTimezone,
  type ActivityInput,
  type PlanInput,
} from "../../../packages/domain/src/index.js";

const databases: ReturnType<typeof openDatabase>[] = [];
const folders: string[] = [];
function setup(path = ":memory:") {
  const database = openDatabase(path);
  databases.push(database);
  return new CoachService(database, () => new Date("2026-10-06T17:00:00Z"));
}
afterEach(() => {
  databases.splice(0).forEach((database) => {
    if (database.sqlite.open) database.sqlite.close();
  });
  folders
    .splice(0)
    .forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});
const workout = (patch: Partial<ActivityInput> = {}): ActivityInput => ({
  date: "2026-10-06",
  sport: "run",
  durationSeconds: 3000,
  distanceMetres: null,
  rpe: 3,
  intent: "easy",
  feel: null,
  pain: null,
  ...patch,
});
const session = (patch: Partial<PlanInput> = {}): PlanInput => ({
  date: "2026-10-07",
  sport: "run",
  intent: "easy",
  durationSeconds: 1800,
  rpeTarget: 3,
  title: "Easy run",
  prescription: "30 minutes at RPE 3.",
  reason: "Keep building consistency.",
  ...patch,
});

describe("the log, plan, and coaching loop", () => {
  it("persists independent preferences across a database reopen", () => {
    const folder = mkdtempSync(join(tmpdir(), "be-better-"));
    folders.push(folder);
    const path = join(folder, "log.sqlite");
    const first = setup(path);
    first.updateAthlete({ longRunDay: 5, name: "Alex" }, "preference-1");
    first.updateAthlete({ restDays: [1] }, "preference-2");
    first.updateAthlete({ longRunDay: 6 }, "preference-3");
    first.database.sqlite.close();
    const reloaded = setup(path);
    expect(reloaded.athlete()).toMatchObject({
      longRunDay: 6,
      restDays: [1],
      name: "Alex",
    });
    expect(
      reloaded.notes().filter((note) => note.key === "longRunDay"),
    ).toHaveLength(2);
  });
  it("logs a typed workout exactly once when a write is retried", () => {
    const service = setup();
    const one = service.logActivity(workout(), "same-request");
    const retry = service.logActivity(workout(), "same-request");
    expect(retry.id).toBe(one.id);
    expect(service.activities()).toHaveLength(1);
    expect(service.state().stats.weeklySeconds).toBe(3000);
    expect(() =>
      service.logActivity(workout({ durationSeconds: 1200 }), "same-request"),
    ).toThrow("already used");
  });
  it("refuses quality after an actually completed hard ride", () => {
    const service = setup();
    service.logActivity(workout({ sport: "bike", rpe: 8 }), "ride");
    expect(() =>
      service.proposePlan(
        [session({ intent: "quality", rpeTarget: 7 })],
        "plan",
      ),
    ).toThrow("between hard sessions");
    expect(service.plan()).toHaveLength(0);
  });
  it("checks a whole batch atomically, including hills and high effort labeled easy", () => {
    const service = setup();
    expect(() =>
      service.proposePlan(
        [
          session({ intent: "hills", rpeTarget: 7 }),
          session({ date: "2026-10-08", intent: "easy", rpeTarget: 8 }),
        ],
        "batch",
      ),
    ).toThrow("between hard sessions");
    expect(service.plan()).toHaveLength(0);
  });
  it("counts quality across both sports in the athlete’s Monday–Sunday week", () => {
    const service = setup();
    service.proposePlan(
      [
        session({ intent: "quality", rpeTarget: 7 }),
        session({
          date: "2026-10-09",
          sport: "bike",
          intent: "quality",
          rpeTarget: 7,
        }),
      ],
      "first-two",
    );
    expect(() =>
      service.proposePlan(
        [session({ date: "2026-10-11", intent: "quality", rpeTarget: 7 })],
        "third",
      ),
    ).toThrow("more than two");
    expect(service.plan()).toHaveLength(2);
  });
  it("protects rest days and blocks high effort while injured", () => {
    const service = setup();
    service.updateAthlete({ restDays: [3], constraint: "injury" }, "settings");
    expect(() => service.proposePlan([session()], "restday")).toThrow(
      "rest days",
    );
    expect(() =>
      service.proposePlan(
        [session({ date: "2026-10-08", intent: "easy", rpeTarget: 8 })],
        "injury",
      ),
    ).toThrow("injury flag");
  });
  it("uses a known long-run baseline and refuses a large jump", () => {
    const service = setup();
    expect(() =>
      service.proposePlan([session({ intent: "long" })], "unknown"),
    ).toThrow("recent longest run");
    service.updateAthlete({ longestRunMinutes: 60 }, "baseline");
    expect(() =>
      service.proposePlan(
        [session({ intent: "long", durationSeconds: 5400 })],
        "jump",
      ),
    ).toThrow("within 20 minutes");
    expect(
      service.proposePlan(
        [session({ intent: "long", durationSeconds: 4200 })],
        "small-step",
      )[0].intent,
    ).toBe("long");
  });
  it.each([
    "Run at 4:30/km.",
    "Ride at 200 watts.",
    "Keep heart rate at 150 bpm.",
    "Run at marathon pace.",
  ])("rejects an unsupported target in a prescription: %s", (prescription) => {
    const service = setup();
    expect(() =>
      service.proposePlan([session({ prescription })], "target"),
    ).toThrow("Use an RPE target");
    expect(service.plan()).toHaveLength(0);
  });
  it("records why an accepted session changed and prevents stale edits", () => {
    const service = setup();
    const proposed = service.proposePlan([session()], "proposal")[0];
    const accepted = service.acceptPlan([proposed.id], "accept")[0];
    const moved = service.reviseSession(
      accepted.id,
      session({ date: "2026-10-08", reason: "A late work meeting." }),
      accepted.version,
      "move",
    );
    expect(moved.status).toBe("accepted");
    expect(service.notes()[0]).toMatchObject({
      kind: "decision",
      sessionId: accepted.id,
      previous: accepted,
    });
    expect(service.notes()[0].text).toContain("A late work meeting");
    expect(() =>
      service.reviseSession(accepted.id, session(), accepted.version, "stale"),
    ).toThrow("has changed");
  });
  it("requires an explicit workout outcome and keeps the prescription as history", () => {
    const service = setup();
    const planned = service.proposePlan(
      [session({ date: service.today() })],
      "proposal",
    )[0];
    service.acceptPlan([planned.id], "accept");
    const activity = service.logActivity(workout(), "complete");
    expect(activity.planSessionId).toBeNull();
    const accepted = service.session(planned.id);
    expect(accepted.status).toBe("accepted");
    expect(service.state().planReviews).toHaveLength(1);
    const reviewed = service.resolveActivityPlan(
      activity.id,
      {
        outcome: "modified",
        sessionId: accepted.id,
        version: accepted.version,
        reason: "I kept the easy effort and ran longer.",
      },
      "review",
    );
    expect(reviewed.planSessionId).toBe(planned.id);
    const done = service.session(planned.id);
    expect(done.outcome).toBe("modified");
    expect(done.status).toBe("done");
    expect(done.durationSeconds).toBe(1800);
    expect(activity.durationSeconds).toBe(3000);
    expect(() =>
      service.reviseSession(done.id, session(), done.version, "rewrite"),
    ).toThrow("history");
  });
  it("marks a missed session without silently scheduling make-up work", () => {
    const service = setup();
    const proposed = service.proposePlan([session()], "propose")[0];
    const accepted = service.acceptPlan([proposed.id], "accept")[0];
    service.skipSession(
      accepted.id,
      "Work ran late.",
      accepted.version,
      "skip",
    );
    expect(service.session(accepted.id).status).toBe("skipped");
    expect(service.plan()).toHaveLength(1);
    expect(service.notes()[0].text).toContain("Work ran late");
  });
  it("excludes draft activities from training totals and long-run baselines", () => {
    const service = setup();
    const draft = {
      ...workout({ durationSeconds: 18000 }),
      id: "draft",
      confirmed: false,
      source: "photo" as const,
      createdAt: service.now().toISOString(),
      planSessionId: null,
    };
    service.database.sqlite
      .prepare(
        "INSERT INTO activities (id,date,confirmed,source,data) VALUES (?,?,?,?,?)",
      )
      .run(draft.id, draft.date, 0, draft.source, JSON.stringify(draft));
    expect(service.state().stats.weeklySeconds).toBe(0);
    expect(() =>
      service.proposePlan([session({ intent: "long" })], "draft-baseline"),
    ).toThrow("recent longest run");
  });
  it("keeps local dates correct across UTC midnight and DST", () => {
    expect(
      dateInTimezone(new Date("2026-10-07T02:00:00Z"), "America/Chicago"),
    ).toBe("2026-10-06");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
  it("provides an honest guided loop without a model", () => {
    const service = setup();
    expect(guidedReply(service, "Long run on Friday", "prefs").text).toContain(
      "Friday",
    );
    guidedReply(service, "I ran 50 minutes easy, RPE 3", "workout");
    expect(service.activities()[0]).toMatchObject({
      durationSeconds: 3000,
      rpe: 3,
    });
    expect(
      guidedReply(service, "Plan the next three days", "plan").actions[0].name,
    ).toBe("propose_plan");
    expect(
      guidedReply(service, "Give me two hard days back to back", "hard").text,
    ).toContain("between hard sessions");
  });
  it("plans from tomorrow after a completed workout and leaves recovery in a week", () => {
    const service = setup();
    service.logActivity(workout(), "run");
    const plan = service.makeEasyPlan(7);
    expect(plan[0].date).toBe("2026-10-07");
    expect(plan).toHaveLength(7);
    expect(plan.find((day) => day.date === "2026-10-11")?.intent).toBe("rest");
    expect(() => service.proposePlan(plan, "week")).not.toThrow();
  });
  it("does not treat an explicit absence of pain as an injury", () => {
    const service = setup();
    guidedReply(service, "No pain and not injured", "health");
    expect(service.athlete().constraint).toBe("none");
    guidedReply(service, "I ran 30 minutes easy, RPE 3, no pain", "run");
    expect(service.activities()[0].pain).toBeNull();
    guidedReply(service, "No pain in my feet, but my knee hurts", "concern");
    expect(service.athlete().constraint).toBe("injury");
  });
});

describe("HTTP and chat persistence", () => {
  it("executes a model tool, persists its result, and replays it without a second model call", async () => {
    const service = setup();
    service.mode = { mode: "model", model: "test-model" };
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
              {
                type: "tool-call",
                toolCallId: "log-call",
                toolName: "log_activity",
                input: JSON.stringify(workout()),
              },
              {
                type: "finish",
                finishReason: { unified: "tool-calls", raw: undefined },
                usage,
              },
            ],
            chunkDelayInMs: 0,
          }),
        },
        {
          stream: simulateReadableStream({
            chunks: [
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "answer" },
              {
                type: "text-delta",
                id: "answer",
                delta: "Your 50-minute run is saved.",
              },
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
    const app = createApp(service, "", model);
    const send = () =>
      app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            id: "model-run",
            role: "user",
            parts: [{ type: "text", text: "I ran 50 minutes easy, RPE 3" }],
          },
        }),
      });
    const first = await send();
    const stream = await first.text();
    expect(stream).toContain("Your 50-minute run is saved");
    expect(service.activities()).toHaveLength(1);
    expect(
      service
        .messages()[1]
        .parts.some((part) => part.type === "tool-log_activity"),
    ).toBe(true);
    const replayed = await send();
    expect(await replayed.text()).toContain("tool-output-available");
    expect(model.doStreamCalls).toHaveLength(2);
    expect(service.activities()).toHaveLength(1);
    expect(
      model.doStreamCalls[0].tools?.some(
        (tool) =>
          tool.name === "accept_plan" || tool.name === "confirm_activity",
      ),
    ).toBe(false);
  });
  it("uses the same mutation path for forms and chat, and replays a completed turn", async () => {
    const service = setup();
    const app = createApp(service, "");
    const message = {
      id: "typed-run",
      role: "user",
      parts: [{ type: "text", text: "I ran 50 minutes easy, RPE 3" }],
    };
    const send = () =>
      app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
    const first = await send();
    expect(first.status).toBe(200);
    const stream = await first.text();
    expect(stream).toContain("log_activity");
    expect(stream).toContain("50 min");
    const retry = await send();
    expect(await retry.text()).toContain("50 min");
    expect(service.activities()).toHaveLength(1);
    expect(service.messages()).toHaveLength(2);
    const snapshot = await app.request("/api/state");
    expect((await snapshot.json()).stats.weeklySeconds).toBe(3000);
  });
  it("authenticates reads and writes while leaving health checks available", async () => {
    const app = createApp(setup(), "a-personal-token");
    expect((await app.request("/api/state")).status).toBe(401);
    expect((await app.request("/api/health")).status).toBe(200);
    expect(
      (
        await app.request("/api/state", {
          headers: { Authorization: "Bearer a-personal-token" },
        })
      ).status,
    ).toBe(200);
  });
  it("rejects invalid manual entries rather than trusting the client", async () => {
    const service = setup();
    const app = createApp(service, "");
    const response = await app.request("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationId: "invalid",
        activity: workout({ rpe: 100 }),
      }),
    });
    expect(response.status).toBe(400);
    expect(service.activities()).toHaveLength(0);
  });
});
