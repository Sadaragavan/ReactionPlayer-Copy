/**
 * Shared TypeScript contracts for Reaction Player.
 *
 * Everything that crosses a module boundary (stores ↔ engine ↔ components ↔
 * persistence) is described here, so there is one place to read when you want
 * to know what a Session, a Preset or a layer placement actually is.
 */
import type { Component } from 'svelte';

/* ───────────────────────────── primitives ───────────────────────────── */

export type ID = string;

/** How the viewports are arranged. `custom` means the user placed them by hand. */
export type LayoutType = 'split' | 'grid' | 'pip' | 'custom';

/**
 * What a video *is* in the session.
 *  - `source`   the thing being reacted to.
 *  - `reaction` the reaction footage.
 *  - `extra`    a third or fourth angle.
 * Roles decide the slot a video takes in a layout and its default stacking; the stacking itself is each layer's `zIndex`.
 */
export type VideoRole = 'source' | 'reaction' | 'extra';

/**
 * Constrains a layer's shape while it is being resized.
 * `auto` follows the video's own picture ratio; `free` allows any shape.
 */
export type AspectLock = 'auto' | 'free' | '16:9' | '4:3' | '1:1' | '9:16' | '21:9';

export type FitMode = 'contain' | 'cover';

/**
 * Shape of the black canvas the layers live on. A fixed ratio keeps an
 * alignment pixel-exact at any window size; `fill` follows the window instead.
 */
export type CanvasAspect = 'fill' | '16:9' | '9:16' | '4:3' | '1:1' | '21:9';

/** Fractions (0–0.9) trimmed from each edge of the picture. */
export interface Crop {
  t: number;
  r: number;
  b: number;
  l: number;
}

/** A rectangle in normalised canvas units: (0,0) top-left, (1,1) bottom-right. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where and how one video is drawn on the black canvas. */
export interface LayerTransform extends Rect {
  /**
   * Stacking order: higher is painted on top and is hit first by the pointer. Values only matter relative to each
   * other (ties are broken by video order). Old saved objects without one are migrated on load (`engine/migrate.ts`).
   */
  zIndex: number;
  /** Hidden layers keep playing (and stay in sync) but are not drawn and cannot be hit. */
  hidden?: boolean;
  /** A locked layer cannot be moved, resized or selected by the pointer, and clicks pass through to the layers below. */
  locked?: boolean;
  crop: Crop;
  /** 0–1. */
  opacity: number;
  fit: FitMode;
  aspect: AspectLock;
}

/* ───────────────────────────── sessions ───────────────────────────── */

export type MediaKind = 'file' | 'url';

export interface SessionVideo {
  id: ID;
  role: VideoRole;
  title: string;
  /** `file` sources are local videos; on desktop they play from `filePath` through `local-media://` (see engine/media.ts). */
  kind: MediaKind;
  /** Playable URL for remote videos. Empty for local files. */
  url: string;
  /** Absolute path of a local file (desktop). It is what lets a session reopen by itself after a restart. */
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  /** The video's own playhead in seconds. */
  currentTime: number;
  duration: number;
  /** 0–1. */
  volume: number;
  muted: boolean;
  playbackRate: number;
  /**
   * Shift relative to the master clock: `local = master + offsetMs / 1000`.
   * The master video's own offset is always 0.
   */
  offsetMs: number;
  /** Index into `video.audioTracks`: which of the file's audio tracks plays. */
  audioTrack?: number;
  /** The subtitles shown on this layer, or none. */
  subtitle?: SubtitleSetting;
  /**
   * The source playlist: episodes played one after another in this one layer. Present only when there are two or more.
   * The first item has this video's own id. While a playlist exists the fields above (title, kind, url, filePath, fileName,
   * fileSize, duration, offsetMs) mirror the current item, so the rest of the app treats the layer like any other video.
   */
  sources?: SourceItem[];
  /** Which playlist item is on screen. */
  sourceIndex?: number;
  /** Where the first playlist item sits on the timeline (its `offsetMs`); the others follow it. */
  firstOffsetMs?: number;
  /** The current playlist item has not been started yet: it waits on its first frame until the user starts it. */
  waiting?: boolean;
}

/** Which subtitles a layer shows: a track stored in the video, or a subtitle file. */
export interface SubtitleSetting {
  kind: 'embedded' | 'file';
  /** Embedded: the container's number for the track. */
  track?: number;
  /** File: where it is on disk (desktop). A file picked in a browser is kept for this visit only. */
  path?: string;
  /** What the menu calls it. */
  label: string;
  /** Shifts the text in ms: positive shows it later. */
  delayMs?: number;
}

/** One episode in a source playlist. */
export interface SourceItem {
  /** Names this item's media. The first item shares the layer's id. */
  id: ID;
  title: string;
  kind: MediaKind;
  url: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  duration: number;
  audioTrack?: number;
  subtitle?: SubtitleSetting;
  /**
   * The break between the end of the previous item and the start of this one, in ms. `null` means “wait for me to start it”:
   * the item is shown on its first frame, paused, and the reaction plays on. Ignored for the first item.
   */
  gapMs: number | null;
}

export interface Alignment {
  layoutType: LayoutType;
  /** When true, layers cannot be dragged, resized or reset by accident. */
  locked: boolean;
  /** Keyed by SessionVideo.id. */
  coordinates: Record<ID, LayerTransform>;
  /**
   * The slots as last applied from a layout or preset (index = video order).
   * “Reset viewport alignment” returns a layer to its slot here.
   */
  base?: LayerTransform[];
}

