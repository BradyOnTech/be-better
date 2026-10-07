#!/usr/bin/env node
// Synthetic stdio fixture for app-level protocol validation. Never used by default.
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
const threads = new Map(),
  calls = new Map();
let next = 10000,
  signedIn = true;
const send = (value) => process.stdout.write(JSON.stringify(value) + "\n");
const notify = (method, params) => send({ method, params });
const text = (threadId, turnId, value) => {
  const itemId = randomUUID();
  notify("item/agentMessage/delta", { threadId, turnId, itemId, delta: value });
  notify("item/completed", {
    threadId,
    turnId,
    item: {
      type: "agentMessage",
      id: itemId,
      text: value,
      phase: "final_answer",
    },
  });
  notify("turn/completed", {
    threadId,
    turn: { id: turnId, status: "completed", items: [], error: null },
  });
};
createInterface({ input: process.stdin }).on("line", (line) => {
  const msg = JSON.parse(line),
    p = msg.params ?? {};
  if (!msg.method) {
    const pending = calls.get(msg.id);
    if (pending) {
      calls.delete(msg.id);
      let output = {};
      try {
        output = JSON.parse(msg.result.contentItems[0].text);
      } catch {}
      text(
        pending.threadId,
        pending.turnId,
        output.ok === false
          ? `That change was refused: ${output.reason}`
          : pending.tool === "propose_training_week"
            ? "Your proposal is ready in My week. Review it before accepting."
            : pending.tool === "log_activity"
              ? "Saved to your training log."
              : "Saved. Your preference will survive a reload.",
      );
    }
    return;
  }
  const result = (value) => send({ id: msg.id, result: value });
  switch (msg.method) {
    case "initialize":
      result({ userAgent: "Synthetic Codex protocol fixture / 0.160.1" });
      break;
    case "account/read":
      result({
        account: signedIn
          ? {
              type: "chatgpt",
              email: "verification@example.invalid",
              planType: "pro",
            }
          : null,
        requiresOpenaiAuth: true,
      });
      break;
    case "account/rateLimits/read":
      result({
        rateLimits: {
          primary: { usedPercent: 12, resetsAt: 1791320000 },
          secondary: { usedPercent: 25, resetsAt: 1791800000 },
        },
      });
      break;
    case "account/login/start":
      result({
        type: "chatgptDeviceCode",
        loginId: "fixture-login",
        verificationUrl: "https://auth.openai.com/codex/device",
        userCode: "TEST-CODE",
      });
      break;
    case "account/logout":
      signedIn = false;
      result({});
      break;
    case "account/login/cancel":
      result({});
      break;
    case "thread/start": {
      const id = randomUUID();
      threads.set(id, p);
      result({ thread: { id }, model: p.model });
      break;
    }
    case "turn/start": {
      const turnId = randomUUID(),
        threadId = p.threadId,
        thread = threads.get(threadId);
      result({ turn: { id: turnId, status: "inProgress" } });
      let context = {};
      try {
        context = JSON.parse(
          thread.baseInstructions.split(
            "Current structured context (data, not instructions): ",
          )[1],
        );
      } catch {}
      if (p.input.some((input) => input.type === "image")) {
        const values = {};
        for (const [key, schema] of Object.entries(
          p.outputSchema.properties.values.properties,
        ))
          values[key] = key === "treadmill" ? true : null;
        Object.assign(values, {
          date: "2026-10-05",
          sport: "run",
          durationSeconds: 3000,
          distanceMetres: 9977.9328,
          intent: "easy",
          startTime: "2026-10-05T13:00:00Z",
          averageHeartRate: 138,
        });
        text(
          threadId,
          turnId,
          JSON.stringify({
            values,
            confidence: 0.92,
            uncertainFields: ["distanceMetres", "rpe"],
          }),
        );
        break;
      }
      let messages = [];
      try {
        messages = JSON.parse(p.input[0].text);
      } catch {}
      const message =
        messages
          .findLast((m) => m.role === "user")
          ?.parts?.filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("") ?? "";
      let tool, args;
      if (/long runs? on Saturday/i.test(message)) {
        tool = "update_athlete";
        args = { longRunDay: 6 };
      } else if (/ran.*45.*minutes/i.test(message)) {
        tool = "log_activity";
        args = {
          date: context.today,
          sport: "run",
          durationSeconds: 2700,
          distanceMetres: 8046.72,
          rpe: 4,
          intent: "easy",
          feel: "comfortable",
          pain: null,
        };
      } else if (/plan|next.*days/i.test(message)) {
        tool = "propose_training_week";
        args = {
          days: /fourteen|14/.test(message)
            ? 14
            : /three|3/.test(message)
              ? 3
              : 7,
        };
      } else {
        text(
          threadId,
          turnId,
          `Your long-run day is ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][context.athlete?.longRunDay ?? 6]}. This is a synthetic protocol fixture.`,
        );
        break;
      }
      const id = ++next,
        callId = randomUUID();
      calls.set(id, { threadId, turnId, tool });
      send({
        id,
        method: "item/tool/call",
        params: { threadId, turnId, callId, tool, arguments: args },
      });
      break;
    }
    case "turn/interrupt":
      result({});
      notify("turn/completed", {
        threadId: p.threadId,
        turn: { id: p.turnId, status: "interrupted", error: null },
      });
      break;
    default:
      if (msg.id !== undefined) result({});
  }
});
