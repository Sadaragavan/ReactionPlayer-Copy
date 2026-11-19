/**
 * Frame sampling for the alignment studio: opening a clip, landing on an exact
 * picture, and turning what is on screen into a still (canvas → JPEG data URL).
 * Pure helpers — the studio state decides when to call them.
 */
import { canvasRatio, captureFrame, composeStage, loadImage, whenSettled, type StageLayer } from '$lib/engine/capture';
import type { CanvasAspect, Crop, LayerTransform, SampledFrame, VideoRole } from '$lib/types';
import { uid } from '$lib/utils/format';
import { ZERO_CROP, clamp } from '$lib/utils/geometry';

/** Longest edge of a sampled still: sharp enough to judge an edge, light enough to keep several in memory. */
export const SAMPLE_MAX_EDGE = 1600;

/** How many earlier stills a slot keeps. */
export const HISTORY_LIMIT = 8;

export interface Clip {
  el: HTMLVideoElement;
  name: string;
  /** Blob URL to revoke when the clip is dropped (local files only). */
  objectUrl?: string;
}

/** Opens a video for sampling. Resolves once its first picture can be drawn. */
export function openClip(src: string, name: string, opts: { objectUrl?: string; cors?: boolean } = {}): Promise<Clip> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('video');
    el.muted = true;
    el.playsInline = true;
    el.preload = 'auto';
    el.className = 'size-full object-contain';
    if (opts.cors) el.crossOrigin = 'anonymous';
    el.addEventListener('loadeddata', () => resolve({ el, name, objectUrl: opts.objectUrl }), { once: true });
    el.addEventListener('error', () => reject(new Error('This file cannot be played here. MP4 (H.264) and WebM play everywhere.')), {
      once: true
    });
    el.src = src;
  });
}

/** Moves to `time` (clamped to the clip) and waits until that picture is on screen. Returns where it landed. */
export async function seekTo(el: HTMLVideoElement, time: number): Promise<number> {
  const end = Number.isFinite(el.duration) ? el.duration : time;
  el.currentTime = clamp(time, 0, Math.max(0, end));
  await whenSettled(el);
  return el.currentTime;
}

/** A still of the picture showing now. Throws a SecurityError for a remote clip whose host forbids it. */
export function grabFrame(el: HTMLVideoElement, slot: number): SampledFrame {
  const canvas = captureFrame(el, ZERO_CROP, SAMPLE_MAX_EDGE);
  return {
    id: uid('frm'),
    slot,
    time: el.currentTime,
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL('image/jpeg', 0.9)
  };
}

/** Width/height of what a layer shows of its still once cropped, or null while it has no still. */
export function visibleFrameAspect(frame: Pick<SampledFrame, 'width' | 'height'> | null, crop: Crop): number | null {
  if (!frame) return null;
  const w = frame.width * (1 - crop.l - crop.r);
  const h = frame.height * (1 - crop.t - crop.b);
  return w > 0 && h > 0 ? w / h : null;
}

export interface ThumbLayer {
  role: VideoRole;
  t: LayerTransform;
  frame: SampledFrame | null;
}

/** The aligned stills on the black canvas, as a small JPEG for the preset card. Empty slots draw as outlines. */
export async function composeThumbnail(layers: ThumbLayer[], shape: Exclude<CanvasAspect, 'fill'>, width = 360): Promise<string> {
  const stage: StageLayer[] = await Promise.all(
    layers.map(async ({ role, t, frame }) => ({
      role,
      zIndex: t.zIndex,
      rect: { x: t.x, y: t.y, w: t.w, h: t.h },
      crop: t.crop,
      fit: t.fit,
      opacity: t.opacity,
      image: frame ? await loadImage(frame.dataUrl).catch(() => null) : null,
      width: frame?.width ?? 0,
      height: frame?.height ?? 0
    }))
  );
  return composeStage(stage, canvasRatio(shape), width).toDataURL('image/jpeg', 0.82);
}
