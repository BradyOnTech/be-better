# Program library

Survey date: 2026-10-06. This note is the source record for `packages/domain/src/programs.ts`. The coach retrieves those cards with the athlete's log. The cards are not a second training log, and they are not permission to ignore a guardrail.

## What was stored

Each card is original prose: purpose, who it fits, how the weeks progress, how recovery is arranged, how to change a session, and a one-line picture of a week. The code cites the page the structure came from.

`packages/domain/src/workouts.ts` holds original example sessions for each card: a name, an effort, a duration range, and steps. Before a session is shown, the server scales the duration to the log. A long run becomes about ten minutes past the recent longest session, and never more than twenty. These sessions follow the shape of the cards. They are not a downloaded week from Hal Higdon, the B.A.A., British Cycling, REI, iRunFar, or the Tour du Mont Blanc framework.

The library covers base running, shorter road races, half marathons, marathons, trail races up to the marathon, a first 50K, longer ultras, an eight-week hike, a thru-hike, road endurance, and mountain biking.

## What was not stored

Published daily workouts were not copied.

The [Boston Athletic Association training page](https://www.baa.org/races/boston-marathon/info-for-athletes/boston-marathon-training/) says its plan material may not be reproduced or repurposed without the B.A.A.'s written consent. Hal Higdon publishes full weekly grids. British Cycling publishes session-by-session plans. Those grids are not in this repo. A card may say "about eighteen weeks, four runs, a stepback about every third week." An example session may say "run easy for about 60 minutes, conversational the whole way." It does not reproduce a published Tuesday.

A published peak, such as a 20-mile long run or a 6-hour ride, is treated as the destination of a block. The long-run guardrail still caps this week at 20 minutes past the recent longest session.

## Marathon

The B.A.A. page, read on 2026-10-06, describes four levels and four phases, and says the plans are a guide:

- Level one: about four days, peak weeks about 25 to 40 miles, long runs 16 to 18 miles.
- Level two: about five days, about 30 to 45 miles, long runs 18 to 20.
- Level three: about six days, about 35 to 55 miles, long runs near 20.
- Level four: about six or seven days, about 35 to 60 miles, long runs 20 to 22.
- Phases they name: 3-week prep, 6-week build, 9-week marathon-specific block, 2-week taper.
- Session kinds: easy (conversational), a controlled run a little quicker than easy, hills, shorter intervals, half-marathon pace, marathon pace, and a long run on rolling terrain. Strength or cross-training fills non-run days.

That shape is the `marathon-phased` card. The level is chosen from the athlete's current days and time, not from the goal time.

[Hal Higdon's marathon overview](https://www.halhigdon.com/training/marathon-training/) describes Novice 1 as a gently progressive four-day plan whose long run starts at 6 miles and peaks at 20 about three weeks out, with cross-training and rest to limit overtraining. Intermediate and advanced plans are a step up in difficulty.

- [Novice 1 marathon](https://www.halhigdon.com/training-programs/marathon-training/novice-1-marathon/): 18 weeks, four runs plus cross-training, two rest days, long run toward 20 miles in week 15, then a taper. He says the long run is the key and that about every third week steps back. Occasional other workouts can be skipped.
- [Novice 2 marathon](https://www.halhigdon.com/training-programs/marathon-training/novice-2-marathon/): the same eighteen-week, four-run shape, starting a bit longer and reaching the mid-teens sooner. Same stepback.
- [Novice base](https://www.halhigdon.com/training-programs/base-training/novice-base-training/): 12 weeks, four runs and a walk, longest workout about 6 miles, so a new runner can reach the first week of the novice marathon plan.
- [Intermediate 1 marathon](https://www.halhigdon.com/training-programs/marathon-training/intermediate-1-marathon/): five runs and one day off. The long run starts nearer 8 miles and reaches about 20 twice. A separate shorter run is often at marathon pace.
- [Novice post-marathon](https://www.halhigdon.com/training-programs/post-marathon-recovery/novice-post-marathon/): about five weeks, first days off, then easy running. A race five weeks later is not a reason to train hard in between.

## Half marathon and shorter races

[Novice 1 half marathon](https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/) is 12 weeks for someone who can already run about 3 to 4 miles. Four runs, cross-training, and strength. The long run grows from about 3 miles toward 10, then a short taper. Rest sits around the long run, and the long day can move.

The developing half card is a synthesis, labeled as one. It keeps Higdon's half-marathon long-run cap, and it uses the same step he describes between novice and intermediate marathon training: one separate steady session, not a second hard day glued to the long run. The B.A.A. page treats half-marathon pace as one session kind inside a larger week.

[Novice 15K and 10 mile](https://www.halhigdon.com/training-programs/15k-10-mile-training/novice-15k-10-mile/) is about ten weeks, three runs, strength, rest before the long session, longest workout about 8 miles. He calls the schedule a guide.

## Trail and ultra

[iRunFar, a newbie's guide to ultramarathons](https://www.irunfar.com/newbies-guide-to-ultramarathons), read via its article text on 2026-10-06:

- A first ultra is a 50K. Covering ultra distance in training is unnecessary risk.
- The long session to build toward is a weekly two-to-three-hour easy run, with hiking breaks. Time matters more than distance. Two or three other easy runs of 30 to 60 minutes fill the week. About four to six hours a week, held for a few months, is their bar for an easier 50K.
- A marathoner can keep marathon-like long-run distances. Trails take longer than the same road distance. Back-to-backs, if used for a longer race, come every two or three weekends in the peak, and the second day is about half to three quarters of the first.

[Endurance workouts for ultramarathon training](https://www.irunfar.com/endurance-based-workouts-for-ultramarathon-training) says back-to-backs are for races beyond 50K, should be progressed from short pairs, and should be spaced by about four to five weeks. A 50K does not need them.

[Hill and predictor workouts](https://www.irunfar.com/sprint-based-hill-and-predictor-workouts-for-ultramarathon-training) describes short uphill efforts with an easy jog down, and a dress rehearsal about four to six weeks out covering roughly 30 to 60 percent of the course, including terrain, kit, and fuel.

The trail-race card uses the time-on-feet and short-hill notes for events at or under the marathon. It does not use the back-to-back.

## Hiking

[REI, how to train for hiking](https://www.rei.com/learn/expert-advice/hiking-training.html): start about eight weeks out. Two nonconsecutive strength days, two rest days, three cardio days. In the last two weeks, cardio becomes hikes of an hour or more with a pack close to trip weight. Ease off in the last day or two. Change or skip anything that hurts. Their exercise list is not stored.

[REI, how to train for a thru-hike](https://www.rei.com/learn/expert-advice/thru-hiking-goal-training.html): about six months is a reasonable window for many people. Start with three or four aerobic days and at least one full rest day. Raise volume gradually. Progress from flat and unloaded, to steeper, to an empty pack, to part of the real weight. Strength twice a week with at least 48 hours between. The hike itself builds a lot of the fitness.

## Cycling

[British Cycling's training-plan index](https://www.britishcycling.org.uk/knowledge/training-plans) separates general fitness, road performance, time trial, and mountain bike. Road plans add speed and power on top of a base for a road race, sportive, or endurance event. Mountain-bike plans are their own category. Beginner, intermediate, and advanced hours on the general-fitness index run from about 6–8 hours through 10–12.

Their [six-week overview PDF](https://www.britishcycling.org.uk/zuvvi/media/bc_files/izonedocs/24nov/6_WEEK_TRAINING_PLAN_Overview.pdf) shows a week with a rest day, one threshold, over-under, or ramped day, a short leg-speed session, and a longer endurance ride with a little tempo. Weekly time rises across the build and then eases. The hour-by-hour grid is not stored.

Their [sportive plan note](https://www.britishcycling.org.uk/sportives/article/sp20130905--British-Cycling-Sportive-Training-Plans-0) says a beginner plan uses heart rate for a shorter event, and that more experienced riders spend about three months on a foundation before the work gets more specific.

The [Tour du Mont Blanc 2024 cycling framework](https://letourdumontblanc.fr/wp-content/uploads/sites/11/2023/11/TMB-training-plan-framework-2024.pdf) is the mountain-ride source: a long easy ride that can grow toward most of a day, one high-intensity session, most of the week easy, skills such as descending and cornering, and a recovery week every two or three weeks. It assumes about 10 to 15 hours for that tour. The card says that volume is not the default, and available hours cap the week. The framework also suggests fasted riding. That advice is not in the card.

## How retrieval uses this

The server scores cards by event, phase, experience, sport, weekly minutes, distance, and weeks until the event. Injury, a niggle, travel, a cutback, and a taper are written above the cards. The prompt carries the top two, and the full scaled steps of the closest card. `get_program_examples` returns up to three when the question is about a different event, including each session's steps. An injury flag leaves only easy, rest, and strength sessions. The Workouts screen lists the same sessions for browsing. It does not add a published week.

Tests in `packages/domain/src/programs.test.ts` lock the choice for the scenarios above. Tests in `apps/api/src/programs.test.ts` check that the prompt contains the chosen card, and that the server still refuses a hard day while injured, a long-run jump past 20 minutes, a hard day after a long day, and a long run in race week. Those checks do not call a live model. The examples do not override the guardrails.
