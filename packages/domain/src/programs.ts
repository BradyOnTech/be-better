// Original descriptions of how public training programs are structured, plus
// original example sessions from ./workouts.ts. Published day-by-day plans are
// not stored. See docs/research/program-library.md.
import {
  chooseWorkouts,
  describeWorkout,
  type ExampleWorkout,
  type WorkoutQuery,
} from "./workouts.js";

export {
  chooseWorkouts,
  describeWorkout,
  exampleWorkouts,
  formatWorkoutSteps,
  workoutDurationText,
  workoutHold,
} from "./workouts.js";
export type { ExampleWorkout, WorkoutQuery } from "./workouts.js";

export const programEvents = [
  "base",
  "short-distance",
  "half-marathon",
  "marathon",
  "ultra",
  "trail",
  "hike",
  "road-bike",
  "mountain-bike",
] as const;
export type ProgramEvent = (typeof programEvents)[number];
export const trainingPhases = [
  "base",
  "build",
  "specific",
  "taper",
  "recovery",
] as const;
export type TrainingPhase = (typeof trainingPhases)[number];
export type ProgramExperience = "new" | "developing" | "experienced";

export interface ProgramSource {
  title: string;
  url: string;
  usedFor: string;
}

interface Range {
  low: number;
  high: number;
}

interface ProgramPattern {
  id: string;
  title: string;
  purpose: string;
  sports: Array<"run" | "trail" | "bike" | "walk" | "strength">;
  events: ProgramEvent[];
  phases: TrainingPhase[];
  experience: ProgramExperience[];
  /** What this pattern is mainly teaching. */
  focus: "foundation" | "either" | "race-specific";
  weeklyMinutes: Range | null;
  daysPerWeek: Range;
  distanceMetres: Range | null;
  /** Weeks until the event, when the pattern assumes a horizon. */
  horizonWeeks: Range | null;
  athlete: string;
  progression: string;
  recovery: string;
  modifications: string[];
  weekShape: string;
  notFor: string;
  sources: ProgramSource[];
}

const COPYRIGHT =
  "Published plans stay with their authors. These notes describe structure, fit, and how to change a week. They are not a copy of anyone's daily plan, and they are not this athlete's prescription.";

