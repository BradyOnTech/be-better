# Using Be Better

How the app behaves, screen by screen. For installation, see [self-hosting](self-hosting.md). [GLOSSARY.md](../GLOSSARY.md) defines the terms used here.

## Coach

The home screen is a conversation. The coach reads your log and what you tell it about your training, then acts on what you ask: when you ask for a plan, it builds one in that reply, says what it assumed, and asks at most one follow-up question. Training you describe ("about 15 miles a week", "5–6 miles is comfortable") is saved to **Settings → Training** as your usual weekly minutes and recent longest run, using an easy pace of about 11 minutes per mile unless you give one, so plans start from your real level rather than only what has been logged in the app.

For a race, the coach builds a block from your current level toward the peak week and long run of the reference program that matches the race (for example, First 50K for a 34-mile trail race), with an easier week every fourth week and a three-week taper, then proposes the first days. It tells you the whole arc and the reference it used. Pain always comes first.

Use **New conversation** to start a fresh topic and **Conversations** to return to an earlier chat. On a phone, both are icons in the Coach header, next to the current conversation's title. Each conversation keeps its own messages; your training log, plan, preferences, and saved coaching notes stay available across chats. The app reopens the conversation you last selected on that device. Messages from before this feature remain under **Earlier conversation**. Offline reopening keeps the last saved conversation; starting or opening another chat requires a connection.

On a phone, the composer follows the visible screen when the keyboard opens. The bottom tabs and check-in shortcuts temporarily hide to leave room for typing, then return when the keyboard closes. Return adds a new line on a touch keyboard; tap the send button to send. On a computer, Enter sends and Shift+Enter adds a line. Each coach reply has a copy button, and an arrow appears to jump back to the latest message after you scroll up.

Proposals are only proposals until you press **Accept**. Revising an accepted session keeps the prior prescription in a dated decision note. The coach writes through the same guarded service as the UI. It cannot accept plans, confirm imports, or enroll in or end programs. Tool activity is grouped into expandable summaries so the conversation stays readable.

## Programs

Open **Programs**, choose a goal, compare the recommended approaches, and customize your goal, dates, training days, weekly time budget, and optional supporting strength.

- **Preview schedule** shows every dated week without writing to the calendar.
- **Follow this program** explicitly accepts that exact schedule and saves it as the active program.
- **My week** shows progress and lets you move through the calendar.

The **Next workout** card at the top of My week opens the earliest upcoming workout and shows whether it is proposed or accepted. Rest days and resolved sessions stay in the calendar. The Coach screen also keeps its **Next up** shortcut; upcoming training does not have a separate bottom-navigation tab.

Existing accepted or proposed sessions stay in place. End the program explicitly before switching. Ending cancels only its remaining scheduled days and preserves completed training and decision notes.

Schedules start from your current training and build about 10% a week, with an easier week every fourth week, toward your weekly time commitment. They include a taper when you give a goal date. Long runs grow by at most about 15 minutes a week, and never more than 20 minutes past the longest run before them. Your current training is the higher of what you have told the app (**Settings → Training**, or the coach) and what you have logged, so training from before you started using the app counts.

**Workout library** is a secondary tab with 70 original example sessions, which the coach also uses as references. **For you** highlights sessions for the active program. Browsing and filtering never change the plan.

## Logging

Log runs, rides, walks, and other sessions from **Log**, or describe them to the coach. Distance and elevation gain are optional; elevation is entered in feet when your distance unit is miles and in metres when it is kilometres.

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
- long-run jumps of more than 20 minutes past the longest recent or planned run in the two weeks before
- weeks that break cutback or taper budgets
- numeric targets without saved zones

## Motivation

**Motivation** is a deck of cards for the days you don't feel like going. Swipe up, or use the arrow keys, to move through it. Tap a card or **Now what?** to turn it over for something concrete to do about it. The deck opens on the day's card and ends at a summit card that leads back to your log and week.

- **Themes** filter the built-in cards: hard truth, discipline, identity, long game, race day, and recovery. **Shuffle** reorders the deck; the day's card stays first.
- **Receipts** are built from your confirmed workouts: longest session, biggest climb, hardest effort, weekly streak, total climb, and all-time totals. Drafts and Intervals.icu observations never count.
- **Write a card** adds your own line, an optional "Now what?" back, and a color. Wrap words in \*asterisks\* to highlight them. Your cards mix into the deck and are saved on your server, so they follow you between devices.
- **Keep** (the bookmark) saves a card under **Kept**. **Share** makes a phone lock-screen image of the card.
- With a connected coach, **Ask my coach** on the back of a card starts a conversation about acting on it this week.

Reading, keeping, or writing cards never changes your plan or log. Cards are not part of the coach's context unless you send one with **Ask my coach**.

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
