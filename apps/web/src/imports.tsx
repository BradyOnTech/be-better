import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Camera,
  Upload,
  FileUp,
  Check,
  Trash2,
  RefreshCw,
  LoaderCircle,
  ArrowUpRight,
  Image as ImageIcon,
} from "lucide-react";
import { api, authenticatedFetch, operationId } from "./api.js";
import { Modal } from "./dialogs.js";
import {
  flushOutbox,
  queueUploads,
  queuedUploads,
  removeUpload,
  type QueuedUpload,
} from "./outbox.js";
import {
  elevationFromMetres,
  elevationToMetres,
  elevationUnit,
  formatDuration,
  formatDistance,
  type AppState,
  type ImportDraft,
  type Activity,
} from "../../../packages/domain/src/index.js";

export async function download(path: string, filename: string) {
  const response = await authenticatedFetch(`/api${path}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Could not download this file.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  const disposition = response.headers.get("Content-Disposition");
  const original = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  link.download = original ? decodeURIComponent(original) : filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function AssetPreview({ id }: { id: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true,
      object = "";
    authenticatedFetch(`/api/assets/${id}?preview=1`)
      .then((response) => response.blob())
      .then((blob) => {
        object = URL.createObjectURL(blob);
        if (active) setUrl(object);
        else URL.revokeObjectURL(object);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (object) URL.revokeObjectURL(object);
    };
  }, [id]);
  return url ? (
    <img className="draft-photo" src={url} alt="Original workout summary" />
  ) : (
    <div className="photo-loading">
      <ImageIcon size={24} />
      Loading original photo
    </div>
  );
}

function displayRate(
  speed: number | null | undefined,
  bike: boolean,
  units: "mi" | "km",
) {
  if (!speed) return "";
  const metres = units === "mi" ? 1609.344 : 1000;
  return String(
    Number((bike ? (speed * 3600) / metres : metres / speed / 60).toFixed(3)),
  );
}
function rateSpeed(value: string, bike: boolean, units: "mi" | "km") {
  if (!value) return null;
  const rate = Number(value),
    metres = units === "mi" ? 1609.344 : 1000;
  return bike ? (rate * metres) / 3600 : metres / (rate * 60);
}
export function ImportPicker({
  close,
  saved,
  draftId = null,
}: {
  close: () => void;
  saved: () => Promise<void>;
  draftId?: string | null;
}) {
  const camera = useRef<HTMLInputElement>(null),
    photo = useRef<HTMLInputElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState(""),
    [error, setError] = useState("");
  async function choose(files: FileList | null, source: "photo" | "file") {
    if (!files?.length) return;
    setError("");
    try {
      await queueUploads(Array.from(files), source, caption, draftId);
      await saved();
      close();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Modal
      title={draftId ? "Another view of this workout" : "Add a workout"}
      close={close}
    >
      <p className="modal-intro">
        A photo or file starts as a draft. You check the details before it
        counts.
      </p>
      <label className="import-caption">
        A little context, if useful
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={500}
          placeholder="Treadmill run today; the screen is in miles…"
        />
      </label>
      <div className="import-options">
        <button onClick={() => camera.current?.click()}>
          <Camera />
          <strong>Take a photo</strong>
          <span>Camera → review → confirm</span>
        </button>
        <button onClick={() => photo.current?.click()}>
          <ImageIcon />
          <strong>Choose photos</strong>
          <span>Watch, treadmill, or bike screen</span>
        </button>
        {!draftId && (
          <button onClick={() => file.current?.click()}>
            <FileUp />
            <strong>Choose a workout file</strong>
            <span>FIT, GPX, or TCX</span>
          </button>
        )}
      </div>
      <input
        ref={camera}
        aria-label="Take workout photo"
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void choose(e.target.files, "photo")}
      />
      <input
        ref={photo}
        aria-label="Choose workout photos"
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => void choose(e.target.files, "photo")}
      />
      <input
        ref={file}
        aria-label="Choose workout file"
        type="file"
        accept=".fit,.gpx,.tcx"
        multiple
        hidden
        onChange={(e) => void choose(e.target.files, "file")}
      />
      <p className="muted">
        If you’re offline, the original stays on this device and uploads when
        you reopen the app with a connection. Keep this app’s browser data until
        uploads finish.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </Modal>
  );
}
export function DraftCard({
  draft,
  state,
  close,
  saved,
  addPhoto,
}: {
  draft: ImportDraft;
  state: AppState;
  close: () => void;
  saved: () => Promise<void>;
  addPhoto: (id: string) => void;
}) {
  const units = state.athlete.units;
  const v = draft.values;
  const [reviewSport, setReviewSport] = useState(v.sport ?? "");
  const [averageRate, setAverageRate] = useState(
    displayRate(v.averageSpeedMetresPerSecond, v.sport === "bike", units),
  );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [mergeId, setMergeId] = useState(draft.duplicateIds[0] ?? "");
  const uncertain = (field: string) =>
    draft.uncertainFields.includes(field) ? (
      <small className="uncertain">Check this detail</small>
    ) : null;
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const startTime = form.get("time")
        ? new Date(String(form.get("time"))).toISOString()
        : (v.startTime ?? null);
      const optional = (name: string) =>
        form.get(name) ? Number(form.get(name)) : null;
      const elevation = optional("elevation");
      const activity = {
        ...v,
        date: String(form.get("date")),
        sport: form.get("sport"),
        durationSeconds: Math.round(Number(form.get("duration")) * 60),
        distanceMetres: form.get("distance")
          ? Number(form.get("distance")) * (units === "mi" ? 1609.344 : 1000)
          : null,
        rpe: optional("rpe"),
        intent: form.get("intent"),
        feel: String(form.get("feel")) || null,
        pain: String(form.get("pain")) || null,
        startTime,
        averageHeartRate: optional("hr"),
        maxHeartRate: optional("maxHr"),
        averagePower: optional("power"),
        averageSpeedMetresPerSecond: rateSpeed(
          averageRate,
          reviewSport === "bike",
          units,
        ),
        elevationGainMetres:
          elevation === null
            ? null
            : v.elevationGainMetres != null &&
                elevation === elevationFromMetres(v.elevationGainMetres, units)
              ? v.elevationGainMetres
              : elevationToMetres(elevation, units),
      };
      await api(`/activities/${draft.id}/confirm`, {
        operationId: operationId(),
        activity,
        mergeId: mergeId || null,
      });
      await saved();
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discard() {
    setBusy(true);
    try {
      await api(`/activities/${draft.id}/discard`, {
        operationId: operationId(),
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
    <Modal title="Check your workout" close={close} wide>
      <div className="draft-review">
        <div className="draft-original">
          {draft.source === "photo" &&
            draft.assetIds.map((id) => <AssetPreview id={id} key={id} />)}
          {draft.assetIds.map((id) => (
            <button
              key={`download-${id}`}
              className="text-button"
              onClick={() =>
                void download(`/assets/${id}`, "original-workout").catch(
                  (error) => setError(error.message),
                )
              }
            >
              Download original
              <ArrowUpRight size={14} />
            </button>
          ))}
          {draft.source === "photo" && (
            <button
              className="secondary-button"
              onClick={() => addPhoto(draft.id)}
              disabled={busy || draft.status === "processing"}
            >
              <Camera size={16} />
              Add another photo
            </button>
          )}
          <span className="status proposed">Unconfirmed draft</span>
          <p>It isn’t part of your log or training totals until you confirm.</p>
          {draft.confidence !== null && (
            <p className="muted">
              Extraction confidence: {Math.round(draft.confidence * 100)}%.
              Check every detail.
            </p>
          )}
          {draft.error && (
            <div className="reason-card">
              <p>{draft.error}</p>
              {draft.source === "photo" && (
                <button
                  className="text-button"
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/drafts/${draft.id}/retry`, {});
                      await saved();
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy}
                >
                  Retry extraction
                  <RefreshCw size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        <form className="form-grid" onSubmit={confirm}>
          <div className="form-row">
            <label>
              Sport
              <select
                name="sport"
                value={reviewSport}
                required
                onChange={(event) => {
                  const next = event.target.value;
                  setAverageRate(
                    displayRate(
                      rateSpeed(averageRate, reviewSport === "bike", units),
                      next === "bike",
                      units,
                    ),
                  );
                  setReviewSport(next);
                }}
              >
                <option value="" disabled>
                  Choose sport
                </option>
                {["run", "trail", "bike", "walk", "strength", "other"].map(
                  (s) => (
                    <option value={s} key={s}>
                      {s === "trail"
                        ? "Trail run"
                        : s === "bike"
                          ? "Bike"
                          : s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ),
                )}
              </select>
              {uncertain("sport")}
            </label>
            <label>
              Date
              <input
                type="date"
                name="date"
                defaultValue={v.date ?? ""}
                max={state.today}
                required
              />
              {uncertain("date")}
            </label>
          </div>
          <div className="form-row">
            <label>
              Duration (minutes)
              <input
                type="number"
                name="duration"
                min="0.1"
                max="4320"
                step="any"
                required
                defaultValue={v.durationSeconds ? v.durationSeconds / 60 : ""}
              />
              {uncertain("durationSeconds")}
            </label>
            <label>
              Distance ({units})
              <input
                type="number"
                name="distance"
                min="0"
                step="any"
                defaultValue={
                  v.distanceMetres != null
                    ? Number(
                        (
                          v.distanceMetres / (units === "mi" ? 1609.344 : 1000)
                        ).toFixed(3),
                      )
                    : ""
                }
              />
              {uncertain("distanceMetres")}
            </label>
          </div>
          <label>
            {reviewSport === "bike"
              ? `Average speed (${units}/hour)`
              : `Average pace (minutes/${units})`}
            <input
              name="averageRate"
              type="number"
              min="0.001"
              step="any"
              value={averageRate}
              onChange={(event) => setAverageRate(event.target.value)}
              placeholder="Only if reported by the screen or device"
            />
            <small>
              Reported pace or speed is kept separately from distance and
              duration. For pace, 8:30 is 8.5 minutes.
            </small>
            {uncertain("averageSpeedMetresPerSecond")}
          </label>
          <div className="form-row">
            <label>
              Session type
              <select name="intent" defaultValue={v.intent ?? "easy"}>
                {[
                  "easy",
                  "long",
                  "quality",
                  "endurance",
                  "hills",
                  "race",
                  "strength",
                  "back-to-back",
                ].map((intent) => (
                  <option key={intent} value={intent}>
                    {intent}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Effort (RPE 1–10)
              <input
                name="rpe"
                type="number"
                min="1"
                max="10"
                defaultValue={v.rpe ?? ""}
                placeholder="How did it feel?"
              />
            </label>
          </div>
          <details className="more-fields">
            <summary>Start time and device details</summary>
            <p className="muted">
              The start time below uses this device’s local timezone.
            </p>
            <label>
              Workout start
              <input
                type="datetime-local"
                name="time"
                defaultValue={
                  v.startTime
                    ? new Date(
                        Date.parse(v.startTime) -
                          new Date(v.startTime).getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
              />
            </label>
            <div className="form-row">
              <label>
                Average heart rate
                <input
                  name="hr"
                  type="number"
                  min="20"
                  max="250"
                  defaultValue={v.averageHeartRate ?? ""}
                />
              </label>
              <label>
                Max heart rate
                <input
                  name="maxHr"
                  type="number"
                  min="20"
                  max="250"
                  defaultValue={v.maxHeartRate ?? ""}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Average power (W)
                <input
                  name="power"
                  type="number"
                  min="0"
                  max="5000"
                  defaultValue={v.averagePower ?? ""}
                />
              </label>
              <label>
                Elevation gain ({elevationUnit(units)})
                <input
                  name="elevation"
                  type="number"
                  min="0"
                  max={units === "mi" ? 164000 : 50000}
                  defaultValue={
                    v.elevationGainMetres != null
                      ? elevationFromMetres(v.elevationGainMetres, units)
                      : ""
                  }
                />
              </label>
            </div>
          </details>
          <label>
            How did it feel?
            <input name="feel" defaultValue={v.feel ?? ""} maxLength={500} />
          </label>
          <label>
            Any pain?
            <input name="pain" defaultValue={v.pain ?? ""} maxLength={500} />
          </label>
          {draft.duplicateIds.length > 0 && (
            <div className="duplicate-card">
              <strong>This may already be in your log</strong>
              <p>
                Attach the new details to one workout to keep it counted once.
              </p>
              <label>
                Save to
                <select
                  aria-label="Duplicate action"
                  value={mergeId}
                  onChange={(e) => setMergeId(e.target.value)}
                >
                  {draft.duplicateIds.map((id) => {
                    const existing = state.activities.find((a) => a.id === id);
                    return (
                      <option value={id} key={id}>
                        {existing
                          ? `${existing.date} · ${formatDuration(existing.durationSeconds)} ${existing.sport}`
                          : "Existing confirmed workout"}
                      </option>
                    );
                  })}
                  <option value="">Save as a separate workout</option>
                </select>
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="primary-button"
            disabled={busy || draft.status === "processing"}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Check size={16} />
            )}
            Confirm workout
          </button>
          <button
            className="text-button danger"
            type="button"
            disabled={busy || draft.status === "processing"}
            onClick={() => void discard()}
          >
            <Trash2 size={14} />
            Discard draft
          </button>
        </form>
      </div>
    </Modal>
  );
}
export function ImportsView({
  state,
  open,
  add,
  sync,
  connect,
  offline,
}: {
  state: AppState;
  open: (id: string) => void;
  add: () => void;
  sync: () => Promise<void>;
  connect: () => void;
  offline: boolean;
}) {
  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  useEffect(() => {
    const refresh = () => void queuedUploads().then(setQueue);
    window.addEventListener("be-better-outbox", refresh);
    refresh();
    return () => window.removeEventListener("be-better-outbox", refresh);
  }, []);
  return (
    <section className="imports-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">GET THE WORK INTO YOUR LOG</span>
          <h1>Check it. Then count it.</h1>
          <p>Photos, files, and sync meet in the same review card.</p>
        </div>
        <button className="primary-button" onClick={add}>
          <Upload size={16} />
          Add photo or file
        </button>
      </div>
      {queue.length > 0 && (
        <div className="outbox-panel">
          <h2>On this device</h2>
          <p>These originals are saved here until the server receives them.</p>
          {queue.map((item) => (
            <div key={item.id} className="outbox-item">
              <div>
                <strong>{item.filename}</strong>
                <span>
                  {item.uploading
                    ? "Uploading and extracting…"
                    : (item.error ?? "Waiting for a connection")}
                </span>
              </div>
              {item.uploading ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <button
                  className="icon-button"
                  aria-label={`Remove queued ${item.filename}`}
                  onClick={() => void removeUpload(item.id)}
                >
                  <XIcon />
                </button>
              )}
            </div>
          ))}
          <button
            className="secondary-button"
            onClick={() => void flushOutbox(true)}
          >
            Retry uploads
            <RefreshCw size={15} />
          </button>
        </div>
      )}
      <div className="draft-list">
        {state.drafts.map((draft) => (
          <button
            className="import-draft-row"
            onClick={() => open(draft.id)}
            key={draft.id}
            disabled={offline || draft.status === "processing"}
          >
            <span className="session-icon">
              {draft.source === "photo" ? (
                <Camera size={20} />
              ) : (
                <FileUp size={20} />
              )}
            </span>
            <div>
              <strong>
                {draft.values.title ??
                  (draft.values.sport
                    ? `${draft.values.sport} workout`
                    : "Workout to review")}
              </strong>
              <span>
                {draft.values.date ?? "Date to check"} · {draft.source}
                {draft.values.durationSeconds
                  ? ` · ${formatDuration(draft.values.durationSeconds)}`
                  : ""}
                {draft.values.distanceMetres != null
                  ? ` · ${formatDistance(draft.values.distanceMetres, state.athlete.units)}`
                  : ""}
              </span>
              {draft.duplicateIds.length > 0 && (
                <small>
                  Possible duplicate · attach to an existing workout
                </small>
              )}
            </div>
            <span
              className={`status ${draft.status === "processing" ? "accepted" : "proposed"}`}
            >
              {draft.status === "processing" ? "Extracting…" : "Review draft"}
            </span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      {!state.drafts.length && !queue.length && (
        <div className="log-empty">
          <Camera size={40} strokeWidth={1.2} />
          <h2>Every source, one log.</h2>
          <p>
            Photograph a summary or choose a FIT, GPX, or TCX file.
            <br />
            You stay in charge of what gets saved.
          </p>
          <button className="secondary-button" onClick={add}>
            Add your first import
            <ArrowUpRight size={16} />
          </button>
        </div>
      )}
      <div className="sync-card">
        <div>
          <span className="eyebrow">OPTIONAL CONNECTION</span>
          <h2>Intervals.icu</h2>
          <p>
            {state.sync.configured
              ? "Import your completed sessions for review. Repeated syncs keep one copy."
              : "Add your API key in Settings to bring your completed workouts into Be Better."}
          </p>
          {state.sync.lastSync && (
            <small>
              Last sync: {new Date(state.sync.lastSync).toLocaleString()}
            </small>
          )}
          {state.sync.error && <p className="form-error">{state.sync.error}</p>}
        </div>
        <button
          className="secondary-button"
          onClick={() => (state.sync.configured ? void sync() : connect())}
          disabled={offline}
        >
          {state.sync.configured
            ? "Sync recent workouts"
            : "Connect Intervals.icu"}
          <RefreshCw size={15} />
        </button>
      </div>
    </section>
  );
}
function XIcon() {
  return <Trash2 size={15} />;
}
