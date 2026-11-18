<script lang="ts">
  /**
   * Numeric alignment for the selected slot: position, size, crop, opacity, fit
   * and aspect lock. The rules match the player's layers panel — 0.1 % micro-steps
   * (Shift ×10, Alt ÷10), width and height honour the aspect lock — so a value
   * typed here means exactly the same thing there.
   */
  import { RotateCcw } from '@lucide/svelte';
  import { ASPECT_OPTIONS, MIN_LAYER_SIZE } from '$lib/constants';
  import type { AspectLock, Crop } from '$lib/types';
  import { clamp, roundTo } from '$lib/utils/geometry';
  import Button from '../ui/Button.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Slider from '../ui/Slider.svelte';
  import { slotName } from './names';
  import type { Studio } from './studio.svelte';

  let { studio }: { studio: Studio } = $props();

  const CROP_EDGES: { edge: keyof Crop; cap: string; word: string }[] = [
    { edge: 't', cap: 'T', word: 'top' },
    { edge: 'r', cap: 'R', word: 'right' },
    { edge: 'b', cap: 'B', word: 'bottom' },
    { edge: 'l', cap: 'L', word: 'left' }
  ];

  const i = $derived(studio.selected);
  const t = $derived(studio.current?.t);
  const name = $derived(studio.current ? slotName(studio.current.role, i) : '');

  /** Display units are percent of the canvas. */
  const pct = (v: number) => roundTo(v * 100, 2);
  const frac = (p: number) => roundTo(p / 100, 4);

  function setPos(axis: 'x' | 'y', p: number) {
    if (!t) return;
    studio.patch(i, { [axis]: clamp(frac(p), 0, 1 - (axis === 'x' ? t.w : t.h)) });
  }

  /** Width and height keep the aspect lock: changing one drives the other, and the box stays on the canvas. */
  function setSize(axis: 'w' | 'h', p: number) {
    if (!t) return;
    const norm = studio.normAspect(i);
    let w = t.w;
    let h = t.h;
    if (axis === 'w') {
      w = clamp(frac(p), MIN_LAYER_SIZE, 1 - t.x);
      if (norm) h = w / norm;
    } else {
      h = clamp(frac(p), MIN_LAYER_SIZE, 1 - t.y);
      if (norm) w = h * norm;
    }
    if (t.x + w > 1) {
      w = 1 - t.x;
      if (norm) h = w / norm;
    }
    if (t.y + h > 1) {
      h = 1 - t.y;
      if (norm) w = h * norm;
    }
    studio.patch(i, { w: roundTo(w), h: roundTo(h) });
  }

  /** Each crop edge stops 10 % short of its opposite, so some picture always remains. */
  function setCrop(edge: keyof Crop, p: number) {
    if (!t) return;
    const opposite = { t: 'b', b: 't', l: 'r', r: 'l' }[edge] as keyof Crop;
    studio.patch(i, { crop: { ...t.crop, [edge]: clamp(frac(p), 0, 0.9 - t.crop[opposite]) } });
  }
</script>

{#if t}
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h3 class="text-[13.5px] font-semibold">Placement</h3>
      <Button size="sm" variant="ghost" icon={RotateCcw} onclick={() => studio.resetSlot(i)}>Reset</Button>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <NumberField caption="X" label="{name}: left position, percent" value={pct(t.x)} min={0} max={100} step={0.1} unit="%" onchange={(p) => setPos('x', p)} />
      <NumberField caption="Y" label="{name}: top position, percent" value={pct(t.y)} min={0} max={100} step={0.1} unit="%" onchange={(p) => setPos('y', p)} />
      <NumberField caption="W" label="{name}: width, percent" value={pct(t.w)} min={pct(MIN_LAYER_SIZE)} max={100} step={0.1} unit="%" onchange={(p) => setSize('w', p)} />
      <NumberField caption="H" label="{name}: height, percent" value={pct(t.h)} min={pct(MIN_LAYER_SIZE)} max={100} step={0.1} unit="%" onchange={(p) => setSize('h', p)} />
    </div>

    <div>
      <p class="mb-1.5 text-[11.5px] text-fg-3">Crop</p>
      <div class="grid grid-cols-4 gap-1.5">
        {#each CROP_EDGES as c (c.edge)}
          <NumberField caption={c.cap} label="{name}: crop {c.word}, percent" value={pct(t.crop[c.edge])} min={0} max={90} step={0.5} digits={1} onchange={(p) => setCrop(c.edge, p)} />
        {/each}
      </div>
    </div>

    <div class="flex items-center gap-3">
      <span class="w-14 shrink-0 text-[11.5px] text-fg-3">Opacity</span>
      <Slider label="{name}: opacity" value={t.opacity} oninput={(o) => studio.patch(i, { opacity: o })} />
      <span class="num w-9 shrink-0 text-right text-[12px] text-fg-2">{Math.round(t.opacity * 100)}%</span>
    </div>

    <div class="flex items-center gap-3">
      <span class="w-14 shrink-0 text-[11.5px] text-fg-3">Fit</span>
      <Segmented
        size="sm"
        label="{name}: fit"
        value={t.fit}
        options={[
          { value: 'contain', label: 'Whole' },
          { value: 'cover', label: 'Fill' }
        ]}
        onchange={(fit) => studio.patch(i, { fit })}
      />
    </div>

    <div class="flex items-center gap-3">
      <span class="w-14 shrink-0 text-[11.5px] text-fg-3">Aspect</span>
      <select class="input h-8 flex-1 text-[12.5px]" aria-label="{name}: aspect lock" value={t.aspect} onchange={(e) => studio.setAspect(i, e.currentTarget.value as AspectLock)}>
        {#each ASPECT_OPTIONS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
      </select>
    </div>
  </div>
{/if}
