/**
 * `use:layerGesture` — drag a layer to move it, drag one of its `[data-handle]`
 * grips to resize it. Shared by the live player and the alignment studio, so
 * both feel identical.
 *
 * Everything is expressed in normalised canvas units. Edges and centre lines
 * snap to the canvas and to the other layers (hold Alt to move freely);
 * resizing keeps the picture's shape unless the lock is `free` (or Shift is held).
 */
import { MIN_LAYER_SIZE, SNAP_DISTANCE } from '../constants';
import type { Rect } from '../types';
import { type Handle, type SnapGuide, moveRect, resizeRect, roundTo, snapMove } from '../utils/geometry';

export interface LayerGestureOptions {
  /** The element whose box defines the 0–1 coordinate space. */
  stage: () => HTMLElement | null | undefined;
  rect: () => Rect;
  /** Other layers' rectangles, for snapping. */
  others: () => Rect[];
  /** Normalised aspect (w/h in canvas units) to preserve while resizing, or null for free-form. */
  aspect: () => number | null;
  /** False while the layout is locked: no gesture starts at all. */
  enabled: () => boolean;
  onChange: (rect: Rect) => void;
  onGuides?: (guides: SnapGuide[]) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Starts a move or resize from a `pointerdown` that `node` received. `node` is the element that captures the pointer
 * and gets `data-gesture` while the drag runs. The player's Stage calls this directly (it decides which layer was hit);
 * `layerGesture` below is the same thing bound to one element, for the alignment studio.
 */
export function beginGesture(node: HTMLElement, e: PointerEvent, o: LayerGestureOptions): void {
  if (e.button !== 0 || !o.enabled()) return;
  const stage = o.stage();
  if (!stage) return;
  const box = stage.getBoundingClientRect();
  if (!box.width || !box.height) return;

  const grip = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
  const handle = (grip?.dataset.handle as Handle | undefined) ?? null;
  const start = { ...o.rect() };
  const x0 = e.clientX;
  const y0 = e.clientY;

  e.preventDefault();
  e.stopPropagation();
  node.setPointerCapture(e.pointerId);
  node.dataset.gesture = handle ? 'resize' : 'move';
  o.onStart?.();

  const onMove = (m: PointerEvent) => {
    const dx = (m.clientX - x0) / box.width;
    const dy = (m.clientY - y0) / box.height;
    let next: Rect;
    if (handle) {
      next = resizeRect(start, handle, dx, dy, m.shiftKey ? null : o.aspect(), MIN_LAYER_SIZE);
      o.onGuides?.([]);
    } else {
      next = moveRect(start, dx, dy);
      if (m.altKey) o.onGuides?.([]);
      else {
        const snapped = snapMove(next, o.others(), SNAP_DISTANCE);
        next = snapped.rect;
        o.onGuides?.(snapped.guides);
      }
    }
    o.onChange({ x: roundTo(next.x), y: roundTo(next.y), w: roundTo(next.w), h: roundTo(next.h) });
  };

  const finish = () => {
    node.removeEventListener('pointermove', onMove);
    node.removeEventListener('pointerup', finish);
    node.removeEventListener('pointercancel', finish);
    delete node.dataset.gesture;
    o.onGuides?.([]);
    o.onEnd?.();
  };
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', finish);
  node.addEventListener('pointercancel', finish);
}

export function layerGesture(node: HTMLElement, options: LayerGestureOptions) {
  let o = options;
  const onDown = (e: PointerEvent) => beginGesture(node, e, o);
  node.addEventListener('pointerdown', onDown);
  return {
    update(next: LayerGestureOptions) {
      o = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', onDown);
    }
  };
}
