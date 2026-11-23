<script lang="ts">
  /**
   * Shown when a wallpaper with colours in it is picked and the theme is off: “use its colors?”. It previews the two colours
   * that would be used. Nothing changes until the answer is yes, and the answer to the black base question is made here.
   */
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { buildTheme } from '$lib/utils/palette';
  import Button from '../ui/Button.svelte';
  import Modal from '../ui/Modal.svelte';
  import Switch from '../ui/Switch.svelte';

  let keepBlack = $state(true);
  let dontAsk = $state(false);

  const offer = $derived(ui.themeOffer);
  const preview = $derived(offer ? buildTheme(offer.swatches, { keepBlack: true }) : null);

  $effect(() => {
    if (offer) {
      keepBlack = settings.settings.themeKeepBlack;
      dontAsk = false;
    }
  });
</script>

<Modal open={!!offer} onclose={() => settings.declineThemeOffer(dontAsk)} title="Use the wallpaper's colors?" width="max-w-md">
  <div class="space-y-4 p-5 text-[13.5px]">
    <p class="text-fg-2">This wallpaper has colour in it. The interface can follow it, like a theme following its wallpaper.</p>
    {#if preview}
      <div class="flex items-center gap-5">
        <span class="flex items-center gap-2"><span class="size-8 border border-line-strong" style="background:{preview['--color-accent']}"></span>Accent</span>
        <span class="flex items-center gap-2"><span class="size-8 border border-line-strong" style="background:{preview['--color-accent-2']}"></span>Second accent</span>
        <span class="flex items-center gap-2"><span class="size-8 border border-line-strong" style="background:{preview['--ember']}"></span>Glow</span>
      </div>
    {/if}
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-fg">Keep the black base</p>
        <p class="text-[12.5px] text-fg-3">Only the accent colours and the cursor glow change; everything else stays black and white. Best for OLED screens.</p>
      </div>
      <Switch label="Keep the black base" checked={keepBlack} onchange={(v) => (keepBlack = v)} />
    </div>
    <div class="flex items-center justify-between gap-4">
      <p class="text-fg-2">Do not ask again when I pick a wallpaper</p>
      <Switch label="Do not ask again" checked={dontAsk} onchange={(v) => (dontAsk = v)} />
    </div>
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => settings.declineThemeOffer(dontAsk)}>Keep the current colors</Button>
    <Button variant="primary" onclick={() => settings.acceptThemeOffer(keepBlack, dontAsk)}>Use these colors</Button>
  {/snippet}
</Modal>
