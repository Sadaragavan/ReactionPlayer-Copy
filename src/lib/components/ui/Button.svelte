<script lang="ts">
  /** Text button. `primary` (solid yellow) is the one main action on a screen. */
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import type { IconComponent } from '$lib/types';

  interface Props extends Omit<HTMLButtonAttributes, 'class'> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    icon?: IconComponent;
    class?: string;
    children?: Snippet;
  }

  let { variant = 'secondary', size = 'md', icon: Icon, class: cls = '', children, ...rest }: Props = $props();

  const look = $derived(
    {
      primary: 'bg-accent text-black font-semibold hover:brightness-110 active:brightness-90',
      secondary: 'border border-line-strong text-fg hover:border-fg-3 hover:bg-hover active:bg-press',
      ghost: 'text-fg-2 hover:bg-hover hover:text-fg active:bg-press',
      danger: 'border border-danger/50 text-danger hover:bg-danger/10 active:bg-danger/20'
    }[variant]
  );
  const dims = $derived({ sm: 'h-8 gap-1.5 px-3 text-[13px]', md: 'h-10 gap-2 px-4', lg: 'h-12 gap-2.5 px-6 text-[15px]' }[size]);
</script>

<button
  type="button"
  class="inline-flex shrink-0 items-center justify-center rounded-md whitespace-nowrap transition duration-150 disabled:pointer-events-none disabled:opacity-40 {look} {dims} {cls}"
  {...rest}
>
  {#if Icon}<Icon size={size === 'lg' ? 18 : 16} strokeWidth={1.9} />{/if}
  {@render children?.()}
</button>