export interface Session {
  id: ID;
  name: string;
  createdAt: number;
  /** Last time the user changed or played something in it (shown in the browser). */
  lastModified: number;
  /** Last time the session was written to disk. */
  updatedAt: number;
  videos: SessionVideo[];
  alignment: Alignment;
  /** Shape of the canvas the layers are placed on. */
  canvasAspect: CanvasAspect;
  /** Playback and timelines are locked together when true. */
  isLinked: boolean;
  isTheaterMode: boolean;
  /** Master clock + master audio. Always one of `videos[].id`. */
  masterId: ID;
  /**
   * Position on the shared (linked) timeline, in master-local seconds. It can
   * be negative when another video starts before the master does.
   */
  clock?: number;
  /** JPEG data URL composite of the layers, for the session browser. */
  thumbnail?: string;
  presetId?: ID;
}

/* ───────────────────────────── presets ───────────────────────────── */

/**
 * Presets are slot-based so they apply to any set of videos:
 * slot 0 → source, slot 1 → reaction, slot 2/3 → extras.
 */
export interface Preset {
  id: ID;
  name: string;
  builtIn: boolean;
  layoutType: LayoutType;
  slots: LayerTransform[];
  /**
   * Shape of the canvas the slots were aligned on. A placement only lines up
   * pixel-for-pixel on that shape, so applying the preset restores it. The
   * standard presets leave it out: they fit any shape.
   */
  canvasAspect?: Exclude<CanvasAspect, 'fill'>;
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

/** A still captured from a video for alignment work. */
export interface SampledFrame {
  id: ID;
  slot: number;
  time: number;
  width: number;
  height: number;
  dataUrl: string;
}

/* ───────────────────────────── settings ───────────────────────────── */

export interface Wallpaper {
  type: 'image' | 'gif';
  /** data: URL (uploaded) or remote URL (pasted). */
  url: string;
  name?: string;
}

export type MasterAudioPolicy = 'source' | 'reaction';
export type HardwareAcceleration = 'auto' | 'on' | 'off';

export interface PlaybackPrefs {
  /** Drift (ms) tolerated before the sync engine corrects a follower. */
  syncToleranceMs: number;
  /** Which video provides the clock and the audio in a new session. */
  masterAudio: MasterAudioPolicy;
  /** While the master has no footage (it ended or has not started), the next video that does is heard instead. */
  audioFollowsFootage: boolean;
  hardwareAcceleration: HardwareAcceleration;
  /** Arrow-key seek distance in seconds. */
  seekStepSec: number;
  /** Start new sessions with the transport linked. */
  autoLink: boolean;
  /** Milliseconds of mouse idleness before the HUD fades. */
  hudAutoHideMs: number;
  /** Keep the HUD on screen while playback is paused. */
  keepHudWhilePaused: boolean;
  /** Start over when the shared timeline reaches its end. */
  loop: boolean;
  /** New sessions mute every video but the master. Off (default): every video is audible, the reaction included. */
  muteOthers: boolean;
  /** Ask about another source when the reaction runs this many minutes past the end of the source. 0 never asks. */
  sourcePromptMinutes: number;
}

export interface AppSettings {
  /** `null` = the built-in black canvas. Wallpapers are never blurred. */
  wallpaper: Wallpaper | null;
  /** True (default) shows the wallpaper untouched; false lays a plain dark veil over it, still unblurred. */
  wallpaperClear: boolean;
  /** Layout a new session starts in. */
  defaultLayout: Exclude<LayoutType, 'custom'>;
  playback: PlaybackPrefs;
}

/* ───────────────────────────── routing ───────────────────────────── */

export type RouteName = 'home' | 'session' | 'presets' | 'sessions' | 'settings';
export type SettingsTab = 'appearance' | 'preferences';

export interface Route {
  name: RouteName;
  /** Only meaningful for `settings`. */
  tab?: SettingsTab;
}

/* ───────────────────────────── UI plumbing ───────────────────────────── */

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

export type IconComponent = Component<{ size?: number | string; strokeWidth?: number | string; class?: string }>;

export interface MenuItem {
  type?: 'item';
  id: string;
  label: string;
  icon?: IconComponent;
  /** Right-aligned hint such as a key. */
  hint?: string;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  /** Opens a nested panel on hover. */
  children?: MenuEntry[];
}

export interface MenuSeparator {
  type: 'separator';
  id: string;
}

/** An inline “− value +” row, used for nudging offsets without closing the menu. */
export interface MenuStepper {
  type: 'stepper';
  id: string;
  label: string;
  icon?: IconComponent;
  /** Current value, already formatted. */
  value: () => string;
  /** Steps offered as small buttons, e.g. [-100, -10, -1, 1, 10, 100]. */
  steps: number[];
  stepLabel?: (step: number) => string;
  onStep: (step: number) => void;
  onReset?: () => void;
}

export type MenuEntry = MenuItem | MenuSeparator | MenuStepper;

export interface MenuRequest {
  x: number;
  y: number;
  entries: MenuEntry[];
  /** Open upwards from (x, y) — for menus that belong to a control on the bottom edge. */
  above?: boolean;
}
