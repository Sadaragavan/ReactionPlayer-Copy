<script lang="ts">
  /**
   * Compact numeric field with micro-stepping, for coordinates, crops and offsets.
   *   ↑ / ↓   one step      Shift  ×10      Alt  ÷10
   * Typing commits on Enter or blur; Esc puts the old value back. The short
   * caption sits inside the field so a row of four fits a narrow panel.
   */
  interface Props {
    /** Short caption inside the field, e.g. `X`. */
    caption: string;
    /** Full accessible name, e.g. `Layer x position`. */
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    digits?: number;
    unit?: string;
    disabled?: boolean;
    class?: string;
    onchange: (value: number) => void;
  }

  let { caption, label, value, min = -Infinity, max = Infinity, step = 1, digits = 1, unit = '', disabled = false, class: cls = '', onchange }: Props = $props();

  const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(digits))) : '');
  let focused = $state(false);
  let text = $state('');

  const shown = $derived(focused ? text : fmt(value));
  const round = (v: number) => Number(Math.min(max, Math.max(min, v)).toFixed(digits));

  function commit() {
    const n = Number.parseFloat(text.replace(',', '.'));
    if (Number.isFinite(n) && round(n) !== value) onchange(round(n));
  }

  function nudge(dir: 1 | -1, e: { shiftKey: boolean; altKey: boolean }) {
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    const next = round(value + dir * step * mult);
    if (next !== value) onchange(next);
    text = fmt(next);
  }

  function onkeydown(e: KeyboardEvent) {
    e.stopPropagation(); // arrows and letters belong to the field, not the player shortcuts
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      nudge(e.key === 'ArrowUp' ? 1 : -1, e);
    } else if (e.key === 'Enter') {
      commit();
      (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      text = fmt(value);
      (e.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<label class="field flex h-8 min-w-0 items-center border border-line-strong transition-colors focus-within:border-accent hover:border-fg-3 {disabled ? 'opacity-40' : ''} {cls}">
  <span class="w-6 shrink-0 text-center text-[11px] font-semibold text-fg-3" aria-hidden="true">{caption}</span>
  <input
    class="num min-w-0 flex-1 bg-transparent pr-1 text-right text-[12.5px] outline-none"
    type="text"
    inputmode="decimal"
    aria-label={label}
    {disabled}
    value={shown}
    oninput={(e) => (text = e.currentTarget.value)}
    onfocus={(e) => {
      focused = true;
      text = fmt(value);
      e.currentTarget.select();
    }}
    onblur={() => {
      if (focused) commit();
      focused = false;
    }}
    {onkeydown}
  />
  {#if unit}<span class="w-4 shrink-0 pr-1 text-[11px] text-fg-3" aria-hidden="true">{unit}</span>{/if}
</label>
