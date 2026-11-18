<script lang="ts">
  /**
   * App shell: boots the stores, hosts the current route and the global layers
   * (toasts, context menu, dialogs). A web page cannot close itself, so “Quit”
   * parks the app on a dark screen instead (see ui.dormant).
   */
  import { onMount } from 'svelte';
  import { Power } from '@lucide/svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { presets } from '$lib/stores/presets.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
  import ShortcutsDialog from '$lib/components/ui/ShortcutsDialog.svelte';
  import Toasts from '$lib/components/ui/Toasts.svelte';
  import NewSessionModal from '$lib/components/home/NewSessionModal.svelte';
  import Home from '$lib/pages/Home.svelte';
  import Presets from '$lib/pages/Presets.svelte';
  import Sessions from '$lib/pages/Sessions.svelte';
  import SessionPage from '$lib/pages/Session.svelte';
  import Settings from '$lib/pages/Settings.svelte';

  let booted = $state(false);

  onMount(() => {
    void Promise.all([settings.init(), session.init(), presets.init()]).then(() => (booted = true));
    // Persist the place in the video whenever the tab is hidden or closed.
    const flush = () => void session.save();
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  });

  // A session page with nothing open has nothing to show.
  $effect(() => {
    if (booted && router.route.name === 'session' && !session.current) router.go('home', { replace: true });
  });

  function onkeydown(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      ui.shortcutsOpen = !ui.shortcutsOpen;
    }
  }
</script>

<svelte:window {onkeydown} />

{#if booted}
  {#key router.route.name}
    <div class="fade-in h-full">
      {#if router.route.name === 'home'}<Home />
      {:else if router.route.name === 'session'}<SessionPage />
      {:else if router.route.name === 'presets'}<Presets />
      {:else if router.route.name === 'sessions'}<Sessions />
      {:else}<Settings />{/if}
    </div>
  {/key}
{/if}

<NewSessionModal />
<ShortcutsDialog />
<ContextMenu />
<Toasts />

{#if ui.dormant}
  <div class="fade-in fixed inset-0 z-[500] grid place-items-center bg-black">
    <div class="flex flex-col items-center gap-5 text-center">
      <Power size={28} strokeWidth={1.5} class="text-fg-3" />
      <p class="text-fg-2">Session closed. Your place is saved.</p>
      <Button variant="primary" onclick={() => (ui.dormant = false)}>Reopen</Button>
    </div>
  </div>
{/if}
