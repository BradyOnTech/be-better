import { timingSafeEqual, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  isToolUIPart,
  getToolName,
  type UIMessage,
  type LanguageModel,
} from "ai";
import { DomainError, addDays } from "../../../packages/domain/src/index.js";
import sharp from "sharp";
import { guidedReply, type GuidedAction } from "./guided.js";
import { streamCoach } from "./coach.js";
import type { CoachService } from "./service.js";
import { Imports } from "./import/imports.js";
import { IntervalsSync } from "./sync.js";
import { subscription } from "./codex.js";
import { buildBlocks, trainingProposal } from "./planning.js";
import { calendar, workoutFit, workoutZwo } from "./exports.js";

const idSchema = z.string().min(1).max(200);
const operationSchema = z.object({ operationId: idSchema });
const chatSchema = z.object({
  message: z.object({
    id: idSchema,
    role: z.literal("user"),
    parts: z
      .array(z.object({ type: z.literal("text"), text: z.string().max(10000) }))
      .min(1)
      .max(5),
  }),
});

export function createApp(
  service: CoachService,
  authToken = process.env.AUTH_TOKEN || "",
  model?: LanguageModel,
) {
  const app = new Hono();
  const codexEnabled =
    !model &&
    (process.env.AI_PROVIDER === "codex" ||
      (!process.env.AI_PROVIDER && service.mode.model !== null));
  const imports = new Imports(service);
  const sync = new IntervalsSync(service, imports);
  let runningTurn: string | null = null;
  service.database.sqlite
    .prepare("UPDATE turns SET status = 'interrupted' WHERE status = 'running'")
    .run();
  app.use("/api/*", bodyLimit({ maxSize: 21 * 1024 * 1024 }));
  app.use("/api/*", async (c, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      c.req.header("Sec-Fetch-Site") === "cross-site"
    )
      return c.json(
        {
          error: "Open Be Better to make this change.",
          code: "CROSS_SITE_WRITE",
        },
        403,
      );
    if (authToken && c.req.path !== "/api/health") {
      const supplied = Buffer.from(
        c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "",
      );
      const expected = Buffer.from(authToken);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return c.json(
          {
            error: "Enter your server access token to connect.",
            code: "AUTH_REQUIRED",
          },
          401,
        );
    }
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json(
        {
          error: error.issues.map((issue) => issue.message).join(". "),
          code: "VALIDATION",
        },
        400,
      );
    if (error instanceof DomainError)
      return c.json(
        { error: error.message, code: error.code },
        error.status as 400,
      );
    console.error(error);
    return c.json(
      {
        error:
          "Something went wrong. Your saved training is still available. Please try again.",
        code: "SERVER_ERROR",
      },
      500,
    );
  });
  app.get("/api/health", (c) => c.json({ ok: true }));
  app.get("/api/drafts", (c) => c.json(service.drafts()));
  async function upload(c: any, source: "photo" | "file") {
    const body = await c.req.parseBody();
    if (!(body.file instanceof File))
      throw new DomainError("UPLOAD", "Choose a photo or workout file.", 400);
    const operationId = idSchema.parse(body.operationId);
    const caption = z
      .string()
      .max(500)
      .parse(body.caption || "");
    const draftId = body.draftId ? idSchema.parse(body.draftId) : null;
    return c.json(
      await imports.upload(
        Buffer.from(await body.file.arrayBuffer()),
        body.file.name,
        body.file.type,
        source,
        operationId,
        caption,
        draftId,
      ),
      201,
    );
  }
  app.post("/api/photos", (c) => upload(c, "photo"));
  app.post("/api/files", (c) => upload(c, "file"));
  app.post("/api/drafts/:id/retry", async (c) =>
    c.json(await imports.extract(c.req.param("id"))),
  );
  app.post("/api/activities/:id/confirm", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(
      imports.confirm(
        c.req.param("id"),
        body.activity,
        body.mergeId ? idSchema.parse(body.mergeId) : null,
        operationId,
      ),
    );
  });
  app.post("/api/activities/:id/discard", async (c) => {
    const body = operationSchema.parse(await c.req.json());
    return c.json(imports.discard(c.req.param("id"), body.operationId));
  });
  app.get("/api/assets/:id", async (c) => {
    const { asset, bytes } = imports.asset(c.req.param("id"));
    if (c.req.query("preview") === "1" && asset.mime.startsWith("image/")) {
      c.header("Content-Type", "image/png");
      return c.body(
        new Uint8Array(
          await sharp(bytes, { limitInputPixels: 40_000_000 })
            .rotate()
            .resize({ width: 1200, withoutEnlargement: true })
            .png()
            .toBuffer(),
        ),
      );
    }
    c.header("Content-Type", asset.mime || "application/octet-stream");
    c.header("X-Content-Type-Options", "nosniff");
    c.header(
      "Content-Disposition",
      `${asset.mime.startsWith("image/") ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
    );
    return c.body(new Uint8Array(bytes));
  });
  app.get("/api/races", (c) => c.json(service.races()));
  app.post("/api/races", async (c) => {
    const body = await c.req.json();
    return c.json(
      service.saveRace(
        body.race,
        null,
        operationSchema.parse(body).operationId,
      ),
      201,
    );
  });
  app.patch("/api/races/:id", async (c) => {
    const body = await c.req.json();
    return c.json(
      service.saveRace(
        body.race,
        c.req.param("id"),
        operationSchema.parse(body).operationId,
      ),
    );
  });
  app.delete("/api/races/:id", async (c) => {
    const body = operationSchema.parse(await c.req.json());
    return c.json(service.deleteRace(c.req.param("id"), body.operationId));
  });
  app.post("/api/questions/:id/answer", async (c) => {
    const body = await c.req.json();
    return c.json(
      service.answerQuestion(
        c.req.param("id"),
        z.string().parse(body.answer),
        operationSchema.parse(body).operationId,
      ),
    );
  });
  app.post("/api/blocks", async (c) => {
    const body = operationSchema.parse(await c.req.json());
    return c.json(buildBlocks(service, body.operationId));
  });
  app.post("/api/plan/generate", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    const days = z
      .number()
      .int()
      .min(1)
      .max(14)
      .parse(body.days ?? 7);
    const proposal = trainingProposal(service, days, operationId);
    return c.json(
      proposal.length
        ? service.proposePlan(proposal, `${operationId}:proposal`)
        : [],
    );
  });
  app.get("/api/sync/intervals/connection", (c) => c.json(sync.connection()));
  app.get("/api/analysis/intervals", (c) => c.json(service.analysis.summary()));
  app.post("/api/analysis/intervals/refresh", async (c) => {
    const body = z
      .object({
        backfill: z.boolean().optional(),
        onlyIfStale: z.boolean().optional(),
      })
      .parse(await c.req.json());
    return c.json(
      await (body.onlyIfStale
        ? service.analysis.refreshIfStale()
        : service.analysis.refresh(body.backfill)),
    );
  });
  app.post("/api/sync/intervals/connection", async (c) => {
    const connection = await sync.connect(await c.req.json());
    void service.analysis.refreshIfStale().catch(() => {});
    return c.json(connection);
  });
  app.delete("/api/sync/intervals/connection", (c) =>
    c.json(sync.disconnect()),
  );
  app.post("/api/sync/intervals", async (c) => {
    const body = await c.req.json();
    const result = await sync.run(body.from, body.to);
    await service.analysis.refreshIfStale();
    return c.json(result);
  });
  app.get("/api/export/calendar.ics", (c) => {
    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header(
      "Content-Disposition",
      'attachment; filename="be-better-plan.ics"',
    );
    return c.body(
      calendar(service.plan(service.today(), addDays(service.today(), 730))),
    );
  });
  app.get("/api/export/:id/:format", (c) => {
    const session = service.session(c.req.param("id"));
    const format = c.req.param("format");
    if (!["fit", "zwo", "txt"].includes(format))
      throw new DomainError(
        "EXPORT_TYPE",
        "Choose FIT, ZWO, or a text prescription.",
        400,
      );
    c.header(
      "Content-Disposition",
      `attachment; filename="${session.date}-${session.sport}.${format}"`,
    );
    if (format === "fit") {
      c.header("Content-Type", "application/octet-stream");
      return c.body(new Uint8Array(workoutFit(session)));
    }
    if (format === "zwo") {
      c.header("Content-Type", "application/xml; charset=utf-8");
      return c.body(workoutZwo(session, service.athlete()));
    }
    if (session.status !== "accepted")
      throw new DomainError(
        "EXPORT_STATUS",
        "Accept the session before exporting it.",
      );
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(
      `${session.date} · ${session.title}\n${Math.round(session.durationSeconds / 60)} minutes · RPE ${session.rpeTarget}\n\n${session.prescription}\n\n${session.reason}\n`,
    );
  });
  app.get("/api/state", async (c) => {
    if (codexEnabled) {
      const status = await subscription.status();
      service.mode = {
        mode: status.signedIn ? "model" : "guided",
        model: status.signedIn
          ? process.env.CODEX_MODEL || "gpt-6.1-sol"
          : null,
      };
    }
    return c.json(service.state());
  });
  app.get("/api/subscription", async (c) =>
    c.json(await subscription.status()),
  );
  app.post("/api/subscription/login", async (c) => {
    const body = await c.req.json();
    return c.json(
      await subscription.login(
        z.enum(["browser", "device"]).parse(body.type ?? "device"),
      ),
    );
  });
  app.post("/api/subscription/login/cancel", async (c) =>
    c.json(await subscription.cancelLogin()),
  );
  app.post("/api/subscription/logout", async (c) =>
    c.json(await subscription.logout()),
  );
  app.get("/api/history", (c) => c.json(service.messages()));
  app.get("/api/athlete", (c) => c.json(service.athlete()));
  app.patch("/api/athlete", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(service.updateAthlete(body.athlete, operationId));
  });
  app.get("/api/activities", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from) z.iso.date().parse(from);
    if (to) z.iso.date().parse(to);
    return c.json(service.activities(from, to));
  });
  app.post("/api/activities", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(service.logActivity(body.activity, operationId), 201);
  });
  app.patch("/api/activities/:id", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(
      service.editActivity(c.req.param("id"), body.activity, operationId),
    );
  });
  app.post("/api/activities/:id/plan-review", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(
      service.resolveActivityPlan(
        c.req.param("id"),
        body.decision,
        operationId,
      ),
    );
  });
  app.post("/api/programs/preview", async (c) =>
    c.json(service.programs.preview((await c.req.json()).choice)),
  );
  app.post("/api/programs/follow", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(
      service.programs.follow(
        body.choice,
        operationId,
        z.string().length(64).parse(body.previewKey),
      ),
    );
  });
  app.post("/api/programs/:id/end", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(service.programs.end(c.req.param("id"), operationId));
  });
  app.get("/api/plan", (c) => {
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (from) z.iso.date().parse(from);
    if (to) z.iso.date().parse(to);
    return c.json(service.plan(from, to));
  });
  app.post("/api/plan/propose", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(service.proposePlan(body.sessions, operationId));
  });
  app.post("/api/plan/accept", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    const ids = z.array(idSchema).min(1).max(30).parse(body.ids);
    return c.json(service.acceptPlan(ids, operationId));
  });
  app.delete("/api/plan/:id", async (c) => {
    const body = await c.req.json();
    return c.json(
      service.discardProposal(
        c.req.param("id"),
        z.number().int().positive().parse(body.version),
        operationSchema.parse(body).operationId,
      ),
    );
  });
  app.patch("/api/plan/:id", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(
      service.reviseSession(
        c.req.param("id"),
        body.session,
        z.number().int().positive().parse(body.version),
        operationId,
      ),
    );
  });
  app.post("/api/plan/:id/skip", async (c) => {
    const body = await c.req.json();
    const { operationId } = operationSchema.parse(body);
    return c.json(
      service.skipSession(
        c.req.param("id"),
        z.string().min(1).max(1000).parse(body.reason),
        z.number().int().positive().parse(body.version),
        operationId,
      ),
    );
  });

  function replay(message: UIMessage): Response {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "start", messageId: message.id });
        for (let i = 0; i < message.parts.length; i++) {
          const part = message.parts[i];
          if (part.type === "text") {
            writer.write({ type: "text-start", id: `text-${i}` });
            writer.write({
              type: "text-delta",
              id: `text-${i}`,
              delta: part.text,
            });
            writer.write({ type: "text-end", id: `text-${i}` });
          } else if (isToolUIPart(part) && part.state === "output-available") {
            const dynamic = part.type === "dynamic-tool";
            writer.write({
              type: "tool-input-available",
              toolCallId: part.toolCallId,
              toolName: getToolName(part),
              input: part.input,
              dynamic,
            });
            writer.write({
              type: "tool-output-available",
              toolCallId: part.toolCallId,
              output: part.output,
              dynamic,
            });
          }
        }
        writer.write({ type: "finish", finishReason: "stop" });
        writer.setOutcome({ status: "completed" });
      },
    });
    return createUIMessageStreamResponse({
      stream,
      headers: { "Cache-Control": "no-store" },
    });
  }
  function guidedMessage(
    id: string,
    text: string,
    actions: GuidedAction[],
  ): UIMessage {
    return {
      id,
      role: "assistant",
      parts: [
        ...actions.map((action, index) => ({
          type: "dynamic-tool" as const,
          toolCallId: `${id}-${index}`,
          toolName: action.name,
          state: "output-available" as const,
          input: action.input,
          output: action.output,
        })),
        { type: "text", text },
      ],
    };
  }
  app.post("/api/chat", async (c) => {
    const { message } = chatSchema.parse(await c.req.json());
    const text = message.parts
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (!text)
      throw new DomainError("EMPTY_MESSAGE", "Write a message first.", 400);
    const previous = service.database.sqlite
      .prepare("SELECT * FROM turns WHERE id = ?")
      .get(message.id) as
      | { text: string; status: string; response_id: string }
      | undefined;
    if (previous && previous.text !== text)
      throw new DomainError(
        "CONFLICT",
        "This message ID was already used.",
        409,
      );
    if (previous?.status === "done") {
      const response = service
        .messages()
        .find((saved) => saved.id === previous.response_id);
      if (response) return replay(response);
      throw new DomainError(
        "OLD_TURN",
        "This turn is already saved. Reload the conversation.",
        409,
      );
    }
    if (runningTurn)
      throw new DomainError(
        "BUSY",
        "The coach is finishing another message. Try again in a moment.",
        409,
      );
    runningTurn = message.id;
    service.saveMessage(message);
    const responseId = previous?.response_id || randomUUID();
    service.database.sqlite
      .prepare(
        "INSERT INTO turns (id, text, status, response_id, updated_at) VALUES (?, ?, 'running', ?, ?) ON CONFLICT(id) DO UPDATE SET status = 'running', updated_at = excluded.updated_at",
      )
      .run(message.id, text, responseId, service.now().toISOString());
    const finish = (status: string) => {
      service.database.sqlite
        .prepare("UPDATE turns SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, service.now().toISOString(), message.id);
      runningTurn = null;
    };
    try {
      if (service.mode.mode === "guided") {
        const reply = guidedReply(service, text, message.id);
        const response = guidedMessage(responseId, reply.text, reply.actions);
        service.saveMessage(response);
        finish("done");
        return replay(response);
      }
      // Use fresh analysis when it arrives promptly; keep chat responsive if the
      // provider is slow. The context reports the age of any cached observations.
      let analysisDeadline: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        service.analysis.refreshIfStale().catch(() => {}),
        new Promise<void>((resolve) => {
          analysisDeadline = setTimeout(resolve, 3000);
        }),
      ]);
      if (analysisDeadline) clearTimeout(analysisDeadline);
      const result = await streamCoach(
        service,
        service.messages(),
        message.id,
        model,
      );
      const stream = toUIMessageStream({
        stream: result.stream,
        sendReasoning: false,
        generateMessageId: () => responseId,
        originalMessages: service.messages(),
        onError: (error) => {
          console.error(
            "Coach generation failed:",
            error instanceof Error ? error.message : "unknown error",
          );
          return "The model connection failed. Your saved changes are safe. Retry this message.";
        },
        onEnd: ({ responseMessage, outcome }) => {
          service.saveMessage(responseMessage);
          finish(outcome.status === "completed" ? "done" : "interrupted");
        },
      });
      return createUIMessageStreamResponse({
        stream,
        keepAliveMs: 10000,
        consumeSseStream: async ({ stream }) => {
          const reader = stream.getReader();
          try {
            while (!(await reader.read()).done) {
              /* Persist even if the phone disconnects. */
            }
          } finally {
            reader.releaseLock();
          }
        },
      });
    } catch (error) {
      finish("interrupted");
      throw error;
    }
  });
  app.all("/api/*", (c) =>
    c.json({ error: "That API route was not found.", code: "NOT_FOUND" }, 404),
  );
  return app;
}
