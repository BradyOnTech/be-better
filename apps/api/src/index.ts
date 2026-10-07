import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { openDatabase } from "./db.js";
import { CoachService } from "./service.js";
import { createApp } from "./app.js";
import { backupLog } from "./storage.js";
import { subscription } from "./codex.js";
import { configuredModel } from "./coach.js";

const host = process.env.HOST || "127.0.0.1";
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  !process.env.AUTH_TOKEN
)
  throw new Error("Set AUTH_TOKEN before binding to a network interface.");
const database = openDatabase();
const model = configuredModel();
const service = new CoachService(database, () => new Date(), {
  mode: model ? "model" : "guided",
  model: model?.name ?? null,
});
const app = createApp(service);
if (existsSync("dist/web/index.html")) {
  app.use("/*", async (c, next) => {
    if (
      ["/", "/index.html", "/sw.js", "/manifest.webmanifest"].includes(
        c.req.path,
      )
    )
      c.header("Cache-Control", "no-cache");
    await next();
  });
  app.use("/*", serveStatic({ root: "./dist/web" }));
  app.get("*", serveStatic({ path: "./dist/web/index.html" }));
}
const server = serve(
  { fetch: app.fetch, hostname: host, port: Number(process.env.PORT || 3001) },
  (info) =>
    console.log(
      `Be Better API: http://${host}:${info.port} (${service.mode.mode} coach)`,
    ),
);
// Refresh analysis on the server even when the phone is closed. Workout imports
// remain an explicit review flow; this worker only updates provider observations.
const refreshAnalysis = () => service.analysis.refreshIfStale().catch(() => {});
void refreshAnalysis();
const analysisTimer = setInterval(() => void refreshAnalysis(), 15 * 60 * 1000);
analysisTimer.unref();

// SQLite's backup API includes WAL data. Keep each log's daily snapshots separate.
async function dailyBackup() {
  const folder = resolve("backups", basename(database.sqlite.name, ".sqlite"));
  mkdirSync(folder, { recursive: true });
  const path = resolve(
    folder,
    `${new Date().toISOString().slice(0, 10)}.sqlite`,
  );
  await backupLog(database, path);
}
const backupTimer = setInterval(
  () => dailyBackup().catch((error) => console.error("Backup failed:", error)),
  24 * 60 * 60 * 1000,
);
backupTimer.unref();
dailyBackup().catch((error) => console.error("Backup failed:", error));
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(analysisTimer);
    clearInterval(backupTimer);
    subscription.close();
    server.close(() => {
      database.sqlite.close();
      process.exit(0);
    });
  });
