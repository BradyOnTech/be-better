import { useState, type FormEvent } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { api, operationId } from "./api.js";
import type {
  PlanInput,
  PlanSession,
} from "../../../packages/domain/src/index.js";
type Step = NonNullable<PlanInput["steps"]>[number] & { key: string };
const freeStep = (seconds = 1800): Step => ({
  key: crypto.randomUUID(),
  kind: "free",
  durationSeconds: seconds,
  distanceMetres: null,
  repeats: 1,
  target: { metric: "rpe", low: 3, high: 3 },
});
export function WorkoutEditor({
  today,
  initial,
  close,
  saved,
}: {
  today: string;
  initial?: PlanSession;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [steps, setSteps] = useState<Step[]>(
    initial?.steps?.length
      ? initial.steps.map((step) => ({ ...step, key: crypto.randomUUID() }))
      : [freeStep(initial?.durationSeconds || 1800)],
  );
  const [intent, setIntent] = useState<PlanInput["intent"]>(
    initial?.intent ?? "easy",
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const allTime = steps.every((step) => step.durationSeconds !== null);
  const duration = steps.reduce(
    (sum, step) => sum + (step.durationSeconds ?? 0) * step.repeats,
    0,
  );
  function change(index: number, patch: Partial<Step>) {
    setSteps(
      steps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const session: PlanInput = {
      date: String(data.get("date")),
      sport:
        intent === "rest" ? "rest" : (data.get("sport") as PlanInput["sport"]),
      intent,
      title: String(data.get("title")),
      durationSeconds:
        intent === "rest"
          ? 0
          : allTime
            ? Math.round(duration)
            : Math.round(Number(data.get("duration")) * 60),
      rpeTarget: intent === "rest" ? 0 : Number(data.get("rpe")),
      prescription: String(data.get("prescription")),
      reason: String(data.get("reason")),
      steps: intent === "rest" ? [] : steps.map(({ key, ...step }) => step),
      linkedDate: initial?.linkedDate ?? null,
    };
    try {
      await api(
        initial ? `/plan/${initial.id}` : "/plan/propose",
        initial
          ? { operationId: operationId(), version: initial.version, session }
          : { operationId: operationId(), sessions: [session] },
        initial ? "PATCH" : "POST",
      );
      await saved();
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-grid" onSubmit={submit}>
      <label>
        Session title
        <input
          name="title"
          defaultValue={initial?.title ?? "A manageable session"}
          required
          maxLength={100}
        />
      </label>
      <div className="form-row">
        <label>
          Date
          <input
            name="date"
            type="date"
            min={today}
            defaultValue={initial?.date ?? today}
            required
          />
        </label>
        <label>
          Session type
          <select
            name="intent"
            value={intent}
            onChange={(event) =>
              setIntent(event.target.value as PlanInput["intent"])
            }
          >
            {[
              "easy",
              "long",
              "quality",
              "endurance",
              "hills",
              "race",
              "strength",
              "back-to-back",
              "rest",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {intent !== "rest" && (
        <>
          <div className="form-row">
            <label>
              Sport
              <select
                name="sport"
                defaultValue={
                  initial?.sport === "rest" ? "run" : (initial?.sport ?? "run")
                }
              >
                {["run", "trail", "bike", "walk", "strength", "other"].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              RPE target
              <input
                name="rpe"
                type="number"
                min={1}
                max={10}
                defaultValue={initial?.rpeTarget || 3}
                required
              />
            </label>
          </div>
          <label>
            Minutes
            {allTime ? (
              <input
                name="duration"
                value={Number((duration / 60).toFixed(2))}
                readOnly
              />
            ) : (
              <input
                name="duration"
                type="number"
                min={1}
                step="any"
                defaultValue={(initial?.durationSeconds || 1800) / 60}
                required
              />
            )}
          </label>
          <p className="muted">
            Time steps set the duration automatically. For distance steps, give
            the expected total time above. Pace bounds use seconds per
            kilometre.
          </p>
          <div className="step-editor">
            {steps.map((step, index) => (
              <fieldset key={step.key}>
                <legend>Step {index + 1}</legend>
                <div className="form-row">
                  <label>
                    Kind
                    <select
                      value={step.kind}
                      onChange={(e) =>
                        change(index, { kind: e.target.value as Step["kind"] })
                      }
                    >
                      {["warmup", "work", "recover", "cooldown", "free"].map(
                        (value) => (
                          <option key={value}>{value}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label>
                    Repeat
                    <input
                      name={`step-${index}-repeats`}
                      type="number"
                      min={1}
                      max={100}
                      value={step.repeats}
                      onChange={(e) =>
                        change(index, { repeats: Number(e.target.value) })
                      }
                      required
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Measure
                    <select
                      aria-label={`Step ${index + 1} measure`}
                      value={
                        step.durationSeconds !== null ? "time" : "distance"
                      }
                      onChange={(e) =>
                        change(
                          index,
                          e.target.value === "time"
                            ? { durationSeconds: 300, distanceMetres: null }
                            : { durationSeconds: null, distanceMetres: 1000 },
                        )
                      }
                    >
                      <option value="time">Time · minutes</option>
                      <option value="distance">Distance · metres</option>
                    </select>
                  </label>
                  <label>
                    {step.durationSeconds !== null ? "Minutes" : "Metres"}
                    <input
                      name={`step-${index}-duration`}
                      type="number"
                      min={step.durationSeconds !== null ? 0.1 : 1}
                      step="any"
                      value={
                        step.durationSeconds !== null
                          ? step.durationSeconds / 60
                          : (step.distanceMetres ?? "")
                      }
                      required
                      onChange={(e) =>
                        change(
                          index,
                          step.durationSeconds !== null
                            ? {
                                durationSeconds: Math.round(
                                  Number(e.target.value) * 60,
                                ),
                              }
                            : { distanceMetres: Number(e.target.value) },
                        )
                      }
                    />
                  </label>
                </div>
                <label>
                  Target
                  <select
                    aria-label={`Step ${index + 1} target`}
                    value={step.target?.metric ?? "open"}
                    onChange={(e) =>
                      change(index, {
                        target:
                          e.target.value === "open"
                            ? null
                            : {
                                metric: e.target.value as NonNullable<
                                  Step["target"]
                                >["metric"],
                                low: e.target.value === "rpe" ? 3 : 100,
                                high: e.target.value === "rpe" ? 3 : 150,
                              },
                      })
                    }
                  >
                    <option value="open">Open · follow instructions</option>
                    <option value="rpe">RPE</option>
                    <option value="pace">Pace · sec/km</option>
                    <option value="heartRate">Heart rate · bpm</option>
                    <option value="power">Power · W</option>
                  </select>
                </label>
                {step.target && (
                  <div className="form-row">
                    <label>
                      Low
                      <input
                        name={`step-${index}-low`}
                        type="number"
                        min={1}
                        step="any"
                        value={step.target.low}
                        required
                        onChange={(e) =>
                          change(index, {
                            target: {
                              ...step.target!,
                              low: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      High
                      <input
                        name={`step-${index}-high`}
                        type="number"
                        min={1}
                        step="any"
                        value={step.target.high}
                        required
                        onChange={(e) =>
                          change(index, {
                            target: {
                              ...step.target!,
                              high: Number(e.target.value),
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                )}
                <button
                  type="button"
                  className="text-button danger"
                  disabled={steps.length === 1}
                  onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                >
                  <Trash2 size={14} />
                  Remove step {index + 1}
                </button>
              </fieldset>
            ))}
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => setSteps([...steps, freeStep(300)])}
            disabled={steps.length >= 100}
          >
            <Plus size={14} />
            Add step
          </button>
        </>
      )}
      <label>
        Session instructions
        <textarea
          name="prescription"
          rows={3}
          defaultValue={
            initial?.prescription ??
            "Keep it conversational. Ease off if anything hurts."
          }
          maxLength={1500}
          required
        />
      </label>
      <label>
        Why this session or change?
        <textarea
          name="reason"
          rows={2}
          defaultValue={initial ? "" : "A session that fits the week."}
          maxLength={1000}
          required
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        {busy ? "Saving…" : initial ? "Save revision" : "Propose session"}
        <Check size={16} />
      </button>
    </form>
  );
}
