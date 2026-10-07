import { z } from "zod";
import type { IntervalsAnalysis } from "./analysis.js";
import { strengthExerciseSchema } from "./strength.js";
import type { TrainingProgram, ProgramProgress } from "./training-program.js";
export * from "./training-program.js";
export * from "./strength.js";
export type * from "./analysis.js";

export const civilDate = z.iso.date();
export const sportSchema = z.enum([
  "run",
  "trail",
  "bike",
  "walk",
  "strength",
  "other",
]);
export const intentSchema = z.enum([
  "rest",
  "easy",
  "long",
  "quality",
  "endurance",
  "hills",
  "race",
  "strength",
  "back-to-back",
]);
const weekday = z.number().int().min(0).max(6);
export const zoneSchema = z
  .object({
    name: z.string().trim().min(1).max(40),
    low: z.number().positive(),
    high: z.number().positive(),
  })
  .refine(
    (zone) => zone.low <= zone.high,
    "Zone bounds must be ordered from low to high",
  );
export const zonesSchema = z.object({
  pace: z.array(zoneSchema).max(10).default([]),
  heartRate: z.array(zoneSchema).max(10).default([]),
  power: z.array(zoneSchema).max(10).default([]),
});
export const thresholdSchema = z.object({
  value: z.number().positive(),
  source: z.enum(["tested", "estimated", "told"]),
  date: civilDate,
});
export const athleteSchema = z.object({
  id: z.literal("athlete"),
  name: z.string().trim().max(60),
  timezone: z.string().refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid timezone"),
  units: z.enum(["mi", "km"]),
  longRunDay: weekday,
  restDays: z.array(weekday).max(7),
  weeklyMinutes: z.number().int().min(30).max(3000).nullable(),
  longestRunMinutes: z.number().int().min(10).max(1440).nullable(),
  constraint: z.enum(["none", "niggle", "injury", "travel"]),
  constraintNote: z.string().max(500),
  constraintRegion: z.string().max(100).default(""),
  constraintDate: civilDate.nullable().default(null),
  zones: zonesSchema.default({ pace: [], heartRate: [], power: [] }),
  thresholds: z
    .object({
      pace: thresholdSchema.nullable().default(null),
      heartRate: thresholdSchema.nullable().default(null),
      ftp: thresholdSchema.nullable().default(null),
    })
    .default({ pace: null, heartRate: null, ftp: null }),
  availableHours: z.number().min(0.5).max(60).nullable().default(null),
  readiness: z
    .object({
      date: civilDate,
      sleep: z.enum(["poor", "okay", "good"]),
      soreness: z.enum(["none", "some", "high"]),
      mood: z.string().max(150),
    })
    .nullable()
    .default(null),
});
export const athletePatchSchema = athleteSchema
  .omit({ id: true })
  .partial()
  .extend({
    zones: zonesSchema.partial().optional(),
    thresholds: athleteSchema.shape.thresholds.unwrap().partial().optional(),
  });
export type Athlete = z.infer<typeof athleteSchema>;

