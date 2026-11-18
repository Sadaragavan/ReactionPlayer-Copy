<script lang="ts">
  /**
   * What a list shows when it has nothing to list. It says what is missing and
   * hands over the next action, instead of decorating the gap.
   */
  import type { Snippet } from 'svelte';
  import type { IconComponent } from '$lib/types';

  interface Props {
    icon: IconComponent;
    title: string;
    children?: Snippet;
    actions?: Snippet;
  }
  let { icon: Icon, title, children, actions }: Props = $props();
</script>

<div class="fade-in flex flex-col items-center gap-4 border border-dashed border-line-strong px-6 py-16 text-center">
  <Icon size={26} strokeWidth={1.5} class="text-fg-3" />
  <div class="max-w-sm">
    <h2 class="text-[16px] font-semibold">{title}</h2>
    {#if children}<p class="mt-1.5 text-fg-2">{@render children()}</p>{/if}
  </div>
  {#if actions}<div class="flex flex-wrap justify-center gap-2">{@render actions()}</div>{/if}
</div>
