import { useState } from "react";
import { Plus, Trash2, Copy } from "lucide-react";
import type {
  StrengthExercise,
  StrengthSet,
} from "../../../packages/domain/src/index.js";

type SetRow = StrengthSet & { key: string; measure: "reps" | "seconds" };
type Row = Omit<StrengthExercise, "sets"> & { key: string; sets: SetRow[] };
const blankSet = (): SetRow => ({
  key: crypto.randomUUID(),
  measure: "reps",
  reps: null,
  durationSeconds: null,
  weight: null,
});
const rows = (exercises: StrengthExercise[]): Row[] =>
  exercises.map((e) => ({
    ...e,
    key: crypto.randomUUID(),
    sets: e.sets.length
      ? e.sets.map((s) => ({
          ...s,
          key: crypto.randomUUID(),
          measure: s.durationSeconds !== null ? "seconds" : "reps",
        }))
      : [blankSet()],
  }));
const number = (value: string) => (value === "" ? null : Number(value));

export function StrengthEditor({
  initial,
  unit,
  previous,
  changed,
}: {
  initial: StrengthExercise[];
  unit: "lb" | "kg";
  previous?: StrengthExercise[];
  changed: (exercises: StrengthExercise[]) => void;
}) {
  const [exercises, setExercises] = useState(() => rows(initial));
  function update(next: Row[]) {
    setExercises(next);
    changed(
      next.map(({ key, sets, ...exercise }) => ({
        ...exercise,
        sets: sets.map(({ key, measure, ...set }) => set),
      })),
    );
  }
  function change(index: number, patch: Partial<Row>) {
    update(exercises.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }
  function set(index: number, setIndex: number, patch: Partial<SetRow>) {
    change(index, {
      sets: exercises[index].sets.map((s, i) =>
        i === setIndex ? { ...s, ...patch } : s,
      ),
    });
  }
  return (
    <section className="strength-editor" aria-labelledby="strength-heading">
      <h3 id="strength-heading">Exercises and sets</h3>
      <p className="muted">
        Record what you did. Leave weight blank when unknown, or use 0 for
        bodyweight. Use notes for equipment, assistance, or weight per hand.
      </p>
      {previous?.length ? (
        <button
          type="button"
          className="text-button"
          onClick={() => update(rows(previous))}
        >
          <Copy size={14} /> Copy last exercises and sets
        </button>
      ) : null}
      {previous?.length ? (
        <p className="muted">
          Check the copied sets against today's workout before saving.
        </p>
      ) : null}
      {exercises.map((exercise, index) => (
        <fieldset key={exercise.key} className="strength-exercise">
          <legend>Exercise {index + 1}</legend>
          <div className="strength-exercise-heading">
            <label>
              Exercise name
              <input
                aria-label={`Exercise ${index + 1} name`}
                value={exercise.name}
                maxLength={100}
                placeholder="Squat, row, plank…"
                onChange={(e) => change(index, { name: e.target.value })}
              />
            </label>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove exercise ${index + 1}`}
              onClick={() => update(exercises.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <label>
            Weight unit
            <select
              aria-label={`Exercise ${index + 1} units`}
              value={exercise.weightUnit}
              onChange={(e) => {
                const weightUnit = e.target.value as Row["weightUnit"];
                const factor =
                  weightUnit === "kg" ? 0.45359237 : 1 / 0.45359237;
                change(index, {
                  weightUnit,
                  sets: exercise.sets.map((s) => ({
                    ...s,
                    weight:
                      s.weight === null
                        ? null
                        : Number((s.weight * factor).toFixed(3)),
                  })),
                });
              }}
            >
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </label>
          <div className="strength-set-labels">
            <span>Set</span>
            <span>Reps / seconds</span>
            <span>Weight ({exercise.weightUnit})</span>
            <span />
          </div>
          {exercise.sets.map((s, setIndex) => (
            <div className="strength-set" key={s.key}>
              <span>{setIndex + 1}</span>
              <div className="strength-count">
                <select
                  aria-label={`Exercise ${index + 1} set ${setIndex + 1} measure`}
                  value={s.measure}
                  onChange={(e) =>
                    set(index, setIndex, {
                      measure: e.target.value as SetRow["measure"],
                      reps: null,
                      durationSeconds: null,
                    })
                  }
                >
                  <option value="reps">Reps</option>
                  <option value="seconds">Seconds</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={s.measure === "reps" ? 1000 : 7200}
                  step={1}
                  aria-label={`Exercise ${index + 1} set ${setIndex + 1} ${s.measure}`}
                  value={
                    (s.measure === "reps" ? s.reps : s.durationSeconds) ?? ""
                  }
                  placeholder="—"
                  required={s.weight !== null}
                  onChange={(e) =>
                    set(
                      index,
                      setIndex,
                      s.measure === "reps"
                        ? {
                            reps: number(e.target.value),
                            durationSeconds: null,
                          }
                        : {
                            reps: null,
                            durationSeconds: number(e.target.value),
                          },
                    )
                  }
                />
              </div>
              <input
                type="number"
                min={0}
                max={2000}
                step="any"
                aria-label={`Exercise ${index + 1} set ${setIndex + 1} weight`}
                value={s.weight ?? ""}
                placeholder="Optional"
                onChange={(e) =>
                  set(index, setIndex, { weight: number(e.target.value) })
                }
              />
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove exercise ${index + 1} set ${setIndex + 1}`}
                onClick={() =>
                  change(index, {
                    sets: exercise.sets.filter((_, i) => i !== setIndex),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-button"
            disabled={exercise.sets.length >= 40}
            onClick={() =>
              change(index, {
                sets: [
                  ...exercise.sets,
                  {
                    ...(exercise.sets.at(-1) ?? blankSet()),
                    key: crypto.randomUUID(),
                  },
                ],
              })
            }
          >
            <Plus size={14} /> Add set to exercise {index + 1}
          </button>
          <label>
            Exercise notes
            <input
              aria-label={`Exercise ${index + 1} notes`}
              value={exercise.notes ?? ""}
              maxLength={500}
              placeholder="Optional: per side, equipment, assistance…"
              onChange={(e) => change(index, { notes: e.target.value || null })}
            />
          </label>
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary-button"
        disabled={exercises.length >= 30}
        onClick={() =>
          update([
            ...exercises,
            {
              key: crypto.randomUUID(),
              name: "",
              weightUnit: unit,
              sets: [blankSet()],
              notes: null,
            },
          ])
        }
      >
        <Plus size={15} /> Add exercise
      </button>
    </section>
  );
}
