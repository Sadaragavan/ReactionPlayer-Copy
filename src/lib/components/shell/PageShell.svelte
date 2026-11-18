<script lang="ts">
  /** Dock on the left, a scrolling page on the right. Used by every page except Home (which has its own menu) and the player. */
  import type { Snippet } from 'svelte';
  import Dock from './Dock.svelte';

  let { children, wide = false }: { children: Snippet; wide?: boolean } = $props();
</script>

<div class="flex h-full max-md:flex-col">
  <Dock />
  <main class="min-h-0 min-w-0 flex-1 overflow-y-auto max-md:pb-14">
    <div class="mx-auto w-full px-5 py-8 md:px-10 md:py-12 {wide ? 'max-w-[1400px]' : 'max-w-5xl'}">{@render children()}</div>
  </main>
</div>
