<script lang="ts">
  /**
   * One video on the black canvas, drawn only: the Stage handles the pointer.
   *
   * The outer box carries the eight resize grips of the selected layer (they are
   * the one part that takes the pointer). The inner box clips the picture
   * (`overflow: hidden`), which is what makes a crop pixel-true, and it alone takes
   * the layer's opacity so the grips stay solid. A hidden layer keeps playing, in
   * sync, at zero opacity: the video stays composited, so its frames keep coming.
   */
  import { FilePlus2, Film, Layers, Lock, TriangleAlert, UserRound, Volume2 } from '@lucide/svelte';
  import { playableUrl } from '$lib/engine/demo';
  import { pickVideoFiles } from '$lib/engine/media';
  import { playback } from '$lib/engine/playback.svelte';
  import { desktop } from '$lib/platform';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import type { ID, IconComponent, SessionVideo, VideoRole } from '$lib/types';
  import { HANDLES, rectToStyle, videoPlacement } from '$lib/utils/geometry';

  interface Props {
    video: SessionVideo;
    /** The CSS stacking value for this layer: its rank in the stack, spaced out so overlays can sit between layers. */
    z: number;
  }

  let { video, z }: Props = $props();

  const ROLE_ICON: Record<VideoRole, IconComponent> = { source: Film, reaction: UserRound, extra: Layers };

  const Icon = $derived(ROLE_ICON[video.role]);
  const t = $derived(session.current?.alignment.coordinates[video.id]);
  const locked = $derived(session.isLocked);
  const selected = $derived(!locked && session.selectedId === video.id);
  const isMaster = $derived(session.current?.masterId === video.id);
  const failed = $derived(!!playback.failed[video.id]);

  /** Compositing hint from Preferences: `on` always promotes the layer to the GPU, `auto` only while something plays. */
  const gpu = $derived(
    settings.playback.hardwareAcceleration === 'on' || (settings.playback.hardwareAcceleration === 'auto' && playback.anyRunning)
  );

  // `session.missing` is reactive, the file registry behind `playableUrl` is not: reading it keeps the URL fresh after a relink.
  const src = $derived.by(() => {
    void session.missing;
    return playableUrl(video);
  });
  const needsFile = $derived(video.kind === 'file' && !src);

  /** Layer box in px, measured by the clip box below. */
  let bw = $state(0);
  let bh = $state(0);
  const place = $derived.by(() => {
    const d = playback.dims[video.id];
    return t ? videoPlacement({ w: bw, h: bh }, d?.w ?? 0, d?.h ?? 0, t.crop, t.fit) : null;
  });

  async function chooseFile() {
    const [picked] = await pickVideoFiles(false);
    if (picked) session.relink(video.id, picked);
  }

  /** Registers the element with the sync engine for as long as the layer exists. */
  function attach(el: HTMLVideoElement, id: ID) {
    return { destroy: playback.attach(id, el) };
  }

  /**
   * Remote clips, and local files served by `local-media://` on desktop, are first requested with CORS so a frame can be
   * read back without tainting the canvas; if the host refuses, play without it.
   */
  let corsRefused = $state(false);
  const cors = $derived((video.kind === 'url' || !!desktop) && !corsRefused);
  function onerror(e: Event) {
    if (!cors) return;
    corsRefused = true;
    const el = e.currentTarget as HTMLVideoElement;
    queueMicrotask(() => el.load());
  }
</script>

