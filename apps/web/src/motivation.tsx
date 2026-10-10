import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Check,
  PenLine,
  RotateCcw,
  Share,
  Shuffle,
  Undo2,
} from "lucide-react";
import {
  emptyMotivation,
  formatDistance,
  formatDuration,
  formatElevation,
  motivationDeck,
  motivationMoods,
  motivationThemeLabels,
  motivationThemes,
  plainCardText,
  type Activity,
  type AppState,
  type MotivationCard,
  type MotivationMood,
  type MotivationTheme,
} from "../../../packages/domain/src/index.js";
import { api, operationId } from "./api.js";
import { ErrorLine, Modal } from "./dialogs.js";
import {
  barcode,
  climbProfile,
  contours,
  lockScreenImage,
  moodNames,
  palettes,
  paletteStyle,
  random,
  segments,
  shuffled,
} from "./motivation-art.js";

type Filter = "all" | MotivationTheme | "receipts" | "yours" | "kept";
interface Face {
  id: string;
  kicker: string;
  front: string;
  back: string;
  mood: MotivationMood;
}
type CardSlide = Face & {
  kind: "card";
  theme?: MotivationTheme;
  today?: boolean;
  own?: MotivationCard;
};
type ReceiptSlide = Face & {
  kind: "receipt";
  number: number;
  label: string;
  meta: string;
  rows: [string, string][];
  log?: boolean;
};
type Slide =
  | CardSlide
  | ReceiptSlide
  | { kind: "summit"; id: string }
  | { kind: "write"; id: string; first: boolean }
  | { kind: "empty"; id: string };

const filters: [Filter, string][] = [
  ["all", "All"],
  ...motivationThemes.map((theme): [Filter, string] => [
    theme,
    motivationThemeLabels[theme],
  ]),
  ["receipts", "Receipts"],
  ["yours", "Yours"],
  ["kept", "Kept"],
];
const sportNames: Record<Activity["sport"], string> = {
  run: "Run",
  trail: "Trail run",
  bike: "Ride",
  walk: "Walk",
  strength: "Strength",
  other: "Session",
};
const pad = (value: number) => String(value).padStart(2, "0");
const EVEREST_METRES = 8849;

