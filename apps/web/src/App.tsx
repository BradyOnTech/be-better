import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useAISDKRuntime } from "@assistant-ui/ai-sdk";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
  useAuiState,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import Markdown from "react-markdown";
import { WorkoutEditor } from "./workout-editor.js";
import { PwaUpdates } from "./pwa.js";
import { whenAppResumes } from "./app-lifecycle.js";
import {
  ArrowUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Footprints,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Moon,
  Mountain,
  Plus,
  Route,
  Settings as SettingsIcon,
  Sparkles,
  TrendingUp,
  WifiOff,
  X,
  Bike,
  NotebookPen,
  Inbox,
  Camera,
  Heart,
  Flag,
  Dumbbell,
  Library,
} from "lucide-react";
import {
  addDays,
  dayOfWeek,
  formatDistance,
  formatDuration,
  weekStart,
  type AppState,
  type Activity,
  type PlanSession,
  type Race,
  type CoachQuestion,
  strengthSummary,
  sessionStatusLabel,
} from "../../../packages/domain/src/index.js";
import {
  api,
  ApiError,
  authenticatedFetch,
  operationId,
  readSnapshot,
  saveSnapshot,
} from "./api.js";
import {
  LogWorkout,
  Modal,
  SessionDetails,
  Settings,
  weekdays,
} from "./dialogs.js";
import { ImportsView, ImportPicker, DraftCard, download } from "./imports.js";
import {
  RaceDialog,
  RacePanel,
  QuestionCard,
  ReadinessDialog,
} from "./training.js";
import { startOutbox } from "./outbox.js";
import { ProgramsView, ProgramSummary } from "./programs.js";
import { PlanReviews } from "./plan-review.js";

type View = "coach" | "week" | "workouts" | "log" | "imports";
const viewTitles: Record<View, string> = {
  coach: "Coach",
  week: "My week",
  workouts: "Programs",
  log: "Training log",
  imports: "Imports",
};
interface Bootstrap {
  state: AppState;
  messages: UIMessage[];
  offline: boolean;
}
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

