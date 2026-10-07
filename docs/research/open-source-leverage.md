# Open-source leverage for a personal endurance coach

Survey date: 2026-10-06. Stars and last-push dates are from the GitHub API that day. This is a starting map for a chat-first PWA, not a decision to adopt any of these apps.

## Recommendation

Build a small app. Do not fork a Strava-style tracker or a general chat product.

The product is three layers that existing projects keep separate:

1. A structured training log (activities, plans, athlete profile). This is the source of truth.
2. A coach that talks, asks, and edits the plan. The useful open-source work here is prompts, guardrails, and periodization data, mostly living inside coding agents.
3. Imports. File parsers for FIT, GPX, and TCX when a device syncs. A vision model plus a confirmation step when the only record is an iPhone photo. No maintained project parses treadmill or watch summary screenshots into completed workouts.

Agent memory (OptMem, Mem0, Letta, Cognee, Graphiti) is a journal of decisions and preferences. It is a poor place to store the workout log.

## Closest coaching projects

These match the behavior, and they are not PWAs.

### [mmornati/ai-running-coach](https://github.com/mmornati/ai-running-coach)

MIT. About 20 stars. Pushed 2026-10-05. Python agents and skills for Claude Code, Copilot, Cursor, and similar IDEs. French by default.

What it already does that this app wants: a coach that plans today and the week, periodization templates (road marathon through 100 miles) checked by guardrails, a local fitness/fatigue dashboard, post-session analysis, and a decision log of what happened after the coach's advice. Data sources are Garmin Connect, Intervals.icu, or Strava. Photo support is shoe inspection, not a workout-summary screenshot.

Borrow the coaching shape and the guardrail idea. Do not install it as the product. It assumes an IDE session and a watch account.

### [felixrieseberg/claude-coach](https://github.com/felixrieseberg/claude-coach)

MIT. About 194 stars. Pushed 2026-10-05. TypeScript. A Claude skill plus a local plan viewer. Plans stay in the browser. Workouts export to `.ics`, Zwift `.zwo`, Garmin `.fit`, and `.mrc`. The skill can sync Strava into `~/.claude-coach/coach.db` or take fitness numbers by hand, which is the same hole as a treadmill run that never syncs. It depends on `@garmin/fitsdk`.

Borrow the plan document, the manual-data path, and the export formats. It generates a plan. It is not an ongoing coach over a growing log.

### [leonzzz435/garmin-ai-coach](https://github.com/leonzzz435/garmin-ai-coach)

MIT. About 152 stars. Pushed 2026-01-31, so it has been quiet for months. Python, LangGraph. A CLI that reads Garmin Connect and writes an HTML analysis plus a season plan and a 28-day plan. Optional human-in-the-loop questions. Metrics include chronic/acute load and ACWR.

Useful as a picture of a multi-step coaching pipeline. Not a daily chat surface, and not recently maintained.

### [barcia/running-coach-skill](https://github.com/barcia/running-coach-skill)

GPL-3.0. About 5 stars. Pushed 2026-05-07. A skill with an `ATHLETE.md` profile, periodized plans, and post-workout feedback. Small, but the profile-file idea is the right grain for athlete memory.

## Activity logs

These own the data. None of them is a coach.