const library: ProgramPattern[] = [
  {
    id: "easy-base",
    title: "First consistency block",
    purpose:
      "Make easy running a habit before any race plan starts. A published 12-week novice base ends at a short long run, which is the front door of an 18-week first marathon, not the marathon itself.",
    sports: ["run", "walk"],
    events: ["base"],
    phases: ["base"],
    experience: ["new"],
    focus: "foundation",
    weeklyMinutes: { low: 60, high: 180 },
    daysPerWeek: { low: 3, high: 4 },
    distanceMetres: null,
    horizonWeeks: null,
    athlete:
      "New to running, or coming back after a long break. Three or four short outings and a walk are enough. This is the wrong card once a weekly long run is already past an hour.",
    progression:
      "Add a few minutes to one run at a time. The longest session grows toward about an hour. It does not grow toward race distance. A ragged week repeats instead of advancing.",
    recovery:
      "Two days off. The runs stay conversational. A walk counts as training.",
    modifications: [
      "A missed day stays missed. Do not pin it onto the next day.",
      "A niggle swaps the run for a walk or for rest.",
      "Do not add intervals to make the week look like a race plan.",
    ],
    weekShape:
      "Three or four easy runs, one of them a little longer, and an optional walk. No quality day.",
    notFor:
      "Anyone who already has a race inside a specific block, or a long run they are already finishing comfortably.",
    sources: [
      {
        title: "Hal Higdon, Novice base training",
        url: "https://www.halhigdon.com/training-programs/base-training/novice-base-training/",
        usedFor:
          "Twelve weeks, four runs plus a walk, two days off, longest workout about 6 miles, aimed at the start of a novice marathon plan.",
      },
    ],
  },
  {
    id: "short-distance",
    title: "Shorter road race",
    purpose:
      "Prepare for a 5K through about 10 miles. The week stays mostly easy. One weekend session is the longest, with strength or cross-training around it.",
    sports: ["run", "strength"],
    events: ["short-distance"],
    phases: ["base", "build", "specific", "taper"],
    experience: ["new", "developing"],
    focus: "foundation",
    weeklyMinutes: { low: 90, high: 240 },
    daysPerWeek: { low: 3, high: 4 },
    distanceMetres: { low: 3000, high: 18000 },
    horizonWeeks: { low: 6, high: 12 },
    athlete:
      "A newer runner who can already cover a few miles and is racing shorter than a half marathon.",
    progression:
      "Across about ten weeks the long session grows, then the last days ease. Midweek runs stay short. Strength sits on easy days, not the day before the long session.",
    recovery:
      "Rest the day before the longest session. Race week drops that session and keeps a couple of short easy runs.",
    modifications: [
      "Move the long session to a free day, and move the rest day with it.",
      "A tune-up race replaces the week's harder or longer session. It is not an extra hard day.",
      "For a 5K, the stimulus is a little faster running, not marathon volume.",
    ],
    weekShape:
      "Two or three easy runs, optional strength, one longer easy run, and rest before it.",
    notFor: "A half marathon, a marathon, or a runner who needs a speed block.",
    sources: [
      {
        title: "Hal Higdon, Novice 15K and 10 mile",
        url: "https://www.halhigdon.com/training-programs/15k-10-mile-training/novice-15k-10-mile/",
        usedFor:
          "About ten weeks, three runs, strength, rest before the long session, longest workout about 8 miles. He treats the schedule as a guide that can move for work and family.",
      },
    ],
  },
  {
    id: "half-novice",
    title: "First half marathon",
    purpose:
      "Reach 13.1 miles from a base of a few easy miles. The weekly long run is the workout that matters. Four running days are enough.",
    sports: ["run", "strength"],
    events: ["half-marathon"],
    phases: ["base", "build", "specific", "taper"],
    experience: ["new"],
    focus: "foundation",
    weeklyMinutes: { low: 120, high: 280 },
    daysPerWeek: { low: 4, high: 4 },
    distanceMetres: { low: 19000, high: 25000 },
    horizonWeeks: { low: 10, high: 16 },
    athlete:
      "Can already handle runs of about 3 to 4 miles. A first half marathon, or any runner who wants a simple four-day week. Not someone already doing speed work most weeks.",
    progression:
      "Over about twelve weeks the long run grows from a short weekend run toward 10 miles, then a short taper, then the race. The jump from the longest training run to 13.1 is modest, so the long run has to happen. Midweek runs grow by a little, and not in the same week as a big long-run jump.",
    recovery:
      "Rest before the long run. The next day is easy or cross-training. A typical week has two days off. Strength stays off the long-run day.",
    modifications: [
      "The long run can move to any convenient day. Move the adjacent rest with it.",
      "If 3 to 4 miles is not yet comfortable, use the consistency block first.",
      "A 5K or 10K tune-up replaces that week's long or faster session.",
      "In the last week, shorten everything. Do not squeeze in a missed long run.",
    ],
    weekShape:
      "Four runs, the longest one easy, two cross-training or strength slots, and two rest days.",
    notFor:
      "A runner whose weeks are already long and who wants a half-marathon-effort session. Use the developing half pattern for that.",
    sources: [
      {
        title: "Hal Higdon, Novice 1 half marathon",
        url: "https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/",
        usedFor:
          "Twelve weeks for someone who can handle the opening 3-to-4-mile runs. Four runs, cross-training, and strength. The long run grows from about 3 miles toward 10, then a short taper. Rest supports the long run, and the long day can move.",
      },
    ],
  },
  {
    id: "half-developing",
    title: "Half marathon with one steady session",
    purpose:
      "Prepare a half marathon for someone who already runs most weeks. One controlled session at half-marathon effort sits apart from a long run that stays near 90 minutes, not near a marathon long run.",
    sports: ["run"],
    events: ["half-marathon"],
    phases: ["build", "specific", "taper"],
    experience: ["developing", "experienced"],
    focus: "race-specific",
    weeklyMinutes: { low: 200, high: 420 },
    daysPerWeek: { low: 4, high: 5 },
    distanceMetres: { low: 19000, high: 25000 },
    horizonWeeks: { low: 8, high: 16 },
    athlete:
      "Already running four or five days and finishing an hour-plus long run. Wants a faster half, not a first finish from a walk-run base.",
    progression:
      "The long run stays easy and grows only in small steps. The specific work is a shorter steady session around half-marathon effort. That session gets a little longer across the specific phase, then shrinks in the taper. Volume steps up and then back. It does not climb every week.",
    recovery:
      "The steady session and the long run have an easy or rest day between them. At most one other day is lively, and only if the week does not already have two hard days.",
    modifications: [
      "If the two harder days would land next to each other, move the steady session.",
      "On a cutback week, drop the steady work first and shorten the long run.",
      "Do not borrow a marathon long run. Twenty miles is a different event.",
      "Race week keeps a short opener and rest.",
    ],
    weekShape:
      "One longer easy run, one shorter half-marathon-effort session, easy runs around them, and at least one day off.",
    notFor:
      "A first half from a base of a few miles, or any week where the athlete is hurt or not yet finishing the easy long run.",
    sources: [
      {
        title: "Hal Higdon, Novice 1 half marathon",
        url: "https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/",
        usedFor:
          "The long run is the key session and tops out near 10 miles before a short taper. This card keeps that cap.",
      },
      {
        title: "Hal Higdon, Intermediate 1 marathon",
        url: "https://www.halhigdon.com/training-programs/marathon-training/intermediate-1-marathon/",
        usedFor:
          "The step up from his novice marathon week is a fifth running day and a separate pace run, not a second hard day glued to the long run. The same step, at half-marathon effort, is this card.",
      },
      {
        title: "B.A.A. Boston Marathon training",
        url: "https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/",
        usedFor:
          "Half-marathon pace is one of their session kinds: a controlled faster run, not the whole week.",
      },
    ],
  },
  {
    id: "marathon-novice",
    title: "Four-day first marathon",
    purpose:
      "Finish a first marathon on four running days. The long run is the session that matters. The other days stay easy enough that the long run actually happens.",
    sports: ["run"],
    events: ["marathon"],
    phases: ["base", "build", "specific", "taper"],
    experience: ["new", "developing"],
    focus: "foundation",
    weeklyMinutes: { low: 150, high: 360 },
    daysPerWeek: { low: 4, high: 4 },
    distanceMetres: { low: 35000, high: 45000 },
    horizonWeeks: { low: 16, high: 30 },
    athlete:
      "A newer marathoner, or a busier runner with four days. Weekly time is closer to three or four hours than to six. The long run is not yet near three hours.",
    progression:
      "The published shape is about eighteen weeks. The long run starts near the athlete's current long run and reaches its peak about three weeks out, then tapers for about three weeks. About every third week the long run steps back so the next jump is possible. A midweek day can be skipped. The long run is not the day to skip. Someone who cannot yet run for an hour starts with the twelve-week consistency block, which exists so this plan's first week is reachable.",
    recovery:
      "Two rest days, including the day before the long run. The day after is cross-training or easy, never a workout. Cross-training replaces a fifth run.",
    modifications: [
      "If the recent long run is far below the published opening long run, start from the athlete's number. Add at most 20 minutes. Repeat a week rather than jump.",
      "Keep the stepback about every third week even when the athlete feels good.",
      "Do not add a speed day inside this four-day week. The published step up is a fifth running day, not a second hard day.",
      "A published peak near 20 miles is the destination of the block. It is not this week's workout.",
      "Race week is short easy running and rest. No long run.",
    ],
    weekShape:
      "Three easy runs, one long easy run, one cross-training day, and two days off.",
    notFor:
      "A runner already covering five or six days who wants marathon-pace work inside the long run. That is the phased marathon card, and only after the easy long run is in place.",
    sources: [
      {
        title: "Hal Higdon, Novice 1 marathon",
        url: "https://www.halhigdon.com/training-programs/marathon-training/novice-1-marathon/",
        usedFor:
          "Eighteen weeks, four runs and cross-training, rest on two days. The long run builds toward 20 miles about three weeks out, with a stepback about every third week. He says not to skip the long runs.",
      },
      {
        title: "Hal Higdon, Novice 2 marathon",
        url: "https://www.halhigdon.com/training-programs/marathon-training/novice-2-marathon/",
        usedFor:
          "The same eighteen-week, four-run shape, starting from a slightly longer long run and reaching the mid-teens sooner. Same stepback. Other days can move. The long run stays.",
      },
      {
        title: "Hal Higdon, marathon training overview",
        url: "https://www.halhigdon.com/training/marathon-training/",
        usedFor:
          "Novice 1 is his gently progressive four-day plan. Cross-training and rest are how it avoids overtraining. Intermediate and advanced plans are a step up, not a tweak inside the novice week.",
      },
    ],
  },
  {
    id: "marathon-developing",
    title: "Five-day marathon with a pace day",
    purpose:
      "For a runner who already has a long-run habit and wants marathon-pace practice that is not the long run itself.",
    sports: ["run"],
    events: ["marathon"],
    phases: ["build", "specific"],
    experience: ["developing", "experienced"],
    focus: "either",
    weeklyMinutes: { low: 240, high: 480 },
    daysPerWeek: { low: 5, high: 5 },
    distanceMetres: { low: 35000, high: 45000 },
    horizonWeeks: { low: 12, high: 20 },
    athlete:
      "Five days available and one day fully off. The long run is already around 75 to 100 minutes. Easy weeks are getting finished. Not a first-time runner, and not a request for two track sessions.",
    progression:
      "The long run still leads. In the published intermediate shape it peaks more than once late in the block. A separate shorter run holds steady marathon effort and stays well shorter than the long run. Volume still steps up and then back.",
    recovery:
      "One full rest day. The pace day is not the day before or after the long run. The other runs stay easy.",
    modifications: [
      "If the pace day and the long run would touch, move the pace day.",
      "On a cutback week, drop the pace content first and shorten the long run. Do not keep both.",
      "Missed midweek time does not move onto the long run.",
      "The long run still grows by at most 20 minutes past the recent longest.",
    ],
    weekShape:
      "A long easy run, one shorter marathon-pace run, three easy runs, and one rest day.",
    notFor:
      "A four-day first marathon, or a specific phase that needs hills and race-terrain long runs. Use the phased marathon card for that terrain.",
    sources: [
      {
        title: "Hal Higdon, Intermediate 1 marathon",
        url: "https://www.halhigdon.com/training-programs/marathon-training/intermediate-1-marathon/",
        usedFor:
          "Five runs and one day off. The long run starts nearer 8 miles than 6 and reaches about 20 miles twice. A separate 5-to-8-mile run is often at marathon pace, instead of weekend cross-training.",
      },
    ],
  },
  {
    id: "marathon-phased",
    title: "Phased marathon, prep through a short taper",
    purpose:
      "Show a marathon block that changes the kind of work as the race gets closer: easy preparation, then faster running and hills, then marathon-pace work on a few race-like long runs, then a short taper.",
    sports: ["run", "strength"],
    events: ["marathon"],
    phases: ["base", "build", "specific", "taper"],
    experience: ["developing", "experienced"],
    focus: "race-specific",
    weeklyMinutes: { low: 240, high: 600 },
    daysPerWeek: { low: 4, high: 7 },
    distanceMetres: { low: 35000, high: 45000 },
    horizonWeeks: { low: 16, high: 24 },
    athlete:
      "Pick the density from the log. Four running days and a peak near four to seven hours is the light end of this family. Five days is the next step. Six days, and then six or seven, are for people already running that much. Long runs at the light end stay in the mid-to-high teens of miles. Heavier levels are the ones that touch 20 to 22. A runner below the light end uses the four-day first-marathon card.",
    progression:
      "The published Boston shape is about twenty weeks: roughly three weeks of mostly easy preparation, about six weeks that add one faster session and some hills, about nine weeks of marathon-pace work inside longer runs, and two weeks of taper. A few of the specific long runs are simulations on terrain like the race. Hills, when used, are short. Faster running and the long run stay apart.",
    recovery:
      "At least one day fully off. An easy day sits between faster work and the long run. Strength or cross-training fills a day that would otherwise be a junk medium run.",
    modifications: [
      "Choose the level from current days and weekly time. A goal time or a famous race is not a promotion.",
      "On a hilly course, put a specific long run on rolling terrain and keep the downhills easy. Do not add downhill repeats on top of the long run.",
      "If the preparation weeks are not in the log, stay easy. Marathon-pace segments before the long run is comfortable are how people get hurt.",
      "A cutback week shortens the long run and drops one faster session. It does not add intensity to keep the quality.",
      "The taper is fewer and shorter sessions. One short faster touch early in a taper week is enough. Race week has no long run.",
    ],
    weekShape:
      "Mostly easy running. In the build, one hill or shorter faster day. In the specific phase, marathon-pace pieces inside one long run plus one other controlled faster day, with easy days between. Strength or cross-training on at least one day.",
    notFor:
      "A first marathon on four days, an ultra, or any athlete whose recent long run cannot grow to the session being proposed.",
    sources: [
      {
        title: "B.A.A. Boston Marathon training",
        url: "https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/",
        usedFor:
          "Four levels and four phases, published as a guide. Level one is about four days, rising from about 25 to 40 miles in a peak week, with long runs of 16 to 18. Level two is about five days, about 30 to 45 miles, long runs 18 to 20. Level three is about six days, about 35 to 55 miles, long runs near 20. Level four is about six or seven days, about 35 to 60 miles, long runs 20 to 22. The phases they name are a 3-week prep, a 6-week build, a 9-week marathon-specific block, and a 2-week taper. Session kinds are easy, a bit quicker than easy, hills, shorter intervals, half-marathon pace, marathon pace, and a rolling-terrain long run. Their page says the material may not be reproduced without consent. The daily plan is not stored here.",
      },
    ],
  },
  {
    id: "post-race",
    title: "The weeks after a long race",
    purpose:
      "Let a marathon, a long trail race, or a hard half heal before the next plan starts.",
    sports: ["run", "walk"],
    events: [
      "marathon",
      "half-marathon",
      "ultra",
      "short-distance",
      "trail",
      "base",
    ],
    phases: ["recovery"],
    experience: ["new", "developing", "experienced"],
    focus: "either",
    weeklyMinutes: { low: 0, high: 180 },
    daysPerWeek: { low: 0, high: 4 },
    distanceMetres: null,
    horizonWeeks: null,
    athlete:
      "Anyone in the days after an A race, including a runner who has already picked the next start line.",
    progression:
      "Several days with no running. Then short easy jogging or walking. A slightly longer easy session comes only after those first days feel ordinary. Volume creeps back. It does not rebuild the peak week. A published novice return is about five weeks.",
    recovery:
      "This whole block is the recovery. Ordinary soreness is a reason to wait, not a reason to test the legs.",
    modifications: [
      "A race inside the next month is not a reason to do workouts. The fitness for it was built before this one.",
      "Walking counts. A pace session does not.",
      "Pain beyond ordinary soreness means rest and a clinician, not a return table.",
    ],
    weekShape:
      "Days off, then a short jog, then easy aerobic time. No quality.",
    notFor: "The middle of a build, or a niggle that has not followed a race.",
    sources: [
      {
        title: "Hal Higdon, Novice post-marathon",
        url: "https://www.halhigdon.com/training-programs/post-marathon-recovery/novice-post-marathon/",
        usedFor:
          "About five weeks. The first days are off, then easy running. He notes that a race five weeks later is not a reason to train hard in the meantime.",
      },
    ],
  },
  {
    id: "ultra-first",
    title: "First 50K",
    purpose:
      "Become comfortable moving for two to three hours, mostly easy and with hiking breaks, without rehearsing the race distance.",
    sports: ["trail", "run", "walk"],
    events: ["ultra", "trail"],
    phases: ["base", "build", "specific"],
    experience: ["new", "developing"],
    focus: "foundation",
    weeklyMinutes: { low: 240, high: 420 },
    daysPerWeek: { low: 3, high: 5 },
    distanceMetres: { low: 42000, high: 56000 },
    horizonWeeks: { low: 12, high: 24 },
    athlete:
      "A newer ultrarunner, or a marathoner whose weeks are still about four to six hours. The race is about 50K and not extremely mountainous. Longer ultras use the back-to-back card.",
    progression:
      "Hold about four to six hours a week before an easier 50K. The weekly long session becomes a two-to-three-hour easy effort that feels controlled, walking the steep parts. Other runs are 30 to 60 minutes and easy. Time matters more than miles, because trail miles are slower. A marathoner's long-run distance can transfer. The pace work does not.",
    recovery:
      "The day after the long session is easy or off. One faster day is optional, and only after the long session is routine, with extra easy days around it.",
    modifications: [
      "Do not schedule back-to-back long days for a first, moderate 50K.",
      "Do not run the 50K distance in training.",
      "Do not keep marathon-pace segments as the main work when the event moves to trail.",
      "On a steep course, practice hiking uphill while fresh. Keep descents easy while anything hurts.",
    ],
    weekShape:
      "One long easy trail session, two or three short easy runs, and rest. Strides only after the easy weeks are consistent.",
    notFor:
      "A 50-mile, 100K, or 100-mile race, or a runner who already recovers from marathon-length long runs and is preparing those distances.",
    sources: [
      {
        title: "iRunFar, a newbie's guide to ultramarathons",
        url: "https://www.irunfar.com/newbies-guide-to-ultramarathons",
        usedFor:
          "First ultra at 50K. Build until a weekly two-to-three-hour easy long run feels controlled. Fill the rest of the week with two or three easy runs of 30 to 60 minutes. About four to six hours a week. Do not cover ultra distance in training. Marathoners keep similar long-run distances and remember that trails take longer. Back-to-backs are for longer races, with the second day about half to three quarters of the first.",
      },
    ],
  },
  {
    id: "ultra-long",
    title: "Long ultra, with a back-to-back",
    purpose:
      "Teach tired legs to keep moving the next day, for races well beyond 50K, without turning that second day into another hard workout.",
    sports: ["trail", "run"],
    events: ["ultra", "trail"],
    phases: ["build", "specific", "taper"],
    experience: ["developing", "experienced"],
    focus: "race-specific",
    weeklyMinutes: { low: 300, high: 720 },
    daysPerWeek: { low: 5, high: 6 },
    distanceMetres: { low: 60000, high: 200000 },
    horizonWeeks: { low: 16, high: 28 },
    athlete:
      "Already handles marathon-like long runs, and recent weeks match that volume. The race is 50 miles, 100K, or 100 miles. Not a first easy 50K.",
    progression:
      "Most long sessions are single days. Back-to-backs show up in the specific phase, weeks apart, not every weekend. The pair starts shorter than the peak pair. The second day stays about half to three quarters of the first and stays easy. A dress rehearsal about four to six weeks out covers roughly a third to three fifths of the race on similar ground, with the real kit and the real food. Hills, when used, are short climbs with an easy jog or walk down.",
    recovery:
      "The second day is easy on purpose. The day after the pair is off or very easy. Space the pairs by several weeks. A race used as training is run well inside race effort.",
    modifications: [
      "The second day is never a quality session and never another long hard run.",
      "If the first day leaves a niggle, the second day becomes a walk or rest.",
      "A cutback shrinks the pair too. The pair is not an excuse for a bigger week.",
      "The taper drops the long work. Race week does not contain a back-to-back.",
      "Downhill repeats are the first work to remove when knees or quads complain.",
    ],
    weekShape:
      "One long day, an easy shorter day next, easy runs around them, one optional short uphill session far from the long day, and one rest day.",
    notFor:
      "A first 50K, a road marathon, or any athlete who does not yet finish a single long day feeling ready to jog the next morning.",
    sources: [
      {
        title: "iRunFar, endurance workouts for ultramarathon training",
        url: "https://www.irunfar.com/endurance-based-workouts-for-ultramarathon-training",
        usedFor:
          "Back-to-backs for races beyond 50K, progressed from short pairs and spaced by about four to five weeks. A 50K does not need them.",
      },
      {
        title: "iRunFar, a newbie's guide to ultramarathons",
        url: "https://www.irunfar.com/newbies-guide-to-ultramarathons",
        usedFor:
          "In a peak block, a second day about half to three quarters of the first, every two or three weekends, with extra recovery around any faster work.",
      },
      {
        title: "iRunFar, hill and predictor workouts",
        url: "https://www.irunfar.com/sprint-based-hill-and-predictor-workouts-for-ultramarathon-training",
        usedFor:
          "Short uphill efforts with an easy jog down. A dress rehearsal about four to six weeks out, covering roughly 30 to 60 percent of the course, and practicing terrain, kit, and fuel.",
      },
    ],
  },
  {
    id: "trail-race",
    title: "Trail race up to the marathon",
    purpose:
      "Train the terrain and the time on feet for a trail race that is not an ultra. A road pace table is the wrong main tool.",
    sports: ["trail", "run"],
    events: ["trail"],
    phases: ["build", "specific", "taper"],
    experience: ["developing", "experienced"],
    focus: "either",
    weeklyMinutes: { low: 180, high: 480 },
    daysPerWeek: { low: 4, high: 6 },
    distanceMetres: { low: 8000, high: 45000 },
    horizonWeeks: { low: 8, high: 20 },
    athlete:
      "Racing a trail 10K, half, or marathon, with hills or awkward footing, and with some weekly running already in the log.",
    progression:
      "The long session moves onto similar trails and is allowed to take longer. Steep climbs are hiked on purpose. One short uphill session can sit midweek once easy weeks are solid. Downhills stay controlled.",
    recovery:
      "A technical day is stress even when the heart rate stayed modest. The next day is easy road, easy smooth trail, or rest. A road workout does not sit next to a technical long run.",
    modifications: [
      "If the log is only road, change the surface of the long run before adding intervals.",
      "Mud, heat, or a niggle: shorten the day and pick smoother ground. Do not replace lost vertical with extra miles.",
      "Use effort, not road pace, once the trail tilts.",
    ],
    weekShape:
      "One long trail session, easy runs, optional short hills, and rest after the technical day.",
    notFor: "A 50K or longer, or a flat road race.",
    sources: [
      {
        title: "iRunFar, a newbie's guide to ultramarathons",
        url: "https://www.irunfar.com/newbies-guide-to-ultramarathons",
        usedFor:
          "Trail distance takes longer than the same road distance. Time on feet and hiking breaks are the useful measures. Applied here to trail races at or under the marathon.",
      },
      {
        title: "iRunFar, hill and predictor workouts",
        url: "https://www.irunfar.com/sprint-based-hill-and-predictor-workouts-for-ultramarathon-training",
        usedFor:
          "Short uphill efforts, then an easy jog down. The descent is recovery, not a second workout.",
      },
    ],
  },
  {
    id: "road-endurance",
    title: "Road endurance and sportives",
    purpose:
      "Build a long easy ride and one controlled harder session for a road event, a sportive, or a general fitness block.",
    sports: ["bike"],
    events: ["road-bike"],
    phases: ["base", "build", "specific", "taper"],
    experience: ["new", "developing", "experienced"],
    focus: "either",
    weeklyMinutes: { low: 240, high: 720 },
    daysPerWeek: { low: 4, high: 6 },
    distanceMetres: null,
    horizonWeeks: { low: 6, high: 16 },
    athlete:
      "Already riding several hours a week. Beginner event plans often assume about six to eight hours. Larger weeks are for riders already doing them. A runner who also rides uses this for the bike days. An endurance ride does not take the long-run slot.",
    progression:
      "The long ride grows first, mostly easy, with a little steady work only after the endurance is there. One day a week is the harder session: steady threshold-style work, or efforts that sit a little above and below that. Not both styles on the same day, and not a second hard day. A short form session is easy spinning. Two or three harder weeks are followed by a lighter one. The published six-week overview rises through the build and then eases before the event.",
    recovery:
      "One day fully off. The day after the harder session is rest, cross-training, or an easy spin. The long ride is not where a threshold test goes.",
    modifications: [
      "If the recent long ride is short, extend it by a small step. Do not drop a four-hour ride onto a 90-minute rider.",
      "A missed interval day is gone. It does not move onto the long ride.",
      "Heart-rate or power targets need stored zones. Otherwise cue the hard session by effort.",
      "Event week keeps a short opener and rest, not the long ride.",
      "Label the endurance ride as endurance. Do not label it as a long run.",
    ],
    weekShape:
      "Rest, one harder ride, easy spins, one medium ride, and one longer endurance ride.",
    notFor:
      "A mountain-bike event where descending and cornering decide the day, or a running race.",
    sources: [
      {
        title: "British Cycling training plans",
        url: "https://www.britishcycling.org.uk/knowledge/training-plans",
        usedFor:
          "They separate general fitness, road performance, time trial, and mountain bike. Road plans build on a base and then add speed and power for a road race, sportive, or endurance event.",
      },
      {
        title: "British Cycling, six-week training overview",
        url: "https://www.britishcycling.org.uk/zuvvi/media/bc_files/izonedocs/24nov/6_WEEK_TRAINING_PLAN_Overview.pdf",
        usedFor:
          "The week has a rest day, one threshold or over-under or ramped day, a short leg-speed session, and a longer endurance ride with a little tempo. Weekly time rises across the build weeks and then eases. The hour-by-hour grid is not stored here.",
      },
      {
        title: "British Cycling sportive plans",
        url: "https://www.britishcycling.org.uk/sportives/article/sp20130905--British-Cycling-Sportive-Training-Plans-0",
        usedFor:
          "A beginner plan uses heart rate for a shorter event, about 60 miles in their example. More experienced riders spend about three months on a foundation before the work gets more specific.",
      },
    ],
  },
  {
    id: "mountain-bike",
    title: "Mountain bike and long mountain rides",
    purpose:
      "Keep most of the riding easy, add one short intense session, and practice the skills the course actually asks for: descending, cornering, and steep climbing.",
    sports: ["bike"],
    events: ["mountain-bike"],
    phases: ["base", "build", "specific", "taper"],
    experience: ["new", "developing", "experienced"],
    focus: "either",
    weeklyMinutes: { low: 180, high: 900 },
    daysPerWeek: { low: 3, high: 6 },
    distanceMetres: null,
    horizonWeeks: { low: 8, high: 24 },
    athlete:
      "A cross-country, endurance, or enduro-style mountain-bike event, or a long mountain ride. Skill is part of the session. A rider with only a few hours keeps this shape and shortens the long ride. A multi-day mountain tour can ask for much larger weeks, around ten to fifteen hours, and a long ride that becomes most of a day while staying mostly easy. That volume is not the default.",
    progression:
      "Endurance grows before intensity. One high-intensity day a week. Most riding stays easy. Skills are practiced while fresh, and for short periods. The long ride stays below a hard threshold. Every second or third week eases off so the load can stick.",
    recovery:
      "A high-intensity day or a long technical descent needs an easy day after. Sleep and soreness decide whether the hard day stays. A technical day counts even when the power was low.",
    modifications: [
      "If the course is technical and the athlete is new to it, replace a fitness interval with skills.",
      "Do not put descending practice at the end of a long tired ride while the athlete is still learning it.",
      "A second intense day in the week becomes easy.",
      "When trails are closed, an easy road or indoor spin keeps frequency. It does not become another interval day.",
      "Available hours cap the week. Ten to fifteen hours is a long mountain tour, not the usual week.",
    ],
    weekShape:
      "One long easy ride, one short intense session, a skills bout while fresh, easy spins, and a lighter week every few weeks.",
    notFor: "A flat road sportive, or a rider whose only goal is a time trial.",
    sources: [
      {
        title: "Tour du Mont Blanc 2024 cycling training framework",
        url: "https://letourdumontblanc.fr/wp-content/uploads/sites/11/2023/11/TMB-training-plan-framework-2024.pdf",
        usedFor:
          "Consistency, a long ride that progresses toward most of a day while staying easy, one high-intensity session, a mostly easy week, skills such as descending and cornering, and a recovery week every two or three weeks. Their 10-to-15-hour assumption is for that tour.",
      },
      {
        title: "British Cycling training plans",
        url: "https://www.britishcycling.org.uk/knowledge/training-plans",
        usedFor:
          "Mountain-bike performance is its own category: base fitness first, then speed and power for MTB events. Their day-by-day plans are not included here.",
      },
    ],
  },
  {
    id: "hike-objective",
    title: "Eight-week hike build",
    purpose:
      "Get legs, trunk, and pack-carrying time ready for a long day or a short trip, starting about eight weeks out.",
    sports: ["walk", "strength", "run"],
    events: ["hike"],
    phases: ["base", "build", "specific", "taper"],
    experience: ["new", "developing"],
    focus: "foundation",
    weeklyMinutes: { low: 120, high: 360 },
    daysPerWeek: { low: 4, high: 5 },
    distanceMetres: null,
    horizonWeeks: { low: 4, high: 12 },
    athlete:
      "Preparing for a long hike, not a race. Two strength days and three cardio days fit in the week. A thru-hike uses the long-trail card.",
    progression:
      "About eight weeks. Strength twice, on nonconsecutive days. Cardio three days, not all in a row. In the last two weeks the cardio becomes hikes of an hour or more with a pack close to trip weight. The last day or two ease off.",
    recovery:
      "Two rest days, and more if something hurts. Strength sessions sit at least a day apart. An exercise that hurts gets changed or skipped.",
    modifications: [
      "The pack gets heavier only after unweighted walking feels ordinary.",
      "A run can be one cardio day if the athlete already runs. It does not replace the loaded hike in the last fortnight.",
      "Do not add strides, pace work, or a marathon long run. This is not a running plan.",
    ],
    weekShape:
      "Two strength days, three cardio or hike days, and two rest days. Late in the block the cardio days are loaded hikes.",
    notFor: "A multi-month thru-hike, or a running race.",
    sources: [
      {
        title: "REI, how to train for hiking",
        url: "https://www.rei.com/learn/expert-advice/hiking-training.html",
        usedFor:
          "Start about eight weeks out. Two nonconsecutive strength days, two nonconsecutive rest days, three cardio days until the last fortnight, then long hikes with a realistic pack, plus an easier day or two before the trip. Change or skip anything that hurts.",
      },
    ],
  },
  {
    id: "thru-hike",
    title: "Long trail, months out",
    purpose:
      "Prepare for a thru-hike or a multi-day backpack by raising time on feet slowly, and by adding pack weight and steep ground only after flat walking is easy.",
    sports: ["walk", "strength"],
    events: ["hike"],
    phases: ["base", "build"],
    experience: ["developing", "experienced"],
    focus: "foundation",
    weeklyMinutes: { low: 180, high: 600 },
    daysPerWeek: { low: 3, high: 6 },
    distanceMetres: null,
    horizonWeeks: { low: 16, high: 40 },
    athlete:
      "Months before a long trail. Ordinary fitness is a fine start. The hike itself will build a lot of the fitness. About six months is a reasonable window for many people.",
    progression:
      "Start with three or four aerobic days. Add a day only after a few weeks have gone well. Begin on flat or rolling ground with no pack, then steeper ground, then an empty pack, then part of the real weight, then something close to the real weight. The early days of the hike are part of the training, so the plan does not need a 20-mile day before the start.",
    recovery:
      "At least one full rest day every week. Strength twice a week, with a couple of days between those sessions. If fatigue is still there the next morning, repeat the week.",
    modifications: [
      "Knee, foot, or back pain: reduce pack weight and downhill time first.",
      "A running background helps the heart and lungs. It does not replace loaded walking.",
      "Do not jump to back-to-back loaded days in the same week the pack gets heavier.",
    ],
    weekShape:
      "Several hikes or walks, two strength sessions far apart, and one rest day. Load and hills progress across months.",
    notFor: "An eight-week day-hike goal, or a running or cycling race.",
    sources: [
      {
        title: "REI, how to train for a thru-hike",
        url: "https://www.rei.com/learn/expert-advice/thru-hiking-goal-training.html",
        usedFor:
          "About six months for many people. Three or four aerobic days to start, at least one full rest day, volume that rises gradually from a tiring but not exhausting start, then steeper terrain and pack weight in steps. Strength twice a week with at least 48 hours between.",
      },
    ],
  },
];

