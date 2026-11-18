<script lang="ts">
  /**
   * Subscription: the Free versus Pro matrix, the upgrade card and cloud sync.
   *
   * Checkout goes through `billing` (see billing.ts): with Stripe Payment Links
   * configured it redirects to Stripe; without them it runs a clearly labelled
   * demo checkout so every Pro feature can be tried on this device.
   */
  import { Check, CloudUpload, ExternalLink, Minus } from '@lucide/svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ProBadge from '$lib/components/ui/ProBadge.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import { PRICING, TIER_LIMITS } from '$lib/constants';
  import { billing } from '$lib/billing';
  import { cloud } from '$lib/cloud';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { BillingPlan } from '$lib/types';
  import { plural, timeAgo } from '$lib/utils/format';
  import Section from './Section.svelte';
  import SettingRow from './SettingRow.svelte';

  const free = TIER_LIMITS.free;
  const pro = TIER_LIMITS.pro;
  const res = (n: number) => (n >= 2160 ? '4K' : `${n}p`);

  /** Built from TIER_LIMITS, so the matrix can never disagree with what the app enforces. */
  const ROWS: { feature: string; free: string | boolean; pro: string | boolean }[] = [
    { feature: 'Videos at once', free: String(free.maxVideos), pro: String(pro.maxVideos) },
    { feature: 'Playback resolution', free: `Up to ${res(free.maxResolution)}`, pro: `Up to ${res(pro.maxResolution)}` },
    { feature: 'Sessions', free: 'On this device', pro: 'Cloud sync' },
    { feature: 'Standard presets', free: true, pro: true },
    { feature: 'Custom presets', free: `Up to ${free.maxCustomPresets}`, pro: 'Unlimited' },
    { feature: 'Frame sampler', free: 'Capture, onion skin and wipe', pro: 'Plus the last 8 captures per video' }
  ];

  const PLANS: { value: BillingPlan; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'yearly', label: 'Yearly' }
  ];

  const plan = $derived(settings.settings.billing.plan);
  const price = $derived(PRICING[plan]);
  const portal = $derived(billing.portalUrl(settings.settings.billing.customerId));

  let busy = $state(false);
  let syncing = $state(false);

  const lastSync = $derived(Math.max(0, ...session.saved.map((s) => s.syncedAt ?? 0)));

  async function upgrade() {
    busy = true;
    try {
      const result = await billing.startCheckout(plan, settings.profile);
      if (result.kind === 'redirect') {
        location.assign(result.url);
        return;
      }
      settings.setTier('pro');
      ui.toast('Pro is on. This was the demo checkout, so nothing was charged.', 'success');
    } catch (err) {
      ui.toast(err instanceof Error ? err.message : 'Checkout could not start.', 'error');
    } finally {
      busy = false;
    }
  }

  function downgrade() {
    settings.setTier('free');
    ui.toast('Back on the Free plan.', 'info');
  }

  async function syncNow() {
    syncing = true;
    try {
      const result = await session.syncAll();
      if (!result) ui.toast('Cloud sync is not available in this browser.', 'error');
      else ui.toast(`Synced ${plural(result.pushed, 'session')}. ${result.pulled ? `${plural(result.pulled, 'newer copy', 'newer copies')} came down.` : 'Nothing newer in the cloud.'}`, 'success');
    } finally {
      syncing = false;
    }
  }
</script>

