import { useEffect, useMemo, useRef, useState } from "react";
import {
  exampleWorkouts,
  programLibrary,
  programQueryFromContext,
  programWeekShape,
  retrievePrograms,
  workoutDurationText,
  workoutHold,
  type AppState,
  type ExampleWorkout,
  type ProgramQuery,
  type WorkoutQuery,
} from "../../../packages/domain/src/index.js";

const filters = [
  { id: "all", label: "All" },
  { id: "you", label: "For you" },
  { id: "run", label: "Running" },
  { id: "trail", label: "Trail" },
  { id: "bike", label: "Cycling" },
  { id: "hike", label: "Hiking" },
] as const;

type WorkoutFilter = (typeof filters)[number]["id"];

const intentLabel: Record<ExampleWorkout["intent"], string> = {
  rest: "Rest",
  easy: "Easy",
  long: "Long",
  quality: "Quality",
  endurance: "Endurance",
  hills: "Hills",
  strength: "Strength",
  "back-to-back": "Back to back",
};

const sportLabel: Record<ExampleWorkout["sport"], string> = {
  run: "Run",
  trail: "Trail",
  bike: "Bike",
  walk: "Walk",
  strength: "Strength",
  rest: "Rest",
};

const phaseLabel: Record<string, string> = {
  base: "base",
  build: "build",
  specific: "specific",
  taper: "taper",
  recovery: "recovery",
};

function scaling(query: ProgramQuery): WorkoutQuery {
  return {
    phase: query.phase,
    constraint: query.constraint,
    cutback: query.cutback,
    longestMinutes: query.longestMinutes,
    weeklyMinutes: query.weeklyMinutes,
  };
}

function stepTime(minutes: number) {
  return minutes < 1 ? `${Math.round(minutes * 60)} sec` : `${minutes} min`;
}

function matches(
  pattern: (typeof programLibrary)[number],
  filter: WorkoutFilter,
  closest: Set<string>,
) {
  if (filter === "all") return true;
  if (filter === "you") return closest.has(pattern.id);
  if (filter === "bike") return pattern.sports.includes("bike");
  if (filter === "hike") return pattern.events.includes("hike");
  if (filter === "trail")
    return pattern.events.includes("trail") || pattern.events.includes("ultra");
  return pattern.events.some((event) =>
    ["base", "short-distance", "half-marathon", "marathon"].includes(event),
  );
}

export function WorkoutsView({ state }: { state: AppState }) {
  const [filter, setFilter] = useState<WorkoutFilter>("all");
  const top = useRef<HTMLElement>(null);
  const first = useRef(true);
  const query = useMemo(
    () =>
      programQueryFromContext({
        today: state.today,
        athlete: state.athlete,
        block: state.block,
        races: state.races,
        activities: state.activities,
      }),
    [state],
  );
  if (state.program) {
    const pattern = programLibrary.find(
      (p) => p.id === state.program!.patternId,
    )!;
    const index = Math.max(
      0,
      Math.floor(
        (Date.parse(state.today) - Date.parse(state.program.startDate)) /
          (7 * 86400000),
      ),
    );
    const shape = programWeekShape(state.program, index, pattern.phases);
    query.phase = shape.phase;
    query.cutback = shape.cutback;
  }
  const scale = scaling(query);
  const closest = useMemo(() => {
    const ids = state.program
      ? [state.program.patternId]
      : retrievePrograms({ ...query, limit: 2 }).map((item) => item.id);
    return new Set(ids);
  }, [query, state.program]);
  const groups = useMemo(() => {
    const ranked = [...programLibrary].sort((a, b) => {
      const left = closest.has(a.id) ? 0 : 1;
      const right = closest.has(b.id) ? 0 : 1;
      return left - right;
    });
    return ranked
      .filter((pattern) => matches(pattern, filter, closest))
      .map((pattern) => ({
        ...pattern,
        workouts: exampleWorkouts[pattern.id] ?? [],
      }))
      .filter((pattern) => pattern.workouts.length > 0);
  }, [closest, filter]);
  const count = groups.reduce((sum, group) => sum + group.workouts.length, 0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    top.current?.scrollIntoView({ block: "start" });
  }, [filter]);

  return (
    <section className="workouts-view" ref={top}>
      <div className="view-heading">
        <div>
          <span className="eyebrow">EXAMPLE SESSIONS</span>
          <h1>Workout library.</h1>
          <p>
            Example sessions your coach can use or adapt. Choose a program in
            the Programs tab to get a complete dated schedule; browsing here
            leaves your plan unchanged.
          </p>
        </div>
      </div>
      {query.constraint === "injury" && (
        <p className="workout-banner">
          An injury flag is on. Easy, rest, and strength sessions are the ones
          to use. The others stay listed so you can read them.
        </p>
      )}
      {query.constraint === "niggle" && (
        <p className="workout-banner">
          A niggle is on file. Hills, speed, and extra intensity are set aside
          this week.
        </p>
      )}
      {query.cutback && (
        <p className="workout-banner">
          This is a cutback week. The harder sessions are marked to skip, and
          the long session is shorter.
        </p>
      )}
      {query.phase === "taper" && query.constraint !== "injury" && (
        <p className="workout-banner">
          Taper week. Long sessions are set aside. A short easy session is the
          one to keep.
        </p>
      )}
      <div
        className="workout-filters"
        role="toolbar"
        aria-label="Filter workouts"
      >
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        <span>
          {count} session{count === 1 ? "" : "s"}
        </span>
      </div>
      {groups.length === 0 ? (
        <p className="muted">Nothing in this filter. Try All.</p>
      ) : (
        groups.map((group) => (
          <section className="workout-group" key={group.id}>
            <header>
              <div className="workout-group-label">
                <h2>{group.title}</h2>
                {closest.has(group.id) && (
                  <span className="for-you">For you</span>
                )}
              </div>
              <p>{group.weekShape}</p>
            </header>
            <div className="workout-list">
              {group.workouts.map((workout) => (
                <WorkoutCard key={workout.id} workout={workout} scale={scale} />
              ))}
            </div>
          </section>
        ))
      )}
    </section>
  );
}

function WorkoutCard({
  workout,
  scale,
}: {
  workout: ExampleWorkout;
  scale: WorkoutQuery;
}) {
  const hold = workoutHold(workout, scale);
  const rest = workout.intent === "rest";
  return (
    <article className={`workout-card${hold ? " held" : ""}`}>
      <header>
        <h3>{workout.name}</h3>
        <span className="workout-meta">
          {intentLabel[workout.intent]} · {sportLabel[workout.sport]}
          {workout.phases.length
            ? ` · ${workout.phases.map((phase) => phaseLabel[phase] ?? phase).join(", ")}`
            : ""}
        </span>
      </header>
      <p className="workout-duration">{workoutDurationText(workout, scale)}</p>
      {hold && <p className="workout-hold">{hold}</p>}
      {!rest && <p>{workout.prescription}</p>}
      {!rest && workout.steps.length > 0 && (
        <ol className="workout-steps">
          {workout.steps.map((step, index) => (
            <li key={`${workout.id}-${index}`}>
              <span>
                {step.repeats > 1 ? `${step.repeats} × ` : ""}
                {stepTime(step.minutes)}
                {step.kind !== "free" ? ` ${step.kind}` : ""}
              </span>
              <span>{step.effort}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
