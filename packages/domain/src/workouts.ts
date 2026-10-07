// Original sessions the coach can prescribe. They follow the shape of the
// program cards. They are not a downloaded week from a published plan.

export type WorkoutSport = "run" | "trail" | "bike" | "walk" | "strength" | "rest";
export type WorkoutIntent =
  | "rest"
  | "easy"
  | "long"
  | "quality"
  | "endurance"
  | "hills"
  | "strength"
  | "back-to-back";
export type WorkoutPhase = "base" | "build" | "specific" | "taper" | "recovery";

export interface WorkoutStep {
  kind: "warmup" | "work" | "recover" | "cooldown" | "free";
  minutes: number;
  repeats: number;
  effort: string;
}

export interface ExampleWorkout {
  id: string;
  name: string;
  sport: WorkoutSport;
  intent: WorkoutIntent;
  phases: WorkoutPhase[];
  /** Situations in which this session is the wrong tool. */
  dropWhen: Array<"injury" | "niggle" | "cutback" | "taper">;
  minutes: { low: number; high: number };
  prescription: string;
  steps: WorkoutStep[];
}

export interface WorkoutQuery {
  phase?: WorkoutPhase | null;
  constraint?: "none" | "niggle" | "injury" | "travel" | null;
  cutback?: boolean | null;
  longestMinutes?: number | null;
  weeklyMinutes?: number | null;
}

const allPhases: WorkoutPhase[] = ["base", "build", "specific", "taper"];
const training: WorkoutPhase[] = ["base", "build", "specific"];

function step(
  kind: WorkoutStep["kind"],
  minutes: number,
  effort: string,
  repeats = 1,
): WorkoutStep {
  return { kind, minutes, repeats, effort };
}

function workout(
  input: Omit<ExampleWorkout, "dropWhen" | "steps"> & {
    dropWhen?: ExampleWorkout["dropWhen"];
    steps?: WorkoutStep[];
  },
): ExampleWorkout {
  return {
    dropWhen: input.dropWhen ?? [],
    steps: input.steps ?? [
      step("free", input.minutes.low, "See the prescription."),
    ],
    ...input,
  };
}

const easyRun = (
  id: string,
  name: string,
  low: number,
  high: number,
  phases: WorkoutPhase[] = training,
): ExampleWorkout =>
  workout({
    id,
    name,
    sport: "run",
    intent: "easy",
    phases,
    minutes: { low, high },
    prescription:
      "Run the whole time at a conversational effort. You should be able to say a full sentence. If your breathing gets choppy, walk until it settles, then run again. Stop if something hurts.",
    steps: [step("free", low, "Conversational, around RPE 3. Walk breaks are part of the session.")],
  });

const rest = (id: string, phases: WorkoutPhase[]): ExampleWorkout =>
  workout({
    id,
    name: "Rest day",
    sport: "rest",
    intent: "rest",
    phases,
    minutes: { low: 0, high: 0 },
    prescription:
      "Take the day off training. A short easy walk is fine. Do not make up a missed workout today.",
    steps: [step("free", 0, "No training.")],
  });

