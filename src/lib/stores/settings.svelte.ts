/**
 * App settings.
 *
 * Small values go through `persistence` (settings.json on desktop, LocalStorage in a browser); the wallpaper is a
 * file of its own so a large picture can never bloat the settings.
 */
import { DEFAULT_SETTINGS, LS_SETTINGS } from '../constants';
import type { AppSettings, PlaybackPrefs, Wallpaper } from '../types';
import { loadWallpaper, lsGet, lsSet, removeWallpaper, saveWallpaper } from './persistence';

class SettingsStore {
  settings = $state<AppSettings>({ ...DEFAULT_SETTINGS, playback: { ...DEFAULT_SETTINGS.playback } });
  ready = $state(false);
  /** False when the wallpaper could not be kept (a full disk, a blocked browser store). */
  wallpaperPersisted = $state(true);

  get playback(): PlaybackPrefs {
    return this.settings.playback;
  }
  get wallpaper(): Wallpaper | null {
    return this.settings.wallpaper;
  }

  async init(): Promise<void> {
    const stored = lsGet<Partial<AppSettings>>(LS_SETTINGS, {});
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      wallpaper: null,
      playback: { ...DEFAULT_SETTINGS.playback, ...(stored.playback ?? {}) }
    };
    this.settings.wallpaper = await loadWallpaper();
    this.ready = true;
  }

  #persist(): void {
    lsSet(LS_SETTINGS, { ...this.settings, wallpaper: null });
  }

  patchPlayback(patch: Partial<PlaybackPrefs>): void {
    this.settings.playback = { ...this.settings.playback, ...patch };
    this.#persist();
  }

  /** Full clarity keeps the wallpaper untouched; off lays a plain (unblurred) dark veil over it. */
  setWallpaperClear(clear: boolean): void {
    this.settings.wallpaperClear = clear;
    this.#persist();
  }

  /** The layout a new session starts in. */
  setDefaultLayout(layout: AppSettings['defaultLayout']): void {
    this.settings.defaultLayout = layout;
    this.#persist();
  }

  async setWallpaper(wallpaper: Wallpaper | null): Promise<void> {
    if (!wallpaper) {
      this.settings.wallpaper = null;
      this.wallpaperPersisted = true;
      await removeWallpaper();
      return;
    }
    const kept = await saveWallpaper(wallpaper);
    this.wallpaperPersisted = kept !== null;
    this.settings.wallpaper = kept ?? wallpaper;
  }

  /** Playback and layout preferences back to their defaults. The wallpaper (and its clarity), sessions and presets stay. */
  resetSettings(): void {
    const { wallpaper, wallpaperClear } = this.settings;
    this.settings = { ...DEFAULT_SETTINGS, wallpaper, wallpaperClear, playback: { ...DEFAULT_SETTINGS.playback } };
    this.#persist();
  }
}

export const settings = new SettingsStore();
