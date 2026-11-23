/**
 * Picks a colour theme from a picture, the way an Omarchy theme follows its wallpaper: the colour the picture is most
 * made of becomes the accent, a second, different colour becomes the second accent, and the greys of the interface are
 * tinted towards the accent. Backgrounds stay black: the canvas is the product.
 *
 * All the maths is in OKLCH (lightness, chroma, hue), where equal steps look equal, so a pale pastel wallpaper and a dark
 * saturated one both give an accent that is readable on black and clearly coloured. Pure functions, no DOM.
 */

export interface Oklch {
  /** Lightness 0–1. */
  l: number;
  /** Chroma, about 0–0.37 in sRGB. */
  c: number;
  /** Hue in degrees, 0–360. */
  h: number;
}

/* ── sRGB ⇄ OKLCH ── */

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** `r`, `g`, `b` in 0–255. */
export function srgbToOklch(r: number, g: number, b: number): Oklch {
  const lr = toLinear(r / 255);
  const lg = toLinear(g / 255);
  const lb = toLinear(b / 255);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  return { l: L, c, h: c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** The colour with its chroma lowered until it fits in sRGB, so what is described is what is shown. */
export function fitGamut(color: Oklch): Oklch {
  if (inGamut(oklchToLinear(color))) return color;
  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid;
    else hi = mid;
  }
  return { ...color, c: lo };
}

/** 0–255 sRGB, rounded. */
export function oklchToSrgb(color: Oklch): [number, number, number] {
  const [r, g, b] = oklchToLinear(fitGamut(color)).map((v) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))) * 255));
  return [r, g, b];
}

const css = (color: Oklch, alpha?: number) => {
  const f = fitGamut(color);
  return `oklch(${f.l.toFixed(3)} ${f.c.toFixed(3)} ${(((f.h % 360) + 360) % 360).toFixed(1)}${alpha === undefined ? '' : ` / ${alpha}`})`;
};

/** Contrast ratio between two sRGB colours (WCAG): 1 to 21. */
export function contrast(a: [number, number, number], b: [number, number, number]): number {
  const lum = ([r, g, bl]: [number, number, number]) => 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(bl / 255);
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── choosing the colours ── */

export interface Swatches {
  accent: Oklch;
  accent2: Oklch;
  /** False when the picture has too little colour to pick from (greys, black and white): the classic yellow is kept. */
  vivid: boolean;
}

const BINS = 24;
const BIN = 360 / BINS;
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/**
 * `data` is RGBA pixels, as from a canvas. Every pixel votes for its hue with the strength of its chroma (greys do not vote),
 * dark and blown-out pixels vote less (they look like shadow and sky, not like the picture's colour), and neighbouring
 * hues share their votes so one colour split across two bins still wins.
 */
export function pickSwatches(data: ArrayLike<number>): Swatches {
  const weight = new Float64Array(BINS);
  const chroma = new Float64Array(BINS);
  const hx = new Float64Array(BINS);
  const hy = new Float64Array(BINS);
  let colourful = 0;
  let seen = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const { l, c, h } = srgbToOklch(data[i], data[i + 1], data[i + 2]);
    seen++;
    if (c < 0.03) continue;
    colourful++;
    const visible = l < 0.15 || l > 0.97 ? 0.15 : l < 0.28 || l > 0.92 ? 0.55 : 1;
    const w = c * visible;
    const bin = Math.floor(h / BIN) % BINS;
    weight[bin] += w;
    chroma[bin] += c * w;
    hx[bin] += Math.cos((h * Math.PI) / 180) * w;
    hy[bin] += Math.sin((h * Math.PI) / 180) * w;
  }
  const fallback: Swatches = { accent: { l: 0.87, c: 0.18, h: 95 }, accent2: { l: 0.78, c: 0.16, h: 55 }, vivid: false };
  if (!seen || colourful / seen < 0.04) return fallback;

  const score = Array.from({ length: BINS }, (_, i) => weight[i] + 0.5 * (weight[(i + BINS - 1) % BINS] + weight[(i + 1) % BINS]));
  const describe = (bin: number) => {
    const ids = [(bin + BINS - 1) % BINS, bin, (bin + 1) % BINS];
    const w = ids.reduce((s, k) => s + weight[k], 0) || 1;
    const x = ids.reduce((s, k) => s + hx[k], 0);
    const y = ids.reduce((s, k) => s + hy[k], 0);
    return { hue: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, chroma: ids.reduce((s, k) => s + chroma[k], 0) / w };
  };

  const best = score.indexOf(Math.max(...score));
  if (score[best] <= 0) return fallback;
  const a = describe(best);
  // A second colour at least 60° away, if the picture has one worth the name; otherwise a neighbour on the colour wheel.
  let second = -1;
  for (let i = 0; i < BINS; i++) {
    if (angle(i * BIN + BIN / 2, a.hue) < 60 || score[i] < score[best] * 0.25) continue;
    if (second < 0 || score[i] > score[second]) second = i;
  }
  const b = second >= 0 ? describe(second) : { hue: (a.hue + 40) % 360, chroma: a.chroma };

  // Lightness is fixed so the accent reads on black; chroma follows the picture, kept lively but inside sRGB.
  const accent = fitGamut({ l: a.hue > 70 && a.hue < 130 ? 0.86 : 0.8, c: Math.min(0.19, Math.max(0.12, a.chroma * 1.5)), h: a.hue });
  const accent2 = fitGamut({ l: b.hue > 70 && b.hue < 130 ? 0.84 : 0.76, c: Math.min(0.18, Math.max(0.1, b.chroma * 1.4)), h: b.hue });
  return { accent, accent2, vivid: true };
}

