<script lang="ts">
  /**
   * One tab per slot. A tab grows a small thumbnail once its frame has been
   * captured, so you can see at a glance which slots still need a picture.
   */
  import { SLOT_ICON, slotName } from './names';
  import type { Studio } from './studio.svelte';

  let { studio }: { studio: Studio } = $props();
</script>

<div role="tablist" aria-label="Slots" class="flex shrink-0 border-b border-line">
  {#each studio.slots as slot, i (i)}
    {@const Icon = SLOT_ICON[slot.role]}
    {@const on = studio.selected === i}
    <button
      type="button"
      role="tab"
      aria-selected={on}
      class="relative flex h-12 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 transition-colors duration-150 {on ? 'text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'}"
      onclick={() => studio.select(i)}
    >
      <Icon size={15} strokeWidth={1.9} class="shrink-0 {slot.role === 'source' ? 'text-accent' : ''}" />
      <span class="truncate text-[13px]">{slotName(slot.role, i)}</span>
      {#if slot.frame}
        <img src={slot.frame.dataUrl} alt="" class="h-4 w-6 shrink-0 border border-line object-cover" draggable="false" />
      {/if}
      {#if on}<span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span>{/if}
    </button>
  {/each}
</div>
