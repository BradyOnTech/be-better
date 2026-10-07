import FitParser from "fit-file-parser";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  dateInTimezone,
  DomainError,
  type DraftValues,
} from "../../../../packages/domain/src/index.js";

const list = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const number = (value: unknown): number | null =>
  value !== null &&
  value !== undefined &&
  value !== "" &&
  Number.isFinite(Number(value))
    ? Number(value)
    : null;
const round = (value: unknown): number | null => {
  const result = number(value);
  return result === null ? null : Math.round(result);
};
const time = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
};
export const emptyValues = (date: string | null): DraftValues => ({
  date,
  sport: null,
  durationSeconds: null,
  distanceMetres: null,
  rpe: null,
  intent: "easy",
  feel: null,
  pain: null,
  startTime: null,
  movingSeconds: null,
  elevationGainMetres: null,
  averageHeartRate: null,
  maxHeartRate: null,
  averagePower: null,
  averageSpeedMetresPerSecond: null,
  normalizedPower: null,
  cadence: null,
  title: null,
  gear: null,
  treadmill: false,
});
const sport = (value: unknown): NonNullable<DraftValues["sport"]> =>
  /cycl|ride|bike/i.test(String(value))
    ? "bike"
    : /walk|hik/i.test(String(value))
      ? "walk"
      : /trail/i.test(String(value))
        ? "trail"
        : /run/i.test(String(value))
          ? "run"
          : "other";
