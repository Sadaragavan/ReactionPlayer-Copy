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
export type Tier = 'free' | 'pro';

/** How the viewports are arranged. `custom` means the user placed them by hand. */
export type LayoutType = 'split' | 'grid' | 'pip' | 'custom';

/**
 * What a video *is* in the session.
 *  - `source`   the thing being reacted to. Always painted above every other layer.
 *  - `reaction` the reaction footage. Painted below the source.
 *  - `extra`    Pro-only third/fourth angles. Painted below the reaction.
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
  /** `file` sources get a fresh blob: URL each time the app starts (see mediaRegistry). */
  kind: MediaKind;
  /** Playable URL. For files this is empty until the file has been (re)linked. */
  url: string;
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
  /** Index into `video.audioTracks` when the browser exposes them. */
  audioTrack?: number;
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
  /** Storage revision stamp; cloud sync compares this to resolve conflicts. */
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
  /** Set once the cloud adapter has acknowledged this revision. */
  syncedAt?: number;
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
}

export type BillingPlan = 'monthly' | 'yearly';

export interface AppSettings {
  /** `null` = the built-in black canvas. Wallpapers are never blurred. */
  wallpaper: Wallpaper | null;
  /** True (default) shows the wallpaper untouched; false lays a plain dark veil over it, still unblurred. */
  wallpaperClear: boolean;
  /** Layout a new session starts in. */
  defaultLayout: Exclude<LayoutType, 'custom'>;
  userTier: Tier;
  playback: PlaybackPrefs;
  billing: { plan: BillingPlan; customerId?: string };
}

export interface Profile {
  displayName: string;
  email: string;
  /** data: URL. */
  avatar?: string;
  createdAt: number;
}

/* ───────────────────────────── tiers ───────────────────────────── */

export interface TierLimits {
  maxVideos: number;
  maxCustomPresets: number;
  cloudSync: boolean;
  advancedSampler: boolean;
  /** Tallest picture (px) the tier plays without a notice. */
  maxResolution: number;
}

/* ───────────────────────────── routing ───────────────────────────── */

export type RouteName = 'home' | 'session' | 'presets' | 'sessions' | 'settings';
export type SettingsTab = 'appearance' | 'preferences' | 'profile' | 'subscription';

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

/* ───────────────────────────── cloud sync hook ───────────────────────────── */

/**
 * Implement this to back sessions with a server. The app calls `push` after
 * saves (Pro only) and `pull` from the Subscription page's “Sync now”.
 */
export interface CloudSyncAdapter {
  readonly name: string;
  isAvailable(): boolean;
  push(sessions: Session[]): Promise<{ syncedAt: number }>;
  pull(): Promise<Session[]>;
}

/* ───────────────────────────── billing hook ───────────────────────────── */

/** What starting a checkout leads to. */
export type CheckoutResult =
  /** Send the browser to the provider's hosted checkout. */
  | { kind: 'redirect'; url: string }
  /** The plan changed without leaving the page (the local demo flow). */
  | { kind: 'activated' };

/**
 * Implement this to charge for Pro. The Subscription page only ever talks to
 * this interface, so swapping the demo for Stripe (or anything else) touches
 * `billing.ts` and nothing in the UI.
 */
export interface BillingAdapter {
  readonly name: string;
  /** True when a real payment provider is wired up; false runs the local demo flow. */
  readonly live: boolean;
  startCheckout(plan: BillingPlan, profile: Profile): Promise<CheckoutResult>;
  /** The provider's customer portal (change card, invoices, cancel), or null when there is none. */
  portalUrl(customerId: string | undefined): string | null;
}
