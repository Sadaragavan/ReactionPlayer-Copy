<script lang="ts">
  /**
   * The source playlist: the episodes the reactor is reacting to, in the order they play.
   *
   * Each episode after the first has a break, the time between the previous one ending and this one starting. “Wait for
   * me” (the default) means it is shown on its first frame the moment the previous one ends, but does not play until
   * you start it; a number of seconds starts it by itself after that break. Drag an episode, or use its arrows, to
   * change the order.
   */
  import { ChevronDown, ChevronUp, GripVertical, ListPlus, Play, X } from '@lucide/svelte';
  import { playback } from '$lib/engine/playback.svelte';
  import { moveInTopFirst } from '$lib/engine/zorder';
  import { session } from '$lib/stores/session.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { formatTime } from '$lib/utils/format';
  import Button from '../ui/Button.svelte';
  import IconButton from '../ui/IconButton.svelte';
  import NumberField from '../ui/NumberField.svelte';

  const v = $derived(session.sourceVideo);
  const items = $derived(v?.sources ?? []);
  const spans = $derived(v ? session.spansOf(v) : []);
  const current = $derived(v?.sourceIndex ?? 0);

  let dragIndex = $state<number | null>(null);
  let overIndex = $state<number | null>(null);

  function drop(to: number) {
    const from = dragIndex;
    dragIndex = overIndex = null;
    if (from === null || from === to) return;
    const ids = items.map((x) => x.id);
    session.moveSource(ids[from], moveInTopFirst(ids, ids[from], to).indexOf(ids[from]));
  }

  /** Shows an episode. Linked, that means jumping the timeline to where it starts. */
  function show(i: number) {
    const s = session.current;
    if (!s) return;
    if (!s.isLinked) return session.activateSource(i);
    const start = spans[i]?.start;
    if (start === null || start === undefined) return ui.toast('That episode hasn’t started yet. Start it when the reaction gets there.', 'info');
    playback.seek(start);
  }

  function status(i: number): string {
    const sp = spans[i];
    if (i === current && v?.waiting) return 'Waiting for you to start it';
    if (sp?.start === null || sp?.start === undefined) return 'Not started yet';
    return `Starts at ${formatTime(sp.start)}`;
  }
</script>

<section class="border-b border-line px-4 py-3" aria-label="Sources">
  <div class="flex items-center justify-between gap-2">
    <h3 class="text-[12.5px] font-medium text-fg-2">Sources{items.length > 1 ? ` · ${items.length}` : ''}</h3>
    <Button size="sm" variant="ghost" icon={ListPlus} onclick={() => (ui.addSourceOpen = true)}>Add source</Button>
  </div>

  {#if items.length < 2}
    <p class="mt-1.5 text-[12px] leading-snug text-fg-3">Add more episodes to play after this one.</p>
  {:else}
    <ol class="mt-2 flex flex-col">
      {#each items as it, i (it.id)}
        <li
          class="border-t border-line first:border-t-0 {overIndex === i && dragIndex !== i ? 'border-t-2 !border-accent' : ''}"
          draggable="true"
          ondragstart={(e) => {
            dragIndex = i;
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          }}
          ondragover={(e) => {
            if (dragIndex === null) return;
            e.preventDefault();
            overIndex = i;
          }}
          ondragend={() => (dragIndex = overIndex = null)}
          ondrop={(e) => {
            e.preventDefault();
            drop(i);
          }}
        >
          <div class="flex items-center gap-1 py-1.5">
            <GripVertical size={14} class="shrink-0 cursor-grab text-fg-3" aria-hidden="true" />
            <button class="min-w-0 flex-1 text-left" onclick={() => show(i)} aria-current={i === current ? 'true' : undefined}>
              <span class="flex items-baseline gap-1.5">
                <span class="num text-[11.5px] {i === current ? 'text-accent' : 'text-fg-3'}">{i + 1}</span>
                <span class="truncate text-[13px] {i === current ? 'text-fg' : 'text-fg-2'}">{it.title}</span>
              </span>
              <span class="block truncate pl-4 text-[11.5px] text-fg-3">
                {it.duration > 0 ? formatTime(it.duration) : 'length unknown'} · {status(i)}
              </span>
            </button>
            {#if i === current && v?.waiting}
              <IconButton size="sm" icon={Play} label="Start this source now" kbd="N" side="left" active onclick={() => playback.startNextSource()} />
            {/if}
            <IconButton size="sm" icon={ChevronUp} label="Move earlier" side="left" disabled={i === 0} onclick={() => session.moveSource(it.id, i - 1)} />
            <IconButton size="sm" icon={ChevronDown} label="Move later" side="left" disabled={i === items.length - 1} onclick={() => session.moveSource(it.id, i + 1)} />
            <IconButton size="sm" icon={X} label="Remove from the playlist" side="left" onclick={() => session.removeSource(it.id)} />
          </div>

          {#if i > 0}
            <div class="flex items-center gap-2 pb-2 pl-5 text-[11.5px] text-fg-3">
              <span class="shrink-0">Starts</span>
              <button
                class="rounded-md border px-2 py-1 transition-colors {it.gapMs === null ? 'border-accent text-fg' : 'border-line hover:text-fg'}"
                aria-pressed={it.gapMs === null}
                onclick={() => session.setSourceGap(it.id, null)}
              >
                When I start it
              </button>
              <button
                class="rounded-md border px-2 py-1 transition-colors {it.gapMs !== null ? 'border-accent text-fg' : 'border-line hover:text-fg'}"
                aria-pressed={it.gapMs !== null}
                onclick={() => session.setSourceGap(it.id, it.gapMs ?? 0)}
              >
                After a break
              </button>
              {#if it.gapMs !== null}
                <NumberField class="w-20" caption="s" label="Break before {it.title}, in seconds" value={it.gapMs / 1000} min={0} max={3600} step={1} digits={1} onchange={(sec) => session.setSourceGap(it.id, sec * 1000)} />
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>
