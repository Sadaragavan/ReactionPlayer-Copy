<script lang="ts">
  /**
   * The top HUD bar, glued to the window edge with no gap. Icons only: the one
   * piece of text is the session's name, which turns into a field on double-click.
   * It fades with the rest of the HUD (see hud.svelte.ts) and, in theater mode,
   * floats over the picture instead of pushing it down.
   */
  import { House, Keyboard, Lock, LockOpen, Maximize, Minimize, PanelRight, RectangleHorizontal, Save } from '@lucide/svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import { saveLayoutAsPreset } from '$lib/engine/appActions';
  import { playback } from '$lib/engine/playback.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { isFullscreen, onFullscreenChange, toggleFullscreen } from '$lib/utils/fullscreen';
  import { onMount } from 'svelte';
  import { TOP_H } from './metrics';

  interface Props {
    visible: boolean;
    /** Over the video (theater mode): translucent instead of solid. */
    overlay?: boolean;
    panelOpen: boolean;
    ontogglepanel: () => void;
    onhover: (on: boolean) => void;
    onhome: () => void;
  }
  let { visible, overlay = false, panelOpen, ontogglepanel, onhover, onhome }: Props = $props();

  const s = $derived(session.current);
  const locked = $derived(session.isLocked);
  let fullscreen = $state(false);
  let editing = $state(false);
  let draft = $state('');

  onMount(() => {
    fullscreen = isFullscreen();
    return onFullscreenChange((on) => (fullscreen = on));
  });

  function startRename() {
    if (!s) return;
    draft = s.name;
    editing = true;
  }

  function commitRename() {
    if (!editing) return;
    editing = false;
    if (s && draft.trim() && draft.trim() !== s.name) void session.rename(s.id, draft);
  }

  function focusSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  async function saveNow() {
    const thumb = playback.thumbnail();
    if (thumb) session.setThumbnail(thumb);
    if (await session.save()) {
      ui.toast('Session saved. Find it under Continue and Load session.', 'success', { label: session.current?.presetId ? 'Update preset' : 'Save layout as preset', run: () => void saveLayoutAsPreset() });
    } else ui.toast('Couldn’t save the session.', 'error');
  }
</script>

<div
  class="hud-bar absolute inset-x-0 top-0 z-40 flex items-center gap-0.5 border-b border-line px-1.5 {overlay ? 'bg-black/90' : 'bg-black'}"
  style="height:{TOP_H}px"
  data-show={visible}
  data-edge="top"
  role="toolbar"
  aria-label="Session"
  tabindex="-1"
  onpointerenter={() => onhover(true)}
  onpointerleave={() => onhover(false)}
>
  <IconButton icon={House} label="Home" side="bottom" onclick={onhome} />
  <span class="mx-1 h-5 w-px bg-line"></span>

  {#if editing}
    <input
      class="input h-8 max-w-[320px] min-w-0 flex-1 text-[13.5px]"
      aria-label="Session name"
      bind:value={draft}
      use:focusSelect
      onblur={commitRename}
      onkeydown={(e) => {
        if (e.key === 'Enter') commitRename();
        if (e.key === 'Escape') editing = false;
        e.stopPropagation();
      }}
    />
  {:else}
    <button
      class="min-w-0 truncate rounded-md px-2.5 py-1 text-left text-[13.5px] text-fg-2 transition-colors hover:bg-hover hover:text-fg"
      title="Double-click to rename"
      ondblclick={startRename}
    >
      {s?.name ?? ''}
    </button>
  {/if}

  <span class="min-w-0 flex-1"></span>

  <IconButton
    icon={locked ? Lock : LockOpen}
    label={locked ? 'Viewports locked: click to unlock' : 'Lock viewports'}
    side="bottom"
    active={locked}
    onclick={() => session.toggleLocked()}
  />
  <IconButton icon={PanelRight} label="Layers" side="bottom" active={panelOpen} onclick={ontogglepanel} />
  <span class="mx-1 h-5 w-px bg-line"></span>
  <IconButton icon={Save} label="Save session" side="bottom" onclick={saveNow} />
  <IconButton icon={Keyboard} label="Keyboard shortcuts" kbd="?" side="bottom" onclick={() => (ui.shortcutsOpen = true)} />
  <IconButton
    icon={RectangleHorizontal}
    label={s?.isTheaterMode ? 'Leave theater mode' : 'Theater mode'}
    kbd="T"
    side="bottom"
    active={!!s?.isTheaterMode}
    onclick={() => s && session.setTheater(!s.isTheaterMode)}
  />
  <IconButton
    icon={fullscreen ? Minimize : Maximize}
    label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
    kbd="F"
    side="bottom"
    onclick={() => void toggleFullscreen()}
  />
</div>

<style>
  .hud-bar {
    transition:
      opacity 200ms ease-out,
      transform 240ms var(--ease-out-expo),
      visibility 0s linear 0s;
  }
  .hud-bar[data-show='false'] {
    transition:
      opacity 200ms ease-out,
      transform 240ms var(--ease-out-expo),
      visibility 0s linear 220ms;
  }
</style>
