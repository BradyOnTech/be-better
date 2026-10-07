import { useState, type FormEvent } from "react";
import {
  CalendarDays,
  Check,
  Flag,
  Heart,
  Plus,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import { api, operationId } from "./api.js";
import { Modal } from "./dialogs.js";
import {
  formatDistance,
  type AppState,
  type Race,
  type CoachQuestion,
  type Athlete,
} from "../../../packages/domain/src/index.js";
export function RaceDialog({
  race,
  state,
  close,
  saved,
}: {
  race?: Race;
  state: AppState;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const units = state.athlete.units;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(
        race ? `/races/${race.id}` : "/races",
        {
          operationId: operationId(),
          race: {
            name: String(data.get("name")),
            date: String(data.get("date")),
            sport: data.get("sport"),
            priority: data.get("priority"),
            distanceMetres:
              Number(data.get("distance")) * (units === "mi" ? 1609.344 : 1000),
            elevationGainMetres: data.get("elevation")
              ? Number(data.get("elevation"))
              : null,
            goal: String(data.get("goal")),
            terrainNotes: String(data.get("terrain")),
          },
        },
        race ? "PATCH" : "POST",
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
      title={race ? "Your race" : "Something to work toward"}
      close={close}
    >
      <p className="modal-intro">
        An A race shapes the block. B and C races stay on the calendar without
        taking over the week.
      </p>
      <form className="form-grid" onSubmit={save}>
        <label>
          Race name
          <input
            name="name"
            maxLength={100}
            defaultValue={race?.name ?? ""}
            required
            placeholder="Autumn trail 50K"
          />
        </label>
        <div className="form-row">
          <label>
            Date
            <input
              name="date"
              type="date"
              defaultValue={race?.date ?? ""}
              required
            />
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={race?.priority ?? "A"}>
              <option value="A">A · main goal</option>
              <option value="B">B · important</option>
              <option value="C">C · for experience</option>
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Sport
            <select name="sport" defaultValue={race?.sport ?? "run"}>
              <option value="run">Run</option>
              <option value="trail">Trail run</option>
              <option value="bike">Bike</option>
            </select>
          </label>
          <label>
            Distance ({units})
            <input
              name="distance"
              type="number"
              min="0.1"
              step="any"
              defaultValue={
                race
                  ? Number(
                      (
                        race.distanceMetres / (units === "mi" ? 1609.344 : 1000)
                      ).toFixed(2),
                    )
                  : ""
              }
              required
            />
          </label>
        </div>
        <label>
          Elevation gain (m)
          <input
            name="elevation"
            type="number"
            min="0"
            defaultValue={race?.elevationGainMetres ?? ""}
          />
        </label>
        <label>
          Your goal
          <input
            name="goal"
            maxLength={500}
            defaultValue={race?.goal ?? ""}
            placeholder="Finish comfortably, or a time you’re aiming for"
          />
        </label>
        <label>
          Terrain, night sections, cutoffs, and kit
          <textarea
            name="terrain"
            maxLength={1500}
            rows={3}
            defaultValue={race?.terrainNotes ?? ""}
            placeholder="Anything the plan needs to make room for"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          {busy ? "Saving…" : "Save race"}
          <Check size={16} />
        </button>
        {race && (
          <button
            className="text-button danger"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(
                  `/races/${race.id}`,
                  { operationId: operationId() },
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
            <Trash2 size={14} />
            Remove from calendar
          </button>
        )}
      </form>
    </Modal>
  );
}
export function RacePanel({
  state,
  edit,
  add,
  build,
  offline,
}: {
  state: AppState;
  edit: (race: Race) => void;
  add: () => void;
  build: () => Promise<void>;
  offline: boolean;
}) {
  return (
    <div className="race-panel">
      <div className="panel-heading">
        <span className="eyebrow">WHAT YOU’RE WORKING TOWARD</span>
        <button className="text-button" onClick={add} disabled={offline}>
          Add race
          <Plus size={14} />
        </button>
      </div>
      {state.block && (
        <div className={`block-card phase-${state.block.phase}`}>
          <span className="phase-label">
            {state.block.phase}
            {state.block.cutback ? " · cutback week" : ""}
          </span>
          <strong>{state.block.weeklyMinutes} min this week</strong>
          <p>{state.block.reason}</p>
          <span>
            {state.block.startDate} → {state.block.endDate}
          </span>
        </div>
      )}
      <div className="race-list">
        {state.races
          .filter((race) => race.date >= state.today)
          .map((race) => (
            <button onClick={() => edit(race)} disabled={offline} key={race.id}>
              <Flag size={17} />
              <div>
                <strong>{race.name}</strong>
                <span>
                  {race.date} ·{" "}
                  {formatDistance(race.distanceMetres, state.athlete.units)} ·{" "}
                  {race.sport}
                </span>
                {race.goal && <small>{race.goal}</small>}
              </div>
              <span className={`race-priority ${race.priority}`}>
                {race.priority}
              </span>
            </button>
          ))}
      </div>
      {!state.races.some((race) => race.date >= state.today) && (
        <p className="muted">
          No race needed to build a good week. Add one when you have a goal
          date.
        </p>
      )}
      <button
        className="secondary-button"
        onClick={() => void build()}
        disabled={offline}
      >
        Build training block
        <CalendarDays size={15} />
      </button>
      {state.blocks.length > 0 && (
        <details className="block-timeline">
          <summary>The weeks ahead</summary>
          <div>
            {state.blocks
              .filter(
                (block) =>
                  block.endDate >= state.today &&
                  block.raceId === (state.block?.raceId ?? null),
              )
              .slice(0, 26)
              .map((block) => (
                <div key={block.id}>
                  <span>{block.startDate}</span>
                  <strong>
                    {block.phase}
                    {block.cutback ? " · cutback" : ""}
                  </strong>
                  <span>{block.weeklyMinutes} min</span>
                </div>
              ))}
          </div>
        </details>
      )}
    </div>
  );
}
export function QuestionCard({
  question,
  close,
  saved,
}: {
  question: CoachQuestion;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="A quick check-in" close={close}>
      <p className="question-prompt">{question.text}</p>
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await api(`/questions/${question.id}/answer`, {
              operationId: operationId(),
              answer: String(new FormData(event.currentTarget).get("answer")),
            });
            await saved();
            close();
          } catch (error) {
            setError((error as Error).message);
            setBusy(false);
          }
        }}
      >
        <label>
          Your answer
          <textarea
            name="answer"
            rows={3}
            maxLength={1500}
            required
            autoFocus
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          Save answer
          <Check size={16} />
        </button>
      </form>
    </Modal>
  );
}
export function ReadinessDialog({
  state,
  close,
  saved,
}: {
  state: AppState;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const current =
    state.athlete.readiness?.date === state.today
      ? state.athlete.readiness
      : null;
  return (
    <Modal title="How are you arriving today?" close={close}>
      <p className="modal-intro">
        A little context before we add intensity. This check-in is saved for
        today.
      </p>
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true);
          try {
            await api(
              "/athlete",
              {
                operationId: operationId(),
                athlete: {
                  readiness: {
                    date: state.today,
                    sleep: data.get("sleep"),
                    soreness: data.get("soreness"),
                    mood: String(data.get("mood")),
                  },
                },
              },
              "PATCH",
            );
            await saved();
            close();
          } catch (error) {
            setError((error as Error).message);
            setBusy(false);
          }
        }}
      >
        <label>
          Sleep
          <select name="sleep" defaultValue={current?.sleep ?? "okay"}>
            <option value="poor">Poor</option>
            <option value="okay">Okay</option>
            <option value="good">Good</option>
          </select>
        </label>
        <label>
          Soreness
          <select name="soreness" defaultValue={current?.soreness ?? "none"}>
            <option value="none">None</option>
            <option value="some">Some</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Mood and energy
          <input
            name="mood"
            maxLength={150}
            defaultValue={current?.mood ?? ""}
            placeholder="Steady, tired, keen to get outside…"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={busy}>
          Save check-in
          <Heart size={16} />
        </button>
      </form>
    </Modal>
  );
}