const haversine = (a: any, b: any) => {
  const radians = (n: number) => (n * Math.PI) / 180;
  const p1 = radians(Number(a["@_lat"])),
    p2 = radians(Number(b["@_lat"])),
    dp = p2 - p1,
    dl = radians(Number(b["@_lon"]) - Number(a["@_lon"]));
  return (
    6371000 *
    2 *
    Math.atan2(
      Math.sqrt(
        Math.sin(dp / 2) ** 2 +
          Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2,
      ),
      Math.sqrt(
        1 -
          (Math.sin(dp / 2) ** 2 +
            Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2),
      ),
    )
  );
};
function extras(value: any, key: string): number | null {
  if (!value || typeof value !== "object") return null;
  for (const [name, item] of Object.entries(value)) {
    if (name.toLowerCase() === key.toLowerCase() && number(item) !== null)
      return number(item);
    const nested = extras(item, key);
    if (nested !== null) return nested;
  }
  return null;
}
export async function parseWorkout(
  bytes: Buffer,
  filename: string,
  timezone: string,
  today: string,
): Promise<{ values: DraftValues; raw: unknown; uncertain: string[] }> {
  const extension = filename.split(".").at(-1)?.toLowerCase();
  const fit = bytes.length >= 12 && bytes.subarray(8, 12).toString() === ".FIT";
  if (fit) {
    if (extension !== "fit")
      throw new DomainError(
        "FILE_TYPE",
        "This FIT file needs a .fit extension.",
        400,
      );
    const raw = await new FitParser({
      force: false,
      lengthUnit: "m",
      speedUnit: "m/s",
      mode: "list",
    }).parseAsync(new Uint8Array(bytes).buffer);
    const sessions = list(raw.sessions);
    if (sessions.length !== 1)
      throw new DomainError(
        "FILE_SESSIONS",
        "Import a file with one workout. Multi-session FIT files need to be split first.",
        400,
      );
    const s = sessions[0] as Record<string, unknown>;
    const start = time(s.start_time);
    const values: DraftValues = {
      ...emptyValues(start ? dateInTimezone(new Date(start), timezone) : today),
      sport: sport(s.sport),
      startTime: start,
      durationSeconds: round(s.total_timer_time ?? s.total_elapsed_time),
      movingSeconds: round(s.total_timer_time),
      distanceMetres: number(s.total_distance),
      elevationGainMetres: number(s.total_ascent),
      averageHeartRate: round(s.avg_heart_rate),
      maxHeartRate: round(s.max_heart_rate),
      averagePower: number(s.avg_power),
      averageSpeedMetresPerSecond: number(s.enhanced_avg_speed ?? s.avg_speed),
      normalizedPower: number(s.normalized_power),
      cadence: number(s.avg_cadence),
    };
    return {
      values,
      raw: {
        fileType: "FIT",
        session: s,
        recordsRetainedInOriginal: list(raw.records).length,
      },
      uncertain: !start ? ["date"] : [],
    };
  }
  if (!["gpx", "tcx"].includes(extension ?? ""))
    throw new DomainError("FILE_TYPE", "Choose a FIT, GPX, or TCX file.", 400);
  const xml = bytes.toString("utf8");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new DomainError(
      "XML_CONTENT",
      "XML document types and entities are not supported.",
      400,
    );
  if (XMLValidator.validate(xml) !== true)
    throw new DomainError("XML_CONTENT", "This XML file is not valid.", 400);
  const parsed = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    processEntities: false,
  }).parse(xml);
  if (extension === "gpx") {
    if (!parsed.gpx)
      throw new DomainError(
        "FILE_TYPE",
        "The file does not contain GPX data.",
        400,
      );
    const tracks = list(parsed.gpx.trk);
    if (tracks.length !== 1)
      throw new DomainError(
        "FILE_SESSIONS",
        "Choose a GPX file containing one track.",
        400,
      );
    const track = tracks[0] as any;
    const segments = list<any>(track.trkseg).map((segment) =>
      list<any>(segment.trkpt),
    );
    const points = segments.flat();
    if (points.length < 2)
      throw new DomainError(
        "GPX_POINTS",
        "This GPX needs at least two track points.",
        400,
      );
    if (
      points.some(
        (p) =>
          number(p["@_lat"]) === null ||
          number(p["@_lon"]) === null ||
          Math.abs(Number(p["@_lat"])) > 90 ||
          Math.abs(Number(p["@_lon"])) > 180,
      )
    )
      throw new DomainError(
        "GPX_POINTS",
        "A track point has invalid coordinates.",
        400,
      );
    const timed = points
      .map((p) => time(p.time))
      .filter((p): p is string => !!p);
    const start = timed[0] ?? null;
    let distance = 0,
      elevation = 0;
    for (const segment of segments)
      for (let i = 1; i < segment.length; i++) {
        distance += haversine(segment[i - 1], segment[i]);
        if (
          number(segment[i].ele) !== null &&
          number(segment[i - 1].ele) !== null
        )
          elevation += Math.max(
            0,
            Number(segment[i].ele) - Number(segment[i - 1].ele),
          );
      }
    const hearts = points
      .map((p) => extras(p.extensions, "hr"))
      .filter((n): n is number => n !== null);
    const powers = points
      .map((p) => extras(p.extensions, "power"))
      .filter((n): n is number => n !== null);
    const duration =
      timed.length > 1
        ? Math.round((Date.parse(timed.at(-1)!) - Date.parse(start!)) / 1000)
        : null;
    if (duration !== null && duration <= 0)
      throw new DomainError("GPX_TIME", "Track timestamps must increase.", 400);
    const values = {
      ...emptyValues(start ? dateInTimezone(new Date(start), timezone) : today),
      sport: track.type ? sport(track.type) : null,
      startTime: start,
      durationSeconds: duration,
      distanceMetres: Math.round(distance),
      elevationGainMetres: points.some((p) => p.ele !== undefined)
        ? Math.round(elevation)
        : null,
      averageHeartRate: hearts.length
        ? Math.round(hearts.reduce((a, b) => a + b, 0) / hearts.length)
        : null,
      maxHeartRate: hearts.length ? Math.max(...hearts) : null,
      averagePower: powers.length
        ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length)
        : null,
      title: track.name ? String(track.name) : null,
    };
    return {
      values,
      raw: {
        fileType: "GPX",
        points: points.length,
        segments: segments.length,
      },
      uncertain: [
        ...(!start ? ["date"] : []),
        ...(!duration ? ["durationSeconds"] : []),
        ...(!values.sport ? ["sport"] : []),
        "distanceMetres",
      ],
    };
  }
  const activities = list<any>(
    parsed.TrainingCenterDatabase?.Activities?.Activity,
  );
  if (activities.length !== 1)
    throw new DomainError(
      "FILE_SESSIONS",
      "Choose a TCX file with one activity.",
      400,
    );
  const activity = activities[0];
  const laps = list<any>(activity.Lap);
  const start = time(laps[0]?.["@_StartTime"] ?? activity.Id);
  const points = laps.flatMap((lap) =>
    list<any>(lap.Track).flatMap((track) => list<any>(track.Trackpoint)),
  );
  const heart = points
    .map((p) => number(p.HeartRateBpm?.Value))
    .filter((n): n is number => n !== null);
  const watts = points
    .map((p) => extras(p.Extensions, "Watts"))
    .filter((n): n is number => n !== null);
  const duration = laps.every((lap) => number(lap.TotalTimeSeconds) !== null)
    ? Math.round(
        laps.reduce((sum, lap) => sum + Number(lap.TotalTimeSeconds), 0),
      )
    : null;
  const distance = laps.every((lap) => number(lap.DistanceMeters) !== null)
    ? laps.reduce((sum, lap) => sum + Number(lap.DistanceMeters), 0)
    : null;
  const values = {
    ...emptyValues(start ? dateInTimezone(new Date(start), timezone) : today),
    sport: sport(activity["@_Sport"]),
    startTime: start,
    durationSeconds: duration,
    distanceMetres: distance,
    averageHeartRate: heart.length
      ? Math.round(heart.reduce((a, b) => a + b, 0) / heart.length)
      : round(laps[0]?.AverageHeartRateBpm?.Value),
    maxHeartRate: heart.length
      ? Math.max(...heart)
      : round(laps[0]?.MaximumHeartRateBpm?.Value),
    averagePower: watts.length
      ? Math.round(watts.reduce((a, b) => a + b, 0) / watts.length)
      : null,
  };
  return {
    values,
    raw: { fileType: "TCX", laps: laps.length, points: points.length },
    uncertain: [
      ...(!start ? ["date"] : []),
      ...(!duration ? ["durationSeconds"] : []),
    ],
  };
}
