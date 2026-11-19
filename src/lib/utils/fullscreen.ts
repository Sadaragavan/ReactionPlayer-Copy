/**
 * Fullscreen. Desktop: the native window (`BrowserWindow.setFullScreen`), so it works the same on Wayland, X11, Windows
 * and macOS and the compositor never shows a browser-style prompt. Browser: the Fullscreen API, including the
 * WebKit-prefixed variant older Safari still needs.
 */
import { desktop } from '../platform';

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };

/** Desktop only: the last state the main process reported. */
let nativeOn = false;
if (desktop) {
  void desktop.isFullScreen().then((on) => (nativeOn = on));
  desktop.onFullScreenChange((on) => (nativeOn = on));
}

export function isFullscreen(): boolean {
  if (desktop) return nativeOn;
  const d = document as FsDocument;
  return !!(d.fullscreenElement ?? d.webkitFullscreenElement);
}

export async function toggleFullscreen(target: HTMLElement = document.documentElement): Promise<void> {
  if (desktop) {
    nativeOn = await desktop.setFullScreen(!nativeOn);
    return;
  }
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
  if (desktop) return desktop.onFullScreenChange(fn);
  const handler = () => fn(isFullscreen());
  document.addEventListener('fullscreenchange', handler);
  document.addEventListener('webkitfullscreenchange', handler);
  return () => {
    document.removeEventListener('fullscreenchange', handler);
    document.removeEventListener('webkitfullscreenchange', handler);
  };
}
