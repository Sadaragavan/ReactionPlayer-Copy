/**
 * The two bundled sample clips and the `demo:` URL scheme that refers to them.
 *
 * A session stores `demo:source` / `demo:reaction`, never the hashed asset
 * path, so saved demo sessions keep working after the app is rebuilt.
 * Both clips flash and beep at one event, at different times: the reaction
 * needs `offsetMs = +1500` to line up with the source.
 */
import reactionUrl from '../../assets/demo/reaction.webm?url';
import sourceUrl from '../../assets/demo/source.webm?url';
import { resolveUrl } from './media';
import type { NewSessionInput } from './sessionFactory';
import type { LayoutType, MasterAudioPolicy, SessionVideo } from '../types';

export const DEMO_SOURCE = 'demo:source';
export const DEMO_REACTION = 'demo:reaction';
export const DEMO_OFFSET_MS = 1500;

const DEMO_URLS: Record<string, string> = { [DEMO_SOURCE]: sourceUrl, [DEMO_REACTION]: reactionUrl };

export const isDemoUrl = (url: string) => url in DEMO_URLS;

/**
 * In-memory copies of the clips. Jumping to a position in an ordinary file URL
 * needs the host to answer HTTP Range requests; some static hosts (Python's
 * http.server, a few CDNs) do not, and the reaction clip then cannot reach its
 * offset. Blob URLs seek everywhere, so demo playback uses them once loaded.
 */
const blobUrls = new Map<string, string>();
let warming: Promise<void> | null = null;

/**
 * The clip as a Blob. In the single-file build the clips are `data:` URLs; those are decoded here
 * rather than fetched, so a host that blocks `fetch` of `data:` (a strict CSP) cannot break the demo.
 */
async function clipBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    const head = url.slice(5, comma);
    const body = url.slice(comma + 1);
    const type = head.split(';')[0] || 'video/webm';
    if (!/;base64/i.test(head)) return new Blob([decodeURIComponent(body)], { type });
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

/** Loads both clips into memory (once). Await it before a demo session is created or opened. Never rejects. */
export function warmDemoClips(): Promise<void> {
  warming ??= Promise.all(
    Object.entries(DEMO_URLS).map(async ([key, url]) => {
      try {
        blobUrls.set(key, URL.createObjectURL(await clipBlob(url)));
      } catch {
        /* keep the plain URL: it works wherever Range requests do */
      }
    })
  ).then(() => undefined);
  return warming;
}

/** Whether a session plays either bundled clip. */
export const usesDemoClips = (s: { videos: Pick<SessionVideo, 'url'>[] }) => s.videos.some((v) => isDemoUrl(v.url));

/** The URL a `<video>` should load for this session video, or '' when a file still has to be relinked. */
export function playableUrl(video: Pick<SessionVideo, 'id' | 'kind' | 'url'>): string {
  if (video.kind === 'url') return blobUrls.get(video.url) ?? DEMO_URLS[video.url] ?? video.url;
  return resolveUrl(video);
}

/** “Try the demo”: both clips, already offset so the flashes line up when linked. */
export function demoSessionInput(
  layout: Exclude<LayoutType, 'custom'>,
  masterPolicy: MasterAudioPolicy,
  linked: boolean
): NewSessionInput {
  return {
    name: 'Demo: flash sync',
    videos: [
      { title: 'Source clip', kind: 'url', url: DEMO_SOURCE, duration: 12 },
      { title: 'Reaction clip', kind: 'url', url: DEMO_REACTION, duration: 16, offsetMs: DEMO_OFFSET_MS }
    ],
    layout,
    linked,
    masterPolicy,
    canvasAspect: '16:9'
  };
}
