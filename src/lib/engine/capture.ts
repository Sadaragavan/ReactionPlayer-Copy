/**
 * Canvas helpers for visual sampling.
 *
 *   framePresented  resolves once the next frame has been painted (requestVideoFrameCallback)
 *   captureFrame    a still of what a <video> shows right now, optionally cropped
 *   drawLayer       the exact placement maths the live player uses, onto any 2D context
 *   composeStage    a black-canvas composite of several layers (session / preset thumbnails)
 *
 * Remote videos served without CORS headers taint the canvas; reading pixels
 * back then throws a SecurityError, which `captureErrorMessage` turns into words.
 */
import { CANVAS_ASPECTS } from '../constants';
import type { CanvasAspect, Crop, FitMode, Rect, VideoRole } from '../types';
import { ZERO_CROP, videoPlacement } from '../utils/geometry';
import { paintOrder } from './layouts';

type FrameCallbackVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };

/** Resolves after the next presented frame — or after `timeoutMs` when the video is idle or rVFC is missing. */
export function framePresented(el: HTMLVideoElement, timeoutMs = 250): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    setTimeout(finish, timeoutMs);
    (el as FrameCallbackVideo).requestVideoFrameCallback?.(finish);
  });
}

/** Resolves when a pending seek has landed *and* its picture has been painted. */
export async function whenSettled(el: HTMLVideoElement): Promise<void> {
  if (el.seeking) {
    await new Promise<void>((resolve) => {
      el.addEventListener('seeked', () => resolve(), { once: true });
      setTimeout(resolve, 1500);
    });
  }
  await framePresented(el);
}

/** A still of the picture now showing, cropped, at native resolution (or scaled to `maxEdge`). */
export function captureFrame(el: HTMLVideoElement, crop: Crop = ZERO_CROP, maxEdge = Number.POSITIVE_INFINITY): HTMLCanvasElement {
  const vw = el.videoWidth;
  const vh = el.videoHeight;
  if (!vw || !vh) throw new Error('This video has no picture yet.');
  const sx = Math.round(vw * crop.l);
  const sy = Math.round(vh * crop.t);
  const sw = Math.max(1, Math.round(vw * (1 - crop.l - crop.r)));
  const sh = Math.max(1, Math.round(vh * (1 - crop.t - crop.b)));
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d')!.drawImage(el, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function captureErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'SecurityError') {
    return 'This video’s host does not allow frame capture. Use a local file instead.';
  }
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'The clipboard is blocked here, so the frame could not be copied.';
  }
  return err instanceof Error ? err.message : 'Could not capture the frame.';
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image.'));
    img.src = src;
  });
}

/* ── Compositing ──────────────────────────────────────────── */

export interface PixelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draws one picture into `box`, cropped and fitted exactly like a live layer. */
export function drawLayer(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  size: { width: number; height: number },
  box: PixelBox,
  crop: Crop,
  fit: FitMode,
  opacity = 1
): void {
  if (!size.width || !size.height) return;
  const p = videoPlacement({ w: box.w, h: box.h }, size.width, size.height, crop, fit);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.globalAlpha = opacity;
  ctx.drawImage(image, box.x + p.left, box.y + p.top, p.width, p.height);
  ctx.restore();
}

export interface StageLayer {
  role: VideoRole;
  rect: Rect;
  crop: Crop;
  fit: FitMode;
  opacity: number;
  /** `null` draws an outline placeholder (a preset slot with no sampled frame). */
  image: CanvasImageSource | null;
  width: number;
  height: number;
}

export function canvasRatio(aspect: CanvasAspect, fallback = 16 / 9): number {
  return CANVAS_ASPECTS.find((a) => a.value === aspect)?.ratio ?? fallback;
}

/** Black canvas with every layer painted bottom → top, so the source always ends up in front. */
export function composeStage(layers: StageLayer[], ratio: number, width = 480): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, Math.round(width / ratio));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const l of paintOrder(layers)) {
    const box: PixelBox = { x: l.rect.x * canvas.width, y: l.rect.y * canvas.height, w: l.rect.w * canvas.width, h: l.rect.h * canvas.height };
    if (l.image) {
      drawLayer(ctx, l.image, { width: l.width, height: l.height }, box, l.crop, l.fit, l.opacity);
      continue;
    }
    const isSource = l.role === 'source';
    ctx.fillStyle = isSource ? 'rgb(255 212 0 / 0.14)' : 'rgb(255 255 255 / 0.07)';
    ctx.strokeStyle = isSource ? '#ffd400' : 'rgb(255 255 255 / 0.55)';
    ctx.lineWidth = Math.max(1, canvas.width / 240);
    ctx.fillRect(box.x, box.y, box.w, box.h);
    ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
  }
  return canvas;
}
