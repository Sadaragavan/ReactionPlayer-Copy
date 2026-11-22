/**
 * Pure builders for sessions: create, duplicate, export. No stores, no DOM,
 * so they can be unit-tested and reused by the demo loader.
 */
import type { CanvasAspect, ID, LayoutType, MasterAudioPolicy, MediaKind, Preset, Session, SessionVideo, SourceItem, VideoRole } from '../types';
import { uid } from '../utils/format';
import type { FsFileHandle, PickedFile } from './media';
import { buildLayout, slotsToCoordinates } from './layouts';
import { rebaseOffsets } from './timeline';

export interface NewVideoInput {
  title: string;
  kind: MediaKind;
  /** Remote URL, `demo:` URL, or '' for a local file. */
  url: string;
  file?: File;
  /** Absolute path on disk (desktop): kept so the session reopens the file by itself. */
  path?: string;
  handle?: FsFileHandle;
  fileName?: string;
  fileSize?: number;
  /** Shift relative to the *first* video: `local = t(first) + offsetMs / 1000`. */
  offsetMs?: number;
  duration?: number;
  /** For the source only: more episodes that play after it, in this order. Each waits to be started by hand. */
  moreSources?: NewVideoInput[];
}

export interface NewSessionInput {
  name?: string;
  videos: NewVideoInput[];
  layout: LayoutType | { preset: Preset };
  linked: boolean;
  masterPolicy: MasterAudioPolicy;
  /** Mute every video but the master. Default off: all of them are heard. */
  muteOthers?: boolean;
  /** Shape of the black canvas. Defaults to 16:9. */
  canvasAspect?: CanvasAspect;
}

export interface BuiltSession {
  session: Session;
  /** Local files to register under their new video ids. */
  files: { id: ID; picked: PickedFile }[];
}

/** Slot order is the role order: source, reaction, then Pro extras. */
export const roleForIndex = (i: number): VideoRole => (i === 0 ? 'source' : i === 1 ? 'reaction' : 'extra');

export const ROLE_LABEL: Record<VideoRole, string> = { source: 'Source', reaction: 'Reaction', extra: 'Extra' };

export function defaultSessionName(videos: { title: string }[]): string {
  const names = videos.slice(0, 2).map((v) => v.title.trim()).filter(Boolean);
  const joined = names.join(' × ') || 'Untitled session';
  return joined.length > 60 ? `${joined.slice(0, 57)}…` : joined;
}

