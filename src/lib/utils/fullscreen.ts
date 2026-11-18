/** Thin wrapper over the Fullscreen API, including the WebKit-prefixed variant older Safari still needs. */

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

export function isFullscreen(): boolean {
  const d = document as FsDocument;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export async function toggleFullscreen(target: HTMLElement = document.documentElement): Promise<void> {
  const d = document as FsDocument;
  try {
    if (isFullscreen()) await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
    else await ((target as FsElement).requestFullscreen?.() ?? (target as FsElement).webkitRequestFullscreen?.());
  } catch {
    /* refused (no user gesture, or blocked by an iframe): nothing to undo */
  }
}

/** Calls `fn` whenever fullscreen starts or ends; returns the cleanup. */
export function onFullscreenChange(fn: (on: boolean) => void): () => void {
  const handler = () => fn(isFullscreen());
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}
