import { useEffect, useState, type FormEvent } from "react";
import { Check, RefreshCw, ArrowUpRight } from "lucide-react";
import { api } from "./api.js";
import { IntervalsAnalysisPanel } from "./intervals-analysis.js";

type Connection = {
  configured: boolean;
  athleteId: string;
  lastSync: string | null;
  error: string | null;
};

export function IntervalsSettings({
  changed,
  review,
}: {
  changed: () => Promise<void>;
  review: () => void;
}) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [athleteId, setAthleteId] = useState("0");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [hasDrafts, setHasDrafts] = useState(false);
  useEffect(() => {
    let active = true;
    api<Connection>("/sync/intervals/connection")
      .then((value) => {
        if (!active) return;
        setConnection(value);
        setAthleteId(value.athleteId);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api<Connection>("/sync/intervals/connection", {
        apiKey,
        athleteId: athleteId.trim() || "0",
      });
      setConnection(next);
      setApiKey("");
      setEditing(false);
      setMessage("Connected. Sync your workouts when you’re ready.");
      await changed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setConnection(
        await api<Connection>("/sync/intervals/connection", {}, "DELETE"),
      );
      setApiKey("");
      setEditing(false);
      setMessage("Disconnected. Your saved workouts stay in your log.");
      await changed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        created: number;
        updated: number;
        unchanged: number;
        restricted?: number;
      }>("/sync/intervals", {});
      setMessage(
        `${result.created} new drafts · ${result.updated} updates · ${result.unchanged} unchanged${result.restricted ? ` · ${result.restricted} restricted records skipped` : ""}`,
      );
      setHasDrafts(result.created + result.updated > 0);
      setConnection(await api<Connection>("/sync/intervals/connection"));
      await changed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="connection-settings-card"
      aria-labelledby="intervals-heading"
    >
      <div className="connection-settings-heading">
        <h3 id="intervals-heading">Intervals.icu</h3>
        {connection && (
          <span
            className={`connection-badge ${connection.configured ? "connected" : ""}`}
          >
            {connection.configured ? "Connected" : "Not connected"}
          </span>
        )}
      </div>
      <p>
        Bring completed workouts into your log. You review new imports before
        they count; repeat syncs keep one copy.
      </p>
      {!connection && !error && <p className="muted">Checking connection…</p>}
      {connection?.configured && !editing ? (
        <>
          <p className="muted">
            {connection.athleteId === "0"
              ? "Connected to your own account."
              : `Athlete ${connection.athleteId}`}
          </p>
          {connection.lastSync && (
            <p className="muted">
              Last sync: {new Date(connection.lastSync).toLocaleString()}
            </p>
          )}
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void sync()}
          >
            <RefreshCw size={15} className={busy ? "spin" : ""} />
            {busy ? "Working…" : "Sync last four weeks"}
          </button>
          <div className="connection-actions">
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setEditing(true);
                setError("");
                setMessage("");
              }}
            >
              Change connection
            </button>
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect
            </button>
            <a href="https://intervals.icu" target="_blank" rel="noreferrer">
              Open Intervals.icu <ArrowUpRight size={13} />
            </a>
          </div>
          <IntervalsAnalysisPanel changed={changed} />
        </>
      ) : (
        connection && (
          <form className="form-grid" onSubmit={connect}>
            <label>
              API key
              <input
                name="intervalsApiKey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                required
                minLength={8}
                maxLength={512}
                placeholder="Paste your Intervals.icu API key"
              />
            </label>
            <label>
              Athlete ID
              <input
                name="intervalsAthleteId"
                value={athleteId}
                onChange={(event) => setAthleteId(event.target.value)}
                maxLength={40}
                placeholder="0"
              />
              <small>Leave 0 to use your own account.</small>
            </label>
            <p className="connection-help">
              Find your key in{" "}
              <a
                href="https://intervals.icu/settings"
                target="_blank"
                rel="noreferrer"
              >
                Intervals.icu Settings → Developer Settings
              </a>
              . Your key is saved on your Be Better server and is never sent to
              the coach.
            </p>
            <button
              type="submit"
              className="secondary-button"
              disabled={busy || !apiKey.trim()}
            >
              {busy ? "Checking connection…" : "Connect Intervals.icu"}
              <Check size={15} />
            </button>
            {editing && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => {
                  setApiKey("");
                  setEditing(false);
                  setError("");
                }}
              >
                Cancel
              </button>
            )}
          </form>
        )
      )}
      {message && (
        <p className="connection-feedback" role="status">
          {message}
        </p>
      )}
      {hasDrafts && (
        <button type="button" className="text-button" onClick={review}>
          Review imported workouts <ArrowUpRight size={15} />
        </button>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
