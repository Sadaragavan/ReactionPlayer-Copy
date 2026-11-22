/**
 * Two things the Dock and the Home menu both do, kept in one place so they cannot drift apart.
 */
import { desktop } from '../platform';
import { presets } from '../stores/presets.svelte';
import { router } from '../stores/router.svelte';
import { session } from '../stores/session.svelte';
import { ui } from '../stores/ui.svelte';
import { coordinatesToSlots } from './layouts';
import { playback } from './playback.svelte';

/** Reopens the last session and goes to the player. */
export async function continueLast(): Promise<void> {
  if (await session.resume()) router.go('session');
  else ui.toast('That session is no longer saved.', 'error');
}

/**
 * Saves the place, releases the media and closes the app for real. In a plain browser (`npm run dev:web`) a page
 * cannot close itself, so it only goes back to Home.
 */
export async function quitApp(): Promise<void> {
  playback.release();
  await session.close();
  router.go('home');
  if (desktop) await desktop.quitApp();
  else window.close();
}

/**
 * Saves the open session's layout (where every layer sits, its crop and its stacking) as a custom preset, shown in Presets and
 * offered when starting a new session. A session that already has a preset of its own updates that one instead of adding another.
 */
export async function saveLayoutAsPreset(): Promise<void> {
  const s = session.current;
  if (!s) return;
  const existing = s.presetId ? presets.custom.find((p) => p.id === s.presetId) : undefined;
  const saved = await presets.save({
    id: existing?.id,
    name: existing?.name ?? `${s.name} layout`.slice(0, 48),
    layoutType: s.alignment.layoutType,
    slots: coordinatesToSlots(s.videos, s.alignment.coordinates),
    canvasAspect: s.canvasAspect === 'fill' ? undefined : s.canvasAspect,
    thumbnail: playback.thumbnail(320) ?? existing?.thumbnail
  });
  s.presetId = saved.id;
  await session.save();
  ui.toast(existing ? `Preset “${saved.name}” updated.` : `Layout saved as the preset “${saved.name}”.`, 'success', {
    label: 'Open presets',
    run: () => router.go('presets')
  });
}
