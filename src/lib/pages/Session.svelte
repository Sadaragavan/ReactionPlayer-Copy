<script lang="ts">
  /**
   * The player. A black window with the canvas in the middle and a HUD glued to
   * the top and bottom borders. Everything that moves is plain data in the
   * stores; this page only wires the pieces together:
   *
   *   Stage       the canvas and its layers, stacked by their zIndex
   *   TopBar      icon-only commands, fades out after the pointer rests
   *   Transport   the bottom dock; per-video lanes that morph into one master bar
   *   LayersPanel numeric editor for the selected layer (right edge)
   *
   * Theater mode removes the insets, so the canvas takes the whole window and the
   * bars float over it. Keyboard: see SHORTCUTS in constants.ts.
   */
  import { LoaderCircle } from '@lucide/svelte';
  import { onDestroy, onMount } from 'svelte';
  import Stage from '$lib/components/player/Stage.svelte';
  import { Hud } from '$lib/components/session/hud.svelte';
  import LayersPanel from '$lib/components/session/LayersPanel.svelte';
  import { PANEL_W, TOP_H, dockHeight, laneCount } from '$lib/components/session/metrics';
  import SourcePrompt from '$lib/components/session/SourcePrompt.svelte';
  import TopBar from '$lib/components/session/TopBar.svelte';
  import Transport from '$lib/components/session/Transport.svelte';
  import { playback } from '$lib/engine/playback.svelte';
  import type { ZOp } from '$lib/engine/zorder';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { toggleFullscreen } from '$lib/utils/fullscreen';

  // Must run before the <video> elements mount: resets the engine to this session's saved place.
  playback.bind();

  const hud = new Hud();
  hud.keepWhile = () => settings.playback.keepHudWhilePaused && !playback.anyRunning;

  let panelOpen = $state(false);

  const s = $derived(session.current);
  const theater = $derived(!!s?.isTheaterMode);
  const linked = $derived(!!s?.isLinked);
  const dockH = $derived(dockHeight(laneCount(s?.videos.length ?? 2, linked)));

  // Space the HUD occupies. The stage is inset by exactly this, so alignments stay pixel-true at any window size.
  const inset = $derived({
    top: theater ? 0 : TOP_H,
    right: !theater && panelOpen ? PANEL_W : 0,
    bottom: theater ? 0 : dockH
  });

  // Pushes volume, mute and speed from the store onto the <video> elements whenever they change.
  $effect(() => {
    playback.applyProps();
  });

  // Theater mode is for watching: nothing selected, no panel.
  $effect(() => {
    if (theater) {
      panelOpen = false;
      session.select(null);
    }
  });

  onMount(() => {
    hud.poke();
    return () => hud.destroy();
  });

  onDestroy(() => {
    playback.release();
  });

  /* ── HUD visibility ── */

  let lastMove = 0;
  function onpointermove() {
    const now = performance.now();
    if (hud.visible && now - lastMove < 120) return;
    lastMove = now;
    hud.poke();
  }

  /** Home: stop, store the exact place and a fresh thumbnail, then go. */
  async function leave() {
    const thumb = playback.thumbnail();
    playback.release();
    if (thumb) session.setThumbnail(thumb);
    await session.save();
    router.go('home');
  }

  function togglePanel() {
    if (theater) session.setTheater(false);
    panelOpen = !panelOpen;
  }

  /* ── Keyboard ── */

  function typing(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    return !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
  }

  function onkeydown(e: KeyboardEvent) {
    hud.poke();
    if (!s || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (typing(e.target) || ui.menu || ui.shortcutsOpen || ui.newSessionOpen || ui.addSourceOpen) return;

    // [ and ] reorder the selected layer; Shift goes all the way. The physical key is used so every keyboard layout works.
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      const op: ZOp = e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'forward') : e.shiftKey ? 'back' : 'backward';
      if (session.selectedId && !session.isLocked) session.reorderLayer(session.selectedId, op);
      else ui.toast(session.isLocked ? 'Unlock the viewports to change the layer order.' : 'Select a layer first.', 'info');
      e.preventDefault();
      return;
    }

    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const step = settings.playback.seekStepSec;
    // Linked, the shortcuts act on the whole frame. Unlinked, they act on the active clip (the last one clicked or selected).
    const clip = s.isLinked ? null : (session.activeVideo?.id ?? null);

    switch (key) {
      case ' ':
        if (clip) playback.toggleVideo(clip);
        else playback.toggle();
        break;
      case 'l':
        playback.setLinked(!s.isLinked);
        break;
      case 'n':
        // The next source is on its first frame, waiting: start it.
        if (!playback.startNextSource()) return;
        break;
      case 't':
        session.setTheater(!s.isTheaterMode);
        break;
      case 'f':
        void toggleFullscreen();
        break;
      case 'm': {
        const target = clip ?? session.master?.id;
        if (target) session.toggleMute(target);
        break;
      }
      case 'p':
        togglePanel();
        break;
      case ',':
        void playback.step(-1, clip ?? undefined);
        break;
      case '.':
        void playback.step(1, clip ?? undefined);
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = key === 'ArrowLeft' ? -1 : 1;
        // One frame while paused (the active clip's own state when unlinked); Shift always makes the full jump.
        const moving = clip ? !!playback.running[clip] : playback.anyRunning;
        if (!moving && !e.shiftKey) void playback.step(dir, clip ?? undefined);
        else playback.skip(dir * step, clip ?? undefined);
        break;
      }
      case 'Escape':
        if (s.isTheaterMode) session.setTheater(false);
        else if (session.selectedId) session.select(null);
        else if (panelOpen) panelOpen = false;
        else return;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // A focused button would otherwise also "click" on the Space key's release.
  function onkeyup(e: KeyboardEvent) {
    if (e.key === ' ' && !typing(e.target)) e.preventDefault();
  }
</script>

<svelte:window {onkeydown} {onkeyup} />

{#if s}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="root fixed inset-0 overflow-hidden bg-black" data-idle={theater && !hud.visible} {onpointermove} onpointerdown={() => hud.poke()}>
    <Stage chrome={hud.visible} {theater} {inset} />

    {#if playback.buffering}
      <div class="pointer-events-none absolute inset-0 z-20 grid place-items-center" style="top:{inset.top}px;bottom:{inset.bottom}px;right:{inset.right}px">
        <LoaderCircle size={30} strokeWidth={1.6} class="animate-spin text-accent" />
      </div>
    {/if}

    <TopBar
      visible={hud.visible}
      overlay={theater}
      {panelOpen}
      ontogglepanel={togglePanel}
      onhover={(on) => hud.hover(on)}
      onhome={leave}
    />

    <SourcePrompt top={(hud.visible ? TOP_H : 0) + 10} />

    <LayersPanel
      open={panelOpen && !theater}
      top={hud.visible ? TOP_H : 0}
      bottom={hud.visible ? dockH : 0}
      onclose={() => (panelOpen = false)}
    />

    <Transport visible={hud.visible} overlay={theater} onhover={(on) => hud.hover(on)} />
  </div>
{/if}

<style>
  /* Cinema mode: when the HUD has faded in theater, the pointer goes with it. */
  .root[data-idle='true'],
  .root[data-idle='true'] :global(*) {
    cursor: none !important;
  }
</style>