export const exampleWorkouts: Record<string, ExampleWorkout[]> = {
  "easy-base": [
    easyRun("easy-base-easy", "Short conversational run", 20, 40, ["base"]),
    workout({
      id: "easy-base-long",
      name: "Slightly longer easy run",
      sport: "run",
      intent: "long",
      phases: ["base"],
      dropWhen: ["injury", "taper"],
      minutes: { low: 30, high: 60 },
      prescription:
        "This is the longest session of the week, and it stays as easy as the short runs. Keep it a small step past your recent longest outing. Walk whenever you need to.",
      steps: [
        step("free", 30, "Conversational the entire time, around RPE 3."),
      ],
    }),
    workout({
      id: "easy-base-walk",
      name: "Easy walk",
      sport: "walk",
      intent: "easy",
      phases: ["base"],
      minutes: { low: 20, high: 40 },
      prescription:
        "A brisk or relaxed walk counts. Use this on a day you do not want to run, or instead of a run when something feels off.",
      steps: [step("free", 20, "Comfortable walking, RPE 2 to 3.")],
    }),
    rest("easy-base-rest", ["base"]),
  ],
  "short-distance": [
    easyRun("short-easy", "Easy run", 25, 45),
    workout({
      id: "short-long",
      name: "Long easy run",
      sport: "run",
      intent: "long",
      phases: training,
      dropWhen: ["injury", "taper"],
      minutes: { low: 40, high: 75 },
      prescription:
        "Easy the whole way. This session grows across the block and then disappears in race week. It is not a place for faster miles.",
      steps: [step("free", 40, "Conversational, RPE 3.")],
    }),
    workout({
      id: "short-strides",
      name: "Easy run with a few strides",
      sport: "run",
      intent: "quality",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 25, high: 40 },
      prescription:
        "Run easy, then add four short accelerations. Each one is smooth and quick, not a sprint. Walk or jog until you are fully easy before the next one. Skip these if you already have another lively day this week.",
      steps: [
        step("warmup", 10, "Easy running, RPE 3."),
        step("work", 0.33, "Smooth and quick, about RPE 6, relaxed shoulders.", 4),
        step("recover", 1, "Walk or easy jog until breathing is quiet.", 4),
        step("cooldown", 5, "Easy running, RPE 2 to 3."),
      ],
    }),
    workout({
      id: "short-shakeout",
      name: "Race-week shakeout",
      sport: "run",
      intent: "easy",
      phases: ["taper"],
      minutes: { low: 15, high: 25 },
      prescription:
        "A short easy run so the legs remember how to turn over. No strides if you feel heavy. No long run this week.",
      steps: [step("free", 15, "Easy, RPE 3. Stop while you still feel fresh.")],
    }),
    rest("short-rest", allPhases),
  ],
  "half-novice": [
    easyRun("half-novice-easy", "Easy run", 30, 50),
    workout({
      id: "half-novice-long",
      name: "Half-marathon long run",
      sport: "run",
      intent: "long",
      phases: training,
      dropWhen: ["injury", "taper"],
      minutes: { low: 45, high: 110 },
      prescription:
        "The key session. Stay conversational from the first minute to the last. Walk breaks are allowed. Do not finish faster. The day before this is rest or very easy, and the day after is easy or cross-training.",
      steps: [step("free", 45, "Conversational, RPE 3 to 4.")],
    }),
    workout({
      id: "half-novice-cross",
      name: "Cross-training or strength",
      sport: "strength",
      intent: "strength",
      phases: training,
      minutes: { low: 20, high: 40 },
      prescription:
        "Anything that is not another run: an easy spin, a swim, or a short strength circuit. Keep it moderate. Skip a movement that hurts. Do not put this the day after a hard effort.",
      steps: [
        step("free", 20, "Moderate, around RPE 4. Stop with energy left."),
      ],
    }),
    workout({
      id: "half-novice-taper",
      name: "Taper easy run",
      sport: "run",
      intent: "easy",
      phases: ["taper"],
      minutes: { low: 20, high: 35 },
      prescription:
        "Short and easy. The long run for this block already happened. Do not squeeze a missed one into this week.",
      steps: [step("free", 20, "Easy, RPE 3.")],
    }),
    rest("half-novice-rest", allPhases),
  ],
  "half-developing": [
    easyRun("half-dev-easy", "Easy run", 35, 55, ["build", "specific", "taper"]),
    workout({
      id: "half-dev-steady",
      name: "Steady half-marathon effort",
      sport: "run",
      intent: "quality",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 40, high: 60 },
      prescription:
        "One controlled faster session, kept away from the long run by at least one easy or rest day. The middle is a steady effort where a short sentence still works and a conversation does not. The first time you do it, keep the steady part to 15 minutes.",
      steps: [
        step("warmup", 10, "Easy, RPE 3."),
        step("work", 20, "Steady, RPE 6. Short sentences only."),
        step("cooldown", 10, "Easy, RPE 3."),
      ],
    }),
    workout({
      id: "half-dev-long",
      name: "Long easy run",
      sport: "run",
      intent: "long",
      phases: ["build", "specific"],
      dropWhen: ["injury", "taper"],
      minutes: { low: 60, high: 110 },
      prescription:
        "Stay easy the whole way. Do not add the steady session onto the end of this run. On a cutback week, use the short end.",
      steps: [step("free", 60, "Conversational, RPE 3 to 4.")],
    }),
    workout({
      id: "half-dev-opener",
      name: "Taper opener",
      sport: "run",
      intent: "quality",
      phases: ["taper"],
      dropWhen: ["injury", "niggle"],
      minutes: { low: 20, high: 30 },
      prescription:
        "A short reminder of the steady effort, early in the taper week. Skip it if you feel flat, and just run easy.",
      steps: [
        step("warmup", 10, "Easy, RPE 3."),
        step("work", 0.5, "Smooth, about RPE 6.", 4),
        step("recover", 1.5, "Easy jog.", 4),
        step("cooldown", 5, "Easy, RPE 2 to 3."),
      ],
    }),
    rest("half-dev-rest", ["build", "specific", "taper"]),
  ],
  "marathon-novice": [
    easyRun("m-novice-easy", "Easy run", 30, 55),
    workout({
      id: "m-novice-long",
      name: "Long easy run",
      sport: "run",
      intent: "long",
      phases: training,
      dropWhen: ["injury", "taper"],
      minutes: { low: 45, high: 180 },
      prescription:
        "This is the session that matters. Conversational from start to finish. No faster finish and no marathon-pace miles. About every third week, shorten it to roughly three quarters of the previous long run instead of extending it. A published peak near three hours is the far end of the block, not a target for this week. Rest the day before. The day after is cross-training or easy, never a workout.",
      steps: [step("free", 45, "Conversational the entire time, RPE 3 to 4.")],
    }),
    workout({
      id: "m-novice-cross",
      name: "Cross-training",
      sport: "bike",
      intent: "easy",
      phases: training,
      minutes: { low: 30, high: 50 },
      prescription:
        "An easy spin, swim, or brisk walk instead of a fifth run. Keep it conversational. This replaces running. It does not get added on top of a run the same day.",
      steps: [step("free", 30, "Easy, RPE 3. You could talk the whole time.")],
    }),
    workout({
      id: "m-novice-taper",
      name: "Taper easy run",
      sport: "run",
      intent: "easy",
      phases: ["taper"],
      minutes: { low: 20, high: 40 },
      prescription:
        "Short and easy. Race week has no long run. Feeling fresh matters more than one more workout.",
      steps: [step("free", 20, "Easy, RPE 3.")],
    }),
    rest("m-novice-rest", allPhases),
  ],
  "marathon-developing": [
    easyRun("m-dev-easy", "Easy run", 35, 60, ["build", "specific"]),
    workout({
      id: "m-dev-pace",
      name: "Marathon-effort run",
      sport: "run",
      intent: "quality",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 45, high: 70 },
      prescription:
        "A shorter run that holds steady marathon effort in the middle. That effort is controlled: a short sentence works, a long conversation does not. Keep an easy or rest day between this and the long run. On a cutback week, skip this and keep the long run shorter.",
      steps: [
        step("warmup", 15, "Easy, RPE 3."),
        step("work", 25, "Steady marathon effort, RPE 5 to 6."),
        step("cooldown", 10, "Easy, RPE 3."),
      ],
    }),
    workout({
      id: "m-dev-long",
      name: "Long easy run",
      sport: "run",
      intent: "long",
      phases: ["build", "specific"],
      dropWhen: ["injury", "taper"],
      minutes: { low: 70, high: 180 },
      prescription:
        "The long run stays easy even though the week also has a marathon-effort day. Do not move missed midweek minutes onto this run.",
      steps: [step("free", 70, "Conversational, RPE 3 to 4.")],
    }),
    rest("m-dev-rest", ["build", "specific"]),
  ],
  "marathon-phased": [
    easyRun("m-phase-easy", "Easy run", 40, 70),
    workout({
      id: "m-phase-hills",
      name: "Short hill repeats",
      sport: "run",
      intent: "hills",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 40, high: 60 },
      prescription:
        "One harder session. Use a moderate hill, not a wall. Run up smooth and tall, then walk down until you could talk. The downhill is recovery. Do not add downhill repeats, and do not put this next to the long run. If the week already has another hard day, skip this one.",
      steps: [
        step("warmup", 15, "Easy on flat ground, RPE 3."),
        step("work", 0.75, "Uphill, smooth, about RPE 7.", 6),
        step("recover", 2, "Walk down until breathing is easy.", 6),
        step("cooldown", 10, "Easy, RPE 3."),
      ],
    }),
    workout({
      id: "m-phase-faster",
      name: "Short faster repeats",
      sport: "run",
      intent: "quality",
      phases: ["build"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 45, high: 60 },
      prescription:
        "The other build-phase option instead of hills, not in addition, unless an easy day separates them and you are already handling the week. The repeats are comfortably hard. Full easy jogging between them.",
      steps: [
        step("warmup", 15, "Easy, RPE 3."),
        step("work", 3, "Comfortably hard, RPE 7.", 5),
        step("recover", 2, "Easy jog, RPE 3.", 5),
        step("cooldown", 10, "Easy, RPE 2 to 3."),
      ],
    }),
    workout({
      id: "m-phase-long",
      name: "Long easy run",
      sport: "run",
      intent: "long",
      phases: ["base", "build"],
      dropWhen: ["injury", "taper"],
      minutes: { low: 70, high: 180 },
      prescription:
        "Easy the whole way while the block is still in preparation or early build. On a rolling course, practice the terrain, but keep the downs relaxed.",
      steps: [step("free", 70, "Conversational, RPE 3 to 4.")],
    }),
    workout({
      id: "m-phase-specific-long",
      name: "Long run with a steady finish",
      sport: "run",
      intent: "long",
      phases: ["specific"],
      dropWhen: ["injury", "niggle", "taper"],
      minutes: { low: 80, high: 200 },
      prescription:
        "Run easy for about the first two thirds. If nothing hurts and the early miles felt ordinary, finish the last third at a steady effort, around RPE 5 to 6, where a short sentence still works. If anything is sore, the whole run stays easy. This is one session. Do not also run hills the day before or the day after. A cutback week drops the steady finish and shortens the run.",
      steps: [
        step("work", 50, "Easy, RPE 3 to 4, for about two thirds of the time."),
        step("work", 25, "Steady, RPE 5 to 6, only if the easy part felt fine."),
        step("cooldown", 5, "Easy, RPE 3."),
      ],
    }),
    workout({
      id: "m-phase-taper",
      name: "Taper touch",
      sport: "run",
      intent: "quality",
      phases: ["taper"],
      dropWhen: ["injury", "niggle"],
      minutes: { low: 25, high: 35 },
      prescription:
        "Early in the taper week, a few short pickups so the legs stay awake. Skip it and run easy if you feel tired. Race week itself is easy running and rest only.",
      steps: [
        step("warmup", 10, "Easy, RPE 3."),
        step("work", 1, "Smooth, about RPE 6.", 4),
        step("recover", 2, "Easy jog.", 4),
        step("cooldown", 8, "Easy, RPE 2 to 3."),
      ],
    }),
    rest("m-phase-rest", allPhases),
  ],
  "post-race": [
    rest("post-rest", ["recovery"]),
    workout({
      id: "post-loosen",
      name: "First easy jog",
      sport: "walk",
      intent: "easy",
      phases: ["recovery"],
      minutes: { low: 15, high: 25 },
      prescription:
        "Only after a few days completely off. Alternate a couple of minutes of easy jogging with a couple of minutes of walking. Ordinary stiffness can show up. Pain that changes your stride means stop and, if it persists, see a clinician. There is no pace work in this block.",
      steps: [
        step("work", 2, "Easy jog, RPE 2 to 3.", 4),
        step("recover", 2, "Walk.", 4),
      ],
    }),
    workout({
      id: "post-easy",
      name: "Easy aerobic time",
      sport: "run",
      intent: "easy",
      phases: ["recovery"],
      minutes: { low: 25, high: 45 },
      prescription:
        "Once the short jog feels ordinary, a bit more easy time. Keep it flat and conversational. A race next month is not a reason to add a workout.",
      steps: [step("free", 25, "Easy, RPE 3. Walk if you want.")],
    }),
  ],
  "ultra-first": [
    workout({
      id: "u50-easy",
      name: "Short easy run",
      sport: "trail",
      intent: "easy",
      phases: training,
      minutes: { low: 30, high: 60 },
      prescription:
        "Easy running or a mix of running and walking. These fill the week around the long session. Keep them truly easy.",
      steps: [step("free", 30, "Easy, RPE 3.")],
    }),
    workout({
      id: "u50-long",
      name: "Time-on-feet long run",
      sport: "trail",
      intent: "long",
      phases: training,
      dropWhen: ["injury", "taper"],
      minutes: { low: 70, high: 180 },
      prescription:
        "One long easy outing. Time matters more than distance. Hike the steep parts on purpose. Have a sip and a small bite about every half hour so race-day eating is practiced while you are comfortable. Stay around RPE 3 to 4. Do not cover 50K in training, and do not add a second long day tomorrow.",
      steps: [
        step("free", 70, "Easy running and hiking, RPE 3 to 4. Eat and drink on a schedule."),
      ],
    }),
    workout({
      id: "u50-strides",
      name: "Easy run with strides",
      sport: "trail",
      intent: "quality",
      phases: ["specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 30, high: 45 },
      prescription:
        "Only after the long outing already feels routine, and with an easy day on either side. Four relaxed accelerations. Skip them if the week already feels like a lot.",
      steps: [
        step("warmup", 10, "Easy, RPE 3."),
        step("work", 0.33, "Relaxed and quick, about RPE 6.", 4),
        step("recover", 1, "Walk or easy jog.", 4),
        step("cooldown", 5, "Easy, RPE 3."),
      ],
    }),
    rest("u50-rest", allPhases),
  ],
  "ultra-long": [
    workout({
      id: "ulong-easy",
      name: "Easy run",
      sport: "trail",
      intent: "easy",
      phases: ["build", "specific", "taper"],
      minutes: { low: 40, high: 70 },
      prescription: "Easy running. This is the filler that lets the long days happen.",
      steps: [step("free", 40, "Easy, RPE 3.")],
    }),
    workout({
      id: "ulong-long",
      name: "Long day",
      sport: "trail",
      intent: "long",
      phases: ["build", "specific"],
      dropWhen: ["injury", "taper"],
      minutes: { low: 90, high: 240 },
      prescription:
        "The primary long session, mostly easy, hiking the steep climbs. Once, about four to six weeks before the race, do this version on terrain like the course, with the kit and the food you will actually use. Effort stays easy even on that dress rehearsal. Do not try to cover the race distance.",
      steps: [
        step("free", 90, "Easy running and hiking, RPE 3 to 4. Practice fueling."),
      ],
    }),
    workout({
      id: "ulong-second",
      name: "Easy second day",
      sport: "trail",
      intent: "back-to-back",
      phases: ["specific"],
      dropWhen: ["injury", "taper"],
      minutes: { low: 45, high: 160 },
      prescription:
        "The day after the long day, and only in the specific phase, with weeks between pairs. Easy the whole way, around RPE 3. Walk the hills. If the first day left a niggle, replace this with a walk or with rest. This is never a workout and never another long hard day. The day after the pair is off or very easy.",
      steps: [step("free", 45, "Easy, RPE 3. Shorter than yesterday.")],
    }),
    workout({
      id: "ulong-hills",
      name: "Short uphill repeats",
      sport: "trail",
      intent: "hills",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 35, high: 50 },
      prescription:
        "Far from the long day. Short climbs, then an easy jog or walk down. Downhill repeats come out first if knees or quads complain. Skip this in a week that already has the back-to-back.",
      steps: [
        step("warmup", 10, "Easy, RPE 3."),
        step("work", 1, "Uphill, about RPE 6 to 7, good form.", 5),
        step("recover", 2, "Easy jog or walk down.", 5),
        step("cooldown", 10, "Easy, RPE 3."),
      ],
    }),
    rest("ulong-rest", ["build", "specific", "taper"]),
  ],
  "trail-race": [
    workout({
      id: "trail-easy",
      name: "Easy smooth run",
      sport: "run",
      intent: "easy",
      phases: ["build", "specific", "taper"],
      minutes: { low: 30, high: 50 },
      prescription:
        "Easy running on smooth ground. Use this the day after a technical trail session.",
      steps: [step("free", 30, "Easy, RPE 3.")],
    }),
    workout({
      id: "trail-long",
      name: "Long trail session",
      sport: "trail",
      intent: "long",
      phases: ["build", "specific"],
      dropWhen: ["injury", "taper"],
      minutes: { low: 60, high: 180 },
      prescription:
        "Move the long session onto trails like the race. Hike the steep climbs on purpose. Judge it by effort and time, not by road pace. Mud, heat, or a niggle means a shorter day on smoother ground.",
      steps: [
        step("free", 60, "Easy effort, RPE 3 to 4, hiking the steep parts."),
      ],
    }),
    workout({
      id: "trail-hills",
      name: "Short hill repeats",
      sport: "trail",
      intent: "hills",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 35, high: 50 },
      prescription:
        "Once easy weeks are solid. Up at a strong but tidy effort, down easy. Not the day before or after the long trail session.",
      steps: [
        step("warmup", 10, "Easy, RPE 3."),
        step("work", 0.75, "Uphill, about RPE 7.", 6),
        step("recover", 2, "Easy jog or walk down.", 6),
        step("cooldown", 10, "Easy, RPE 3."),
      ],
    }),
    rest("trail-rest", ["build", "specific", "taper"]),
  ],
  "road-endurance": [
    workout({
      id: "road-easy",
      name: "Easy spin",
      sport: "bike",
      intent: "easy",
      phases: training,
      minutes: { low: 40, high: 75 },
      prescription:
        "Pedal the whole time at a conversational effort. This is not a long run and should not be labeled as one.",
      steps: [step("free", 40, "Easy spinning, RPE 3.")],
    }),
    workout({
      id: "road-long",
      name: "Long endurance ride",
      sport: "bike",
      intent: "endurance",
      phases: training,
      dropWhen: ["injury", "taper"],
      minutes: { low: 75, high: 240 },
      prescription:
        "The ride that grows. Mostly easy, RPE 3 to 4. You may include a little steady riding in the middle only after the easy duration already feels familiar, and only for a small slice of the ride. Do not turn this into a test. Extend it by a small step from your recent long ride, not by jumping to a published four-hour ride.",
      steps: [
        step("free", 75, "Mostly easy, RPE 3 to 4. A little steady work only if the endurance is already there."),
      ],
    }),
    workout({
      id: "road-steady",
      name: "Steady blocks",
      sport: "bike",
      intent: "quality",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 50, high: 80 },
      prescription:
        "The one harder ride of the week. After an easy start, ride two steady blocks at an effort where conversation breaks up but the power or the gear still feels sustainable. Easy pedaling between and after. The first time, do one block instead of two. A missed version of this ride is gone. It does not move onto the long ride. Use effort unless heart-rate or power zones are already saved.",
      steps: [
        step("warmup", 15, "Easy spinning, RPE 3."),
        step("work", 10, "Strong and sustainable, RPE 6 to 7.", 2),
        step("recover", 5, "Easy spinning.", 2),
        step("cooldown", 10, "Easy, RPE 2 to 3."),
      ],
    }),
    workout({
      id: "road-form",
      name: "Form ride",
      sport: "bike",
      intent: "endurance",
      phases: ["build", "specific"],
      dropWhen: ["injury"],
      minutes: { low: 40, high: 55 },
      prescription:
        "An easy ride with a few short bursts of quicker, light-gear pedaling. The ride as a whole stays easy. This is not a second hard day.",
      steps: [
        step("warmup", 15, "Easy, RPE 3."),
        step("work", 0.33, "Quicker pedaling, light gear, about RPE 5.", 6),
        step("recover", 1, "Easy spinning.", 6),
        step("cooldown", 10, "Easy, RPE 3."),
      ],
    }),
    workout({
      id: "road-opener",
      name: "Event-week spin",
      sport: "bike",
      intent: "easy",
      phases: ["taper"],
      minutes: { low: 20, high: 40 },
      prescription:
        "Short and easy, with a few faster spins of the legs if you feel good. The long ride does not happen this week.",
      steps: [step("free", 20, "Easy, RPE 3. Stop while you feel fresh.")],
    }),
    rest("road-rest", allPhases),
  ],
  "mountain-bike": [
    workout({
      id: "mtb-skills",
      name: "Skills while fresh",
      sport: "bike",
      intent: "easy",
      phases: training,
      dropWhen: ["injury"],
      minutes: { low: 20, high: 40 },
      prescription:
        "A short loop you already know, done before you are tired. Pick one skill: braking before a corner, looking through the turn, or a controlled descent. Stop while you are still tidy. Do not attach this to the end of the long ride while you are still learning it. If the course is technical and new, do this instead of the intense repeats.",
      steps: [
        step("free", 20, "Easy riding, attention on one skill. RPE 3 to 4."),
      ],
    }),
    workout({
      id: "mtb-intense",
      name: "Short intense repeats",
      sport: "bike",
      intent: "quality",
      phases: ["build", "specific"],
      dropWhen: ["injury", "niggle", "cutback", "taper"],
      minutes: { low: 40, high: 60 },
      prescription:
        "The one high-intensity day. Hard repeats with equal easy spinning between them. A second intense day this week becomes an easy spin instead.",
      steps: [
        step("warmup", 10, "Easy, RPE 3."),
        step("work", 3, "Hard, about RPE 7, repeatable form.", 5),
        step("recover", 3, "Easy spinning.", 5),
        step("cooldown", 10, "Easy, RPE 2 to 3."),
      ],
    }),
    workout({
      id: "mtb-long",
      name: "Long easy ride",
      sport: "bike",
      intent: "endurance",
      phases: training,
      dropWhen: ["injury", "taper"],
      minutes: { low: 60, high: 240 },
      prescription:
        "Mostly easy, below a hard effort. Let the ride grow from whatever you can already finish. A very large published week, on the order of ten hours or more, is for a multi-day mountain tour, not the default. Your available hours cap this ride. Technical descending still counts as stress even if the effort stayed low, so the next day is easy.",
      steps: [step("free", 60, "Easy, RPE 3 to 4. Stay below a hard effort.")],
    }),
    workout({
      id: "mtb-easy",
      name: "Easy spin",
      sport: "bike",
      intent: "easy",
      phases: allPhases,
      minutes: { low: 30, high: 50 },
      prescription:
        "Recovery pedaling, on the road or indoors if the trails are closed. It keeps frequency. It does not become another interval session.",
      steps: [step("free", 30, "Very easy, RPE 2 to 3.")],
    }),
    rest("mtb-rest", allPhases),
  ],
  "hike-objective": [
    workout({
      id: "hike-strength",
      name: "Hike strength",
      sport: "strength",
      intent: "strength",
      phases: ["base", "build", "specific"],
      minutes: { low: 25, high: 40 },
      prescription:
        "Two rounds, resting as you need. Slow squats, step-ups, a carry at your side, and a side plank. Use a range of motion you control. Skip or shrink any move that hurts. Leave at least a day before the next strength session. This is not a running workout.",
      steps: [
        step("work", 8, "Squats, step-ups, a side carry, and a side plank. Moderate, around RPE 5.", 2),
        step("recover", 2, "Rest between rounds.", 2),
      ],
    }),
    workout({
      id: "hike-cardio",
      name: "Easy cardio",
      sport: "walk",
      intent: "easy",
      phases: ["base", "build"],
      minutes: { low: 30, high: 50 },
      prescription:
        "A walk, a hike, or an easy run if you already run. Conversational. Three of these in the week, not back to back if you can help it. The pack stays light or empty until unloaded walking feels ordinary.",
      steps: [step("free", 30, "Conversational, RPE 3.")],
    }),
    workout({
      id: "hike-loaded",
      name: "Loaded hike",
      sport: "walk",
      intent: "long",
      phases: ["specific"],
      dropWhen: ["injury", "niggle"],
      minutes: { low: 60, high: 150 },
      prescription:
        "For the last couple of weeks before the trip. Hike an hour or more with a pack close to the weight you will carry. Keep the effort conversational. Do not start here. The day or two before you leave, rest instead.",
      steps: [
        step("free", 60, "Conversational hiking with a realistic pack, RPE 3 to 4."),
      ],
    }),
    rest("hike-rest", ["base", "build", "specific", "taper"]),
  ],
  "thru-hike": [
    workout({
      id: "thru-walk",
      name: "Unloaded walk",
      sport: "walk",
      intent: "easy",
      phases: ["base", "build"],
      minutes: { low: 40, high: 90 },
      prescription:
        "Time on your feet, starting on flat or rolling ground with no pack. Conversational. If you are still tired the next morning, repeat the week instead of adding anything.",
      steps: [step("free", 40, "Easy walking, RPE 3.")],
    }),
    workout({
      id: "thru-strength",
      name: "Trail strength",
      sport: "strength",
      intent: "strength",
      phases: ["base", "build"],
      minutes: { low: 25, high: 40 },
      prescription:
        "Twice a week, with a couple of days between. Slow squats, step-ups, a carry, and a plank variation. A running background does not replace this or the loaded walking.",
      steps: [
        step("work", 8, "Squats, step-ups, a carry, and a plank. Moderate, around RPE 5.", 2),
      ],
    }),
    workout({
      id: "thru-hike",
      name: "Progression hike",
      sport: "walk",
      intent: "long",
      phases: ["build"],
      dropWhen: ["injury", "niggle"],
      minutes: { low: 60, high: 180 },
      prescription:
        "Change one thing from the last hike: a bit more time, or steeper ground, or an empty pack, or a little of the real pack weight. Not two of those in the same week. Knee, foot, or back pain means less weight and less downhill, not a bigger day. You do not need a 20-mile day before the trail starts.",
      steps: [
        step("free", 60, "Conversational hiking. One progression only, RPE 3 to 4."),
      ],
    }),
    rest("thru-rest", ["base", "build"]),
  ],
};

