import { z } from "zod";
import type { PlanInput, PlanSession, Phase } from "./index.js";

export const programChoiceSchema = z.object({
  patternId: z.string().min(1).max(100),
  goal: z.string().trim().min(1).max(300),
  startDate: z.iso.date(),
  weeks: z.number().int().min(2).max(24),
  trainingDays: z
    .array(z.number().int().min(0).max(6))
    .min(2)
    .max(6)
    .refine(
      (days) => new Set(days).size === days.length,
      "Choose each training day once.",
    ),
  weeklyMinutes: z.number().int().min(30).max(3000),
  includeStrength: z.boolean(),
  targetDate: z.iso.date().nullable(),
});
export type ProgramChoice = z.infer<typeof programChoiceSchema>;
export function programWeekShape(
  choice: ProgramChoice,
  index: number,
  phases: readonly Phase[],
) {
  const daysOut = choice.targetDate
    ? Math.round(
        (Date.parse(choice.targetDate) -
          Date.parse(choice.startDate) -
          index * 7 * 86400000) /
          86400000,
      )
    : Infinity;
  const proposed =
    choice.patternId === "post-race"
      ? "recovery"
      : daysOut < 0
        ? "recovery"
        : daysOut <= 13
          ? "taper"
          : index < Math.ceil(choice.weeks / 3)
            ? "base"
            : index < Math.ceil((choice.weeks * 2) / 3)
              ? "build"
              : "specific";
  const phase =
    ["taper", "recovery"].includes(proposed) || phases.includes(proposed)
      ? proposed
      : phases[0];
  return {
    phase,
    cutback: index % 4 === 3 && !["taper", "recovery"].includes(phase),
    daysOut,
  };
}
export interface TrainingProgram extends ProgramChoice {
  id: string;
  title: string;
  endDate: string;
  status: "active" | "ended" | "completed";
  createdAt: string;
}
export interface ProgramPreview {
  previewKey: string;
  choice: ProgramChoice;
  title: string;
  endDate: string;
  sessions: PlanInput[];
  warnings: string[];
  retained: PlanSession[];
  weeks: Array<{
    number: number;
    startDate: string;
    minutes: number;
    phase: string;
    cutback: boolean;
  }>;
}
export interface ProgramProgress {
  week: number;
  total: number;
  completed: number;
  modified: number;
  replaced: number;
  skipped: number;
  outstanding: number;
}
export const planDecisionSchema = z
  .object({
    outcome: z.enum(["completed", "modified", "replaced", "additional"]),
    sessionId: z.string().nullable(),
    version: z.number().int().positive().nullable(),
    reason: z.string().trim().min(1).max(1000),
  })
  .refine(
    (value) =>
      value.outcome === "additional"
        ? value.sessionId === null
        : value.sessionId !== null && value.version !== null,
    "Choose the planned session and its current version.",
  );
export type PlanDecision = z.infer<typeof planDecisionSchema>;
export function sessionStatusLabel(
  session: Pick<PlanSession, "status" | "outcome">,
) {
  if (session.outcome === "completed") return "Completed as planned";
  if (session.outcome === "modified") return "Modified";
  if (session.outcome === "replaced") return "Replaced";
  if (session.status === "done") return "Logged";
  if (session.status === "skipped") return "Skipped";
  return session.status === "accepted" ? "Scheduled" : "Proposed";
}
