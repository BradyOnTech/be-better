// The athlete's current training level. What the athlete reports and what the
// app has recorded are both evidence; neither caps the other. A new log holds
// a few entries, not a training history.
export interface TrainingBaseline {
  /** Usual endurance minutes per week, or null when nothing is known. */
  weeklyMinutes: number | null;
  /** Longest recent run or trail session in minutes, or null. */
  longestRunMinutes: number | null;
  reported: {
    weeklyMinutes: number | null;
    longestRunMinutes: number | null;
    date: string | null;
    /** True when an older stated number gives way to a well-covered log. */
    stale: boolean;
  };
  logged: {
    weeklyMinutes: number | null;
    longestRunMinutes: number | null;
    /** Weeks the last 28 days of the log actually cover, 0–4. */
    weeks: number;
  };
}

const dayMs = 86400000;

export function trainingBaseline(input: {
  today: string;
  athlete: {
    weeklyMinutes: number | null;
    longestRunMinutes: number | null;
    backgroundDate?: string | null;
  };
  activities: Array<{
    date: string;
    sport: string;
    durationSeconds: number;
    confirmed?: boolean;
  }>;
  /** Sports that count as volume; defaults to everything but strength. */
  counts?: (sport: string) => boolean;
}): TrainingBaseline {
  const counts =
    input.counts ?? ((sport) => sport !== "strength" && sport !== "rest");
  const from = new Date(Date.parse(input.today) - 27 * dayMs)
    .toISOString()
    .slice(0, 10);
  const recent = input.activities.filter(
    (a) =>
      a.confirmed !== false &&
      a.date >= from &&
      a.date <= input.today &&
      counts(a.sport),
  );
  const earliest = recent.map((a) => a.date).sort()[0];
  const weeks = earliest
    ? Math.min(
        4,
        Math.max(
          1,
          Math.ceil(
            (Date.parse(input.today) - Date.parse(earliest)) / dayMs / 7 +
              1 / 7,
          ),
        ),
      )
    : 0;
  const loggedWeekly = weeks
    ? Math.round(
        recent.reduce((sum, a) => sum + a.durationSeconds / 60, 0) / weeks,
      )
    : null;
  const runs = recent
    .filter((a) => a.sport === "run" || a.sport === "trail")
    .map((a) => Math.round(a.durationSeconds / 60));
  const loggedLongest = runs.length ? Math.max(...runs) : null;
  // A stated number is current for six weeks. After that, a log covering two
  // or more weeks is the better guide; the coach can ask for a fresh number.
  const stated = input.athlete.backgroundDate;
  const stale =
    weeks >= 2 &&
    recent.length >= 3 &&
    (!stated || Date.parse(input.today) - Date.parse(stated) > 42 * dayMs);
  const reportedWeekly = stale ? null : input.athlete.weeklyMinutes;
  const reportedLongest = stale ? null : input.athlete.longestRunMinutes;
  const highest = (...values: (number | null)[]) => {
    const known = values.filter((v): v is number => v != null);
    return known.length ? Math.max(...known) : null;
  };
  return {
    weeklyMinutes: highest(reportedWeekly, loggedWeekly),
    longestRunMinutes: highest(reportedLongest, loggedLongest),
    reported: {
      weeklyMinutes: input.athlete.weeklyMinutes,
      longestRunMinutes: input.athlete.longestRunMinutes,
      date: stated ?? null,
      stale,
    },
    logged: {
      weeklyMinutes: loggedWeekly,
      longestRunMinutes: loggedLongest,
      weeks,
    },
  };
}
