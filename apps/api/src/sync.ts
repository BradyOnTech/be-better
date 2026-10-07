import { createHash, randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  addDays,
  dateInTimezone,
  DomainError,
  type ImportDraft,
  type DraftValues,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";
import type { Imports } from "./import/imports.js";
import { emptyValues } from "./import/parsers.js";
import { canonical } from "./service.js";

const responseSchema = z
  .array(
    z
      .object({
        id: z.union([z.string(), z.number()]),
        type: z.string().nullable().optional(),
        start_date: z.string().nullable().optional(),
        start_date_local: z.string().optional(),
        moving_time: z.number().nonnegative().nullable().optional(),
        elapsed_time: z.number().nonnegative().nullable().optional(),
        distance: z.number().nonnegative().nullable().optional(),
        icu_distance: z.number().nonnegative().nullable().optional(),
        average_speed: z.number().nonnegative().nullable().optional(),
        average_heartrate: z.number().nullable().optional(),
        max_heartrate: z.number().nullable().optional(),
        average_watts: z.number().nullable().optional(),
        icu_weighted_avg_watts: z.number().nullable().optional(),
        total_elevation_gain: z.number().nullable().optional(),
        icu_rpe: z.number().nullable().optional(),
        name: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      })
      .passthrough(),
  )
  .max(1000);

const connectionSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(8, "Enter your Intervals.icu API key.")
    .max(512)
    .regex(
      /^[A-Za-z0-9_.:/+=-]+$/,
      "Enter the API key without spaces or line breaks.",
    ),
  athleteId: z
    .string()
    .trim()
    .regex(/^(?:0|i?\d+)$/, "Use your athlete ID, or 0 for your own account.")
    .default("0"),
});

function workoutHash(record: Record<string, unknown>) {
  const fields = [
    "type",
    "start_date",
    "start_date_local",
    "moving_time",
    "elapsed_time",
    "distance",
    "icu_distance",
    "average_speed",
    "average_heartrate",
    "max_heartrate",
    "average_watts",
    "icu_weighted_avg_watts",
    "total_elevation_gain",
    "icu_rpe",
    "name",
  ];
  return createHash("sha256")
    .update(
      canonical(
        Object.fromEntries(
          fields.map((field) => [field, record[field] ?? null]),
        ),
      ),
    )
    .digest("hex");
}

