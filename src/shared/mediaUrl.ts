/**
 * The `local-media://` scheme: permanent, seekable URLs for video files on disk.
 *
 * A session stores the absolute path of each local video. The renderer turns it
 * into `local-media://media/<percent-encoded path>`, and the main process serves
 * that URL with HTTP Range support (see `electron/media.ts`). Pure string
 * functions only, so both processes and the tests can share them.
 */

export const MEDIA_SCHEME = 'local-media';
const HOST = 'media';

/** Extensions the protocol will serve. Anything else is refused, so the scheme cannot be used to read arbitrary files. */
export const VIDEO_EXTENSIONS = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'ogv'] as const;
/** Converted audio (see electron/proxy.ts) is served too. */
export const AUDIO_EXTENSIONS = ['m4a'] as const;
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'] as const;

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mkv: 'video/x-matroska',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  m4a: 'audio/mp4',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif'
};

export function extensionOf(path: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(path);
  return m ? m[1].toLowerCase() : '';
}

/** The MIME type for a servable file, or null when its extension is not allowed. */
export function mimeFor(path: string): string | null {
  return MIME[extensionOf(path)] ?? null;
}

export const isVideoPath = (path: string) => (VIDEO_EXTENSIONS as readonly string[]).includes(extensionOf(path));

/** `/home/me/a b.mp4` or `C:\Clips\a b.mp4` → `local-media://media/home/me/a%20b.mp4` (the Windows drive keeps its colon, encoded). */
export function toMediaUrl(absPath: string): string {
  const norm = absPath.replace(/\\/g, '/');
  const rooted = norm.startsWith('/') ? norm : `/${norm}`;
  return `${MEDIA_SCHEME}://${HOST}${rooted.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * The inverse of `toMediaUrl`. Returns null for a foreign scheme or host, or for a
 * path that tries to climb out with `..`. A Windows drive (`/C:/x`) loses its leading slash.
 */
export function fromMediaUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== `${MEDIA_SCHEME}:` || u.hostname !== HOST) return null;
  let path: string;
  try {
    path = u.pathname.split('/').map(decodeURIComponent).join('/');
  } catch {
    return null;
  }
  if (path.split('/').includes('..') || path.includes('\0')) return null;
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}
