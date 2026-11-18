<script lang="ts">
  /**
   * The workhorse control: an icon with no visible label. The label is the
   * tooltip and the accessible name, so nothing is ever unexplained.
   * `active` paints the icon yellow — reserved for “on” states such as linked.
   */
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { tip, type TipSide } from '$lib/actions/tooltip';
  import type { IconComponent } from '$lib/types';

  interface Props extends Omit<HTMLButtonAttributes, 'class'> {
    icon: IconComponent;
    label: string;
    kbd?: string;
    side?: TipSide;
    active?: boolean;
    size?: 'sm' | 'md' | 'lg';
    stroke?: number;
    class?: string;
  }

  let { icon: Icon, label, kbd, side = 'top', active = false, size = 'md', stroke = 1.75, class: cls = '', ...rest }: Props = $props();

  const box = $derived({ sm: 'size-8', md: 'size-10', lg: 'size-12' }[size]);
  const px = $derived({ sm: 16, md: 18, lg: 22 }[size]);
</script>

<button
  type="button"
  aria-label={label}
  aria-pressed={active ? true : undefined}
  use:tip={{ text: label, kbd, side }}
  class="grid shrink-0 place-items-center rounded-md transition-colors duration-150 hover:bg-hover active:bg-press disabled:pointer-events-none disabled:opacity-35 {box} {active
    ? 'text-accent'
    : 'text-fg-2 hover:text-fg'} {cls}"
  {...rest}
>
  <Icon size={px} strokeWidth={stroke} />
</button>
