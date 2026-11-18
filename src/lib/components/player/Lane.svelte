<script lang="ts">
  /**
   * One video's own transport, shown while the timelines are *unlinked*:
   * play, a private scrubber, frame steps and a private volume. The offset read-out
   * is how far this playhead sits from the master's — exactly the number that
   * becomes `offsetMs` the moment the transport is linked.
   */
  import { ChevronLeft, ChevronRight, Pause, Play, Volume2, VolumeX } from '@lucide/svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import Slider from '$lib/components/ui/Slider.svelte';
  import { playback } from '$lib/engine/playback.svelte';
  import { ROLE_LABEL } from '$lib/engine/sessionFactory';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { SessionVideo } from '$lib/types';
  import { formatOffset, formatTime } from '$lib/utils/format';
  import Scrubber from './Scrubber.svelte';
  import { videoMenu } from './menus';

  let { video }: { video: SessionVideo } = $props();

  const role = $derived(ROLE_LABEL[video.role].toLowerCase());
  const time = $derived(playback.times[video.id] ?? video.currentTime);
  const running = $derived(!!playback.running[video.id]);
  const isMaster = $derived(session.current?.masterId === video.id);
  const offset = $derived(
    isMaster ? 0 : Math.round(((playback.times[video.id] ?? 0) - (playback.times[session.current?.masterId ?? ''] ?? 0)) * 1000)
  );

  /** Scrubbing pauses the video and resumes it afterwards, like any player. */
  let resume = false;
  function onscrub(active: boolean) {
    const el = playback.element(video.id);
    if (!el) return;
    if (active) {
      resume = !el.paused;
      el.pause();
    } else if (resume) {
      resume = false;
      void el.play().catch(() => {});
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="flex h-[var(--lane)] items-center gap-1 px-3"
  role="group"
  aria-label="{role} video"
  oncontextmenu={(e) => (e.preventDefault(), ui.openMenu(e.clientX, e.clientY, videoMenu(video.id)))}
>
  <IconButton
    size="sm"
    icon={running ? Pause : Play}
    label="{running ? 'Pause' : 'Play'} {role}"
    class={video.role === 'source' ? 'text-accent' : ''}
    onclick={() => playback.toggleVideo(video.id)}
  />

  <Scrubber
    class="mx-1 min-w-0 flex-1"
    label="{role} position"
    value={video.duration > 0 ? time / video.duration : 0}
    fill={video.role === 'source' ? 'accent' : 'white'}
    disabled={video.duration <= 0}
    format={(p) => formatTime(p * video.duration, true)}
    onseek={(p) => playback.seekVideo(video.id, p * video.duration)}
    {onscrub}
    onstep={(dir, fine) => (fine ? void playback.step(dir, video.id) : playback.seekVideo(video.id, time + dir * settings.playback.seekStepSec))}
  />

  <span class="num w-[92px] shrink-0 text-right text-[12.5px] text-fg-2 max-md:w-[72px]">{formatTime(time, true)}</span>

  <span class="num w-[74px] shrink-0 text-right text-[12px] max-md:hidden {offset === 0 ? 'text-fg-3' : 'text-accent'}">
    {isMaster ? '' : formatOffset(offset)}
  </span>

  <div class="flex shrink-0 max-md:hidden">
    <IconButton size="sm" icon={ChevronLeft} label="Back one frame ({role})" onclick={() => void playback.step(-1, video.id)} />
    <IconButton size="sm" icon={ChevronRight} label="Forward one frame ({role})" onclick={() => void playback.step(1, video.id)} />
  </div>

  <div class="flex w-[132px] shrink-0 items-center max-md:hidden">
    <IconButton size="sm" icon={video.muted || video.volume === 0 ? VolumeX : Volume2} label={video.muted ? `Unmute ${role}` : `Mute ${role}`} onclick={() => session.toggleMute(video.id)} />
    <Slider
      tone="plain"
      thumb="hover"
      label="{role} volume"
      value={video.muted ? 0 : video.volume}
      oninput={(v) => session.setVolume(video.id, v)}
    />
  </div>
</div>
