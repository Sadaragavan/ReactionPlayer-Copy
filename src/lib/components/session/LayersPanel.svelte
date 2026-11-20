<script lang="ts">
  /**
   * The layers panel: a hairline-edged column docked to the right edge.
   *
   * Layers are listed top first. Each row can be dragged, or moved with its up and
   * down arrows, to change the stacking, and carries a visibility and a lock toggle
   * (a locked layer ignores the pointer, so clicks reach the layers below it).
   * Selecting a row opens its numeric
   * editor: position and size in 0.1 % micro-steps, per-edge crop, opacity, fit
   * and aspect lock. While the viewports are locked the editor is replaced by a
   * single unlock button, so nothing can shift by accident.
   * The foot of the panel applies a layout or a saved preset, or saves the current one as a preset.
   */
  import { AudioLines, ChevronDown, ChevronUp, Eye, EyeOff, Film, GripVertical, Layers, Lock, LockOpen, RotateCcw, Save, UserRound, X } from '@lucide/svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import IconButton from '$lib/components/ui/IconButton.svelte';
  import LayoutPreview from '$lib/components/ui/LayoutPreview.svelte';
  import NumberField from '$lib/components/ui/NumberField.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Slider from '$lib/components/ui/Slider.svelte';
  import { ASPECT_OPTIONS, MIN_LAYER_SIZE } from '$lib/constants';
  import { setAspect, normAspectOf } from '$lib/engine/aspect';
  import { buildLayout, coordinatesToSlots } from '$lib/engine/layouts';
  import { playback } from '$lib/engine/playback.svelte';
  import { ROLE_LABEL } from '$lib/engine/sessionFactory';
  import { moveInTopFirst, videosByZ } from '$lib/engine/zorder';
  import SourcePlaylist from './SourcePlaylist.svelte';
  import { presets } from '$lib/stores/presets.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { AspectLock, Crop, IconComponent, ID, LayoutType, VideoRole } from '$lib/types';
  import { clamp, roundTo } from '$lib/utils/geometry';
  import { PANEL_W } from './metrics';

  interface Props {
    open: boolean;
    /** Pixels the top bar and the dock occupy, so the panel sits between them. */
    top: number;
    bottom: number;
    onclose: () => void;
  }
  let { open, top, bottom, onclose }: Props = $props();

  const ROLE_ICON: Record<VideoRole, IconComponent> = { source: Film, reaction: UserRound, extra: Layers };
  const LAYOUTS: { type: Exclude<LayoutType, 'custom'>; label: string }[] = [
    { type: 'split', label: 'Side by side' },
    { type: 'grid', label: 'Stacked grid' },
    { type: 'pip', label: 'Picture in picture' }
  ];

  const CROP_EDGES: { edge: keyof Crop; cap: string; word: string }[] = [
    { edge: 't', cap: 'T', word: 'top' },
    { edge: 'r', cap: 'R', word: 'right' },
    { edge: 'b', cap: 'B', word: 'bottom' },
    { edge: 'l', cap: 'L', word: 'left' }
  ];

  const s = $derived(session.current);
  const locked = $derived(session.isLocked);
  /** Presets that fit this session. Applying one is a deliberate choice, so it works while locked — and locks the viewports at its coordinates. */
  const fitting = $derived(s ? presets.forCount(s.videos.length) : []);
  const standard = $derived(fitting.filter((p) => p.builtIn && p.slots.length === s?.videos.length));
  const mine = $derived(fitting.filter((p) => !p.builtIn));

  function usePreset(id: ID) {
    const p = presets.byId(id);
    if (!p) return;
    session.applyPreset(p);
    ui.toast(`Applied “${p.name}”. The viewports are locked.`, 'success');
  }
  // Top layer first: the reverse of paint order.
  const rows = $derived(s ? videosByZ(s.videos, s.alignment.coordinates).reverse() : []);
  const sel = $derived(!locked && session.selectedId && s ? s.videos.find((v) => v.id === session.selectedId) : undefined);
  const t = $derived(sel && s ? s.alignment.coordinates[sel.id] : undefined);

  /** Display units are percent of the canvas. */
  const pct = (v: number) => roundTo(v * 100, 2);
  const frac = (p: number) => roundTo(p / 100, 4);

  function setPos(axis: 'x' | 'y', p: number) {
    if (!sel || !t) return;
    session.setLayer(sel.id, { [axis]: clamp(frac(p), 0, 1 - (axis === 'x' ? t.w : t.h)) });
  }

  /** Width/height edits keep the aspect lock: changing one drives the other. */
  function setSize(axis: 'w' | 'h', p: number) {
    if (!sel || !t) return;
    const norm = normAspectOf(sel.id);
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
    session.setLayer(sel.id, { w: roundTo(w), h: roundTo(h) });
  }

  /** The four crops may not eat the whole picture: each edge stops 10 % short of its opposite. */
  function setCrop(edge: keyof Crop, p: number) {
    if (!sel || !t) return;
    const opposite = { t: 'b', b: 't', l: 'r', r: 'l' }[edge] as keyof Crop;
    const next = clamp(frac(p), 0, 0.9 - t.crop[opposite]);
    session.setLayer(sel.id, { crop: { ...t.crop, [edge]: next } });
  }

  /** Drag and drop: the row being dragged, and the row it is over. */
  let dragId = $state<ID | null>(null);
  let overId = $state<ID | null>(null);

  function drop(target: ID) {
    const from = dragId;
    dragId = overId = null;
    if (!from || from === target || locked) return;
    const ids = rows.map((v) => v.id);
    session.setStackOrder(moveInTopFirst(ids, from, ids.indexOf(target)));
  }

  async function saveAsPreset() {
    if (!s) return;
    const saved = await presets.save({
      name: `${s.name} layout`.slice(0, 48),
      layoutType: s.alignment.layoutType,
      slots: coordinatesToSlots(s.videos, s.alignment.coordinates),
      canvasAspect: s.canvasAspect === 'fill' ? undefined : s.canvasAspect,
      thumbnail: playback.thumbnail(320) ?? undefined
    });
    s.presetId = saved.id;
    ui.toast('Layout saved as a preset.', 'success', { label: 'Open presets', run: () => router.go('presets') });
  }
