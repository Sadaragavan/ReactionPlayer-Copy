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

/** An audio track stored in a video file, as read out of the container. */
export interface AudioTrackInfo {
  /** Position among the file's audio tracks (the order `video.audioTracks` uses). */
  index: number;
  label: string;
  /** ISO 639 code ('eng', 'jpn', 'en'…). */
  language: string;
  isDefault: boolean;
  /** The container's codec name (`A_AC3`, `A_OPUS`, `ac-3`, `mp4a`…). */
  codec: string;
  /** False when Chromium cannot decode it (AC-3, E-AC-3, DTS, TrueHD…): the file plays silent unless the track is converted. */
  playable: boolean;
}

/** A subtitle track stored in a video file. */
export interface SubtitleTrackInfo {
  /** The container's own number for the track: what `subtitles.extract` takes. */
  track: number;
  label: string;
  language: string;
  codec: string;
  isDefault: boolean;
  /** False for picture-based subtitles (PGS, VobSub), which cannot be shown as text. */
  supported: boolean;
}

export interface MediaTrackInfo {
  audio: AudioTrackInfo[];
  subtitles: SubtitleTrackInfo[];
  /** The first video track's codec name (`V_MPEGH/ISO/HEVC`, `avc1`…), when it could be read. */
  videoCodec?: string;
}

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
  /** Subtitles: the tracks stored in a video, their text, and subtitle files next to it. */
  subtitles: {
    /** Audio and subtitle tracks stored in the file, plus subtitle files beside it (same name, `.srt` etc.). */
    probe(path: string): Promise<MediaTrackInfo & { sidecars: { path: string; name: string }[] }>;
    /** The timed text of one subtitle track. */
    extract(path: string, track: number): Promise<import('./subtitles').Cue[]>;
    /** The text of a subtitle file by path. */
    readFile(path: string): Promise<string | null>;
    /** Native “open” dialog for a subtitle file. */
    pickFile(): Promise<{ path: string; name: string; text: string } | null>;
  };
  /** Playable copies of what Chromium cannot play (the audio of AC-3, E-AC-3, DTS and TrueHD tracks). */
  proxy: {
    /** Converts one audio track to AAC (cached) and returns the URL that plays it. Rejects when ffmpeg is missing or fails. */
    prepareAudio(path: string, index: number): Promise<{ url: string }>;
    /** Progress (0–1) of conversions, as they run. Returns the unsubscribe. */
    onProgress(listener: (e: { path: string; index: number; fraction: number }) => void): () => void;
  };
  /** How this computer decodes video: what Chromium reports about the GPU. */
  gpuStatus(): Promise<{ videoDecode: string; rasterization: string; renderer: string }>;
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
