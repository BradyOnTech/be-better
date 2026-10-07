import { createHash } from "node:crypto";
import { z } from "zod";
import {
  addDays,
  dateInTimezone,
  weekStart,
  DomainError,
  type AnalysisKind,
  type AnalysisRefreshState,
  type IntervalsAnalysis,
  type IntervalsActivityAnalysis,
  type IntervalsSettings,
  type IntervalsWellness,
  type RecoveryTrend,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";

const number = z.number().finite().nullable().optional();
const numbers = z
  .array(z.number().finite().nonnegative())
  .max(30)
  .nullable()
  .optional();
const names = z.array(z.string().max(100)).max(30).nullable().optional();
const id = z.union([z.string().min(1).max(200), z.number()]);
const activitySchema = z.object({
  id,
  start_date: z.string().nullable().optional(),
  start_date_local: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  name: z.string().max(1000).nullable().optional(),
  source: z.string().nullable().optional(),
  moving_time: number,
  elapsed_time: number,
  icu_training_load: number,
  power_load: number,
  hr_load: number,
  pace_load: number,
  hr_load_type: z.string().nullable().optional(),
  icu_intensity: number,
  icu_weighted_avg_watts: number,
  icu_efficiency_factor: number,
  decoupling: number,
  icu_hr_zone_times: numbers,
  pace_zone_times: numbers,
  icu_zone_times: z
    .array(z.object({ id: z.string(), secs: z.number().nonnegative() }))
    .max(30)
    .nullable()
    .optional(),
  icu_hr_zones: numbers,
  icu_power_zones: numbers,
  pace_zones: numbers,
  icu_ftp: number,
  threshold_pace: number,
  icu_intervals: z
    .array(
      z.object({
        type: z.string().nullable().optional(),
        moving_time: number,
        elapsed_time: number,
        training_load: number,
        average_watts: number,
        average_heartrate: number,
        average_speed: number,
        decoupling: number,
      }),
    )
    .max(500)
    .nullable()
    .optional(),
});
const wellnessSchema = z.object({
  id: z.iso.date(),
  ctl: number,
  atl: number,
  rampRate: number,
  ctlLoad: number,
  atlLoad: number,
  restingHR: number,
  hrv: number,
  hrvSDNN: number,
  sleepSecs: number,
  sleepScore: number,
  soreness: number,
  fatigue: number,
  stress: number,
  mood: number,
  injury: number,
  readiness: number,
  steps: number,
  tempRestingHR: z.boolean().optional(),
});
const settingsSchema = z.object({
  id,
  timezone: z.string().nullable().optional(),
  icu_form_as_percent: z.boolean().optional(),
  sportSettings: z
    .array(
      z.object({
        id,
        types: z.array(z.string()).max(100),
        ftp: number,
        indoor_ftp: number,
        lthr: number,
        max_hr: number,
        threshold_pace: number,
        hr_zones: numbers,
        power_zones: numbers,
        pace_zones: numbers,
        hr_zone_names: names,
        power_zone_names: names,
        pace_zone_names: names,
      }),
    )
    .max(50)
    .optional(),
});
const emptyTrend = (): RecoveryTrend => ({
  latest: null,
  latestDate: null,
  recentAverage: null,
  recentSamples: 0,
  baselineAverage: null,
  baselineSamples: 0,
  changePercent: null,
});
const REFRESH_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;

// Only normalized, explicitly selected fields cross this module's interface.
// The athlete response contains credentials and must never be stored wholesale.
export class IntervalsAnalysisStore {
  private pending: Promise<IntervalsAnalysis> | null = null;
  constructor(private service: CoachService) {}
  get refreshing() {
    return this.pending !== null;
  }
  private connectionId() {
    const key = process.env.INTERVALS_API_KEY;
    return key
      ? createHash("sha256")
          .update(`${process.env.INTERVALS_ATHLETE_ID || "0"}:${key}`)
          .digest("hex")
      : null;
  }
  private read<T>(kind: AnalysisKind): T[] {
    const connection = this.connectionId();
    if (!connection) return [];
    return (
      this.service.database.sqlite
        .prepare(
          "SELECT data FROM intervals_observations WHERE connection_id=? AND kind=? AND date<=? ORDER BY date,record_id",
        )
        .all(connection, kind, this.service.today()) as Array<{ data: string }>
    ).map((row) => JSON.parse(row.data));
  }
  private states(): IntervalsAnalysis["datasets"] {
    const states: IntervalsAnalysis["datasets"] = {
      activities: null,
      wellness: null,
      settings: null,
    };
    const connection = this.connectionId();
    if (connection)
      for (const row of this.service.database.sqlite
        .prepare(
          "SELECT kind,data FROM intervals_refresh_state WHERE connection_id=?",
        )
        .all(connection) as Array<{ kind: AnalysisKind; data: string }>)
        states[row.kind] = JSON.parse(row.data);
    return states;
  }
  private async request(path: string) {
    const response = await fetch(
      new URL(path, process.env.INTERVALS_BASE_URL || "https://intervals.icu"),
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`API_KEY:${process.env.INTERVALS_API_KEY}`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new DomainError(
        "ANALYSIS_PROVIDER",
        response.status === 401 || response.status === 403
          ? "Intervals.icu rejected the connection. Check your key and athlete ID in Settings."
          : response.status === 429
            ? "Intervals.icu requested a pause. Cached analysis is available; retry later."
            : "Intervals.icu analysis is temporarily unavailable. Cached data is retained.",
        502,
      );
    return response.json();
  }
  private normalizeActivity(
    raw: unknown,
    details = false,
  ): IntervalsActivityAnalysis {
    const r = activitySchema.parse(raw);
    const start = r.start_date ? new Date(r.start_date) : null;
    const startTime =
      start && !Number.isNaN(start.valueOf()) ? start.toISOString() : null;
    const date = startTime
      ? dateInTimezone(new Date(startTime), this.service.athlete().timezone)
      : r.start_date_local?.slice(0, 10);
    if (!date || !z.iso.date().safeParse(date).success)
      throw new Error("Invalid activity date");
    const restricted = !r.type;
    return {
      id: String(r.id),
      date,
      startTime,
      type: r.type ?? null,
      title: r.name ?? null,
      source: r.source ?? null,
      restricted,
      durationSeconds: restricted
        ? null
        : (r.moving_time ?? r.elapsed_time ?? null),
      trainingLoad: restricted ? null : (r.icu_training_load ?? null),
      powerLoad: r.power_load ?? null,
      heartRateLoad: r.hr_load ?? null,
      paceLoad: r.pace_load ?? null,
      heartRateLoadMethod: r.hr_load_type ?? null,
      intensityPercent: r.icu_intensity ?? null,
      normalizedPowerWatts: r.icu_weighted_avg_watts ?? null,
      efficiencyFactor: r.icu_efficiency_factor ?? null,
      decouplingPercent: r.decoupling ?? null,
      heartRateZoneSeconds: r.icu_hr_zone_times ?? [],
      powerZoneSeconds: (r.icu_zone_times ?? []).map((zone) => zone.secs),
      paceZoneSeconds: r.pace_zone_times ?? [],
      zoneHeartRateUpperBounds: r.icu_hr_zones ?? [],
      zonePowerPercentages: r.icu_power_zones ?? [],
      zonePacePercentages: r.pace_zones ?? [],
      ftpWatts: r.icu_ftp ?? null,
      thresholdSpeedMetresPerSecond: r.threshold_pace ?? null,
      detailsFetchedAt: details ? this.service.now().toISOString() : null,
      intervals: (r.icu_intervals ?? []).slice(0, 100).map((interval) => ({
        type: interval.type ?? null,
        durationSeconds: interval.moving_time ?? interval.elapsed_time ?? null,
        trainingLoad: interval.training_load ?? null,
        averagePowerWatts: interval.average_watts ?? null,
        averageHeartRate: interval.average_heartrate ?? null,
        averageSpeedMetresPerSecond: interval.average_speed ?? null,
        decouplingPercent: interval.decoupling ?? null,
      })),
    };
  }
  private normalizeWellness(raw: unknown): IntervalsWellness {
    const r = wellnessSchema.parse(raw);
    return {
      date: r.id,
      fitness: r.ctl ?? null,
      fatigue: r.atl ?? null,
      rampRate: r.rampRate ?? null,
      fitnessLoad: r.ctlLoad ?? null,
      fatigueLoad: r.atlLoad ?? null,
      restingHeartRate: r.restingHR ?? null,
      hrvRmssd: r.hrv ?? null,
      hrvSdnn: r.hrvSDNN ?? null,
      sleepSeconds: r.sleepSecs ?? null,
      sleepScore: r.sleepScore ?? null,
      soreness: r.soreness ?? null,
      reportedFatigue: r.fatigue ?? null,
      stress: r.stress ?? null,
      mood: r.mood ?? null,
      injury: r.injury ?? null,
      readiness: r.readiness ?? null,
      steps: r.steps ?? null,
      estimatedRestingHeartRate: !!r.tempRestingHR,
    };
  }
  private normalizeSettings(raw: unknown): IntervalsSettings {
    const r = settingsSchema.parse(raw);
    return {
      accountId: String(r.id),
      timezone: r.timezone ?? null,
      formAsPercent: !!r.icu_form_as_percent,
      prescriptionStatus: "reference_only",
      sports: (r.sportSettings ?? []).map((s) => ({
        id: String(s.id),
        types: s.types,
        ftpWatts: s.ftp ?? null,
        indoorFtpWatts: s.indoor_ftp ?? null,
        thresholdHeartRate: s.lthr ?? null,
        maxHeartRate: s.max_hr ?? null,
        thresholdSpeedMetresPerSecond: s.threshold_pace ?? null,
        heartRateZoneUpperBounds: s.hr_zones ?? [],
        powerZonePercentages: s.power_zones ?? [],
        paceZonePercentages: s.pace_zones ?? [],
        heartRateZoneNames: s.hr_zone_names ?? [],
        powerZoneNames: s.power_zone_names ?? [],
        paceZoneNames: s.pace_zone_names ?? [],
      })),
    };
  }
  private save(
    kind: AnalysisKind,
    records: Array<{ id: string; date: string; data: unknown }>,
    from: string,
    to: string,
  ) {
    const connection = this.connectionId()!;
    const now = this.service.now().toISOString();
    this.service.database.sqlite.transaction(() => {
      this.service.database.sqlite
        .prepare(
          "DELETE FROM intervals_observations WHERE connection_id=? AND kind=? AND date BETWEEN ? AND ?",
        )
        .run(connection, kind, from, to);
      const insert = this.service.database.sqlite.prepare(
        "INSERT INTO intervals_observations (connection_id,kind,record_id,date,data,fetched_at) VALUES (?,?,?,?,?,?) ON CONFLICT(connection_id,kind,record_id) DO UPDATE SET date=excluded.date,data=excluded.data,fetched_at=excluded.fetched_at",
      );
      for (const record of records)
        insert.run(
          connection,
          kind,
          record.id,
          record.date,
          JSON.stringify(record.data),
          now,
        );
    })();
  }
  private saveState(kind: AnalysisKind, state: AnalysisRefreshState) {
    this.service.database.sqlite
      .prepare(
        "INSERT INTO intervals_refresh_state(connection_id,kind,data) VALUES (?,?,?) ON CONFLICT(connection_id,kind) DO UPDATE SET data=excluded.data",
      )
      .run(this.connectionId()!, kind, JSON.stringify(state));
  }
  async refreshIfStale() {
    if (!this.connectionId()) return this.summary();
    const states = Object.values(this.states());
    const now = this.service.now().valueOf();
    if (
      states.every(
        (s) => s?.lastSuccess && now - Date.parse(s.lastSuccess) < REFRESH_MS,
      )
    )
      return this.summary();
    if (states.every((s) => s && now - Date.parse(s.lastAttempt) < RETRY_MS))
      return this.summary();
    return this.refresh();
  }
  refresh(backfill = false): Promise<IntervalsAnalysis> {
    if (this.pending) return this.pending;
    if (!this.connectionId())
      return Promise.reject(
        new DomainError(
          "SYNC_CONFIG",
          "Connect Intervals.icu in Settings before refreshing analysis.",
          400,
        ),
      );
    this.pending = this.performRefresh(backfill).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  private async performRefresh(backfill: boolean) {
    const states = this.states();
    const today = this.service.today();
    const athlete = encodeURIComponent(process.env.INTERVALS_ATHLETE_ID || "0");
    const base = `/api/v1/athlete/${athlete}`;
    await Promise.all(
      (["settings", "wellness", "activities"] as AnalysisKind[]).map(
        async (kind) => {
          const previous = states[kind];
          const from =
            kind === "settings"
              ? today
              : addDays(today, backfill || !previous?.lastSuccess ? -179 : -27);
          const attempt = this.service.now().toISOString();
          try {
            if (kind === "settings") {
              const value = this.normalizeSettings(await this.request(base));
              this.save(
                kind,
                [{ id: "athlete", date: today, data: value }],
                today,
                today,
              );
            } else if (kind === "wellness") {
              const raw = z
                .array(z.unknown())
                .max(400)
                .parse(
                  await this.request(
                    `${base}/wellness?oldest=${from}&newest=${today}`,
                  ),
                );
              const values = raw
                .map((r) => this.normalizeWellness(r))
                .filter((r) => r.date >= from && r.date <= today);
              this.save(
                kind,
                values.map((r) => ({ id: r.date, date: r.date, data: r })),
                from,
                today,
              );
            } else {
              const values: IntervalsActivityAnalysis[] = [];
              for (let date = from; date <= today; date = addDays(date, 28)) {
                const to = [addDays(date, 27), today].sort()[0];
                const raw = z
                  .array(z.unknown())
                  .max(2000)
                  .parse(
                    await this.request(
                      `${base}/activities?oldest=${date}&newest=${to}`,
                    ),
                  );
                for (const r of raw) {
                  const value = this.normalizeActivity(r);
                  if (value.date >= from && value.date <= today)
                    values.push(value);
                }
              }
              const unique = [
                ...new Map(values.map((r) => [r.id, r])).values(),
              ];
              // Keep detailed intervals only while the list's relevant analysis is unchanged.
              const old = new Map(
                this.read<IntervalsActivityAnalysis>("activities").map((r) => [
                  r.id,
                  r,
                ]),
              );
              for (const r of unique) {
                const before = old.get(r.id);
                if (
                  before?.detailsFetchedAt &&
                  before.trainingLoad === r.trainingLoad &&
                  before.durationSeconds === r.durationSeconds &&
                  before.intensityPercent === r.intensityPercent
                ) {
                  r.intervals = before.intervals;
                  r.detailsFetchedAt = before.detailsFetchedAt;
                }
              }
              this.save(
                kind,
                unique.map((r) => ({ id: r.id, date: r.date, data: r })),
                from,
                today,
              );
            }
            const all = this.read<{ restricted?: boolean }>(kind);
            this.saveState(kind, {
              lastAttempt: attempt,
              lastSuccess: this.service.now().toISOString(),
              historyFrom:
                previous?.historyFrom && previous.historyFrom < from
                  ? previous.historyFrom
                  : from,
              historyTo: today,
              records: all.length,
              restricted: all.filter((r) => r.restricted).length,
              error: null,
            });
          } catch (error) {
            const message =
              error instanceof DomainError
                ? error.message
                : error instanceof z.ZodError
                  ? "Intervals.icu returned unexpected analysis fields. Cached data is retained."
                  : "Could not refresh this Intervals.icu dataset. Cached data is retained; retry later.";
            this.saveState(kind, {
              lastAttempt: attempt,
              lastSuccess: previous?.lastSuccess ?? null,
              historyFrom: previous?.historyFrom ?? null,
              historyTo: previous?.historyTo ?? null,
              records: previous?.records ?? 0,
              restricted: previous?.restricted ?? 0,
              error: message,
            });
          }
        },
      ),
    );
    return { ...this.summary(), refreshing: false };
  }
  async activityDetails(activityId: string) {
    const connection = this.connectionId();
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(activityId))
      throw new DomainError(
        "ANALYSIS_ID",
        "Choose an imported Intervals activity.",
        400,
      );
    const current = this.read<IntervalsActivityAnalysis>("activities").find(
      (r) => r.id === activityId,
    );
    if (!current)
      throw new DomainError(
        "ANALYSIS_ID",
        "This activity is not in the connected account’s analysis.",
        404,
      );
    if (current.restricted)
      throw new DomainError(
        "ANALYSIS_RESTRICTED",
        "Intervals.icu does not expose detailed analysis for this activity.",
        422,
      );
    if (
      current.detailsFetchedAt &&
      this.service.now().valueOf() - Date.parse(current.detailsFetchedAt) <
        REFRESH_MS
    )
      return current;
    const result = this.normalizeActivity(
      await this.request(
        `/api/v1/activity/${encodeURIComponent(activityId)}?intervals=true`,
      ),
      true,
    );
    if (this.connectionId() !== connection)
      throw new DomainError(
        "ANALYSIS_CHANGED",
        "The connection changed. Read the new account’s analysis.",
        409,
      );
    if (result.id !== current.id || result.date > this.service.today())
      throw new DomainError(
        "ANALYSIS_PROVIDER",
        "Intervals.icu returned a different activity.",
        502,
      );
    this.service.database.sqlite
      .prepare(
        "UPDATE intervals_observations SET data=?,fetched_at=? WHERE connection_id=? AND kind='activities' AND record_id=?",
      )
      .run(
        JSON.stringify(result),
        this.service.now().toISOString(),
        connection!,
        activityId,
      );
    return result;
  }
  private recoveryTrend(
    records: IntervalsWellness[],
    field: "hrvRmssd" | "restingHeartRate" | "sleepSeconds",
  ): RecoveryTrend {
    const today = this.service.today();
    const valid = records.filter(
      (r) =>
        r[field] !== null &&
        !(field === "restingHeartRate" && r.estimatedRestingHeartRate),
    );
    const recent = valid.filter((r) => r.date >= addDays(today, -6));
    const baseline = valid.filter(
      (r) => r.date >= addDays(today, -34) && r.date < addDays(today, -6),
    );
    const mean = (list: IntervalsWellness[]) =>
      list.length
        ? list.reduce((sum, r) => sum + r[field]!, 0) / list.length
        : null;
    const recentAverage = mean(recent),
      baselineAverage = mean(baseline),
      latest = recent.at(-1);
    return {
      latest: latest?.[field] ?? null,
      latestDate: latest?.date ?? null,
      recentAverage,
      recentSamples: recent.length,
      baselineAverage,
      baselineSamples: baseline.length,
      changePercent:
        recent.length >= 3 &&
        baseline.length >= 7 &&
        baselineAverage !== null &&
        baselineAverage > 0 &&
        recentAverage !== null
          ? (100 * (recentAverage - baselineAverage)) / baselineAverage
          : null,
    };
  }
  summary(): IntervalsAnalysis {
    const today = this.service.today();
    const configured = !!this.connectionId();
    const datasets = this.states();
    const settings = this.read<IntervalsSettings>("settings").at(-1) ?? null;
    const wellness = this.read<IntervalsWellness>("wellness");
    const activities = this.read<IntervalsActivityAnalysis>("activities");
    const latestWellness = wellness.at(-1) ?? null;
    const from = addDays(today, -27);
    const recent = activities.filter((r) => r.date >= from);
    const usable = recent.filter((r) => !r.restricted);
    const mappings = this.service.database.sqlite
      .prepare(
        "SELECT e.external_id,e.activity_id FROM external_activities e JOIN activities a ON a.id=e.activity_id AND a.confirmed=1 WHERE e.provider='intervals'",
      )
      .all() as Array<{ external_id: string; activity_id: string }>;
    const isLinked = (r: IntervalsActivityAnalysis) =>
      mappings.some(
        (m) =>
          m.external_id === r.id ||
          m.external_id === `${settings?.accountId}:${r.id}`,
      );
    const linked = new Set(
      mappings
        .filter((m) =>
          usable.some(
            (r) =>
              m.external_id === r.id ||
              m.external_id === `${settings?.accountId}:${r.id}`,
          ),
        )
        .map((m) => m.activity_id),
    );
    const unreviewed = usable.filter((r) => !isLinked(r)).length;
    const confirmed = this.service.activities(from, today);
    const limitations: string[] = [];
    const stale =
      configured &&
      Object.values(datasets).some(
        (s) =>
          !s?.lastSuccess ||
          !!s.error ||
          this.service.now().valueOf() - Date.parse(s.lastSuccess) > REFRESH_MS,
      );
    if (configured) {
      if (stale)
        limitations.push(
          "Some analysis is stale or unavailable. Check dataset dates and errors.",
        );
      if (!usable.length)
        limitations.push(
          "No usable activity analysis is available for the last four weeks. This does not establish that no training occurred.",
        );
      if (recent.some((r) => r.restricted))
        limitations.push(
          "Some provider activities have restricted detail, including Strava-sourced records. They are not zero-load workouts.",
        );
      if (confirmed.some((r) => !linked.has(r.id)))
        limitations.push(
          "Some confirmed Be Better workouts have no linked Intervals analysis; provider load may not cover the whole log.",
        );
      if (unreviewed > 0)
        limitations.push(
          "Provider analysis includes activities not yet linked to confirmed Be Better workouts. Do not add them to confirmed totals.",
        );
      if (
        settings?.timezone &&
        settings.timezone !== this.service.athlete().timezone
      )
        limitations.push(
          `Wellness civil dates use ${settings.timezone}; the Be Better log uses ${this.service.athlete().timezone}.`,
        );
      limitations.push(
        "Intervals load and fitness/fatigue are provider estimates. Local duration/RPE load uses a separate scale; never add the two.",
      );
      limitations.push(
        "Imported zones and thresholds are reference data until reviewed in Training settings. Fitness/fatigue alone does not establish readiness or authorize hard training.",
      );
    }
    const form =
      latestWellness?.fitness !== null &&
      latestWellness?.fatigue !== null &&
      latestWellness
        ? {
            absolute: latestWellness.fitness - latestWellness.fatigue,
            percent:
              latestWellness.fitness > 0
                ? (100 * (latestWellness.fitness - latestWellness.fatigue)) /
                  latestWellness.fitness
                : null,
            displayAsPercent: settings?.formAsPercent ?? false,
          }
        : null;
    return {
      configured,
      accountId: settings?.accountId ?? null,
      generatedAt: this.service.now().toISOString(),
      refreshing: this.refreshing,
      stale,
      datasets,
      settings,
      latestWellness,
      form,
      recovery: configured
        ? {
            hrv: this.recoveryTrend(wellness, "hrvRmssd"),
            restingHeartRate: this.recoveryTrend(wellness, "restingHeartRate"),
            sleep: this.recoveryTrend(wellness, "sleepSeconds"),
          }
        : {
            hrv: emptyTrend(),
            restingHeartRate: emptyTrend(),
            sleep: emptyTrend(),
          },
      fitnessTrend: wellness
        .slice(-14)
        .map(({ date, fitness, fatigue, rampRate }) => ({
          date,
          fitness,
          fatigue,
          rampRate,
        })),
      weeks: Array.from({ length: 6 }, (_, i) => {
        const date = addDays(weekStart(today), -7 * (5 - i));
        const list = activities.filter(
          (r) => r.date >= date && r.date <= addDays(date, 6),
        );
        const known = list.filter(
          (r) => !r.restricted && r.trainingLoad !== null,
        );
        const timed = list.filter(
          (r) => !r.restricted && r.durationSeconds !== null,
        );
        return {
          date,
          activities: list.filter((r) => !r.restricted).length,
          knownLoadActivities: known.length,
          restrictedActivities: list.filter((r) => r.restricted).length,
          trainingLoad: known.length
            ? known.reduce((sum, r) => sum + r.trainingLoad!, 0)
            : null,
          durationSeconds: timed.length
            ? timed.reduce((sum, r) => sum + r.durationSeconds!, 0)
            : null,
        };
      }),
      recentActivities: usable
        .slice(-14)
        .reverse()
        .map((r) => ({ ...r, intervals: r.intervals.slice(0, 12) })),
      coverage: {
        from,
        to: today,
        providerActivities: usable.length,
        linkedConfirmedActivities: linked.size,
        unreviewedProviderActivities: unreviewed,
        confirmedWithoutProviderAnalysis: confirmed.filter(
          (r) => !linked.has(r.id),
        ).length,
        restrictedActivities: recent.filter((r) => r.restricted).length,
      },
      limitations,
      wellnessRatingScales: {
        sorenessFatigueStress: "0 none, 1 low, 2 average, 3 high, 4 extreme",
        mood: "1 excellent, 2 good, 3 average, 4 poor",
        injury:
          "1 excellent, 2 niggle, 3 poor, 4 injured; provider observation, not a diagnosis or an automatic change to the local injury flag",
        readiness:
          "Provider-defined score; scale is not standardized. Do not infer a readiness category from the number alone.",
      },
    };
  }
}
