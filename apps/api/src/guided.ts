import {
  addDays,
  dayOfWeek,
  formatDuration,
  formatWorkoutSteps,
  programQueryFromContext,
  retrievePrograms,
  DomainError,
  type ActivityInput,
  type PlanInput,
  type RetrievedWorkout,
} from "../../../packages/domain/src/index.js";
import type { CoachService } from "./service.js";
import { trainingProposal } from "./planning.js";

function applyExample(
  days: PlanInput[],
  workouts: RetrievedWorkout[],
): PlanInput[] {
  return days.map((day) => {
    if (day.intent === "rest") return day;
    const match =
      workouts.find(
        (item) => item.intent === day.intent && item.sport === day.sport,
      ) ?? workouts.find((item) => item.intent === day.intent);
    if (!match) return day;
    return { ...day, title: match.name, prescription: match.prescription };
  });
}

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
function mentionsPain(text: string) {
  const concerns = text
    .replace(
      /\b(?:no|without|not in|don't have|don’t have)\s+(?:any\s+)?(?:pain|injury|injuries)\b/g,
      "",
    )
    .replace(/\bnot\s+(?:injured|hurting|sore)\b|\bnothing\s+hurts\b/g, "");
  return /\b(pain|injur(?:y|ed)|hurt(?:s|ing)?|sore)\b/.test(concerns);
}
export interface GuidedAction {
  name: string;
  input: unknown;
  output: unknown;
}
export function guidedReply(
  service: CoachService,
  message: string,
  turnId: string,
): { text: string; actions: GuidedAction[] } {
  const actions: GuidedAction[] = [];
  const text = message.trim();
  const lower = text.toLowerCase();
  const execute = <T>(name: string, input: unknown, work: () => T) => {
    const output = work();
    actions.push({ name, input, output });
    return output;
  };
  const operation = (name: string) => `${turnId}:${name}`;
  try {
    if (
      /\b(remember|prefer|long run|rest day|rest on|day off)\b/.test(lower) &&
      !/\b(ran|rode|logged|completed)\b/.test(lower)
    ) {
      const namedDays = weekdays
        .map((name, day) => ({ name, day }))
        .filter(({ name }) => lower.includes(name.toLowerCase()));
      if (/long run/.test(lower) && namedDays.length === 1) {
        const day = namedDays[0];
        execute("update_athlete", { longRunDay: day.day }, () =>
          service.updateAthlete(
            { longRunDay: day.day },
            operation("preference"),
          ),
        );
        return {
          text: `I've saved ${day.name} as your long-run day.\n\nI'll use it whenever we make a plan.`,
          actions,
        };
      }
      if (/rest|day off/.test(lower) && namedDays.length) {
        const restDays = [
          ...new Set([
            ...service.athlete().restDays,
            ...namedDays.map((day) => day.day),
          ]),
        ];
        execute("update_athlete", { restDays }, () =>
          service.updateAthlete({ restDays }, operation("preference")),
        );
        return {
          text: `Saved ${restDays.map((day) => weekdays[day]).join(" and ")} for rest. I'll keep those days clear when I propose training.`,
          actions,
        };
      }
    }
    if (
      mentionsPain(lower) &&
      !/\b(ran|rode|walked|completed|lifted)\b/.test(lower)
    ) {
      execute(
        "update_athlete",
        { constraint: "injury", constraintNote: text },
        () =>
          service.updateAthlete(
            { constraint: "injury", constraintNote: text },
            operation("constraint"),
          ),
      );
      return {
        text: "I've saved that concern and paused hard training. We can keep your next steps easy or take a rest day.\n\nWhere does it hurt, and does it hurt during ordinary walking? For ongoing or significant pain, get a clinician involved.",
        actions,
      };
    }
    if (
      /\b(ran|rode|cycled|walked|completed|lifted|log(?:ged)?)\b/.test(lower) &&
      /\b(\d+)\s*(?:min|minute|hour|hr|h\b)/.test(lower)
    ) {
      const hours = Number(
        lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h\b)/)?.[1] ?? 0,
      );
      const minutes = Number(
        lower.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m\b)/)?.[1] ?? 0,
      );
      const rpeMatch = lower.match(/(?:rpe|effort)\s*[:=]?\s*(10|[1-9])\b/);
      const distance = lower.match(
        /(\d+(?:\.\d+)?)\s*(miles?|mi\b|kilomet(?:er|re)s?|km\b)/,
      );
      const lifting = /\b(lifted|lifting|strength|weights|gym)\b/.test(lower);
      if (
        lifting &&
        /\b(sets?|reps?|lbs?|kg|squats?|planks?|pushups?|deadlifts?)\b|\d+\s*[x×]\s*\d+/.test(
          lower,
        )
      )
        return {
          text: "Use Log → Log lifting to save the exercises, sets, repetitions, weights, and timed holds together. I haven't saved a partial entry. Connecting the coach in Settings also enables detailed lifting entries in chat.",
          actions,
        };
      const sport: ActivityInput["sport"] = lifting
        ? "strength"
        : /rode|cycle|bike/.test(lower)
          ? "bike"
          : /walk/.test(lower)
            ? "walk"
            : /trail/.test(lower)
              ? "trail"
              : "run";
      const intent: ActivityInput["intent"] = lifting
        ? "strength"
        : /interval|quality|tempo|hard/.test(lower)
          ? "quality"
          : /long/.test(lower)
            ? "long"
            : "easy";
      if (/\b(tomorrow|next)\b/.test(lower))
        return {
          text: "That sounds like a future workout. I can propose it in your plan; a log entry is for something you've already done.",
          actions,
        };
      const explicitDate = lower.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
      const namedDay = weekdays.findIndex((day) =>
        lower.includes(day.toLowerCase()),
      );
      const date =
        explicitDate ??
        (/yesterday/.test(lower)
          ? addDays(service.today(), -1)
          : namedDay >= 0
            ? addDays(
                service.today(),
                -((dayOfWeek(service.today()) - namedDay + 7) % 7),
              )
            : service.today());
      const input: ActivityInput = {
        date,
        sport,
        durationSeconds: Math.round((hours * 60 + minutes) * 60),
        distanceMetres: distance
          ? Number(distance[1]) * (/^mi/.test(distance[2]) ? 1609.344 : 1000)
          : null,
        rpe: rpeMatch ? Number(rpeMatch[1]) : null,
        intent,
        feel: null,
        pain: mentionsPain(lower) ? text : null,
      };
      execute("log_activity", input, () =>
        service.logActivity(input, operation("log")),
      );
      return {
        text: `Logged: ${formatDuration(input.durationSeconds)} ${sport === "bike" ? "ride" : sport}, ${intent}${input.rpe ? `, RPE ${input.rpe}/10` : ""}, on ${date}.\n\n${input.pain ? "How did that pain feel after you stopped?" : input.rpe ? "That gives us something real to build on. Want to plan your next three days?" : "How hard did it feel, from 1 to 10?"}`,
        actions,
      };
    }
    if (
      /\brpe\s*[:=]?\s*(10|[1-9])\b/.test(lower) &&
      service.activities().length
    ) {
      const latest = service.activities()[0];
      const { id, source, confirmed, createdAt, planSessionId, ...previous } =
        latest;
      const input = {
        ...previous,
        rpe: Number(lower.match(/\brpe\s*[:=]?\s*(10|[1-9])\b/)![1]),
      };
      execute("edit_activity", input, () =>
        service.editActivity(id, input, operation("rpe")),
      );
      return {
        text: `Saved RPE ${input.rpe}/10 for your latest ${latest.sport}. Your training summary now includes that effort.`,
        actions,
      };
    }
    if (/\b(accept|looks good|go with that|sounds good)\b/.test(lower)) {
      const ids = service
        .plan()
        .filter(
          (day) => day.status === "proposed" && day.date >= service.today(),
        )
        .map((day) => day.id);
      if (!ids.length)
        return {
          text: "You have no proposals waiting. Ask me to plan your next three days or your week.",
          actions,
        };
      execute("accept_plan", { ids }, () =>
        service.acceptPlan(ids, operation("accept")),
      );
      return {
        text: "Your plan is accepted. Tell me how each session goes and we'll adjust as needed. Consistency leaves room for life.",
        actions,
      };
    }
    if (/\b(missed|skip(?:ped)?)\b/.test(lower)) {
      const namedDay = weekdays.findIndex((day) =>
        lower.includes(day.toLowerCase()),
      );
      const selected = service
        .plan()
        .find(
          (day) =>
            day.status === "accepted" &&
            (namedDay >= 0
              ? dayOfWeek(day.date) === namedDay
              : /long/.test(lower)
                ? day.intent === "long"
                : day.date <= service.today()),
        );
      if (!selected)
        return {
          text: "Which accepted session did you miss? You can also open it in your plan and mark it missed.",
          actions,
        };
      execute("skip_session", { id: selected.id }, () =>
        service.skipSession(
          selected.id,
          text,
          selected.version,
          operation("skip"),
        ),
      );
      return {
        text: `Marked “${selected.title}” as missed. You don't need to cram it into tomorrow.\n\nKeep the next easy session, or tell me what changed and we can revise the plan.`,
        actions,
      };
    }
    if (/\b(move|reschedule)\b/.test(lower)) {
      const targetDay = weekdays.findIndex((day) =>
        lower.includes(day.toLowerCase()),
      );
      const selected = service
        .plan()
        .find(
          (day) =>
            day.status === "accepted" &&
            day.date >= service.today() &&
            (/long/.test(lower) ? day.intent === "long" : true),
        );
      if (targetDay < 0 || !selected)
        return {
          text: "Open an accepted session in your plan to choose its new date. I’ll keep a note of the change and its reason.",
          actions,
        };
      let date = addDays(
        service.today(),
        (targetDay - dayOfWeek(service.today()) + 7) % 7,
      );
      if (date === selected.date) date = addDays(date, 7);
      const { id, version, status, activityId, updatedAt, ...previous } =
        selected;
      const input = { ...previous, date, reason: text };
      execute("revise_session", input, () =>
        service.reviseSession(id, input, version, operation("move")),
      );
      return {
        text: `Moved “${selected.title}” to ${weekdays[targetDay]}, ${date}. I've recorded why we changed the accepted plan.`,
        actions,
      };
    }
    if (
      /\b(plan|propose|schedule)\b/.test(lower) ||
      /\b(hard|quality|intervals?)\b/.test(lower)
    ) {
      const days = /week|seven|7\s*days/.test(lower) ? 7 : 3;
      let input = trainingProposal(service, days, operation("skeleton"));
      if (/hard|quality|interval/.test(lower)) {
        const readiness = service.athlete().readiness;
        const daysSince = readiness
          ? (Date.parse(service.today()) - Date.parse(readiness.date)) /
            86400000
          : Infinity;
        if (
          (!readiness || daysSince > 2) &&
          !/two|back.to.back|consecutive/.test(lower)
        ) {
          execute(
            "record_question",
            { key: "readiness", date: service.today() },
            () =>
              service.askQuestion(
                `coach:readiness:${service.today()}`,
                "How were your sleep, soreness, and energy today?",
                5,
                operation("readiness"),
              ),
          );
          return {
            text: "Before we add intensity, use Daily check-in to tell me about sleep, soreness, and energy. I can keep the next days easy while we check that.",
            actions,
          };
        }
        const tomorrow = addDays(service.today(), 1);
        const hard: PlanInput = {
          date: tomorrow,
          sport: /bike|ride/.test(lower) ? "bike" : "run",
          intent: "quality",
          title: "A short quality session",
          durationSeconds: 1800,
          rpeTarget: 7,
          prescription:
            "10 minutes easy, 5 × 1 minute at RPE 7 with 1 minute easy, then 10 minutes easy.",
          reason:
            "A quality session you requested, with recovery checked against your log and plan.",
        };
        input = /two|back.to.back|consecutive/.test(lower)
          ? [hard, { ...hard, date: addDays(tomorrow, 1) }]
          : [hard];
      }
      if (!input.length)
        return {
          text: "Those days already have an accepted plan. Open a session to revise it, or tell me which one you'd like to move.",
          actions,
        };
      const state = service.state();
      const query = programQueryFromContext({
        today: state.today,
        athlete: state.athlete,
        block: state.block,
        races: state.races,
        activities: state.activities,
      });
      const example = retrievePrograms(query)[0];
      if (example) input = applyExample(input, example.workouts);
      const plan = execute("propose_plan", input, () =>
        service.proposePlan(input, operation("plan")),
      );
      const session = example?.workouts.find((item) => item.intent !== "rest");
      return {
        text: `Here's a proposal for ${plan.length === 1 ? "your next session" : `the next ${days} days`}:\n\n${plan.map((day) => `**${weekdays[dayOfWeek(day.date)]} · ${day.title}**${day.durationSeconds ? ` — ${formatDuration(day.durationSeconds)}, RPE ${day.rpeTarget}` : ""}\n${day.reason}`).join("\n\n")}\n\n${example ? `I used “${example.title}” only as a reference for the shape. Your log still decides the days.\n\n` : ""}${session ? `How to do ${session.name}:\n${session.prescription}\nSteps: ${formatWorkoutSteps(session)}\n\n` : ""}${!service.athlete().weeklyMinutes && !service.activities().length ? "What does a usual training week look like for you? " : ""}Accept it when it fits, or tell me what to change.`,
        actions,
      };
    }
    if (/\b(remember|preference|long.run.day|what.*know)\b/.test(lower)) {
      const athlete = service.athlete();
      return {
        text: `Your long-run day is ${weekdays[athlete.longRunDay]}.${athlete.restDays.length ? ` You rest on ${athlete.restDays.map((day) => weekdays[day]).join(" and ")}.` : " You haven’t chosen fixed rest days yet."}${athlete.weeklyMinutes ? ` Your usual week is ${athlete.weeklyMinutes} minutes.` : ""}\n\nThese preferences are saved with your training log.`,
        actions,
      };
    }
    if (/week|progress|summary|how.*doing/.test(lower)) {
      const state = service.state();
      return {
        text: state.stats.weeklyActivities
          ? `This week you've logged ${state.stats.weeklyActivities} session${state.stats.weeklyActivities === 1 ? "" : "s"} and ${formatDuration(state.stats.weeklySeconds)} of training.\n\nYour next step is a consistent, manageable plan. Ask me to plan your week, or tell me how your last session felt.`
          : "Your week starts with the first entry. Tell me what you've done—for example, “I ran 50 minutes easy, RPE 3”—and we'll build from there.",
        actions,
      };
    }
    return {
      text: "Let's make this useful for you. I can save your training preferences, log a workout, and propose your next three days or your week.\n\nTry “long run on Saturday,” “I ran 50 minutes easy, RPE 3,” or “plan my week.” You can also set your training background in Settings.\n\nI'm in guided mode for now. Connecting a model enables open-ended coaching.",
      actions,
    };
  } catch (error) {
    if (error instanceof DomainError)
      return { text: `Let's adjust that. ${error.message}`, actions };
    throw error;
  }
}