export function buildSession(input: NewSessionInput, now = Date.now()): BuiltSession {
  const count = Math.min(4, Math.max(2, input.videos.length));
  const inputs = input.videos.slice(0, count);

  const raw: SessionVideo[] = inputs.map((v, i) => ({
    id: uid('vid'),
    role: roleForIndex(i),
    title: v.title,
    kind: v.kind,
    url: v.kind === 'file' ? '' : v.url,
    filePath: v.kind === 'file' ? v.path : undefined,
    fileName: v.fileName ?? v.file?.name,
    fileSize: v.fileSize ?? v.file?.size,
    currentTime: 0,
    duration: v.duration ?? 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    offsetMs: v.offsetMs ?? 0
  }));

  // With several sources the clock cannot be the source (it would restart with every episode): the reaction keeps it.
  const more = inputs[0].moreSources ?? [];
  const masterId = (input.masterPolicy === 'reaction' || more.length ? raw[1] : raw[0]).id;
  const offsets = rebaseOffsets(raw, masterId);
  const videos = raw.map((v) => ({ ...v, offsetMs: offsets[v.id], muted: !!input.muteOthers && v.id !== masterId }));

  const extraItems: SourceItem[] = more.map((m) => ({
    id: uid('vid'),
    title: m.title,
    kind: m.kind,
    url: m.kind === 'file' ? '' : m.url,
    filePath: m.kind === 'file' ? m.path : undefined,
    fileName: m.fileName ?? m.file?.name,
    fileSize: m.fileSize ?? m.file?.size,
    duration: m.duration ?? 0,
    gapMs: null
  }));
  if (extraItems.length) {
    const first = videos[0];
    first.sources = [
      { id: first.id, title: first.title, kind: first.kind, url: first.url, filePath: first.filePath, fileName: first.fileName, fileSize: first.fileSize, duration: first.duration, gapMs: null },
      ...extraItems
    ];
    first.sourceIndex = 0;
    first.firstOffsetMs = first.offsetMs;
  }

  const preset = typeof input.layout === 'object' ? input.layout.preset : null;
  const layoutType: LayoutType = preset ? preset.layoutType : (input.layout as LayoutType);
  const slots = preset ? preset.slots : buildLayout(layoutType, count);

  const session: Session = {
    id: uid('ses'),
    name: input.name?.trim() || defaultSessionName(inputs),
    createdAt: now,
    lastModified: now,
    updatedAt: now,
    videos,
    alignment: {
      layoutType,
      locked: Boolean(preset),
      coordinates: slotsToCoordinates(videos, slots),
      base: slots.map((s) => ({ ...s, crop: { ...s.crop } }))
    },
    canvasAspect: input.canvasAspect ?? preset?.canvasAspect ?? '16:9',
    isLinked: input.linked,
    isTheaterMode: false,
    masterId,
    presetId: preset?.id
  };

  const pick = (v: NewVideoInput): PickedFile => ({ file: v.file, path: v.path, handle: v.handle, name: v.fileName ?? v.file?.name ?? '', size: v.fileSize ?? v.file?.size ?? 0 });
  const files = [
    ...inputs.flatMap((v, i) => (v.file || v.path ? [{ id: videos[i].id, picked: pick(v) }] : [])),
    ...more.flatMap((v, k) => (v.file || v.path ? [{ id: extraItems[k].id, picked: pick(v) }] : []))
  ];
  return { session, files };
}

/**
 * Deep copy with fresh ids; the caller decides how to carry local media over.
 * `src` must be a plain object — pass `$state.snapshot(session)` for store data.
 */
export function cloneSession(src: Session, now = Date.now()): { session: Session; idMap: Record<ID, ID> } {
  const idMap: Record<ID, ID> = {};
  const videos = src.videos.map((v) => {
    const id = uid('vid');
    idMap[v.id] = id;
    // A playlist's episodes need new ids too; the first still shares the layer's.
    const sources = v.sources?.map((it) => {
      const itemId = it.id === v.id ? id : uid('vid');
      idMap[it.id] = itemId;
      return { ...it, id: itemId };
    });
    return { ...v, id, sources };
  });
  const coordinates: Session['alignment']['coordinates'] = {};
  for (const [oldId, t] of Object.entries(src.alignment.coordinates)) {
    if (idMap[oldId]) coordinates[idMap[oldId]] = { ...t, crop: { ...t.crop } };
  }
  const session: Session = {
    ...structuredClone(src),
    id: uid('ses'),
    name: `${src.name} copy`,
    createdAt: now,
    lastModified: now,
    updatedAt: now,
    videos,
    alignment: { ...src.alignment, coordinates, base: src.alignment.base?.map((s) => ({ ...s, crop: { ...s.crop } })) },
    masterId: idMap[src.masterId] ?? videos[0].id
  };
  return { session, idMap };
}

/** A portable description of a session: no blob URLs, no thumbnail. Local videos keep their file path, so the same machine reopens them. Pass a plain object. */
export function exportConfig(session: Session) {
  const { thumbnail: _thumbnail, ...rest } = session;
  return {
    app: 'reaction-player',
    version: 1,
    exportedAt: new Date().toISOString(),
    session: {
      ...rest,
      videos: rest.videos.map((v) => ({ ...v, url: v.kind === 'file' ? '' : v.url, sources: v.sources?.map((it) => ({ ...it, url: it.kind === 'file' ? '' : it.url })) }))
    }
  };
}
