<script lang="ts">
  /**
   * Two questions the player asks about the sources, as a slim bar under the top bar:
   *  - the next episode has been swapped in and is waiting on its first frame: start it?
   *  - the reaction runs well past the end of the source: add another source?
   */
  import { ListPlus, Play, X } from '@lucide/svelte';
  import { sourceEndsEarly, sourceRange } from '$lib/engine/playlist';
  import { playback } from '$lib/engine/playback.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';

  interface Props {
    /** Pixels from the top of the window: the bar sits just under the HUD. */
    top: number;
  }

  let { top }: Props = $props();

  const s = $derived(session.current);
  const source = $derived(session.sourceVideo);
  const reaction = $derived(s?.videos.find((v) => v.role === 'reaction'));
  const count = $derived(source?.sources?.length ?? 1);
  const key = $derived(`${s?.id}:${count}`);

  /** The next episode is on screen but not started. */
  const waiting = $derived(!!source?.sources && !!source.waiting);

  /** The reaction clearly outlasts everything the source layer can show. Needs every length to be known. */
  const reactionLonger = $derived.by(() => {
    const slack = settings.playback.sourcePromptMinutes * 60;
    if (!s || !source || !reaction || !(reaction.duration > 0) || slack <= 0) return false;
    const items = source.sources ?? [{ duration: source.duration }];
    if (items.some((it) => !(it.duration > 0))) return false;
    if (source.sources && source.waiting) return false; // a later episode is already waiting: there is a source to play
    if (s.isLinked) {
      const span = source.sources ? sourceRange(session.spansOf(source)) : { start: -source.offsetMs / 1000, end: source.duration - source.offsetMs / 1000 };
      return sourceEndsEarly(span?.end ?? null, reaction.duration - reaction.offsetMs / 1000, slack);
    }
    return sourceEndsEarly(
      items.reduce((sum, it) => sum + it.duration, 0),
      reaction.duration,
      slack
    );
  });

  const showLonger = $derived(reactionLonger && !ui.sourcePromptDismissed[key]);
</script>

{#if waiting || showLonger}
  <div class="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3" style="top:{top}px">
    <div class="pointer-events-auto flex max-w-full items-center gap-3 border border-line bg-black py-1.5 pr-1.5 pl-4 text-[13px]" role="status">
      {#if waiting}
        <span class="min-w-0 truncate text-fg-2">Next source ready: <span class="text-fg">{source?.title}</span>. It is waiting on its first frame.</span>
        <Button size="sm" variant="primary" icon={Play} onclick={() => playback.startNextSource()}>Start it</Button>
      {:else}
        <span class="min-w-0 text-fg-2">The reaction runs {Math.round(settings.playback.sourcePromptMinutes)}+ minutes past the source. Play another source?</span>
        <Button size="sm" variant="primary" icon={ListPlus} onclick={() => (ui.addSourceOpen = true)}>Add a source</Button>
        <IconButton size="sm" icon={X} label="Not now" side="bottom" onclick={() => (ui.sourcePromptDismissed[key] = true)} />
      {/if}
    </div>
  </div>
{/if}
