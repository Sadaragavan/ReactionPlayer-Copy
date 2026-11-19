/**
 * Two things the Dock and the Home menu both do, kept in one place so they cannot drift apart.
 */
import { desktop } from '../platform';
import { router } from '../stores/router.svelte';
import { session } from '../stores/session.svelte';
import { ui } from '../stores/ui.svelte';
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