export const programLibrary = library;

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
      86400000,
  );
}

/** Same phase boundaries as the coach's race block. */
export function phaseForDate(
  date: string,
  raceDate: string | null,
): TrainingPhase {
  if (!raceDate) return "base";
  const days = daysBetween(date, raceDate);
  if (days < 0 && days >= -7) return "recovery";
  if (days >= 0 && days <= 21) return "taper";
  if (days <= 56 && days >= 0) return "specific";
  if (days <= 112 && days >= 0) return "build";
  return "base";
}

const relatedEvents: Record<ProgramEvent, ProgramEvent[]> = {
  base: ["short-distance"],
  "short-distance": ["base", "half-marathon"],
  "half-marathon": ["short-distance", "marathon"],
  marathon: ["half-marathon"],
  ultra: ["trail"],
  trail: ["ultra"],
  hike: [],
  "road-bike": ["mountain-bike"],
  "mountain-bike": ["road-bike"],
};

export interface ProgramQuery {
  event?: ProgramEvent | null;
  phase?: TrainingPhase | null;
  experience?: ProgramExperience | null;
  sports?: string[] | null;
  weeklyMinutes?: number | null;
  distanceMetres?: number | null;
  horizonWeeks?: number | null;
  constraint?: "none" | "niggle" | "injury" | "travel" | null;
  cutback?: boolean | null;
  longestMinutes?: number | null;
  limit?: number | null;
}

