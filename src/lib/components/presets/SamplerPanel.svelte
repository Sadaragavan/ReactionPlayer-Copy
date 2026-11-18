<script lang="ts">
  /**
   * The frame sampler for the selected slot. Open a video (pick, drop, the demo
   * clip, or the one playing in the open session), scrub to the picture you want
   * to line up and capture it: the still is drawn onto the calibration canvas
   * with canvas `drawImage`, at the video's own resolution.
   *
   *   , .  or  ← →   one frame        Shift  one second        C  capture
   */
  import { Camera, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clapperboard, FolderOpen, Loader, Sparkles, Trash2 } from '@lucide/svelte';
  import { adopt } from '$lib/actions/dom';
  import { dropzone } from '$lib/actions/dropzone';
  import { FALLBACK_FPS } from '$lib/constants';
  import { DEMO_REACTION, DEMO_SOURCE, playableUrl, warmDemoClips } from '$lib/engine/demo';
  import { pickVideoFiles } from '$lib/engine/media';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { formatTime } from '$lib/utils/format';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import ProBadge from '../ui/ProBadge.svelte';
  import Slider from '../ui/Slider.svelte';
  import type { Studio } from './studio.svelte';

  let { studio }: { studio: Studio } = $props();

  const i = $derived(studio.selected);
  const slot = $derived(studio.current);
  const el = $derived(slot?.clip ? studio.clipEl(i) : null);
  const demoUrl = $derived(i === 0 ? DEMO_SOURCE : i === 1 ? DEMO_REACTION : null);
  const hasSession = $derived(!!session.current?.videos[i]);

  async function choose() {
    const [picked] = await pickVideoFiles(false);
    if (picked) await studio.loadFile(i, picked.file);
  }

  async function useDemo() {
    if (!demoUrl) return;
    await warmDemoClips();
    void studio.loadUrl(i, playableUrl({ id: '', kind: 'url', url: demoUrl }), i === 0 ? 'Demo source clip' : 'Demo reaction clip');
  }

  function onkeydown(e: KeyboardEvent) {
    if (!slot?.clip) return;
    const frame = e.shiftKey ? FALLBACK_FPS : 1;
    if (e.key === ',' || e.key === 'ArrowLeft') void studio.step(i, -frame);
    else if (e.key === '.' || e.key === 'ArrowRight') void studio.step(i, frame);
    else if (e.key === 'c' || e.key === 'C') void studio.capture(i);
    else return;
    e.preventDefault();
  }
</script>

{#if slot}
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between gap-2">
      <h3 class="min-w-0 truncate text-[13.5px] font-semibold">
        {slot.label || 'Choose a video to sample'}
      </h3>
      <div class="flex shrink-0 items-center">
        <IconButton size="sm" icon={FolderOpen} label="Choose a video" onclick={choose} />
        {#if demoUrl}<IconButton size="sm" icon={Sparkles} label="Use the demo clip" onclick={useDemo} />{/if}
        {#if hasSession}
          <IconButton size="sm" icon={Clapperboard} label="Take a frame from the open session" onclick={() => studio.sampleSession(i)} />
        {/if}
      </div>
    </div>

    <!-- Focusable preview: arrow keys step frames (see onkeydown), so it carries handlers by design. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      role="group"
      aria-label="Sampling preview"
      tabindex="0"
      class="relative aspect-video overflow-hidden border border-line bg-black"
      use:dropzone={{ accept: 'video', onfiles: (files) => void studio.loadFile(i, files[0].file) }}
      {onkeydown}
    >
      {#if el}
        <div class="absolute inset-0" use:adopt={el}></div>
      {:else if slot.frame}
        <img src={slot.frame.dataUrl} alt="The captured frame" class="absolute inset-0 size-full object-contain" draggable="false" />
      {:else}
        <button class="absolute inset-0 grid place-items-center text-fg-2 transition-colors hover:text-fg" onclick={choose}>
          <span class="flex flex-col items-center gap-2">
            <FolderOpen size={22} strokeWidth={1.6} class="text-accent" />
            <span class="text-[13px]">Choose or drop a video</span>
          </span>
        </button>
      {/if}
      {#if slot.busy}
        <div class="absolute inset-0 grid place-items-center bg-black/60"><Loader size={20} class="animate-spin text-accent" /></div>
      {/if}
    </div>

    {#if slot.clip}
      <div class="flex items-center gap-3">
        <Slider label="Time in the video" min={0} max={Math.max(slot.duration, 0.01)} step={0.01} value={slot.time} oninput={(v) => studio.seek(i, v)} />
        <span class="num shrink-0 text-[12px] text-fg-2">{formatTime(slot.time, true)}</span>
      </div>
      <div class="flex items-center gap-1">
        <IconButton size="sm" icon={ChevronsLeft} label="Back one second" kbd="Shift ,"  onclick={() => studio.step(i, -FALLBACK_FPS)} />
        <IconButton size="sm" icon={ChevronLeft} label="Back one frame" kbd="," onclick={() => studio.step(i, -1)} />
        <IconButton size="sm" icon={ChevronRight} label="Forward one frame" kbd="." onclick={() => studio.step(i, 1)} />
        <IconButton size="sm" icon={ChevronsRight} label="Forward one second" kbd="Shift ." onclick={() => studio.step(i, FALLBACK_FPS)} />
        <Button size="sm" variant="primary" icon={Camera} class="ml-auto" disabled={slot.busy} onclick={() => studio.capture(i)}>Capture frame</Button>
      </div>
    {/if}

    {#if slot.frame}
      <div class="flex items-center justify-between gap-3 text-[12.5px] text-fg-2">
        <span class="flex items-center gap-3">
          <span class="num">{slot.frame.width} × {slot.frame.height}</span>
          <span class="num">at {formatTime(slot.frame.time, true)}</span>
        </span>
        <IconButton size="sm" icon={Trash2} label="Remove the frame" class="hover:!text-danger" onclick={() => studio.clearFrame(i)} />
      </div>
    {/if}

    <div class="border-t border-line pt-3">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[12.5px] text-fg-2">Earlier frames</span>
        {#if !settings.limits.advancedSampler}
          <span class="flex items-center gap-2">
            <ProBadge />
            <Button size="sm" variant="ghost" onclick={() => router.go({ name: 'settings', tab: 'subscription' })}>See Pro</Button>
          </span>
        {/if}
      </div>
      {#if !settings.limits.advancedSampler}
        <p class="text-[12.5px] text-fg-3">Pro keeps the last eight captures per video, so you can compare moments side by side.</p>
      {:else if slot.history.length === 0}
        <p class="text-[12.5px] text-fg-3">Each new capture sends the one before it here.</p>
      {:else}
        <div class="flex gap-2 overflow-x-auto pb-1">
          {#each slot.history as f (f.id)}
            <button
              class="relative h-11 w-20 shrink-0 overflow-hidden border border-line bg-black transition-colors hover:border-accent"
              aria-label="Use the frame at {formatTime(f.time, true)}"
              title={formatTime(f.time, true)}
              onclick={() => studio.useFrame(i, f.id)}
            >
              <img src={f.dataUrl} alt="" class="size-full object-contain" draggable="false" />
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
