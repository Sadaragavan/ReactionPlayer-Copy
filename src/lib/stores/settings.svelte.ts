/**
 * App settings.
 *
 * Small values go through `persistence` (settings.json on desktop, LocalStorage in a browser); the wallpaper is a
 * file of its own so a large picture can never bloat the settings.
 */
import { DEFAULT_SETTINGS, LS_SETTINGS } from '../constants';
import { applyTheme, swatchesForWallpaper } from '../engine/theme';
import { buildTheme, swatchesFromPicks, type Oklch } from '../utils/palette';
import { ui } from './ui.svelte';
import type { AppSettings, PlaybackPrefs, ThemeSource, Wallpaper } from '../types';
import { loadWallpaper, lsGet, lsSet, removeWallpaper, saveWallpaper } from './persistence';

class SettingsStore {
  settings = $state<AppSettings>({ ...DEFAULT_SETTINGS, playback: { ...DEFAULT_SETTINGS.playback } });
  ready = $state(false);
  /** False when the wallpaper could not be kept (a full disk, a blocked browser store). */
  wallpaperPersisted = $state(true);
  /** What the last attempt to take colors from the wallpaper found. */
  themeStatus = $state<'off' | 'themed' | 'custom' | 'neutral' | 'unreadable' | 'no-wallpaper'>('off');

  get playback(): PlaybackPrefs {
    return this.settings.playback;
  }
  get wallpaper(): Wallpaper | null {
    return this.settings.wallpaper;
  }

  async init(): Promise<void> {
    const stored = lsGet<Partial<AppSettings> & { autoTheme?: boolean }>(LS_SETTINGS, {});
    // Settings saved before colors could be picked by hand had a plain on/off switch for the wallpaper colors.
    if (stored.autoTheme && !stored.themeSource) stored.themeSource = 'wallpaper';
    delete stored.autoTheme;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      wallpaper: null,
      playback: { ...DEFAULT_SETTINGS.playback, ...(stored.playback ?? {}) }
    };
    this.settings.wallpaper = await loadWallpaper();
    // Apply the saved theme before anything is drawn; work it out again only if there is none yet.
    this.#applyStored();
    if (this.settings.themeSource === 'wallpaper' && !this.settings.themeSwatches) await this.refreshTheme();
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
    if (this.settings.themeSource === 'wallpaper') await this.refreshTheme();
    else void this.offerTheme();
  }

  /** Where the colors come from: the classic yellow, the wallpaper, or colors picked by hand. */
  async setThemeSource(source: ThemeSource): Promise<void> {
    this.settings.themeSource = source;
    await this.refreshTheme();
  }

  /** Sets a color picked by hand and applies it at once (it can be called as a picker is dragged). `null` for the second accent makes one from the first. */
  setCustomAccent(which: 'accent' | 'accent2', hex: string | null): void {
    if (which === 'accent') {
      if (hex) this.settings.customAccent = hex;
    } else this.settings.customAccent2 = hex;
    this.#applyStored();
    this.#persist();
  }

  /** The accents picked by hand, as the theme will use them. `adjusted`: one was made lighter so it reads on black. */
  get customSwatches() {
    return swatchesFromPicks(this.settings.customAccent, this.settings.customAccent2);
  }

  /** Keep the black base (accents and glow only) or tint the text, lines and hover tones too. Does not read the picture again. */
  setThemeKeepBlack(keep: boolean): void {
    this.settings.themeKeepBlack = keep;
    this.#applyStored();
    this.#persist();
  }

  setAskThemeOnWallpaper(ask: boolean): void {
    this.settings.askThemeOnWallpaper = ask;
    this.#persist();
  }

  /** The two accents the current source gives, or null for the classic look. */
  #swatches(): { accent: Oklch; accent2: Oklch } | null {
    const { themeSource, themeSwatches } = this.settings;
    if (themeSource === 'wallpaper') return themeSwatches;
    if (themeSource === 'custom') return this.customSwatches;
    return null;
  }

  #applyStored(): void {
    const sw = this.#swatches();
    applyTheme(sw ? buildTheme(sw, { keepBlack: this.settings.themeKeepBlack }) : null);
    const source = this.settings.themeSource;
    this.themeStatus = source === 'classic' ? 'off' : source === 'custom' ? 'custom' : sw ? 'themed' : this.themeStatus === 'themed' ? 'no-wallpaper' : this.themeStatus;
  }

  /**
   * Applies the theme. For the wallpaper that means reading its colors; with no wallpaper, or one with no color to follow or that
   * cannot be read, the classic look is used.
   */
  async refreshTheme(): Promise<void> {
    if (this.settings.themeSource !== 'wallpaper') {
      this.#applyStored();
      this.#persist();
      return;
    }
    const wp = this.settings.wallpaper;
    if (!wp) this.themeStatus = 'no-wallpaper';
    else {
      const outcome = await swatchesForWallpaper(wp.url);
      if (outcome.kind === 'themed') {
        this.settings.themeSwatches = { accent: outcome.swatches.accent, accent2: outcome.swatches.accent2 };
        this.#applyStored();
        this.themeStatus = 'themed';
        this.#persist();
        return;
      }
      this.themeStatus = outcome.kind;
    }
    this.settings.themeSwatches = null;
    applyTheme(null);
    this.#persist();
  }

  /** After a wallpaper is picked while the colors are classic: works out its colors and, if there are any, asks whether to use them. */
  async offerTheme(): Promise<void> {
    const wp = this.settings.wallpaper;
    if (!wp || this.settings.themeSource !== 'classic' || !this.settings.askThemeOnWallpaper) return;
    const outcome = await swatchesForWallpaper(wp.url);
    if (outcome.kind === 'themed') ui.themeOffer = { swatches: { accent: outcome.swatches.accent, accent2: outcome.swatches.accent2 } };
  }

  /** The user said yes to the offered colors. */
  acceptThemeOffer(keepBlack: boolean, dontAskAgain: boolean): void {
    const offer = ui.themeOffer;
    ui.themeOffer = null;
    if (!offer) return;
    this.settings.themeSource = 'wallpaper';
    this.settings.themeKeepBlack = keepBlack;
    this.settings.themeSwatches = offer.swatches;
    this.settings.askThemeOnWallpaper = !dontAskAgain;
    this.#applyStored();
    this.themeStatus = 'themed';
    this.#persist();
  }

  /** The user kept the classic colors. */
  declineThemeOffer(dontAskAgain: boolean): void {
    ui.themeOffer = null;
    if (dontAskAgain) this.setAskThemeOnWallpaper(false);
  }

  /** Playback and layout preferences back to their defaults. The wallpaper (and its clarity), sessions and presets stay. */
  resetSettings(): void {
    const { wallpaper, wallpaperClear } = this.settings;
    this.settings = { ...DEFAULT_SETTINGS, wallpaper, wallpaperClear, playback: { ...DEFAULT_SETTINGS.playback } };
    this.#persist();
  }
}

export const settings = new SettingsStore();
