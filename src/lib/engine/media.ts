/**
 * Media registry: where playable URLs for local files live.
 *
 * Desktop: a local video is remembered by its absolute path. The URL is
 * `local-media://…`, served from disk with Range support, so it never expires and
 * a session reopens by itself after a restart. Only a file that has been moved or
 * deleted needs “Choose file”.
 *
 * Browser: blob URLs die with the page, so a session keeps only the file name.
 * On resume the registry tries the saved File System Access handle (Chromium);
 * otherwise the player shows “Choose file” on just the layers that need it.
 * Remote URLs need none of this.
 */
import { VIDEO_ACCEPT } from '../constants';
import { toMediaUrl } from '../../shared/mediaUrl';
import { desktop } from '../platform';
import { idbDelete, idbGet, idbPut } from '../stores/persistence';
import type { ID, Session, SessionVideo } from '../types';
import { pickFiles } from '../utils/file';

/** Minimal slice of the File System Access API (not in lib.dom for every TS version). */
export interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  queryPermission?(d: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' }): Promise<PermissionState>;
}

type PickerWindow = Window & {
  showOpenFilePicker?: (opts: {
    multiple?: boolean;
    types?: { description?: string; accept: Record<string, string[]> }[];
    excludeAcceptAllOption?: boolean;
  }) => Promise<FsFileHandle[]>;
};

/** Blob URLs and `local-media://` URLs of the files in use, by video id. */
const urls = new Map<ID, string>();
const files = new Map<ID, File>();

/** What picking, dropping or choosing a video gives back. */
export interface PickedFile {
  name: string;
  size: number;
  /** Absolute path on disk (desktop only). */
  path?: string;
  /** The browser's `File` object. Absent when the desktop's native dialog picked the file. */
  file?: File;
  handle?: FsFileHandle;
}

/** The URL that plays a picked file right now, for probing and sampling. Revoke it with `releasePickedUrl`. */
export function pickedUrl(p: PickedFile): string {
  if (p.path) return toMediaUrl(p.path);
  return URL.createObjectURL(p.file as File);
}

export function releasePickedUrl(p: PickedFile, url: string): void {
  if (!p.path) URL.revokeObjectURL(url);
}

/** Native dialog on desktop; the File System Access picker or a plain `<input>` in the browser. */
export async function pickVideoFiles(multiple = false): Promise<PickedFile[]> {
  if (desktop) return desktop.pickVideos(multiple);

  const w = window as PickerWindow;
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const handles = await w.showOpenFilePicker({
        multiple,
        types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.ogv'] } }]
      });
      return Promise.all(
        handles.map(async (handle) => {
          const file = await handle.getFile();
          return { handle, file, name: file.name, size: file.size };
        })
      );
    } catch (err) {
      // AbortError = the user closed the dialog. Anything else (blocked in an
      // iframe, no activation) falls through to the classic input below.
      if (err instanceof DOMException && err.name === 'AbortError') return [];
    }
  }
  return (await pickFiles(VIDEO_ACCEPT, multiple)).map((file) => ({ file, name: file.name, size: file.size }));
}

/** Turns a `File` from a drop or an `<input>` into a `PickedFile`, with its path on desktop. */
export function pickedFromFile(file: File, handle?: FsFileHandle): PickedFile {
  const path = desktop?.pathForFile(file) || undefined;
  return { file, handle, path, name: file.name, size: file.size };
}

/** Registers a picked file for a video id and returns the URL that plays it. */
export function registerFile(videoId: ID, picked: PickedFile): string {
  const previous = urls.get(videoId);
  if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
  files.delete(videoId);

  let url: string;
  if (picked.path && desktop) {
    url = toMediaUrl(picked.path);
  } else if (picked.file) {
    url = URL.createObjectURL(picked.file);
    files.set(videoId, picked.file);
    if (picked.handle) void idbPut('handles', picked.handle, videoId);
  } else {
    return '';
  }
  urls.set(videoId, url);
  return url;
}

/** The URL a `<video>` should load right now, or '' when the file needs relinking. */
export function resolveUrl(video: Pick<SessionVideo, 'id' | 'kind' | 'url' | 'filePath'>): string {
  if (video.kind === 'url') return video.url;
  return urls.get(video.id) ?? '';
}

export const needsRelink = (video: Pick<SessionVideo, 'id' | 'kind' | 'url'>) => video.kind === 'file' && !urls.has(video.id);

export const fileFor = (id: ID) => files.get(id);

/** Makes `to` play whatever `from` plays (a playlist that shrinks back to one video keeps the survivor's media under the layer's id). */
export function aliasMedia(from: ID, to: ID): void {
  const url = urls.get(from);
  if (url) urls.set(to, url);
  const file = files.get(from);
  if (file) files.set(to, file);
}

/** Every piece of media a session needs: each video, or each item of a source playlist. */
export function mediaItems(session: Session): Pick<SessionVideo, 'id' | 'kind' | 'filePath'>[] {
  return session.videos.flatMap((v): Pick<SessionVideo, 'id' | 'kind' | 'filePath'>[] => v.sources ?? [v]);
}

export function release(ids: ID[]): void {
  for (const id of ids) {
    const url = urls.get(id);
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    urls.delete(id);
    files.delete(id);
  }
}

export function forget(ids: ID[]): void {
  release(ids);
  for (const id of ids) void idbDelete('handles', id);
}

/**
 * Brings back every local file in a session. Desktop: a saved path is used again as long as the file is still
 * there. Browser: from its saved handle (call from a user gesture so the browser may prompt).
 * Returns the ids that are still missing.
 */
export async function restoreSessionMedia(session: Session): Promise<ID[]> {
  const missing: ID[] = [];
  for (const v of mediaItems(session)) {
    if (v.kind !== 'file' || urls.has(v.id)) continue;
    let ok = false;
    try {
      if (desktop) {
        if (v.filePath && (await desktop.statFile(v.filePath))) {
          urls.set(v.id, toMediaUrl(v.filePath));
          ok = true;
        }
      } else {
        const handle = await idbGet<FsFileHandle>('handles', v.id);
        if (handle) {
          let perm = (await handle.queryPermission?.({ mode: 'read' })) ?? 'prompt';
          if (perm !== 'granted') perm = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
          if (perm === 'granted') {
            registerFile(v.id, { file: await handle.getFile(), handle, name: handle.name, size: 0 });
            ok = true;
          }
        }
      }
    } catch {
      ok = false;
    }
    if (!ok) missing.push(v.id);
  }
  return missing;
}
