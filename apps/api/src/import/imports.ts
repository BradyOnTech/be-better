import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  renameSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import sharp from "sharp";
import {
  activityInputSchema,
  activitySchema,
  DomainError,
  type Activity,
  type Asset,
  type DraftValues,
  type ImportDraft,
} from "../../../../packages/domain/src/index.js";
import type { CoachService } from "../service.js";
import { emptyValues, parseWorkout } from "./parsers.js";
import { parsePhoto } from "./vision.js";

export function blobDirectory(service: CoachService) {
  return originalDirectory(service.database.sqlite.name);
}
import { originalDirectory } from "../storage.js";
export class Imports {
  private parsing = new Map<string, Promise<ImportDraft>>();
  constructor(private service: CoachService) {
    for (const draft of service.drafts())
      if (draft.status === "processing")
        service.saveDraft({
          ...draft,
          status: "error",
          error:
            "Photo extraction was interrupted when the server restarted. Retry it or fill in the card.",
        });
  }
  asset(id: string): { asset: Asset; bytes: Buffer } {
    const row = this.service.database.sqlite
      .prepare("SELECT path,data FROM assets WHERE id=?")
      .get(id) as { path: string; data: string } | undefined;
    if (!row)
      throw new DomainError(
        "NOT_FOUND",
        "That original file was not found.",
        404,
      );
    return {
      asset: JSON.parse(row.data),
      bytes: readFileSync(resolve(blobDirectory(this.service), row.path)),
    };
  }
  private store(bytes: Buffer, filename: string, mime: string): Asset {
    const hash = createHash("sha256").update(bytes).digest("hex");
    const previous = this.service.database.sqlite
      .prepare("SELECT data FROM assets WHERE hash=?")
      .get(hash) as { data: string } | undefined;
    if (previous) return JSON.parse(previous.data);
    const name =
      basename(filename)
        .replace(/[^\w. -]/g, "_")
        .slice(0, 120) || "workout";
    const asset: Asset = {
      id: randomUUID(),
      filename: name,
      mime,
      size: bytes.length,
      hash,
      createdAt: this.service.now().toISOString(),
    };
    const folder = blobDirectory(this.service);
    mkdirSync(folder, { recursive: true });
    const path = `${hash}.blob`;
    const temporary = resolve(folder, `${hash}.${randomUUID()}.tmp`);
    writeFileSync(temporary, bytes);
    renameSync(temporary, resolve(folder, path));
    this.service.database.sqlite
      .prepare("INSERT INTO assets (id,hash,path,data) VALUES (?,?,?,?)")
      .run(asset.id, hash, path, JSON.stringify(asset));
    return asset;
  }
  candidates(values: DraftValues, assetIds: string[] = []): string[] {
    if (!values.date || !values.sport) return [];
    return this.service
      .activities(values.date, values.date)
      .filter((activity) => {
        if (activity.sport !== values.sport) return false;
        if (assetIds.some((id) => activity.assetIds?.includes(id))) return true;
        if (values.startTime && activity.startTime)
          return (
            Math.abs(
              Date.parse(values.startTime) - Date.parse(activity.startTime),
            ) <=
            15 * 60 * 1000
          );
        if (!values.durationSeconds) return false;
        if (
          Math.abs(activity.durationSeconds - values.durationSeconds) >
          Math.max(180, values.durationSeconds * 0.15)
        )
          return false;
        return (
          values.distanceMetres === null ||
          values.distanceMetres === undefined ||
          activity.distanceMetres === null ||
          Math.abs(activity.distanceMetres - values.distanceMetres) <=
            Math.max(500, values.distanceMetres * 0.15)
        );
      })
      .map((activity) => activity.id);
  }
  async upload(
    bytes: Buffer,
    filename: string,
    mime: string,
    source: "photo" | "file",
    operationId: string,
    caption = "",
    draftId: string | null = null,
  ): Promise<ImportDraft | Activity> {
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      throw new DomainError(
        "FILE_SIZE",
        "Choose a nonempty file smaller than 20 MB.",
        400,
      );
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (source === "photo") {
      const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 })
        .metadata()
        .catch(() => null);
      if (
        !metadata ||
        !["jpeg", "png", "webp", "gif", "heif", "avif"].includes(
          metadata.format ?? "",
        )
      )
        throw new DomainError(
          "PHOTO_TYPE",
          "Choose a JPEG, PNG, WebP, or supported camera photo.",
          400,
        );
      mime =
        metadata.format === "jpeg"
          ? "image/jpeg"
          : metadata.format === "heif"
            ? "image/heic"
            : `image/${metadata.format}`;
    }
    const prior = this.service.database.sqlite
      .prepare("SELECT input,data FROM operations WHERE id=?")
      .get(operationId) as { input: string; data: string } | undefined;
    if (prior) {
      const saved = this.service.mutate<ImportDraft>(
        operationId,
        { hash, source, draftId, caption },
        () => {
          throw new DomainError(
            "UPLOAD_RETRY",
            "Retry the same upload request.",
            409,
          );
        },
      );
      const current = this.service.database.sqlite
        .prepare("SELECT data FROM activities WHERE id=?")
        .get(saved.id) as { data: string } | undefined;
      if (!current)
        throw new DomainError(
          "DISCARDED",
          "This upload was already discarded. Choose it again to start a new draft.",
          409,
        );
      return JSON.parse(current.data);
    }
    const parsed =
      source === "file"
        ? await parseWorkout(
            bytes,
            filename,
            this.service.athlete().timezone,
            this.service.today(),
          )
        : null;
    const asset = this.store(bytes, filename, mime);
    const initial = this.service.mutate(
      operationId,
      { hash, source, draftId, caption },
      () => {
        const previous = draftId ? this.service.draft(draftId) : null;
        if (previous && previous.source !== "photo")
          throw new DomainError(
            "DRAFT_SOURCE",
            "Add another photo only to a photo draft.",
          );
        const values =
          parsed?.values ??
          previous?.values ??
          emptyValues(source === "photo" ? null : this.service.today());
        const draft: ImportDraft = {
          id: previous?.id ?? randomUUID(),
          source,
          confirmed: false,
          date: values.date ?? this.service.today(),
          createdAt: previous?.createdAt ?? this.service.now().toISOString(),
          values,
          assetIds: [...new Set([...(previous?.assetIds ?? []), asset.id])],
          status: source === "photo" ? "processing" : "ready",
          confidence: null,
          uncertainFields: parsed?.uncertain ?? [
            "sport",
            "date",
            "durationSeconds",
          ],
          rawParse: parsed?.raw ?? { caption },
          error: null,
          duplicateIds: this.candidates(values),
          external: null,
        };
        return this.service.saveDraft(draft);
      },
    );
    if (source === "file") return initial;
    return this.extract(initial.id, caption);
  }
  async extract(id: string, caption = ""): Promise<ImportDraft> {
    const underway = this.parsing.get(id);
    if (underway) return underway;
    const work = (async () => {
      const before = this.service.draft(id);
      this.service.saveDraft({ ...before, status: "processing", error: null });
      try {
        const { bytes } = this.asset(before.assetIds.at(-1)!);
        const parsed = await parsePhoto(
          bytes,
          this.service.athlete().timezone,
          this.service.today(),
          caption,
        );
        const values =
          before.assetIds.length === 1
            ? parsed.values
            : ({
                ...before.values,
                ...Object.fromEntries(
                  Object.entries(parsed.values).filter(
                    ([key, value]) =>
                      (value !== null && value !== undefined) ||
                      before.values[key as keyof DraftValues] === undefined ||
                      before.values[key as keyof DraftValues] === null,
                  ),
                ),
              } as DraftValues);
        const draft = {
          ...before,
          values,
          date: values.date ?? before.date,
          status: "ready" as const,
          confidence: parsed.confidence,
          uncertainFields: [
            ...new Set([
              ...parsed.uncertainFields,
              ...(before.assetIds.length > 1
                ? before.uncertainFields.filter(
                    (key) =>
                      parsed.values[key as keyof DraftValues] == null ||
                      parsed.uncertainFields.includes(key),
                  )
                : []),
            ]),
          ],
          rawParse: parsed.raw,
          error: parsed.error,
          duplicateIds: this.candidates(values, before.assetIds),
        };
        return this.service.saveDraft(draft);
      } catch (error) {
        console.error(
          "Photo extraction failed:",
          error instanceof Error ? error.message : "Unknown provider error",
        );
        return this.service.saveDraft({
          ...before,
          status: "error",
          error:
            error instanceof DomainError
              ? error.message
              : "The photo could not be extracted. Retry it or enter the fields yourself.",
        });
      }
    })();
    this.parsing.set(id, work);
    try {
      return await work;
    } finally {
      this.parsing.delete(id);
    }
  }
  confirm(
    id: string,
    raw: unknown,
    mergeId: string | null,
    operationId: string,
  ): Activity {
    return this.service.mutate(operationId, { id, raw, mergeId }, () => {
      const draft = this.service.draft(id);
      if (draft.status === "processing")
        throw new DomainError(
          "PROCESSING",
          "Wait for photo extraction to finish before confirming.",
          409,
        );
      const input = activityInputSchema.parse({
        ...emptyValues(draft.date),
        ...draft.values,
        ...(typeof raw === "object" && raw !== null ? raw : {}),
      });
      if (input.date > this.service.today())
        throw new DomainError(
          "FUTURE_ACTIVITY",
          "A completed workout cannot have a future date.",
        );
      const mapping = draft.external
        ? (this.service.database.sqlite
            .prepare(
              "SELECT activity_id FROM external_activities WHERE provider=? AND external_id=?",
            )
            .get(draft.external.provider, draft.external.id) as
            | { activity_id: string }
            | undefined)
        : null;
      if (mapping && mergeId !== mapping.activity_id)
        throw new DomainError(
          "DUPLICATE_EXTERNAL",
          "Attach this update to its existing workout instead of saving a duplicate.",
        );
      let activity: Activity;
      if (mergeId) {
        if (
          !this.candidates(input, draft.assetIds).includes(mergeId) &&
          mapping?.activity_id !== mergeId
        )
          throw new DomainError(
            "DUPLICATE",
            "That workout does not match this draft. Check the date, sport, and start time.",
          );
        const row = this.service.database.sqlite
          .prepare("SELECT data FROM activities WHERE id=? AND confirmed=1")
          .get(mergeId) as { data: string } | undefined;
        if (!row)
          throw new DomainError(
            "NOT_FOUND",
            "The workout to attach to was not found.",
            404,
          );
        const previous = activitySchema.parse(JSON.parse(row.data));
        const fields = Object.fromEntries(
          Object.entries(input).filter(
            ([, value]) => value !== null && value !== undefined,
          ),
        );
        activity = {
          ...previous,
          ...fields,
          intent: previous.intent,
          treadmill: !!(previous.treadmill || fields.treadmill),
          assetIds: [
            ...new Set([...(previous.assetIds ?? []), ...draft.assetIds]),
          ],
          rawParse: draft.rawParse,
        };
        activity = this.service.refreshActivityOutcome(previous, activity);
        this.service.recordNote({
          kind: "decision",
          text: `Attached ${draft.source} data to ${previous.sport} on ${previous.date}; kept one workout.`,
          previous,
        });
        this.service.database.sqlite
          .prepare("DELETE FROM activities WHERE id=? AND confirmed=0")
          .run(id);
      } else {
        activity = {
          ...input,
          id,
          source: draft.source,
          confirmed: true,
          createdAt: draft.createdAt,
          planSessionId: null,
          assetIds: draft.assetIds,
          rawParse: draft.rawParse,
          confidence: draft.confidence,
        };
      }
      this.service.database.sqlite
        .prepare(
          "INSERT INTO activities (id,date,confirmed,source,data) VALUES (?,?,1,?,?) ON CONFLICT(id) DO UPDATE SET date=excluded.date,confirmed=1,data=excluded.data",
        )
        .run(
          activity.id,
          activity.date,
          activity.source,
          JSON.stringify(activity),
        );
      if (draft.external)
        this.service.database.sqlite
          .prepare(
            "INSERT INTO external_activities (provider,external_id,activity_id,hash) VALUES (?,?,?,?) ON CONFLICT(provider,external_id) DO UPDATE SET activity_id=excluded.activity_id,hash=excluded.hash",
          )
          .run(
            draft.external.provider,
            draft.external.id,
            activity.id,
            draft.external.hash,
          );
      return activity;
    });
  }
  discard(id: string, operationId: string) {
    return this.service.mutate(operationId, { id }, () => {
      const draft = this.service.draft(id);
      if (this.parsing.has(id))
        throw new DomainError(
          "PROCESSING",
          "Wait for extraction before discarding this draft.",
          409,
        );
      this.service.database.sqlite
        .prepare("DELETE FROM activities WHERE id=? AND confirmed=0")
        .run(draft.id);
      return { ok: true };
    });
  }
}
