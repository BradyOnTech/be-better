import type { Phase } from "../../../packages/domain/src/index.js";

// Week-by-week volume from the athlete's current level toward a destination
// taken from the matching reference program. Shared by race blocks and by
// Programs previews so both plan the same way.
export interface WeekFrame {
  phase: Phase;
  cutback: boolean;
  /** Days from this week's start to the goal date; Infinity without one. */
  daysOut: number;
}
export interface WeekLoad {
  weeklyMinutes: number;
  longMinutes: number;
  /** Easy second day after the long run, 0 when there is none. */
  secondMinutes: number;
}
export interface ProgressionInput {
  weeklyMinutes: number;
  longestMinutes: number;
  peakWeeklyMinutes: number;
  peakLongMinutes: number;
  availableMinutes?: number;
  /** Long ultras pair some specific-phase long runs with an easy second day. */
  backToBack?: boolean;
  ultra?: boolean;
}

const round5 = (minutes: number) => Math.round(minutes / 5) * 5;
const training = (frame: WeekFrame) =>
  frame.phase !== "taper" && frame.phase !== "recovery";

export function progressWeeks(
  frames: WeekFrame[],
  input: ProgressionInput,
): WeekLoad[] {
  const available = input.availableMinutes ?? Infinity;
  const peakWeekly = Math.min(
    available,
    Math.max(input.weeklyMinutes, input.peakWeeklyMinutes),
  );
  const peakLong = Math.max(input.longestMinutes, input.peakLongMinutes);
  let level = Math.min(available, input.weeklyMinutes);
  let long = input.longestMinutes;
  let specificWeeks = 0;
  const loads: WeekLoad[] = [];
  frames.forEach((frame, index) => {
    if (!training(frame)) {
      // Taper from the last full week; the final week keeps no long run.
      const factor =
        frame.phase === "recovery"
          ? 0.2
          : frame.daysOut <= 6
            ? 0.35
            : frame.daysOut <= 13
              ? 0.6
              : 0.75;
      const longFactor =
        frame.phase === "recovery" || frame.daysOut <= 6
          ? 0
          : frame.daysOut <= 13
            ? 0.45
            : 0.6;
      loads.push({
        weeklyMinutes: Math.max(20, round5(level * factor)),
        longMinutes: long > 0 ? round5(long * longFactor) : 0,
        secondMinutes: 0,
      });
      return;
    }
    if (frame.cutback) {
      loads.push({
        weeklyMinutes: Math.max(20, round5(level * 0.8)),
        longMinutes: round5(long * 0.75),
        secondMinutes: 0,
      });
      return;
    }
    if (index > 0) {
      // Spread the climb over the remaining full weeks, about 10% (at least
      // 15 minutes) a week at most, and ten to fifteen minutes on the long run.
      const remaining = frames
        .slice(index)
        .filter((f) => training(f) && !f.cutback).length;
      // Close to the race the volume consolidates rather than ramps.
      const cap =
        frame.phase === "specific"
          ? Math.max(level * 0.05, 10)
          : Math.max(level * 0.1, 15);
      level += Math.min(Math.max(0, (peakWeekly - level) / remaining), cap);
      long += Math.min(Math.max(0, (peakLong - long) / remaining), 15);
    } else if (long > 0) long = Math.min(peakLong, long + 10);
    const weeklyMinutes = Math.max(20, round5(level));
    const share = input.ultra ? 0.5 : 0.45;
    const longMinutes =
      long > 0
        ? round5(
            Math.min(
              long,
              Math.max(
                weeklyMinutes * share,
                Math.min(weeklyMinutes * 0.5, 90),
              ),
            ),
          )
        : 0;
    // Back-to-backs show up in the specific phase, on alternate full weeks.
    const pair =
      !!input.backToBack &&
      frame.phase === "specific" &&
      longMinutes >= 120 &&
      specificWeeks++ % 2 === 0;
    loads.push({
      weeklyMinutes,
      longMinutes,
      secondMinutes: pair ? round5(longMinutes * 0.6) : 0,
    });
  });
  return loads;
}
