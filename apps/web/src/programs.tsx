import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Check, ChevronRight, BookOpen } from "lucide-react";
import {
  addDays,
  formatDuration,
  programEvents,
  programLibrary,
  programQueryFromContext,
  retrievePrograms,
  type AppState,
  type ProgramChoice,
  type ProgramEvent,
  type ProgramPreview,
} from "../../../packages/domain/src/index.js";
import { api, operationId } from "./api.js";
import { Modal } from "./dialogs.js";
import { WorkoutsView } from "./workouts.js";

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" }).format(
    new Date(date + "T12:00:00Z"),
  );
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const eventNames: Record<string, string> = {
  base: "Build consistent fitness",
  "short-distance": "Shorter road race",
  "half-marathon": "Half marathon",
  marathon: "Marathon",
  ultra: "Ultra",
  trail: "Trail race",
  hike: "Hiking",
  "road-bike": "Road cycling",
  "mountain-bike": "Mountain biking",
};
const lengthFor = (id: string) =>
  id === "easy-base"
    ? 4
    : id === "post-race"
      ? 2
      : id.includes("marathon") && !id.includes("half")
        ? 16
        : id.includes("half")
          ? 12
          : id.includes("ultra")
            ? 12
            : id === "long-trail"
              ? 16
              : 8;
