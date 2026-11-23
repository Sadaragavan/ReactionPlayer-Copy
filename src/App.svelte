<script lang="ts">
  /**
   * App shell: boots the stores, hosts the current route and the global layers
   * (toasts, context menu, dialogs). “Quit” closes the native window (see engine/appActions.ts).
   */
  import { onMount } from 'svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { flushSettings, initPersistence } from '$lib/stores/persistence';
  import { presets } from '$lib/stores/presets.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
  import ShortcutsDialog from '$lib/components/ui/ShortcutsDialog.svelte';
  import Toasts from '$lib/components/ui/Toasts.svelte';
  import NewSessionModal from '$lib/components/home/NewSessionModal.svelte';
  import AddSourceDialog from '$lib/components/session/AddSourceDialog.svelte';
  import ThemeOfferDialog from '$lib/components/settings/ThemeOfferDialog.svelte';
  import Home from '$lib/pages/Home.svelte';
  import Presets from '$lib/pages/Presets.svelte';
  import Sessions from '$lib/pages/Sessions.svelte';
  import SessionPage from '$lib/pages/Session.svelte';
  import Settings from '$lib/pages/Settings.svelte';

  let booted = $state(false);

  onMount(() => {
    // The settings file has to be read before any store looks at a stored value.
    void initPersistence()
      .then(() => Promise.all([settings.init(), session.init(), presets.init()]))
      .then(() => (booted = true));
    // Persist the place in the video whenever the window is hidden or closed.
    const flush = () => {
      void session.save();
      void flushSettings();
    };
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
<AddSourceDialog />
<ThemeOfferDialog />
<ShortcutsDialog />
<ContextMenu />
<Toasts />