/** Evidence from the athlete's own log, written as receipts. */
function receipts(state: AppState): ReceiptSlide[] {
  const { records } = state.motivation;
  const units = state.athlete.units;
  const date = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year:
        value.slice(0, 4) === state.today.slice(0, 4) ? undefined : "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  const meta = (activity: Activity) =>
    `${date(activity.date)} · ${sportNames[activity.sport]}`;
  const list: Omit<ReceiptSlide, "kind" | "kicker" | "number">[] = [];
  if (!records.sessions)
    list.push({
      id: "receipt-first",
      label: "No receipts yet",
      meta: "Your log is empty",
      rows: [["Sessions", "0"]],
      front: "Your first receipt is *one session* away.",
      back: "Log anything: a walk, a ride, twenty minutes. It all counts here.",
      mood: "night",
      log: true,
    });
  if (records.longest && records.sessions > 1) {
    const activity = records.longest;
    list.push({
      id: "receipt-longest",
      label: "Longest session",
      meta: meta(activity),
      rows: [
        ["Time", formatDuration(activity.durationSeconds)],
        ...(activity.distanceMetres
          ? [
              ["Distance", formatDistance(activity.distanceMetres, units)] as [
                string,
                string,
              ],
            ]
          : []),
      ],
      front: `You once kept going for *${formatDuration(activity.durationSeconds)}*.`,
      back: "When today feels long, remember that one. You’ve already done the harder version.",
      mood: "night",
    });
  }
  if (records.biggestClimb?.elevationGainMetres) {
    const activity = records.biggestClimb;
    const climb = formatElevation(activity.elevationGainMetres!, units);
    list.push({
      id: "receipt-climb",
      label: "Biggest climb",
      meta: meta(activity),
      rows: [
        ["Climb", climb],
        ["Time", formatDuration(activity.durationSeconds)],
      ],
      front: `You climbed *${climb}* in one go.`,
      back: `That’s about ${Math.max(1, Math.round(activity.elevationGainMetres! / 3)).toLocaleString("en-US")} flights of stairs. You chose that. You can choose it again.`,
      mood: "summit",
    });
  }
  if (records.hardest) {
    const activity = records.hardest;
    list.push({
      id: "receipt-hardest",
      label: "Hardest effort",
      meta: meta(activity),
      rows: [
        ["Effort", `RPE ${activity.rpe}`],
        ["Time", formatDuration(activity.durationSeconds)],
      ],
      front: `You went to *RPE ${activity.rpe}* and came back.`,
      back: "You know what hard feels like, and you know you get through it. When the plan asks for hard, you have proof.",
      mood: "clay",
    });
  }
  if (records.streak.weeks >= 2 && records.streak.since)
    list.push({
      id: "receipt-streak",
      label: "Weekly streak",
      meta: `Since the week of ${date(records.streak.since)}`,
      rows: [
        ["Weeks", String(records.streak.weeks)],
        ["This week", records.streak.thisWeek ? "Done" : "Still open"],
      ],
      front: `*${records.streak.weeks} weeks* in a row with at least one session.`,
      back: records.streak.thisWeek
        ? "This week is already in the bank. Keep stacking them."
        : "This week doesn’t count yet. Twenty minutes keeps the streak alive.",
      mood: "night",
    });
  if (records.climbMetres > (records.biggestClimb?.elevationGainMetres ?? 0)) {
    const everest = records.climbMetres / EVEREST_METRES;
    const share =
      everest >= 1
        ? `${everest.toFixed(1)}×`
        : `${Math.max(1, Math.round(everest * 100))}%`;
    list.push({
      id: "receipt-total-climb",
      label: "Total climb",
      meta: "Every hill you’ve logged",
      rows: [
        ["Climbed", formatElevation(records.climbMetres, units)],
        ["Everest", share],
      ],
      front: `You’ve climbed *${formatElevation(records.climbMetres, units)}* so far.`,
      back:
        everest >= 1
          ? `That’s ${share} the height of Everest, one hill at a time. Keep climbing.`
          : `That’s ${share} of the way up Everest, one hill at a time. Keep climbing.`,
      mood: "summit",
    });
  }
  if (records.sessions >= 3)
    list.push({
      id: "receipt-total",
      label: "All time",
      meta: "Everything you’ve logged",
      rows: [
        ["Sessions", records.sessions.toLocaleString("en-US")],
        ["Time", formatDuration(records.seconds)],
        ...(records.distanceMetres
          ? [
              ["Distance", formatDistance(records.distanceMetres, units)] as [
                string,
                string,
              ],
            ]
          : []),
      ],
      front: `*${records.sessions.toLocaleString("en-US")} sessions.* Every one was a choice.`,
      back: "Nobody made you do any of them. Make one more.",
      mood: "clay",
    });
  return list.map((receipt, i) => ({
    ...receipt,
    kind: "receipt",
    kicker: "Receipt",
    number: i + 1,
  }));
}

function interleave<T>(base: T[], extra: T[], start: number, every: number) {
  const list = [...base];
  extra.forEach((item, i) =>
    list.splice(Math.min(list.length, start + i * every), 0, item),
  );
  return list;
}

