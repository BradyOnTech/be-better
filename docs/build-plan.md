# Build plan: personal endurance coach

Date: 2026-10-06. This is the implementation plan that follows `docs/research/open-source-leverage.md`. The survey decided what to borrow. This document decides how to build it.

The product is a phone-first progressive web app. The home screen is a conversation with a coach. The coach plans today, tomorrow, and the week, changes the plan when you talk, and reads a training log you own. A workout that never syncs arrives as an iPhone photo, gets parsed, and is saved only after you confirm it.

Implementation started on 2026-10-06. All phases are implemented, with Intervals.icu chosen for optional sync. The model connection now uses the official local Codex app-server with a ChatGPT subscription, as requested. [Implementation status](implementation-status.md) records application checks, live subscription validation, and the user's successful real iPhone installation and offline photo retry. [Self-hosting](self-hosting.md) describes setup and operation.

## Locked decisions

These come from the survey. Later sections treat them as given.

1. The app is ours. Endurain, FitTrackee, wger, GoldenCheetah, and general chat products stay references. None of them is the coach, and their licenses (AGPL, GPL) would wrap every customization if we built inside them.
2. The training log is the memory. Activities, plan days, and dated coach notes live in a database. OptMem, Mem0, Letta, Cognee, and Graphiti are not in the first build. OptMem also has no `LICENSE` file.
3. Coaching behavior is adapted from [ai-running-coach](https://github.com/mmornati/ai-running-coach) (day and week flow, periodization, guardrails, a decision log) and [claude-coach](https://github.com/felixrieseberg/claude-coach) (plan shape, the interview when no device data exists, later export to calendar and workout files). We copy ideas and write our own prompts. We do not vendor either repo.
4. File import uses [fit-parser](https://github.com/jimmykane/fit-parser) (MIT). Garmin's official FIT SDK stays out, because its license is internal-use and forbids folding the SDK into a copyleft project. If this app is ever published, that SDK is a liability.
5. A photo becomes a workout through a vision model, a strict schema, and a confirmation card. There is no open-source screenshot parser worth adopting.
6. The chat UI is a component, [assistant-ui](https://github.com/assistant-ui/assistant-ui) on the Vercel AI SDK, with tools the model can call.
7. Strava and Intervals.icu are optional imports in a later phase. `python-garminconnect` stays out. It sits outside Garmin's supported API.

## Defaults for the choices we had not locked

Change these and the plan still holds. They are defaults so the first slice can be built.

| Choice                           | Default                                             | Why                                                                                                                                     |
| -------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Where the coach lives            | The PWA only                                        | You asked for a phone app you open and talk to. A terminal agent is a second product.                                                   |
| Who it is for                    | One athlete                                         | No accounts, no followers, no roles.                                                                                                    |
| First data sources               | Typed entry, photo, and a file drop                 | These cover treadmill runs and any device that can export FIT, GPX, or TCX. Sync waits until the log and the coach are real.            |
| Where data lives                 | SQLite on a small server the phone can reach        | The laptop and the phone then share one log. A copy of the database file is the backup.                                                 |
| How the phone reaches the server | Tailscale, or the same Wi-Fi, in v1                 | A personal app does not need a public login.                                                                                            |
| Model                            | ChatGPT subscription through local Codex app-server | Official sign-in, isolated credentials, streamed messages, and the same validated application tools. API-key providers remain optional. |
| Units                            | Stored as metres and seconds                        | The UI speaks miles or kilometres from a preference.                                                                                    |
| Sports in v1                     | Run, trail run, bike                                | Ultra is a long run with extra fields, not a separate sport. Strength is a note on a day, not a set tracker.                            |

## What we take from each project

| From                                  | Take                                                                                                                                                                                                                     | Leave                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `ai-running-coach`                    | The shape of a day and a week. Phases: base, build, specific, taper, recovery. A decision note written when the plan changes. Guardrails that refuse a hard day on top of a hard day.                                    | The IDE install, Garmin MCP, French-first docs, shoe-photo flow.        |
| `claude-coach`                        | A plan made of dated workouts with a target and a reason. An interview that asks for recent volume, a long run, and a race date when the log is empty. Later: `.ics` export, then Zwift `.zwo` and Garmin workout files. | The Claude skill runner, `@garmin/fitsdk`, the generated static viewer. |
| `fit-parser`                          | Parse and, later, encode FIT files.                                                                                                                                                                                      | Encoding workout files in v1.                                           |
| `assistant-ui` + AI SDK               | The thread, streaming, and tool calls.                                                                                                                                                                                   | Their example apps.                                                     |
| Endurain, FitTrackee                  | A checklist of activity fields worth having: sport, times, distance, elevation, heart rate, gear.                                                                                                                        | Their servers, UI, and AGPL code. Read them. Do not copy source.        |
| GoldenCheetah, Elevate                | Names and formulas for a later training-load pass: TRIMP, HRSS, CTL, ATL, TSB.                                                                                                                                           | The applications.                                                       |
| Intervals.icu API, `stravalib`        | A later optional importer.                                                                                                                                                                                               | Making either one the system of record.                                 |
| OptMem and the other memory libraries | Nothing in v1. Revisit Graphiti only if dated notes become hard to retrieve.                                                                                                                                             |                                                                         |

Attribution: if a prompt or a numeric guardrail is adapted from an MIT file, keep a short comment with the repo URL and the SPDX id. Do not paste AGPL or GPL source in.

## System

```text
iPhone (installed PWA)                Laptop browser
  chat, camera, file pick               same UI
        \                               /
         \--------- HTTPS ------------/
                       |
              Hono API  (one process)
              |-- coach tools
              |-- vision parse
              |-- FIT / GPX / TCX
              |-- SQLite file
              |-- photo and file blobs on disk
                       |
              model provider (chat + vision)
```

One TypeScript repo. The API process owns the local Codex connection; Codex manages subscription credentials in an isolated directory. The phone receives no OAuth token or model API key. Optional API-key providers keep their keys on the server.

```text
apps/web          Vite, React, assistant-ui, PWA manifest
apps/api          Hono, AI SDK, tools, guardrails, Drizzle, SQLite migrations
packages/domain   Zod types shared by web and api
apps/api/src/import   FIT, GPX, TCX and photo drafts to the activity schema
```

The domain package is the seam. The web app and the API both import the same Zod types for an activity, a plan day, a draft parse, and a coach tool result. UI code does not invent a second shape.

### Why a server, for a personal app

The model connection, photo bytes, and log need one home that both the phone and laptop can see. SQLite on a machine you already leave on is that home. The PWA is the client. Subscription coaching uses a local stdio app-server on that machine, rather than remote WebSocket transport.

Offline behavior in v1 is honest and small. The installed shell opens with no network and shows the last plan and the last few messages from a cache. A photo taken offline sits in an outbox in the browser and uploads when the server is reachable. The coach does not answer offline.

### Reachability

Bind the API to localhost plus private Tailscale Serve. No public signup or password store in v1; tailnet access is sufficient for that configuration. `AUTH_TOKEN` is optional on loopback and required for direct network binding. If configured, the PWA sends it as a bearer token kept in local storage. A future public deployment requires a real login.

## Domain

All timestamps are stored in UTC. Plan days use a civil date in the athlete's timezone (`America/Chicago` initially, editable in Settings).

### Athlete

One row.

- Display name, timezone, unit system (`mi` or `km`).
- Weekly shape: which days can be long, which days are rest, how many hours are available.
- Heart-rate zones, pace zones, and power zones. Each zone is a named band with a low and a high. Empty zones are allowed. The coach asks before it invents paces from nothing.
- Thresholds when known: threshold pace, lactate-threshold heart rate, FTP. Each has a `source` of `tested`, `estimated`, or `told`, and a date.
- Current constraints: a free-text line plus an optional structured flag (`niggle`, `injury`, `travel`, `none`), a body region, and a date.

### Race

- Name, sport (`run`, `trail`, `bike`), date, distance in metres, elevation gain in metres when known.
- Priority `A`, `B`, or `C`.
- Goal: finish, time, or a sentence.
- Terrain notes for trail and ultra: night sections, cutoffs, mandatory kit. Free text in v1.

An ultra is a `trail` or `run` race whose distance is long. The coach changes the plan shape from the distance and the priority, not from a separate sport enum.

### Activity

The completed workout. This is the source of truth. The chat is not.

- Sport: `run`, `trail`, `bike`, `walk`, `strength`, `other`.
- Start time, duration in seconds, moving time in seconds, distance in metres, elevation gain in metres.
- Average and max heart rate, average power, normalized power, cadence. All optional.
- RPE from 1 to 10, a one-line feel, a pain note.
- Source: `manual`, `photo`, `file`, and later `strava` or `intervals`.
- `confirmed`: false until you accept a photo parse or a file import you have looked at. Typed entries are confirmed immediately.
- `confidence`: the parser's own number, only for photos.
- Links to the original photo or file on disk.
- The raw parse JSON, so a bad confirm can be inspected.
- Optional link to the plan day it satisfied.

Streams (per-second heart rate, pace, power) are not in v1. The original file is kept so a later phase can parse them without asking you to upload again.

### Plan

A block is a span of weeks aimed at one A race, or at general preparation when no race is set.

- Phase: `base`, `build`, `specific`, `taper`, `recovery`.
- Start date, end date, race id when there is one.
- Target weekly duration, and a note about the long session.

A plan day is one civil date.

- Sport, or `rest`.
- Intent: `rest`, `easy`, `long`, `quality`, `endurance`, `hills`, `back-to-back`, `race`, `strength`.
- Status: `proposed`, `accepted`, `done`, `skipped`, `moved`.
- A short title and a prose prescription the chat can read aloud.
- Steps, when the workout is structured. A step has a kind (`warmup`, `work`, `recover`, `cooldown`, `free`), a duration in seconds or metres, an optional repeat count, and an optional target band (pace, heart rate, power, or RPE).
- The coach's one-line reason, written at proposal time.
- The activity id, once something is logged against that day.

Proposed days are visible and labeled as proposals. The coach may revise a `proposed` day freely. Changing an `accepted` day requires the conversation to say what changed and why, and writes a coach note. A `done` day is history. The coach adds a new day or marks a miss. It does not rewrite the prescription after the fact.

### Coach note

The journal OptMem would have been.

- Time, kind (`decision`, `answer`, `preference`, `observation`, `question`).
- Text, one to a few sentences.
- Optional links to an activity, a plan day, or a race.
- For a question: `answered` or still open, and the answer text.

Preferences ("long run on Saturday", "no track access in November", "keep the bike conversational") are notes with kind `preference`. The coach reads the latest of these on every turn. When a preference changes, the new note is added and the old one stays. Retrieval is "latest preference of this kind," not a summary tree.

### Chat

- One thread in v1.
- Messages with role, text, and the tool calls and tool results beside them.
- Keeping tool results means a later turn can show why a workout was prescribed.

## The coach

Each user message runs one model call with tools. The server assembles the context. The model does not receive the whole log.

### Context, every turn

Packed into the system prompt, and kept small:

1. Athlete row: zones, thresholds, constraints, unit preference, available days.
2. Open questions.
3. The latest preferences and the latest injury or niggle note.
4. Races in the next 24 weeks, plus the last A race if it was recent.
5. The plan for the previous 3 days and the next 14 days.
6. A rollup of the last 28 days: duration and distance by sport, longest run, number of quality sessions, count of unconfirmed drafts.
7. The last 14 activities as one line each: date, sport, duration, distance, RPE, pain, whether it matched a plan day.
8. Session load for those 14 activities, and the 7-day and 28-day sums described under Metrics.
9. One or two program examples chosen for the current race, phase, weekly time, and constraint. The rest of the library stays behind `get_program_examples`.

If the model needs more, it calls a tool. It does not get a second copy of the log stuffed into the prompt "just in case."

### Tools

All tools validate with the domain Zod schemas. Writes go through the API, in a transaction.

| Tool                    | Effect                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_activities`        | Filter by sport and date range. Returns the one-line shape, with an id.                                                                                                                               |
| `get_program_examples`  | Return up to three curated program patterns, each with original example workouts scaled to the log, plus the situation rules that override them.                                                      |
| `resolve_activity_plan` | Record an explicitly stated completed/modified/replaced/additional relationship for a confirmed activity and the current scheduled session version; preserve prescription, actual, and decision note. |
| `get_activity`          | One activity, including the prescription it was matched to and the pain note.                                                                                                                         |
| `get_plan`              | Plan days between two dates, plus the active block.                                                                                                                                                   |
| `log_activity`          | Insert a confirmed manual activity. Use this when you typed the workout in chat.                                                                                                                      |
| `save_photo_draft`      | Insert an unconfirmed activity from a parse. The server calls this, not the model, after the vision step. The model can read the draft.                                                               |
| `confirm_activity`      | Set `confirmed` after you accept the card. Can also apply your edits (distance, duration, sport, date).                                                                                               |
| `discard_draft`         | Delete an unconfirmed photo or file draft you rejected.                                                                                                                                               |
| `propose_plan_days`     | Insert or replace `proposed` days. Refuses a write that breaks a guardrail. Returns the refusal to the model so it can explain or ask.                                                                |
| `revise_plan_day`       | Edit one day. If the day was `accepted`, also write a `decision` note.                                                                                                                                |
| `accept_plan_days`      | The UI moves days from `proposed` to `accepted` after you press Accept. This is not exposed as a model tool.                                                                                          |
| `record_note`           | Append a decision, preference, observation, or answer.                                                                                                                                                |
| `record_question`       | Append an open question. The UI can show it as a chip.                                                                                                                                                |
| `resolve_question`      | Mark a question answered and store the answer as a note.                                                                                                                                              |

The model does not delete confirmed activities. A bad log is corrected by an edit tool, added in the same phase as `log_activity`, which writes a note with the previous values.

### When it must ask

At most two questions in a turn. One is the usual case. The server adds a line to the system prompt with the highest-priority gap it already knows about, so the model does not have to rediscover it.

Priority, high to low:

1. A pain note on the latest activity, or a constraint flagged `injury`, with no follow-up note since.
2. An A race inside 16 weeks and no plan block.
3. A quality session or a long session logged with no RPE.
4. An accepted key day (long or quality) that is still empty the day after.
5. You are asking for a hard day and there is no readiness note in the last two days (sleep, soreness, mood).
6. Empty pace zones, and the next proposal would prescribe paces.

The question is specific. "How did the right knee feel on the cooldown?" is a question. "How is training going?" is not. If you already answered in the message, the model resolves the question and does not ask it again.

### Guardrails

`propose_plan_days` and `revise_plan_day` run these in code. The model is told the same rules so it can explain a refusal. The code is what holds.

- Two days in a row both marked `quality` are rejected.
- A `quality` day the day after a `long` day is rejected.
- A `long` run more than 20 minutes longer than the recent longest run is rejected. With no log, use an explicitly supplied recent baseline. There is no model override.
- More than two `quality` days in a Monday-Sunday week are rejected.
- Every fourth week of a `build` or `specific` block is a cutback: weekly duration at most 80 percent of the previous week.
- Taper weeks drop duration. One short quality session may remain. A long run in the final week before an A race is rejected.
- A hard run and a hard ride on the same day are rejected. A hard run the day after a hard ride is rejected.
- When the current constraint is `injury`, only `rest`, `easy`, or `strength` may be proposed.
- A proposal that names a pace, heart rate, or power outside the stored zones is rejected. If the zones are empty, the proposal must use RPE, and the coach asks for a recent race or a threshold before the next quality day.
- The tool rejects a write that marks an activity confirmed. Confirmation is the card in the UI.

Ultra-specific rules, used when the A race is longer than a marathon:

- The long work can be a back-to-back: a long day and an `easy` or `endurance` day the day after, both linked in the reason line.
- Time on feet is the volume the guardrail watches, with distance as a secondary number.
- Night sections, cutoffs, and kit stay in the race notes until a later phase. The coach may mention them. It does not invent a night-pace model in v1.

Bike-specific rules:

- An endurance ride is `endurance`, not `long`, so it does not consume the long-run slot.
- Quality on the bike counts toward the two-quality weekly cap across both sports.

### What the coach is for, in a turn

The system prompt tells the model to do one of these, in order, and then stop:

1. If the message includes a new photo or a new file, wait for the draft card. Talk about the draft. Do not also rewrite the week.
2. If something is unconfirmed, finish that before planning.
3. If a high-priority question is open, ask it, unless the message already answers it.
4. If you asked for a plan or a change, call the plan tools, then summarize the days in plain language with the reason.
5. Otherwise answer from the context, and call `get_activities` or `get_plan` when the context is not enough.

The reply names the numbers it used: last long run, this week's duration, the race date. It does not invent a completed workout.

### Periodization, v1

When an A race exists, the block is built backward from race day.

| Weeks out           | Phase      | Shape                                                                                                                                                                                    |
| ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Race week           | `taper`    | Short, one brief quality touch early in the week, then rest into the race.                                                                                                               |
| 2 to 3              | `taper`    | Volume down, a little intensity kept.                                                                                                                                                    |
| 4 to 8              | `specific` | The long session resembles the race. Road marathon: the long run gets some goal-pace work. Ultra: back-to-back long days and time on feet. Bike race: long rides with race-like efforts. |
| 9 to 16             | `build`    | Volume rises, one or two quality days, a cutback every fourth week.                                                                                                                      |
| Earlier, or no race | `base`     | Mostly easy, one long session, strides or hills optional, no stacked quality.                                                                                                            |

These ranges are a starting skeleton for a healthy athlete already training. The coach shifts them when the log says the base is missing, and it says so in the reason line. A 100-mile race uses the ultra rules above inside the same phases. A pure bike block uses ride intents and leaves the long-run slot empty.

This table is ours, informed by the shape of `ai-running-coach`'s templates. It is not a copy of a published plan from a book.

### Program library

`packages/domain/src/programs.ts` holds original pattern cards for base running, shorter road races, half marathons, marathons, trail races, ultras, hiking, road cycling, and mountain biking. Each card says who it fits, how the weeks progress, how recovery is arranged, and how to change a session. Sources are cited in the card and in `docs/research/program-library.md`.

`packages/domain/src/workouts.ts` adds original example sessions for each card: steps, effort, and a duration the server scales to the log. A long run is about ten minutes past the recent longest session, and never more than twenty. Published daily plans are not stored. The Boston Athletic Association page says its training material may not be reproduced without consent, and the other weekly grids we read are their authors' plans. A card can say "about eighteen weeks, four runs, a long run that steps back every few weeks." An example can say "run easy for about 60 minutes, conversational the whole way." It does not reproduce a published Tuesday.

When a program has been chosen, its saved pattern, current phase, and cutback drive the references. Otherwise, on each turn the server picks the closest cards from the race, the phase, recent weekly time, and the current constraint, and puts those cards in the prompt, with the scaled steps of the closest card. Injury, a niggle, travel, a cutback, and a taper are written above the cards, because they override the example. An injury flag removes every session that is not easy, rest, or strength. `get_program_examples` fetches a different event when the question is not about the current block. The model names the card it used and copies the example steps into the proposal. A guardrail refusal still wins. Guided mode keeps the skeleton's duration and effort, and writes the matching example's name and instructions onto each proposed day. The reply includes the steps for one of those sessions. Programs lets the athlete choose a training direction, preview a full dated schedule, and explicitly follow it. The selected program persists and progress appears in My week. Workout library is its secondary reference tab, listing every example session so they can be scrolled and filtered. Browsing does not write a plan. Program enrollment and ending are user actions, never model tools. Durations on that screen use the same log scaling.

## Photo to workout

You take a picture in the PWA or pick one from the camera roll. The input is `<input type="file" accept="image/*" capture="environment">`, which works in Safari and in an installed iOS home-screen app.

1. The browser stores the image in the outbox if the API is unreachable.
2. The API stores the original bytes on disk and creates a draft row with `confirmed = false`.
3. The API sends the image to the vision model with the activity schema and the instruction to extract only what is visible. Missing fields stay null. The model returns a confidence from 0 to 1 and a short list of fields it is unsure about.
4. The draft card shows sport, date, duration, distance, pace or speed, heart rate, and the photo. Unsure fields are marked.
5. You edit anything wrong and confirm, or discard. Confirm writes actual training. A separate review explicitly links it to a scheduled session as completed, modified, or replaced, or marks it as additional training. Date and sport alone never complete a plan day.
6. The coach's next turn can discuss the workout. It cannot confirm the draft by itself.

The schema the vision model must return:

- sport, start date, start time if visible
- duration, moving time, distance, elevation
- average and max heart rate, average pace or speed, average power
- a title if the screen shows one
- confidence, and the list of uncertain fields
- nothing about how you felt, unless the photo is of a note you wrote

Pace on a treadmill screen is often the intended pace, not moving time over GPS distance. The card labels treadmill parses as treadmill when the image or your caption says so, and stores distance as the machine's distance.

Multiple photos of one workout are attached to the same draft. The second call updates the draft. It does not create a second activity.

## File import

A FIT, GPX, or TCX file is a draft too.

1. Detect the type from the extension and a quick sniff of the contents.
2. FIT goes through `fit-parser`. GPX and TCX go through a small parser in `apps/api/import` (XML to the same activity fields). A library is welcome here if it is MIT or Apache-2.0 and already maintained. `sports-lib` is capable and AGPL, so it stays a reference.
3. Map sport, start time, duration, distance, elevation, heart rate, and power onto the activity schema.
4. Show the same confirmation card, without a photo. On confirm, keep the original file next to the row.
5. If a file and a photo exist for the same sport and the same start time within 15 minutes, the API offers to attach the file to the photo activity instead of creating a second row.

Streams stay inside the file on disk.

## Metrics

v1 needs enough load to support the guardrails and the week summary. It does not need TrainingPeaks numbers.

Session load, in that order:

1. If RPE is present: `duration hours × RPE`.
2. If the activity is linked to a plan day: a fixed weight for the intent (`rest` 0, `easy` 3, `endurance` 4, `long` 5, `quality` 7, `race` 9) times duration in hours.
3. Otherwise: duration in hours times 4, and the week summary says the load is estimated.

Acute load is the sum of session load over the last 7 days. Chronic load is the sum over the last 28 days, divided by 4, so the two numbers share a unit. These are descriptive summaries. The first slice shows completed and planned duration; load summaries are available to the coach. An acute/chronic ratio is not a hard gate, especially with sparse history. Scheduling guardrails use actual dates, effort, and duration.

Heart-rate TRIMP, HRSS, bike TSS, CTL, ATL, and TSB wait until a phase that reads streams and trusts a threshold. The column names on the activity row already hold the averages those formulas need.

## PWA on the iPhone

- A web app manifest, standalone display, and a home-screen icon. The install hint is a one-time line in the UI, not a gate.
- The chat is the start URL.
- The service worker caches the built app shell. A browser snapshot stores the last successful plan, log, and conversation for a read-only offline view.
- In the photo phase, photos queue in IndexedDB and flush when a health check succeeds. Chat and typed writes require a connection in the first slice.
- iOS will drop a long-lived background upload. The outbox retry runs when you open the app. That is the supported path.
- Web push is out of v1. Opening the app is how you see the question the coach left.
- The layout has two widths. At phone width the thread is the whole screen, with the draft card and the next seven days as sheets. At laptop width the thread sits beside the next fourteen days.

## API surface

JSON, an optional shared bearer token, and Zod on the way in. Account sign-in and status routes proxy the local Codex runtime without exposing credentials.

- `POST /api/chat` streams the assistant turn. The body is the user text plus optional draft ids.
- `POST /api/photos` multipart. Returns the draft.
- `POST /api/files` multipart. Returns the draft.
- `POST /api/activities/:id/confirm` and `POST /api/activities/:id/discard`.
- `GET /api/plan?from&to`, `GET /api/activities?from&to`, `GET /api/athlete`.
- `POST /api/activities` for a manual log from a form, the same write as the `log_activity` tool.
- `GET /api/health` for the outbox.

The chat tools call the same functions as these routes. There is one write path.

## Build order

Each phase is usable on its own. A phase ends when its checks pass on a phone-sized browser and on a desktop-sized browser.

### Phase 0 — Shell

Repo, SQLite migrations, the athlete row, a PWA that installs, and a chat turn that can call `get_athlete` and `record_note`.

Done when: you install the app, say "long run on Saturday," reload, and the coach still knows.

### Phase 1 — Log and plan, by typing

`log_activity`, `propose_plan_days`, the guardrails, weekly totals, and the fourteen-day strip. Race-oriented plan blocks wait until periodization.

Done when: you can say "I ran 50 minutes easy, RPE 3" and then "plan the next three days," and the proposal respects a rest day you already stated. A second quality day back to back is refused, and the reply says why.

### Phase 2 — A useful daily and weekly loop

Explicit acceptance, edits to logged workouts, accepted-session revisions, missed days, decision notes, a week view, and recent training totals. This is part of the first implementation slice, before imports.

Done when: you can accept a proposal, log its completion, change a future accepted session with a reason, and see that reason after a reload.

### Phase 3 — Photos

Capture, outbox, vision draft, confirmation card, link to a plan day on confirm.

Done when: a photo of a treadmill summary becomes a confirmed run only after you fix a wrong distance and tap confirm. Airplane mode queues the photo and uploads it on the next open. A discarded draft never appears in the week load.

### Phase 4 — Files

FIT, GPX, and TCX drafts through the same card. Duplicate detection against a photo activity.

Done when: a FIT file from a real ride lands as a bike activity with duration, distance, and heart rate filled, and the original file is still on disk.

### Phase 5 — Race blocks and periodization

Race row, the phase table, cutback weeks, taper, ultra back-to-backs, the question priority list, decision notes when an accepted day changes.

Done when: given an A race twelve weeks out and four weeks of logs, the coach proposes a week inside the right phase, asks the single highest-priority question, and writes a decision note if you move the long run.

### Phase 6 — Optional sync

Strava via `stravalib`, or Intervals.icu via its personal API. Imports are drafts, or they are confirmed automatically only when the source activity id was imported before and is unchanged. The external id is stored so a second sync updates in place.

Done when: a second sync does not duplicate the run you already confirmed from a photo.

### Phase 7 — Leave the app

`.ics` for accepted days. After that, Zwift `.zwo` and a Garmin workout file if you still want them. Workout-file encoding is the moment to re-read the FIT license and decide whether `fit-parser` can write the file we need. If it cannot, a workout export can be the text prescription plus the calendar file, which is enough to do the session.

## Tests

- Domain and guardrails: tests beside the API with no network. Check the scheduling rejections above, including the injury flag and cross-sport effort.
- Import: fixture FIT, GPX, and TCX files checked into `apps/api/import`. Assert the mapped activity. Fixtures are our own short recordings, not someone else's activity file.
- Photo: the vision call is behind an interface. Tests feed a canned parse and assert the draft, the confirm edit, and the discard. One optional live test, off by default, hits a real model with a fixture image.
- API: the chat write tools and the HTTP routes share tests against a temporary SQLite file.
- Web: verify log, propose, accept, revise, reload, and the production offline shell at phone and desktop widths. Photo confirmation adds its browser checks in the import phase.

## Non-goals

- Accounts, social features, clubs, segments, route matching.
- A gym set tracker, nutrition logging, or a medical diagnosis. Pain handling is "bias easy and tell the athlete to get a person involved," and the prompt says so.
- Replacing Strava or hosting other people's data.
- Per-second charts, maps, and a fitness-fatigue chart in v1. The numbers exist as sums. The chart can wait until the log is trustworthy.
- Background GPS recording. The phone is where you talk and where you photograph a screen. A watch or a bike computer records the session that has a file.
- OptMem or any external memory service.
- Copying Endurain, FitTrackee, wger, GoldenCheetah, or `sports-lib` source into this repo.

## Risks

- iOS will evict storage and will not finish uploads in the background. The outbox and the server-side copy of every photo are the mitigation. Confirm the outbox on a real iPhone in the photo phase, not only in desktop responsive mode.
- Vision parses will be wrong on odd watch faces. The confirmation card is the mitigation. Keep the image.
- A coach that can write the plan will write a confident bad plan. Guardrails in code, a reason line on every day, and decision notes are the mitigation.
- SQLite on one machine is a single point of failure. The first slice creates daily local snapshots and supplies a backup command for another disk. Blob backups join it when imports arrive.
- Model drift. Tools and schemas are the contract. The system prompt is short and the rules that matter are in the tool handlers.

## First implementation slice

Phases 0–2, in one pass, on the stack above. A chat that remembers the athlete, logs a typed workout, proposes three days, and refuses a second hard day. Include the visible weekly loop, acceptance, and revision history so the coach is useful before photos, files, or sync arrive.

That slice proves the seam: one schema, one write path, the coach grounded in rows rather than in a transcript. Photos and files use the same draft card afterward, which is why the activity row has `source` and `confirmed` from the first migration.
