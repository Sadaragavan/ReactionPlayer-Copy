/**
 * Layer stacking: an explicit `zIndex` on every layer, and the pure functions that read and change it.
 *
 * Higher `zIndex` is painted on top and is hit first by the pointer. Values only matter relative to each other,
 * so every change here re-numbers the stack as 0…n-1. When two layers share a value (hand-edited files), the one
 * earlier in the video list counts as higher, which is how the old “source on top” rule broke ties.
 */
import type { ID, LayerTransform, Rect, SessionVideo } from '../types';

export type ZOp = 'front' | 'forward' | 'backward' | 'back';

export const Z_LABEL: Record<ZOp, string> = {
  front: 'Bring to front',
  forward: 'Bring forward',
  backward: 'Send backward',
  back: 'Send to back'
};

/** The stacking a new layout starts with: slot 0 (the source) on top, then the reaction, then the extras. */
export const defaultZ = (index: number, count: number): number => count - 1 - index;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Bottom → top. Ties: the earlier item in `items` is the higher one. */
export function sortByZ<T extends { zIndex: number }>(items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => a.item.zIndex - b.item.zIndex || b.i - a.i)
    .map((e) => e.item);
}

/** Top → bottom: the order a pointer tests layers in, and the order the Layers panel lists them. */
export const topFirst = <T extends { zIndex: number }>(items: readonly T[]): T[] => sortByZ(items).reverse();

/** A session's videos, bottom → top, by the `zIndex` of their placement. */
export function videosByZ<V extends Pick<SessionVideo, 'id'>>(videos: readonly V[], coords: Record<ID, Pick<LayerTransform, 'zIndex'> | undefined>): V[] {
  return sortByZ(videos.map((v, i) => ({ v, zIndex: coords[v.id]?.zIndex ?? defaultZ(i, videos.length) }))).map((e) => e.v);
}

/* ── Hit-testing ──────────────────────────────────────────── */

export interface HitLayer {
  id: ID;
  rect: Rect;
  zIndex: number;
  hidden?: boolean;
  locked?: boolean;
}

/**
 * The layer under a point (canvas fractions, 0–1), or null. Layers are tested from the highest `zIndex` to the
 * lowest, and hidden or locked ones are skipped, so a click passes through them to whatever lies beneath.
 */
export function hitTest(layers: readonly HitLayer[], x: number, y: number): ID | null {
  for (const l of topFirst(layers)) {
    if (l.hidden || l.locked) continue;
    const { rect } = l;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return l.id;
  }
  return null;
}

/* ── Reordering ───────────────────────────────────────────── */

type ZMap = Record<ID, number>;

/** Ids bottom → top for the given layers. */
export function stackOf(ids: readonly ID[], z: Record<ID, number | undefined>): ID[] {
  return sortByZ(ids.map((id, i) => ({ id, zIndex: z[id] ?? defaultZ(i, ids.length) }))).map((e) => e.id);
}

/** A bottom → top list of ids as a compact `zIndex` map (0…n-1). */
export const zFromStack = (stack: readonly ID[]): ZMap => Object.fromEntries(stack.map((id, i) => [id, i]));

/** Moves `id` one step or to an end of the stack. Returns the new `zIndex` of every layer. */
export function reorder(ids: readonly ID[], z: Record<ID, number | undefined>, id: ID, op: ZOp): ZMap {
  const stack = stackOf(ids, z);
  const at = stack.indexOf(id);
  if (at < 0) return zFromStack(stack);
  stack.splice(at, 1);
  const to = op === 'front' ? stack.length : op === 'back' ? 0 : op === 'forward' ? Math.min(stack.length, at + 1) : Math.max(0, at - 1);
  stack.splice(to, 0, id);
  return zFromStack(stack);
}

/** Whether `op` would change anything (a menu disables the entries that would not). */
export function canReorder(ids: readonly ID[], z: Record<ID, number | undefined>, id: ID, op: ZOp): boolean {
  const stack = stackOf(ids, z);
  const at = stack.indexOf(id);
  if (at < 0) return false;
  return op === 'front' || op === 'forward' ? at < stack.length - 1 : at > 0;
}

/** Drag and drop in the Layers panel: the list top → bottom becomes the stack. */
export const zFromTopFirst = (topFirstIds: readonly ID[]): ZMap => zFromStack([...topFirstIds].reverse());

/** Moves `id` so it sits at `index` in a top → bottom list (clamped), for dropping a row. */
export function moveInTopFirst(topFirstIds: readonly ID[], id: ID, index: number): ID[] {
  const list = topFirstIds.filter((x) => x !== id);
  list.splice(Math.max(0, Math.min(list.length, index)), 0, id);
  return list;
}

/* ── Older data ───────────────────────────────────────────── */

/**
 * Fills in `zIndex` for placements saved before layers could be ordered. Those always stacked the source on top, then
 * the reaction, then the extras, which is exactly `defaultZ`. If any layer lacks a value, the whole set is derived
 * again, so a half-migrated file cannot end up with a surprising mix. Returns a new map; `coords` is not touched.
 */
export function withZIndex<T extends Partial<Pick<LayerTransform, 'zIndex'>>>(ids: readonly ID[], coords: Record<ID, T>): Record<ID, T & Pick<LayerTransform, 'zIndex'>> {
  const complete = ids.every((id) => finite(coords[id]?.zIndex));
  const z = complete ? zFromStack(stackOf(ids, Object.fromEntries(ids.map((id) => [id, coords[id].zIndex])))) : Object.fromEntries(ids.map((id, i) => [id, defaultZ(i, ids.length)]));
  const out: Record<ID, T & Pick<LayerTransform, 'zIndex'>> = {};
  for (const id of ids) if (coords[id]) out[id] = { ...coords[id], zIndex: z[id] };
  return out;
}

/** The same for an ordered list of slots (a preset, or `alignment.base`). */
export function slotsWithZIndex<T extends Partial<Pick<LayerTransform, 'zIndex'>>>(slots: readonly T[]): (T & Pick<LayerTransform, 'zIndex'>)[] {
  const ids = slots.map((_, i) => String(i));
  const map = withZIndex(ids, Object.fromEntries(slots.map((s, i) => [String(i), s])));
  return slots.map((_, i) => map[String(i)]);
}
