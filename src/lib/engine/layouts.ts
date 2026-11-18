/**
 * Layout engine: turns a layout type + video count into layer placements, and
 * owns the built-in (“standard”) presets.
 *
 * Slots are ordered like `session.videos`: slot 0 is the source, slot 1 the
 * reaction, slots 2–3 the Pro-only extras.
 */
import type { ID, LayerTransform, LayoutType, Preset, Rect, SessionVideo } from '../types';
import { ZERO_CROP } from '../utils/geometry';

export const makeTransform = (rect: Rect, over: Partial<LayerTransform> = {}): LayerTransform => ({
  ...rect,
  crop: { ...ZERO_CROP },
  opacity: 1,
  fit: 'contain',
  aspect: 'auto',
  ...over
});

/** Source left half, everything else stacked on the right half. */
function split(n: number): Rect[] {
  const rest = n - 1;
  return [
    { x: 0, y: 0, w: 0.5, h: 1 },
    ...Array.from({ length: rest }, (_, i) => ({ x: 0.5, y: i / rest, w: 0.5, h: 1 / rest }))
  ];
}

/** Equal cells. Two videos stack; three leave the bottom cell centred; four make a 2×2. */
function grid(n: number): Rect[] {
  if (n <= 2) return [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }].slice(0, n);
  const cells: Rect[] = [
    { x: 0, y: 0, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    { x: 0, y: 0.5, w: 0.5, h: 0.5 },
    { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
  ];
  if (n === 3) cells[2] = { x: 0.25, y: 0.5, w: 0.5, h: 0.5 };
  return cells.slice(0, n);
}

/** Reaction fills the canvas; the source sits on top as an inset. Extras take the other corners. */
function pip(n: number, corner: 'br' | 'bl' = 'br'): Rect[] {
  const size = 0.32;
  const m = 0.02;
  const inset = (right: boolean, bottom: boolean): Rect => ({
    x: right ? 1 - size - m : m,
    y: bottom ? 1 - size - m : m,
    w: size,
    h: size
  });
  const rects: Rect[] = [inset(corner === 'br', true), { x: 0, y: 0, w: 1, h: 1 }, inset(true, false), inset(false, false)];
  return rects.slice(0, n);
}

export function buildLayout(type: LayoutType, count: number, corner: 'br' | 'bl' = 'br'): LayerTransform[] {
  const n = Math.min(4, Math.max(2, count));
  const rects = type === 'grid' ? grid(n) : type === 'pip' ? pip(n, corner) : split(n);
  return rects.map((r) => makeTransform(r));
}

/** Maps slot i → videos[i] and returns coordinates keyed by video id. */
export function slotsToCoordinates(videos: Pick<SessionVideo, 'id'>[], slots: LayerTransform[]): Record<ID, LayerTransform> {
  const out: Record<ID, LayerTransform> = {};
  videos.forEach((v, i) => {
    const slot = slots[i] ?? slots[slots.length - 1];
    out[v.id] = { ...slot, crop: { ...slot.crop } };
  });
  return out;
}

/** Reads the current placement back as slots (used when saving a preset). */
export function coordinatesToSlots(videos: Pick<SessionVideo, 'id'>[], coords: Record<ID, LayerTransform>): LayerTransform[] {
  return videos.map((v) => {
    const c = coords[v.id];
    return { ...c, crop: { ...c.crop } };
  });
}

/** Bottom → top paint order. The source is always last, so always on top. */
export function paintOrder<T extends Pick<SessionVideo, 'role'>>(videos: T[]): T[] {
  const rank = { extra: 0, reaction: 1, source: 2 } as const;
  return videos
    .map((v, i) => ({ v, i }))
    .sort((a, b) => rank[a.v.role] - rank[b.v.role] || b.i - a.i)
    .map((e) => e.v);
}

/* ── Built-in presets ─────────────────────────────────────── */

function builtIn(id: string, name: string, layoutType: LayoutType, rects: Rect[]): Preset {
  return {
    id: `std_${id}`,
    name,
    builtIn: true,
    layoutType,
    slots: rects.map((r) => makeTransform(r)),
    createdAt: 0,
    updatedAt: 0
  };
}

export function builtInPresets(): Preset[] {
  return [
    builtIn('side', 'Side by side', 'split', split(2)),
    builtIn('stack', 'Stacked', 'grid', grid(2)),
    builtIn('pip-br', 'Corner, bottom right', 'pip', pip(2, 'br')),
    builtIn('pip-bl', 'Corner, bottom left', 'pip', pip(2, 'bl')),
    builtIn('wide', 'Source wide, reaction narrow', 'custom', [
      { x: 0, y: 0, w: 0.7, h: 1 },
      { x: 0.7, y: 0, w: 0.3, h: 1 }
    ]),
    builtIn('three', 'Source plus two', 'split', split(3)),
    builtIn('quad', 'Four-up grid', 'grid', grid(4))
  ];
}
