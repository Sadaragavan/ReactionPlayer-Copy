<script lang="ts">
  /** The top edge of the studio: back to the library, the preset's name, canvas shape, video count and save. */
  import { ArrowLeft, Save } from '@lucide/svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import { SHAPES, type Studio, type StudioShape } from './studio.svelte';

  interface Props {
    studio: Studio;
    onback: () => void;
    onsave: () => void;
  }

  let { studio, onback, onsave }: Props = $props();

  /** Three and four videos are a Pro feature, so those options are there but switched off on the free plan. */
  const counts = $derived(
    [2, 3, 4].map((n) => ({
      value: n,
      label: String(n),
      disabled: n > settings.limits.maxVideos,
      title: n > settings.limits.maxVideos ? 'Three or four videos need Pro' : undefined
    }))
  );
</script>

<header class="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2 md:px-4">
  <IconButton icon={ArrowLeft} label="Back to presets" side="bottom" onclick={onback} />
  <input
    class="input h-9 w-full max-w-64 min-w-40 flex-1 text-[14px]"
    type="text"
    maxlength="48"
    placeholder="Preset name"
    aria-label="Preset name"
    autocomplete="off"
    bind:value={studio.name}
  />

  <div class="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
    <label class="flex items-center gap-2 text-[12.5px] text-fg-3">
      Canvas
      <select
        class="input h-8 w-auto text-[12.5px] text-fg"
        aria-label="Canvas shape"
        value={studio.canvas}
        onchange={(e) => (studio.canvas = e.currentTarget.value as StudioShape)}
      >
        {#each SHAPES as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
      </select>
    </label>

    <span class="flex items-center gap-2 text-[12.5px] text-fg-3">
      Videos
      <Segmented size="sm" label="Number of videos" options={counts} value={studio.slots.length} onchange={(n) => studio.setCount(n)} />
    </span>

    <Button variant="primary" icon={Save} disabled={studio.saving} onclick={onsave}>
      {studio.editingId ? 'Save changes' : 'Save preset'}
    </Button>
  </div>
</header>