function persistConnection(apiKey: string, athleteId: string) {
  const path = resolve(process.env.INTERVALS_ENV_FILE || ".env");
  let contents = "";
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  for (const [name, value] of Object.entries({
    INTERVALS_API_KEY: apiKey,
    INTERVALS_ATHLETE_ID: athleteId,
  })) {
    const line = `${name}=${JSON.stringify(value)}`;
    const expression = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=.*$`, "gm");
    if (expression.test(contents))
      contents = contents.replace(expression, () => line);
    else contents = `${contents.replace(/\n?$/, "\n")}${line}\n`;
  }
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(temporary, contents, { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } finally {
    try {
      unlinkSync(temporary);
    } catch {}
  }
  process.env.INTERVALS_API_KEY = apiKey;
  process.env.INTERVALS_ATHLETE_ID = athleteId;
}

export class IntervalsSync {
  private running = false;
  constructor(
    private service: CoachService,
    private imports: Imports,
  ) {}
  connection() {
    return {
      ...this.service.syncState(),
      athleteId: process.env.INTERVALS_ATHLETE_ID || "0",
    };
  }
  async connect(raw: unknown) {
    const { apiKey, athleteId } = connectionSchema.parse(raw);
    if (this.running || this.service.analysis.refreshing)
      throw new DomainError(
        "BUSY",
        "Wait for the current sync to finish.",
        409,
      );
    this.running = true;
    try {
      const url = new URL(
        `/api/v1/athlete/${encodeURIComponent(athleteId)}`,
        process.env.INTERVALS_BASE_URL || "https://intervals.icu",
      );
      let response: Response;
      try {
        response = await fetch(url, {
          headers: {
            Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(15000),
        });
      } catch {
        throw new DomainError(
          "SYNC_PROVIDER",
          "Could not reach Intervals.icu. Check your connection and try again.",
          502,
        );
      }
      if (!response.ok)
        throw new DomainError(
          "SYNC_CREDENTIALS",
          response.status === 401 || response.status === 403
            ? "Intervals.icu rejected that API key or athlete ID. Check both and try again."
            : "Intervals.icu is unavailable. Try again later.",
          response.status === 401 || response.status === 403 ? 422 : 502,
        );
      const athlete = z
        .object({ id: z.union([z.string(), z.number()]) })
        .safeParse(await response.json());
      if (!athlete.success)
        throw new DomainError(
          "SYNC_PROVIDER",
          "Intervals.icu returned an unexpected account response. Try again later.",
          502,
        );
      // The scheduled worker can start while credential validation is awaiting HTTP.
      // Finish it before replacing the credentials used by an in-flight refresh.
      if (this.service.analysis.refreshing)
        throw new DomainError(
          "BUSY",
          "Analysis is refreshing. Wait for it to finish, then connect again.",
          409,
        );
      try {
        persistConnection(apiKey, athleteId);
      } catch {
        throw new DomainError(
          "SYNC_SETTINGS",
          "Your key was verified, but the server could not save the connection settings.",
          500,
        );
      }
      return this.connection();
    } finally {
      this.running = false;
    }
  }
  disconnect() {
    if (this.running || this.service.analysis.refreshing)
      throw new DomainError(
        "BUSY",
        "Wait for the current sync to finish.",
        409,
      );
    try {
      persistConnection("", "");
    } catch {
      throw new DomainError(
        "SYNC_SETTINGS",
        "The server could not remove the connection settings.",
        500,
      );
    }
    return this.connection();
  }
  async run(
    from = addDays(this.service.today(), -27),
    to = this.service.today(),
  ) {
    z.iso.date().parse(from);
    z.iso.date().parse(to);
    if (from > to || Date.parse(to) - Date.parse(from) > 366 * 86400000)
      throw new DomainError(
        "SYNC_RANGE",
        "Choose a sync range of at most a year.",
        400,
      );
    if (this.running)
      throw new DomainError("BUSY", "A sync is already running.", 409);
    const key = process.env.INTERVALS_API_KEY;
    if (!key)
      throw new DomainError(
        "SYNC_CONFIG",
        "Connect Intervals.icu in Settings before syncing workouts.",
        400,
      );
    this.running = true;
    try {
      const base = process.env.INTERVALS_BASE_URL || "https://intervals.icu";
      const athlete = process.env.INTERVALS_ATHLETE_ID || "0";
      const url = new URL(
        `/api/v1/athlete/${encodeURIComponent(athlete)}/activities`,
        base,
      );
      url.searchParams.set("oldest", from);
      url.searchParams.set("newest", to);
      const response = await fetch(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok)
        throw new DomainError(
          "SYNC_PROVIDER",
          response.status === 401 || response.status === 403
            ? "Intervals.icu rejected the server credentials."
            : "Intervals.icu is unavailable. Try again later.",
          502,
        );
      const records = responseSchema.parse(await response.json());
      let created = 0,
        unchanged = 0,
        updated = 0,
        restricted = 0;
      for (const record of records) {
        if (!record.type) {
          restricted++;
          continue;
        }
        const id = String(record.id);
        const legacyHash = createHash("sha256")
          .update(canonical(record))
          .digest("hex");
        const hash = workoutHash(record);
        const previous = this.service.database.sqlite
          .prepare(
            "SELECT activity_id,hash FROM external_activities WHERE provider='intervals' AND external_id=?",
          )
          .get(id) as { activity_id: string; hash: string } | undefined;
        const previousRow = previous
          ? (this.service.database.sqlite
              .prepare("SELECT data FROM activities WHERE id=? AND confirmed=1")
              .get(previous.activity_id) as { data: string } | undefined)
          : undefined;
        const previousRaw = previousRow
          ? JSON.parse(previousRow.data).rawParse
          : null;
        if (
          previous &&
          (previous.hash === hash ||
            previous.hash === legacyHash ||
            (previousRaw &&
              String(previousRaw.id) === id &&
              workoutHash(previousRaw) === hash))
        ) {
          if (previous.hash !== hash)
            this.service.database.sqlite
              .prepare(
                "UPDATE external_activities SET hash=? WHERE provider='intervals' AND external_id=?",
              )
              .run(hash, id);
          unchanged++;
          continue;
        }
        const existingDraft = this.service
          .drafts()
          .find(
            (draft) =>
              draft.external?.provider === "intervals" &&
              draft.external.id === id,
          );
        if (
          existingDraft?.rawParse &&
          typeof existingDraft.rawParse === "object" &&
          workoutHash(existingDraft.rawParse as Record<string, unknown>) ===
            hash
        ) {
          unchanged++;
          continue;
        }
        const start = record.start_date ? new Date(record.start_date) : null;
        const startTime =
          start && !Number.isNaN(start.valueOf()) ? start.toISOString() : null;
        const date = startTime
          ? dateInTimezone(new Date(startTime), this.service.athlete().timezone)
          : (record.start_date_local?.slice(0, 10) ?? null);
        if (!date || !z.iso.date().safeParse(date).success) continue;
        if (date > this.service.today()) continue;
        const duration = record.moving_time ?? record.elapsed_time ?? null;
        const sport = /ride|cycl|bike/i.test(record.type)
          ? "bike"
          : /trail/i.test(record.type)
            ? "trail"
            : /run/i.test(record.type)
              ? "run"
              : /walk|hike/i.test(record.type)
                ? "walk"
                : "other";
        const values: DraftValues = {
          ...emptyValues(date),
          sport: sport as DraftValues["sport"],
          startTime,
          durationSeconds:
            duration && duration > 0 ? Math.round(duration) : null,
          movingSeconds: record.moving_time
            ? Math.round(record.moving_time)
            : null,
          distanceMetres: record.icu_distance ?? record.distance ?? null,
          averageSpeedMetresPerSecond: record.average_speed ?? null,
          averageHeartRate: record.average_heartrate
            ? Math.round(record.average_heartrate)
            : null,
          maxHeartRate: record.max_heartrate
            ? Math.round(record.max_heartrate)
            : null,
          averagePower: record.average_watts ?? null,
          normalizedPower: record.icu_weighted_avg_watts ?? null,
          elevationGainMetres: record.total_elevation_gain ?? null,
          rpe:
            record.icu_rpe && record.icu_rpe >= 1 && record.icu_rpe <= 10
              ? Math.round(record.icu_rpe)
              : null,
          title: record.name ?? null,
        };
        const draft: ImportDraft = {
          id: existingDraft?.id ?? randomUUID(),
          source: "intervals",
          confirmed: false,
          date,
          createdAt:
            existingDraft?.createdAt ?? this.service.now().toISOString(),
          values,
          status: "ready",
          assetIds: [],
          confidence: null,
          uncertainFields: duration ? [] : ["durationSeconds"],
          rawParse: record,
          error: null,
          duplicateIds: [
            ...new Set([
              ...(previous ? [previous.activity_id] : []),
              ...this.imports.candidates(values),
            ]),
          ],
          external: { provider: "intervals", id, hash },
        };
        this.service.saveDraft(draft);
        if (existingDraft || previous) updated++;
        else created++;
      }
      const lastSync = this.service.now().toISOString();
      this.service.database.sqlite
        .prepare(
          "INSERT INTO sync_state (provider,data) VALUES ('intervals',?) ON CONFLICT(provider) DO UPDATE SET data=excluded.data",
        )
        .run(JSON.stringify({ lastSync, error: null }));
      return { created, updated, unchanged, restricted, lastSync };
    } catch (error) {
      const previous = this.service.syncState();
      const message =
        error instanceof DomainError
          ? error.message
          : "The sync response could not be read. Your saved workouts are unchanged.";
      this.service.database.sqlite
        .prepare(
          "INSERT INTO sync_state (provider,data) VALUES ('intervals',?) ON CONFLICT(provider) DO UPDATE SET data=excluded.data",
        )
        .run(JSON.stringify({ lastSync: previous.lastSync, error: message }));
      if (error instanceof DomainError) throw error;
      throw new DomainError("SYNC_PROVIDER", message, 502);
    } finally {
      this.running = false;
    }
  }
}
