<script lang="ts">
  /**
   * Settings & account hub. One page, four tabs, each its own route
   * (`#/settings/appearance` …) so a tab can be linked to from anywhere:
   * a locked feature sends people straight to Subscription.
   */
  import AppearanceTab from '$lib/components/settings/AppearanceTab.svelte';
  import PreferencesTab from '$lib/components/settings/PreferencesTab.svelte';
  import ProfileTab from '$lib/components/settings/ProfileTab.svelte';
  import SubscriptionTab from '$lib/components/settings/SubscriptionTab.svelte';
  import PageShell from '$lib/components/shell/PageShell.svelte';
  import { hrefFor } from '$lib/stores/router.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import type { SettingsTab } from '$lib/types';

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'profile', label: 'Profile' },
    { id: 'subscription', label: 'Subscription' }
  ];

  const tab = $derived<SettingsTab>(router.route.tab ?? 'appearance');
</script>

<PageShell>
  <h1 class="title-wide text-[28px] md:text-[34px]">Settings</h1>

  <nav class="mt-7 -mx-5 flex overflow-x-auto border-b border-line px-5 md:mx-0 md:px-0" aria-label="Settings sections">
    {#each TABS as t (t.id)}
      {@const on = t.id === tab}
      <a
        href={hrefFor({ name: 'settings', tab: t.id })}
        aria-current={on ? 'page' : undefined}
        class="relative shrink-0 px-4 py-3 text-[14.5px] transition-colors first:pl-0 max-md:first:pl-0 {on ? 'text-fg' : 'text-fg-2 hover:text-fg'}"
      >
        {t.label}
        {#if t.id === 'subscription' && !settings.isPro}<span class="ml-1.5 text-[11px] font-semibold text-accent">Pro</span>{/if}
        {#if on}<span class="absolute inset-x-4 -bottom-px h-0.5 bg-accent first:inset-x-0 {t.id === 'appearance' ? '!left-0' : ''}"></span>{/if}
      </a>
    {/each}
  </nav>

  <div class="mt-8">
    {#key tab}
      <div class="fade-in">
        {#if tab === 'appearance'}<AppearanceTab />
        {:else if tab === 'preferences'}<PreferencesTab />
        {:else if tab === 'profile'}<ProfileTab />
        {:else}<SubscriptionTab />{/if}
      </div>
    {/key}
  </div>
</PageShell>