export function ProgramSummary({
  state,
  open,
  buttonLabel = "View my week",
}: {
  state: AppState;
  open: () => void;
  buttonLabel?: string;
}) {
  const p = state.program,
    progress = state.programProgress;
  if (!p || !progress) return null;
  const ended = p.endDate < state.today;
  return (
    <section className="active-program" aria-label="Active training program">
      <div>
        <span className="eyebrow">
          {ended
            ? "BLOCK COMPLETE"
            : p.startDate > state.today
              ? "STARTING SOON"
              : "YOUR ACTIVE PROGRAM"}
        </span>
        <h2>{p.title}</h2>
        <p>{p.goal}</p>
        <p>
          {p.startDate} — {p.endDate} · Week {progress.week} of {p.weeks}
        </p>
      </div>
      <div>
        <strong>
          {progress.completed + progress.modified} / {progress.total} sessions
          completed
        </strong>
        <progress
          max={Math.max(1, progress.total)}
          value={progress.completed + progress.modified}
          aria-label="Program completion"
        />
        <small>
          {progress.modified} modified · {progress.replaced} replaced ·{" "}
          {progress.skipped} skipped
          {progress.outstanding
            ? ` · ${progress.outstanding} past sessions need review`
            : ""}
        </small>
        <button className="secondary-button" onClick={open}>
          <CalendarDays size={15} /> {buttonLabel}
        </button>
      </div>
    </section>
  );
}
export function ProgramsView({
  state,
  saved,
  openWeek,
  disabled,
}: {
  state: AppState;
  saved: () => Promise<void>;
  openWeek: () => void;
  disabled: boolean;
}) {
  const context = programQueryFromContext({
    today: state.today,
    athlete: state.athlete,
    activities: state.activities,
    block: state.block,
    races: state.races,
  });
  const [tab, setTab] = useState<"programs" | "library">("programs");
  const [goal, setGoal] = useState<ProgramEvent>(
    state.program
      ? (programLibrary.find((p) => p.id === state.program!.patternId)
          ?.events[0] ??
          context.event ??
          "base")
      : (context.event ?? "base"),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [ending, setEnding] = useState(false),
    [error, setError] = useState("");
  const recommendations = useMemo(
    () =>
      retrievePrograms({
        ...context,
        event: goal,
        limit: 3,
      }),
    [state, goal],
  );
  const visible = programLibrary.filter((p) => p.events.includes(goal));
  const rank = (id: string) => {
    const index = recommendations.findIndex((p) => p.id === id);
    return index < 0 ? recommendations.length : index;
  };
  const patterns = [...visible].sort((a, b) => rank(a.id) - rank(b.id));
  return (
    <section className="programs-view">
      <div
        className="program-tabs"
        role="tablist"
        aria-label="Programs and workouts"
      >
        <button
          role="tab"
          aria-selected={tab === "programs"}
          onClick={() => setTab("programs")}
        >
          Programs
        </button>
        <button
          role="tab"
          aria-selected={tab === "library"}
          onClick={() => setTab("library")}
        >
          <BookOpen size={15} /> Workout library
        </button>
      </div>
      {tab === "library" ? (
        <WorkoutsView state={state} />
      ) : (
        <>
          <div className="view-heading">
            <div>
              <span className="eyebrow">A DIRECTION YOU CAN FOLLOW</span>
              <h1>Your program.</h1>
              <p>
                {state.program
                  ? "Your chosen direction is saved. See your calendar in My week, or browse other approaches below."
                  : "Choose a training direction, preview your dated schedule, then make it yours."}
              </p>
            </div>
          </div>
          <ProgramSummary state={state} open={openWeek} />
          {state.program && (
            <details className="program-end">
              <summary>Change or end this program</summary>
              <p>
                Ending keeps your completed training and decisions. It cancels
                only this program's remaining scheduled days, so you can choose
                a new direction.
              </p>
              <button
                className="text-button danger"
                disabled={disabled || ending}
                onClick={async () => {
                  setEnding(true);
                  setError("");
                  try {
                    await api(`/programs/${state.program!.id}/end`, {
                      operationId: operationId(),
                    });
                    await saved();
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setEnding(false);
                  }
                }}
              >
                End program and cancel remaining days
              </button>
            </details>
          )}
          <label className="program-goal">
            What are you working toward?
            <select
              aria-label="Training goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value as ProgramEvent)}
            >
              {programEvents.map((e) => (
                <option key={e} value={e}>
                  {eventNames[e]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted">
            Your schedule uses your recent training, availability, and chosen
            days. Compare the approaches below, then preview every week before
            you commit.
          </p>
          {patterns.length ? (
            <div className="program-catalog">
              {patterns.map((p, index) => (
                <article className="program-card" key={p.id}>
                  <span className="eyebrow">
                    {index === 0
                      ? "RECOMMENDED STARTING POINT"
                      : "ANOTHER APPROACH"}
                  </span>
                  <h2>{p.title}</h2>
                  <p>{p.purpose}</p>
                  <strong>
                    {p.daysPerWeek.low}–{p.daysPerWeek.high} training days /
                    week
                    {p.weeklyMinutes
                      ? ` · ${Math.round((p.weeklyMinutes.low / 60) * 10) / 10}–${Math.round((p.weeklyMinutes.high / 60) * 10) / 10} hours`
                      : ""}
                  </strong>
                  <p>{p.weekShape}</p>
                  {recommendations.find((r) => r.id === p.id)?.why.length ? (
                    <p className="program-fit">
                      Why it fits:{" "}
                      {recommendations
                        .find((r) => r.id === p.id)!
                        .why.join(" · ")}
                      . Check the preview against your life.
                    </p>
                  ) : null}
                  <details>
                    <summary>Fit, progression, and recovery</summary>
                    <p>
                      <strong>Who it fits:</strong> {p.athlete}
                    </p>
                    <p>
                      <strong>How it builds:</strong> {p.progression}
                    </p>
                    <p>
                      <strong>Recovery:</strong> {p.recovery}
                    </p>
                    <p>
                      <strong>Choose another approach if:</strong> {p.notFor}
                    </p>
                  </details>
                  <button
                    className="primary-button"
                    disabled={disabled}
                    onClick={() => setSelected(p.id)}
                  >
                    Customize and preview <ChevronRight size={15} />
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p>No programs for this goal yet.</p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </>
      )}
      {selected && (
        <ProgramSetup
          key={selected}
          id={selected}
          state={state}
          close={() => setSelected(null)}
          saved={saved}
        />
      )}
    </section>
  );
}
function ProgramSetup({
  id,
  state,
  close,
  saved,
}: {
  id: string;
  state: AppState;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const p = programLibrary.find((p) => p.id === id)!;
  const choices = [2, 4, state.athlete.longRunDay, 0, 3, 5, 1, 6]
    .filter(
      (d, i, list) =>
        list.indexOf(d) === i && !state.athlete.restDays.includes(d),
    )
    .slice(0, Math.max(2, Math.min(5, p.daysPerWeek.low)));
  const startDate = state.activities.some((a) => a.date === state.today)
    ? addDays(state.today, 1)
    : state.today;
  const race = state.races
    .filter(
      (r) =>
        r.priority === "A" &&
        r.date >= startDate &&
        r.date <= addDays(startDate, 167) &&
        p.sports.includes(r.sport),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const weeks = race
    ? Math.max(
        2,
        Math.ceil(
          (Date.parse(race.date) - Date.parse(startDate) + 86400000) /
            (7 * 86400000),
        ),
      )
    : lengthFor(id);
  const [choice, setChoice] = useState<ProgramChoice>({
    patternId: id,
    goal: p.purpose.slice(0, 300),
    startDate,
    weeks,
    trainingDays: choices,
    weeklyMinutes: state.athlete.weeklyMinutes ?? 120,
    includeStrength: false,
    targetDate: race?.date ?? null,
  });
  const [preview, setPreview] = useState<ProgramPreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const patch = (next: Partial<ProgramChoice>) => {
    setChoice({ ...choice, ...next });
    setPreview(null);
    setError("");
  };
  async function build(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setPreview(await api<ProgramPreview>("/programs/preview", { choice }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function follow() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await api("/programs/follow", {
        choice: preview.choice,
        previewKey: preview.previewKey,
        operationId: operationId(),
      });
      await saved();
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={p.title} close={close} wide>
      <p className="modal-intro">
        Set the commitment you can keep. Previewing leaves your calendar
        unchanged. Following explicitly schedules these days.
      </p>
      <form className="form-grid" onSubmit={build}>
        <label>
          Your goal
          <input
            aria-label="Program goal"
            value={choice.goal}
            maxLength={300}
            required
            onChange={(e) => patch({ goal: e.target.value })}
          />
        </label>
        <div className="form-row">
          <label>
            Start date
            <input
              type="date"
              aria-label="Program start date"
              min={state.today}
              max={addDays(state.today, 90)}
              value={choice.startDate}
              required
              onChange={(e) => patch({ startDate: e.target.value })}
            />
          </label>
          <label>
            Length (weeks)
            <input
              type="number"
              aria-label="Program length"
              min={2}
              max={24}
              value={choice.weeks}
              required
              onChange={(e) => patch({ weeks: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="form-row">
          <label>
            Weekly time budget (minutes)
            <input
              type="number"
              aria-label="Program weekly minutes"
              min={30}
              max={3000}
              value={choice.weeklyMinutes}
              required
              onChange={(e) => patch({ weeklyMinutes: Number(e.target.value) })}
            />
          </label>
          <label>
            Goal date (optional, final two weeks)
            <input
              type="date"
              aria-label="Program goal date"
              min={addDays(choice.startDate, choice.weeks * 7 - 14)}
              max={addDays(choice.startDate, choice.weeks * 7 - 1)}
              value={choice.targetDate ?? ""}
              onChange={(e) => patch({ targetDate: e.target.value || null })}
            />
          </label>
        </div>
        <fieldset>
          <legend>Endurance training days · choose 2–6</legend>
          <div className="program-days">
            {weekdays.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-label={`Train on ${d}`}
                aria-pressed={choice.trainingDays.includes(i)}
                disabled={state.athlete.restDays.includes(i)}
                onClick={() =>
                  patch({
                    trainingDays: choice.trainingDays.includes(i)
                      ? choice.trainingDays.filter((x) => x !== i)
                      : [...choice.trainingDays, i],
                  })
                }
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="program-strength">
          <input
            type="checkbox"
            checked={choice.includeStrength}
            onChange={(e) => patch({ includeStrength: e.target.checked })}
          />{" "}
          Include one supporting strength session each week, within the time
          budget
        </label>
        <button className="secondary-button" disabled={busy}>
          {busy ? "Working…" : "Preview schedule"}
        </button>
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview && (
        <section
          className="program-preview"
          aria-label="Program schedule preview"
        >
          <h3>Your {choice.weeks}-week schedule</h3>
          <p>
            {choice.startDate} — {preview.endDate}. Existing calendar sessions
            are kept.
          </p>
          {preview.warnings.map((w) => (
            <p className="program-warning" key={w}>
              {w}
            </p>
          ))}
          {preview.weeks.map((w) => (
            <details key={w.number} open={w.number === 1}>
              <summary>
                Week {w.number} · {w.phase}
                {w.cutback ? " · cutback" : ""} ·{" "}
                {formatDuration(w.minutes * 60)}
              </summary>
              <div className="preview-days">
                {[...preview.sessions, ...preview.retained]
                  .filter(
                    (s) =>
                      s.date >= w.startDate &&
                      s.date <= addDays(w.startDate, 6),
                  )
                  .sort((a, b) => a.date.localeCompare(b.date))
                  .map((s, i) => (
                    <details key={`${s.date}-${s.sport}-${i}`}>
                      <summary>
                        {dateLabel(s.date, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {s.title} · {formatDuration(s.durationSeconds)}
                        {"status" in s ? " · kept from your calendar" : ""}
                      </summary>
                      <p>{s.prescription}</p>
                      <small>{s.reason}</small>
                    </details>
                  ))}
              </div>
            </details>
          ))}
          <button
            className="primary-button"
            disabled={
              busy || (!!state.program && state.program.endDate >= state.today)
            }
            onClick={() => void follow()}
          >
            <Check size={16} />
            {busy ? "Starting…" : "Follow this program"}
          </button>
          {state.program && state.program.endDate >= state.today && (
            <p>End your current program before starting another.</p>
          )}
        </section>
      )}
    </Modal>
  );
}
