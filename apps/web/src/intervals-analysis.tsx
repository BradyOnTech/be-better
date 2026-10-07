import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  IntervalsAnalysis,
  AnalysisKind,
} from "../../../packages/domain/src/index.js";
import { api } from "./api.js";

const metric = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "—"
    : value.toLocaleString(undefined, { maximumFractionDigits: digits });
const date = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString() : "Not refreshed yet";
const pace = (speed: number, swim: boolean) => {
  const seconds = Math.round((swim ? 100 : 1000) / speed);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${swim ? " / 100m" : " / km"}`;
};
export function IntervalsAnalysisPanel({
  changed,
}: {
  changed: () => Promise<void>;
}) {
  const [analysis, setAnalysis] = useState<IntervalsAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      api<IntervalsAnalysis>("/analysis/intervals")
        .then((value) => {
          if (active) setAnalysis(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  async function refresh(backfill = false) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api<IntervalsAnalysis>("/analysis/intervals/refresh", {
        backfill,
      });
      setAnalysis(next);
      setMessage(
        Object.values(next.datasets).some((s) => s?.error)
          ? "Some data could not refresh. Cached records are retained."
          : "Analysis refreshed. Your coach can use these observations.",
      );
      await changed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const pending = busy || analysis?.refreshing;
  const wellness = analysis?.latestWellness;
  const failures = analysis
    ? Object.entries(analysis.datasets).filter(([, value]) => value?.error)
    : [];
  return (
    <section
      className="intervals-analysis-panel"
      aria-labelledby="analysis-heading"
    >
      <div className="connection-settings-heading">
        <h4 id="analysis-heading">Training analysis</h4>
        {analysis && (
          <span
            className={`connection-badge ${analysis.stale ? "" : "connected"}`}
          >
            {pending
              ? "Refreshing…"
              : analysis.stale
                ? "Needs refresh"
                : "Up to date"}
          </span>
        )}
      </div>
      <p className="muted">
        Fitness, fatigue, recovery trends, and workout analysis inform your
        coach. Analysis updates on the server every six hours, including when
        the app is closed.
      </p>
      {!analysis && !error && <p className="muted">Reading analysis…</p>}
      {wellness && (
        <>
          <p className="analysis-date">
            Provider estimates for {wellness.date}
          </p>
          <dl className="analysis-metrics">
            <div>
              <dt>Fitness (CTL)</dt>
              <dd>{metric(wellness.fitness)}</dd>
            </div>
            <div>
              <dt>Fatigue (ATL)</dt>
              <dd>{metric(wellness.fatigue)}</dd>
            </div>
            <div>
              <dt>
                Form {analysis?.form?.displayAsPercent ? "(%)" : "(points)"}
              </dt>
              <dd>
                {metric(
                  analysis?.form?.displayAsPercent
                    ? analysis.form.percent
                    : analysis?.form?.absolute,
                )}
                {analysis?.form?.displayAsPercent &&
                analysis.form.percent !== null
                  ? "%"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Ramp rate</dt>
              <dd>{metric(wellness.rampRate)}</dd>
            </div>
          </dl>
        </>
      )}
      {analysis && (
        <p className="analysis-coverage">
          Last four weeks: {analysis.coverage.providerActivities} activities
          with provider analysis · {analysis.coverage.linkedConfirmedActivities}{" "}
          linked to your confirmed log.
        </p>
      )}
      <button
        type="button"
        className="secondary-button"
        disabled={!!pending}
        onClick={() => void refresh()}
      >
        <RefreshCw size={15} className={pending ? "spin" : ""} />
        {pending ? "Refreshing analysis…" : "Refresh analysis"}
      </button>
      {failures.map(([kind, value]) => (
        <p className="form-error" role="alert" key={kind}>
          {kind[0].toUpperCase() + kind.slice(1)}: {value!.error}
        </p>
      ))}
      {analysis && (
        <details className="analysis-details">
          <summary>Data, recovery, and reference zones</summary>
          <h5>Data freshness</h5>
          <ul className="analysis-datasets">
            {(["activities", "wellness", "settings"] as AnalysisKind[]).map(
              (kind) => {
                const state = analysis.datasets[kind];
                return (
                  <li key={kind}>
                    <strong>{kind[0].toUpperCase() + kind.slice(1)}</strong>
                    <span>{date(state?.lastSuccess)}</span>
                    <small>
                      {state?.records ?? 0} records
                      {state?.historyFrom
                        ? ` · since ${state.historyFrom}`
                        : ""}
                      {state?.restricted
                        ? ` · ${state.restricted} restricted`
                        : ""}
                    </small>
                  </li>
                );
              },
            )}
          </ul>
          <button
            type="button"
            className="text-button"
            disabled={!!pending}
            onClick={() => void refresh(true)}
          >
            Reload six months of analysis
          </button>
          <h5>Recovery observations</h5>
          <p className="muted">
            Recent averages use seven days; the baseline uses the preceding 28
            days. Missing measurements stay unknown.
          </p>
          <dl className="analysis-recovery">
            {(
              [
                ["HRV (rMSSD)", analysis.recovery.hrv, "ms"],
                [
                  "Resting heart rate",
                  analysis.recovery.restingHeartRate,
                  "bpm",
                ],
                ["Sleep", analysis.recovery.sleep, "minutes"],
              ] as const
            ).map(([label, trend, units]) => {
              const divisor = units === "minutes" ? 60 : 1;
              return (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {trend.recentAverage === null
                      ? "No recent measurements"
                      : `${metric(trend.recentAverage / divisor)} ${units} · ${trend.recentSamples} recent samples`}
                  </dd>
                  <small>
                    {trend.baselineAverage === null
                      ? "No baseline measurements"
                      : `Baseline ${metric(trend.baselineAverage / divisor)} ${units} · ${trend.baselineSamples} samples`}
                    {trend.changePercent === null
                      ? ""
                      : ` · ${metric(trend.changePercent)}% change`}
                  </small>
                </div>
              );
            })}
          </dl>
          <h5>Weekly provider load</h5>
          <div className="analysis-table-scroll">
            <table className="analysis-load-table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Load</th>
                  <th>Known / available</th>
                </tr>
              </thead>
              <tbody>
                {analysis.weeks.map((week) => (
                  <tr key={week.date}>
                    <td>{week.date}</td>
                    <td>{metric(week.trainingLoad, 0)}</td>
                    <td>
                      {week.knownLoadActivities} / {week.activities}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            Provider load is kept separate from local duration/RPE load. A dash
            means unknown.
          </p>
          <h5>Sport settings from Intervals.icu</h5>
          <p className="muted">
            These are reference values. Review and save prescription zones under
            Settings → Training before using numeric workout targets.
          </p>
          {analysis.settings?.sports.map((sport) => (
            <details className="analysis-sport" key={sport.id}>
              <summary>{sport.types.join(", ")}</summary>
              <p>
                {sport.ftpWatts === null
                  ? ""
                  : `FTP: ${metric(sport.ftpWatts, 0)} W. `}
                {sport.thresholdHeartRate === null
                  ? ""
                  : `Threshold heart rate: ${metric(sport.thresholdHeartRate, 0)} bpm. `}
                {sport.thresholdSpeedMetresPerSecond &&
                sport.thresholdSpeedMetresPerSecond > 0
                  ? `Threshold pace: ${pace(
                      sport.thresholdSpeedMetresPerSecond,
                      sport.types.some((type) => /swim/i.test(type)),
                    )}.`
                  : ""}
              </p>
              {sport.heartRateZoneUpperBounds.length > 0 && (
                <p>
                  Heart-rate zone upper bounds:{" "}
                  {sport.heartRateZoneUpperBounds.join(" · ")} bpm.
                </p>
              )}
              {sport.powerZonePercentages.length > 0 && (
                <p>
                  Power zone upper bounds:{" "}
                  {sport.powerZonePercentages.join(" · ")}% of FTP.
                </p>
              )}
              {sport.paceZonePercentages.length > 0 && (
                <p>
                  Pace zone bounds: {sport.paceZonePercentages.join(" · ")}% of
                  threshold.
                </p>
              )}
            </details>
          ))}
          {analysis.limitations.length > 0 && (
            <>
              <h5>Coverage and limitations</h5>
              <ul className="analysis-limitations">
                {analysis.limitations.map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      {message && (
        <p className="connection-feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
