<script lang="ts">
  /**
   * One panel of the right-click menu. Entries are plain data (see MenuEntry),
   * so any screen can build a menu without owning markup. Items with `children`
   * open a nested MenuPanel on hover or →. Steppers change a value in place and
   * keep the menu open, which is how sync offsets get nudged while watching.
   */
  import { Check, ChevronRight, RotateCcw } from '@lucide/svelte';
  import type { MenuEntry } from '$lib/types';
  import MenuPanel from './MenuPanel.svelte';

  interface Props {
    entries: MenuEntry[];
    /** Closes the whole menu. */
    close: () => void;
    nested?: boolean;
  }

  let { entries, close, nested = false }: Props = $props();
  let openId = $state<string | null>(null);
  let root = $state<HTMLElement>();

  /**
   * Where a nested panel sits, in px from its parent entry. It opens to the right
   * of the menu, flips to the left when the screen edge is in the way, and on a
   * narrow screen (no room on either side) overlaps its parent instead of leaving
   * the screen. It also slides up or down to stay between the top and bottom edges.
   */
  let place = $state<{ left: number; top: number } | null>(null);
  $effect(() => {
    if (!nested || !root) return;
    const anchor = root.offsetParent as HTMLElement | null;
    if (!anchor) return;
    const a = anchor.getBoundingClientRect();
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const edge = 4;
    let left = a.width + 2;
    if (a.left + left + w > innerWidth - edge) {
      const flipped = -w - 2;
      left = a.left + flipped >= edge ? flipped : innerWidth - edge - w - a.left;
    }
    let top = -5;
    if (a.top + top + h > innerHeight - edge) top = innerHeight - edge - h - a.top;
    if (a.top + top < edge) top = edge - a.top;
    place = { left, top };
  });

  const focusables = () => [...(root?.querySelectorAll<HTMLElement>(':scope > [data-entry] > [role^="menuitem"]:not([disabled])') ?? [])];

  function onkeydown(e: KeyboardEvent) {
    const items = focusables();
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length : i) - 1;
      items[next]?.focus();
    } else if (e.key === 'ArrowRight') {
      const id = (document.activeElement as HTMLElement | null)?.dataset.id;
      const hit = entries.find((x) => x.id === id);
      if (hit && hit.type !== 'separator' && hit.type !== 'stepper' && hit.children) {
        e.preventDefault();
        e.stopPropagation();
        openId = hit.id;
        queueMicrotask(() => root?.querySelector<HTMLElement>(`[data-entry="${hit.id}"] [role="menu"] [role^="menuitem"]`)?.focus());
      }
    } else if (e.key === 'ArrowLeft' && nested) {
      e.preventDefault();
      e.stopPropagation();
      (root?.closest('[data-entry]')?.querySelector(':scope > [role^="menuitem"]') as HTMLElement | null)?.focus();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={root}
  role="menu"
  tabindex="-1"
  {onkeydown}
  class="float pop-in min-w-56 rounded-md py-1 text-[13px] outline-none {nested ? 'absolute top-[-5px] left-full' : ''}"
  style={nested && place ? `left:${place.left}px;top:${place.top}px` : undefined}
>
  {#each entries as entry (entry.id)}
    {#if entry.type === 'separator'}
      <div class="my-1 h-px bg-line"></div>
    {:else if entry.type === 'stepper'}
      <div class="px-3 py-2" data-entry={entry.id}>
        <div class="mb-1.5 flex items-center gap-2 text-fg-2">
          {#if entry.icon}<entry.icon size={15} />{/if}
          <span class="flex-1">{entry.label}</span>
          <span class="num text-fg">{entry.value()}</span>
          {#if entry.onReset}
            <button class="-my-1 grid size-7 place-items-center rounded text-fg-3 hover:bg-hover hover:text-fg" aria-label="Reset {entry.label}" onclick={entry.onReset}>
              <RotateCcw size={13} />
            </button>
          {/if}
        </div>
        <div class="flex gap-1">
          {#each entry.steps as step (step)}
            <button
              class="num h-7 flex-1 rounded border border-line-strong text-[12px] text-fg-2 hover:border-fg-3 hover:bg-hover hover:text-fg active:bg-press"
              onclick={() => entry.onStep(step)}
            >
              {entry.stepLabel ? entry.stepLabel(step) : step > 0 ? `+${step}` : `−${Math.abs(step)}`}
            </button>
          {/each}
        </div>
      </div>
    {:else}
      <div class="relative" data-entry={entry.id} onpointerenter={() => (openId = entry.children ? entry.id : null)} role="none">
        <button
          role={entry.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          data-id={entry.id}
          disabled={entry.disabled}
          aria-haspopup={entry.children ? 'menu' : undefined}
          aria-checked={entry.checked === undefined ? undefined : entry.checked}
          class="flex h-9 w-full items-center gap-2.5 px-3 text-left transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 {entry.danger
            ? 'text-danger'
            : 'text-fg'}"
          onclick={() => {
            if (entry.children) {
              openId = entry.id;
              return;
            }
            entry.onSelect?.();
            close();
          }}
        >
          <span class="grid size-4 shrink-0 place-items-center text-fg-2">
            {#if entry.checked}<Check size={15} class="text-accent" />{:else if entry.icon}<entry.icon size={15} />{/if}
          </span>
          <span class="flex-1 truncate">{entry.label}</span>
          {#if entry.hint}<span class="num text-fg-3">{entry.hint}</span>{/if}
          {#if entry.children}<ChevronRight size={14} class="text-fg-3" />{/if}
        </button>
        {#if entry.children && openId === entry.id}
          <MenuPanel entries={entry.children} {close} nested />
        {/if}
      </div>
    {/if}
  {/each}
</div>
