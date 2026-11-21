<script lang="ts">
  /**
   * The subtitles of one layer, drawn over its picture. The text is sized from the layer's height so it scales with the
   * layer, and it never takes the pointer. Lines go to the bottom unless the subtitle file puts them at the top or middle.
   * Picture subtitles (PGS) are placed on the video's own picture (`frame`), at the position they were authored for.
   */
  import { subtitles } from '$lib/engine/subtitles.svelte';
  import type { ID } from '$lib/types';

  interface Props {
    layerId: ID;
    /** The video's own time in seconds. */
    time: number;
    /** The layer's height in px. */
    height: number;
    delayMs?: number;
    /** Where the video's picture is inside the layer, in px. Needed for picture subtitles. */
    frame?: { left: number; top: number; width: number; height: number } | null;
  }

  let { layerId, time, height, delayMs = 0, frame = null }: Props = $props();

  const all = $derived(subtitles.at(layerId, time, delayMs));
  const active = $derived(all.filter((c) => c.text));
  const pictures = $derived(frame ? all.filter((c) => c.images?.length && c.frame) : []);
  const size = $derived(Math.max(11, height * 0.05));
  const byPos = $derived({
    top: active.filter((c) => c.pos === 'top'),
    middle: active.filter((c) => c.pos === 'middle'),
    bottom: active.filter((c) => !c.pos || c.pos === 'bottom')
  });
</script>

{#each pictures as cue (cue.start)}
  {#each cue.images ?? [] as img, k (k)}
    <img
      class="pointer-events-none absolute max-w-none select-none"
      alt=""
      draggable="false"
      src={img.src}
      style="left:{frame!.left + (img.x / cue.frame!.w) * frame!.width}px;top:{frame!.top + (img.y / cue.frame!.h) * frame!.height}px;width:{(img.w / cue.frame!.w) * frame!.width}px;height:{(img.h / cue.frame!.h) * frame!.height}px;image-rendering:auto"
    />
  {/each}
{/each}

{#if active.length}
  <div class="pointer-events-none absolute inset-0 flex flex-col justify-between px-[4%] py-[3.5%] text-center" style="font-size:{size}px;line-height:1.25">
    {#each ['top', 'middle', 'bottom'] as const as where (where)}
      <div class="flex flex-col items-center {where === 'top' ? 'justify-start' : where === 'middle' ? 'justify-center' : 'justify-end'}">
        {#each byPos[where] as cue (cue.start + cue.text)}
          <p class="max-w-full whitespace-pre-line text-white {cue.italic ? 'italic' : ''}" style="text-shadow:0 0 0.12em #000,0 0 0.12em #000,0 0.04em 0.18em #000,0.05em 0.05em 0.05em #000,-0.05em -0.05em 0.05em #000">
            {cue.text}
          </p>
        {/each}
      </div>
    {/each}
  </div>
{/if}
