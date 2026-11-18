/**
 * The auto-hiding HUD.
 *
 * It is visible while the pointer moves, a key is pressed, or the pointer rests
 * on the HUD itself, and fades after `hudAutoHideMs` of stillness. It never
 * hides under an open menu, and — if the user asked for it — never while
 * playback is paused. The timer polls instead of cancelling, so a menu that
 * closes later still lets the HUD go without any extra wiring.
 */
import { settings } from '$lib/stores/settings.svelte';
import { ui } from '$lib/stores/ui.svelte';

export class Hud {
  visible = $state(true);
  /** Extra reasons to stay on screen (e.g. paused + “keep while paused”). */
  keepWhile: () => boolean = () => false;

  #hover = false;
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** Show now and (re)start the countdown. */
  poke(): void {
    this.visible = true;
    this.#arm(settings.playback.hudAutoHideMs);
  }

  /** The pointer is over (or left) a HUD bar. */
  hover(on: boolean): void {
    this.#hover = on;
    this.poke();
  }

  destroy(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #blocked(): boolean {
    return this.#hover || !!ui.menu || this.keepWhile();
  }

  #arm(ms: number): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#blocked()) this.#arm(500);
      else this.visible = false;
    }, Math.max(400, ms));
  }
}
