<script lang="ts" module>
  import type { PickedFile } from '$lib/engine/media';

  /** What the stepper knows about the video in one slot. */
  export interface SlotData {
    title: string;
    kind: 'file' | 'url';
    url: string;
    file?: File;
    /** Absolute path on disk (desktop). */
    path?: string;
    handle?: PickedFile['handle'];
    fileName?: string;
    fileSize?: number;
    duration?: number;
    width?: number;
    height?: number;
    thumb?: string;
    busy?: boolean;
    error?: string;
  }
</script>

<script lang="ts">
  /**
   * One row of the New Session stepper: a role (source / reaction / extra), and
   * the video that fills it. A video arrives by drop, by the file picker, or as a
   * pasted link; once it is probed the row shows its still, length and size.
   */
  import { Clapperboard, FolderOpen, Link2, Loader, X } from '@lucide/svelte';
  import { dropzone } from '$lib/actions/dropzone';
  import type { VideoRole } from '$lib/types';
  import { formatBytes, formatTime } from '$lib/utils/format';
  import IconButton from '../ui/IconButton.svelte';

  interface Props {
    role: VideoRole;
    label: string;
    hint: string;
    slot: SlotData | null;
    onchoose: () => void;
    onfiles: (files: PickedFile[]) => void;
    onurl: (url: string) => void;
    onclear: () => void;
  }

  let { role, label, hint, slot, onchoose, onfiles, onurl, onclear }: Props = $props();

  let link = $state('');
  let editingLink = $state(false);

  function submitLink() {
    const v = link.trim();
    if (!v) return;
    onurl(v);
    link = '';
    editingLink = false;
  }

  const dot = $derived(role === 'source' ? 'bg-accent' : role === 'reaction' ? 'bg-fg' : 'bg-fg-3');
</script>

  <div
    use:dropzone={{ accept: 'video', onfiles }}
    class="flex items-stretch gap-4 border border-line p-3 transition-colors data-[dragging=true]:bg-accent-soft"
  >
    <div class="relative grid h-[81px] w-36 shrink-0 place-items-center overflow-hidden border border-line bg-black">
      {#if slot?.thumb}
        <img src={slot.thumb} alt="" class="size-full object-contain" />
      {:else if slot?.busy}
        <Loader size={18} class="animate-spin text-fg-3" />
      {:else}
        <Clapperboard size={20} strokeWidth={1.4} class="text-fg-3" />
      {/if}
      {#if slot?.duration}
        <span class="num absolute right-1 bottom-1 bg-black/80 px-1 text-[11px] text-fg">{formatTime(slot.duration)}</span>
      {/if}
    </div>

    <div class="flex min-w-0 flex-1 flex-col justify-between">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <span class="flex items-center gap-2 text-[14px] font-medium">
            <span class="size-2 rounded-full {dot}"></span>{label}
          </span>
          {#if slot}
            <span class="block truncate text-[13px] text-fg" title={slot.title}>{slot.title}</span>
            <span class="num block truncate text-[12px] {slot.error ? 'text-danger' : 'text-fg-3'}">
              {#if slot.error}{slot.error}
              {:else}{slot.width ? `${slot.width}×${slot.height}` : ''}{slot.fileSize ? ` · ${formatBytes(slot.fileSize)}` : ''}{slot.kind === 'url' ? ' · link' : ''}{/if}
            </span>
          {:else}
            <span class="block text-[12.5px] text-fg-3">{hint}</span>
          {/if}
        </div>
        {#if slot}<IconButton icon={X} label="Remove {label.toLowerCase()}" size="sm" onclick={onclear} />{/if}
      </div>

      {#if editingLink}
        <form class="mt-2 flex gap-2" onsubmit={(e) => (e.preventDefault(), submitLink())}>
          <input class="input h-8 text-[13px]" type="url" placeholder="https://…/video.mp4" bind:value={link} data-autofocus />
          <button class="shrink-0 px-2 text-[13px] text-accent hover:underline" type="submit">Add</button>
          <button class="shrink-0 px-1 text-[13px] text-fg-3 hover:text-fg" type="button" onclick={() => (editingLink = false)}>Cancel</button>
        </form>
      {:else}
        <div class="mt-2 flex gap-1.5">
          <button class="inline-flex h-8 items-center gap-1.5 border border-line-strong px-3 text-[13px] text-fg-2 transition-colors hover:border-fg-3 hover:text-fg" onclick={onchoose}>
            <FolderOpen size={14} />{slot ? 'Replace' : 'Choose file'}
          </button>
          <button class="inline-flex h-8 items-center gap-1.5 px-3 text-[13px] text-fg-3 transition-colors hover:text-fg" onclick={() => (editingLink = true)}>
            <Link2 size={14} />Link
          </button>
        </div>
      {/if}
    </div>
  </div>

