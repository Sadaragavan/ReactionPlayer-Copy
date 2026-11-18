<script lang="ts">
  import { SHORTCUTS } from '$lib/constants';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Modal from './Modal.svelte';

  const step = $derived(String(settings.playback.seekStepSec));
</script>

<Modal open={ui.shortcutsOpen} onclose={() => (ui.shortcutsOpen = false)} title="Keyboard shortcuts" width="max-w-md">
  <ul class="divide-y divide-line px-5 py-1">
    {#each SHORTCUTS as s (s.label)}
      <li class="flex items-center justify-between gap-4 py-3">
        <span class="text-fg-2">{s.label.replace('{step}', step)}</span>
        <span class="flex shrink-0 gap-1">
          {#each s.keys as k (k)}<kbd class="kbd">{k}</kbd>{/each}
        </span>
      </li>
    {/each}
  </ul>
</Modal>
