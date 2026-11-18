/**
 * Two things the Dock and the Home menu both do, kept in one place so they cannot drift apart.
 */
import { router } from '../stores/router.svelte';
import { session } from '../stores/session.svelte';
import { ui } from '../stores/ui.svelte';
import { playback } from './playback.svelte';

/** Reopens the last session and goes to the player. */
export async function continueLast(): Promise<void> {
  if (await session.resume()) router.go('session');
  else ui.toast('That session is no longer saved.', 'error');
}

/** A web page cannot close itself, so “Quit” saves the place, releases the media and parks the app on a dark screen. */
export async function quitApp(): Promise<void> {
  playback.release();
  await session.close();
  router.go('home');
  ui.dormant = true;
}
