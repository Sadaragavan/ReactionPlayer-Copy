/** App-wide constants: limits, defaults, lookup tables. */
import type { AppSettings, AspectLock, CanvasAspect } from './types';

export const APP_NAME = 'Reaction Player';

/* ── Limits ───────────────────────────────────────────────── */

/** A session plays two to four videos at once. */
export const MAX_VIDEOS = 4;

/* ── Defaults ─────────────────────────────────────────────── */

export const DEFAULT_SETTINGS: AppSettings = {
  wallpaper: null,
  wallpaperClear: true,
  defaultLayout: 'split',
  themeSource: 'classic',
  customAccent: '#7aa2ff',
  customAccent2: null,
  themeKeepBlack: true,
  askThemeOnWallpaper: true,
  themeSwatches: null,
  playback: {
    // Measured on 24 fps clips: 20 ms keeps the follower on the same frame as the master far more often than 40 ms,
    // and a nudge of under 1 % in speed is inaudible; below 20 ms it only corrects more often without getting closer.
    syncToleranceMs: 20,
    masterAudio: 'source',
    audioFollowsFootage: true,
    hardwareAcceleration: 'auto',
    seekStepSec: 5,
    autoLink: true,
    hudAutoHideMs: 2500,
    keepHudWhilePaused: false,
    loop: false,
    muteOthers: false,
    sourcePromptMinutes: 15
  }
};

/* ── Playback ─────────────────────────────────────────────── */

export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Steps (ms) offered in the sync-offset stepper. */
export const OFFSET_STEPS = [-100, -10, -1, 1, 10, 100] as const;

/** Frame rate assumed until the sync engine has measured a real one. */
export const FALLBACK_FPS = 30;

/** A follower further than this (seconds) from where it should be is hard-seeked. */
export const HARD_SEEK_THRESHOLD_S = 0.35;

/* ── Layers ───────────────────────────────────────────────── */

/** Smallest a layer may be, as a fraction of the canvas edge. */
export const MIN_LAYER_SIZE = 0.08;

/** Edge/centre snapping distance, as a fraction of the canvas edge. */
export const SNAP_DISTANCE = 0.008;

export const ASPECT_OPTIONS: { value: AspectLock; label: string }[] = [
  { value: 'auto', label: 'Match video' },
  { value: 'free', label: 'Free' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
  { value: '21:9', label: '21:9' }
];

export const ASPECT_RATIOS: Record<Exclude<AspectLock, 'auto' | 'free'>, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '9:16': 9 / 16,
  '21:9': 21 / 9
};

/** Canvas shapes. `ratio: null` means “follow the window”. */
export const CANVAS_ASPECTS: { value: CanvasAspect; label: string; ratio: number | null }[] = [
  { value: '16:9', label: '16:9 landscape', ratio: 16 / 9 },
  { value: '9:16', label: '9:16 vertical', ratio: 9 / 16 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '1:1', label: '1:1 square', ratio: 1 },
  { value: '21:9', label: '21:9 ultrawide', ratio: 21 / 9 },
  { value: 'fill', label: 'Fill the window', ratio: null }
];

/* ── Files ────────────────────────────────────────────────── */

export const VIDEO_ACCEPT = 'video/*,.mkv,.mov,.mp4,.m4v,.webm,.ogv';
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
export const MAX_WALLPAPER_BYTES = 12 * 1024 * 1024;

/* ── Storage ──────────────────────────────────────────────── */

export const LS_SETTINGS = 'reaction-player:settings';
export const LS_LAST_SESSION = 'reaction-player:last-session';
export const DB_NAME = 'reaction-player';
export const DB_VERSION = 1;

/* ── Keyboard help ────────────────────────────────────────── */

export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Space'], label: 'Play or pause everything' },
  { keys: ['L'], label: 'Link or unlink the timelines' },
  { keys: ['N'], label: 'Start the next source (it waits on its first frame)' },
  { keys: ['T'], label: 'Theater mode' },
  { keys: ['F'], label: 'Fullscreen' },
  // `{step}` is replaced with the Preferences → Arrow-key seek value when the list is shown.
  { keys: ['←', '→'], label: 'Seek {step} s, or one frame when paused' },
  { keys: ['Shift', '←', '→'], label: 'Always seek {step} s' },
  { keys: [',', '.'], label: 'Step one frame back or forward' },
  { keys: ['M'], label: 'Mute the master audio' },
  { keys: ['P'], label: 'Layers panel' },
  { keys: [']'], label: 'Bring the selected layer forward' },
  { keys: ['['], label: 'Send the selected layer backward' },
  { keys: ['Shift', ']'], label: 'Bring the selected layer to the front' },
  { keys: ['Shift', '['], label: 'Send the selected layer to the back' },
  { keys: ['Esc'], label: 'Close a menu or panel, leave theater mode' },
  { keys: ['?'], label: 'Show these shortcuts' }
];
