/**
 * App settings.
 *
 * Small values go through `persistence` (settings.json on desktop, LocalStorage in a browser); the wallpaper is a
 * file of its own so a large picture can never bloat the settings.
 */
import { DEFAULT_SETTINGS, LS_SETTINGS } from '../constants';
import { applyTheme, themeForWallpaper } from '../engine/theme';
import type { AppSettings, PlaybackPrefs, Wallpaper } from '../types';
import { loadWallpaper, lsGet, lsSet, removeWallpaper, saveWallpaper } from './persistence';

class SettingsStore {
  settings = $state<AppSettings>({ ...DEFAULT_SETTINGS, playback: { ...DEFAULT_SETTINGS.playback } });
  ready = $state(false);
  /** False when the wallpaper could not be kept (a full disk, a blocked browser store). */
  wallpaperPersisted = $state(true);
  /** What the last attempt to take colours from the wallpaper found. */
  themeStatus = $state<'off' | 'themed' | 'neutral' | 'unreadable' | 'no-wallpaper'>('off');

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
    // Apply the saved theme before anything is drawn; work it out again only if there is none yet.
    applyTheme(this.settings.autoTheme ? this.settings.themeVars : null);
    this.themeStatus = !this.settings.autoTheme ? 'off' : this.settings.themeVars ? 'themed' : 'no-wallpaper';
    if (this.settings.autoTheme && !this.settings.themeVars) await this.refreshTheme();
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
      await this.refreshTheme();
      return;
    }
    const kept = await saveWallpaper(wallpaper);
    this.wallpaperPersisted = kept !== null;
    this.settings.wallpaper = kept ?? wallpaper;
    await this.refreshTheme();
  }

  /** Turns “colours from the wallpaper” on or off. */
  async setAutoTheme(on: boolean): Promise<void> {
    this.settings.autoTheme = on;
    await this.refreshTheme();
  }

  /**
   * Works out the colours for the current wallpaper and applies them. With the setting off, or no wallpaper, or a wallpaper
   * that has no colour to follow or cannot be read, the classic look is used.
   */
  async refreshTheme(): Promise<void> {
    const wp = this.settings.wallpaper;
    if (!this.settings.autoTheme) this.themeStatus = 'off';
    else if (!wp) this.themeStatus = 'no-wallpaper';
    else {
      const outcome = await themeForWallpaper(wp.url);
      if (outcome.kind === 'themed') {
        this.settings.themeVars = outcome.vars;
        this.themeStatus = 'themed';
        applyTheme(outcome.vars);
        this.#persist();
        return;
      }
      this.themeStatus = outcome.kind;
    }
    this.settings.themeVars = null;
    applyTheme(null);
    this.#persist();
  }

  /** Playback and layout preferences back to their defaults. The wallpaper (and its clarity), sessions and presets stay. */
  resetSettings(): void {
    const { wallpaper, wallpaperClear } = this.settings;
    this.settings = { ...DEFAULT_SETTINGS, wallpaper, wallpaperClear, playback: { ...DEFAULT_SETTINGS.playback } };
    this.#persist();
  }
}

export const settings = new SettingsStore();
