import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { CodexConnection } from "./codex.js";

const connections: CodexConnection[] = [];
const folders: string[] = [];
afterEach(() => {
  connections.splice(0).forEach((connection) => connection.close());
  folders
    .splice(0)
    .forEach((folder) => rmSync(folder, { recursive: true, force: true }));
  vi.unstubAllEnvs();
});

async function inspectRuntime() {
  const folder = mkdtempSync(join(tmpdir(), "be-better-web-search-"));
  folders.push(folder);
  vi.stubEnv("CODEX_BINARY", resolve("scripts/codex-app-fixture.mjs"));
  vi.stubEnv("CODEX_WORKSPACE", join(folder, "workspace"));
  vi.stubEnv("BE_BETTER_CODEX_HOME", join(folder, "home"));
  vi.stubEnv("CODEX_FIXTURE_INSPECT_RUNTIME", "1");
  const connection = new CodexConnection();
  connections.push(connection);
  const result = await connection.run({
    instructions: "You are an endurance coach.",
    input: [{ type: "text", text: "Look up the supplied race course link." }],
  });
  return JSON.parse(result.text);
}

describe("subscription coach web access", () => {
  it("enables live web search in the launched runtime", async () => {
    const runtime = await inspectRuntime();
    expect(runtime.args).toContain('web_search="live"');
  });

  it("allows reading race links without relaxing runtime permissions", async () => {
    const runtime = await inspectRuntime();
    expect(runtime.thread.developerInstructions).toContain(
      "built-in web search",
    );
    expect(runtime.thread.developerInstructions).not.toContain(
      "filesystem, web search",
    );
    expect(runtime.thread.developerInstructions).toContain(
      "cannot confirm imports or accept a plan",
    );
    expect(runtime.args).toEqual(
      expect.arrayContaining([
        "project_doc_max_bytes=0",
        'default_permissions="be_better"',
        'permissions.be_better.extends=":read-only"',
        'permissions.be_better.filesystem={":root"="deny",":minimal"="read",":workspace_roots"={"."="read"},":tmpdir"="deny",":slash_tmp"="deny"}',
        "permissions.be_better.network.enabled=false",
      ]),
    );
    for (const feature of ["shell_tool", "multi_agent", "apps"])
      expect(
        runtime.args.slice(
          runtime.args.indexOf(feature) - 1,
          runtime.args.indexOf(feature) + 1,
        ),
      ).toEqual(["--disable", feature]);
    expect(runtime.thread).toMatchObject({
      ephemeral: true,
      approvalPolicy: "never",
      permissions: "be_better",
      runtimeWorkspaceRoots: [runtime.thread.cwd],
    });
    expect(runtime.turn).toMatchObject({
      approvalPolicy: "never",
      permissions: "be_better",
    });
  });
});

describe("subscription coach tool calls", () => {
  it("records refused arguments with the fields to fix", async () => {
    const folder = mkdtempSync(join(tmpdir(), "be-better-tools-"));
    folders.push(folder);
    vi.stubEnv("CODEX_BINARY", resolve("scripts/codex-app-fixture.mjs"));
    vi.stubEnv("CODEX_WORKSPACE", join(folder, "workspace"));
    vi.stubEnv("BE_BETTER_CODEX_HOME", join(folder, "home"));
    const connection = new CodexConnection();
    connections.push(connection);
    let executed = false;
    const { stream } = connection.stream(
      "You are an endurance coach.",
      JSON.stringify([
        { role: "user", parts: [{ type: "text", text: "invalid revision" }] },
      ]),
      {
        revise_session: tool({
          inputSchema: z.object({ id: z.string(), version: z.number().int() }),
          execute: async () => {
            executed = true;
            return { ok: true };
          },
        }),
      },
    );
    const parts: { type: string; output?: unknown; text?: string }[] = [];
    const reader = stream.getReader();
    for (let next = await reader.read(); !next.done; next = await reader.read())
      parts.push(next.value as (typeof parts)[number]);
    expect(executed).toBe(false);
    expect(parts.find((part) => part.type === "tool-call")).toBeTruthy();
    const result = parts.find((part) => part.type === "tool-result")
      ?.output as { ok: boolean; code: string; reason: string };
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(result.reason).toContain("version");
    expect(
      parts
        .filter((part) => part.type === "text-delta")
        .map((part) => part.text)
        .join(""),
    ).toContain("version");
  });
});
