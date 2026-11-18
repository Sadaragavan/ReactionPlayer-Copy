<script lang="ts">
  /**
   * The black canvas and every layer on it.
   *
   * The canvas keeps the session's aspect ratio inside the space the HUD leaves
   * free (`inset`), so an alignment is pixel-exact at any window size; "fill"
   * follows the space instead. Layers are painted in `paintOrder`, which puts the
   * source last — the source can never end up underneath a reaction.
   */
  import { canvasRatio } from '$lib/engine/capture';
  import { paintOrder } from '$lib/engine/layouts';
  import { session } from '$lib/stores/session.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { SnapGuide } from '$lib/utils/geometry';
  import { MORPH } from '../session/metrics';
  import Layer from './Layer.svelte';
  import { stageMenu } from './menus';

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
  const ordered = $derived(s ? paintOrder(s.videos) : []);
  const ratio = $derived(s && s.canvasAspect !== 'fill' ? canvasRatio(s.canvasAspect) : null);

  // Only the bare canvas reacts here: layers handle their own clicks and menus.
  function onclick(e: MouseEvent) {
    if (e.target === e.currentTarget) session.select(null);
  }
  function oncontextmenu(e: MouseEvent) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    ui.openMenu(e.clientX, e.clientY, stageMenu());
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
    class="canvas relative bg-black"
    data-chrome={chrome}
    data-theater={theater}
    style={ratio ? `width:min(100cqw, calc(100cqh * ${ratio}));aspect-ratio:${ratio}` : 'width:100cqw;height:100cqh'}
    {onclick}
    {oncontextmenu}
  >
    {#each ordered as v, i (v.id)}
      <Layer video={v} z={10 + i * 10} stage={() => canvas} onguides={(g) => (guides = g)} />
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
