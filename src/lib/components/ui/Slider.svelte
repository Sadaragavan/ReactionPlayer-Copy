<script lang="ts">
  /**
   * Range input restyled as a hairline with a yellow fill. The native element
   * keeps keyboard and screen-reader behaviour; only the paint is custom.
   */
  interface Props {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    label: string;
    disabled?: boolean;
    /** `plain` fills white instead of yellow (used for volume). */
    tone?: 'accent' | 'plain';
    /** Show the handle only on hover (HUD) instead of always (forms). */
    thumb?: 'always' | 'hover';
    class?: string;
    oninput?: (value: number) => void;
    onchange?: (value: number) => void;
  }

  let {
    value = $bindable(0),
    min = 0,
    max = 1,
    step = 0.01,
    label,
    disabled = false,
    tone = 'accent',
    thumb = 'always',
    class: cls = '',
    oninput,
    onchange
  }: Props = $props();

  const fill = $derived(max > min ? ((value - min) / (max - min)) * 100 : 0);
</script>

<input
  type="range"
  class="slider {cls}"
  class:plain={tone === 'plain'}
  class:hover-thumb={thumb === 'hover'}
  style="--fill:{fill}%"
  {min}
  {max}
  {step}
  {value}
  {disabled}
  aria-label={label}
  oninput={(e) => {
    value = e.currentTarget.valueAsNumber;
    oninput?.(value);
  }}
  onchange={(e) => onchange?.(e.currentTarget.valueAsNumber)}
/>

<style>
  .slider {
    --c: var(--color-accent);
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 20px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  .slider.plain {
    --c: #fff;
  }
  .slider:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .slider:focus-visible {
    outline-offset: 4px;
  }

  .slider::-webkit-slider-runnable-track {
    height: 2px;
    background: linear-gradient(to right, var(--c) var(--fill), rgb(255 255 255 / 0.22) var(--fill));
  }
  .slider::-moz-range-track {
    height: 2px;
    background: rgb(255 255 255 / 0.22);
  }
  .slider::-moz-range-progress {
    height: 2px;
    background: var(--c);
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -5px;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    transition: transform 120ms var(--ease-out-expo);
  }
  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    transition: transform 120ms var(--ease-out-expo);
  }
  .slider.hover-thumb::-webkit-slider-thumb {
    transform: scale(0);
  }
  .slider.hover-thumb::-moz-range-thumb {
    transform: scale(0);
  }
  .slider.hover-thumb:hover::-webkit-slider-thumb,
  .slider.hover-thumb:focus-visible::-webkit-slider-thumb,
  .slider.hover-thumb:active::-webkit-slider-thumb {
    transform: scale(1);
  }
  .slider.hover-thumb:hover::-moz-range-thumb,
  .slider.hover-thumb:focus-visible::-moz-range-thumb,
  .slider.hover-thumb:active::-moz-range-thumb {
    transform: scale(1);
  }
</style>
