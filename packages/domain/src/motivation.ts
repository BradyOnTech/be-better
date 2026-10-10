import { z } from "zod";
import type { Activity } from "./index.js";

export const motivationThemes = [
  "hard-truth",
  "discipline",
  "identity",
  "long-game",
  "race-day",
  "recovery",
] as const;
export type MotivationTheme = (typeof motivationThemes)[number];
export const motivationThemeLabels: Record<MotivationTheme, string> = {
  "hard-truth": "Hard truth",
  discipline: "Discipline",
  identity: "Identity",
  "long-game": "Long game",
  "race-day": "Race day",
  recovery: "Recovery",
};
export const motivationMoods = [
  "summit",
  "night",
  "clay",
  "dawn",
  "moss",
  "fog",
] as const;
export type MotivationMood = (typeof motivationMoods)[number];

/** Card text wraps a highlighted phrase in *asterisks*. */
export interface DeckCard {
  id: string;
  theme: MotivationTheme;
  mood: MotivationMood;
  front: string;
  back: string;
}

export const motivationCardInputSchema = z.object({
  front: z.string().trim().min(1).max(160),
  back: z.string().trim().max(400),
  mood: z.enum(motivationMoods),
});
export type MotivationCardInput = z.infer<typeof motivationCardInputSchema>;
export type MotivationCard = MotivationCardInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
};
export const motivationKeepSchema = z.object({
  cardId: z.string().min(1).max(200),
  kept: z.boolean(),
});

/** All-time evidence from confirmed activities. */
export interface MotivationRecords {
  sessions: number;
  seconds: number;
  distanceMetres: number;
  climbMetres: number;
  longest: Activity | null;
  biggestClimb: Activity | null;
  hardest: Activity | null;
  streak: { weeks: number; since: string | null; thisWeek: boolean };
}
export interface MotivationState {
  cards: MotivationCard[];
  kept: string[];
  records: MotivationRecords;
}
export const emptyMotivation: MotivationState = {
  cards: [],
  kept: [],
  records: {
    sessions: 0,
    seconds: 0,
    distanceMetres: 0,
    climbMetres: 0,
    longest: null,
    biggestClimb: null,
    hardest: null,
    streak: { weeks: 0, since: null, thisWeek: false },
  },
};

export function plainCardText(text: string): string {
  return text.replace(/\*([^*]+)\*/g, "$1");
}

