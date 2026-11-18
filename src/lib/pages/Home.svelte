<script lang="ts">
  /**
   * Home: the title screen. The wallpaper (or plain black) fills the window and the menu is set over it, with a soft
   * shade along the bottom and left edges so the text stays readable on any picture. The ember trail follows the
   * pointer over everything. The wallpaper is never blurred; unless the user asks for a veil in Settings, the only
   * thing laid over it is that edge shade. Dropping video files anywhere opens New Session with them in place.
   */
  import { dropzone } from '$lib/actions/dropzone';
  import EmberTrail from '$lib/components/home/EmberTrail.svelte';
  import TitleMenu from '$lib/components/home/TitleMenu.svelte';
  import type { PickedFile } from '$lib/engine/media';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';

  const wallpaper = $derived(settings.wallpaper);

  function onfiles(files: PickedFile[]) {
    ui.newSessionFiles = files;
    ui.newSessionOpen = true;
  }
</script>

<div class="relative h-full overflow-hidden bg-black" use:dropzone={{ accept: 'video', multiple: true, onfiles }}>
  {#if wallpaper}
    <!-- object-fit: cover, no filter. A GIF is just an <img>, so it animates for free. -->
    <img src={wallpaper.url} alt="" class="absolute inset-0 size-full object-cover" draggable="false" />
    {#if !settings.settings.wallpaperClear}<div class="absolute inset-0 bg-black/55"></div>{/if}
    <div class="shade absolute inset-0" aria-hidden="true"></div>
  {:else}
    <div class="glow absolute inset-0" aria-hidden="true"></div>
  {/if}

  <TitleMenu />
  <EmberTrail />
</div>

<style>
  /* Legibility only: dark along the bottom, where the menu sits, and fading across from the left. */
  .shade {
    background:
      linear-gradient(to top, rgb(0 0 0 / 0.86) 0, rgb(0 0 0 / 0.55) 24%, transparent 54%),
      linear-gradient(to right, rgb(0 0 0 / 0.5), transparent 44%);
  }
  /* On plain black: a faint warm light low on the left, where the menu is, so the screen is not simply empty. */
  .glow {
    background: radial-gradient(ellipse 62% 46% at 12% 104%, rgb(255 150 50 / 0.11), transparent 70%);
  }
</style>
