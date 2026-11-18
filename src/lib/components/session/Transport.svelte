<script lang="ts">
  /**
   * The bottom dock, glued to the window edge with no gap.
   *
   *   Unlinked  one lane per video — own play button, scrubber, volume — so
   *             offsets can be dialled in by eye, frame by frame.
   *   Linked    the lanes slide up into each other and fuse into one master bar
   *             that drives every stream as if it were a single video.
   *
   * The morph is plain CSS: every lane is absolutely positioned and parked at
   * `translateY(index × lane)`; linking sets that to 0 and fades the lanes out
   * while the master bar fades in, and the dock's own height eases down by the
   * same amount (the stage's inset follows with the same timing).
   * Link stays put in the top row of the rail so it can be toggled back and
   * forth without moving the pointer.
   */
  import { Link, Pause, Play, Unlink } from '@lucide/svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { playback } from '$lib/engine/playback.svelte';
  import { session } from '$lib/stores/session.svelte';
  import Lane from '../player/Lane.svelte';
  import MasterLane from './MasterLane.svelte';
  import { LANE_H, dockHeight, laneCount } from './metrics';

  interface Props {
    visible: boolean;
    /** Over the video (theater mode): translucent instead of solid. */
    overlay?: boolean;
    onhover: (on: boolean) => void;
  }
  let { visible, overlay = false, onhover }: Props = $props();

  const s = $derived(session.current);
  const linked = $derived(!!s?.isLinked);
  const videos = $derived(s?.videos ?? []);
  const height = $derived(dockHeight(laneCount(videos.length, linked)));
</script>

<div
  class="dock hud-bar absolute inset-x-0 bottom-0 z-40 overflow-hidden border-t border-line {overlay ? 'bg-black/90' : 'bg-black'}"
  data-show={visible}
  data-edge="bottom"
  data-linked={linked}
  style="--h:{height}px;--lane:{LANE_H}px"
  role="toolbar"
  aria-label="Transport"
  tabindex="-1"
  onpointerenter={() => onhover(true)}
  onpointerleave={() => onhover(false)}
>
  <div class="flex h-full">
    <div class="w-11 shrink-0 border-r border-line">
      <div class="grid h-[var(--lane)] place-items-center">
        <IconButton
          size="sm"
          icon={linked ? Link : Unlink}
          label={linked ? 'Unlink timelines' : 'Link timelines'}
          kbd="L"
          side="right"
          active={linked}
          onclick={() => playback.setLinked(!linked)}
        />
      </div>
      <div class="rail-play grid h-[var(--lane)] place-items-center" inert={linked}>
        <IconButton
          size="sm"
          icon={playback.anyRunning ? Pause : Play}
          label={playback.anyRunning ? 'Pause all' : 'Play all'}
          kbd="Space"
          side="right"
          onclick={() => playback.toggle()}
        />
      </div>
    </div>

    <div class="relative min-w-0 flex-1 overflow-hidden">
      {#each videos as v, i (v.id)}
        <div class="lane" style="--i:{i}" inert={linked}><Lane video={v} /></div>
      {/each}
      <div class="master" inert={!linked}><MasterLane /></div>
    </div>
  </div>
</div>

<style>
  .dock {
    height: var(--h);
    transition:
      height 380ms var(--ease-morph),
      opacity 200ms ease-out,
      transform 240ms var(--ease-out-expo),
      visibility 0s linear 0s;
  }
  .dock[data-show='false'] {
    transition:
      height 380ms var(--ease-morph),
      opacity 200ms ease-out,
      transform 240ms var(--ease-out-expo),
      visibility 0s linear 220ms;
  }

  /* Unlinked: each lane rests on its own row. */
  .lane {
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: var(--lane);
    transform: translateY(calc(var(--i) * var(--lane)));
    transition:
      transform 380ms var(--ease-morph),
      opacity 200ms ease-out 40ms;
  }
  /* Linked: every lane slides onto the first row and fades as the master bar fades in. */
  .dock[data-linked='true'] .lane {
    transform: translateY(0);
    opacity: 0;
    transition:
      transform 380ms var(--ease-morph),
      opacity 220ms ease-in 150ms;
  }

  .master {
    position: absolute;
    inset-inline: 0;
    top: 0;
    height: var(--lane);
    opacity: 0;
    transition: opacity 120ms ease-out;
  }
  .dock[data-linked='true'] .master {
    opacity: 1;
    transition: opacity 240ms ease-out 170ms;
  }

  .rail-play {
    transition: opacity 160ms ease-out;
  }
  .dock[data-linked='true'] .rail-play {
    opacity: 0;
  }
</style>