export function App() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState(false);
  const loading = useRef(false);
  const authenticate = useCallback(() => setAuth(true), []);
  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setError("");
    try {
      const [state, messages] = await Promise.all([
        api<AppState>("/state"),
        api<UIMessage[]>("/history"),
      ]);
      saveSnapshot(state, messages);
      setBootstrap({ state, messages, offline: false });
      setAuth(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setAuth(true);
        return;
      }
      const cached = readSnapshot();
      if (cached)
        setBootstrap({
          state: cached.state,
          messages: cached.messages,
          offline: true,
        });
      else
        setError(
          "Your training server is taking a breather. Start it, then reconnect.",
        );
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    if (bootstrap || auth) return;
    void load();
    const stop = whenAppResumes(() => void load());
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 20000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [load, bootstrap, auth]);
  return (
    <>
      {auth ? (
        <ConnectionScreen error="" reconnect={load} auth />
      ) : bootstrap ? (
        <CoachApp initial={bootstrap} authenticate={authenticate} />
      ) : (
        <ConnectionScreen error={error} reconnect={load} />
      )}
      <PwaUpdates />
    </>
  );
}
function ConnectionScreen({
  error,
  reconnect,
  auth = false,
}: {
  error: string;
  reconnect: () => Promise<void>;
  auth?: boolean;
}) {
  return (
    <div className="connection-screen">
      <Brand />
      <div className="connection-card">
        <Mountain size={40} strokeWidth={1.4} />
        <h1>
          {auth
            ? "Your coach, your space."
            : error
              ? "Let’s reconnect."
              : "Finding your next step…"}
        </h1>
        {auth ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const value = new FormData(event.currentTarget).get("token");
              localStorage.setItem("be-better-token", String(value));
              localStorage.removeItem("be-better-snapshot");
              void reconnect();
            }}
          >
            <p>Enter the access token from your training server.</p>
            <input
              name="token"
              type="password"
              placeholder="Server access token"
              required
              autoFocus
            />
            <button className="primary-button">
              Connect
              <ArrowUpRight size={16} />
            </button>
          </form>
        ) : error ? (
          <>
            <p>{error}</p>
            <button className="primary-button" onClick={reconnect}>
              Try again
              <ArrowUpRight size={16} />
            </button>
          </>
        ) : (
          <LoaderCircle className="spin" size={24} />
        )}
      </div>
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Mountain size={25} strokeWidth={1.8} />
      </span>
      <span>
        be better<span className="brand-dot">.</span>
      </span>
    </div>
  );
}
function CoachApp({
  initial,
  authenticate,
}: {
  initial: Bootstrap;
  authenticate: () => void;
}) {
  const [state, setState] = useState(initial.state);
  const [offline, setOffline] = useState(initial.offline);
  const [view, setView] = useState<View>("coach");
  const [modal, setModal] = useState<"settings" | "log" | "help" | null>(null);
  const [session, setSession] = useState<PlanSession | null>(null);
  const [activity, setActivity] = useState<Activity | undefined>();
  const [logPreset, setLogPreset] = useState<PlanSession | undefined>();
  const [logSport, setLogSport] = useState<Activity["sport"] | undefined>();
  const [planOpen, setPlanOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false),
    [importTarget, setImportTarget] = useState<string | null>(null),
    [draftId, setDraftId] = useState<string | null>(null);
  const [raceOpen, setRaceOpen] = useState(false),
    [editingRace, setEditingRace] = useState<Race | undefined>(),
    [question, setQuestion] = useState<CoachQuestion | null>(null),
    [readinessOpen, setReadinessOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [input, setInput] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(160, textarea.scrollHeight)}px`;
  }, [input]);
  useEffect(() => {
    const resize = () =>
      document.documentElement.style.setProperty(
        "--app-height",
        `${window.visualViewport?.scale === 1 ? window.visualViewport.height : window.innerHeight}px`,
      );
    resize();
    window.visualViewport?.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      window.visualViewport?.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node))
        setActionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActionsOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [actionsOpen]);
  const refresh = useCallback(async () => {
    try {
      const next = await api<AppState>("/state");
      setState(next);
      setOffline(false);
      return next;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) authenticate();
      else setOffline(true);
    }
  }, [authenticate]);
  useEffect(() => {
    if (offline || !state.sync.configured) return;
    void api("/analysis/intervals/refresh", { onlyIfStale: true })
      .then(() => refresh())
      .catch(() => {});
  }, [offline, state.sync.configured, refresh]);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: authenticatedFetch,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            message: messages.findLast((message) => message.role === "user"),
          },
        }),
      }),
    [],
  );
  const chat = useChat({
    id: "coach",
    messages: initial.messages,
    transport,
    generateId: () => crypto.randomUUID(),
    onFinish: () => {
      void refresh();
    },
    onError: () => {
      void refresh();
    },
  });
  const runtime = useAISDKRuntime(chat);
  const busy = chat.status === "submitted" || chat.status === "streaming";
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const reconnecting = useRef(false);
  const reconnect = useCallback(async () => {
    if (reconnecting.current) return;
    reconnecting.current = true;
    try {
      await refresh();
      if (busyRef.current) return;
      try {
        const messages = await api<UIMessage[]>("/history");
        if (!busyRef.current) chat.setMessages(messages);
      } catch {
        /* The state refresh controls the connection indicator. */
      }
    } finally {
      reconnecting.current = false;
    }
  }, [refresh, chat.setMessages]);
  useEffect(() => {
    if (!offline && !busy) saveSnapshot(state, chat.messages);
  }, [state, chat.messages, busy, offline]);
  useEffect(() => {
    const wake = () => void reconnect();
    const stop = whenAppResumes(wake);
    window.addEventListener("be-better-account", wake);
    const interval = setInterval(() => {
      if (!document.hidden) wake();
    }, 20000);
    return () => {
      stop();
      window.removeEventListener("be-better-account", wake);
      clearInterval(interval);
    };
  }, [reconnect]);
  useEffect(() => {
    const completed = () => {
      void refresh();
    };
    window.addEventListener("be-better-uploaded", completed);
    const stop = startOutbox();
    return () => {
      stop();
      window.removeEventListener("be-better-uploaded", completed);
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timeout);
  }, [notice]);
  async function send(text: string) {
    if (busy || offline || !text.trim()) return;
    setView("coach");
    setInput("");
    chat.clearError();
    try {
      await chat.sendMessage({ text });
    } catch {
      /* useChat exposes the retry state. */
    }
  }
  async function accept(ids: string[]) {
    try {
      await api("/plan/accept", { ids, operationId: operationId() });
      await refresh();
      setNotice("Plan accepted. One good day at a time.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  const save = async () => {
    const next = await refresh();
    const reviews = next?.planReviews ?? [];
    setNotice(
      reviews.length
        ? "Saved. Review how your workout fits the plan."
        : "Saved.",
    );
    if (
      ["week", "log", "imports"].includes(view) &&
      reviews.some(
        (r) =>
          !state.planReviews.some(
            (before) => before.activity.id === r.activity.id,
          ),
      )
    )
      requestAnimationFrame(() =>
        document
          .querySelector(".plan-reviews")
          ?.scrollIntoView({ block: "start" }),
      );
  };
  const sidebar = (
    <PlanPanel
      state={state}
      openSession={setSession}
      plan={() => void send("Plan the next three days")}
      accept={(ids) => void accept(ids)}
      disabled={busy || offline}
    />
  );
  async function buildBlock() {
    try {
      await api("/blocks", { operationId: operationId() });
      await refresh();
      setNotice(
        "Training block saved. Accepted sessions are kept until you revise them.",
      );
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  async function sync() {
    try {
      const result = await api<{
        created: number;
        updated: number;
        unchanged: number;
        restricted?: number;
      }>("/sync/intervals", {});
      await refresh();
      setNotice(
        `${result.created} new drafts · ${result.updated} updates · ${result.unchanged} unchanged${result.restricted ? ` · ${result.restricted} restricted records skipped` : ""}`,
      );
    } catch (error) {
      setNotice((error as Error).message);
      await refresh();
    }
  }
  const addImport = () => {
    setImportTarget(null);
    setImportOpen(true);
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className={`app-shell ${view === "coach" ? "coach-view" : ""}`}>
        <aside className="navigation">
          <Brand />
          <div className="nav-label">YOUR TRAINING SPACE</div>
          <nav aria-label="Main navigation">
            <NavButton
              icon={<MessageCircle size={19} />}
              active={view === "coach"}
              onClick={() => setView("coach")}
            >
              Coach
              <span className="nav-live" />
            </NavButton>
            <NavButton
              icon={<CalendarDays size={19} />}
              active={view === "week"}
              onClick={() => setView("week")}
            >
              My week
            </NavButton>
            <NavButton
              icon={<Library size={19} />}
              active={view === "workouts"}
              onClick={() => setView("workouts")}
            >
              Programs
            </NavButton>
            <NavButton
              icon={<NotebookPen size={19} />}
              active={view === "log"}
              onClick={() => setView("log")}
            >
              Training log
            </NavButton>
            <NavButton
              icon={<Inbox size={19} />}
              active={view === "imports"}
              onClick={() => setView("imports")}
            >
              Imports
              {state.drafts.length > 0 && (
                <span className="import-count">{state.drafts.length}</span>
              )}
            </NavButton>
          </nav>
          <div className="nav-bottom">
            <button className="nav-button" onClick={() => setModal("help")}>
              <CircleHelp size={18} />
              About your coach
            </button>
            <button className="nav-button" onClick={() => setModal("settings")}>
              <SettingsIcon size={18} />
              Settings
            </button>
            <div className="athlete-mini">
              <span>
                {state.athlete.name ? (
                  state.athlete.name[0].toUpperCase()
                ) : (
                  <Footprints size={17} />
                )}
              </span>
              <div>
                <strong>{state.athlete.name || "Your training"}</strong>
              </div>
            </div>
          </div>
        </aside>

        <div className="workspace">
          <header className="topbar">
            <div className="mobile-brand">
              <Brand />
            </div>
            <div className="view-title">
              <h1>{viewTitles[view]}</h1>
              <span>
                {dateLabel(state.today, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
            <div className="topbar-actions">
              <span className={`connection-status ${offline ? "offline" : ""}`}>
                {offline ? <WifiOff size={13} /> : <span />}
                {offline
                  ? "Offline · saved view"
                  : state.coach.mode === "model"
                    ? "Coach connected"
                    : "Guided mode"}
              </span>
              <button
                className="icon-button mobile-settings"
                aria-label="Settings"
                onClick={() => setModal("settings")}
              >
                <SettingsIcon size={19} />
              </button>
              {view === "coach" && (
                <button
                  className="next-up-button"
                  onClick={() => setPlanOpen(true)}
                >
                  <CalendarDays size={16} />
                  Next up
                </button>
              )}
              {view !== "coach" && (
                <button
                  className="log-button"
                  onClick={() => {
                    setActivity(undefined);
                    setLogPreset(undefined);
                    setModal("log");
                  }}
                  disabled={offline}
                >
                  <Plus size={16} />
                  Log workout
                </button>
              )}
            </div>
          </header>
          {offline && (
            <div className="offline-banner" role="status">
              <WifiOff size={15} />
              You’re viewing your saved training. Reconnect to chat or make
              changes.
              <button onClick={() => void reconnect()}>Reconnect</button>
            </div>
          )}
          <main
            className={`content-grid ${view !== "coach" ? "full-view" : ""}`}
          >
            <section
              className="coach-column"
              style={view === "coach" ? undefined : { display: "none" }}
            >
              {(state.questions.length > 0 ||
                state.drafts.length > 0 ||
                state.planReviews?.length > 0) && (
                <div className="coach-context">
                  {state.planReviews?.length > 0 && (
                    <button onClick={() => setView("week")}>
                      <CalendarDays size={15} />
                      {state.planReviews.length} workout outcome
                      {state.planReviews.length === 1 ? "" : "s"} to review
                    </button>
                  )}
                  {state.questions.length > 0 && (
                    <button
                      disabled={offline}
                      onClick={() => setQuestion(state.questions[0])}
                    >
                      <CircleHelp size={15} />
                      Coach check-in<span>{state.questions.length}</span>
                    </button>
                  )}
                  {state.drafts.length > 0 && (
                    <button onClick={() => setView("imports")}>
                      <Inbox size={15} />
                      {state.drafts.length} draft
                      {state.drafts.length === 1 ? "" : "s"} to review
                      <ArrowUpRight size={13} />
                    </button>
                  )}
                </div>
              )}
              <div className="coach-thread">
                <ThreadPrimitive.Root className="thread-root">
                  <ThreadPrimitive.Viewport
                    className="thread-viewport"
                    autoScroll={chat.messages.length > 0}
                    scrollToBottomOnInitialize={chat.messages.length > 0}
                  >
                    <ThreadPrimitive.Empty>
                      <div className="coach-welcome">
                        <h2>
                          {state.athlete.name
                            ? `What’s next, ${state.athlete.name}?`
                            : "Let’s find your next step."}
                        </h2>
                        <p>
                          Tell me how training went, how you feel, or what needs
                          to change.
                        </p>
                        <div className="starter-prompts">
                          <button
                            onClick={() =>
                              void send("Plan the next three days")
                            }
                            disabled={busy || offline}
                          >
                            Plan three days
                          </button>
                          <button
                            onClick={() => void send("Help me adjust my week")}
                            disabled={busy || offline}
                          >
                            Adjust my week
                          </button>
                          <button
                            onClick={() => {
                              setActivity(undefined);
                              setLogPreset(undefined);
                              setLogSport(undefined);
                              setModal("log");
                            }}
                            disabled={offline}
                          >
                            Log a workout
                          </button>
                        </div>
                      </div>
                    </ThreadPrimitive.Empty>
                    <ThreadPrimitive.Messages
                      components={{ UserMessage, AssistantMessage }}
                    />
                    {busy && (
                      <div className="thinking">
                        <span />
                        <span />
                        <span />
                        <span>Your coach is thinking</span>
                      </div>
                    )}
                  </ThreadPrimitive.Viewport>
                </ThreadPrimitive.Root>
                {chat.error && (
                  <div className="chat-error" role="alert">
                    <p>
                      {chat.error.message.replace(
                        /^\{.*$/,
                        "The connection was interrupted. Your saved changes are safe.",
                      )}
                    </p>
                    <button
                      onClick={() => {
                        chat.clearError();
                        void chat.regenerate();
                      }}
                    >
                      Retry message
                    </button>
                  </div>
                )}
                <form
                  className="composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void send(input);
                  }}
                >
                  <label htmlFor="coach-message" className="sr-only">
                    Message your coach
                  </label>
                  <textarea
                    ref={inputRef}
                    id="coach-message"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Message your coach…"
                    rows={1}
                    maxLength={10000}
                    disabled={offline}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        void send(input);
                      }
                    }}
                  />
                  <div className="composer-bottom">
                    <div className="composer-actions" ref={actionsRef}>
                      <button
                        type="button"
                        className="composer-add"
                        aria-label="Add to your training"
                        aria-haspopup="menu"
                        aria-expanded={actionsOpen}
                        onClick={() => setActionsOpen(!actionsOpen)}
                      >
                        <Plus size={20} />
                      </button>
                      {actionsOpen && (
                        <div
                          className="composer-menu"
                          role="menu"
                          aria-label="Training actions"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            disabled={offline}
                            onClick={() => {
                              setActionsOpen(false);
                              setActivity(undefined);
                              setLogPreset(undefined);
                              setModal("log");
                            }}
                          >
                            <Footprints size={17} />
                            Log workout
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={offline}
                            onClick={() => {
                              setActionsOpen(false);
                              setActivity(undefined);
                              setLogPreset(undefined);
                              setLogSport("strength");
                              setModal("log");
                            }}
                          >
                            <Dumbbell size={17} />
                            Log lifting
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setActionsOpen(false);
                              addImport();
                            }}
                          >
                            <Camera size={17} />
                            Add photo or file
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            disabled={offline}
                            onClick={() => {
                              setActionsOpen(false);
                              setReadinessOpen(true);
                            }}
                          >
                            <Heart size={17} />
                            Daily check-in
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      aria-label="Send message"
                      type="submit"
                      disabled={busy || offline || !input.trim()}
                    >
                      {busy ? (
                        <LoaderCircle size={18} className="spin" />
                      ) : (
                        <ArrowUp size={20} />
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </section>
            {view === "coach" && (
              <aside className="plan-column">{sidebar}</aside>
            )}
            {view === "workouts" && (
              <ProgramsView
                state={state}
                saved={save}
                disabled={offline}
                openWeek={() => setView("week")}
              />
            )}
            {view === "week" && (
              <div className="week-workspace">
                <ProgramSummary
                  state={state}
                  buttonLabel="View or change program"
                  open={() => setView("workouts")}
                />
                <PlanReviews
                  state={state}
                  saved={save}
                  disabled={offline || busy}
                  askCoach={(message) => {
                    setView("coach");
                    void send(message);
                  }}
                />
                <WeekView
                  state={state}
                  openSession={setSession}
                  plan={() =>
                    void send(
                      state.program
                        ? "Review my upcoming week within my chosen program. Explain whether anything needs changing and offer adjustments before revising accepted days."
                        : "Plan my week",
                    )
                  }
                  accept={(ids) => void accept(ids)}
                  disabled={busy || offline}
                />
                <div className="week-tools">
                  <button
                    className="secondary-button"
                    onClick={() => setProposalOpen(true)}
                    disabled={offline}
                  >
                    <Plus size={15} />
                    Add session
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setReadinessOpen(true)}
                    disabled={offline}
                  >
                    <Heart size={15} />
                    Daily check-in
                  </button>
                  <button
                    className="secondary-button"
                    disabled={offline}
                    onClick={() =>
                      void download(
                        "/export/calendar.ics",
                        "be-better-plan.ics",
                      ).catch((error) => setNotice(error.message))
                    }
                  >
                    Export accepted plan
                    <CalendarDays size={15} />
                  </button>
                </div>
                <RacePanel
                  state={state}
                  edit={(race) => {
                    setEditingRace(race);
                    setRaceOpen(true);
                  }}
                  add={() => {
                    setEditingRace(undefined);
                    setRaceOpen(true);
                  }}
                  build={buildBlock}
                  offline={offline}
                />
              </div>
            )}
            {view === "imports" && (
              <div className="imports-workspace">
                <PlanReviews
                  state={state}
                  saved={save}
                  disabled={offline || busy}
                  askCoach={(message) => {
                    setView("coach");
                    void send(message);
                  }}
                />
                <ImportsView
                  state={state}
                  open={setDraftId}
                  add={addImport}
                  sync={sync}
                  connect={() => setModal("settings")}
                  offline={offline}
                />
              </div>
            )}
            {view === "log" && (
              <TrainingLog
                state={state}
                saved={save}
                askCoach={(message) => {
                  setView("coach");
                  void send(message);
                }}
                lift={() => {
                  setActivity(undefined);
                  setLogPreset(undefined);
                  setLogSport("strength");
                  setModal("log");
                }}
                add={() => {
                  setActivity(undefined);
                  setLogPreset(undefined);
                  setModal("log");
                }}
                edit={(activity) => {
                  setActivity(activity);
                  setModal("log");
                }}
                disabled={offline}
              />
            )}
          </main>
          <nav className="mobile-navigation" aria-label="Mobile navigation">
            <button
              className={view === "coach" ? "active" : ""}
              onClick={() => setView("coach")}
            >
              <MessageCircle size={20} />
              <span>Coach</span>
            </button>
            <button
              className={view === "week" ? "active" : ""}
              onClick={() => setView("week")}
            >
              <CalendarDays size={20} />
              <span>My week</span>
            </button>
            <button
              className={view === "workouts" ? "active" : ""}
              onClick={() => setView("workouts")}
            >
              <Library size={20} />
              <span>Programs</span>
            </button>
            <button
              className={view === "log" ? "active" : ""}
              onClick={() => setView("log")}
            >
              <NotebookPen size={20} />
              <span>Log</span>
            </button>
            <button
              className={view === "imports" ? "active" : ""}
              onClick={() => setView("imports")}
            >
              <Inbox size={20} />
              <span>
                Imports{state.drafts.length ? ` (${state.drafts.length})` : ""}
              </span>
            </button>
            <button onClick={() => setPlanOpen(true)}>
              <Route size={20} />
              <span>Next up</span>
            </button>
          </nav>
        </div>
        {notice && (
          <div className="toast" role="status">
            <Check size={16} />
            {notice}
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {modal === "settings" && (
          <Settings
            athlete={state.athlete}
            today={state.today}
            close={() => setModal(null)}
            saved={save}
            reviewImports={() => {
              setModal(null);
              setView("imports");
            }}
          />
        )}
        {importOpen && (
          <ImportPicker
            draftId={importTarget}
            close={() => setImportOpen(false)}
            saved={async () => {
              await refresh();
              setView("imports");
              setNotice(
                "Saved on this device. Uploads will continue when the server is reachable.",
              );
            }}
          />
        )}
        {draftId && state.drafts.find((d) => d.id === draftId) && (
          <DraftCard
            key={`${draftId}-${state.drafts.find((d) => d.id === draftId)?.status}`}
            draft={state.drafts.find((d) => d.id === draftId)!}
            state={state}
            close={() => setDraftId(null)}
            saved={save}
            addPhoto={(id) => {
              setDraftId(null);
              setImportTarget(id);
              setImportOpen(true);
            }}
          />
        )}
        {proposalOpen && (
          <Modal
            title="Make room for a session"
            close={() => setProposalOpen(false)}
          >
            <WorkoutEditor
              today={state.today}
              close={() => setProposalOpen(false)}
              saved={save}
            />
          </Modal>
        )}
        {raceOpen && (
          <RaceDialog
            race={editingRace}
            state={state}
            close={() => setRaceOpen(false)}
            saved={save}
          />
        )}
        {question && (
          <QuestionCard
            question={question}
            close={() => setQuestion(null)}
            saved={save}
          />
        )}
        {readinessOpen && (
          <ReadinessDialog
            state={state}
            close={() => setReadinessOpen(false)}
            saved={save}
          />
        )}
        {modal === "log" && (
          <LogWorkout
            today={state.today}
            units={state.athlete.units}
            activity={activity}
            preset={logPreset}
            initialSport={logSport}
            previousStrength={
              state.activities.find(
                (a) => a.sport === "strength" && a.strengthExercises?.length,
              )?.strengthExercises
            }
            close={() => {
              setModal(null);
              setActivity(undefined);
              setLogPreset(undefined);
              setLogSport(undefined);
            }}
            saved={save}
          />
        )}
        {modal === "help" && (
          <Modal title="Here for your next step" close={() => setModal(null)}>
            <div className="help-content">
              <p>
                Be Better connects your training log, your plan, and a
                conversation with your coach. Your workouts and preferences live
                together on your own server.
              </p>
              <p>
                Log a session, plan a few days, and tell your coach what
                changes. Accept proposals when they fit. Each accepted-plan
                revision keeps a reason you can look back on. Programs lets you
                choose a training direction and preview its calendar. Its
                Workout library lists the coach's example sessions.
              </p>
              {state.coach.mode === "guided" && (
                <div className="reason-card">
                  <span>GUIDED MODE</span>
                  <p>
                    Your coach connection is not ready. Guided mode supports
                    simple workout entries and conservative plans. Sign in with
                    ChatGPT in Settings for open-ended coaching and photo
                    parsing.
                  </p>
                </div>
              )}
              <p>
                On iPhone, use Safari’s Share menu → Add to Home Screen. Your
                saved plan is available offline; coaching needs a connection.
              </p>
              <p className="muted">
                If something hurts, pause and get help from a person who can
                assess it. Your coach helps with training, and cannot diagnose
                an injury.
              </p>
            </div>
          </Modal>
        )}
        {session && (
          <SessionDetails
            session={session}
            today={state.today}
            close={() => setSession(null)}
            saved={save}
            log={() => {
              setSession(null);
              setActivity(undefined);
              setLogPreset(session);
              setModal("log");
            }}
          />
        )}
        {planOpen && (
          <Modal title="Your next steps" close={() => setPlanOpen(false)}>
            {sidebar}
          </Modal>
        )}
      </div>
    </AssistantRuntimeProvider>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      className={`nav-button ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
function MessageText({ text }: TextMessagePartProps) {
  return (
    <div className="message-text">
      <Markdown>{text}</Markdown>
    </div>
  );
}
function HiddenTool() {
  return null;
}
function ToolActivity() {
  const content = useAuiState((state) => state.message.content);
  const calls = content.filter((part) => part.type === "tool-call");
  if (!calls.length) return null;
  const failed = calls.some(
    (part) =>
      part.result &&
      typeof part.result === "object" &&
      "ok" in part.result &&
      part.result.ok === false,
  );
  const pending = calls.some((part) => part.result === undefined);
  const labels: Record<string, string> = {
    log_activity: "Workout saved",
    edit_activity: "Workout updated",
    update_athlete: "Preference saved",
    propose_plan: "Plan proposed",
    revise_session: "Plan adjusted",
    skip_session: "Missed session recorded",
    record_note: "Note saved",
    get_training_context: "Training checked",
    get_training_analysis: "Intervals analysis checked",
    get_activity_analysis: "Workout analysis checked",
    get_activities: "Log checked",
    get_athlete: "Athlete settings checked",
    get_activity: "Workout checked",
    get_plan: "Plan checked",
    build_training_block: "Training block saved",
    propose_training_week: "Week proposed",
    save_race: "Race saved",
    record_question: "Check-in saved",
    resolve_question: "Answer saved",
  };
  return (
    <details className={`tool-activity ${failed ? "refused" : ""}`}>
      <summary>
        {pending ? (
          <LoaderCircle size={13} className="spin" />
        ) : (
          <Check size={13} />
        )}
        {failed
          ? "A change needs attention"
          : pending
            ? "Checking your training…"
            : `Training actions (${calls.length})`}
      </summary>
      <div>
        {calls.map((part) => {
          const result = part.result as
            | { ok?: boolean; reason?: string }
            | undefined;
          return (
            <p key={part.toolCallId}>
              <span>{labels[part.toolName] || "Training updated"}</span>
              {result?.ok === false && (
                <span className="form-error">
                  {result.reason || "This change was refused."}
                </span>
              )}
            </p>
          );
        })}
      </div>
    </details>
  );
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className="user-message">
      <div className="user-bubble">
        <MessagePrimitive.Content components={{ Text: MessageText }} />
      </div>
    </MessagePrimitive.Root>
  );
}
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="assistant-message">
      <div className="assistant-label">
        <span>Coach</span>
      </div>
      <ToolActivity />
      <MessagePrimitive.Content
        components={{ Text: MessageText, tools: { Fallback: HiddenTool } }}
      />
    </MessagePrimitive.Root>
  );
}

