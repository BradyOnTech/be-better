import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  formatDuration,
  type AppState,
  type PlanDecision,
} from "../../../packages/domain/src/index.js";
import { api, operationId } from "./api.js";

export function PlanReviews({
  state,
  saved,
  askCoach,
  disabled,
}: {
  state: AppState;
  saved: () => Promise<void>;
  askCoach: (message: string) => void;
  disabled: boolean;
}) {
  const reviews = state.planReviews ?? [];
  if (!reviews.length) return null;
  return (
    <section
      className="plan-reviews"
      aria-label="Review training against your plan"
    >
      <h2>How did this fit your plan?</h2>
      <p>
        Your actual training is saved. Choose what it means for the scheduled
        workout.
      </p>
      {reviews.map((r) => (
        <Review
          key={r.activity.id}
          review={r}
          saved={saved}
          askCoach={askCoach}
          disabled={disabled}
        />
      ))}
    </section>
  );
}
function Review({
  review,
  saved,
  askCoach,
  disabled,
}: {
  review: AppState["planReviews"][number];
  saved: () => Promise<void>;
  askCoach: (message: string) => void;
  disabled: boolean;
}) {
  const { activity, sessions } = review;
  const [sessionId, setSessionId] = useState(sessions[0].id),
    [outcome, setOutcome] = useState<PlanDecision["outcome"] | "">("");
  const [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];
  async function submit(adjust: boolean) {
    if (!outcome) return;
    setBusy(true);
    setError("");
    try {
      await api(`/activities/${activity.id}/plan-review`, {
        operationId: operationId(),
        decision: {
          outcome,
          sessionId: outcome === "additional" ? null : session.id,
          version: outcome === "additional" ? null : session.version,
          reason:
            reason.trim() || `The athlete chose ${outcome} in the plan review.`,
        },
      });
      await saved();
      if (adjust)
        askCoach(
          `I ${outcome === "additional" ? "added extra training" : "changed the scheduled workout"} on ${activity.date}: ${formatDuration(activity.durationSeconds)} ${activity.sport}, ${activity.intent}${activity.rpe ? `, RPE ${activity.rpe}` : ""}. ${reason} Review the next three days of my active plan for recovery and adjust them where needed. Explain any change and keep its decision note. Do not automatically make up missed intensity.`,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="plan-review-card" open>
      <summary>
        {activity.date} · Logged {formatDuration(activity.durationSeconds)}{" "}
        {activity.sport} <ChevronDown size={14} />
      </summary>
      <p>
        Actual: {activity.intent}
        {activity.rpe ? ` · RPE ${activity.rpe}` : ""}
        {activity.feel ? ` · ${activity.feel}` : ""}
      </p>
      <label>
        Which scheduled workout?
        <select
          aria-label={`Scheduled workout for ${activity.id}`}
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {s.sport} · {formatDuration(s.durationSeconds)}
            </option>
          ))}
        </select>
      </label>
      <p>
        Planned: {session.intent} · {formatDuration(session.durationSeconds)} ·
        RPE {session.rpeTarget}. {session.prescription}
      </p>
      <label>
        How does your activity relate?
        <select
          aria-label={`Workout outcome for ${activity.id}`}
          value={outcome}
          onChange={(e) =>
            setOutcome(e.target.value as PlanDecision["outcome"])
          }
        >
          <option value="">Choose an outcome</option>
          <option value="completed">Completed as planned</option>
          <option value="modified">Modified this workout</option>
          <option value="replaced">Replaced it with a different workout</option>
          <option value="additional">
            Additional training; keep the planned workout outstanding
          </option>
        </select>
      </label>
      <label>
        Why did it change? (optional)
        <input
          aria-label={`Plan review reason for ${activity.id}`}
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Time, tired legs, different plans…"
        />
      </label>
      <div className="review-actions">
        <button
          className="secondary-button"
          disabled={disabled || busy || !outcome}
          onClick={() => void submit(false)}
        >
          <Check size={15} /> Save outcome
        </button>
        <button
          className="text-button"
          disabled={disabled || busy || !outcome}
          onClick={() => void submit(true)}
        >
          Save and ask coach to adjust upcoming days
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
