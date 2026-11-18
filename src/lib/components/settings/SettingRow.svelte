<script lang="ts">
  /**
   * One setting: its name and a line of help on the left, the control on the
   * right. Rows stack inside a section and are separated by hairlines. On a
   * narrow window the control drops under the text.
   */
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    hint?: string;
    /** Marks the title as the control's accessible name target (the id of the control). */
    for?: string;
    children: Snippet;
  }
  let { title, hint, for: target, children }: Props = $props();
</script>

<div class="flex items-center justify-between gap-8 border-b border-line py-5 last:border-b-0 max-sm:flex-col max-sm:items-stretch max-sm:gap-3">
  <div class="min-w-0 max-w-lg">
    {#if target}
      <label for={target} class="text-[14.5px] font-medium">{title}</label>
    {:else}
      <h3 class="text-[14.5px] font-medium">{title}</h3>
    {/if}
    {#if hint}<p class="mt-1 text-[13px] leading-snug text-fg-2">{hint}</p>{/if}
  </div>
  <div class="flex shrink-0 items-center gap-3 max-sm:w-full">{@render children()}</div>
</div>