export const motivationDeck: DeckCard[] = [
  {
    id: "same-things",
    theme: "hard-truth",
    mood: "night",
    front:
      "Do you really expect life to get *better* when you do the *same things*?",
    back: "Same inputs, same outputs. Change one thing today: the alarm, the route, the excuse. Then keep it changed.",
  },
  {
    id: "train-hard",
    theme: "hard-truth",
    mood: "summit",
    front: "How do you expect to do *hard things* when you don’t *train hard*?",
    back: "Hard sessions are rehearsal. Find the next one in your week and show up for it like it’s the real thing.",
  },
  {
    id: "feel-like-it",
    theme: "hard-truth",
    mood: "clay",
    front: "Still waiting to *feel like it*?",
    back: "Feeling like it usually shows up about ten minutes in. Start anyway and let it catch up.",
  },
  {
    id: "which-day",
    theme: "hard-truth",
    mood: "night",
    front: "If not today, then *which day*, exactly?",
    back: "Name it and put it in your week. A day you can’t name is a day that never comes.",
  },
  {
    id: "reason-or-excuse",
    theme: "hard-truth",
    mood: "fog",
    front: "Is that a *reason*, or an *excuse* you’ve gotten good at?",
    back: "A reason changes the plan. An excuse just cancels it. If it’s real, shorten the session instead of skipping it.",
  },
  {
    id: "bet-on-you",
    theme: "hard-truth",
    mood: "dawn",
    front: "Would you *bet on* the person you were this week?",
    back: "Then give them better odds. One honest session moves the line.",
  },
  {
    id: "mondays",
    theme: "hard-truth",
    mood: "moss",
    front: "How many more *Mondays* are you going to start on?",
    back: "Start on a Thursday. Start at 4:40 in the afternoon. Start now. The calendar was never the problem.",
  },
  {
    id: "the-reps",
    theme: "hard-truth",
    mood: "summit",
    front: "You want the result. Do you want the *reps*?",
    back: "Results are just reps you can finally see. Fall for the reps and the result shows up on its own.",
  },
  {
    id: "tired-or-comfortable",
    theme: "hard-truth",
    mood: "dawn",
    front: "Tired, or just *comfortable*?",
    back: "Real fatigue needs rest, so take it without guilt. Comfort needs a push. Be honest about which one this is.",
  },
  {
    id: "talked-enough",
    theme: "hard-truth",
    mood: "clay",
    front: "You’ve *talked about it* enough.",
    back: "The plan is ready. The shoes are ready. The only part left is the part you can’t talk your way through.",
  },
  {
    id: "lace-your-shoes",
    theme: "discipline",
    mood: "night",
    front: "Nobody is coming to *lace your shoes*.",
    back: "Not your coach, not your plan, not this app. That part is yours. It always was.",
  },
  {
    id: "front-door",
    theme: "discipline",
    mood: "dawn",
    front: "The hardest part of the run is the *front door*.",
    back: "So make the door easy. Clothes out tonight, shoes by the mat. Decide now, not at 6 a.m.",
  },
  {
    id: "mood-vote",
    theme: "discipline",
    mood: "fog",
    front: "Your mood doesn’t get a *vote*.",
    back: "Your body does. Pain, illness, and real exhaustion get a say. Your mood can come along for the ride.",
  },
  {
    id: "twenty-minutes",
    theme: "discipline",
    mood: "moss",
    front: "*Twenty minutes* still counts.",
    back: "On days you can’t do it all, do some. A short session keeps the habit alive. A skipped one teaches you to skip.",
  },
  {
    id: "promises",
    theme: "discipline",
    mood: "summit",
    front: "Keep the *promises* you make to yourself.",
    back: "Every time you do what you said you’d do, you trust yourself a little more. That trust is the whole game.",
  },
  {
    id: "dark-cold-early",
    theme: "discipline",
    mood: "night",
    front: "It’s dark. It’s cold. It’s early. *Go anyway.*",
    back: "Nobody remembers the mornings they slept in. You’ll remember this one.",
  },
  {
    id: "boring-miles",
    theme: "discipline",
    mood: "fog",
    front: "*Boring* miles build the engine.",
    back: "Easy days aren’t wasted days. They’re where your aerobic base gets built. Run them easy, and run them anyway.",
  },
  {
    id: "kept-running",
    theme: "identity",
    mood: "clay",
    front: "Runners are just people who *kept running*.",
    back: "There’s no test and no membership card. You run, so you’re a runner. Today counts too.",
  },
  {
    id: "goes-anyway",
    theme: "identity",
    mood: "summit",
    front: "Be the one who *goes anyway*.",
    back: "Rain, wind, a rough day at work. The people you admire go anyway. You can be one of them by tomorrow morning.",
  },
  {
    id: "old-you",
    theme: "identity",
    mood: "night",
    front: "The *old you* would skip this one.",
    back: "That’s exactly why you won’t.",
  },
  {
    id: "act-like-it",
    theme: "identity",
    mood: "moss",
    front: "You’re not trying to be an athlete. You *are* one. *Act like it.*",
    back: "Athletes sleep, eat, warm up, and show up. Pick one of those and do it like a pro today.",
  },
  {
    id: "nobody-watching",
    theme: "identity",
    mood: "clay",
    front: "Nobody’s *watching*. Good.",
    back: "The work nobody sees is the work that changes you. Do this one for the person in the mirror.",
  },
  {
    id: "head-start",
    theme: "identity",
    mood: "dawn",
    front: "Talent is a head start. *Showing up* is the whole race.",
    back: "Most people quit long before talent matters. Outlast them.",
  },
  {
    id: "slow-money",
    theme: "long-game",
    mood: "moss",
    front: "Fitness is *slow money*. Keep depositing.",
    back: "One run won’t change you. Three hundred will. Every session is a deposit, and the interest compounds.",
  },
  {
    id: "then-another",
    theme: "long-game",
    mood: "fog",
    front: "One good day. *Then another.*",
    back: "That’s the whole plan. Don’t carry the whole season today. Just this one.",
  },
  {
    id: "bad-runs-count",
    theme: "long-game",
    mood: "clay",
    front: "Bad runs *count*.",
    back: "Heavy legs, slow splits, walked the hills: logged. The ones that felt awful often did the most.",
  },
  {
    id: "building",
    theme: "long-game",
    mood: "dawn",
    front: "You’re not behind. You’re *building*.",
    back: "Fitness takes months, not weeks. Compare yourself to last year, not to someone else’s highlight reel.",
  },
  {
    id: "dont-miss-two",
    theme: "long-game",
    mood: "summit",
    front: "Missed a day? *Don’t miss two.*",
    back: "One miss is life. Two is the start of a new habit. Come back with something small today.",
  },
  {
    id: "thank-yourself",
    theme: "long-game",
    mood: "fog",
    front: "Someday you’ll *thank yourself* for this one.",
    back: "Or you’ll wish you’d gone. Only one of those feels good.",
  },
  {
    id: "the-receipt",
    theme: "race-day",
    mood: "night",
    front: "Race day is just the *receipt*.",
    back: "You pay for it in advance, one early morning and one long run at a time. Then you go collect.",
  },
  {
    id: "start-line",
    theme: "race-day",
    mood: "summit",
    front: "The start line is *earned* months before you stand on it.",
    back: "Every session between now and then decides how that morning feels.",
  },
  {
    id: "last-hard-mile",
    theme: "race-day",
    mood: "clay",
    front: "Somewhere out there, *the last hard mile* is waiting for you.",
    back: "Train for that version of you: tired, alone, and still moving forward. Today is how you meet them ready.",
  },
  {
    id: "hills",
    theme: "race-day",
    mood: "moss",
    front: "Hills don’t get *smaller*. You get *stronger*.",
    back: "Walk them if you need to. Come back next week and walk a little less.",
  },
  {
    id: "rest-is-work",
    theme: "recovery",
    mood: "dawn",
    front: "Rest is part of the *work*.",
    back: "Training breaks you down. Recovery builds you back stronger. Skipping rest doesn’t make you tougher. It makes you slower.",
  },
  {
    id: "not-ignoring-pain",
    theme: "recovery",
    mood: "fog",
    front: "Tough isn’t the same as *ignoring pain*.",
    back: "Discomfort is training. Sharp or worsening pain is information. Stop, and get it checked by someone who can assess it.",
  },
  {
    id: "sleep",
    theme: "recovery",
    mood: "night",
    front: "Your best recovery tool is *free*. It’s called sleep.",
    back: "A full night does more for your next run than any gadget. Go to bed like it’s part of the plan. It is.",
  },
  {
    id: "easy-days-easy",
    theme: "recovery",
    mood: "moss",
    front: "Run easy days *easy* so hard days can be *hard*.",
    back: "Most of your training should feel comfortable. That isn’t lazy. That’s how endurance gets built.",
  },
];
