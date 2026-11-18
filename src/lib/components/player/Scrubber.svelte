<script lang="ts">
  /**
   * A timeline bar: a hairline that thickens on hover, a yellow or white fill
   * and a playhead that appears when you reach for it.
   *
   * It only reports a 0–1 position; what that position *means* (a video's own
   * time, or the shared linked timeline) is the caller's business. Drags are
   * coalesced to one `onseek` per animation frame so a fast scrub never queues
   * a pile of seeks behind the decoder.
   */
  interface Segment {
    from: number;
    to: number;
    /** Dim bars mark videos that are not the master. */
    active?: boolean;
  }

  interface Props {
    /** Playhead position, 0–1. */
    value: number;
    label: string;
    onseek: (position: number) => void;
    onscrub?: (active: boolean) => void;
    /** Text for the hover read-out at a given 0–1 position. */
    format?: (position: number) => string;
    /** Spans of the other videos on a shared timeline (linked mode). */
    segments?: Segment[];
    /** ← / →: `fine` is true while Shift is held. When omitted the arrows are left to the global shortcuts. */
    onstep?: (direction: -1 | 1, fine: boolean) => void;
    fill?: 'accent' | 'white';
    disabled?: boolean;
    class?: string;
  }

  let { value, label, onseek, onscrub, format, segments = [], onstep, fill = 'accent', disabled = false, class: cls = '' }: Props = $props();

  let root = $state<HTMLElement>();
  let hover = $state<number | null>(null);
  let dragging = $state(false);
  let pending: number | null = null;
  let raf = 0;

  const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
  const positionAt = (clientX: number) => {
    const r = root?.getBoundingClientRect();
    return r && r.width ? clamp01((clientX - r.left) / r.width) : 0;
  };

  function flush() {
    raf = 0;
    if (pending === null) return;
    const p = pending;
    pending = null;
    onseek(p);
  }

  function queue(p: number) {
    pending = p;
    if (!raf) raf = requestAnimationFrame(flush);
  }

  function onpointerdown(e: PointerEvent) {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    root?.setPointerCapture(e.pointerId);
    dragging = true;
    onscrub?.(true);
    queue(positionAt(e.clientX));
  }

  function onpointermove(e: PointerEvent) {
    const p = positionAt(e.clientX);
    hover = p;
    if (dragging) queue(p);
  }

  function end() {
    if (!dragging) return;
    dragging = false;
    if (raf) cancelAnimationFrame(raf);
    flush();
    onscrub?.(false);
  }

  function onkeydown(e: KeyboardEvent) {
    if (disabled || !onstep || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    onstep(e.key === 'ArrowLeft' ? -1 : 1, e.shiftKey);
  }

  const shown = $derived(clamp01(value));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={root}
  role="slider"
  tabindex={disabled ? -1 : 0}
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuenow={Math.round(shown * 100)}
  aria-disabled={disabled}
  class="scrub group relative h-6 w-full touch-none select-none {disabled ? 'opacity-40' : 'cursor-pointer'} {cls}"
  data-dragging={dragging}
  {onpointerdown}
  {onpointermove}
  onpointerup={end}
  onpointercancel={end}
  onpointerleave={() => (hover = null)}
  {onkeydown}
>
  <div class="track absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-white/20">
    <div class="absolute inset-0 origin-left {fill === 'accent' ? 'bg-accent' : 'bg-white'}" style="transform:scaleX({shown})"></div>
  </div>

  <!-- Each span gets its own thin row under the bar, so overlapping videos stay readable. -->
  {#each segments as s, i (i)}
    <div
      class="pointer-events-none absolute h-0.5 {s.active ? 'bg-white/60' : 'bg-white/25'}"
      style="top:calc(50% + {4 + i * 3.5}px);left:{clamp01(s.from) * 100}%;width:{Math.max(0, clamp01(s.to) - clamp01(s.from)) * 100}%"
    ></div>
  {/each}

  <div class="knob pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" style="left:{shown * 100}%"></div>

  {#if hover !== null && format && !disabled}
    <div
      class="pointer-events-none absolute bottom-full mb-1 -translate-x-1/2 border border-line-strong bg-black px-1.5 py-0.5 text-[11.5px] text-fg num"
      style="left:clamp(24px, {hover * 100}%, calc(100% - 24px))"
    >
      {format(hover)}
    </div>
  {/if}
</div>

<style>
  .track {
    transition: transform 140ms var(--ease-out-expo);
  }
  .scrub:hover .track,
  .scrub:focus-visible .track,
  .scrub[data-dragging='true'] .track {
    transform: scaleY(2.4);
  }
  /* Tailwind positions with the separate `translate` property, so only scale is animated here. */
  .knob {
    transform: scale(0);
    transition: transform 140ms var(--ease-out-expo);
  }
  .scrub:hover .knob,
  .scrub:focus-visible .knob,
  .scrub[data-dragging='true'] .knob {
    transform: scale(1);
  }
  .scrub:focus-visible {
    outline-offset: 0;
  }
</style>
