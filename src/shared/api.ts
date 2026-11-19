/**
 * The contract between the Electron main process and the renderer.
 *
 * `electron/preload.ts` implements `ElectronAPI` and exposes it as
 * `window.electronAPI` through `contextBridge`; the renderer only ever sees this
 * interface. When the app runs in a plain browser (`npm run dev:web`) the object
 * is absent and every caller falls back to browser behaviour (see `$lib/platform`).
 *
 * Stored documents cross the bridge as `unknown`: the renderer owns their shape
 * and validates them when they come back.
 */

export interface PickedPath {
  /** Absolute path on disk. */
  path: string;
  name: string;
  size: number;
}

export type SaveOutcome = 'saved' | 'declined' | 'failed';

export interface StoredWallpaper {
  type: 'image' | 'gif';
  /** A `data:` URL when handing one in, an `https:` link or a `local-media://` URL when it comes back. */
  url: string;
  name?: string;
}

export interface StorageAPI {
  /** The folder everything is kept in (`~/.config/reaction-player` on Linux). */
  userDataPath(): Promise<string>;
  /** `settings.json`: a flat key → value object, or null on first run. */
  readSettings(): Promise<Record<string, unknown> | null>;
  writeSettings(data: Record<string, unknown>): Promise<void>;
  /** `sessions/*.json`, with each session's thumbnail read back from `thumbnails/`. */
  listSessions(): Promise<unknown[]>;
  readSession(id: string): Promise<unknown | null>;
  writeSession(id: string, session: unknown): Promise<void>;
  deleteSession(id: string): Promise<void>;
  /** `presets.json`, thumbnails included. */
  readPresets(): Promise<unknown[]>;
  writePresets(presets: unknown[]): Promise<void>;
  /**
   * Keeps the wallpaper. An uploaded picture (a `data:` URL) becomes a file in `wallpapers/` and comes back with a
   * `local-media://` URL; a pasted web link is stored as it is.
   */
  writeWallpaper(wallpaper: StoredWallpaper): Promise<StoredWallpaper>;
  readWallpaper(): Promise<StoredWallpaper | null>;
  deleteWallpaper(): Promise<void>;
  /** Deletes settings, presets, sessions, thumbnails and the wallpaper. */
  clearAll(): Promise<void>;
}

export interface ElectronAPI {
  readonly platform: 'linux' | 'win32' | 'darwin';

  /** Closes the window and ends the app. */
  quitApp(): Promise<void>;

  /* ── window ── */
  setFullScreen(on: boolean): Promise<boolean>;
  isFullScreen(): Promise<boolean>;
  /** Fires when fullscreen starts or ends, however it was triggered. Returns the unsubscribe. */
  onFullScreenChange(listener: (on: boolean) => void): () => void;

  /* ── files and dialogs ── */
  /** Native “open video” dialog. Empty when dismissed. */
  pickVideos(multiple: boolean): Promise<PickedPath[]>;
  /** Absolute path of a dropped `File` (`webUtils.getPathForFile`), or '' when it is not on disk. */
  pathForFile(file: File): string;
  /** Size and modification time of a file, or null when it no longer exists. */
  statFile(path: string): Promise<{ size: number; mtimeMs: number } | null>;
  /** Native “save” dialog, then an atomic write of `text`. */
  saveJson(defaultName: string, text: string): Promise<SaveOutcome>;
  /** Native “open” dialog for a session `.json`; returns its text. */
  openJson(): Promise<{ name: string; text: string } | null>;
  /** Writes an image (a data: URL) to the system clipboard through Electron's native clipboard. */
  copyImage(dataUrl: string): Promise<void>;
  /** Shows the data folder in the system file manager. */
  revealDataFolder(): Promise<void>;

  storage: StorageAPI;
}

declare global {
  interface Window {
    /** Present only inside the Electron app. */
    electronAPI?: ElectronAPI;
  }
}
