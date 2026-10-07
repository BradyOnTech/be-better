import { useState, useEffect } from "react";
import { api } from "./api.js";
type Account = {
  model: string;
  reasoning: string;
  available: boolean;
  signedIn: boolean;
  email: string | null;
  plan: string | null;
  version: string | null;
  error: string | null;
  usage: {
    primary?: { usedPercent: number; resetsAt: number };
    secondary?: { usedPercent: number; resetsAt: number };
  } | null;
  login: { type: string; url: string; code?: string; id: string } | null;
};
export function SubscriptionSettings() {
  const [account, setAccount] = useState<Account | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setAccount(await api<Account>("/subscription"));
    } catch (error) {
      setError((error as Error).message);
    }
  };
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (account) window.dispatchEvent(new Event("be-better-account"));
  }, [account?.signedIn]);
  async function action(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await api(path, body);
      await load();
      window.dispatchEvent(new Event("be-better-account"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="subscription-card">
      <span className="eyebrow">YOUR COACH CONNECTION</span>
      <h3>ChatGPT subscription</h3>
      {!account ? (
        <p className="muted">Checking the local Codex connection…</p>
      ) : (
        <>
          <p>
            {account.signedIn
              ? `${account.email ?? "Signed in"} · ${account.plan ?? "ChatGPT"}`
              : "Sign in to use your ChatGPT plan for coaching and photo parsing."}
          </p>
          <p className="muted">
            Coaching and photo parsing use your ChatGPT plan’s usage limits.
          </p>
          {account.model && (
            <p className="coach-model">
              {account.model === "gpt-6.1-sol" ? "GPT-6.1 Sol" : account.model}{" "}
              · {account.reasoning} reasoning
            </p>
          )}
          {account.login ? (
            <div className="login-instructions">
              {account.login.code && (
                <>
                  <span>Enter this code on the sign-in page</span>
                  <strong className="device-code">{account.login.code}</strong>
                </>
              )}
              <a
                className="primary-button"
                href={account.login.url}
                target="_blank"
                rel="noreferrer"
              >
                Open ChatGPT sign-in
              </a>
              <p className="muted">
                {account.login.type === "chatgpt"
                  ? "Open this link on the machine running Be Better. The browser returns to that machine’s local callback."
                  : "You can complete this sign-in from your phone or laptop."}
              </p>
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => void action("/subscription/login/cancel")}
              >
                Cancel sign-in
              </button>
            </div>
          ) : account.signedIn ? (
            <>
              <div className="usage-summary">
                {account.usage?.primary && (
                  <span>
                    Current window: {account.usage.primary.usedPercent}% used
                  </span>
                )}
                {account.usage?.secondary && (
                  <span>
                    Weekly window: {account.usage.secondary.usedPercent}% used
                  </span>
                )}
              </div>
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => void action("/subscription/logout")}
              >
                Sign out of ChatGPT
              </button>
            </>
          ) : (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={busy || !account.available}
                onClick={() =>
                  void action("/subscription/login", { type: "device" })
                }
              >
                {busy ? "Starting sign-in…" : "Sign in with ChatGPT"}
              </button>
              <button
                className="text-button"
                type="button"
                disabled={busy || !account.available}
                onClick={() =>
                  void action("/subscription/login", { type: "browser" })
                }
              >
                Use browser callback on this machine
              </button>
            </>
          )}
          {account.version && (
            <details>
              <summary>Runtime details</summary>
              <p className="muted">{account.version}</p>
              <p className="muted">
                Credentials are isolated under ~/.be-better/codex. The PWA does
                not receive OAuth tokens.
              </p>
            </details>
          )}
          {account.error && <p className="form-error">{account.error}</p>}
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