function dropped(workout: ExampleWorkout, query: WorkoutQuery) {
  if (
    query.constraint === "injury" &&
    (workout.dropWhen.includes("injury") ||
      !["easy", "rest", "strength"].includes(workout.intent))
  )
    return true;
  if (query.constraint === "niggle" && workout.dropWhen.includes("niggle"))
    return true;
  if (query.cutback && workout.dropWhen.includes("cutback")) return true;
  if (query.phase === "taper" && workout.dropWhen.includes("taper")) return true;
  if (
    query.phase === "recovery" &&
    !["easy", "rest", "strength"].includes(workout.intent)
  )
    return true;
  return false;
}

export function chooseWorkouts(
  patternId: string,
  query: WorkoutQuery = {},
): ExampleWorkout[] {
  const all = exampleWorkouts[patternId] ?? [];
  let list = all.filter((item) => !dropped(item, query));
  if (query.phase) {
    const phased = list.filter((item) => item.phases.includes(query.phase!));
    if (phased.length) list = phased;
  }
  const preferred = [
    ...list.filter((item) => item.intent !== "rest"),
    ...list.filter((item) => item.intent === "rest"),
  ];
  return preferred.slice(0, 4);
}

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

export function workoutHold(
  item: ExampleWorkout,
  query: WorkoutQuery = {},
): string | null {
  if (!dropped(item, query)) return null;
  if (query.constraint === "injury")
    return "Set aside while an injury flag is on.";
  if (query.constraint === "niggle" && item.dropWhen.includes("niggle"))
    return "Set aside while a niggle is on file.";
  if (query.cutback && item.dropWhen.includes("cutback"))
    return "Skip this on a cutback week.";
  if (query.phase === "taper" && item.dropWhen.includes("taper"))
    return "Not used during a taper.";
  if (query.phase === "recovery")
    return "Not used in the weeks after a race.";
  return "Set aside this week.";
}

