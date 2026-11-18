<script lang="ts">
  /**
   * One saved session in the browser: a preview of the canvas as it was left,
   * where the viewer stopped, and the four things you can do with it. The
   * preview is the real composite captured by the player; sessions that were
   * never played show a schematic of their layout instead.
   */
  import { Cloud, Copy, Download, Film, Pencil, Play, Trash2 } from '@lucide/svelte';
  import { tip } from '$lib/actions/tooltip';
  import { canvasRatio } from '$lib/engine/capture';
  import { settings } from '$lib/stores/settings.svelte';
  import type { Session } from '$lib/types';
  import { formatTime, plural, timeAgo } from '$lib/utils/format';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import LayoutPreview from '../ui/LayoutPreview.svelte';
  import { sessionProgress } from './stats';

  interface Props {
    session: Session;
    onresume: () => void;
    onduplicate: () => void;
    onexport: () => void;
    ondelete: () => void;
    onrename: (name: string) => void;
  }

  let { session: s, onresume, onduplicate, onexport, ondelete, onrename }: Props = $props();

  const progress = $derived(sessionProgress(s));
  const ratio = $derived(canvasRatio(s.canvasAspect));
  const slots = $derived(s.videos.map((v) => s.alignment.coordinates[v.id]).filter(Boolean));
  const synced = $derived(settings.limits.cloudSync && s.syncedAt);

  let editing = $state(false);
  let draft = $state('');

  function startRename() {
    draft = s.name;
    editing = true;
  }

  function commit() {
    if (!editing) return;
    editing = false;
    const name = draft.trim();
    if (name && name !== s.name) onrename(name);
  }

  /** Focuses and selects the name as soon as the field appears. */
  function focusAll(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') {
      e.stopPropagation();
      editing = false;
    }
  }
</script>

<article class="group flex flex-col border border-line transition-colors duration-150 hover:border-line-strong">
  <button
    type="button"
    class="relative block aspect-video w-full overflow-hidden border-b border-line bg-black"
    aria-label="Resume {s.name}"
    onclick={onresume}
  >
    <span class="absolute inset-0 grid place-items-center" style="container-type:size">
      {#if s.thumbnail}
        <img src={s.thumbnail} alt="" class="size-full object-contain" draggable="false" />
      {:else}
        <span class="block" style="width:min(86cqw, calc(86cqh * {ratio}))">
          <LayoutPreview {slots} {ratio} />
        </span>
      {/if}
    </span>
    {#if progress.length > 0}
      <span class="absolute inset-x-0 bottom-0 h-0.5 bg-white/15" aria-hidden="true">
        <span class="block h-full bg-accent" style="width:{(progress.fraction * 100).toFixed(2)}%"></span>
      </span>
    {/if}
  </button>

  <div class="flex flex-1 flex-col p-3.5">
    <div class="flex h-8 items-center gap-2">
      {#if editing}
        <input
          class="input h-8 min-w-0 flex-1 px-2.5 text-[14px]"
          aria-label="Session name"
          maxlength="80"
          bind:value={draft}
          use:focusAll
          onblur={commit}
          {onkeydown}
        />
      {:else}
        <h3 class="min-w-0 flex-1 truncate text-[15px] font-semibold" title={s.name}>{s.name}</h3>
        {#if synced}
          <span use:tip={{ text: `Synced ${timeAgo(s.syncedAt!)}`, side: 'top' }} class="text-fg-3"><Cloud size={14} strokeWidth={1.8} /></span>
        {/if}
      {/if}
    </div>

    <div class="mt-1 flex items-center justify-between gap-3 text-[12.5px] text-fg-2">
      <span class="flex min-w-0 items-center gap-3">
        <span class="flex shrink-0 items-center gap-1.5" title={plural(s.videos.length, 'video')}>
          <Film size={13} strokeWidth={1.8} />{s.videos.length}
        </span>
        <span class="num truncate">{formatTime(progress.at)} <span class="text-fg-3">of</span> {formatTime(progress.length)}</span>
      </span>
      <span class="shrink-0 text-fg-3">{timeAgo(s.lastModified)}</span>
    </div>

    <div class="mt-3.5 flex items-center gap-0.5">
      <Button size="sm" variant="secondary" class="mr-auto" onclick={onresume}>
        <Play size={13} strokeWidth={2} fill="currentColor" class="text-accent" />Resume
      </Button>
      <IconButton size="sm" icon={Pencil} label="Rename" onclick={startRename} />
      <IconButton size="sm" icon={Copy} label="Duplicate" onclick={onduplicate} />
      <IconButton size="sm" icon={Download} label="Export config" onclick={onexport} />
      <IconButton size="sm" icon={Trash2} label="Delete" class="hover:!text-danger" onclick={ondelete} />
    </div>
  </div>
</article>
