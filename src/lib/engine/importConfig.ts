/**
 * Reads a session config written by `exportConfig` (sessionFactory.ts).
 *
 * The file is untrusted input, so nothing is copied across as-is: every field is
 * checked, clamped or replaced with a default, ids are regenerated, and the
 * result is always locked so an imported layout cannot be nudged by accident.
 * Local videos come back without a file (`url: ''`); the player then offers a
 * “Choose file” prompt on exactly those layers.
 */
import { isVideoPath } from '../../shared/mediaUrl';
import { isSubtitlePath } from '../../shared/subtitles';
import { ASPECT_OPTIONS, CANVAS_ASPECTS, MIN_LAYER_SIZE } from '../constants';
import type { AspectLock, CanvasAspect, Crop, FitMode, ID, LayerTransform, LayoutType, Session, SessionVideo, SourceItem, SubtitleSetting } from '../types';
import { uid } from '../utils/format';
import { ZERO_CROP, clamp } from '../utils/geometry';
import { buildLayout } from './layouts';
import { mirrorCurrentItem } from './playlist';
import { withZIndex } from './zorder';
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
    zIndex: num(t.zIndex, fallback.zIndex, -1000, 1000),
    hidden: t.hidden === true || t.opacity === 0 ? true : undefined,
    locked: t.locked === true ? true : undefined,
    x: num(t.x, fallback.x, 0, 1 - w),
    y: num(t.y, fallback.y, 0, 1 - h),
    w,
    h,
    crop: raw === undefined ? { ...ZERO_CROP } : cleanCrop(t.crop),
    opacity: t.opacity === 0 ? 1 : num(t.opacity, 1, 0, 1),
    fit: (t.fit === 'cover' ? 'cover' : 'contain') as FitMode,
    aspect: (typeof t.aspect === 'string' && ASPECTS.has(t.aspect) ? t.aspect : fallback.aspect) as AspectLock
  };
}

/** Returns a new, locked session, or `null` when `raw` is not a Reaction Player config. */
/** A subtitle choice from a file: kept only when it is well formed; a path must be a subtitle file. */
function cleanSubtitle(raw: unknown): SubtitleSetting | undefined {
  if (!isObj(raw)) return undefined;
  const label = typeof raw.label === 'string' ? raw.label.slice(0, 120) : '';
  const delayMs = typeof raw.delayMs === 'number' && Number.isFinite(raw.delayMs) ? Math.round(Math.max(-600_000, Math.min(600_000, raw.delayMs))) : undefined;
  if (raw.kind === 'embedded' && typeof raw.track === 'number' && raw.track >= 0) return { kind: 'embedded', track: Math.floor(raw.track), label: label || 'Subtitles', delayMs };
  if (raw.kind === 'file' && typeof raw.path === 'string' && raw.path.length <= 1024 && isSubtitlePath(raw.path)) return { kind: 'file', path: raw.path, label: label || 'Subtitles', delayMs };
  return undefined;
}

/** The source playlist of the first video, when the file has one with two or more episodes. Item ids are renewed; the first takes the layer's. */
function cleanPlaylist(v: Record<string, unknown>, layerId: ID): Partial<SessionVideo> {
  if (!Array.isArray(v.sources) || v.sources.length < 2 || v.sources.length > 50) return {};
  const items: SourceItem[] = v.sources.filter(isObj).map((x, k) => {
    const url = str(x.url, '', 2048);
    const remote = x.kind === 'url' && REMOTE.test(url);
    return {
      id: k === 0 ? layerId : uid('vid'),
      title: str(x.title, `Source ${k + 1}`, 120),
      kind: remote ? 'url' : 'file',
      url: remote ? url : '',
      fileName: typeof x.fileName === 'string' ? x.fileName.slice(0, 260) : undefined,
      filePath: !remote && typeof x.filePath === 'string' && x.filePath.length <= 1024 && isVideoPath(x.filePath) ? x.filePath : undefined,
      fileSize: typeof x.fileSize === 'number' && x.fileSize >= 0 ? x.fileSize : undefined,
      duration: num(x.duration, 0, 0),
      audioTrack: typeof x.audioTrack === 'number' && x.audioTrack >= 0 ? Math.floor(x.audioTrack) : undefined,
      subtitle: cleanSubtitle(x.subtitle),
      gapMs: k === 0 || x.gapMs === null ? null : Math.round(num(x.gapMs, 0, 0, 86_400_000))
    };
  });
  if (items.length < 2) return {};
  return {
    sources: items,
    sourceIndex: Math.floor(num(v.sourceIndex, 0, 0, items.length - 1)),
    firstOffsetMs: Math.round(num(v.firstOffsetMs, 0, -3_600_000, 3_600_000))
  };
}

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
      filePath: !remote && typeof v.filePath === 'string' && v.filePath.length <= 1024 && isVideoPath(v.filePath) ? v.filePath : undefined,
      fileSize: typeof v.fileSize === 'number' && v.fileSize >= 0 ? v.fileSize : undefined,
      currentTime: num(v.currentTime, 0, 0),
      duration: num(v.duration, 0, 0),
      volume: num(v.volume, 1, 0, 1),
      muted: v.muted === true,
      playbackRate: num(v.playbackRate, 1, 0.25, 4),
      offsetMs: Math.round(num(v.offsetMs, 0, -3_600_000, 3_600_000)),
      audioTrack: typeof v.audioTrack === 'number' && v.audioTrack >= 0 ? Math.floor(v.audioTrack) : undefined,
      subtitle: cleanSubtitle(v.subtitle),
      ...(i === 0 ? cleanPlaylist(v, id) : {})
    };
  });

  for (const v of videos) mirrorCurrentItem(v);

  const alignment = isObj(src.alignment) ? src.alignment : {};
  const given = isObj(alignment.coordinates) ? alignment.coordinates : {};
  const defaults = buildLayout('split', videos.length);
  const coordinates: Record<ID, LayerTransform> = {};
  // A file saved before layers could be ordered has no zIndex; `withZIndex` gives those the old source-on-top stacking.
  const rawCoords: Record<ID, LayerTransform> = {};
  list.forEach((v, i) => {
    const raw = given[str(v.id, `#${i}`)];
    rawCoords[videos[i].id] = { ...cleanTransform(raw, defaults[i]), zIndex: isObj(raw) && typeof raw.zIndex === 'number' ? num(raw.zIndex, 0, -1000, 1000) : (undefined as unknown as number) };
  });
  Object.assign(coordinates, withZIndex(videos.map((v) => v.id), rawCoords));

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
