<script lang="ts">
  /** The mark: a reaction layer behind, the source in front. Same drawing as the favicon. */
  let { size = 28, class: cls = '' }: { size?: number; class?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" class={cls} aria-hidden="true">
  <rect x="2.5" y="8" width="12.5" height="12.5" rx="1.5" stroke="currentColor" stroke-width="1.6" opacity="0.7" />
  <rect x="8" y="3" width="13.5" height="13.5" rx="1.5" style="fill: var(--color-accent)" />
  <path d="M12.8 6.6 17.8 9.75 12.8 12.9Z" fill="#000" />
</svg>
