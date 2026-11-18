<script lang="ts">
  /**
   * Step 2 of New Session: how the layers start out, the shape of the black
   * canvas, and whether the timelines are linked. Picking a preset instead of a
   * layout locks the viewports where the preset puts them.
   */
  import { CANVAS_ASPECTS } from '$lib/constants';
  import { buildLayout } from '$lib/engine/layouts';
  import { presets } from '$lib/stores/presets.svelte';
  import type { CanvasAspect, LayoutType, Preset } from '$lib/types';
  import LayoutPreview from '../ui/LayoutPreview.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Switch from '../ui/Switch.svelte';

  type Basic = Exclude<LayoutType, 'custom'>;

  interface Props {
    /** How many videos the session will have (2–4). */
    count: number;
    layout: Basic;
    preset: Preset | null;
    canvas: CanvasAspect;
    linked: boolean;
    name: string;
    placeholder: string;
  }

  let {
    count,
    layout = $bindable(),
    preset = $bindable(),
    canvas = $bindable(),
    linked = $bindable(),
    name = $bindable(),
    placeholder
  }: Props = $props();

  const ratio = $derived(CANVAS_ASPECTS.find((a) => a.value === canvas)?.ratio ?? 16 / 9);
  const layouts = $derived<{ value: Basic; label: string }[]>([
    { value: 'split', label: 'Side by side' },
    { value: 'grid', label: count > 2 ? 'Grid' : 'Stacked' },
    { value: 'pip', label: 'Corner' }
  ]);
  const shapes = CANVAS_ASPECTS.map((a) => ({ value: a.value, label: a.value === 'fill' ? 'Fill' : a.value }));
  const choices = $derived(presets.forCount(count).filter((p) => p.slots.length === count || !p.builtIn));
</script>

<div class="space-y-6">
  <section aria-label="Layout">
    <div class="grid grid-cols-3 gap-3">
      {#each layouts as l (l.value)}
        {@const on = !preset && layout === l.value}
        <button
          type="button"
          aria-pressed={on}
          class="border p-2.5 text-left transition-colors {on ? 'border-accent' : 'border-line hover:border-fg-3'}"
          onclick={() => {
            layout = l.value;
            preset = null;
          }}
        >
          <LayoutPreview slots={buildLayout(l.value, count)} {ratio} />
          <span class="mt-2 block text-[13px] {on ? 'text-fg' : 'text-fg-2'}">{l.label}</span>
        </button>
      {/each}
    </div>

    {#if choices.length}
      <p class="mt-5 mb-2 text-[12.5px] text-fg-3">Or start from a preset. Its viewports begin locked.</p>
      <div class="flex gap-3 overflow-x-auto pb-1">
        {#each choices as p (p.id)}
          {@const on = preset?.id === p.id}
          <button
            type="button"
            aria-pressed={on}
            class="w-36 shrink-0 border p-2 text-left transition-colors {on ? 'border-accent' : 'border-line hover:border-fg-3'}"
            onclick={() => {
              preset = on ? null : p;
              // A preset only lines up on the canvas shape it was made on.
              if (!on && p.canvasAspect) canvas = p.canvasAspect;
            }}
          >
            {#if p.thumbnail}
              <img src={p.thumbnail} alt="" class="w-full border border-line" style="aspect-ratio:{ratio}" />
            {:else}
              <LayoutPreview slots={p.slots} {ratio} />
            {/if}
            <span class="mt-1.5 block truncate text-[12.5px] {on ? 'text-fg' : 'text-fg-2'}">{p.name}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="space-y-5 border-t border-line pt-5">
    <div class="flex items-center justify-between gap-4">
      <span class="text-[13.5px]">Canvas shape</span>
      <Segmented size="sm" label="Canvas shape" options={shapes} value={canvas} onchange={(v) => (canvas = v)} />
    </div>

    <div class="flex items-center justify-between gap-6">
      <div>
        <span class="block text-[13.5px]">Link the timelines</span>
        <span class="block text-[12.5px] text-fg-3">Play and scrub everything as one video. Off lets you line each one up by eye first.</span>
      </div>
      <Switch label="Link the timelines" bind:checked={linked} />
    </div>

    <label class="block">
      <span class="mb-1.5 block text-[13.5px]">Name</span>
      <input class="input" bind:value={name} {placeholder} maxlength="80" />
    </label>
  </section>
</div>
