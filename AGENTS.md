# Be Better development and production

This is a personal PWA. Its production deployment is a single always-on machine: the API and SQLite log run under the user's LaunchAgent `com.be-better.server`, listening on `127.0.0.1:3001`, and Tailscale Serve exposes it privately to the user's devices. If `AGENTS.local.md` exists, read it first. It records this machine's production URLs, compatibility routes, and Git account details, and it takes precedence over the generic defaults here. Preserve existing Tailscale routes.

For requested implementation work, finish by validating, building, and updating the running service unless the user asks for source-only work. Source edits alone do not update the installed app. Run `npm run build`, then `launchctl kill SIGTERM gui/$(id -u)/com.be-better.server`, and verify `npm run health -- <production URL>`. The service restarts automatically. The PWA offers **Update now** for the new bundle.

Use an isolated verification database and a separate temporary port/origin when creating test workouts or chat messages. Never populate the personal production log with test data. Remove temporary services and routes afterward.

Secrets remain in `.env` and the official Codex-managed credential directory. Never print, commit, or push those files, personal logs, original uploads, backups, `AGENTS.local.md`, or ignored verification artifacts. Review staged paths and scan staged text for credentials before committing. The repository is public: Git is source history, and the running service is production. A GitHub push alone does not deploy this app.

The shared activity schema is in `packages/domain`; write validation and guardrails are in the API service. UI and model tools use those same writes. Changes to accepted plans need decision notes. Models cannot confirm import drafts or accept plans. Intervals observations remain separate from confirmed workouts and local duration/RPE load. Workout-library browsing never changes the plan. Program previews are read-only; explicitly following the preview accepts its dated schedule. Models cannot enroll or end programs. Logging and import confirmation never infer plan completion from date or sport; plan outcomes require an explicit completed/modified/replaced/additional decision, with original prescriptions and actual training preserved. [GLOSSARY.md](GLOSSARY.md) defines these terms.

Keep credentials in the CLI/keyring, never in tracked files or remote URLs.

The subscription coach is a separate Codex runtime with explicit application instructions. Its `project_doc_max_bytes=0` override prevents discovery of this development AGENTS.md outside the restricted runtime workspace. Preserve that override and the existing permissions when changing the runtime.
