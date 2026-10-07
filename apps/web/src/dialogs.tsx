import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { X, ArrowUpRight, Check, Footprints, Moon } from "lucide-react";
import {
  formatDuration,
  sessionStatusLabel,
  type Activity,
  type Athlete,
  type PlanSession,
  type StrengthExercise,
} from "../../../packages/domain/src/index.js";
import { api, operationId } from "./api.js";
import { TrainingSettings, parseTrainingSettings } from "./training.js";
import { download } from "./imports.js";
import { SubscriptionSettings } from "./subscription.js";
import { IntervalsSettings } from "./intervals.js";
import { WorkoutEditor } from "./workout-editor.js";
import { StrengthEditor } from "./strength-editor.js";

export const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function ErrorLine({ error }: { error: string }) {
  return error ? (
    <p className="form-error" role="alert">
      {error}
    </p>
  ) : null;
}

export function Settings({
  athlete,
  today,
  close,
  saved,
  reviewImports,
}: {
  athlete: Athlete;
  today: string;
  close: () => void;
  saved: () => Promise<void>;
  reviewImports: () => void;
}) {
  const [tab, setTab] = useState<"connections" | "training">("connections");
  const [restDays, setRestDays] = useState(athlete.restDays);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        "/athlete",
        {
          operationId: operationId(),
          athlete: {
            name: String(form.get("name")),
            timezone: String(form.get("timezone")),
            units: form.get("units"),
            longRunDay: Number(form.get("longRunDay")),
            restDays,
            weeklyMinutes: form.get("weeklyMinutes")
              ? Number(form.get("weeklyMinutes"))
              : null,
            longestRunMinutes: form.get("longestRunMinutes")
              ? Number(form.get("longestRunMinutes"))
              : null,
            constraint: form.get("constraint"),
            constraintNote: String(form.get("constraintNote")),
            ...parseTrainingSettings(form),
          },
        },
        "PATCH",
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
    <Modal title="Settings" close={close}>
      <div className="settings-tabs" role="tablist" aria-label="Settings">
        <button
          id="connections-tab"
          type="button"
          role="tab"
          aria-selected={tab === "connections"}
          aria-controls="connections-panel"
          onClick={() => setTab("connections")}
        >
          Connections
        </button>
        <button
          id="training-tab"
          type="button"
          role="tab"
          aria-selected={tab === "training"}
          aria-controls="training-panel"
          onClick={() => setTab("training")}
        >
          Training
        </button>
      </div>
      <div
        id="connections-panel"
        role="tabpanel"
        aria-labelledby="connections-tab"
        hidden={tab !== "connections"}
      >
        <SubscriptionSettings />
        <IntervalsSettings changed={saved} review={reviewImports} />
      </div>
      <div
        id="training-panel"
        role="tabpanel"
        aria-labelledby="training-tab"
        hidden={tab !== "training"}
      >
        <p className="modal-intro">
          Your background, availability, and training targets.
        </p>
        <form onSubmit={submit} className="form-grid">
          <label>
            Your name
            <input
              name="name"
              defaultValue={athlete.name}
              placeholder="What should I call you?"
              maxLength={60}
            />
          </label>
          <div className="form-row">
            <label>
              Distance units
              <select name="units" defaultValue={athlete.units}>
                <option value="mi">Miles</option>
                <option value="km">Kilometres</option>
              </select>
            </label>
            <label>
              Long-run day
              <select name="longRunDay" defaultValue={athlete.longRunDay}>
                {weekdays.map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset>
            <legend>Days you keep for rest</legend>
            <div className="day-picker">
              {weekdays.map((day, index) => (
                <button
                  type="button"
                  key={day}
                  aria-label={day}
                  aria-pressed={restDays.includes(index)}
                  className={restDays.includes(index) ? "selected" : ""}
                  onClick={() =>
                    setRestDays((previous) =>
                      previous.includes(index)
                        ? previous.filter((value) => value !== index)
                        : [...previous, index],
                    )
                  }
                >
                  {day.slice(0, 2)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <label>
              Usual weekly minutes
              <input
                name="weeklyMinutes"
                type="number"
                min={30}
                max={3000}
                defaultValue={athlete.weeklyMinutes ?? ""}
                placeholder="Optional"
              />
            </label>
            <label>
              Recent longest run (min)
              <input
                name="longestRunMinutes"
                type="number"
                min={10}
                max={1440}
                defaultValue={athlete.longestRunMinutes ?? ""}
                placeholder="Optional"
              />
            </label>
          </div>
          <label>
            Current constraint
            <select name="constraint" defaultValue={athlete.constraint}>
              <option value="none">Feeling good</option>
              <option value="niggle">A niggle to watch</option>
              <option value="injury">An injury — pause hard training</option>
              <option value="travel">Travel or schedule changes</option>
            </select>
          </label>
          <label>
            Anything the coach should know?
            <textarea
              name="constraintNote"
              defaultValue={athlete.constraintNote}
              placeholder="A sore ankle, limited time, a busy week…"
              maxLength={500}
              rows={2}
            />
          </label>
          <label>
            Timezone
            <input name="timezone" defaultValue={athlete.timezone} required />
            <small>Workout dates and your plan use this timezone.</small>
          </label>
          <TrainingSettings athlete={athlete} today={today} />
          <ErrorLine error={error} />
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : "Save preferences"}
            <Check size={16} />
          </button>
        </form>
      </div>
    </Modal>
  );
}

export function LogWorkout({
  today,
  units,
  activity,
  preset,
  initialSport,
  previousStrength,
  close,
  saved,
}: {
  today: string;
  units: "mi" | "km";
  activity?: Activity;
  preset?: PlanSession;
  initialSport?: Activity["sport"];
  previousStrength?: StrengthExercise[];
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sport, setSport] = useState<Activity["sport"]>(
    activity?.sport ??
      initialSport ??
      (preset?.sport === "rest" ? "run" : preset?.sport) ??
      "run",
  );
  const [strengthExercises, setStrengthExercises] = useState<
    StrengthExercise[]
  >(activity?.strengthExercises ?? []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    const input = {
      ...(activity ?? {}),
      date: String(form.get("date")),
      sport,
      durationSeconds: Math.round(Number(form.get("duration")) * 60),
      distanceMetres:
        sport !== "strength" && form.get("distance")
          ? Number(form.get("distance")) * (units === "mi" ? 1609.344 : 1000)
          : null,
      rpe: form.get("rpe") ? Number(form.get("rpe")) : null,
      intent: sport === "strength" ? "strength" : form.get("intent"),
      title:
        sport === "strength"
          ? String(form.get("title")).trim() || "Strength / lifting"
          : activity?.title,
      strengthExercises:
        sport === "strength"
          ? strengthExercises
              .map((e) => ({
                ...e,
                sets: e.sets.filter(
                  (s) =>
                    s.reps !== null ||
                    s.durationSeconds !== null ||
                    s.weight !== null,
                ),
              }))
              .filter((e) => e.name.trim() || e.sets.length || e.notes)
          : [],
      feel: String(form.get("feel")) || null,
      pain: String(form.get("pain")) || null,
    };
    try {
      await api(
        activity ? `/activities/${activity.id}` : "/activities",
        { activity: input, operationId: operationId() },
        activity ? "PATCH" : "POST",
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
    <Modal
      title={activity ? "Your workout" : "Every session counts"}
      close={close}
    >
      <p className="modal-intro">
        {activity
          ? activity.planSessionId
            ? "Correct the details, or add how it felt. Changing the workout's date, sport, duration, type, or exercises reopens its plan review."
            : "Correct the details, or add how it felt."
          : "Save what happened. Your plan and coach will catch up."}
      </p>
      {activity?.assetIds?.length ? (
        <div className="export-actions">
          {activity.assetIds.map((id, index) => (
            <button
              key={id}
              className="text-button"
              onClick={() =>
                void download(`/assets/${id}`, "original-workout").catch(
                  (error) => setError(error.message),
                )
              }
            >
              Download original {index + 1}
              <ArrowUpRight size={13} />
            </button>
          ))}
        </div>
      ) : null}
      <form className="form-grid" onSubmit={submit}>
        <div className="form-row">
          <label>
            Sport
            <select
              name="sport"
              value={sport}
              onChange={(event) =>
                setSport(event.target.value as Activity["sport"])
              }
            >
              <option value="run">Run</option>
              <option value="trail">Trail run</option>
              <option value="bike">Bike</option>
              <option value="walk">Walk</option>
              <option value="strength">Strength / lifting</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Date
            <input
              type="date"
              name="date"
              max={today}
              defaultValue={activity?.date ?? preset?.date ?? today}
              required
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Duration (minutes)
            <input
              type="number"
              name="duration"
              min={1}
              max={4320}
              step="any"
              defaultValue={
                activity
                  ? activity.durationSeconds / 60
                  : preset
                    ? preset.durationSeconds / 60
                    : ""
              }
              placeholder="50"
              required
            />
          </label>
          {sport === "strength" ? (
            <label key="strength-title">
              Session name
              <input
                name="title"
                defaultValue={activity?.title ?? ""}
                maxLength={200}
                placeholder="Optional: full body, legs, mobility…"
              />
            </label>
          ) : (
            <label key="distance">
              Distance ({units})
              <input
                type="number"
                name="distance"
                min={0}
                step="any"
                defaultValue={
                  activity?.distanceMetres != null
                    ? Number(
                        (
                          activity.distanceMetres /
                          (units === "mi" ? 1609.344 : 1000)
                        ).toFixed(2),
                      )
                    : ""
                }
                placeholder="Optional"
              />
            </label>
          )}
        </div>
        <div className="form-row">
          {sport !== "strength" && (
            <label>
              Session type
              <select
                name="intent"
                defaultValue={
                  activity?.intent ??
                  (preset?.intent === "rest" ? "easy" : preset?.intent) ??
                  "easy"
                }
              >
                <option value="easy">Easy</option>
                <option value="long">Long</option>
                <option value="quality">Quality</option>
                <option value="endurance">Endurance</option>
                <option value="hills">Hills</option>
                <option value="race">Race</option>
                <option value="strength">Strength</option>
              </select>
            </label>
          )}
          <label>
            Effort (RPE 1–10)
            <input
              type="number"
              name="rpe"
              min={1}
              max={10}
              defaultValue={activity?.rpe ?? ""}
              placeholder="Optional"
            />
          </label>
        </div>
        {sport === "strength" && (
          <StrengthEditor
            initial={strengthExercises}
            unit={units === "mi" ? "lb" : "kg"}
            previous={activity ? undefined : previousStrength}
            changed={setStrengthExercises}
          />
        )}
        <label>
          How did it feel?
          <textarea
            name="feel"
            defaultValue={activity?.feel ?? ""}
            placeholder="Steady and comfortable, a little tired…"
            rows={2}
            maxLength={500}
          />
        </label>
        <label>
          Any pain?
          <input
            name="pain"
            defaultValue={activity?.pain ?? ""}
            placeholder="Leave blank if none"
            maxLength={500}
          />
        </label>
        <ErrorLine error={error} />
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : activity ? "Save changes" : "Save workout"}
          <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}

export function SessionDetails({
  session,
  today,
  close,
  saved,
  log,
}: {
  session: PlanSession;
  today: string;
  close: () => void;
  saved: () => Promise<void>;
  log: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const immutable = ["done", "skipped"].includes(session.status);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        `/plan/${session.id}`,
        {
          operationId: operationId(),
          version: session.version,
          session: {
            date: String(form.get("date")),
            sport: session.sport,
            intent: session.intent,
            durationSeconds:
              session.intent === "rest" ? 0 : Number(form.get("duration")) * 60,
            rpeTarget: session.intent === "rest" ? 0 : Number(form.get("rpe")),
            title: session.title,
            prescription: String(form.get("prescription")),
            reason: String(form.get("reason")),
            blockId: session.blockId,
            linkedDate: session.linkedDate,
            steps:
              session.intent === "rest"
                ? []
                : [
                    {
                      kind: "free",
                      durationSeconds: Math.round(
                        Number(form.get("duration")) * 60,
                      ),
                      distanceMetres: null,
                      repeats: 1,
                      target: {
                        metric: "rpe",
                        low: Number(form.get("rpe")),
                        high: Number(form.get("rpe")),
                      },
                    },
                  ],
          },
        },
        "PATCH",
      );
      await saved();
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function skip() {
    setBusy(true);
    setError("");
    try {
      await api(`/plan/${session.id}/skip`, {
        operationId: operationId(),
        version: session.version,
        reason: "Marked missed by the athlete.",
      });
      await saved();
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={session.title} close={close}>
      {session.outcome && (
        <p className="program-warning">
          <strong>{sessionStatusLabel(session)}.</strong>{" "}
          {session.outcomeReason} The prescription below is the original plan;
          your actual workout stays in the log.
        </p>
      )}
      <div className="session-summary">
        <span
          className={`session-icon ${session.intent === "rest" ? "rest" : ""}`}
        >
          {session.intent === "rest" ? (
            <Moon size={24} />
          ) : (
            <Footprints size={24} />
          )}
        </span>
        <div>
          <span className={`status ${session.status}`}>
            {sessionStatusLabel(session)}
          </span>
          <p>
            {session.date} ·{" "}
            {session.durationSeconds
              ? `${formatDuration(session.durationSeconds)} · RPE ${session.rpeTarget}`
              : "Rest day"}
          </p>
        </div>
      </div>
      {editing ? (
        <WorkoutEditor
          today={today}
          initial={session}
          close={close}
          saved={saved}
        />
      ) : (
        <>
          <p className="prescription">{session.prescription}</p>
          {session.steps?.length ? (
            <ol className="workout-steps">
              {session.steps.map((step, index) => (
                <li key={index}>
                  <strong>
                    {step.repeats > 1 ? `${step.repeats} × ` : ""}
                    {step.kind}
                  </strong>
                  <span>
                    {step.durationSeconds
                      ? formatDuration(step.durationSeconds)
                      : `${step.distanceMetres} m`}
                    {step.target
                      ? ` · ${step.target.metric === "rpe" ? "RPE" : step.target.metric} ${step.target.low}–${step.target.high}`
                      : ""}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          <div className="reason-card">
            <span>WHY THIS SESSION</span>
            <p>{session.reason}</p>
          </div>
          <ErrorLine error={error} />
          {session.status === "accepted" && (
            <div className="export-actions">
              <button
                className="text-button"
                onClick={() =>
                  void download(
                    `/export/${session.id}/txt`,
                    `${session.date}-workout.txt`,
                  ).catch((error) => setError(error.message))
                }
              >
                Text prescription
                <ArrowUpRight size={13} />
              </button>
              {session.intent !== "rest" && (
                <>
                  <button
                    className="text-button"
                    onClick={() =>
                      void download(
                        `/export/${session.id}/fit`,
                        `${session.date}-workout.fit`,
                      ).catch((error) => setError(error.message))
                    }
                  >
                    FIT workout
                    <ArrowUpRight size={13} />
                  </button>
                  {session.sport === "bike" && (
                    <button
                      className="text-button"
                      onClick={() =>
                        void download(
                          `/export/${session.id}/zwo`,
                          `${session.date}-workout.zwo`,
                        ).catch((error) => setError(error.message))
                      }
                    >
                      Zwift workout
                      <ArrowUpRight size={13} />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {!immutable && (
            <div className="session-actions">
              <button
                className="primary-button"
                onClick={() => setEditing(true)}
              >
                Adjust this session
                <ArrowUpRight size={16} />
              </button>
              {session.intent !== "rest" && session.date <= today && (
                <button className="secondary-button" onClick={log}>
                  Log this workout
                </button>
              )}
              {session.status === "proposed" && (
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(
                        `/plan/${session.id}`,
                        {
                          operationId: operationId(),
                          version: session.version,
                        },
                        "DELETE",
                      );
                      await saved();
                      close();
                    } catch (error) {
                      setError((error as Error).message);
                      setBusy(false);
                    }
                  }}
                >
                  Discard proposal
                </button>
              )}
              {session.status === "accepted" && (
                <button className="text-button" disabled={busy} onClick={skip}>
                  Mark as missed
                </button>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
