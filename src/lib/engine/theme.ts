/**
 * The colour theme: the classic black and yellow, or colours taken from the wallpaper (see utils/palette.ts).
 * A theme is a set of CSS custom properties on the page's root element; clearing them brings the classic look back, because
 * `src/app.css` holds the classic values.
 */
import { setEmberColors } from '../utils/embers';
import { pickSwatches, type Swatches, type ThemeVars } from '../utils/palette';

/** Puts a theme on the page, or the classic look when `vars` is null. */
export function applyTheme(vars: ThemeVars | null, root: HTMLElement = document.documentElement): void {
  for (const name of Object.keys(CLASSIC_NAMES)) root.style.removeProperty(name);
  if (vars) for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
  const rgb = (name: string, fallback: string) => (vars?.[name] ?? fallback).replace(/\s+/g, ',');
  setEmberColors(rgb('--ember-hot-rgb', '255 243 207'), rgb('--ember-rgb', '255 194 77'), rgb('--ember-deep-rgb', '255 138 31'));
}

/** Every property a theme may set, so clearing one removes all of it. */
const CLASSIC_NAMES: Record<string, true> = Object.fromEntries(
  [
    '--color-accent',
    '--color-accent-soft',
    '--color-accent-line',
    '--color-accent-2',
    '--color-fg',
    '--color-fg-2',
    '--color-fg-3',
    '--color-line',
    '--color-line-strong',
    '--color-hover',
    '--color-press',
    '--ember-core',
    '--ember',
    '--ember-deep',
    '--ember-hot-rgb',
    '--ember-rgb',
    '--ember-deep-rgb',
    '--paper',
    '--paper-2',
    '--paper-3'
  ].map((n) => [n, true] as const)
);

const SAMPLE = 64;

/** Loads a picture (the first frame of a GIF) at a small size and returns its pixels. Null when it cannot be read, e.g. a link whose host forbids it. */
export async function readPixels(url: string): Promise<Uint8ClampedArray | null> {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const scale = Math.min(1, SAMPLE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  } catch {
    return null;
  }
}

export type ThemeOutcome = { kind: 'themed'; swatches: Swatches } | { kind: 'neutral' } | { kind: 'unreadable' };

/** Picks the colours of a wallpaper. `neutral`: the picture has no colour to follow. `unreadable`: it could not be loaded or read. */
export async function swatchesForWallpaper(url: string): Promise<ThemeOutcome> {
  const data = await readPixels(url);
  if (!data) return { kind: 'unreadable' };
  const swatches = pickSwatches(data);
  return swatches.vivid ? { kind: 'themed', swatches } : { kind: 'neutral' };
}