/** The CSS custom properties that make up the theme (see `src/app.css` for the classic values they replace). */
export type ThemeVars = Record<string, string>;

const triple = (c: Oklch) => oklchToSrgb(c).join(' ');

export interface ThemeOptions {
  /**
   * Keep the black base (what OLED screens want): only the accent colours and the Home glow and cursor animation change.
   * Off: the text, lines and hover tones are tinted towards the accent as well.
   */
  keepBlack: boolean;
}

export function buildTheme({ accent, accent2 }: Pick<Swatches, 'accent' | 'accent2'>, options: ThemeOptions = { keepBlack: true }): ThemeVars {
  const h = accent.h;
  const ember = { l: 0.83, c: Math.min(0.17, accent.c), h };
  const core = { l: 0.97, c: 0.045, h };
  const deep = { l: 0.7, c: Math.min(0.19, accent2.c + 0.02), h: accent2.h };
  const accents: ThemeVars = {
    '--color-accent': css(accent),
    '--color-accent-soft': css(accent, 0.14),
    '--color-accent-line': css(accent, 0.6),
    '--color-accent-2': css(accent2),
    '--ember-core': css(core),
    '--ember': css(ember),
    '--ember-deep': css(deep),
    '--ember-hot-rgb': triple(core),
    '--ember-rgb': triple(ember),
    '--ember-deep-rgb': triple(deep)
  };
  if (options.keepBlack) return accents;
  return {
    ...accents,
    '--color-fg': css({ l: 0.96, c: 0.01, h }),
    '--color-fg-2': css({ l: 0.72, c: 0.016, h }),
    '--color-fg-3': css({ l: 0.52, c: 0.016, h }),
    '--color-line': css({ l: 0.92, c: 0.03, h }, 0.12),
    '--color-line-strong': css({ l: 0.92, c: 0.035, h }, 0.26),
    '--color-hover': css({ l: 0.92, c: 0.03, h }, 0.08),
    '--color-press': css({ l: 0.92, c: 0.035, h }, 0.15),
    '--paper': css({ l: 0.95, c: 0.02, h }),
    '--paper-2': css({ l: 0.8, c: 0.012, h }),
    '--paper-3': css({ l: 0.62, c: 0.01, h })
  };
}

/** Swatches and theme in one step, for a picture's pixels. `null` when the picture has no colour to follow. */
export function themeFromPixels(data: ArrayLike<number>, options: ThemeOptions = { keepBlack: true }): { vars: ThemeVars; swatches: Swatches } | null {
  const swatches = pickSwatches(data);
  return swatches.vivid ? { vars: buildTheme(swatches, options), swatches } : null;
}
