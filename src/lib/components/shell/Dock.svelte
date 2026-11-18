<script lang="ts">
  /**
   * The left-hand dock: a fixed 256 px column on desktop, an icon strip along the
   * bottom edge on phones. It is the persistent navigation of every page except
   * Home, which is a title screen with its own menu, and the player, which has
   * its own docked HUD.
   */
  import { Clapperboard, FolderOpen, Play, Power, Settings, SlidersHorizontal } from '@lucide/svelte';
  import { continueLast, quitApp } from '$lib/engine/appActions';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { timeAgo } from '$lib/utils/format';
  import Logo from './Logo.svelte';

  const route = $derived(router.route.name);
  const last = $derived(session.lastSession);

  const item =
    'group relative flex h-12 w-full items-center gap-3.5 px-6 text-left transition-colors duration-150 hover:bg-hover disabled:pointer-events-none disabled:opacity-35 max-md:h-14 max-md:flex-1 max-md:justify-center max-md:px-0';
</script>

<nav
  aria-label="Main"
  class="z-30 flex shrink-0 flex-col border-line bg-black md:h-full md:w-[256px] md:border-r max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:h-14 max-md:flex-row max-md:border-t"
>
  <div class="flex h-20 items-center gap-3 px-6 max-md:hidden">
    <Logo />
    <span class="title-wide text-[17px]">Reaction</span>
  </div>

  <div class="flex flex-1 flex-col max-md:flex-row">
    <button class={item} disabled={!session.canContinue} onclick={continueLast} aria-label="Continue">
      <Play size={18} strokeWidth={1.9} class="shrink-0 text-accent" />
      <span class="min-w-0 max-md:sr-only">
        <span class="nav-wide block text-[15px]">Continue</span>
        {#if last}
          <span class="flex gap-2 text-[12px] font-normal text-fg-3">
            <span class="min-w-0 truncate">{last.name}</span>
            <span class="shrink-0">{timeAgo(last.lastModified)}</span>
          </span>
        {/if}
      </span>
    </button>

    <button class={item} onclick={() => (ui.newSessionOpen = true)} aria-label="New session">
      <Clapperboard size={18} strokeWidth={1.8} class="shrink-0 text-fg-2 group-hover:text-fg" />
      <span class="nav-wide text-[15px] max-md:sr-only">New session</span>
    </button>

    <button class={item} onclick={() => router.go('sessions')} aria-label="Load session" aria-current={route === 'sessions' ? 'page' : undefined}>
      {#if route === 'sessions'}<span class="absolute inset-y-2 left-0 w-0.5 bg-accent max-md:inset-x-3 max-md:inset-y-auto max-md:top-0 max-md:h-0.5 max-md:w-auto"></span>{/if}
      <FolderOpen size={18} strokeWidth={1.8} class="shrink-0 {route === 'sessions' ? 'text-accent' : 'text-fg-2 group-hover:text-fg'}" />
      <span class="nav-wide text-[15px] max-md:sr-only {route === 'sessions' ? 'text-fg' : 'text-fg-2 group-hover:text-fg'}">Load session</span>
    </button>

    <button class={item} onclick={() => router.go('presets')} aria-label="Presets" aria-current={route === 'presets' ? 'page' : undefined}>
      {#if route === 'presets'}<span class="absolute inset-y-2 left-0 w-0.5 bg-accent max-md:inset-x-3 max-md:inset-y-auto max-md:top-0 max-md:h-0.5 max-md:w-auto"></span>{/if}
      <SlidersHorizontal size={18} strokeWidth={1.8} class="shrink-0 {route === 'presets' ? 'text-accent' : 'text-fg-2 group-hover:text-fg'}" />
      <span class="nav-wide text-[15px] max-md:sr-only {route === 'presets' ? 'text-fg' : 'text-fg-2 group-hover:text-fg'}">Presets</span>
    </button>

    <button
      class={item}
      onclick={() => router.go({ name: 'settings', tab: 'appearance' })}
      aria-label="Settings"
      aria-current={route === 'settings' ? 'page' : undefined}
    >
      {#if route === 'settings'}<span class="absolute inset-y-2 left-0 w-0.5 bg-accent max-md:inset-x-3 max-md:inset-y-auto max-md:top-0 max-md:h-0.5 max-md:w-auto"></span>{/if}
      <Settings size={18} strokeWidth={1.8} class="shrink-0 {route === 'settings' ? 'text-accent' : 'text-fg-2 group-hover:text-fg'}" />
      <span class="nav-wide text-[15px] max-md:sr-only {route === 'settings' ? 'text-fg' : 'text-fg-2 group-hover:text-fg'}">Settings</span>
    </button>

    <button class={item} onclick={quitApp} aria-label="Quit">
      <Power size={18} strokeWidth={1.8} class="shrink-0 text-fg-2 group-hover:text-fg" />
      <span class="nav-wide text-[15px] text-fg-2 group-hover:text-fg max-md:sr-only">Quit</span>
    </button>
  </div>

  <button
    class="flex h-16 items-center gap-3 border-t border-line px-6 text-left transition-colors hover:bg-hover max-md:hidden"
    onclick={() => router.go({ name: 'settings', tab: 'profile' })}
    aria-label="Profile and plan"
  >
    <span class="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong text-[13px] font-semibold">
      {#if settings.profile.avatar}
        <img src={settings.profile.avatar} alt="" class="size-full object-cover" />
      {:else}{(settings.profile.displayName || 'G').slice(0, 1).toUpperCase()}{/if}
    </span>
    <span class="min-w-0">
      <span class="block truncate text-[13.5px] font-medium">{settings.profile.displayName || 'Guest'}</span>
      <span class="block text-[12px] {settings.isPro ? 'text-accent' : 'text-fg-3'}">{settings.isPro ? 'Pro' : 'Free plan'}</span>
    </span>
  </button>
</nav>
