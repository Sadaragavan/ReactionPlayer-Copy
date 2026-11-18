/**
 * App settings and the signed-in profile.
 *
 * Small values live in LocalStorage; the wallpaper (a data URL that can be many
 * megabytes) lives in IndexedDB so it can never blow the LocalStorage quota.
 * `userTier` is the monetisation gate: every feature check in the app goes
 * through `limits` / `isPro` rather than comparing strings.
 */
import { DEFAULT_PROFILE, DEFAULT_SETTINGS, LS_PROFILE, LS_SETTINGS, TIER_LIMITS } from '../constants';
import type { AppSettings, BillingPlan, PlaybackPrefs, Profile, Tier, TierLimits, Wallpaper } from '../types';
import { idbDelete, idbGet, idbPut, lsGet, lsSet } from './persistence';

const WALLPAPER_KEY = 'wallpaper';

class SettingsStore {
  settings = $state<AppSettings>({ ...DEFAULT_SETTINGS, playback: { ...DEFAULT_SETTINGS.playback }, billing: { ...DEFAULT_SETTINGS.billing } });
  profile = $state<Profile>({ ...DEFAULT_PROFILE });
  ready = $state(false);
  /** False when the wallpaper could not be written to IndexedDB (private window, quota). */
  wallpaperPersisted = $state(true);

  get tier(): Tier {
    return this.settings.userTier;
  }
  get isPro(): boolean {
    return this.settings.userTier === 'pro';
  }
  get limits(): TierLimits {
    return TIER_LIMITS[this.settings.userTier];
  }
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
      playback: { ...DEFAULT_SETTINGS.playback, ...(stored.playback ?? {}) },
      billing: { ...DEFAULT_SETTINGS.billing, ...(stored.billing ?? {}) }
    };
    this.profile = { ...DEFAULT_PROFILE, ...lsGet<Partial<Profile>>(LS_PROFILE, {}) };
    this.settings.wallpaper = (await idbGet<Wallpaper>('kv', WALLPAPER_KEY)) ?? null;
    this.ready = true;
  }

  #persist(): void {
    lsSet(LS_SETTINGS, { ...this.settings, wallpaper: null });
  }

  patchPlayback(patch: Partial<PlaybackPrefs>): void {
    this.settings.playback = { ...this.settings.playback, ...patch };
    this.#persist();
  }

  setTier(tier: Tier): void {
    this.settings.userTier = tier;
    this.#persist();
  }

  setBilling(patch: Partial<AppSettings['billing']>): void {
    this.settings.billing = { ...this.settings.billing, ...patch };
    this.#persist();
  }

  setPlan(plan: BillingPlan): void {
    this.setBilling({ plan });
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
    this.settings.wallpaper = wallpaper;
    if (!wallpaper) {
      this.wallpaperPersisted = true;
      await idbDelete('kv', WALLPAPER_KEY);
      return;
    }
    this.wallpaperPersisted = (await idbPut('kv', wallpaper, WALLPAPER_KEY)) !== undefined;
  }

  updateProfile(patch: Partial<Profile>): void {
    this.profile = { ...this.profile, ...patch };
    lsSet(LS_PROFILE, this.profile);
  }

  /**
   * Playback and layout preferences back to their defaults. The plan, the
   * wallpaper (and its clarity), the billing choice, sessions and presets are
   * the user's own and stay.
   */
  resetSettings(): void {
    const { userTier, wallpaper, wallpaperClear, billing } = this.settings;
    this.settings = {
      ...DEFAULT_SETTINGS,
      userTier,
      wallpaper,
      wallpaperClear,
      playback: { ...DEFAULT_SETTINGS.playback },
      billing: { ...billing }
    };
    this.#persist();
  }
}

export const settings = new SettingsStore();
