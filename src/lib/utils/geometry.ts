/**
 * Pure geometry helpers for the layer canvas.
 *
 * All rectangles are *normalised*: 0–1 of the canvas width/height. Pixel maths
 * only happens at the very edge (videoPlacement, aspect conversion), so layouts
 * survive window resizes and fullscreen without any recalculation.
 */
import { ASPECT_RATIOS } from '../constants';
import type { AspectLock, Crop, FitMode, Rect } from '../types';

export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const roundTo = (v: number, digits = 4) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export const ZERO_CROP: Crop = { t: 0, r: 0, b: 0, l: 0 };

/* ── Aspect ───────────────────────────────────────────────── */

/** The pixel aspect ratio (w/h) a lock implies, or null when unconstrained. */
export function pixelAspectFor(lock: AspectLock, videoAspect: number | null): number | null {
  if (lock === 'free') return null;
  if (lock === 'auto') return videoAspect && Number.isFinite(videoAspect) && videoAspect > 0 ? videoAspect : null;
  return ASPECT_RATIOS[lock];
}

/** Pixel aspect → aspect in canvas-normalised units (what resizeRect expects). */
export const toNormAspect = (pixelAspect: number, canvasW: number, canvasH: number) =>
  (pixelAspect * canvasH) / Math.max(1, canvasW);

/* ── Move / resize ────────────────────────────────────────── */

export function moveRect(start: Rect, dx: number, dy: number): Rect {
  return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
}

/**
 * Resize `start` by dragging `handle` by (dx, dy). With `aspect` set the shape
 * is preserved: corners grow to meet the pointer, edges scale about the centre
 * of the other axis. The result never leaves the canvas or drops below `min`.
 */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, aspect: number | null, min: number): Rect {
  const hasW = handle.includes('w');
  const hasE = handle.includes('e');
  const hasN = handle.includes('n');
  const hasS = handle.includes('s');
  const isCorner = (hasW || hasE) && (hasN || hasS);

  let l = start.x;
  let r = start.x + start.w;
  let t = start.y;
  let b = start.y + start.h;
  if (hasW) l = clamp(l + dx, 0, r - min);
  if (hasE) r = clamp(r + dx, l + min, 1);
  if (hasN) t = clamp(t + dy, 0, b - min);
  if (hasS) b = clamp(b + dy, t + min, 1);

  if (!aspect) return { x: l, y: t, w: r - l, h: b - t };

  if (isCorner) {
    // Anchor the corner opposite the handle and grow towards the pointer.
    const ax = hasW ? start.x + start.w : start.x;
    const ay = hasN ? start.y + start.h : start.y;
    const availW = hasW ? ax : 1 - ax;
    const availH = hasN ? ay : 1 - ay;
    let w = Math.max(r - l, (b - t) * aspect);
    w = clamp(w, min, Math.max(min, Math.min(availW, availH * aspect)));
    const h = w / aspect;
    return { x: hasW ? ax - w : ax, y: hasN ? ay - h : ay, w, h };
  }

  if (hasW || hasE) {
    const anchor = hasW ? start.x + start.w : start.x;
    const avail = hasW ? anchor : 1 - anchor;
    const w = clamp(r - l, min, Math.max(min, Math.min(avail, aspect)));
    const h = w / aspect;
    const cy = start.y + start.h / 2;
    return { x: hasW ? anchor - w : anchor, y: clamp(cy - h / 2, 0, 1 - h), w, h };
  }

  const anchor = hasN ? start.y + start.h : start.y;
  const avail = hasN ? anchor : 1 - anchor;
  const h = clamp(b - t, min, Math.max(min, Math.min(avail, 1 / aspect)));
  const w = h * aspect;
  const cx = start.x + start.w / 2;
  return { x: clamp(cx - w / 2, 0, 1 - w), y: hasN ? anchor - h : anchor, w, h };
}

/* ── Snapping ─────────────────────────────────────────────── */

export interface SnapGuide {
  axis: 'x' | 'y';
  /** Normalised position of the guide line. */
  at: number;
}

function snapAxis(points: number[], targets: number[], threshold: number) {
  let best: { delta: number; at: number } | null = null;
  for (const p of points) {
    for (const t of targets) {
      const delta = t - p;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t };
    }
  }
  return best;
}

/** Snap a moving rect's edges and centre lines to the canvas and to other layers. */
export function snapMove(rect: Rect, others: Rect[], threshold: number): { rect: Rect; guides: SnapGuide[] } {
  const xs = [0, 0.5, 1];
  const ys = [0, 0.5, 1];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  const sx = snapAxis([rect.x, rect.x + rect.w / 2, rect.x + rect.w], xs, threshold);
  const sy = snapAxis([rect.y, rect.y + rect.h / 2, rect.y + rect.h], ys, threshold);
  const guides: SnapGuide[] = [];
  if (sx) guides.push({ axis: 'x', at: sx.at });
  if (sy) guides.push({ axis: 'y', at: sy.at });
  return {
    rect: { ...rect, x: clamp(rect.x + (sx?.delta ?? 0), 0, 1 - rect.w), y: clamp(rect.y + (sy?.delta ?? 0), 0, 1 - rect.h) },
    guides
  };
}

/* ── Placing the picture inside a layer ───────────────────── */

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where to draw the *whole* video element (in px, inside a layer of size
 * `box`) so that the cropped region is contained or covered exactly.
 * The layer clips with `overflow: hidden`, which makes the crop pixel-true
 * even when the picture is letterboxed.
 */
export function videoPlacement(box: { w: number; h: number }, vw: number, vh: number, crop: Crop, fit: FitMode): Placement {
  const sw = vw > 0 ? vw : 1920;
  const sh = vh > 0 ? vh : 1080;
  const cw = Math.max(1, sw * (1 - crop.l - crop.r));
  const ch = Math.max(1, sh * (1 - crop.t - crop.b));
  const scale = fit === 'contain' ? Math.min(box.w / cw, box.h / ch) : Math.max(box.w / cw, box.h / ch);
  const regionLeft = (box.w - cw * scale) / 2;
  const regionTop = (box.h - ch * scale) / 2;
  return {
    left: regionLeft - crop.l * sw * scale,
    top: regionTop - crop.t * sh * scale,
    width: sw * scale,
    height: sh * scale
  };
}

/** `left/top/width/height` as percentages, for absolutely-positioned layers. */
export const rectToStyle = (r: Rect) =>
  `left:${(r.x * 100).toFixed(4)}%;top:${(r.y * 100).toFixed(4)}%;width:${(r.w * 100).toFixed(4)}%;height:${(r.h * 100).toFixed(4)}%`;
