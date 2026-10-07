import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  openSync,
  closeSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createServer } from "node:net";

if (process.platform !== "darwin")
  throw new Error("This service installer is for macOS.");
const project = resolve(import.meta.dirname, "..");
if (!existsSync(resolve(project, "dist/api/index.js")))
  throw new Error("Run npm run build before installing the server service.");
const label = "com.be-better.server";
const domain = `gui/${process.getuid()}`;
const target = `${domain}/${label}`;
function launchctl(args) {
  const result = spawnSync("/bin/launchctl", args, { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `launchctl ${args[0]} failed.`);
  return result.stdout;
}
const installed = spawnSync("/bin/launchctl", ["print", target]).status === 0;
if (installed) launchctl(["bootout", target]);
// Refuse to compete with a manually started server or another app.
const portDeadline = Date.now() + 5000;
while (true) {
  try {
    await new Promise((resolvePort, reject) => {
      const probe = createServer();
      probe.once("error", reject);
      probe.listen(3001, "127.0.0.1", () => probe.close(resolvePort));
    });
    break;
  } catch {
    if (!installed || Date.now() >= portDeadline)
      throw new Error(
        "Port 3001 is in use. Stop the manually started server before installing the service.",
      );
    await new Promise((r) => setTimeout(r, 150));
  }
}
const logs = resolve(project, "data/service");
mkdirSync(logs, { recursive: true, mode: 0o700 });
for (const file of ["server.log", "server-error.log"])
  closeSync(openSync(resolve(logs, file), "a", 0o600));
const agents = resolve(homedir(), "Library/LaunchAgents");
mkdirSync(agents, { recursive: true });
const plist = resolve(agents, `${label}.plist`);
const xml = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const string = (value) => `<string>${xml(value)}</string>`;
writeFileSync(
  plist,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${string(label)}
<key>ProgramArguments</key><array>${[process.execPath, "--env-file-if-exists=.env", "dist/api/index.js"].map(string).join("")}</array>
<key>WorkingDirectory</key>${string(project)}
<key>EnvironmentVariables</key><dict>
<key>PATH</key>${string([dirname(process.execPath), "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"))}
<key>HOST</key><string>127.0.0.1</string>
<key>PORT</key><string>3001</string>
</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>5</integer>
<key>ExitTimeOut</key><integer>15</integer>
<key>ProcessType</key><string>Background</string>
<key>StandardOutPath</key>${string(resolve(logs, "server.log"))}
<key>StandardErrorPath</key>${string(resolve(logs, "server-error.log"))}
</dict></plist>
`,
  { mode: 0o600 },
);
// launchd can still be unloading the old job after its listening port closes.
const bootstrapDeadline = Date.now() + 20000;
while (true) {
  try {
    launchctl(["bootstrap", domain, plist]);
    break;
  } catch (error) {
    if (!installed || Date.now() >= bootstrapDeadline) throw error;
    await new Promise((r) => setTimeout(r, 150));
  }
}
const healthDeadline = Date.now() + 10000;
let ready = false;
while (Date.now() < healthDeadline) {
  try {
    const response = await fetch("http://127.0.0.1:3001/api/health", {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok && (await response.json()).ok === true) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 150));
}
if (!ready)
  throw new Error(
    `The service was installed but its API did not start. Check logs in ${logs}.`,
  );
console.log(
  `Installed ${label}. macOS starts it at login and restarts it after an exit.`,
);
console.log(`Configuration stays in the project's .env; logs are in ${logs}.`);
