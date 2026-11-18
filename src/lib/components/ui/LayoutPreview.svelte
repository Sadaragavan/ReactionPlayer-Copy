<script lang="ts">
  /**
   * A schematic of a layout: black canvas, the source outlined in yellow on top,
   * reactions in white. Used wherever a layout needs a quick visual: the New
   * Session stepper, preset cards, the session browser's fallback thumbnail.
   */
  import { paintOrder } from '$lib/engine/layouts';
  import type { LayerTransform, VideoRole } from '$lib/types';
  import { rectToStyle } from '$lib/utils/geometry';

  interface Props {
    slots: LayerTransform[];
    ratio?: number;
    class?: string;
  }
  let { slots, ratio = 16 / 9, class: cls = '' }: Props = $props();

  const roleFor = (i: number): VideoRole => (i === 0 ? 'source' : i === 1 ? 'reaction' : 'extra');
  const layers = $derived(paintOrder(slots.map((s, i) => ({ s, role: roleFor(i), i }))));
</script>

<div class="relative w-full overflow-hidden border border-line bg-black {cls}" style="aspect-ratio:{ratio}">
  {#each layers as l (l.i)}
    <div
      class="absolute border {l.role === 'source' ? 'border-accent bg-accent/15' : 'border-fg-2/60 bg-white/6'}"
      style="{rectToStyle(l.s)};opacity:{Math.max(0.35, l.s.opacity)}"
    ></div>
  {/each}
</div>
