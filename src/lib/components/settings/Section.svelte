<script lang="ts">
  /** A titled group of settings. Sentence-case heading, one line of context, rows below. */
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    intro?: string;
    children: Snippet;
    aside?: Snippet;
  }
  let { title, intro, children, aside }: Props = $props();
</script>

<section class="mt-10 first:mt-0">
  <div class="flex items-end justify-between gap-4">
    <div>
      <h2 class="text-[19px] font-semibold tracking-tight">{title}</h2>
      {#if intro}<p class="mt-1 max-w-xl text-fg-2">{intro}</p>{/if}
    </div>
    {#if aside}<div class="shrink-0">{@render aside()}</div>{/if}
  </div>
  <div class="mt-3 border-t border-line">{@render children()}</div>
</section>
