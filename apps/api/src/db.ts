import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { UIMessage } from "ai";
import type {
  Athlete,
  Activity,
  PlanSession,
  CoachNote,
  ImportDraft,
} from "../../../packages/domain/src/index.js";

export const tables = {
  athlete: sqliteTable("athlete", {
    id: text().primaryKey(),
    data: text({ mode: "json" }).$type<Athlete>().notNull(),
  }),
  activities: sqliteTable("activities", {
    id: text().primaryKey(),
    date: text().notNull(),
    confirmed: integer({ mode: "boolean" }).notNull(),
    source: text().notNull(),
    data: text({ mode: "json" }).$type<Activity | ImportDraft>().notNull(),
  }),
  plan: sqliteTable("plan_sessions", {
    id: text().primaryKey(),
    date: text().notNull(),
    status: text().notNull(),
    data: text({ mode: "json" }).$type<PlanSession>().notNull(),
  }),
  notes: sqliteTable("coach_notes", {
    id: text().primaryKey(),
    createdAt: text("created_at").notNull(),
    data: text({ mode: "json" }).$type<CoachNote>().notNull(),
  }),
  messages: sqliteTable("messages", {
    id: text().primaryKey(),
    sequence: integer().notNull(),
    data: text({ mode: "json" }).$type<UIMessage>().notNull(),
  }),
  operations: sqliteTable("operations", {
    id: text().primaryKey(),
    input: text().notNull(),
    data: text({ mode: "json" }).$type<unknown>().notNull(),
  }),
};

export function openDatabase(
  path = process.env.DATABASE_PATH || "./data/coach.sqlite",
) {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)",
  );
  for (const name of readdirSync(resolve("apps/api/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (
      !sqlite
        .prepare("SELECT name FROM schema_migrations WHERE name = ?")
        .get(name)
    ) {
      sqlite.transaction(() => {
        sqlite.exec(readFileSync(resolve("apps/api/migrations", name), "utf8"));
        sqlite
          .prepare("INSERT INTO schema_migrations (name) VALUES (?)")
          .run(name);
      })();
    }
  }
  return { sqlite, db: drizzle(sqlite, { schema: tables }) };
}
export type CoachDatabase = ReturnType<typeof openDatabase>;
