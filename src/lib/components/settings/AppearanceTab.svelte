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
  import { Check, Image as ImageIcon, ImagePlus, Link, Trash, Upload } from '@lucide/svelte';
  import { dropzone } from '$lib/actions/dropzone';
  import Button from '$lib/components/ui/Button.svelte';
  import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import { IMAGE_ACCEPT, MAX_WALLPAPER_BYTES } from '$lib/constants';
  import { loadImage } from '$lib/engine/capture';
  import { router } from '$lib/stores/router.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { ThemeSource } from '$lib/types';
  import { pickFiles, readAsDataURL } from '$lib/utils/file';
  import { oklchToHex } from '$lib/utils/palette';
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
      error = 'Couldn’t read that file as a picture.';
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
      error = 'That doesn’t look like a link.';
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
      error = 'That link didn’t load as a picture. Some sites block it; try uploading the file instead.';
    } finally {
      busy = false;
    }
  }

  async function remove() {
    error = '';
    await settings.setWallpaper(null);
    ui.toast('Wallpaper removed. Home is black again.', 'info');
  }
  const SOURCES: { value: ThemeSource; label: string }[] = [
    { value: 'classic', label: 'Classic' },
    { value: 'wallpaper', label: 'From wallpaper' },
    { value: 'custom', label: 'Custom' }
  ];

  /** The second accent as shown in its picker: the one picked, else the one made from the accent. */
  const second = $derived(settings.settings.customAccent2 ?? (settings.customSwatches ? oklchToHex(settings.customSwatches.accent2) : '#ffb347'));
  /** The colors found in the current wallpaper, offered as quick colors. */
  const wallpaperPicks = $derived(
    settings.settings.themeSwatches
      ? [
          { hex: oklchToHex(settings.settings.themeSwatches.accent), title: 'From the wallpaper' },
          { hex: oklchToHex(settings.settings.themeSwatches.accent2), title: 'From the wallpaper (second color)' }
        ]
      : []
  );
</script>

<Section title="Wallpaper" intro="The picture behind the Home menu. It is never blurred.">
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
      <p class="mt-2 max-w-2xl text-[13px] text-fg-2" role="status">Couldn’t save the wallpaper, so it lasts only until the app closes.</p>
    {/if}
  </div>

  <SettingRow
    title="Full clarity"
    hint="Shows the wallpaper as it is, with only a soft shade behind the menu. Off adds a plain dark overlay."
  >
    <Switch label="Full clarity" checked={clear} onchange={(on) => settings.setWallpaperClear(on)} />
  </SettingRow>
</Section>

<Section title="Colors" intro="The accent, the second accent and the Home glow. Backgrounds stay black.">
  <SettingRow title="Colors" hint="Classic black and yellow, colors from your wallpaper, or colors you pick.">
    <Segmented label="Where the colors come from" options={SOURCES} value={settings.settings.themeSource} onchange={(v) => void settings.setThemeSource(v)} />
  </SettingRow>

  {#if settings.settings.themeSource === 'wallpaper'}
    <div class="py-4 text-[13px]" role="status">
      {#if settings.themeStatus === 'themed'}
        <p class="text-fg-3">Taken from the main colors in your wallpaper.</p>
      {:else if settings.themeStatus === 'no-wallpaper'}
        <p class="text-fg-2">Set a wallpaper above to use its colors.</p>
      {:else if settings.themeStatus === 'neutral'}
        <p class="text-fg-2">This picture has too little color to pick from (mostly gray, black or white), so the classic yellow is kept. Choose Custom to pick one yourself.</p>
      {:else if settings.themeStatus === 'unreadable'}
        <p class="text-danger">Couldn’t read this picture’s colors, so the classic yellow is kept. Colors can’t be read from a link whose website blocks it; upload the picture instead.</p>
      {/if}
    </div>
  {/if}

  {#if settings.settings.themeSource === 'custom'}
    <div class="grid gap-6 py-4 sm:grid-cols-2">
      <div>
        <p class="mb-2.5 text-[13px] text-fg">Accent</p>
        <ColorPicker label="Accent" value={settings.settings.customAccent} onchange={(hex) => settings.setCustomAccent('accent', hex)} suggestions={wallpaperPicks} />
      </div>
      <div>
        <div class="mb-2.5 flex items-center justify-between">
          <p class="text-[13px] text-fg">Second accent</p>
          {#if settings.settings.customAccent2}
            <button class="text-[12.5px] text-fg-3 hover:text-fg" onclick={() => settings.setCustomAccent('accent2', null)}>Match the accent</button>
          {:else}
            <span class="text-[12.5px] text-fg-3">Matches the accent</span>
          {/if}
        </div>
        <ColorPicker label="Second accent" value={second} onchange={(hex) => settings.setCustomAccent('accent2', hex)} />
      </div>
    </div>
    {#if settings.customSwatches?.adjusted}
      <p class="pb-3 text-[12.5px] text-fg-3" role="status">Dark colors are lightened slightly so they read on black.</p>
    {/if}
  {/if}

  {#if settings.settings.themeSource !== 'classic'}
    <SettingRow title="Keep the black base" hint="On: only the accent colors and the cursor glow change (best for OLED screens). Off: text, lines and hover tones are tinted too.">
      <Switch label="Keep the black base" checked={settings.settings.themeKeepBlack} onchange={(v) => settings.setThemeKeepBlack(v)} />
    </SettingRow>
    {#if settings.settings.themeSource === 'wallpaper' && settings.themeStatus === 'themed'}
    <div class="flex flex-wrap items-center gap-4 py-4 text-[13px]">
      <span class="flex items-center gap-2"><span class="size-5 border border-line-strong" style="background: var(--color-accent)"></span>Accent</span>
      <span class="flex items-center gap-2"><span class="size-5 border border-line-strong" style="background: var(--color-accent-2)"></span>Second accent</span>
      <span class="flex items-center gap-2"><span class="size-5 border border-line-strong" style="background: var(--color-fg)"></span>Text</span>
      <span class="flex items-center gap-2"><span class="size-5 border border-line-strong" style="background: var(--ember)"></span>Glow</span>
    </div>
    {/if}
  {/if}

  <SettingRow title="Ask when I pick a wallpaper" hint="After you pick a wallpaper with color in it, ask whether to use its colors.">
    <Switch label="Ask when I pick a wallpaper" checked={settings.settings.askThemeOnWallpaper} onchange={(v) => settings.setAskThemeOnWallpaper(v)} />
  </SettingRow>
</Section>