export const activityInputSchema = z.object({
  date: civilDate,
  sport: sportSchema,
  durationSeconds: z.number().int().positive().max(259200),
  distanceMetres: z.number().nonnegative().max(2000000).nullable(),
  rpe: z.number().int().min(1).max(10).nullable(),
  intent: intentSchema.exclude(["rest"]),
  feel: z.string().max(500).nullable(),
  pain: z.string().max(500).nullable(),
  startTime: z.iso.datetime({ offset: true }).nullable().optional(),
  movingSeconds: z
    .number()
    .int()
    .nonnegative()
    .max(259200)
    .nullable()
    .optional(),
  elevationGainMetres: z
    .number()
    .nonnegative()
    .max(50000)
    .nullable()
    .optional(),
  averageHeartRate: z.number().int().min(20).max(250).nullable().optional(),
  maxHeartRate: z.number().int().min(20).max(250).nullable().optional(),
  averagePower: z.number().nonnegative().max(5000).nullable().optional(),
  averageSpeedMetresPerSecond: z
    .number()
    .positive()
    .max(100)
    .nullable()
    .optional(),
  normalizedPower: z.number().nonnegative().max(5000).nullable().optional(),
  cadence: z.number().nonnegative().max(300).nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  gear: z.string().max(100).nullable().optional(),
  treadmill: z.boolean().optional(),
  strengthExercises: z.array(strengthExerciseSchema).max(30).optional(),
});
export const activitySchema = activityInputSchema.extend({
  id: z.string(),
  source: z.enum(["manual", "photo", "file", "strava", "intervals"]),
  confirmed: z.boolean(),
  createdAt: z.string(),
  planSessionId: z.string().nullable(),
  planDecision: z.enum(["additional", "reviewed"]).optional(),
  assetIds: z.array(z.string()).optional(),
  rawParse: z.unknown().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;
export type Activity = z.infer<typeof activitySchema>;

const planBase = z.object({
  date: civilDate,
  sport: sportSchema.or(z.literal("rest")),
  intent: intentSchema,
  durationSeconds: z.number().int().min(0).max(86400),
  rpeTarget: z.number().int().min(0).max(10),
  title: z.string().trim().min(1).max(100),
  prescription: z.string().trim().min(1).max(1500),
  reason: z.string().trim().min(1).max(1000),
  blockId: z.string().nullable().optional(),
  programId: z.string().nullable().optional(),
  exampleWorkoutId: z.string().nullable().optional(),
  linkedDate: civilDate.nullable().optional(),
  steps: z
    .array(
      z
        .object({
          kind: z.enum(["warmup", "work", "recover", "cooldown", "free"]),
          durationSeconds: z.number().int().positive().max(86400).nullable(),
          distanceMetres: z.number().positive().max(200000).nullable(),
          repeats: z.number().int().min(1).max(100).default(1),
          target: z
            .object({
              metric: z.enum(["rpe", "pace", "heartRate", "power"]),
              low: z.number().positive(),
              high: z.number().positive(),
            })
            .refine(
              (target) => target.low <= target.high,
              "Target bounds must be ordered",
            )
            .nullable(),
        })
        .refine(
          (step) =>
            (step.durationSeconds !== null) !== (step.distanceMetres !== null),
          "A step needs either time or distance",
        ),
    )
    .max(100)
    .optional(),
});
function validateRest(value: z.infer<typeof planBase>, ctx: z.RefinementCtx) {
  if (
    value.intent === "rest" &&
    (value.sport !== "rest" ||
      value.durationSeconds !== 0 ||
      value.rpeTarget !== 0)
  )
    ctx.addIssue({
      code: "custom",
      message:
        "A rest session must have sport rest, zero duration, and zero effort",
    });
  if (
    value.intent !== "rest" &&
    (value.sport === "rest" ||
      value.durationSeconds === 0 ||
      value.rpeTarget === 0)
  )
    ctx.addIssue({
      code: "custom",
      message: "A workout needs a sport, duration, and effort target",
    });
}
export const planInputSchema = planBase.superRefine(validateRest);
export const planSessionSchema = planBase
  .extend({
    id: z.string(),
    status: z.enum(["proposed", "accepted", "done", "skipped"]),
    version: z.number().int().positive(),
    activityId: z.string().nullable(),
    updatedAt: z.string(),
    outcome: z
      .enum(["completed", "modified", "replaced", "skipped"])
      .optional(),
    outcomeReason: z.string().optional(),
  })
  .superRefine(validateRest);
export type PlanInput = z.infer<typeof planInputSchema>;
export type PlanSession = z.infer<typeof planSessionSchema>;
export const noteSchema = z.object({
  id: z.string(),
  kind: z.enum(["decision", "preference", "observation", "answer", "question"]),
  key: z.string().nullable(),
  text: z.string(),
  createdAt: z.string(),
  sessionId: z.string().nullable(),
  previous: z.unknown().nullable(),
});
export type CoachNote = z.infer<typeof noteSchema>;

export const raceInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  sport: z.enum(["run", "trail", "bike"]),
  date: civilDate,
  distanceMetres: z.number().positive().max(2000000),
  elevationGainMetres: z.number().nonnegative().nullable(),
  priority: z.enum(["A", "B", "C"]),
  goal: z.string().max(500),
  terrainNotes: z.string().max(1500),
});
export type RaceInput = z.infer<typeof raceInputSchema>;
export type Race = RaceInput & { id: string; createdAt: string };
export type Phase = "base" | "build" | "specific" | "taper" | "recovery";
export interface PlanBlock {
  id: string;
  raceId: string | null;
  startDate: string;
  endDate: string;
  phase: Phase;
  weeklyMinutes: number;
  longMinutes: number;
  reason: string;
  cutback: boolean;
}
export interface CoachQuestion {
  id: string;
  key: string;
  priority: number;
  text: string;
  activityId: string | null;
  sessionId: string | null;
  raceId: string | null;
  createdAt: string;
  answeredAt: string | null;
  answer: string | null;
}
export const draftValuesSchema = activityInputSchema.partial().extend({
  date: civilDate.nullable(),
  sport: sportSchema.nullable(),
  durationSeconds: z.number().int().positive().max(259200).nullable(),
});
export type DraftValues = z.infer<typeof draftValuesSchema>;
export interface ImportDraft {
  id: string;
  confirmed: false;
  source: "photo" | "file" | "intervals" | "strava";
  date: string;
  createdAt: string;
  values: DraftValues;
  assetIds: string[];
  status: "processing" | "ready" | "error";
  confidence: number | null;
  uncertainFields: string[];
  rawParse: unknown;
  error: string | null;
  duplicateIds: string[];
  external: {
    provider: "intervals" | "strava";
    id: string;
    hash: string;
  } | null;
}
export interface Asset {
  id: string;
  filename: string;
  mime: string;
  size: number;
  hash: string;
  createdAt: string;
}

