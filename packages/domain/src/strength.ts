import { z } from "zod";

export const strengthSetSchema = z
  .object({
    reps: z.number().int().min(1).max(1000).nullable(),
    durationSeconds: z.number().int().min(1).max(7200).nullable(),
    weight: z.number().finite().min(0).max(2000).nullable(),
  })
  .refine(
    (set) => (set.reps !== null) !== (set.durationSeconds !== null),
    "Each recorded set needs either repetitions or a duration in seconds.",
  );
export const strengthExerciseSchema = z.object({
  name: z.string().trim().min(1).max(100),
  weightUnit: z.enum(["lb", "kg"]),
  sets: z.array(strengthSetSchema).max(40),
  notes: z.string().trim().max(500).nullable(),
});
export type StrengthExercise = z.infer<typeof strengthExerciseSchema>;
export type StrengthSet = z.infer<typeof strengthSetSchema>;

export function strengthSummary(exercises: StrengthExercise[]) {
  const sets = exercises.reduce(
    (sum, exercise) => sum + exercise.sets.length,
    0,
  );
  return `${exercises.map((exercise) => exercise.name).join(" · ")}${sets ? ` · ${sets} sets` : ""}`;
}
