/**
 * Reads a session config written by `exportConfig` (sessionFactory.ts).
 *
 * The file is untrusted input, so nothing is copied across as-is: every field is
 * checked, clamped or replaced with a default, ids are regenerated, and the
 * result is always locked so an imported layout cannot be nudged by accident.
 * Local videos come back without a file (`url: ''`); the player then offers a
 * “Choose file” prompt on exactly those layers.
 */
import { ASPECT_OPTIONS, CANVAS_ASPECTS, MIN_LAYER_SIZE } from '../constants';
import type { AspectLock, CanvasAspect, Crop, FitMode, ID, LayerTransform, LayoutType, Session, SessionVideo } from '../types';
import { uid } from '../utils/format';
import { ZERO_CROP, clamp } from '../utils/geometry';
import { buildLayout } from './layouts';
import { defaultSessionName, roleForIndex } from './sessionFactory';

type Loose = Record<string, unknown>;

const isObj = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const str = (v: unknown, fallback = '', max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);

const ASPECTS = new Set<string>(ASPECT_OPTIONS.map((a) => a.value));
const CANVASES = new Set<string>(CANVAS_ASPECTS.map((a) => a.value));
const LAYOUTS = new Set<string>(['split', 'grid', 'pip', 'custom']);
const REMOTE = /^(https?:|demo:)/i;

function cleanCrop(raw: unknown): Crop {
  const c = isObj(raw) ? raw : {};
  const crop: Crop = {
    t: num(c.t, 0, 0, 0.9),
    r: num(c.r, 0, 0, 0.9),
    b: num(c.b, 0, 0, 0.9),
    l: num(c.l, 0, 0, 0.9)
  };
  // Opposite edges may not meet: at least 10 % of the picture must remain.
  if (crop.l + crop.r > 0.9) crop.r = 0.9 - crop.l;
  if (crop.t + crop.b > 0.9) crop.b = 0.9 - crop.t;
  return crop;
}

function cleanTransform(raw: unknown, fallback: LayerTransform): LayerTransform {
  const t = isObj(raw) ? raw : {};
  const w = num(t.w, fallback.w, MIN_LAYER_SIZE, 1);
  const h = num(t.h, fallback.h, MIN_LAYER_SIZE, 1);
  return {
    x: num(t.x, fallback.x, 0, 1 - w),
    y: num(t.y, fallback.y, 0, 1 - h),
    w,
    h,
    crop: raw === undefined ? { ...ZERO_CROP } : cleanCrop(t.crop),
    opacity: num(t.opacity, 1, 0, 1),
    fit: (t.fit === 'cover' ? 'cover' : 'contain') as FitMode,
    aspect: (typeof t.aspect === 'string' && ASPECTS.has(t.aspect) ? t.aspect : fallback.aspect) as AspectLock
  };
}

/** Returns a new, locked session, or `null` when `raw` is not a Reaction Player config. */
export function parseConfig(raw: unknown, now = Date.now()): Session | null {
  if (!isObj(raw) || raw.app !== 'reaction-player' || !isObj(raw.session)) return null;
  const src = raw.session;
  const list = Array.isArray(src.videos) ? src.videos.filter(isObj) : [];
  if (list.length < 2 || list.length > 4) return null;

  const idMap = new Map<string, ID>();
  const videos: SessionVideo[] = list.map((v, i) => {
    const id = uid('vid');
    idMap.set(str(v.id, `#${i}`), id);
    const url = str(v.url, '', 2048);
    const remote = v.kind === 'url' && REMOTE.test(url);
    return {
      id,
      role: roleForIndex(i),
      title: str(v.title, `Video ${i + 1}`, 120),
      kind: remote ? 'url' : 'file',
      url: remote ? url : '',
      fileName: typeof v.fileName === 'string' ? v.fileName.slice(0, 260) : undefined,
      fileSize: typeof v.fileSize === 'number' && v.fileSize >= 0 ? v.fileSize : undefined,
      currentTime: num(v.currentTime, 0, 0),
      duration: num(v.duration, 0, 0),
      volume: num(v.volume, 1, 0, 1),
      muted: v.muted === true,
      playbackRate: num(v.playbackRate, 1, 0.25, 4),
      offsetMs: Math.round(num(v.offsetMs, 0, -3_600_000, 3_600_000)),
      audioTrack: typeof v.audioTrack === 'number' && v.audioTrack >= 0 ? Math.floor(v.audioTrack) : undefined
    };
  });

  const alignment = isObj(src.alignment) ? src.alignment : {};
  const given = isObj(alignment.coordinates) ? alignment.coordinates : {};
  const defaults = buildLayout('split', videos.length);
  const coordinates: Record<ID, LayerTransform> = {};
  list.forEach((v, i) => {
    coordinates[videos[i].id] = cleanTransform(given[str(v.id, `#${i}`)], defaults[i]);
  });

  const requestedMaster = idMap.get(str(src.masterId));
  const masterId = requestedMaster ?? videos[0].id;
  const layoutType = (typeof alignment.layoutType === 'string' && LAYOUTS.has(alignment.layoutType) ? alignment.layoutType : 'custom') as LayoutType;
  const canvas = (typeof src.canvasAspect === 'string' && CANVASES.has(src.canvasAspect) ? src.canvasAspect : '16:9') as CanvasAspect;
  const base = videos.map((v) => ({ ...coordinates[v.id], crop: { ...coordinates[v.id].crop } }));

  return {
    id: uid('ses'),
    name: str(src.name, defaultSessionName(videos), 80),
    createdAt: now,
    lastModified: now,
    updatedAt: now,
    videos,
    alignment: { layoutType, locked: true, coordinates, base },
    canvasAspect: canvas,
    isLinked: src.isLinked !== false,
    isTheaterMode: false,
    masterId,
    clock: typeof src.clock === 'number' && Number.isFinite(src.clock) ? src.clock : undefined
  };
}