function SessionIcon({ sport, intent }: { sport: string; intent: string }) {
  return intent === "rest" ? (
    <Moon size={18} />
  ) : sport === "bike" ? (
    <Bike size={18} />
  ) : sport === "strength" ? (
    <Dumbbell size={18} />
  ) : (
    <Footprints size={18} />
  );
}
function PlanPanel({
  state,
  openSession,
  plan,
  accept,
  disabled,
}: {
  state: AppState;
  openSession: (session: PlanSession) => void;
  plan: () => void;
  accept: (ids: string[]) => void;
  disabled: boolean;
}) {
  const sessions = state.plan.filter(
    (session) =>
      session.date >= state.today &&
      session.date <= addDays(state.today, 13) &&
      ["proposed", "accepted"].includes(session.status),
  );
  const pending = sessions.filter((session) => session.status === "proposed");
  const next = sessions.find((session) =>
    ["proposed", "accepted"].includes(session.status),
  );
  return (
    <>
      <div className="plan-heading">
        <h2>Up next</h2>
        {state.block && (
          <span className={`phase-badge phase-${state.block.phase}`}>
            {state.block.phase}
          </span>
        )}
      </div>
      <details className="week-overview">
        <summary>
          This week{" "}
          <span>{formatDuration(state.stats.weeklySeconds)} logged</span>
        </summary>
        <WeekChart state={state} />
      </details>
      {sessions.length ? (
        <div className="up-next-list">
          {sessions.map((session) => (
            <button
              className={`up-next-item ${session.id === next?.id ? "featured" : ""}`}
              key={session.id}
              disabled={disabled}
              onClick={() => openSession(session)}
            >
              <div className="session-day">
                <strong>
                  {session.date === state.today
                    ? "Today"
                    : dateLabel(session.date, { weekday: "short" })}
                </strong>
                <span>
                  {dateLabel(session.date, { day: "numeric", month: "short" })}
                </span>
              </div>
              <span
                className={`session-icon ${session.intent === "rest" ? "rest" : ""}`}
              >
                <SessionIcon sport={session.sport} intent={session.intent} />
              </span>
              <div className="session-title">
                <strong>{session.title}</strong>
                <span>
                  {session.durationSeconds
                    ? `${formatDuration(session.durationSeconds)} · RPE ${session.rpeTarget}`
                    : "Let your body catch up"}
                  <span
                    className={`status-dot ${session.status}`}
                    title={session.status}
                  />
                </span>
              </div>
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <div className="plan-empty compact-plan">
          <p>No sessions planned yet.</p>
          <button
            className="secondary-button"
            onClick={plan}
            disabled={disabled}
          >
            Plan three days
            <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      {pending.length > 0 && (
        <button
          className="primary-button accept-plan"
          onClick={() => accept(pending.map((session) => session.id))}
          disabled={disabled}
        >
          Accept this plan
          <Check size={16} />
        </button>
      )}
      <p className="plan-availability">
        Long runs on {weekdays[state.athlete.longRunDay]}.{" "}
        {state.athlete.restDays.length
          ? `Rest on ${state.athlete.restDays.map((day) => weekdays[day].slice(0, 3)).join(", ")}.`
          : "Rest days are flexible."}
      </p>
    </>
  );
}
function WeekChart({ state }: { state: AppState }) {
  const monday = weekStart(state.today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const data = days.map((date) => ({
    date,
    done: state.activities
      .filter((activity) => activity.confirmed && activity.date === date)
      .reduce((sum, activity) => sum + activity.durationSeconds / 60, 0),
    planned: state.plan
      .filter(
        (session) =>
          session.date === date &&
          ["accepted", "proposed"].includes(session.status),
      )
      .reduce((sum, session) => sum + session.durationSeconds / 60, 0),
  }));
  const max = Math.max(60, ...data.flatMap((day) => [day.done, day.planned]));
  return (
    <div className="week-chart">
      <div className="week-total">
        <div>
          <strong>{formatDuration(state.stats.weeklySeconds)}</strong>
          <span>TRAINING THIS WEEK</span>
        </div>
        <span className="week-session-count">
          <TrendingUp size={13} />
          {state.stats.weeklyActivities} session
          {state.stats.weeklyActivities === 1 ? "" : "s"}
        </span>
      </div>
      <div
        className="chart-bars"
        role="img"
        aria-label={`Completed training this week: ${formatDuration(state.stats.weeklySeconds)}. ${data.map((day) => `${dateLabel(day.date, { weekday: "long" })}: ${day.done} minutes completed, ${day.planned} planned`).join(". ")}`}
      >
        {data.map((day) => (
          <div
            key={day.date}
            className={`chart-day ${day.date === state.today ? "today" : ""}`}
            title={`${day.done} min completed · ${day.planned} min planned`}
          >
            <div className="bar-track">
              {day.planned > 0 && (
                <span
                  className="planned-bar"
                  style={{
                    height: `${Math.max(5, (day.planned / max) * 100)}%`,
                  }}
                />
              )}
              {day.done > 0 && (
                <span
                  className="completed-bar"
                  style={{ height: `${Math.max(5, (day.done / max) * 100)}%` }}
                />
              )}
            </div>
            <span>{dateLabel(day.date, { weekday: "short" }).slice(0, 1)}</span>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span>
          <i />
          Completed
        </span>
        <span>
          <i />
          Planned
        </span>
        <span>
          {dateLabel(monday, { month: "short", day: "numeric" })}–
          {dateLabel(addDays(monday, 6), { day: "numeric" })}
        </span>
      </div>
      <p className="load-summary">
        Effort load: {state.stats.acuteLoad.toFixed(1)} 7-day ·{" "}
        {state.stats.fourWeekAverageLoad.toFixed(1)} four-week average
        {state.stats.loadEstimated ? " · includes estimates" : ""}
      </p>
    </div>
  );
}

function WeekView({
  state,
  openSession,
  plan,
  accept,
  disabled,
}: {
  state: AppState;
  openSession: (session: PlanSession) => void;
  plan: () => void;
  accept: (ids: string[]) => void;
  disabled: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const from = addDays(state.today, offset * 7);
  const pending = state.plan.filter(
    (session) =>
      session.status === "proposed" &&
      session.date >= from &&
      session.date <= addDays(from, 6),
  );
  return (
    <section className="week-view">
      <div className="view-heading">
        <div>
          <span className="eyebrow">MAKE ROOM FOR PROGRESS</span>
          <h1>Your week.</h1>
          <p>A plan you can follow. And change when life happens.</p>
        </div>
        <button className="primary-button" disabled={disabled} onClick={plan}>
          {state.program ? "Review my week" : "Plan my week"}
          <Sparkles size={16} />
        </button>
      </div>
      <div className="week-toolbar">
        <h2>
          {dateLabel(from, { month: "long", day: "numeric" })} —{" "}
          {dateLabel(addDays(from, 6), { month: "short", day: "numeric" })}
        </h2>
        <div>
          <button
            className="icon-button"
            aria-label="Previous seven days"
            onClick={() => setOffset((value) => Math.max(-2, value - 1))}
            disabled={offset === -2}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Next seven days"
            onClick={() => setOffset((value) => Math.min(52, value + 1))}
            disabled={offset === 52}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <div className="week-days">
        {Array.from({ length: 7 }, (_, i) => {
          const date = addDays(from, i);
          const sessions = state.plan.filter(
            (session) => session.date === date,
          );
          return (
            <div
              key={date}
              className={`week-day-card ${date === state.today ? "today" : ""}`}
            >
              <div className="week-date">
                <span>{dateLabel(date, { weekday: "short" })}</span>
                <strong>{dateLabel(date, { day: "numeric" })}</strong>
                {date === state.today && (
                  <span className="today-chip">Today</span>
                )}
              </div>
              {state.races
                .filter((race) => race.date === date)
                .map((race) => (
                  <div key={race.id} className="race-event">
                    <Flag size={16} />
                    <strong>{race.name}</strong>
                    <span>
                      {race.priority} race ·{" "}
                      {formatDistance(race.distanceMetres, state.athlete.units)}
                    </span>
                    {race.goal && <small>{race.goal}</small>}
                  </div>
                ))}
              {sessions.length ? (
                sessions.map((session) => (
                  <button
                    className={`week-session ${session.intent === "rest" ? "rest" : ""}`}
                    key={session.id}
                    onClick={() => openSession(session)}
                    disabled={disabled}
                  >
                    <SessionIcon
                      sport={session.sport}
                      intent={session.intent}
                    />
                    <span className={`status ${session.status}`}>
                      {sessionStatusLabel(session)}
                    </span>
                    <h3>{session.title}</h3>
                    <p>
                      {session.durationSeconds
                        ? `${formatDuration(session.durationSeconds)} · RPE ${session.rpeTarget}`
                        : "Recovery day"}
                    </p>
                    <small>{session.reason}</small>
                  </button>
                ))
              ) : (
                <div className="unscheduled">
                  <span>Room to move</span>
                  <small>No session planned</small>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {pending.length > 0 && (
        <div className="week-accept">
          <p>These are proposals. Make them yours when they fit.</p>
          <button
            className="primary-button"
            onClick={() => accept(pending.map((session) => session.id))}
            disabled={disabled}
          >
            Accept proposed sessions
            <Check size={16} />
          </button>
        </div>
      )}
      <div className="week-bottom">
        <div>
          <span className="eyebrow">THE WORK BEHIND THE PLAN</span>
          <WeekChart state={state} />
        </div>
        <div className="decision-notes">
          <span className="eyebrow">WHY WE CHANGED COURSE</span>
          {state.notes
            .filter((note) => note.kind === "decision")
            .slice(0, 5)
            .map((note) => (
              <article key={note.id}>
                <span>
                  {new Date(note.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    timeZone: state.athlete.timezone,
                  })}
                </span>
                <p>{note.text}</p>
              </article>
            ))}
          {!state.notes.some((note) => note.kind === "decision") && (
            <p className="muted">
              When an accepted session changes, the reason lives here. A little
              context for your future self.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
function TrainingLog({
  state,
  saved,
  askCoach,
  add,
  lift,
  edit,
  disabled,
}: {
  state: AppState;
  saved: () => Promise<void>;
  askCoach: (message: string) => void;
  add: () => void;
  lift: () => void;
  edit: (activity: Activity) => void;
  disabled: boolean;
}) {
  const confirmed = state.activities.filter((activity) => activity.confirmed);
  return (
    <section className="training-log">
      <div className="view-heading">
        <div>
          <span className="eyebrow">YOUR WORK, WRITTEN DOWN</span>
          <h1>Every session counts.</h1>
          <p>The last 28 days of showing up.</p>
        </div>
        <div className="log-actions">
          <button
            className="secondary-button"
            onClick={lift}
            disabled={disabled}
          >
            <Dumbbell size={16} /> Log lifting
          </button>
          <button className="primary-button" onClick={add} disabled={disabled}>
            Log a workout
            <Plus size={16} />
          </button>
        </div>
      </div>
      <PlanReviews
        state={state}
        saved={saved}
        disabled={disabled}
        askCoach={askCoach}
      />
      <div className="log-stats">
        <div>
          <Clock3 size={19} />
          <strong>
            {formatDuration(
              confirmed.reduce(
                (sum, activity) => sum + activity.durationSeconds,
                0,
              ),
            )}
          </strong>
          <span>Total time</span>
        </div>
        <div>
          <Route size={19} />
          <strong>
            {formatDistance(
              confirmed.reduce(
                (sum, activity) => sum + (activity.distanceMetres ?? 0),
                0,
              ),
              state.athlete.units,
            )}
          </strong>
          <span>Total distance</span>
        </div>
        <div>
          <Footprints size={19} />
          <strong>{confirmed.length}</strong>
          <span>Sessions logged</span>
        </div>
      </div>
      {confirmed.length ? (
        <div className="activity-list">
          {confirmed.map((activity) => (
            <button
              className="activity-row"
              key={activity.id}
              onClick={() => edit(activity)}
              disabled={disabled}
            >
              <span className="session-icon">
                <SessionIcon sport={activity.sport} intent={activity.intent} />
              </span>
              <div>
                <strong>
                  {activity.sport === "strength" ? (
                    activity.title || "Strength / lifting"
                  ) : (
                    <>
                      {activity.intent === "quality"
                        ? "Quality"
                        : activity.intent === "long"
                          ? "Long"
                          : activity.intent === "easy"
                            ? "Easy"
                            : activity.intent}{" "}
                      {activity.sport === "bike"
                        ? "ride"
                        : activity.sport === "trail"
                          ? "trail run"
                          : activity.sport}
                    </>
                  )}
                </strong>
                <span>
                  {dateLabel(activity.date, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {activity.feel ? ` · ${activity.feel}` : ""}
                </span>
                {activity.planDecision === "additional" ? (
                  <span>Additional training</span>
                ) : activity.planSessionId ? (
                  <span>
                    {sessionStatusLabel(
                      state.plan.find(
                        (s) => s.id === activity.planSessionId,
                      ) ?? { status: "done" },
                    )}
                    {state.plan.find((s) => s.id === activity.planSessionId)
                      ?.title
                      ? ` · ${state.plan.find((s) => s.id === activity.planSessionId)!.title}`
                      : ""}
                  </span>
                ) : null}
                {activity.strengthExercises?.length ? (
                  <span className="strength-summary">
                    {strengthSummary(activity.strengthExercises)}
                  </span>
                ) : null}
              </div>
              <span>{formatDuration(activity.durationSeconds)}</span>
              <span>
                {activity.distanceMetres != null
                  ? formatDistance(activity.distanceMetres, state.athlete.units)
                  : "—"}
              </span>
              <span className="rpe-tag">
                {activity.rpe != null ? `RPE ${activity.rpe}` : "Add effort"}
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      ) : (
        <div className="log-empty">
          <Footprints size={40} strokeWidth={1.2} />
          <h2>Your story starts with one session.</h2>
          <p>
            A short run. A long ride. A day you showed up.
            <br />
            Write it down, and we’ll build from there.
          </p>
          <button
            className="secondary-button"
            onClick={add}
            disabled={disabled}
          >
            Log your first workout
            <ArrowUpRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
