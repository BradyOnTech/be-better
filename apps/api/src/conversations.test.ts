import { afterEach, describe, expect, it } from "vitest";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openDatabase } from "./db.js";
import { CoachService } from "./service.js";
import { createApp } from "./app.js";

const databases: ReturnType<typeof openDatabase>[] = [];
const folders: string[] = [];
afterEach(() => {
  databases.splice(0).forEach(({ sqlite }) => sqlite.close());
  folders
    .splice(0)
    .forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});
function setup() {
  const database = openDatabase(":memory:");
  databases.push(database);
  const service = new CoachService(database);
  return { service, app: createApp(service, "") };
}
const request = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const message = (id: string, text: string) => ({
  id,
  role: "user" as const,
  parts: [{ type: "text" as const, text }],
});

describe("coach conversations", () => {
  it("migrates the existing chat and preserves completed-turn replay", async () => {
    const folder = mkdtempSync(join(tmpdir(), "be-better-legacy-chat-"));
    folders.push(folder);
    const path = join(folder, "legacy.sqlite");
    const legacy = new Database(path);
    legacy.exec("CREATE TABLE schema_migrations (name TEXT PRIMARY KEY)");
    const migrations = resolve("apps/api/migrations");
    for (const name of readdirSync(migrations)
      .filter((name) => name.endsWith(".sql") && name < "006")
      .sort()) {
      legacy.exec(readFileSync(join(migrations, name), "utf8"));
      legacy
        .prepare("INSERT INTO schema_migrations (name) VALUES (?)")
        .run(name);
    }
    const original = message("original", "Discuss my race");
    const reply = {
      id: "original-reply",
      role: "assistant",
      parts: [{ type: "text", text: "Your earlier answer." }],
    };
    legacy
      .prepare("INSERT INTO messages (id, sequence, data) VALUES (?, ?, ?)")
      .run(original.id, 1, JSON.stringify(original));
    legacy
      .prepare("INSERT INTO messages (id, sequence, data) VALUES (?, ?, ?)")
      .run(reply.id, 2, JSON.stringify(reply));
    legacy
      .prepare(
        "INSERT INTO turns (id, text, status, response_id, updated_at) VALUES (?, ?, 'done', ?, ?)",
      )
      .run(original.id, "Discuss my race", reply.id, "2026-10-09T12:00:00Z");
    legacy.close();
    const database = openDatabase(path);
    databases.push(database);
    const service = new CoachService(database);
    const app = createApp(service, "");
    const detail = await (
      await app.request("/api/conversations/default")
    ).json();
    expect(detail.conversation).toMatchObject({
      title: "Earlier conversation",
      messageCount: 2,
    });
    expect(detail.messages).toEqual([original, reply]);
    const replay = await app.request(
      "/api/chat",
      request({ message: original }),
    );
    expect(replay.status).toBe(200);
    expect(await replay.text()).toContain("Your earlier answer");
    expect(service.messages()).toEqual([original, reply]);
  });
  it("starts a separate conversation and preserves earlier messages", async () => {
    const { service, app } = setup();
    service.saveMessage(message("earlier", "Discuss my trail race"));
    const created = await app.request(
      "/api/conversations",
      request({ operationId: "new-chat" }),
    );
    expect(created.status).toBe(200);
    const conversation = await created.json();
    const retry = await app.request(
      "/api/conversations",
      request({ operationId: "new-chat" }),
    );
    expect((await retry.json()).id).toBe(conversation.id);
    const fresh = await app.request(`/api/conversations/${conversation.id}`);
    expect((await fresh.json()).messages).toEqual([]);
    const sent = await app.request(
      "/api/chat",
      request({
        conversationId: conversation.id,
        message: message("fresh", "Help me recover well"),
      }),
    );
    expect(sent.status).toBe(200);
    await sent.text();
    const earlier = await app.request("/api/conversations/default");
    expect((await earlier.json()).messages).toEqual([
      message("earlier", "Discuss my trail race"),
    ]);
    const current = await app.request(`/api/conversations/${conversation.id}`);
    const detail = await current.json();
    expect(detail.messages).toHaveLength(2);
    expect(detail.conversation.title).toBe("Help me recover well");
    expect(await (await app.request("/api/conversations")).json()).toHaveLength(
      2,
    );
    expect(service.activities()).toEqual([]);
    expect(service.plan()).toEqual([]);
  });

  it("does not send another conversation's text to the model", async () => {
    const { service } = setup();
    service.saveMessage(
      message("earlier", "Private topic from an earlier chat"),
    );
    const model = new MockLanguageModelV4({
      doStream: {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "answer" },
            { type: "text-delta", id: "answer", delta: "Let's start here." },
            { type: "text-end", id: "answer" },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: undefined },
              usage: {
                inputTokens: {
                  total: 1,
                  noCache: 1,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
            },
          ],
          chunkDelayInMs: 0,
        }),
      },
    });
    service.mode = { mode: "model", model: "mock" };
    const app = createApp(service, "", model);
    const conversation = await (
      await app.request(
        "/api/conversations",
        request({ operationId: "separate" }),
      )
    ).json();
    const response = await app.request(
      "/api/chat",
      request({
        conversationId: conversation.id,
        message: message("current", "A different topic"),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Let's start here");
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).toContain(
      "A different topic",
    );
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain(
      "Private topic from an earlier chat",
    );
  });

  it("rejects unknown conversations and cross-conversation retries", async () => {
    const { app } = setup();
    const first = message("same-id", "A recovery question");
    const sent = await app.request("/api/chat", request({ message: first }));
    await sent.text();
    const conversation = await (
      await app.request(
        "/api/conversations",
        request({ operationId: "another" }),
      )
    ).json();
    const collision = await app.request(
      "/api/chat",
      request({ conversationId: conversation.id, message: first }),
    );
    expect(collision.status).toBe(409);
    const missing = await app.request(
      "/api/chat",
      request({
        conversationId: "missing",
        message: message("missing", "Hello"),
      }),
    );
    expect(missing.status).toBe(404);
    const replay = await app.request("/api/chat", request({ message: first }));
    expect(replay.status).toBe(200);
    await replay.text();
    const fresh = await app.request(`/api/conversations/${conversation.id}`);
    expect((await fresh.json()).messages).toEqual([]);
  });
  it("keeps chat usable after a message ID belongs to another conversation", async () => {
    const { app, service } = setup();
    service.saveMessage(message("existing-message", "An earlier message"));
    const conversation = await (
      await app.request(
        "/api/conversations",
        request({ operationId: "new-scope" }),
      )
    ).json();
    const refused = await app.request(
      "/api/chat",
      request({
        conversationId: conversation.id,
        message: message("existing-message", "A new message"),
      }),
    );
    expect(refused.status).toBe(409);
    const next = await app.request(
      "/api/chat",
      request({
        conversationId: conversation.id,
        message: message("unique-message", "A new topic"),
      }),
    );
    expect(next.status).toBe(200);
    await next.text();
  });
});
