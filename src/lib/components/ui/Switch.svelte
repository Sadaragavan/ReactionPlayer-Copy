<script lang="ts">
  /** On/off switch. Yellow when on, hairline when off. */
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    /** Accessible name — the visible label lives next to the switch. */
    label: string;
    onchange?: (checked: boolean) => void;
  }

  let { checked = $bindable(false), disabled = false, label, onchange }: Props = $props();

  function toggle() {
    if (disabled) return;
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  {disabled}
  onclick={toggle}
  class="relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 after:absolute after:-inset-1.5 after:content-[''] disabled:opacity-50 {checked
    ? 'border-accent bg-accent'
    : 'border-line-strong bg-transparent hover:border-fg-3'}"
>
  <span
    class="absolute top-1/2 left-0 size-4 -translate-y-1/2 rounded-full transition-transform duration-200 ease-[var(--ease-out-expo)] {checked
      ? 'translate-x-[1.5rem] bg-black'
      : 'translate-x-[0.25rem] bg-fg-2'}"
  ></span>
</button>
