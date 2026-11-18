<script lang="ts" generics="T extends string | number">
  /** Single-choice control. The selected option gets a yellow underline, not a fill. */
  interface Option {
    value: T;
    label: string;
    disabled?: boolean;
    title?: string;
  }
  interface Props {
    options: Option[];
    value: T;
    label: string;
    size?: 'sm' | 'md';
    class?: string;
    onchange: (value: T) => void;
  }

  let { options, value, label, size = 'md', class: cls = '', onchange }: Props = $props();
</script>

<div role="radiogroup" aria-label={label} class="inline-flex border border-line-strong {cls}">
  {#each options as o (o.value)}
    {@const on = o.value === value}
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={o.disabled}
      title={o.title}
      onclick={() => onchange(o.value)}
      class="relative px-3.5 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-35 {size === 'sm'
        ? 'h-8 text-[12.5px]'
        : 'h-10 text-[13.5px]'} {on ? 'text-fg' : 'text-fg-2 hover:bg-hover hover:text-fg'}"
    >
      {o.label}
      {#if on}<span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span>{/if}
    </button>
  {/each}
</div>