function buildSlides(state: AppState, filter: Filter, seed: string): Slide[] {
  const { cards, kept } = state.motivation;
  const own: CardSlide[] = cards.map((card) => ({
    kind: "card",
    id: card.id,
    kicker: "Yours",
    front: card.front,
    back: card.back,
    mood: card.mood,
    own: card,
  }));
  const builtIn: CardSlide[] = motivationDeck.map((card) => ({
    ...card,
    kind: "card",
    kicker: motivationThemeLabels[card.theme],
  }));
  const summit: Slide = { kind: "summit", id: "summit" };
  if (filter === "yours")
    return [...own, { kind: "write", id: "write", first: !own.length }];
  if (filter === "receipts") return [...receipts(state), summit];
  if (filter === "kept") {
    const byId = new Map([...own, ...builtIn].map((card) => [card.id, card]));
    const list = kept.flatMap((id) => byId.get(id) ?? []);
    return list.length ? [...list, summit] : [{ kind: "empty", id: "empty" }];
  }
  if (filter !== "all")
    return [
      ...shuffled(
        builtIn.filter((card) => card.theme === filter),
        `${seed}-${filter}`,
      ),
      summit,
    ];
  // Today's card depends only on the date, so shuffling never replaces it.
  const pool = [...own, ...builtIn];
  const today =
    pool[Math.floor(random(`today-${state.today}`)() * pool.length)];
  const others = (list: CardSlide[]) =>
    shuffled(
      list.filter((card) => card.id !== today.id),
      seed,
    );
  return [
    { ...today, today: true },
    ...interleave<Slide>(
      interleave(others(builtIn), others(own), 1, 4),
      receipts(state),
      2,
      6,
    ),
    summit,
  ];
}

function lineSize(text: string) {
  const length = plainCardText(text).length;
  return length <= 34 ? "short" : length > 80 ? "long" : "";
}