export function workoutDurationText(
  item: ExampleWorkout,
  query: WorkoutQuery = {},
): string {
  const { low, high } = item.minutes;
  if (item.intent === "rest" || high === 0) return "No training time.";
  if (item.intent === "long" || item.intent === "back-to-back") {
    if (!query.longestMinutes)
      return `Ask for a recent longest session before assigning this. The pattern allows ${low}–${high} minutes, and a long day stays within 20 minutes of that longest session.`;
    if (item.intent === "back-to-back") {
      const minutes = clamp(
        Math.round(query.longestMinutes * 0.6),
        low,
        Math.min(high, query.longestMinutes),
      );
      return `About ${minutes} minutes, near 60 percent of the recent long session of ${query.longestMinutes} minutes.`;
    }
    const cap = query.longestMinutes + 20;
    let minutes = Math.min(high, cap, Math.max(low, query.longestMinutes + 10));
    if (query.cutback)
      minutes = Math.min(
        cap,
        Math.max(Math.min(low, cap), Math.round(minutes * 0.8)),
      );
    return `About ${minutes} minutes. The recent longest is ${query.longestMinutes} minutes, so the cap is ${cap}. The pattern's own range is ${low}–${high} minutes.`;
  }
  let minutes =
    query.weeklyMinutes != null && query.weeklyMinutes < 180
      ? low
      : Math.round((low + high) / 2);
  if (query.cutback) minutes = Math.max(10, Math.round(minutes * 0.8));
  if (query.phase === "taper") minutes = Math.min(minutes, high);
  return `About ${minutes} minutes (pattern range ${low}–${high}).`;
}

export function formatWorkoutSteps(item: ExampleWorkout): string {
  return item.steps
    .map((part) => {
      const times = part.repeats > 1 ? `${part.repeats} × ` : "";
      const minutes =
        part.minutes < 1
          ? `${Math.round(part.minutes * 60)} sec`
          : `${part.minutes} min`;
      return `${times}${minutes} ${part.kind}: ${part.effort}`;
    })
    .join("; ");
}

export function describeWorkout(
  item: ExampleWorkout,
  query: WorkoutQuery = {},
): string {
  return `${item.name} [${item.intent}, ${item.sport}]\n${workoutDurationText(item, query)}\nDo: ${item.prescription}\nSteps: ${formatWorkoutSteps(item)}`;
}
