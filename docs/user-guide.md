# Using Be Better

How the app behaves, screen by screen. For installation, see [self-hosting](self-hosting.md). [GLOSSARY.md](../GLOSSARY.md) defines the terms used here.

## Coach

The home screen is a conversation. The coach reads your log, asks about gaps that matter (pain, readiness, a race date, a missed session), and proposes dated sessions, each with a target and a reason. It shows at most two questions at once, prioritizing injury, readiness, races, effort, and missed sessions.

Proposals are only proposals until you press **Accept**. Revising an accepted session keeps the prior prescription in a dated decision note. The coach writes through the same guarded service as the UI. It cannot accept plans, confirm imports, or enroll in or end programs. Tool activity is grouped into expandable summaries so the conversation stays readable.

## Programs

Open **Programs**, choose a goal, compare the recommended approaches, and customize your goal, dates, training days, weekly time budget, and optional supporting strength.

- **Preview schedule** shows every dated week without writing to the calendar.
- **Follow this program** explicitly accepts that exact schedule and saves it as the active program.
- **My week** shows progress and lets you move through the calendar.

Existing accepted or proposed sessions stay in place. End the program explicitly before switching. Ending cancels only its remaining scheduled days and preserves completed training and decision notes.

Schedules start from your current training, stay within the time budget and guardrails, and include cutbacks and a taper when you give a goal date. Long runs are capped by your actual recent baseline. A scaled starting block does not establish readiness for an ambitious race.

**Workout library** is a secondary tab with 70 original example sessions, which the coach also uses as references. **For you** highlights sessions for the active program. Browsing and filtering never change the plan.

## Logging

Log runs, rides, walks, and other sessions from **Log**, or describe them to the coach.

For lifting, use **Log → Log lifting** or the composer's add menu. Record session time, effort, feeling, and pain, plus exercises with individual sets, repetitions or timed holds, and weights in lb or kg. A blank weight means unknown; 0 means bodyweight. Use exercise notes for equipment, assistance, or weight per hand. Changing the unit converts the entered loads. You can copy the last session's exercises and sets into a new entry; duration and effort are always entered fresh. Lifting counts toward training time and recovery context. The app does not assume strength progression is your goal.

## Planned vs. actual

Logging a workout records what actually happened. It never marks a scheduled session complete on its own, even if the date and sport match. A review card in My week, Log, or Imports asks how the workout relates to the plan:

- **Completed as planned**: the session is done.
- **Modified**: done differently. The original prescription is kept alongside what you did.
- **Replaced**: something else instead. The prescription is marked Replaced and linked to the actual workout.
- **Additional**: extra training. The scheduled session stays outstanding.

Actual totals count each activity once. Correcting the date, sport, duration, intent, or exercises of a linked activity reopens the review. The coach offers recovery adjustments but never makes up missed intensity automatically.

## Guardrails

Every write, whether from the UI or the model, goes through the same checks. They reject:

- consecutive hard days across sports
- hard training after a long run
- more than two hard days in a week
- hard training during an injury flag
- training on a stated rest day
- long-run jumps over 20 minutes
- weeks that break cutback or taper budgets
- numeric targets without saved zones

## Imports

Use **Imports** to capture a summary photo (a treadmill screen, a watch, an app screenshot) or select a FIT, GPX, or TCX file. Each one becomes a draft card. Check uncertain fields, correct the details, and confirm. Unconfirmed or discarded drafts never count toward training totals. Selecting multiple photos creates one draft; multiple files create separate drafts.

Originals stay on disk and remain downloadable after confirmation. Duplicate candidates can attach to an existing workout so it counts once.

## Intervals.icu (optional)

Open **Settings → Connections → Intervals.icu**, paste your API key, and leave athlete ID at **0** for your own account. Connecting checks the credentials before saving them on the server in `.env` with owner-only permissions. The key is never returned to the PWA, stored in the browser, or sent to the coach. Server-side `INTERVALS_API_KEY` and `INTERVALS_ATHLETE_ID` also work.

Intervals.icu supplies activity analysis, daily fitness/fatigue estimates, recovery observations, and sport-specific reference settings. The first refresh retrieves six months; later refreshes overlap the last four weeks, every six hours, even when the PWA is closed. **Training analysis** in the connection card shows coverage, failures, seven-day recovery against the preceding 28 days, weekly provider load, and reference zones. Partial failures keep cached observations and show their age. Missing measurements stay unknown.

The coach receives a bounded analysis summary and can request interval detail for a cached activity. It treats fitness/fatigue as model estimates and compares recovery to your own baseline. Intervals load stays separate from local duration/RPE load. Imported thresholds and zones need review and saving under **Settings → Training** before they can be used as targets.

Workout imports start only when you press **Sync last four weeks** in Settings or **Sync recent workouts** in Imports, and they still arrive as reviewable drafts. Unchanged records are skipped; changed details become reviewable updates. Analysis refreshes never confirm workouts or change the plan. Disconnecting preserves the log.

## Export

**My week → Calendar** exports accepted days as calendar events. Open an accepted session for text or FIT export. Cycling sessions with time-based steps can also export Zwift ZWO; watt targets require a recorded FTP. FIT targets are written as readable effort cues with open device targets rather than device-specific units. See [third-party notices](../THIRD_PARTY_NOTICES.md) for the FIT license review.
