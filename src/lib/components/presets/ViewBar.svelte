<script lang="ts">
  /**
   * The strip under the calibration canvas: how the layers are viewed while
   * they are lined up. These views change what is drawn, never what is saved.
   */
  import Segmented from '../ui/Segmented.svelte';
  import Slider from '../ui/Slider.svelte';
  import type { Studio, StudioMode } from './studio.svelte';

  let { studio }: { studio: Studio } = $props();

  const MODES: { value: StudioMode; label: string }[] = [
    { value: 'normal', label: 'Normal' },
    { value: 'onion', label: 'Onion skin' },
    { value: 'wipe', label: 'Wipe' }
  ];
  const AXES: { value: 'x' | 'y'; label: string }[] = [
    { value: 'x', label: 'Left and right' },
    { value: 'y', label: 'Top and bottom' }
  ];
  const HINT: Record<StudioMode, string> = {
    normal: 'Drag a layer to place it. Layers snap to the canvas edges and to each other.',
    onion: 'The source turns see-through, so you can line it up with the picture beneath.',
    wipe: 'Drag the yellow line. Edges and horizons should run straight across it.'
  };
</script>

<div class="flex min-h-12 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2">
  <Segmented size="sm" label="View" options={MODES} value={studio.mode} onchange={(m) => (studio.mode = m)} />

  {#if studio.mode === 'onion'}
    <div class="flex w-56 items-center gap-3">
      <Slider label="Source opacity" min={0.05} max={1} step={0.01} value={studio.onion} oninput={(v) => (studio.onion = v)} />
      <span class="num w-9 shrink-0 text-right text-[12px] text-fg-2">{Math.round(studio.onion * 100)}%</span>
    </div>
  {:else if studio.mode === 'wipe'}
    <Segmented size="sm" label="Wipe direction" options={AXES} value={studio.wipeAxis} onchange={(a) => (studio.wipeAxis = a)} />
  {/if}

  <p class="ml-auto min-w-0 text-[12.5px] text-fg-3 max-xl:hidden">{HINT[studio.mode]}</p>
</div>
