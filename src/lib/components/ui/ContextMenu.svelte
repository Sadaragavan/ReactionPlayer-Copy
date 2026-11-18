<script lang="ts">
  /** Host for `ui.menu`: positions the panel inside the window and closes it on any outside action. */
  import { portal } from '$lib/actions/dom';
  import { ui } from '$lib/stores/ui.svelte';
  import MenuPanel from './MenuPanel.svelte';

  let host = $state<HTMLElement>();
  let pos = $state({ x: 0, y: 0 });

  // Keep the whole panel on screen, flipping above/left of the pointer when needed.
  $effect(() => {
    const m = ui.menu;
    if (!m || !host) return;
    const r = host.getBoundingClientRect();
    const wantY = m.above ? m.y - r.height - 6 : m.y;
    pos = {
      x: m.x + r.width > innerWidth - 8 ? Math.max(8, m.x - r.width) : m.x,
      y: Math.max(8, Math.min(wantY, innerHeight - r.height - 8))
    };
    host.querySelector<HTMLElement>('[role="menu"]')?.focus({ preventScroll: true });
  });

  $effect(() => {
    if (!ui.menu) return;
    const close = () => ui.closeMenu();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close());
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey, true);
    };
  });
</script>

{#if ui.menu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    use:portal
    class="fixed inset-0 z-[350]"
    onpointerdown={(e) => e.target === e.currentTarget && ui.closeMenu()}
    oncontextmenu={(e) => {
      e.preventDefault();
      if (e.target === e.currentTarget) ui.closeMenu();
    }}
  >
    <div bind:this={host} class="absolute" style="left:{pos.x}px;top:{pos.y}px">
      <MenuPanel entries={ui.menu.entries} close={() => ui.closeMenu()} />
    </div>
  </div>
{/if}