| Project | License | Stars | Last push | Fit |
| --- | --- | --- | --- | --- |
| [endurain-project/endurain](https://github.com/endurain-project/endurain) | AGPL-3.0 | ~2.2k | 2026-10-01 | Self-hosted activity vault. Vue 3, FastAPI, PostgreSQL. Strava and Garmin sync. GPX, TCX, FIT import. [The project is in a feature freeze](https://endurain.com/) while it hardens internals (announced 2026-05-23). |
| [SamR1/FitTrackee](https://github.com/SamR1/FitTrackee) | AGPL-3.0 | ~1.2k | 2026-09-26 | Outdoor tracker. Flask and Vue. Primary repo is on Codeberg. GPX and a workout without a file. Thinner than Endurain. |
| [wger-project/wger](https://github.com/wger-project/wger) | AGPL-3.0 | ~7.0k | 2026-10-05 | Gym routines, nutrition, body weight. Wrong sport. |
| [GoldenCheetah/GoldenCheetah](https://github.com/GoldenCheetah/GoldenCheetah) | GPL-2.0 | ~2.2k | 2026-10-05 | Desktop performance lab for cycling, running, and triathlon. The training-load math lives here. The app does not. |
| [thomaschampagne/elevate](https://github.com/thomaschampagne/elevate) | MPL-2.0 | ~1.5k | 2025-08-31 | Fitness and fatigue trends on top of Strava. TypeScript. Strava-bound, and quieter. |
| [yihong0618/running_page](https://github.com/yihong0618/running_page) | MIT | ~4.5k | 2026-09-23 | Static personal homepage fed by Strava or Garmin sync scripts. A viz pattern, not a coach. |
| [Runalyze/Runalyze](https://github.com/Runalyze/Runalyze) | archived | ~226 | archived 2019-11-09 | The open-source app was discontinued. The hosted product is still active and ships an [MCP server](https://github.com/Runalyze/mcp-server) (MIT, 0 stars, pushed 2026-08-18) for an existing account. |

AGPL and GPL matter if this app is ever shared or hosted for anyone else. Self-hosting Endurain or FitTrackee as a private vault is fine. Folding one of them into a custom coach drags the whole service under that license. For a personal tool that should stay easy to reshape, keep those apps beside the coach or leave them.

Intervals.icu is not open source. Its [personal API](https://forum.intervals.icu/t/api-access-to-intervals-icu/609) already computes training load, wellness, and planned workouts. A typed client exists at [yerzhansa/intervals-icu-api](https://github.com/yerzhansa/intervals-icu-api) (MIT, small). [hhopke/intervals-icu-mcp](https://github.com/hhopke/intervals-icu-mcp) (MIT, ~87 stars, pushed 2026-10-05) is the agent-facing version. Use the API as an optional import, not as the app.

## Files and sync

- [jimmykane/fit-parser](https://github.com/jimmykane/fit-parser). MIT (the license file carries the 2015 Pierre Jacquier notice). TypeScript FIT parse and encode. Pushed 2026-10-02. The parser to prefer if the app is JavaScript.
- [garmin/fit-javascript-sdk](https://github.com/garmin/fit-javascript-sdk). Official SDK, pushed 2026-10-06. The [license](https://github.com/garmin/fit-javascript-sdk/blob/master/LICENSE.txt) is Garmin's FIT agreement: internal use, no sublicensing, and a ban on folding the SDK into a copyleft license. Fine for a private tool. Awkward if the app is published.
- [polyvertex/fitdecode](https://github.com/polyvertex/fitdecode). MIT. Python. Pushed 2025-08-06.
- [sports-alliance/sports-lib](https://github.com/sports-alliance/sports-lib). AGPL-3.0. TypeScript. Normalizes GPX, TCX, and FIT. Pushed 2026-10-06. Strong model, copyleft.
- [stravalib/stravalib](https://github.com/stravalib/stravalib). Apache-2.0. Official Strava API client. Pushed 2026-10-05.
- [cyberjunky/python-garminconnect](https://github.com/cyberjunky/python-garminconnect). MIT. Unofficial Garmin Connect wrapper, ~3.1k stars, pushed 2026-09-29. Convenient and outside Garmin's supported API. Prefer file import or an official API when one is available.

## Screenshot to workout

Nothing maintained is worth adopting.

- [maidi29/ai-run-workout-builder-garmin](https://github.com/maidi29/ai-run-workout-builder-garmin) turns text or a screenshot into a *planned* Garmin workout. 2 stars. The opposite direction (a prescription, not a completed session).
- [INO95/health-recovery-tracker](https://github.com/INO95/health-recovery-tracker) OCRs gym-set screenshots. 0 stars.
- [erikkessler1/erg-ocr](https://github.com/erikkessler1/erg-ocr) is a class project for Concept2 digit reading.

The practical path is a vision model, a strict schema (sport, date, duration, distance, pace or power, heart rate, notes, confidence), and a card the athlete confirms before the row is saved. Keep the photo.

## Chat surface

[assistant-ui/assistant-ui](https://github.com/assistant-ui/assistant-ui) is an MIT React chat library, ~12.4k stars, pushed 2026-10-06. Use it, or a thinner chat on the Vercel AI SDK, as a component. Do not fork LibreChat, Open WebUI, or LobeChat. Those are general chat products.

The coach's questions are a tool and a rubric, not a library. Give the model tools such as `get_recent_training`, `propose_plan`, `revise_plan`, `log_workout`, and `ask_athlete`, and tell it which gaps are worth a question (pain, sleep, RPE, why a session was missed, a race date that is still blank). [garmin-ai-coach](https://github.com/leonzzz435/garmin-ai-coach) and [ai-running-coach](https://github.com/mmornati/ai-running-coach) both already pause for the athlete. Copy that behavior.

## Memory

[VictorTaelin/OptMem](https://github.com/VictorTaelin/OptMem) (~2.0k stars, pushed 2026-07-31) is a single Python file, no dependencies, aimed at coding agents. `memo note` stores one line of at most 280 bytes. `memo wake` prints a budget of recent lines plus hierarchical summaries. `memo recall` is a regex over the log. The repo has no `LICENSE` file (GitHub returns 404 for it), so treat reuse as undecided until that is settled.

That design fits a coach that lives in a terminal session. It does not fit as the training database. A 280-byte note cannot hold a workout stream, regex cannot answer "long runs in the last six weeks," and a summary tree does not supersede facts cleanly when FTP, zones, or an injury change.

Heavier options, if a table of notes is no longer enough:

| Project | License | Stars | Pushed | Shape |
| --- | --- | --- | --- | --- |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | Apache-2.0 | ~67k | 2026-10-06 | Drop-in fact memory. Latest fact wins. Easy, and the wrong default for a log you can already query. |
| [topoteretes/cognee](https://github.com/topoteretes/cognee) | Apache-2.0 | ~31k | 2026-10-06 | Graph over documents and conversations. |
| [getzep/graphiti](https://github.com/getzep/graphiti) | Apache-2.0 | ~31k | 2026-10-06 | Temporal knowledge graph. The one that matches "this was true until Tuesday." |
| [letta-ai/letta](https://github.com/letta-ai/letta) | Apache-2.0 | ~25k | 2026-09-10 | The agent runtime owns its memory. High lock-in for a personal PWA. |

Start with three tables: activities, plan days, and coach notes (decisions, answers, preferences, each with a date). Add a memory library only when those notes get too messy to retrieve.

## What to read next, in order

1. `ai-running-coach` skills for `/today`, `/week`, and the periodization guardrails.
2. `claude-coach` `skill/SKILL.md` for the manual-data interview and the plan schema.
3. `jimmykane/fit-parser` if file import is in the first slice.
4. Leave Endurain, FitTrackee, wger, GoldenCheetah, and OptMem as references.