export interface ProgramContextInput {
  today: string;
  athlete: {
    weeklyMinutes: number | null;
    longestRunMinutes: number | null;
    constraint: "none" | "niggle" | "injury" | "travel";
  };
  block: { phase: TrainingPhase; cutback: boolean } | null;
  races: Array<{
    name: string;
    sport: "run" | "trail" | "bike";
    date: string;
    distanceMetres: number;
    elevationGainMetres: number | null;
    priority: "A" | "B" | "C";
    terrainNotes: string;
  }>;
  activities: Array<{
    sport: string;
    durationSeconds: number;
    date: string;
    confirmed?: boolean;
  }>;
}

function bandScore(
  value: number | null | undefined,
  range: Range | null,
  step: number,
) {
  if (value == null || !range) return 0;
  if (value >= range.low && value <= range.high) return 12;
  const gap = value < range.low ? range.low - value : value - range.high;
  return -Math.min(16, Math.ceil(gap / step));
}

const runEvents = new Set<ProgramEvent>([
  "base",
  "short-distance",
  "half-marathon",
  "marathon",
  "ultra",
  "trail",
]);

export function situationLines(query: ProgramQuery): string[] {
  const lines = [
    COPYRIGHT,
    "Use an example for the kind of week and for how to change it. Name the example when it shapes a proposal. The athlete's log decides the numbers.",
  ];
  if (query.constraint === "injury")
    lines.push(
      "An injury flag is active. Today is rest, easy movement, or suitable strength only. The examples describe the plan to return to, not a workout to do now.",
    );
  else if (query.constraint === "niggle")
    lines.push(
      "A niggle is on file. Drop hills, speed, and downhills before dropping easy time. Do not add volume this week.",
    );
  else if (query.constraint === "travel")
    lines.push(
      "Travel week: keep one easy session if it fits. Do not stack missed days onto the days that remain.",
    );
  if (query.phase === "taper")
    lines.push(
      "Taper: volume comes down. At most one short faster touch, early in the week. Race week has no long session and no back-to-back.",
    );
  if (query.phase === "recovery")
    lines.push(
      "This is the post-race window. Easy or off. A nearby next race is not a reason to add quality.",
    );
  if (query.cutback)
    lines.push(
      "This is a cutback week: about 80 percent of the previous week. Shorten the long session. Do not add intensity to replace the minutes.",
    );
  if (query.event && runEvents.has(query.event)) {
    if (query.longestMinutes)
      lines.push(
        `The recent longest run is about ${query.longestMinutes} minutes. A long run this week stays within 20 minutes of that. A published peak is a destination, not this week.`,
      );
    else
      lines.push(
        "No recent longest run is on file. Ask for it before adding a long run.",
      );
    lines.push(
      "The day after a long session is easy or rest. At most two hard days in a week, and never on adjacent days.",
    );
  }
  if (query.event === "road-bike" || query.event === "mountain-bike")
    lines.push(
      "One hard ride in a day. A hard ride does not sit next to a hard run. An endurance ride is endurance, not a long run.",
    );
  if (query.event === "road-bike")
    lines.push(
      "If the riding is technical singletrack, use the mountain-bike example instead of the road shape.",
    );
  if (query.weeklyMinutes == null && query.longestMinutes == null)
    lines.push(
      "History is thin. Ask for a usual weekly volume, a recent longest session, and whether there is a race date before writing a specific week.",
    );
  return lines;
}

