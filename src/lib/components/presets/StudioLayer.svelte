<script lang="ts">
  /**
   * One slot on the studio canvas: its sampled still, cropped and fitted exactly
   * like a live layer, with the same drag and resize gesture the player uses.
   * Slots with no still yet draw as a labelled outline so they can be placed
   * before anything is sampled.
   *
   * Onion skin: the source (top layer) turns see-through so the layer under it
   * shows. Wipe: the source is cut at the wipe line — the picture on one side of
   * the line is the source, on the other side whatever lies beneath it.
   */
  import { Film, Layers, UserRound } from '@lucide/svelte';
  import { layerGesture } from '$lib/actions/layerGesture';
  import type { IconComponent, Rect, VideoRole } from '$lib/types';
  import { HANDLES, type SnapGuide, rectToStyle, videoPlacement } from '$lib/utils/geometry';
  import type { Studio } from './studio.svelte';

  interface Props {
    studio: Studio;
    index: number;
    z: number;
    stage: () => HTMLElement | null | undefined;
    onguides: (guides: SnapGuide[]) => void;
  }

  let { studio, index, z, stage, onguides }: Props = $props();

  const ICON: Record<VideoRole, IconComponent> = { source: Film, reaction: UserRound, extra: Layers };
  const NAME: Record<VideoRole, string> = { source: 'Source', reaction: 'Reaction', extra: 'Extra' };

  const slot = $derived(studio.slots[index]);
  const t = $derived(slot?.t);
  const isSource = $derived(slot?.role === 'source');
  const selected = $derived(studio.selected === index);
  const Icon = $derived(ICON[slot?.role ?? 'extra']);

  let bw = $state(0);
  let bh = $state(0);
  const place = $derived(
    slot?.frame && t ? videoPlacement({ w: bw, h: bh }, slot.frame.width, slot.frame.height, t.crop, t.fit) : null
  );

  /** Opacity on screen: the source goes see-through in onion-skin mode, everything else shows as saved. */
  const opacity = $derived(isSource && studio.mode === 'onion' ? Math.min(t?.opacity ?? 1, studio.onion) : (t?.opacity ?? 1));

  /** The part of the source the wipe hides, as a clip-path. Anything under the line shows the layers beneath. */
  const clip = $derived.by(() => {
    if (!isSource || studio.mode !== 'wipe' || !t) return '';
    if (studio.wipeAxis === 'x') {
      const cut = Math.min(1, Math.max(0, (studio.wipe - t.x) / t.w));
      return `clip-path:inset(0 0 0 ${(cut * 100).toFixed(3)}%)`;
    }
    const cut = Math.min(1, Math.max(0, (studio.wipe - t.y) / t.h));
    return `clip-path:inset(${(cut * 100).toFixed(3)}% 0 0 0)`;
  });

  const others = (): Rect[] =>
    studio.slots
      .filter((_, i) => i !== index)
      .map(({ t: o }) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
</script>

{#if slot && t}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    class="layer absolute"
    data-role={slot.role}
    data-selected={selected}
    style="{rectToStyle(t)};z-index:{z}"
    use:layerGesture={{
      stage,
      rect: () => ({ x: t.x, y: t.y, w: t.w, h: t.h }),
      others,
      aspect: () => studio.normAspect(index),
      enabled: () => true,
      onChange: (r) => studio.setRect(index, r),
      onGuides: onguides,
      onStart: () => studio.select(index)
    }}
    onclick={() => studio.select(index)}
  >
    <div class="absolute inset-0 overflow-hidden bg-black" style="opacity:{opacity};{clip}" bind:clientWidth={bw} bind:clientHeight={bh}>
      {#if slot.frame && place}
        <img
          src={slot.frame.dataUrl}
          alt=""
          draggable="false"
          class="pointer-events-none absolute max-w-none select-none"
          style="left:{place.left}px;top:{place.top}px;width:{place.width}px;height:{place.height}px"
        />
      {:else}
        <div class="absolute inset-0 grid place-items-center text-fg-3">
          <span class="flex flex-col items-center gap-1.5">
            <Icon size={20} strokeWidth={1.6} class={isSource ? 'text-accent' : ''} />
            <span class="text-[12px]">No frame yet</span>
          </span>
        </div>
      {/if}
    </div>

    <div class="frame pointer-events-none absolute inset-0"></div>
    <div class="pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 bg-black px-1.5 py-1 text-[11px] text-fg-2">
      <Icon size={12} strokeWidth={2} class={isSource ? 'text-accent' : ''} />{NAME[slot.role]}
    </div>

    {#if selected}
      {#each HANDLES as h (h)}
        <span class="grip" data-handle={h}></span>
      {/each}
    {/if}
  </div>
{/if}

<style>
  /* Mirrors Layer.svelte so a slot looks the same here as it will in the player. */
  .layer {
    touch-action: none;
    cursor: move;
  }
  .frame {
    outline: 1px solid rgb(255 255 255 / 0.22);
    outline-offset: -1px;
  }
  .layer[data-role='source'] .frame {
    outline-color: var(--color-accent-line);
  }
  .layer[data-selected='true'] .frame {
    outline: 1.5px dashed #fff;
  }
  .layer[data-selected='true'][data-role='source'] .frame {
    outline: 2px solid var(--color-accent);
  }
  .grip {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #fff;
    border: 1px solid #000;
  }
  .grip::after {
    content: '';
    position: absolute;
    inset: -7px;
  }
  .layer[data-role='source'] .grip {
    background: var(--color-accent);
  }
  .grip[data-handle='nw'] { left: -5px; top: -5px; cursor: nwse-resize; }
  .grip[data-handle='n'] { left: calc(50% - 5px); top: -5px; cursor: ns-resize; }
  .grip[data-handle='ne'] { right: -5px; top: -5px; cursor: nesw-resize; }
  .grip[data-handle='e'] { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
  .grip[data-handle='se'] { right: -5px; bottom: -5px; cursor: nwse-resize; }
  .grip[data-handle='s'] { left: calc(50% - 5px); bottom: -5px; cursor: ns-resize; }
  .grip[data-handle='sw'] { left: -5px; bottom: -5px; cursor: nesw-resize; }
  .grip[data-handle='w'] { left: -5px; top: calc(50% - 5px); cursor: ew-resize; }
</style>