function Highlighted({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((segment, i) =>
        segment.mark ? (
          <mark key={i}>{segment.text}</mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

const art = new Map<string, ReturnType<typeof contours>>();
function Topo({ seed, flag = false }: { seed: string; flag?: boolean }) {
  let map = art.get(seed);
  if (!map)
    art.set(
      seed,
      (map = contours(seed, 400, 520, flag ? [200, 205] : undefined)),
    );
  const [x, y] = map.peak;
  return (
    <svg
      className="mcard-topo"
      viewBox="0 0 400 520"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {map.rings.map((ring, i) => (
        <path key={i} d={ring.d} className={ring.index ? "index" : undefined} />
      ))}
      {flag ? (
        <g className="topo-flag" transform={`translate(${x} ${y})`}>
          <path d="M0 0V-38" />
          <path d="M0-38h22l-6 7.5 6 7.5H0z" />
        </g>
      ) : (
        <path className="peak" d={`M${x} ${y - 5}l5 8.5h-10z`} />
      )}
    </svg>
  );
}

function zigzagEdges(teeth = 28, depth = 6) {
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= teeth; i++) {
    const x = (i / teeth) * 100;
    top.push(`${x}% ${i % 2 ? depth : 0}px`);
    bottom.unshift(`${x}% calc(100% - ${i % 2 ? depth : 0}px)`);
  }
  return `polygon(${[...top, ...bottom].join(",")})`;
}
const receiptEdges = zigzagEdges();

function Receipt({ slide }: { slide: ReceiptSlide }) {
  return (
    <div className="receipt-wrap">
      <div className="receipt" style={{ clipPath: receiptEdges }}>
        <div className="receipt-head">
          <span>BE BETTER</span>
          <span>No. {String(slide.number).padStart(3, "0")}</span>
        </div>
        <hr />
        <strong>{slide.label}</strong>
        <span className="receipt-meta">{slide.meta}</span>
        <dl>
          {slide.rows.map(([name, value]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <hr />
        <p className="receipt-line">
          <Highlighted text={slide.front} />
        </p>
        <hr className="receipt-extra" />
        <span className="receipt-thanks receipt-extra">
          Thank you for showing up
        </span>
        <svg
          className="receipt-barcode receipt-extra"
          viewBox="0 0 196 28"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {barcode(slide.id).map(([x, width]) => (
            <rect key={x} x={x} width={width} height="28" />
          ))}
        </svg>
      </div>
    </div>
  );
}

function FlipCard({
  slide,
  position,
  near,
  flipped,
  flip,
  kept,
  keep,
  share,
  edit,
  ask,
  logWorkout,
  offline,
}: {
  slide: CardSlide | ReceiptSlide;
  position: number;
  near: boolean;
  flipped: boolean;
  flip: () => void;
  kept: boolean;
  keep: () => void;
  share: () => void;
  edit: () => void;
  ask?: () => void;
  logWorkout: () => void;
  offline: boolean;
}) {
  const palette = palettes[slide.mood];
  const canFlip = Boolean(slide.back);
  const stop = (event: MouseEvent) => event.stopPropagation();
  return (
    <div className={`mcard ${flipped ? "flipped" : ""}`}>
      <div className="mcard-turner">
        <div
          className={`mcard-face ${palette.front.band ? "band" : ""} ${canFlip ? "flippable" : ""}`}
          style={paletteStyle(palette.front)}
          inert={flipped}
          onClick={canFlip ? flip : undefined}
        >
          {near && <Topo seed={slide.id} />}
          <header className="mcard-kicker">
            <span>
              {slide.kind === "card" && slide.today && <b>Today</b>}
              {slide.kicker}
            </span>
            <span>{pad(position)}</span>
          </header>
          {slide.kind === "receipt" ? (
            <Receipt slide={slide} />
          ) : (
            <p className={`mcard-line ${lineSize(slide.front)}`}>
              <Highlighted text={slide.front} />
            </p>
          )}
          <footer className="mcard-actions" onClick={stop}>
            {canFlip && (
              <button className="mcard-turn" onClick={flip}>
                <RotateCcw size={15} />
                Now what?
              </button>
            )}
            <span className="mcard-spacer" />
            {slide.kind === "card" && (
              <>
                {slide.own && (
                  <button
                    className="mcard-icon"
                    aria-label="Edit card"
                    onClick={edit}
                    disabled={offline}
                  >
                    <PenLine size={17} />
                  </button>
                )}
                <button
                  className="mcard-icon"
                  aria-label="Keep this card"
                  aria-pressed={kept}
                  onClick={keep}
                  disabled={offline}
                >
                  {kept ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
                </button>
                <button
                  className="mcard-icon"
                  aria-label="Share as a lock screen image"
                  onClick={share}
                >
                  <Share size={17} />
                </button>
              </>
            )}
          </footer>
        </div>
        {canFlip && (
          <div
            className={`mcard-face mcard-back flippable ${palette.back.band ? "band" : ""}`}
            style={paletteStyle(palette.back)}
            inert={!flipped}
            onClick={flip}
          >
            {near && <Topo seed={`${slide.id}-back`} />}
            <header className="mcard-kicker">
              <span>Now what</span>
              <span>{pad(position)}</span>
            </header>
            <p className="mcard-echo">{plainCardText(slide.front)}</p>
            <p
              className={`mcard-answer ${plainCardText(slide.back).length > 200 ? "long" : ""}`}
            >
              <Highlighted text={slide.back} />
            </p>
            <footer className="mcard-actions" onClick={stop}>
              <button className="mcard-turn" onClick={flip}>
                <Undo2 size={15} />
                Back
              </button>
              <span className="mcard-spacer" />
              {slide.kind === "receipt" && slide.log ? (
                <button
                  className="mcard-go"
                  onClick={logWorkout}
                  disabled={offline}
                >
                  Log a workout
                  <ArrowUpRight size={15} />
                </button>
              ) : ask ? (
                <button className="mcard-go" onClick={ask}>
                  Ask my coach
                  <ArrowUpRight size={15} />
                </button>
              ) : null}
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({
  seed,
  mood,
  kicker,
  position,
  line,
  note,
  near,
  flag = false,
  children,
}: {
  seed: string;
  mood: MotivationMood;
  kicker: string;
  position?: number;
  line: string;
  note?: string;
  near: boolean;
  flag?: boolean;
  children?: ReactNode;
}) {
  const palette = palettes[mood].front;
  return (
    <div className="mcard">
      <div
        className={`mcard-face ${palette.band ? "band" : ""}`}
        style={paletteStyle(palette)}
      >
        {near && <Topo seed={seed} flag={flag} />}
        <header className="mcard-kicker">
          <span>{kicker}</span>
          {position ? <span>{pad(position)}</span> : null}
        </header>
        <p className="mcard-line">
          <Highlighted text={line} />
        </p>
        {note && <p className="mcard-note">{note}</p>}
        {children && <footer className="mcard-actions wrap">{children}</footer>}
      </div>
    </div>
  );
}

function Climb({
  count,
  index,
  jump,
}: {
  count: number;
  index: number;
  jump: (index: number) => void;
}) {
  const profile = useMemo(() => climbProfile(count), [count]);
  const clip = `climb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [x, y] = profile.points[Math.min(index, profile.points.length - 1)];
  const summit = count > 1 && index === count - 1;
  return (
    <div className="climb">
      <span className="climb-count">
        {summit ? "Summit" : `${pad(index + 1)} / ${pad(count)}`}
      </span>
      <div
        className="climb-track"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          jump(
            Math.round(((event.clientX - box.left) / box.width) * (count - 1)),
          );
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clip}>
              <rect width={x} height="100" />
            </clipPath>
          </defs>
          <path className="climb-area" d={profile.area} />
          <path
            className="climb-done"
            d={profile.area}
            clipPath={`url(#${clip})`}
          />
          <path className="climb-line" d={profile.line} />
        </svg>
        <span className="climb-dot" style={{ left: `${x}%`, top: `${y}%` }} />
      </div>
    </div>
  );
}

function CardEditor({
  card,
  close,
  saved,
}: {
  card?: MotivationCard;
  close: () => void;
  saved: (message: string, created: boolean) => Promise<void>;
}) {
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");
  const [mood, setMood] = useState<MotivationMood>(card?.mood ?? "summit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const palette = palettes[mood].front;
  const shown = front.trim() || "Earn the *coffee*.";
  async function run(work: () => Promise<unknown>, message: string) {
    setError("");
    setBusy(true);
    try {
      await work();
      await saved(message, !card);
      close();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(
      () =>
        api(
          card ? `/motivation/cards/${card.id}` : "/motivation/cards",
          { card: { front, back, mood }, operationId: operationId() },
          card ? "PATCH" : "POST",
        ),
      card ? "Card updated." : "Card added to your deck.",
    );
  }
  return (
    <Modal title={card ? "Edit your card" : "Write a card"} close={close}>
      <p className="modal-intro">
        Write the line you need to hear on a hard day. Wrap words in *asterisks*
        to highlight them.
      </p>
      <div
        className={`card-preview mcard-face ${palette.band ? "band" : ""}`}
        style={paletteStyle(palette)}
        aria-hidden="true"
      >
        <Topo seed={card?.id ?? "new-card"} />
        <header className="mcard-kicker">
          <span>Yours</span>
        </header>
        <p className={`mcard-line ${lineSize(shown)}`}>
          <Highlighted text={shown} />
        </p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label>
          The line
          <textarea
            value={front}
            onChange={(event) => setFront(event.target.value)}
            rows={2}
            maxLength={160}
            placeholder="Earn the *coffee*."
            required
          />
        </label>
        <label>
          Now what? (optional)
          <textarea
            value={back}
            onChange={(event) => setBack(event.target.value)}
            rows={2}
            maxLength={400}
            placeholder="What should you do when this one hits?"
          />
        </label>
        <fieldset className="mood-picker">
          <legend>Color</legend>
          {motivationMoods.map((value) => (
            <label
              key={value}
              className="mood-swatch"
              style={paletteStyle(palettes[value].front)}
              title={moodNames[value]}
            >
              <input
                type="radio"
                name="mood"
                value={value}
                checked={mood === value}
                onChange={() => setMood(value)}
              />
              <span className="sr-only">{moodNames[value]}</span>
            </label>
          ))}
        </fieldset>
        <ErrorLine error={error} />
        <button className="primary-button" disabled={busy || !front.trim()}>
          {busy ? "Saving…" : card ? "Save changes" : "Add to my deck"}
          <Check size={16} />
        </button>
        {card &&
          (confirming ? (
            <div className="delete-confirm" role="group">
              <span>Delete this card?</span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="secondary-button danger"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      api(
                        `/motivation/cards/${card.id}`,
                        { operationId: operationId() },
                        "DELETE",
                      ),
                    "Card deleted.",
                  )
                }
              >
                Delete
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="text-button"
              onClick={() => setConfirming(true)}
            >
              Delete card
            </button>
          ))}
      </form>
    </Modal>
  );
}

async function shareImage(card: Face, notify: (message: string) => void) {
  // Drawing and encoding synchronously keeps the tap's permission to open
  // the share sheet.
  const data = atob(lockScreenImage(card).toDataURL("image/png").split(",")[1]);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  const file = new File([bytes], `be-better-${card.id}.png`, {
    type: "image/png",
  });
  if (navigator.canShare?.({ files: [file] }))
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
    }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  notify("Lock screen image saved.");
}

export function MotivationView({
  state: live,
  offline,
  coachReady,
  refresh,
  notify,
  askCoach,
  logWorkout,
  openWeek,
}: {
  state: AppState;
  offline: boolean;
  coachReady: boolean;
  refresh: () => Promise<unknown>;
  notify: (message: string) => void;
  askCoach: (message: string) => void;
  logWorkout: () => void;
  openWeek: () => void;
}) {
  // A freshly updated app can briefly talk to a server without cards yet.
  const state = useMemo(
    () => ({ ...live, motivation: live.motivation ?? emptyMotivation }),
    [live],
  );
  const { cards, kept } = state.motivation;
  const [filter, setFilter] = useState<Filter>("all");
  const [seed, setSeed] = useState(state.today);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<MotivationCard | "new" | null>(null);
  const deck = useRef<HTMLDivElement>(null);
  const chips = useRef<HTMLDivElement>(null);
  const slides = useMemo(
    () => buildSlides(state, filter, seed),
    [state, filter, seed],
  );
  const current = Math.min(index, slides.length - 1);

  useEffect(() => {
    deck.current?.scrollTo({ top: 0 });
    setIndex(0);
    setFlipped(new Set());
    chips.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [filter, seed]);

  // Each slide is a little shorter than the deck, so the next card peeks in.
  const slideHeight = () =>
    (deck.current?.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0;
  const go = (target: number) => {
    const element = deck.current;
    if (!element) return;
    element.scrollTo({
      top: Math.max(0, Math.min(slides.length - 1, target)) * slideHeight(),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  const flip = (id: string) =>
    setFlipped((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const isKept = (id: string) => pending[id] ?? kept.includes(id);
  async function keep(id: string) {
    const next = !isKept(id);
    setPending((previous) => ({ ...previous, [id]: next }));
    try {
      await api("/motivation/keeps", {
        cardId: id,
        kept: next,
        operationId: operationId(),
      });
      await refresh();
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setPending((previous) => {
        const rest = { ...previous };
        delete rest[id];
        return rest;
      });
    }
  }

  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (document.querySelector("dialog[open]")) return;
    const target =
      event.target instanceof Element ? event.target : document.body;
    if (target.closest("input, textarea, select")) return;
    if (["ArrowDown", "PageDown", "j"].includes(event.key)) {
      event.preventDefault();
      go(current + 1);
    } else if (["ArrowUp", "PageUp", "k"].includes(event.key)) {
      event.preventDefault();
      go(current - 1);
    } else if (event.key === " " && !target.closest("button, a")) {
      const slide = slides[current];
      if ("back" in slide && slide.back) {
        event.preventDefault();
        flip(slide.id);
      }
    }
  };
  useEffect(() => {
    const handle = (event: KeyboardEvent) => keys.current(event);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  function slideContent(slide: Slide, i: number) {
    const near = Math.abs(i - current) <= 2;
    const position = i + 1;
    if (slide.kind === "summit")
      return (
        <NoteCard
          seed="summit"
          mood="summit"
          kicker="Summit"
          position={position}
          line="That’s the top. *Now go earn the next one.*"
          near={near}
          flag
        >
          <button
            className="mcard-go solid"
            onClick={logWorkout}
            disabled={offline}
          >
            Log a workout
            <ArrowUpRight size={15} />
          </button>
          <button className="mcard-go" onClick={openWeek}>
            See my week
            <CalendarDays size={15} />
          </button>
          <button className="mcard-turn" onClick={() => go(0)}>
            <RotateCcw size={15} />
            Back to the top
          </button>
        </NoteCard>
      );
    if (slide.kind === "write")
      return (
        <NoteCard
          seed="write"
          mood="fog"
          kicker="Yours"
          line={
            slide.first
              ? "Write the line *you* need to hear."
              : "Got another one? *Write it down.*"
          }
          note={
            slide.first
              ? "Your cards mix into the deck between the others. You can keep, share, and edit them like any card."
              : "Every card you write mixes into the deck."
          }
          near={near}
        >
          <button
            className="mcard-go solid"
            onClick={() => setEditing("new")}
            disabled={offline}
          >
            Write a card
            <PenLine size={15} />
          </button>
        </NoteCard>
      );
    if (slide.kind === "empty")
      return (
        <NoteCard
          seed="empty"
          mood="fog"
          kicker="Kept"
          line="Nothing kept *yet*."
          note="Tap the bookmark on any card that hits. It will wait for you here."
          near={near}
        >
          <button className="mcard-go solid" onClick={() => setFilter("all")}>
            Browse all cards
            <ArrowUpRight size={15} />
          </button>
        </NoteCard>
      );
    return (
      <FlipCard
        slide={slide}
        position={position}
        near={near}
        flipped={flipped.has(slide.id)}
        flip={() => flip(slide.id)}
        kept={isKept(slide.id)}
        keep={() => void keep(slide.id)}
        share={() => void shareImage(slide, notify)}
        edit={() => {
          if (slide.kind === "card" && slide.own) setEditing(slide.own);
        }}
        ask={
          coachReady
            ? () =>
                askCoach(
                  `This card stuck with me: “${plainCardText(slide.front)}”${slide.back ? ` ${plainCardText(slide.back)}` : ""} Help me act on it in my training this week.`,
                )
            : undefined
        }
        logWorkout={logWorkout}
        offline={offline}
      />
    );
  }

  return (
    <section className="motivation">
      <div className="view-heading motivation-heading">
        <div>
          <span className="eyebrow">FOR THE DAYS IT’S HARD</span>
          <h1>Read one. Then go.</h1>
          <p>
            Turn a card over for what to do about it. Keep the ones that hit.
          </p>
        </div>
      </div>
      <div className="motivation-toolbar">
        <div
          className="motivation-filters"
          ref={chips}
          role="tablist"
          aria-label="Card themes"
        >
          {filters.map(([value, label]) => {
            const count =
              value === "kept"
                ? kept.length
                : value === "yours"
                  ? cards.length
                  : 0;
            return (
              <button
                key={value}
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
                {count ? <span>{count}</span> : null}
              </button>
            );
          })}
        </div>
        <button
          className="icon-button"
          aria-label="Shuffle the deck"
          title="Shuffle"
          onClick={() => setSeed(crypto.randomUUID())}
        >
          <Shuffle size={17} />
        </button>
        <button
          className="secondary-button write-card"
          onClick={() => setEditing("new")}
          disabled={offline}
          aria-label="Write a card"
        >
          <PenLine size={15} />
          <span>Write a card</span>
        </button>
      </div>
      <Climb count={slides.length} index={current} jump={go} />
      <div className="deck-frame">
        <div
          className="deck"
          ref={deck}
          onScroll={() => {
            const height = slideHeight();
            if (height) setIndex(Math.round(deck.current!.scrollTop / height));
          }}
          role="region"
          aria-roledescription="carousel"
          aria-label="Motivation cards"
        >
          {slides.map((slide, i) => (
            <article
              key={`${filter}-${slide.id}`}
              className={`deck-slide ${i === current ? "active" : ""}`}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
            >
              {slideContent(slide, i)}
            </article>
          ))}
        </div>
      </div>
      {editing && (
        <CardEditor
          card={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
          saved={async (message, created) => {
            await refresh();
            notify(message);
            if (created) {
              setFilter("yours");
              requestAnimationFrame(() => deck.current?.scrollTo({ top: 0 }));
            }
          }}
        />
      )}
    </section>
  );
}
