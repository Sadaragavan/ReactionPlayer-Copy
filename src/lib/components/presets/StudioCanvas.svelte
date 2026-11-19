<script lang="ts">
  /**
   * The calibration canvas: black, a fixed shape, every slot's sampled still on it.
   * Layers paint in the same order as the player (lowest zIndex first). In wipe
   * mode a yellow line cuts through the source; drag it, or focus it and use the
   * arrow keys, to check that edges and horizons run on across the line.
   */
  import { sortByZ } from '$lib/engine/zorder';
  import { clamp, type SnapGuide } from '$lib/utils/geometry';
  import StudioLayer from './StudioLayer.svelte';
  import type { Studio } from './studio.svelte';

  let { studio }: { studio: Studio } = $props();

  let canvas = $state<HTMLElement>();
  let guides = $state<SnapGuide[]>([]);

  const ordered = $derived(sortByZ(studio.slots.map((s, i) => ({ i, zIndex: s.t.zIndex }))));
  const vertical = $derived(studio.wipeAxis === 'x');

  /** Drags the wipe line: pointer position along its axis, as a 0–1 fraction of the canvas. */
  function dragWipe(e: PointerEvent) {
    const el = e.currentTarget as HTMLElement;
    const box = canvas?.getBoundingClientRect();
    if (!box || e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent) => {
      const f = vertical ? (m.clientX - box.left) / box.width : (m.clientY - box.top) / box.height;
      studio.wipe = clamp(f, 0, 1);
    };
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    move(e);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function wipeKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 0.1 : 0.01;
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (!back && !fwd) return;
    e.preventDefault();
    e.stopPropagation();
    studio.wipe = clamp(studio.wipe + (fwd ? step : -step), 0, 1);
  }
</script>

<div class="absolute inset-0 grid place-items-center p-4 md:p-6" style="container-type:size">
  <div
    bind:this={canvas}
    class="relative bg-black"
    style="width:min(100cqw, calc(100cqh * {studio.ratio}));aspect-ratio:{studio.ratio};box-shadow:0 0 0 1px var(--color-line-strong)"
  >
    {#each ordered as l, k (l.i)}
      <StudioLayer {studio} index={l.i} z={10 + k * 10} stage={() => canvas} onguides={(g) => (guides = g)} />
    {/each}

    {#each guides as g (g.axis + g.at)}
      <div
        class="pointer-events-none absolute z-[100] bg-accent"
        style={g.axis === 'x' ? `left:${g.at * 100}%;top:0;bottom:0;width:1px` : `top:${g.at * 100}%;left:0;right:0;height:1px`}
      ></div>
    {/each}

    {#if studio.mode === 'wipe'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="wipe absolute z-[110]"
        data-axis={studio.wipeAxis}
        role="slider"
        tabindex="0"
        aria-label="Wipe position"
        aria-orientation={vertical ? 'horizontal' : 'vertical'}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(studio.wipe * 100)}
        style={vertical ? `left:${studio.wipe * 100}%;top:0;bottom:0` : `top:${studio.wipe * 100}%;left:0;right:0`}
        onpointerdown={dragWipe}
        onkeydown={wipeKey}
      >
        <span class="line"></span>
        <span class="knob"></span>
      </div>
    {/if}
  </div>
</div>

<style>
  /* A generous hit area around a one-pixel line. */
  .wipe {
    touch-action: none;
  }
  .wipe[data-axis='x'] {
    width: 24px;
    margin-left: -12px;
    cursor: ew-resize;
  }
  .wipe[data-axis='y'] {
    height: 24px;
    margin-top: -12px;
    cursor: ns-resize;
  }
  .line {
    position: absolute;
    background: var(--color-accent);
  }
  .wipe[data-axis='x'] .line {
    left: 11.5px;
    top: 0;
    bottom: 0;
    width: 1px;
  }
  .wipe[data-axis='y'] .line {
    top: 11.5px;
    left: 0;
    right: 0;
    height: 1px;
  }
  .knob {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 14px;
    height: 14px;
    margin: -7px 0 0 -7px;
    border: 2px solid #000;
    border-radius: 50%;
    background: var(--color-accent);
  }
  .wipe:focus-visible {
    outline: none;
  }
  .wipe:focus-visible .knob {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
</style>
