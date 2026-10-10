import type { CSSProperties } from "react";
import type { MotivationMood } from "../../../packages/domain/src/index.js";

/** Card colors. `mark` is highlighter ink: a band behind the words when `band` is set, otherwise the text color. */
export interface Palette {
  from: string;
  to: string;
  ink: string;
  soft: string;
  line: string;
  mark: string;
  band: boolean;
}
export const palettes: Record<
  MotivationMood,
  { front: Palette; back: Palette }
> = {
  summit: {
    front: {
      from: "#3b4f31",
      to: "#1b2717",
      ink: "#f2f6e6",
      soft: "#f2f6e6a6",
      line: "#d9ed9a33",
      mark: "#d9ed9a",
      band: false,
    },
    back: {
      from: "#f1f6e1",
      to: "#dce8bb",
      ink: "#263420",
      soft: "#5d7048",
      line: "#38513016",
      mark: "#c3dc78aa",
      band: true,
    },
  },
  night: {
    front: {
      from: "#232e3d",
      to: "#0d1218",
      ink: "#eef2f8",
      soft: "#eef2f894",
      line: "#a9c0e02b",
      mark: "#d9ed9a",
      band: false,
    },
    back: {
      from: "#eef1f6",
      to: "#d7dee9",
      ink: "#19212c",
      soft: "#5a6678",
      line: "#19212c14",
      mark: "#d9ed9a",
      band: true,
    },
  },
  clay: {
    front: {
      from: "#c46b43",
      to: "#873a22",
      ink: "#fff4ea",
      soft: "#fff4eab3",
      line: "#ffe2cc38",
      mark: "#ffd29e",
      band: false,
    },
    back: {
      from: "#fbede3",
      to: "#f1d2bd",
      ink: "#4a2516",
      soft: "#8a5a44",
      line: "#4a251616",
      mark: "#e8946566",
      band: true,
    },
  },
  dawn: {
    front: {
      from: "#fbe8cb",
      to: "#f1bc94",
      ink: "#3b2619",
      soft: "#3b2619a6",
      line: "#8a4b242b",
      mark: "#fffaf0e6",
      band: true,
    },
    back: {
      from: "#3d2b1f",
      to: "#20160e",
      ink: "#fbe9d6",
      soft: "#fbe9d699",
      line: "#fbe9d621",
      mark: "#f6c08d",
      band: false,
    },
  },
  moss: {
    front: {
      from: "#e4f3ae",
      to: "#c2dc77",
      ink: "#22301b",
      soft: "#22301ba6",
      line: "#22301b24",
      mark: "#f8fde8e6",
      band: true,
    },
    back: {
      from: "#30432a",
      to: "#1a2616",
      ink: "#e9f5c6",
      soft: "#e9f5c699",
      line: "#d9ed9a26",
      mark: "#d9ed9a",
      band: false,
    },
  },
  fog: {
    front: {
      from: "#f7f6f1",
      to: "#e2e1d7",
      ink: "#273027",
      soft: "#27302799",
      line: "#3851301c",
      mark: "#d9ed9a",
      band: true,
    },
    back: {
      from: "#2b322b",
      to: "#171c17",
      ink: "#eef0e6",
      soft: "#eef0e699",
      line: "#eef0e61f",
      mark: "#d9ed9a",
      band: false,
    },
  },
};
export const moodNames: Record<MotivationMood, string> = {
  summit: "Summit",
  night: "Night",
  clay: "Clay",
  dawn: "Dawn",
  moss: "Moss",
  fog: "Fog",
};
export function paletteStyle(palette: Palette) {
  return {
    "--from": palette.from,
    "--to": palette.to,
    "--ink": palette.ink,
    "--soft": palette.soft,
    "--line": palette.line,
    "--mark": palette.mark,
  } as CSSProperties;
}

/** A small seeded generator, so a card's art is the same on every device. */
export function random(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++)
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffled<T>(items: T[], seed: string): T[] {
  const next = random(seed);
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const point = ([x, y]: number[]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
function smoothClosed(points: number[][]) {
  const mid = (a: number[], b: number[]) => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ];
  let d = `M${point(mid(points[points.length - 1], points[0]))}`;
  points.forEach((p, i) => {
    d += `Q${point(p)} ${point(mid(p, points[(i + 1) % points.length]))}`;
  });
  return `${d}Z`;
}

/**
 * Contour lines around one hill, like a topographic map. Every ring is the
 * same wobble scaled up, with a slight drift, so lines never cross. Every
 * fourth line is an index contour, drawn heavier.
 */
export function contours(
  seed: string,
  width: number,
  height: number,
  fixedPeak?: [number, number],
) {
  const next = random(seed);
  const peak = [width * (0.22 + next() * 0.56), height * (0.12 + next() * 0.3)];
  if (fixedPeak) peak.splice(0, 2, ...fixedPeak);
  const waves = [2, 3, 5].map((k) => ({
    k,
    amp: 0.04 + next() * 0.08,
    phase: next() * Math.PI * 2,
    drift: (next() - 0.5) * 0.12,
  }));
  const step = Math.max(width, height) / 15;
  const reach = Math.hypot(
    Math.max(peak[0], width - peak[0]),
    Math.max(peak[1], height - peak[1]),
  );
  const rings: { d: string; index: boolean }[] = [];
  for (let ring = 0; step * (ring + 0.5) < reach * 1.2; ring++) {
    const base = step * (ring + 0.5);
    const points = Array.from({ length: 48 }, (_, i) => {
      const angle = (i / 48) * Math.PI * 2;
      const radius =
        base *
        (1 +
          waves.reduce(
            (sum, w) =>
              sum + w.amp * Math.sin(w.k * angle + w.phase + w.drift * ring),
            0,
          ));
      return [
        peak[0] + Math.cos(angle) * radius,
        peak[1] + Math.sin(angle) * radius,
      ];
    });
    rings.push({ d: smoothClosed(points), index: ring % 4 === 3 });
  }
  return { rings, peak };
}

/** An elevation profile that climbs, with some wobble, to a summit at the last card. */
export function climbProfile(count: number) {
  const next = random(`climb-${count}`);
  const n = Math.max(count, 2);
  const points = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const wobble = i === 0 || i === n - 1 ? 0 : (next() - 0.5) * 0.18;
    const height = Math.min(
      0.94,
      Math.max(0.06, 0.08 + 0.8 * t ** 1.25 + wobble),
    );
    return [t * 100, i === n - 1 ? 2 : 100 - height * 100];
  });
  let line = `M${point(points[0])}`;
  for (let i = 1; i < n - 1; i++) {
    const mid = [
      (points[i][0] + points[i + 1][0]) / 2,
      (points[i][1] + points[i + 1][1]) / 2,
    ];
    line += `Q${point(points[i])} ${point(mid)}`;
  }
  line += `L${point(points[n - 1])}`;
  return { points, line, area: `${line}L100 100L0 100Z` };
}

