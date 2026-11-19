<script lang="ts">
  /**
   * Appearance: the Home wallpaper.
   *
   * A picture or an animated GIF, uploaded or linked. It is the artwork of Home's
   * title screen, edge to edge behind the menu, and it is never blurred. “Full
   * clarity” (on by default) keeps it free of any overall dimming; turn it off for
   * a plain dark veil, still without blur. Home always lays a soft shade along its
   * bottom and left edges so the menu stays readable, which the preview below
   * leaves out: it shows the picture and the veil, not the menu.
   */
  import { Check, House, Image as ImageIcon, ImagePlus, Link, Trash, Upload } from '@lucide/svelte';
  import { dropzone } from '$lib/actions/dropzone';
  import Button from '$lib/components/ui/Button.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import { IMAGE_ACCEPT, MAX_WALLPAPER_BYTES } from '$lib/constants';
  import { loadImage } from '$lib/engine/capture';
  import { router } from '$lib/stores/router.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { pickFiles, readAsDataURL } from '$lib/utils/file';
  import { formatBytes } from '$lib/utils/format';
  import SettingRow from './SettingRow.svelte';
  import Section from './Section.svelte';

  const wallpaper = $derived(settings.wallpaper);
  const clear = $derived(settings.settings.wallpaperClear);

  let link = $state('');
  let busy = $state(false);
  let error = $state('');

  const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/;

  async function useFile(file: File) {
    error = '';
    if (!IMAGE_TYPES.test(file.type)) {
      error = 'Use a PNG, JPG, WebP or GIF picture.';
      return;
    }
    if (file.size > MAX_WALLPAPER_BYTES) {
      error = `That file is ${formatBytes(file.size)}. Wallpapers can be up to ${formatBytes(MAX_WALLPAPER_BYTES)}.`;
      return;
    }
    busy = true;
    try {
      const url = await readAsDataURL(file);
      await loadImage(url); // makes sure it decodes before it replaces the current one
      await settings.setWallpaper({ type: file.type === 'image/gif' ? 'gif' : 'image', url, name: file.name });
      ui.toast('Wallpaper set.', 'success', { label: 'See Home', run: () => router.go('home') });
    } catch {
      error = 'That file could not be read as a picture.';
    } finally {
      busy = false;
    }
  }

  async function upload() {
    const [file] = await pickFiles(IMAGE_ACCEPT, false);
    if (file) await useFile(file);
  }

  async function useLink() {
    error = '';
    const raw = link.trim();
    if (!raw) return;
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    } catch {
      error = 'That does not look like a link.';
      return;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      error = 'Paste a web link that starts with http or https.';
      return;
    }
    busy = true;
    try {
      await loadImage(url.href);
      await settings.setWallpaper({ type: /\.gif$/i.test(url.pathname) ? 'gif' : 'image', url: url.href, name: url.hostname });
      link = '';
      ui.toast('Wallpaper set.', 'success', { label: 'See Home', run: () => router.go('home') });
    } catch {
      error = 'That link did not load as a picture. Some sites block hot-linking: try uploading the file instead.';
    } finally {
      busy = false;
    }
  }

  async function remove() {
    error = '';
    await settings.setWallpaper(null);
    ui.toast('Wallpaper removed. Home is black again.', 'info');
  }
</script>

<Section title="Wallpaper" intro="The artwork behind the Home menu, edge to edge. It is never blurred.">
  <div class="py-6">
    <!-- The preview is a drop target too: drag a picture onto it. -->
    <div
      class="relative aspect-video w-full max-w-2xl overflow-hidden border border-line-strong bg-black"
      use:dropzone={{ accept: 'image', onfiles: ([f]) => f?.file && void useFile(f.file) }}
      aria-label="Wallpaper preview"
      role="img"
    >
      {#if wallpaper}
        <img src={wallpaper.url} alt="" class="absolute inset-0 size-full object-cover" draggable="false" />
        {#if !clear}<div class="absolute inset-0 bg-black/55"></div>{/if}
        <div class="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 border border-line-strong bg-black px-2 py-1 text-[12px]">
          <Check size={13} strokeWidth={2.4} class="text-accent" />
          <span>{clear ? 'Full clarity' : 'Dark veil'}</span>
          <span class="text-fg-3">No blur</span>
        </div>
      {:else}
        <div class="absolute inset-0 grid place-items-center">
          <div class="flex flex-col items-center gap-2 text-fg-3">
            <ImageIcon size={26} strokeWidth={1.4} />
            <span class="text-[13px]">No picture. Drop one here.</span>
          </div>
        </div>
      {/if}
    </div>

    <div class="mt-4 flex max-w-2xl flex-wrap items-center gap-2">
      <Button variant="primary" icon={ImagePlus} onclick={upload} disabled={busy}>Upload picture</Button>
      <Button variant="secondary" icon={Trash} onclick={remove} disabled={!wallpaper || busy}>Remove</Button>
      <Button variant="ghost" icon={House} class="ml-auto" onclick={() => router.go('home')}>See Home</Button>
    </div>

    <form
      class="mt-3 flex max-w-2xl gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        void useLink();
      }}
    >
      <label class="relative min-w-0 flex-1">
        <Link size={16} strokeWidth={1.8} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
        <input class="input pl-9" type="text" inputmode="url" placeholder="Or paste a picture link" aria-label="Picture link" autocomplete="off" bind:value={link} />
      </label>
      <Button type="submit" variant="secondary" icon={Upload} disabled={!link.trim() || busy}>Use link</Button>
    </form>

    <p class="mt-3 max-w-2xl text-[12.5px] text-fg-3">
      PNG, JPG, WebP or GIF, up to {formatBytes(MAX_WALLPAPER_BYTES)}. A GIF animates. An uploaded picture is copied into the app's data folder; a link loads from the web each time.
    </p>
    {#if error}<p class="mt-2 max-w-2xl text-[13px] text-danger" role="alert">{error}</p>{/if}
    {#if wallpaper && !settings.wallpaperPersisted}
      <p class="mt-2 max-w-2xl text-[13px] text-fg-2" role="status">The wallpaper could not be saved, so it lasts until the app closes.</p>
    {/if}
  </div>

  <SettingRow
    title="Full clarity"
    hint="No blur and no overall dimming: the picture shows as it is, apart from a soft shade along the bottom and left edges that keeps the menu readable. Turn it off to lay a plain dark veil over it, still without blur."
  >
    <Switch label="Full clarity" checked={clear} onchange={(on) => settings.setWallpaperClear(on)} />
  </SettingRow>
</Section>
