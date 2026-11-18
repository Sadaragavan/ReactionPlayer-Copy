/**
 * Aspect-ratio helpers shared by the right-click menu and the layers panel.
 * They read the live picture size from the playback engine, so “Match video”
 * follows what the file really is (and what is left of it after a crop).
 */
import { MIN_LAYER_SIZE } from '../constants';
import { session } from '../stores/session.svelte';
import type { AspectLock, ID } from '../types';
import { pixelAspectFor, resizeRect, roundTo, toNormAspect } from '../utils/geometry';
import { canvasRatio } from './capture';
import { playback } from './playback.svelte';

/** Width/height of the picture a layer shows after cropping, or null before its metadata has loaded. */
export function visibleAspect(id: ID): number | null {
  const d = playback.dims[id];
  const c = session.current?.alignment.coordinates[id]?.crop;
  if (!d || !c) return null;
  const w = d.w * (1 - c.l - c.r);
  const h = d.h * (1 - c.t - c.b);
  return w > 0 && h > 0 ? w / h : null;
}

/** Canvas width/height. A “fill” canvas follows the window, so this is an estimate there. */
export function currentCanvasRatio(): number {
  const s = session.current;
  if (!s || s.canvasAspect === 'fill') return innerHeight ? innerWidth / innerHeight : 16 / 9;
  return canvasRatio(s.canvasAspect);
}

/** The shape (in canvas-normalised units) a layer's lock asks for, or null when it is free. */
export function normAspectOf(id: ID): number | null {
  const t = session.current?.alignment.coordinates[id];
  if (!t) return null;
  const px = pixelAspectFor(t.aspect, visibleAspect(id));
  return px === null ? null : toNormAspect(px, currentCanvasRatio(), 1);
}

/** Sets a layer's aspect lock and reshapes its rectangle to match, growing from its top-left corner. */
export function setAspect(id: ID, lock: AspectLock): void {
  session.setLayer(id, { aspect: lock });
  const t = session.current?.alignment.coordinates[id];
  const norm = normAspectOf(id);
  if (!t || !norm) return;
  const r = resizeRect(t, 'se', 0, 0, norm, MIN_LAYER_SIZE);
  session.setLayer(id, { x: roundTo(r.x), y: roundTo(r.y), w: roundTo(r.w), h: roundTo(r.h) });
}
