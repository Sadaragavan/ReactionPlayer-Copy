<script lang="ts">
  /**
   * The black canvas and every layer on it.
   *
   * The canvas keeps the session's aspect ratio inside the space the HUD leaves
   * free (`inset`), so an alignment is pixel-exact at any window size; "fill"
   * follows the space instead. Layers are painted from the lowest `zIndex` to the
   * highest.
   *
   * The pointer is handled here, not by the layers: a press is tested against the
   * layers from the highest `zIndex` down (`hitTest`), skipping hidden and locked
   * ones, and whatever it finds is what gets selected, dragged, played or
   * right-clicked. The layers themselves ignore the pointer.
   */
  import { beginGesture, type LayerGestureOptions } from '$lib/actions/layerGesture';
  import { normAspectOf } from '$lib/engine/aspect';
  import { canvasRatio } from '$lib/engine/capture';
  import { playback } from '$lib/engine/playback.svelte';
  import { type HitLayer, hitTest, videosByZ } from '$lib/engine/zorder';
  import { session } from '$lib/stores/session.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { ID, Rect } from '$lib/types';
  import type { SnapGuide } from '$lib/utils/geometry';
  import { MORPH } from '../session/metrics';
  import Layer from './Layer.svelte';
  import { stageMenu, videoMenu } from './menus';

  interface Props {
    /** The HUD is showing: layer outlines and badges fade in with it. */
    chrome: boolean;
    theater: boolean;
    /** Pixels the HUD occupies on each side (all zero in theater mode). */
    inset: { top: number; right: number; bottom: number };
  }

  let { chrome, theater, inset }: Props = $props();

  let canvas = $state<HTMLElement>();
  let guides = $state<SnapGuide[]>([]);

  const s = $derived(session.current);
  /** Bottom → top. */
  const ordered = $derived(s ? videosByZ(s.videos, s.alignment.coordinates) : []);
  const ratio = $derived(s && s.canvasAspect !== 'fill' ? canvasRatio(s.canvasAspect) : null);

  const hitLayers = $derived<HitLayer[]>(
    s
      ? s.videos.flatMap((v) => {
          const t = s.alignment.coordinates[v.id];
          return t ? [{ id: v.id, rect: { x: t.x, y: t.y, w: t.w, h: t.h }, zIndex: t.zIndex, hidden: t.hidden, locked: t.locked }] : [];
        })
      : []
  );

  /** The layer under the pointer, topmost first, or null for the bare canvas. */
  function pick(e: MouseEvent): ID | null {
    const box = canvas?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return hitTest(hitLayers, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
  }

  const rectOf = (id: ID): Rect => {
    const t = session.current?.alignment.coordinates[id];
    return t ? { x: t.x, y: t.y, w: t.w, h: t.h } : { x: 0, y: 0, w: 1, h: 1 };
  };

  /** A drag ends in a `click`; this tells the click it was not a click. */
  let moved = false;
  /** A press on a grip also ends in a click, which must not count as one on the bare canvas. */
  let onGrip = false;
  /** Where a press began: on a locked canvas no drag runs, but a press that travelled is still not a click. */
  let pressed: { x: number; y: number } | null = null;
  const CLICK_TRAVEL_PX = 5;

  function gestureFor(id: ID): LayerGestureOptions {
    return {
      stage: () => canvas,
      rect: () => rectOf(id),
      others: () => (session.current?.videos ?? []).filter((v) => v.id !== id).map((v) => rectOf(v.id)),
      aspect: () => normAspectOf(id),
      enabled: () => !session.isLocked,
      onChange: (r) => {
        moved = true;
        session.setLayer(id, r);
      },
      onGuides: (g) => (guides = g),
      onStart: () => {
        moved = false;
        session.select(id);
      }
    };
  }

  function onpointerdown(e: PointerEvent) {
    pressed = { x: e.clientX, y: e.clientY };
    moved = false;
    const grip = (e.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    onGrip = !!grip;
    if (!canvas || e.button !== 0) return;
    // The grips of the selected layer sit in the layer's own element and may poke out of its box.
    const id = grip ? (grip.closest<HTMLElement>('[data-layer]')?.dataset.layer ?? null) : pick(e);
    if (id) beginGesture(canvas, e, gestureFor(id));
  }

  function togglePlay(id: ID) {
    if (session.current?.isLinked) playback.toggle();
    else playback.toggleVideo(id);
  }

  function onclick(e: MouseEvent) {
    const travelled = session.isLocked && pressed !== null && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) > CLICK_TRAVEL_PX;
    pressed = null;
    if (moved || travelled || onGrip) {
      moved = false;
      onGrip = false;
      return;
    }
    const id = pick(e);
    if (id) session.activate(id);
    if (!id) session.select(null);
    else if (session.isLocked) togglePlay(id);
    else session.select(id);
  }

  function ondblclick(e: MouseEvent) {
    const id = pick(e);
    if (id && !session.isLocked) togglePlay(id);
  }

  function oncontextmenu(e: MouseEvent) {
    e.preventDefault();
    const id = pick(e);
    if (!id) return ui.openMenu(e.clientX, e.clientY, stageMenu());
    if (!session.isLocked) session.select(id);
    ui.openMenu(e.clientX, e.clientY, videoMenu(id));
  }

  /** The move cursor shows only over a layer that a press would actually grab. */
  function onpointermove(e: PointerEvent) {
    if (!canvas || canvas.dataset.gesture) return;
    canvas.style.cursor = !session.isLocked && pick(e) ? 'move' : '';
  }
</script>

<!-- The inset eases with the same curve and duration as the HUD's morph, so the canvas follows the dock instead of jumping. -->
<div
  class="absolute grid place-items-center"
  style="top:{inset.top}px;right:{inset.right}px;bottom:{inset.bottom}px;left:0;container-type:size;transition:top {MORPH},right {MORPH},bottom {MORPH}"
>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    bind:this={canvas}
    class="canvas relative touch-none bg-black"
    data-chrome={chrome}
    data-theater={theater}
    style={ratio ? `width:min(100cqw, calc(100cqh * ${ratio}));aspect-ratio:${ratio}` : 'width:100cqw;height:100cqh'}
    {onpointerdown}
    {onpointermove}
    {onclick}
    {ondblclick}
    {oncontextmenu}
  >
    {#each ordered as v, i (v.id)}
      <Layer video={v} z={10 + i * 10} />
    {/each}

    {#each guides as g (g.axis + g.at)}
      <div
        class="pointer-events-none absolute z-[100] bg-accent"
        style={g.axis === 'x' ? `left:${g.at * 100}%;top:0;bottom:0;width:1px` : `top:${g.at * 100}%;left:0;right:0;height:1px`}
      ></div>
    {/each}
  </div>
</div>

<style>
  /* A hairline shows where the canvas ends — except in theater mode, which has no borders. */
  .canvas[data-chrome='true'][data-theater='false'] {
    box-shadow: 0 0 0 1px var(--color-line);
  }
</style>
