<script lang="ts">
  /**
   * The alignment studio. The calibration canvas fills the left; on the right sit
   * the controls for the selected slot, in the order you use them: pick a frame
   * from its video, then place it. The strip under the canvas switches between
   * the plain view, onion skin and the wipe line.
   */
  import AdjustPanel from './AdjustPanel.svelte';
  import SamplerPanel from './SamplerPanel.svelte';
  import SlotTabs from './SlotTabs.svelte';
  import StudioBar from './StudioBar.svelte';
  import StudioCanvas from './StudioCanvas.svelte';
  import ViewBar from './ViewBar.svelte';
  import type { Studio } from './studio.svelte';

  interface Props {
    studio: Studio;
    onback: () => void;
    onsave: () => void;
  }

  let { studio, onback, onsave }: Props = $props();
</script>

<div class="flex h-full min-h-0 min-w-0 flex-1 flex-col max-md:pb-14">
  <StudioBar {studio} {onback} {onsave} />

  <div class="flex min-h-0 flex-1 max-lg:flex-col max-lg:overflow-y-auto">
    <section class="flex min-h-0 min-w-0 flex-1 flex-col max-lg:h-[68vh] max-lg:flex-none">
      <div class="relative min-h-0 flex-1">
        <StudioCanvas {studio} />
      </div>
      <ViewBar {studio} />
    </section>

    <aside
      class="flex w-[372px] shrink-0 flex-col border-l border-line max-lg:w-full max-lg:border-t max-lg:border-l-0 lg:overflow-y-auto"
      aria-label="Selected slot"
    >
      <SlotTabs {studio} />
      <div class="flex flex-col gap-7 p-4">
        <SamplerPanel {studio} />
        <AdjustPanel {studio} />
      </div>
    </aside>
  </div>
</div>
