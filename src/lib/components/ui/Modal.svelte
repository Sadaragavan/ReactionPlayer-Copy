<script lang="ts">
  /**
   * Dialog on a black scrim. No blur anywhere: the scrim is plain black at 82 %,
   * so whatever is behind stays crisp but quiet. Esc and a click on the scrim close it.
   */
  import type { Snippet } from 'svelte';
  import { X } from '@lucide/svelte';
  import { focusTrap, portal } from '$lib/actions/dom';
  import IconButton from './IconButton.svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    /** Accessible name, and the visible title unless `hideTitle`. */
    title: string;
    hideTitle?: boolean;
    /** Tailwind max-width class for the panel. */
    width?: string;
    children: Snippet;
    footer?: Snippet;
  }

  let { open, onclose, title, hideTitle = false, width = 'max-w-xl', children, footer }: Props = $props();

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div
    use:portal
    class="fade-in fixed inset-0 z-[200] grid place-items-center bg-black/80 p-4"
    onpointerdown={(e) => e.target === e.currentTarget && onclose()}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabindex="-1"
      use:focusTrap
      {onkeydown}
      class="float pop-in flex max-h-[min(92dvh,860px)] w-full flex-col overflow-hidden rounded-lg {width}"
    >
      <header class="flex h-14 shrink-0 items-center justify-between border-b border-line pr-2 pl-5">
        {#if hideTitle}<span class="sr-only">{title}</span>{:else}<h2 class="text-[15px] font-semibold">{title}</h2>{/if}
        <IconButton icon={X} label="Close" kbd="Esc" side="bottom" onclick={onclose} />
      </header>
      <div class="min-h-0 flex-1 overflow-y-auto">{@render children()}</div>
      {#if footer}
        <footer class="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}
