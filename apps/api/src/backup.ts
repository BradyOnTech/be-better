import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { backupLog } from "./storage.js";
import { openDatabase } from "./db.js";
const folder = resolve(process.argv[2] || "backups");
mkdirSync(folder, { recursive: true });
const database = openDatabase();
const path = resolve(
  folder,
  `coach-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
await backupLog(database, path);
database.sqlite.close();
console.log(`Training log and originals backed up to ${path}`);
