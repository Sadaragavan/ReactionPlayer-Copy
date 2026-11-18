<script lang="ts">
  /** Marks something that needs Pro. Yellow outline, never a fill, so it never competes with a primary action. */
  import { Lock } from '@lucide/svelte';

  let { class: cls = '', locked = true }: { class?: string; locked?: boolean } = $props();
</script>

<span class="inline-flex h-5 items-center gap-1 rounded-sm border border-accent-line px-1.5 text-[11px] leading-none font-semibold text-accent {cls}">
  {#if locked}<Lock size={10} strokeWidth={2.4} />{/if}Pro
</span>
