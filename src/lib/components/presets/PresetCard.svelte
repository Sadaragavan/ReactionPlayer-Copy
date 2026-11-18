<script lang="ts">
  /**
   * One preset in the library: how it lays out the canvas, how many videos it
   * needs, and what you can do with it. Standard presets are read-only, so
   * their edit button makes a copy to work on; your own presets edit in place.
   */
  import { Copy, Film, Pencil, Play, Trash2 } from '@lucide/svelte';
  import { CANVAS_ASPECTS } from '$lib/constants';
  import { canvasRatio } from '$lib/engine/capture';
  import { settings } from '$lib/stores/settings.svelte';
  import type { Preset } from '$lib/types';
  import { plural, timeAgo } from '$lib/utils/format';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import LayoutPreview from '../ui/LayoutPreview.svelte';
  import ProBadge from '../ui/ProBadge.svelte';

  interface Props {
    preset: Preset;
    onuse: () => void;
    onedit: () => void;
    /** Only your own presets can be deleted. */
    ondelete?: () => void;
  }

  let { preset: p, onuse, onedit, ondelete }: Props = $props();

  const ratio = $derived(canvasRatio(p.canvasAspect ?? '16:9'));
  const shape = $derived(p.canvasAspect ? CANVAS_ASPECTS.find((a) => a.value === p.canvasAspect)?.label : 'Fits any canvas shape');
  /** A preset that needs more videos than the plan allows can be copied and edited, but not used. */
  const tooBig = $derived(p.slots.length > settings.limits.maxVideos);
</script>

<article class="group flex flex-col border border-line transition-colors duration-150 hover:border-line-strong">
  <button
    type="button"
    class="relative block aspect-video w-full overflow-hidden border-b border-line bg-black disabled:cursor-not-allowed"
    aria-label="Use {p.name}"
    disabled={tooBig}
    onclick={onuse}
  >
    <span class="absolute inset-0 grid place-items-center" style="container-type:size">
      {#if p.thumbnail}
        <img src={p.thumbnail} alt="" class="size-full object-contain" draggable="false" />
      {:else}
        <span class="block" style="width:min(86cqw, calc(86cqh * {ratio}))">
          <LayoutPreview slots={p.slots} {ratio} />
        </span>
      {/if}
    </span>
  </button>

  <div class="flex flex-1 flex-col p-3.5">
    <div class="flex h-8 items-center gap-2">
      <h3 class="min-w-0 flex-1 truncate text-[15px] font-semibold" title={p.name}>{p.name}</h3>
      {#if tooBig}<ProBadge />{/if}
    </div>

    <div class="mt-1 flex items-center justify-between gap-3 text-[12.5px] text-fg-2">
      <span class="flex min-w-0 items-center gap-3">
        <span class="flex shrink-0 items-center gap-1.5" title={plural(p.slots.length, 'video')}>
          <Film size={13} strokeWidth={1.8} />{p.slots.length}
        </span>
        <span class="truncate">{shape}</span>
      </span>
      {#if !p.builtIn}<span class="shrink-0 text-fg-3">{timeAgo(p.updatedAt)}</span>{/if}
    </div>

    <div class="mt-3.5 flex items-center gap-0.5">
      <Button size="sm" variant="secondary" class="mr-auto" disabled={tooBig} onclick={onuse}>
        <Play size={13} strokeWidth={2} fill="currentColor" class="text-accent" />Use
      </Button>
      <IconButton size="sm" icon={p.builtIn ? Copy : Pencil} label={p.builtIn ? 'Make a copy to edit' : 'Edit'} onclick={onedit} />
      {#if ondelete}
        <IconButton size="sm" icon={Trash2} label="Delete" class="hover:!text-danger" onclick={ondelete} />
      {/if}
    </div>
  </div>
</article>