export function TrainingSettings({
  athlete,
  today,
}: {
  athlete: Athlete;
  today: string;
}) {
  const [zones, setZones] = useState(
    Object.fromEntries(
      Object.entries(athlete.zones).map(([metric, rows]) => [
        metric,
        rows.map((zone) => ({ ...zone, rowKey: crypto.randomUUID() })),
      ]),
    ) as {
      [M in keyof Athlete["zones"]]: (Athlete["zones"][M][number] & {
        rowKey: string;
      })[];
    },
  );
  return (
    <>
      <details className="training-settings">
        <summary>Training zones and thresholds</summary>
        <p className="muted">
          Leave zones empty to train by effort. Pace bounds are minutes:seconds
          per kilometre, from faster to slower. Heart rate is bpm and power is
          watts.
        </p>
        {(["pace", "heartRate", "power"] as const).map((metric) => (
          <fieldset key={metric}>
            <legend>
              {metric === "pace"
                ? "Pace · min/km"
                : metric === "heartRate"
                  ? "Heart rate · bpm"
                  : "Power · W"}
            </legend>
            {zones[metric].map((zone, index) => (
              <div className="zone-row" key={zone.rowKey}>
                <input
                  name={`zone-${metric}-${index}-name`}
                  aria-label={`${metric} zone ${index + 1} name`}
                  defaultValue={zone.name}
                  placeholder="Zone name"
                  required
                />
                <input
                  name={`zone-${metric}-${index}-low`}
                  aria-label={`${metric} zone ${index + 1} low`}
                  defaultValue={
                    metric === "pace"
                      ? `${Math.floor(zone.low / 60)}:${String(Math.round(zone.low % 60)).padStart(2, "0")}`
                      : zone.low
                  }
                  placeholder={metric === "pace" ? "4:30" : "Low"}
                  required
                />
                <input
                  name={`zone-${metric}-${index}-high`}
                  aria-label={`${metric} zone ${index + 1} high`}
                  defaultValue={
                    metric === "pace"
                      ? `${Math.floor(zone.high / 60)}:${String(Math.round(zone.high % 60)).padStart(2, "0")}`
                      : zone.high
                  }
                  placeholder={metric === "pace" ? "6:00" : "High"}
                  required
                />
                <button
                  className="icon-button"
                  aria-label={`Remove ${metric} zone ${index + 1}`}
                  type="button"
                  onClick={() =>
                    setZones({
                      ...zones,
                      [metric]: zones[metric].filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <input
              type="hidden"
              name={`zone-${metric}-count`}
              value={zones[metric].length}
            />
            <button
              type="button"
              className="text-button"
              onClick={() =>
                setZones({
                  ...zones,
                  [metric]: [
                    ...zones[metric],
                    {
                      rowKey: crypto.randomUUID(),
                      name: `Zone ${zones[metric].length + 1}`,
                      low:
                        metric === "pace"
                          ? 270
                          : metric === "heartRate"
                            ? 120
                            : 100,
                      high:
                        metric === "pace"
                          ? 360
                          : metric === "heartRate"
                            ? 145
                            : 160,
                    },
                  ],
                })
              }
              disabled={zones[metric].length >= 10}
            >
              Add {metric === "heartRate" ? "heart-rate" : metric} zone
              <Plus size={14} />
            </button>
          </fieldset>
        ))}
        {(["pace", "heartRate", "ftp"] as const).map((metric) => (
          <fieldset key={metric}>
            <legend>
              {metric === "pace"
                ? "Threshold pace · min/km"
                : metric === "heartRate"
                  ? "Threshold heart rate · bpm"
                  : "FTP · W"}
            </legend>
            <div className="form-row">
              <label>
                Value
                <input
                  name={`threshold-${metric}`}
                  placeholder="Unknown"
                  defaultValue={
                    athlete.thresholds[metric]
                      ? metric === "pace"
                        ? `${Math.floor(athlete.thresholds[metric]!.value / 60)}:${String(Math.round(athlete.thresholds[metric]!.value % 60)).padStart(2, "0")}`
                        : athlete.thresholds[metric]!.value
                      : ""
                  }
                />
              </label>
              <label>
                Source
                <select
                  name={`threshold-${metric}-source`}
                  defaultValue={athlete.thresholds[metric]?.source ?? "told"}
                >
                  <option value="told">Self-reported</option>
                  <option value="tested">Tested</option>
                  <option value="estimated">Estimated</option>
                </select>
              </label>
            </div>
            <label>
              Date
              <input
                name={`threshold-${metric}-date`}
                type="date"
                max={today}
                defaultValue={athlete.thresholds[metric]?.date ?? today}
              />
            </label>
          </fieldset>
        ))}
      </details>
      <label>
        Hours available each week
        <input
          name="availableHours"
          type="number"
          min="0.5"
          max="60"
          step="0.5"
          defaultValue={athlete.availableHours ?? ""}
          placeholder="Optional"
        />
      </label>
      <label>
        Where is the concern, if any?
        <input
          name="constraintRegion"
          defaultValue={athlete.constraintRegion}
          maxLength={100}
          placeholder="Right knee, left Achilles…"
        />
      </label>
    </>
  );
}
export function parseTrainingSettings(form: FormData): Partial<Athlete> {
  const pace = (value: string) => {
    if (value.includes(":")) {
      const [minutes, seconds] = value.split(":").map(Number);
      if (
        !Number.isFinite(minutes) ||
        !Number.isFinite(seconds) ||
        seconds >= 60 ||
        seconds < 0
      )
        throw new Error("Use minutes:seconds for pace, such as 5:30.");
      return minutes * 60 + seconds;
    }
    return Number(value) * 60;
  };
  const zones: Athlete["zones"] = { pace: [], heartRate: [], power: [] };
  for (const metric of ["pace", "heartRate", "power"] as const)
    for (let i = 0; i < Number(form.get(`zone-${metric}-count`)); i++) {
      const low = String(form.get(`zone-${metric}-${i}-low`)),
        high = String(form.get(`zone-${metric}-${i}-high`));
      zones[metric].push({
        name: String(form.get(`zone-${metric}-${i}-name`)),
        low: metric === "pace" ? pace(low) : Number(low),
        high: metric === "pace" ? pace(high) : Number(high),
      });
    }
  const thresholds: Athlete["thresholds"] = {
    pace: null,
    heartRate: null,
    ftp: null,
  };
  for (const metric of ["pace", "heartRate", "ftp"] as const) {
    const value = String(form.get(`threshold-${metric}`) || "");
    if (value)
      thresholds[metric] = {
        value: metric === "pace" ? pace(value) : Number(value),
        source: form.get(`threshold-${metric}-source`) as
          | "tested"
          | "estimated"
          | "told",
        date: String(form.get(`threshold-${metric}-date`)),
      };
  }
  return {
    zones,
    thresholds,
    availableHours: form.get("availableHours")
      ? Number(form.get("availableHours"))
      : null,
    constraintRegion: String(form.get("constraintRegion") || ""),
  };
}