export interface RetrievedWorkout extends ExampleWorkout {
  /** Duration and steps, already scaled to the log. */
  description: string;
}

export interface RetrievedProgram {
  id: string;
  title: string;
  score: number;
  why: string[];
  purpose: string;
  athlete: string;
  progression: string;
  recovery: string;
  modifications: string[];
  weekShape: string;
  notFor: string;
  sources: ProgramSource[];
  workouts: RetrievedWorkout[];
}

function workoutQuery(query: ProgramQuery): WorkoutQuery {
  return {
    phase: query.phase,
    constraint: query.constraint,
    cutback: query.cutback,
    longestMinutes: query.longestMinutes,
    weeklyMinutes: query.weeklyMinutes,
  };
}

function scorePattern(pattern: ProgramPattern, query: ProgramQuery) {
  let score = 0;
  const why: string[] = [];
  if (query.event) {
    if (pattern.events.includes(query.event)) {
      score += 40;
      why.push(`event ${query.event}`);
    } else if (
      relatedEvents[query.event].some((event) => pattern.events.includes(event))
    ) {
      score += 8;
      why.push(`nearby event ${query.event}`);
    } else score -= 20;
  }
  if (query.phase && pattern.phases.includes(query.phase)) {
    score += 16;
    why.push(`${query.phase} phase`);
  }
  if (query.experience && pattern.experience.includes(query.experience)) {
    score += 18;
    why.push(`${query.experience} athlete`);
  }
  if (query.sports?.length) {
    if (pattern.sports.some((sport) => query.sports?.includes(sport))) {
      score += 12;
      why.push("sport fits");
    } else score -= 25;
  }
  const minutes = bandScore(query.weeklyMinutes, pattern.weeklyMinutes, 30);
  if (minutes > 0) why.push("weekly time fits");
  score += minutes;
  const distance = bandScore(
    query.distanceMetres,
    pattern.distanceMetres,
    2000,
  );
  if (distance > 0) why.push("distance fits");
  score += distance;
  const horizon = bandScore(query.horizonWeeks, pattern.horizonWeeks, 2);
  if (horizon > 0) why.push("time until the event fits");
  score += horizon;
  if (query.phase === "base" || query.phase === "recovery") {
    if (pattern.focus === "foundation") score += 8;
    if (pattern.focus === "race-specific") score -= 6;
  } else if (query.phase === "specific") {
    if (pattern.focus === "race-specific") score += 10;
    if (pattern.focus === "foundation") score -= 4;
  } else if (query.phase === "build") {
    if (pattern.focus === "either") score += 6;
    if (pattern.focus === "foundation") score += 3;
    if (pattern.focus === "race-specific") score += 2;
  }
  return { score, why };
}