export interface AppState {
  today: string;
  athlete: Athlete;
  activities: Activity[];
  plan: PlanSession[];
  program: TrainingProgram | null;
  programProgress: ProgramProgress | null;
  planReviews: Array<{ activity: Activity; sessions: PlanSession[] }>;
  notes: CoachNote[];
  drafts: ImportDraft[];
  races: Race[];
  block: PlanBlock | null;
  blocks: PlanBlock[];
  questions: CoachQuestion[];
  sync: {
    provider: "intervals";
    configured: boolean;
    lastSync: string | null;
    error: string | null;
  };
  analysis: IntervalsAnalysis;
  stats: {
    weeklySeconds: number;
    weeklyDistanceMetres: number;
    weeklyActivities: number;
    previousWeeklySeconds: number;
    acuteLoad: number;
    fourWeekAverageLoad: number;
    loadEstimated: boolean;
  };
  coach: { mode: "guided" | "model"; model: string | null };
}

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 422,
  ) {
    super(message);
  }
}

export function dateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function dayOfWeek(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function weekStart(date: string): string {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}
export function isHard(session: {
  intent: string;
  rpeTarget?: number;
  rpe?: number | null;
  steps?: { target?: { metric: string; low: number; high: number } | null }[];
}): boolean {
  return (
    ["quality", "hills", "race"].includes(session.intent) ||
    (session.rpeTarget ?? session.rpe ?? 0) >= 7 ||
    !!session.steps?.some(
      (step) => step.target?.metric === "rpe" && step.target.high >= 7,
    )
  );
}
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`
    : `${minutes} min`;
}
export function formatDistance(metres: number, units: "mi" | "km"): string {
  return `${(metres / (units === "mi" ? 1609.344 : 1000)).toFixed(1)} ${units}`;
}

export * from "./programs.js";
