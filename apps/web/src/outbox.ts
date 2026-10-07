import { openDB } from "idb";
import { authenticatedFetch } from "./api.js";
import { whenAppResumes } from "./app-lifecycle.js";
export interface QueuedUpload {
  id: string;
  source: "photo" | "file";
  bytes: Blob;
  filename: string;
  caption: string;
  draftId: string | null;
  groupId?: string | null;
  createdAt: string;
  attempts: number;
  error: string | null;
  uploading: boolean;
}
const database = () =>
  openDB("be-better-outbox", 1, {
    upgrade(db) {
      db.createObjectStore("uploads", { keyPath: "id" });
    },
  });
const changed = () => window.dispatchEvent(new Event("be-better-outbox"));
export async function queuedUploads(): Promise<QueuedUpload[]> {
  const db = await database();
  return (await db.getAll("uploads")).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}
export async function queueUploads(
  files: File[],
  source: "photo" | "file",
  caption = "",
  draftId: string | null = null,
) {
  if (files.some((file) => !file.size || file.size > 20 * 1024 * 1024))
    throw new Error("Choose nonempty files smaller than 20 MB.");
  const groupId = source === "photo" ? crypto.randomUUID() : null;
  const createdAt = Date.now();
  const entries: QueuedUpload[] = files.map((file, index) => ({
    id: crypto.randomUUID(),
    source,
    bytes: file,
    filename: file.name,
    caption,
    draftId,
    groupId,
    createdAt: new Date(createdAt + index).toISOString(),
    attempts: 0,
    error: null,
    uploading: false,
  }));
  const db = await database();
  const transaction = db.transaction("uploads", "readwrite");
  await Promise.all(entries.map((item) => transaction.store.put(item)));
  await transaction.done;
  changed();
  void flushOutbox();
  return entries;
}
export async function removeUpload(id: string) {
  const db = await database();
  await db.delete("uploads", id);
  changed();
}
let flushing = false;
export async function flushOutbox(force = false) {
  if (flushing) return;
  flushing = true;
  try {
    const entries = await queuedUploads();
    if (!entries.length) return;
    const health = await authenticatedFetch("/api/health", {
      signal: AbortSignal.timeout(5000),
    });
    if (!health.ok) return;
    const db = await database();
    const blockedGroups = new Set<string>();
    for (const queued of entries) {
      const entry: QueuedUpload | undefined = await db.get(
        "uploads",
        queued.id,
      );
      if (!entry) continue;
      if (entry.groupId && blockedGroups.has(entry.groupId)) continue;
      if (entry.error && !force && entry.attempts >= 3) {
        if (entry.groupId) blockedGroups.add(entry.groupId);
        continue;
      }
      const current = {
        ...entry,
        attempts: entry.attempts + 1,
        uploading: true,
        error: null,
      };
      await db.put("uploads", current);
      changed();
      try {
        const body = new FormData();
        body.set("file", entry.bytes, entry.filename);
        body.set("operationId", entry.id);
        body.set("caption", entry.caption);
        if (entry.draftId) body.set("draftId", entry.draftId);
        const response = await authenticatedFetch(
          `/api/${entry.source === "photo" ? "photos" : "files"}`,
          { method: "POST", body, signal: AbortSignal.timeout(120000) },
        );
        if (!response.ok) {
          const result = await response
            .json()
            .catch(() => ({ error: "Upload failed. Please try again." }));
          throw new Error(result.error);
        }
        const result = await response.json();
        const transaction = db.transaction("uploads", "readwrite");
        if (entry.groupId) {
          const remaining: QueuedUpload[] = await transaction.store.getAll();
          await Promise.all(
            remaining
              .filter((item) => item.groupId === entry.groupId)
              .map((item) =>
                transaction.store.put({ ...item, draftId: result.id }),
              ),
          );
        }
        await transaction.store.delete(entry.id);
        await transaction.done;
        changed();
        window.dispatchEvent(new Event("be-better-uploaded"));
      } catch (error) {
        if (entry.groupId) blockedGroups.add(entry.groupId);
        await db.put("uploads", {
          ...current,
          uploading: false,
          error:
            error instanceof Error
              ? error.message
              : "Upload interrupted. Try again.",
        });
        changed();
      }
    }
  } catch {
    /* The outbox remains durable when the server is unreachable. */
  } finally {
    flushing = false;
  }
}
export function startOutbox() {
  const wake = () => {
    void flushOutbox();
  };
  const stop = whenAppResumes(wake);
  const timer = setInterval(wake, 15000);
  wake();
  return () => {
    clearInterval(timer);
    stop();
  };
}
