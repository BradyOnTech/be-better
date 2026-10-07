import { cp, mkdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
export function originalDirectory(databasePath: string) {
  return resolve(
    process.env.BLOB_DIRECTORY || dirname(databasePath),
    process.env.BLOB_DIRECTORY
      ? ""
      : `${basename(databasePath, ".sqlite")}-blobs`,
  );
}
export async function backupLog(
  database: {
    sqlite: { name: string; backup: (path: string) => Promise<unknown> };
  },
  path: string,
) {
  await mkdir(dirname(path), { recursive: true });
  const folder = resolve(dirname(path), `${basename(path, ".sqlite")}-blobs`),
    temporary = `${folder}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  const source = originalDirectory(database.sqlite.name);
  // Files are durably stored before their SQLite rows. Extra files are harmless.
  await database.sqlite.backup(`${path}.tmp`);
  if (existsSync(source)) await cp(source, temporary, { recursive: true });
  else await mkdir(temporary, { recursive: true });
  await rm(folder, { recursive: true, force: true });
  await rename(temporary, folder);
  await rename(`${path}.tmp`, path);
}
