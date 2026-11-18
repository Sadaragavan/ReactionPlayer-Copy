<script lang="ts">
  /**
   * The single bar the per-video lanes fuse into while linked: one play button,
   * one scrubber over the shared timeline, one clock, the frame steps, the
   * speed and the master's volume. The thin spans under the bar show where each
   * video's footage sits on that shared timeline — the memory of the lanes it
   * replaced, and the proof of every offset at a glance.
   */
  import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from '@lucide/svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Slider from '$lib/components/ui/Slider.svelte';
  import { PLAYBACK_RATES } from '$lib/constants';
  import { playback } from '$lib/engine/playback.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { formatTime } from '$lib/utils/format';
  import Scrubber from '../player/Scrubber.svelte';
  import { videoMenu } from '../player/menus';

  const s = $derived(session.current);
  const master = $derived(session.master);
  const range = $derived(playback.range);
  const span = $derived(Math.max(0.001, range.end - range.start));
  const elapsed = $derived(Math.min(span, Math.max(0, playback.clock - range.start)));

  /** Where each video's footage starts and ends on the shared timeline, 0–1. */
  const segments = $derived(
    (s?.videos ?? []).map((v) => ({
      from: (-v.offsetMs / 1000 - range.start) / span,
      to: (v.duration - v.offsetMs / 1000 - range.start) / span,
      active: v.id === s?.masterId
    }))
  );

  /** Scrubbing pauses the clock and resumes it afterwards, like any player. */
  let resume = false;
  function onscrub(active: boolean) {
    if (active) {
      resume = playback.playing;
      if (resume) playback.pause();
    } else if (resume) {
      resume = false;
      void playback.play();
    }
  }

  function speedMenu(e: MouseEvent) {
    if (!master) return;
    const id = master.id;
    ui.openMenuAt(
      e.currentTarget as Element,
      PLAYBACK_RATES.map((r) => ({
        id: `rate-${r}`,
        label: `${r}×`,
        checked: master.playbackRate === r,
        onSelect: () => session.setRate(id, r)
      })),
      true
    );
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex h-[var(--lane)] items-center gap-1 px-3"
  role="group"
  aria-label="Shared transport"
  oncontextmenu={(e) => master && (e.preventDefault(), ui.openMenu(e.clientX, e.clientY, videoMenu(master.id), { above: true }))}
>
  <IconButton
    size="sm"
    icon={playback.playing ? Pause : Play}
    label={playback.playing ? 'Pause' : 'Play'}
    kbd="Space"
    class="text-accent"
    onclick={() => playback.toggle()}
  />

  <Scrubber
    class="mx-1 min-w-0 flex-1"
    label="Shared position"
    value={elapsed / span}
    {segments}
    disabled={range.end <= range.start}
    format={(p) => formatTime(p * span, true)}
    onseek={(p) => playback.seek(range.start + p * span)}
    {onscrub}
    onstep={(dir, fine) => (fine ? void playback.step(dir) : playback.seek(playback.clock + dir * settings.playback.seekStepSec))}
  />

  <span class="num w-[148px] shrink-0 text-right text-[12.5px] text-fg max-md:w-[84px]">
    {formatTime(elapsed, true)}<span class="text-fg-3 max-md:hidden"> / {formatTime(span)}</span>
  </span>

  <div class="flex shrink-0 max-md:hidden">
    <IconButton size="sm" icon={ChevronLeft} label="Back one frame" kbd="," onclick={() => void playback.step(-1)} />
    <IconButton size="sm" icon={ChevronRight} label="Forward one frame" kbd="." onclick={() => void playback.step(1)} />
  </div>

  <button
    type="button"
    class="num h-8 w-11 shrink-0 rounded-md text-[12.5px] text-fg-2 transition-colors hover:bg-hover hover:text-fg max-md:hidden"
    aria-label="Playback speed, {master?.playbackRate ?? 1}×"
    onclick={speedMenu}
  >
    {master?.playbackRate ?? 1}×
  </button>

  {#if master}
    <div class="flex w-[132px] shrink-0 items-center max-md:hidden">
      <IconButton
        size="sm"
        icon={master.muted || master.volume === 0 ? VolumeX : Volume2}
        label={master.muted ? 'Unmute' : 'Mute'}
        kbd="M"
        onclick={() => session.toggleMute(master.id)}
      />
      <Slider tone="plain" thumb="hover" label="Volume" value={master.muted ? 0 : master.volume} oninput={(v) => session.setVolume(master.id, v)} />
    </div>
  {/if}
</div>
