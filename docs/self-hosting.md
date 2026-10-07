# Self-hosting

Be Better is one Node process: a Hono API that also serves the built PWA, a SQLite file, and a directory of original uploads. Run it on a machine you leave on, and reach it from your phone over a private network. These notes describe the setup I use: a Mac, a LaunchAgent, and Tailscale.

## Run locally

Requires Node 22.17 or newer.

```sh
npm ci
cp .env.example .env
npm run dev
```

Open **http://localhost:5173**. The API runs on port 3001. Migrations run at startup and the log is created at `data/coach.sqlite`.

## Connect a model

### ChatGPT subscription (default)

Open **Settings → Connections → Sign in with ChatGPT**. The default device sign-in works from the phone or laptop. Follow the official sign-in link and enter the displayed code. The alternative browser callback must be completed on the machine running the API.

Coaching and photo parsing use the official local [Codex app-server](https://learn.chatgpt.com/docs/app-server), with **GPT-6.1 Sol** and **low reasoning effort** by default. `CODEX_MODEL` selects the subscription model; reasoning effort is set in the server connection. Codex is pinned to **0.160.1** in the lockfile. It manages credentials under `~/.be-better/codex` (override with `BE_BETTER_CODEX_HOME`). Be Better does not read OAuth tokens or send them to the PWA. Your ChatGPT plan's limits apply, and no OpenAI API key is needed for this path. Settings shows the configured model and effort, account status, usage windows, and runtime diagnostics.

The coach runtime uses an empty working directory, restricted read-only access, disabled shell and child-agent tools, and only the application's validated tools. Repository instruction loading is disabled (`project_doc_max_bytes=0`), so development instructions such as `AGENTS.md` never reach the coach.

### API providers (optional)

Set `AI_PROVIDER=openai` with `OPENAI_API_KEY`, or `AI_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`, plus an appropriate `AI_MODEL`. These use separate API billing. Restart the API after changing environment settings.

### No model

Before sign-in, an explicitly labeled guided mode supports basic entries and proposals. The forms work without a model.

## First-run setup

Set your name, timezone, rest days, recent weekly minutes, and recent longest run in **Settings → Training**. Add zones and dated threshold values when you know them. Numeric workout targets require saved zones. Preferences such as "long run on Saturday" persist in the database with dated notes.

## Phone and installed PWA

```sh
npm run build
npm start
```

Production serves the web app and API together at **http://localhost:3001**. Use this built version for installation and offline behavior; the development server does not register the service worker.

Keep the API bound to `127.0.0.1` and expose it privately through [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve):

```sh
tailscale serve --bg --https=8444 http://127.0.0.1:3001
```

Open the resulting HTTPS address on the phone. In Safari, use **Share → Add to Home Screen**. Phone and laptop use the same server and log.

With a loopback server and private tailnet access, leave `AUTH_TOKEN` empty; a shared token is optional in this configuration. Binding directly to a network interface requires a token. There are no user accounts. Do not expose this app to the public internet.

## Always-on macOS service

Instead of leaving `npm start` in a terminal, build the app and run:

```sh
npm run service:install
```

This installs a `com.be-better.server` LaunchAgent for the current user. It starts at login and restarts after the server exits. The service reads the project's `.env`; its plist contains no model or sync credentials. Logs are under `data/service/`. Stop any manually running server first. Rerun the installer after moving the project or upgrading the Node installation it uses.

To deploy a change:

```sh
npm run build
launchctl kill SIGTERM gui/$(id -u)/com.be-better.server
npm run health -- https://your-tailnet-host:8444/
```

The health check hits the actual API rather than the cached PWA shell. The installed PWA then shows **Update now** for the new bundle. Applying the update preserves browser storage and queued uploads.

## Offline behavior

The PWA reconnects, reloads its conversation, checks for app updates, and retries queued uploads when it returns to the foreground. Update checks also run on the initial connection screen.

The built app reopens with its cached conversation, log, and plan when the server is unreachable. That view is read-only. Photos and files can still enter a durable IndexedDB outbox and upload when you reopen the app with a connection. Keep browser data until queued originals have uploaded. iOS background uploading is not relied upon.

## Data and backups

SQLite lives at `DATABASE_PATH`; original uploads live in a sibling `<database-name>-blobs` directory. `BLOB_DIRECTORY` can override that location. Daily snapshots of the database and originals go under `backups/<database-name>/`.

For a backup on another disk:

```sh
npm run backup -- /path/to/another/disk
```

To restore, copy the snapshot `.sqlite` and its matching `-blobs` directory together, preserving their names. Stop the API and start it with `DATABASE_PATH` pointing to the copied snapshot. If you use a custom `BLOB_DIRECTORY`, point it to the restored originals. Keep the live log until you have verified the restored copy. Run commands from the repository root so migrations can be found.

The database, originals, backups, and `.env` are ignored by Git.

## Verification

```sh
npm run build
npm test
```

The main product checks are browser workflows against a built PWA with a separate verification database: correction and confirmation, offline capture and retry, all three file formats, duplicate merging, guarded refusals, periodization, and downloads. [Implementation status](implementation-status.md) records what was checked, and separates simulated provider checks from live subscription, sync, and physical-device checks.