<Section title={settings.isPro ? 'You are on Pro' : 'You are on Free'} intro={settings.isPro ? 'Every feature is unlocked on this device.' : 'Upgrade when you need more than two videos, 4K or cloud sync.'}>
  <div class="overflow-x-auto py-6">
    <table class="w-full min-w-[34rem] border-collapse text-left">
      <thead>
        <tr class="border-b border-line-strong">
          <th class="w-[40%] pb-3 text-[13px] font-normal text-fg-3" scope="col"><span class="sr-only">Feature</span></th>
          <th class="pb-3 text-[15px] font-semibold" scope="col">
            Free
            {#if !settings.isPro}<span class="ml-2 text-[12px] font-normal text-fg-3">Current</span>{/if}
          </th>
          <th class="relative pb-3 text-[15px] font-semibold text-accent" scope="col">
            Pro
            {#if settings.isPro}<span class="ml-2 text-[12px] font-normal text-fg-2">Current</span>{/if}
            <span class="absolute inset-x-0 -bottom-px h-0.5 bg-accent"></span>
          </th>
        </tr>
      </thead>
      <tbody>
        {#each ROWS as row (row.feature)}
          <tr class="border-b border-line">
            <th class="py-3.5 pr-4 text-[14px] font-normal text-fg-2" scope="row">{row.feature}</th>
            {#each [row.free, row.pro] as cell, i (i)}
              <td class="py-3.5 pr-4 text-[14px] {i === 1 ? 'text-fg' : 'text-fg-2'}">
                {#if cell === true}
                  <Check size={16} strokeWidth={2.2} class={i === 1 ? 'text-accent' : 'text-fg-2'} aria-label="Included" />
                {:else if cell === false}
                  <Minus size={16} strokeWidth={1.8} class="text-fg-3" aria-label="Not included" />
                {:else}
                  {cell}
                {/if}
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</Section>

{#if !settings.isPro}
  <section class="mt-10 border border-accent-line p-6 md:p-8" aria-label="Upgrade to Pro">
    <div class="flex flex-wrap items-start justify-between gap-6">
      <div>
        <h2 class="title-wide text-[26px]">Reaction Pro</h2>
        <p class="mt-2 max-w-md text-fg-2">Four videos, 4K, cloud sync, the advanced frame sampler and unlimited presets.</p>
      </div>
      <Segmented label="Billing period" options={PLANS} value={plan} onchange={(v) => settings.setPlan(v)} />
    </div>

    <div class="mt-6 flex flex-wrap items-end justify-between gap-5">
      <div class="flex items-baseline gap-2.5">
        <span class="num text-[44px] leading-none font-bold">{price.price}</span>
        <span class="text-fg-2">{price.cadence}</span>
        {#if 'note' in price}<span class="ml-2 border border-accent-line px-1.5 py-0.5 text-[12px] text-accent">{price.note}</span>{/if}
      </div>
      <Button variant="primary" size="lg" disabled={busy || !billing.canBuy(plan)} onclick={upgrade}>Upgrade to Pro</Button>
    </div>

    <p class="mt-4 text-[12.5px] text-fg-3">
      {#if billing.live}
        Checkout is handled by {billing.adapter.name}. You can cancel from the billing portal at any time.
      {:else}
        Stripe is not connected yet, so this runs a demo checkout and nothing is charged. Add your Payment Links to <span class="text-fg-2">.env.local</span> to take real payments.
      {/if}
    </p>
  </section>
{:else}
  <Section title="Billing">
    <SettingRow title="Plan" hint={`${PRICING[plan].label}, ${PRICING[plan].price} ${PRICING[plan].cadence}.`}>
      <ProBadge locked={false} />
    </SettingRow>
    <SettingRow
      title="Manage billing"
      hint={portal ? 'Change your card, see invoices or cancel in the Stripe portal.' : 'No billing portal is connected in the demo.'}
    >
      <Button variant="secondary" icon={ExternalLink} disabled={!portal} onclick={() => portal && window.open(portal, '_blank', 'noopener')}>Open portal</Button>
    </SettingRow>
    {#if !billing.live}
      <SettingRow title="Cancel Pro" hint="Demo only: switches this device back to Free so you can compare.">
        <Button variant="danger" onclick={downgrade}>Switch to Free</Button>
      </SettingRow>
    {/if}
  </Section>
{/if}

<Section title="Cloud sessions" intro="Sessions saved on this device can be mirrored to the cloud so they follow you.">
  {#snippet aside()}{#if !settings.isPro}<ProBadge />{/if}{/snippet}
  <SettingRow
    title="Sync now"
    hint={settings.isPro
      ? lastSync
        ? `Last synced ${timeAgo(lastSync)} through ${cloud.name}.`
        : `Nothing synced yet. Backend: ${cloud.name}.`
      : 'Cloud sync is part of Pro.'}
  >
    <Button variant="secondary" icon={CloudUpload} disabled={!settings.isPro || syncing} onclick={syncNow}>
      {syncing ? 'Syncing' : 'Sync now'}
    </Button>
  </SettingRow>
</Section>
