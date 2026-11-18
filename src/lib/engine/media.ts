/**
 * Media registry: where playable URLs for local files live.
 *
 * Blob URLs die with the page, so sessions persist only the file *name*. On
 * resume we try to get the file back from a saved File System Access handle
 * (Chromium); anywhere else the player shows a “Choose file” prompt for just
 * the missing layers. Remote URLs need none of this.
 */
import { VIDEO_ACCEPT } from '../constants';
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

const urls = new Map<ID, string>();
const files = new Map<ID, File>();

export interface PickedFile {
  file: File;
  handle?: FsFileHandle;
}

/** Native picker with handle support when available, plain `<input>` otherwise. */
export async function pickVideoFiles(multiple = false): Promise<PickedFile[]> {
  const w = window as PickerWindow;
  if (typeof w.showOpenFilePicker === 'function') {
    try {
      const handles = await w.showOpenFilePicker({
        multiple,
        types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.m4v', '.mov', '.webm', '.mkv', '.ogv'] } }]
      });
      return Promise.all(handles.map(async (handle) => ({ handle, file: await handle.getFile() })));
    } catch (err) {
      // AbortError = the user closed the dialog. Anything else (blocked in an
      // iframe, no activation) falls through to the classic input below.
      if (err instanceof DOMException && err.name === 'AbortError') return [];
    }
  }
  return (await pickFiles(VIDEO_ACCEPT, multiple)).map((file) => ({ file }));
}

/** Registers a local file for a video id and returns its fresh blob URL. */
export function registerFile(videoId: ID, file: File, handle?: FsFileHandle): string {
  const previous = urls.get(videoId);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(file);
  urls.set(videoId, url);
  files.set(videoId, file);
  if (handle) void idbPut('handles', handle, videoId);
  return url;
}

/** The URL a `<video>` should load right now, or '' when the file needs relinking. */
export function resolveUrl(video: Pick<SessionVideo, 'id' | 'kind' | 'url'>): string {
  return video.kind === 'url' ? video.url : (urls.get(video.id) ?? '');
}

export const needsRelink = (video: Pick<SessionVideo, 'id' | 'kind' | 'url'>) => video.kind === 'file' && !urls.has(video.id);

export const fileFor = (id: ID) => files.get(id);

export function release(ids: ID[]): void {
  for (const id of ids) {
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
    files.delete(id);
  }
}

export function forget(ids: ID[]): void {
  release(ids);
  for (const id of ids) void idbDelete('handles', id);
}

/**
 * Tries to bring back every local file in a session from its saved handle.
 * Call from a user gesture so the browser may show a permission prompt.
 * Returns the ids that are still missing.
 */
export async function restoreSessionMedia(session: Session): Promise<ID[]> {
  const missing: ID[] = [];
  for (const v of session.videos) {
    if (v.kind !== 'file' || urls.has(v.id)) continue;
    let ok = false;
    try {
      const handle = await idbGet<FsFileHandle>('handles', v.id);
      if (handle) {
        let perm = (await handle.queryPermission?.({ mode: 'read' })) ?? 'prompt';
        if (perm !== 'granted') perm = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
        if (perm === 'granted') {
          registerFile(v.id, await handle.getFile(), handle);
          ok = true;
        }
      }
    } catch {
      ok = false;
    }
    if (!ok) missing.push(v.id);
  }
  return missing;
}