</script>

<aside
  class="panel-dock absolute right-0 z-30 flex flex-col border-l border-line bg-black"
  style="top:{top}px;bottom:{bottom}px;width:{PANEL_W}px"
  data-open={open}
  aria-label="Layers"
  inert={!open}
>
  <header class="flex h-11 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-4">
    <h2 class="nav-wide text-[14px]">Layers</h2>
    <IconButton size="sm" icon={X} label="Close panel" side="left" onclick={onclose} />
  </header>

  <div class="min-h-0 flex-1 overflow-y-auto">
    {#if locked}
      <div class="flex items-center gap-3 border-b border-line px-4 py-3">
        <Lock size={15} class="shrink-0 text-accent" />
        <p class="min-w-0 flex-1 text-[12.5px] leading-snug text-fg-2">Viewports are locked. Nothing can be moved or resized.</p>
        <Button size="sm" variant="secondary" icon={LockOpen} onclick={() => session.setLocked(false)}>Unlock</Button>
      </div>
    {/if}

    <SourcePlaylist />

    <ul class="py-1">
      {#each rows as v, k (v.id)}
        {@const lt = s?.alignment.coordinates[v.id]}
        {@const Icon = ROLE_ICON[v.role]}
        {@const on = sel?.id === v.id}
        <li
          class="{on ? 'bg-hover' : ''} {overId === v.id && dragId !== v.id ? 'border-t-2 border-accent' : ''}"
          draggable={!locked}
          ondragstart={(e) => {
            dragId = v.id;
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          }}
          ondragover={(e) => {
            if (!dragId) return;
            e.preventDefault();
            overId = v.id;
          }}
          ondragend={() => (dragId = overId = null)}
          ondrop={(e) => {
            e.preventDefault();
            drop(v.id);
          }}
        >
          <div class="group relative flex h-11 items-center pr-1 pl-1">
            <GripVertical size={14} class="shrink-0 {locked ? 'text-fg-3/30' : 'cursor-grab text-fg-3'}" aria-hidden="true" />
            {#if on}<span class="absolute inset-y-1.5 left-0 w-0.5 {v.role === 'source' ? 'bg-accent' : 'bg-fg'}"></span>{/if}
            <button
              class="flex h-full min-w-0 flex-1 items-center gap-2.5 px-2 text-left disabled:cursor-default"
              disabled={locked}
              aria-pressed={on}
              onclick={() => session.select(on ? null : v.id)}
            >
              <Icon size={15} strokeWidth={1.9} class="shrink-0 {v.role === 'source' ? 'text-accent' : 'text-fg-2'}" />
              <span class="min-w-0">
                <span class="block truncate text-[13px] {on ? 'text-fg' : 'text-fg-2 group-hover:text-fg'}">{v.title}</span>
                <span class="block text-[11px] leading-none text-fg-3">{ROLE_LABEL[v.role]}{lt?.locked ? ' · locked' : ''}{lt?.hidden ? ' · hidden' : ''}</span>
              </span>
            </button>
            <IconButton
              size="sm"
              icon={AudioLines}
              label={s?.masterId === v.id ? 'Master audio' : 'Use as master audio'}
              side="left"
              active={s?.masterId === v.id}
              onclick={() => playback.setMaster(v.id)}
            />
            <IconButton size="sm" icon={ChevronUp} label="Bring forward" kbd="]" side="left" disabled={!session.canReorderLayer(v.id, 'forward')} onclick={() => session.reorderLayer(v.id, 'forward')} />
            <IconButton size="sm" icon={ChevronDown} label="Send backward" kbd="[" side="left" disabled={!session.canReorderLayer(v.id, 'backward')} onclick={() => session.reorderLayer(v.id, 'backward')} />
            <IconButton
              size="sm"
              icon={lt?.locked ? Lock : LockOpen}
              label={lt?.locked ? 'Unlock layer' : 'Lock layer'}
              side="left"
              active={!!lt?.locked}
              onclick={() => session.setLayer(v.id, { locked: !lt?.locked })}
            />
            <IconButton
              size="sm"
              icon={lt?.hidden ? EyeOff : Eye}
              label={lt?.hidden ? 'Show layer' : 'Hide layer'}
              side="left"
              onclick={() => session.setLayer(v.id, { hidden: !lt?.hidden })}
            />
          </div>

          {#if on && lt}
            <div class="flex flex-col gap-3 px-4 pt-1 pb-4">
              <div class="grid grid-cols-2 gap-1.5">
                <NumberField caption="X" label="{v.title}: left position, percent" value={pct(lt.x)} min={0} max={100} step={0.1} unit="%" onchange={(p) => setPos('x', p)} />
                <NumberField caption="Y" label="{v.title}: top position, percent" value={pct(lt.y)} min={0} max={100} step={0.1} unit="%" onchange={(p) => setPos('y', p)} />
                <NumberField caption="W" label="{v.title}: width, percent" value={pct(lt.w)} min={pct(MIN_LAYER_SIZE)} max={100} step={0.1} unit="%" onchange={(p) => setSize('w', p)} />
                <NumberField caption="H" label="{v.title}: height, percent" value={pct(lt.h)} min={pct(MIN_LAYER_SIZE)} max={100} step={0.1} unit="%" onchange={(p) => setSize('h', p)} />
              </div>

              <div>
                <p class="mb-1.5 text-[11.5px] text-fg-3">Crop</p>
                <div class="grid grid-cols-4 gap-1.5">
                  {#each CROP_EDGES as c (c.edge)}
                    <NumberField caption={c.cap} label="{v.title}: crop {c.word}, percent" value={pct(lt.crop[c.edge])} min={0} max={90} step={0.5} digits={1} onchange={(p) => setCrop(c.edge, p)} />
                  {/each}
                </div>
              </div>

              <div class="flex items-center gap-3">
                <span class="w-14 shrink-0 text-[11.5px] text-fg-3">Opacity</span>
                <Slider label="{v.title}: opacity" value={lt.opacity} oninput={(o) => session.setLayer(v.id, { opacity: o })} />
                <span class="num w-9 shrink-0 text-right text-[12px] text-fg-2">{Math.round(lt.opacity * 100)}%</span>
              </div>

              <div class="flex items-center gap-3">
                <span class="w-14 shrink-0 text-[11.5px] text-fg-3">Fit</span>
                <Segmented
                  size="sm"
                  label="{v.title}: fit"
                  value={lt.fit}
                  options={[
                    { value: 'contain', label: 'Whole' },
                    { value: 'cover', label: 'Fill' }
                  ]}
                  onchange={(fit) => session.setLayer(v.id, { fit })}
                />
              </div>

              <div class="flex items-center gap-3">
                <span class="w-14 shrink-0 text-[11.5px] text-fg-3">Aspect</span>
                <select
                  class="input h-8 flex-1 text-[12.5px]"
                  aria-label="{v.title}: aspect lock"
                  value={lt.aspect}
                  onchange={(e) => setAspect(v.id, e.currentTarget.value as AspectLock)}
                >
                  {#each ASPECT_OPTIONS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
                </select>
              </div>

              <Button size="sm" variant="ghost" icon={RotateCcw} class="self-start" onclick={() => session.resetLayer(v.id)}>Reset this viewport</Button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </div>

  <footer class="shrink-0 border-t border-line p-4">
    <div class="grid grid-cols-3 gap-2">
      {#each LAYOUTS as l (l.type)}
        {@const active = s?.alignment.layoutType === l.type}
        <button
          class="relative flex flex-col gap-1.5 p-1 transition-colors hover:bg-hover disabled:pointer-events-none disabled:opacity-35"
          disabled={locked}
          aria-label={l.label}
          aria-pressed={active}
          title={l.label}
          onclick={() => session.applyLayout(l.type)}
        >
          <LayoutPreview slots={buildLayout(l.type, s?.videos.length ?? 2)} class={active ? 'border-accent' : ''} />
        </button>
      {/each}
    </div>
    <label class="mt-3 flex items-center gap-3">
      <span class="w-14 shrink-0 text-[11.5px] text-fg-3">Preset</span>
      <select class="input h-8 flex-1 text-[12.5px]" aria-label="Apply a preset" value={s?.presetId ?? ''} onchange={(e) => usePreset(e.currentTarget.value)}>
        <option value="" disabled>Choose a preset</option>
        {#if standard.length}
          <optgroup label="Standard">{#each standard as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</optgroup>
        {/if}
        {#if mine.length}
          <optgroup label="Yours">{#each mine as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</optgroup>
        {/if}
      </select>
    </label>
    <Button size="sm" variant="secondary" icon={Save} class="mt-3 w-full" onclick={saveAsPreset}>Save as preset</Button>
  </footer>
</aside>

<style>
  .panel-dock {
    transition:
      transform 380ms var(--ease-morph),
      top 380ms var(--ease-morph),
      bottom 380ms var(--ease-morph),
      visibility 0s linear 0s;
  }
  .panel-dock[data-open='false'] {
    transform: translateX(100%);
    visibility: hidden;
    transition:
      transform 380ms var(--ease-morph),
      top 380ms var(--ease-morph),
      bottom 380ms var(--ease-morph),
      visibility 0s linear 380ms;
  }
</style>