/** Bar widths for a receipt barcode, in a 200-unit-wide box. */
export function barcode(seed: string) {
  const next = random(`barcode-${seed}`);
  const bars: [number, number][] = [];
  for (let x = 0; x < 196; ) {
    const width = 1 + Math.floor(next() * 3);
    if (next() > 0.3) bars.push([x, width]);
    x += width + 1 + Math.floor(next() * 2);
  }
  return bars;
}

export function segments(text: string) {
  return text
    .split(/\*([^*]+)\*/g)
    .map((part, i) => ({ text: part, mark: i % 2 === 1 }))
    .filter((part) => part.text);
}

/** Words as runs of highlighted and plain text, so "*hard*?" stays one word. */
function words(text: string) {
  const list: { text: string; mark: boolean }[][] = [[]];
  for (const segment of segments(text))
    for (const piece of segment.text.split(/(\s+)/)) {
      if (!piece) continue;
      if (/^\s+$/.test(piece)) {
        if (list[list.length - 1].length) list.push([]);
      } else list[list.length - 1].push({ text: piece, mark: segment.mark });
    }
  return list.filter((word) => word.length);
}

/**
 * Draws a card as a phone lock screen at 3x. The words sit below the clock
 * and above the flashlight and camera buttons.
 */
export function lockScreenImage(card: {
  id: string;
  kicker: string;
  front: string;
  mood: MotivationMood;
}) {
  const width = 390,
    height = 844,
    scale = 3;
  const palette = palettes[card.mood].front;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const fill = ctx.createLinearGradient(0, 0, width * 0.45, height);
  fill.addColorStop(0, palette.from);
  fill.addColorStop(1, palette.to);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = palette.line;
  for (const ring of contours(card.id, width, height).rings) {
    ctx.lineWidth = ring.index ? 1.6 : 0.8;
    ctx.stroke(new Path2D(ring.d));
  }

  const length = card.front.replace(/\*/g, "").length;
  const size = length <= 40 ? 42 : length <= 80 ? 35 : 29;
  const font = (weight: number, px: number) =>
    `${weight} ${px}px "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif`;
  ctx.font = font(650, size);
  ctx.textBaseline = "alphabetic";
  const left = 32,
    maxWidth = width - 64,
    space = ctx.measureText(" ").width;
  const lines: { text: string; mark: boolean; width: number }[][][] = [[]];
  let lineWidth = 0;
  for (const word of words(card.front)) {
    const runs = word.map((run) => ({
      ...run,
      width: ctx.measureText(run.text).width,
    }));
    const wordWidth = runs.reduce((sum, run) => sum + run.width, 0);
    const line = lines[lines.length - 1];
    if (line.length && lineWidth + space + wordWidth > maxWidth) {
      lines.push([runs]);
      lineWidth = wordWidth;
    } else {
      line.push(runs);
      lineWidth += (line.length > 1 ? space : 0) + wordWidth;
    }
  }
  const leading = size * 1.1;
  let y = Math.max(360, 575 - (lines.length * leading) / 2) + size;

  ctx.font = font(650, 11);
  ctx.fillStyle = palette.soft;
  let x = left;
  for (const letter of card.kicker.toUpperCase()) {
    ctx.fillText(letter, x, y - size - 22);
    x += ctx.measureText(letter).width + 2.2;
  }

  ctx.font = font(650, size);
  for (const line of lines) {
    x = left;
    line.forEach((word, w) => {
      word.forEach((run, r) => {
        const joined = r === 0 && w > 0 && run.mark && line[w - 1].at(-1)!.mark;
        if (run.mark && palette.band) {
          ctx.fillStyle = palette.mark;
          const start = joined ? x - space : x;
          ctx.fillRect(
            start,
            y - size * 0.34,
            x + run.width - start,
            size * 0.4,
          );
        }
        ctx.fillStyle = run.mark && !palette.band ? palette.mark : palette.ink;
        ctx.fillText(run.text, x, y);
        x += run.width;
      });
      x += space;
    });
    y += leading;
  }

  ctx.font = font(650, 16);
  ctx.fillStyle = palette.ink;
  ctx.fillText("be better", left, height - 58);
  ctx.fillStyle = palette.band ? "#7f9b4a" : palette.mark;
  ctx.fillText(".", left + ctx.measureText("be better").width, height - 58);
  return canvas;
}
