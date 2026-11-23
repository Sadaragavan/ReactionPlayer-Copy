<script lang="ts">
  /**
   * A colour picker for one colour: a swatch that opens the system picker, a hex field, quick colours, and (where the browser has
   * one) an eyedropper that reads any pixel on the screen. It reports every change, so a theme can follow a drag live.
   */
  import { Pipette } from '@lucide/svelte';
  import { hexToOklch } from '$lib/utils/palette';
  import IconButton from './IconButton.svelte';

  interface Props {
    label: string;
    /** `#rrggbb`. */
    value: string;
    onchange: (hex: string) => void;
    /** Extra quick colours shown first, such as the wallpaper's. */
    suggestions?: { hex: string; title: string }[];
  }

  let { label, value, onchange, suggestions = [] }: Props = $props();

  const PRESETS = ['#ffd400', '#ff9f43', '#ff6b6b', '#ff6bd6', '#b57bff', '#7aa2ff', '#4dd0e1', '#5eead4', '#7be495', '#c3e86b', '#f2f2f2'];

  const normal = (hex: string) => {
    let h = hex.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(h)) h = [...h].map((c) => c + c).join('');
    return /^[0-9a-f]{6}$/.test(h) ? `#${h}` : null;
  };

  let text = $state('');
  let editing = $state(false);
  const shown = $derived(editing ? text : value);
  const valid = $derived(normal(shown) !== null && hexToOklch(shown) !== null);

  function commit(raw: string) {
    const hex = normal(raw);
    if (hex) onchange(hex);
  }

  const dropper = typeof window !== 'undefined' && 'EyeDropper' in window;
  async function pick() {
    try {
      const { sRGBHex } = await new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper().open();
      commit(sRGBHex);
    } catch {
      /* cancelled with Escape */
    }
  }
</script>

<div class="flex flex-col gap-2.5">
  <div class="flex items-center gap-2">
    <!-- The real colour input sits invisibly over the swatch, so a click opens the system picker. -->
    <span class="relative size-9 shrink-0 border border-line-strong" style="background:{value}">
      <input type="color" class="absolute inset-0 size-full cursor-pointer opacity-0" aria-label="{label}: open the colour picker" {value} oninput={(e) => commit(e.currentTarget.value)} />
    </span>
    <input
      class="input h-9 w-28 font-mono text-[13px] uppercase {valid ? '' : 'border-danger'}"
      aria-label="{label}: hex colour"
      spellcheck="false"
      maxlength="7"
      value={shown}
      onfocus={() => {
        editing = true;
        text = value;
      }}
      oninput={(e) => {
        text = e.currentTarget.value;
        commit(text);
      }}
      onblur={() => (editing = false)}
      onkeydown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), commit(text))}
    />
    {#if dropper}
      <IconButton icon={Pipette} label="Pick a colour from the screen" side="top" onclick={pick} />
    {/if}
  </div>

  <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="{label}: quick colours">
    {#each suggestions as s (s.hex + s.title)}
      <button class="size-6 border border-line-strong outline-offset-2 hover:outline hover:outline-1 hover:outline-fg-2" style="background:{s.hex}" title={s.title} aria-label={s.title} onclick={() => commit(s.hex)}></button>
    {/each}
    {#if suggestions.length}<span class="mx-1 h-5 w-px bg-line-strong"></span>{/if}
    {#each PRESETS as hex (hex)}
      <button class="size-6 border border-line-strong outline-offset-2 hover:outline hover:outline-1 hover:outline-fg-2" style="background:{hex}" title={hex} aria-label={hex} onclick={() => commit(hex)}></button>
    {/each}
  </div>
</div>