export function retrievePrograms(query: ProgramQuery = {}): RetrievedProgram[] {
  const limit = Math.min(4, Math.max(1, query.limit ?? 2));
  const scaling = workoutQuery(query);
  return library
    .map((pattern) => {
      const scored = scorePattern(pattern, query);
      return { pattern, ...scored };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.pattern.title.localeCompare(b.pattern.title),
    )
    .slice(0, limit)
    .map(({ pattern, score, why }) => ({
      id: pattern.id,
      title: pattern.title,
      score,
      why,
      purpose: pattern.purpose,
      athlete: pattern.athlete,
      progression: pattern.progression,
      recovery: pattern.recovery,
      modifications: pattern.modifications,
      weekShape: pattern.weekShape,
      notFor: pattern.notFor,
      sources: pattern.sources,
      workouts: chooseWorkouts(pattern.id, scaling).map((item) => ({
        ...item,
        description: describeWorkout(item, scaling),
      })),
    }));
}

export function selectedProgramContext(
  id: string,
  query: ProgramQuery,
): string {
  const pattern = library.find((p) => p.id === id);
  if (!pattern) return "";
  const scaling = workoutQuery(query);
  return `Chosen program: ${pattern.title}. Purpose: ${pattern.purpose}\nWeek shape: ${pattern.weekShape}\nProgression: ${pattern.progression}\nRecovery: ${pattern.recovery}\nModifications: ${pattern.modifications.join(" ")}\nExample workouts:\n${chooseWorkouts(
    id,
    scaling,
  )
    .map((w) => describeWorkout(w, scaling))
    .join("\n\n")}`;
}

export function renderProgramContext(query: ProgramQuery = {}): string {
  const examples = retrievePrograms({ ...query, limit: query.limit ?? 2 });
  const weak = examples[0] && examples[0].score < 25;
  const cards = examples.map((pattern, index) => {
    const lines = [
      `${pattern.title} [${pattern.id}] (${pattern.why.join("; ") || "closest available"})`,
      `Purpose: ${pattern.purpose}`,
      `Fits: ${pattern.athlete}`,
      `Progression: ${pattern.progression}`,
      `Recovery: ${pattern.recovery}`,
      `A week looks like: ${pattern.weekShape}`,
      `Modify: ${pattern.modifications.join(" ")}`,
      `Not for: ${pattern.notFor}`,
      `Sources: ${pattern.sources.map((source) => `${source.title} <${source.url}>`).join(" ")}`,
    ];
    if (index === 0 && pattern.workouts.length) {
      lines.push(
        "Workouts to adapt. These are original sessions, and the durations are already scaled to the log. Keep this structure unless a situation line removes the session.",
        ...pattern.workouts.map((item) => item.description),
      );
    } else if (pattern.workouts.length) {
      lines.push(
        `Other sessions in this example: ${pattern.workouts.map((item) => item.name).join(", ")}. Call get_program_examples for their steps.`,
      );
    }
    return lines.join("\n");
  });
  return [
    ...situationLines(query),
    weak
      ? "These matches are weak. Ask which event they are training for before leaning on one."
      : "Closest examples:",
    ...cards,
  ].join("\n\n");
}

function eventForRace(
  race: ProgramContextInput["races"][number],
): ProgramEvent {
  const notes = `${race.name} ${race.terrainNotes}`.toLowerCase();
  if (race.sport === "bike") {
    if (
      /mountain bike|\bmtb\b|singletrack|enduro|downhill/.test(notes) ||
      (race.elevationGainMetres ?? 0) >= 3000
    )
      return "mountain-bike";
    return "road-bike";
  }
  if (/thru-?hike|backpacking|day hike|\bhike\b/.test(notes)) return "hike";
  if (race.distanceMetres > 45000) return "ultra";
  if (race.sport === "trail") return "trail";
  if (race.distanceMetres >= 35000) return "marathon";
  if (race.distanceMetres >= 19000) return "half-marathon";
  if (race.distanceMetres >= 4000) return "short-distance";
  return "base";
}

function experienceFor(
  weeklyMinutes: number | null,
  longestMinutes: number | null,
  event: ProgramEvent,
): ProgramExperience {
  if (weeklyMinutes == null && longestMinutes == null) return "new";
  const minutes = weeklyMinutes ?? 0;
  const longest = longestMinutes ?? 0;
  if (event === "hike" || event === "road-bike" || event === "mountain-bike") {
    if (minutes < 180) return "new";
    if (minutes < 420) return "developing";
    return "experienced";
  }
  if (event === "marathon" || event === "ultra") {
    if (minutes < 200 || longest < 70) return "new";
    if (minutes < 360 || longest < 120) return "developing";
    return "experienced";
  }
  if (minutes < 160 || longest < 45) return "new";
  if (minutes < 320) return "developing";
  return "experienced";
}

export function programQueryFromContext(
  input: ProgramContextInput,
): ProgramQuery {
  const today = input.today;
  const upcoming = input.races
    .filter((race) => race.priority === "A" && race.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const recent = input.races
    .filter(
      (race) =>
        race.priority === "A" &&
        race.date < today &&
        race.date >= shiftDate(today, -7),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  const race = upcoming ?? recent ?? null;
  const logged = input.activities.filter(
    (activity) =>
      activity.confirmed !== false &&
      activity.date <= today &&
      activity.date >= shiftDate(today, -27),
  );
  const loggedMinutes = logged.reduce(
    (sum, activity) => sum + activity.durationSeconds / 60,
    0,
  );
  const coverageDays = logged.length
    ? Math.min(
        28,
        Math.floor(
          (Date.parse(today) -
            Math.min(...logged.map((a) => Date.parse(a.date)))) /
            86400000,
        ) + 1,
      )
    : 0;
  // A few entries in a newly started log do not establish four weeks of volume.
  const weeklyMinutes =
    logged.length >= 3 &&
    (coverageDays >= 14 || input.athlete.weeklyMinutes == null)
      ? Math.round(loggedMinutes / Math.max(1, coverageDays / 7))
      : input.athlete.weeklyMinutes;
  const runMinutes = logged
    .filter(
      (activity) => activity.sport === "run" || activity.sport === "trail",
    )
    .map((activity) => Math.round(activity.durationSeconds / 60));
  const longestMinutes = Math.max(
    input.athlete.longestRunMinutes ?? 0,
    ...runMinutes,
    0,
  );
  const sports = race
    ? [race.sport === "bike" ? "bike" : race.sport]
    : logged.length
      ? [...new Set(logged.map((activity) => activity.sport))]
      : ["run"];
  const event = race
    ? eventForRace(race)
    : sports.includes("walk") &&
        !sports.includes("run") &&
        !sports.includes("trail")
      ? "hike"
      : sports.includes("bike") &&
          !sports.includes("run") &&
          !sports.includes("trail")
        ? "road-bike"
        : sports.includes("trail")
          ? "trail"
          : "base";
  const horizonWeeks = race
    ? Math.max(0, Math.round(daysBetween(today, race.date) / 7))
    : null;
  return {
    event,
    phase: input.block?.phase ?? phaseForDate(today, race?.date ?? null),
    experience: experienceFor(weeklyMinutes, longestMinutes || null, event),
    sports,
    weeklyMinutes,
    distanceMetres: race?.distanceMetres ?? null,
    horizonWeeks,
    constraint: input.athlete.constraint,
    cutback: input.block?.cutback ?? false,
    longestMinutes: longestMinutes || null,
  };
}