{#if t}
  <div
    class="layer pointer-events-none absolute"
    data-layer={video.id}
    data-role={video.role}
    data-selected={selected}
    style="{rectToStyle(t)};z-index:{z}"
  >
    <div class="absolute inset-0 overflow-hidden bg-black" style="opacity:{t.hidden ? 0 : t.opacity}" bind:clientWidth={bw} bind:clientHeight={bh}>
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        use:attach={video.id}
        crossorigin={cors ? 'anonymous' : undefined}
        {src}
        {onerror}
        playsinline
        preload="auto"
        draggable="false"
        class="pointer-events-none absolute max-w-none select-none"
        class:gpu
        style={place ? `left:${place.left}px;top:${place.top}px;width:${place.width}px;height:${place.height}px` : 'visibility:hidden'}
      ></video>

      {#if needsFile}
        <div class="absolute inset-0 grid place-items-center bg-black p-3 text-center">
          <button class="pointer-events-auto flex max-w-full flex-col items-center gap-2 text-fg-2 transition-colors hover:text-fg" onclick={(e) => (e.stopPropagation(), chooseFile())} onpointerdown={(e) => e.stopPropagation()}>
            <FilePlus2 size={22} strokeWidth={1.6} class="text-accent" />
            <span class="max-w-full truncate text-[12.5px]">Choose “{video.fileName ?? video.title}”</span>
          </button>
        </div>
      {:else if failed}
        <div class="absolute inset-0 grid place-items-center bg-black p-3 text-center">
          <div class="flex flex-col items-center gap-1.5 text-fg-2">
            <TriangleAlert size={20} strokeWidth={1.6} class="text-danger" />
            <span class="text-[12.5px]">This file cannot be played here.</span>
            <span class="text-[11.5px] text-fg-3">MP4 (H.264) and WebM play everywhere.</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Outline + role badge: drawn above the clip so nothing crops them; only visible while the HUD is. -->
    <div class="frame pointer-events-none absolute inset-0"></div>
    {#if !t.hidden}
      <div class="badge pointer-events-none absolute top-1.5 left-1.5 flex items-center gap-1 bg-black px-1.5 py-1 text-fg-2">
        <Icon size={12} strokeWidth={2} class={video.role === 'source' ? 'text-accent' : ''} />
        {#if isMaster}<Volume2 size={12} strokeWidth={2} />{/if}
        {#if t.locked}<Lock size={12} strokeWidth={2} />{/if}
      </div>
    {/if}

    {#if selected}
      {#each HANDLES as h (h)}
        <span class="grip" data-handle={h}></span>
      {/each}
    {/if}
  </div>
{/if}

<style>
  /* Preferences → Hardware acceleration: ask the browser to composite this picture on the GPU. */
  .gpu {
    will-change: transform;
    transform: translateZ(0);
  }

  /* Outline and badge belong to the HUD: they fade in and out with it. */
  .frame,
  .badge {
    opacity: 0;
    transition: opacity 180ms ease-out;
  }
  :global([data-chrome='true']) .frame,
  :global([data-chrome='true']) .badge,
  .layer[data-selected='true'] .frame {
    opacity: 1;
  }
  :global([data-chrome='true']) .badge {
    opacity: 0.9;
  }
  .frame {
    outline: 1px solid rgb(255 255 255 / 0.18);
    outline-offset: -1px;
  }
  .layer[data-role='source'] .frame {
    outline-color: var(--color-accent-line);
  }
  .layer[data-selected='true'] .frame {
    outline: 1.5px dashed #fff;
  }
  .layer[data-selected='true'][data-role='source'] .frame {
    outline: 2px solid var(--color-accent);
  }

  /* Eight grips: 10 px squares with a generous invisible hit area. */
  .grip {
    pointer-events: auto;
    position: absolute;
    width: 10px;
    height: 10px;
    background: #fff;
    border: 1px solid #000;
  }
  .grip::after {
    content: '';
    position: absolute;
    inset: -7px;
  }
  .layer[data-role='source'] .grip {
    background: var(--color-accent);
  }
  .grip[data-handle='nw'] { left: -5px; top: -5px; cursor: nwse-resize; }
  .grip[data-handle='n'] { left: calc(50% - 5px); top: -5px; cursor: ns-resize; }
  .grip[data-handle='ne'] { right: -5px; top: -5px; cursor: nesw-resize; }
  .grip[data-handle='e'] { right: -5px; top: calc(50% - 5px); cursor: ew-resize; }
  .grip[data-handle='se'] { right: -5px; bottom: -5px; cursor: nwse-resize; }
  .grip[data-handle='s'] { left: calc(50% - 5px); bottom: -5px; cursor: ns-resize; }
  .grip[data-handle='sw'] { left: -5px; bottom: -5px; cursor: nesw-resize; }
  .grip[data-handle='w'] { left: -5px; top: calc(50% - 5px); cursor: ew-resize; }
</style>
