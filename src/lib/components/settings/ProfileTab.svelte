<script lang="ts">
  /**
   * Profile: who this is, a photo, and a read-out of what this device holds.
   * Everything is stored locally; the email is only used to prefill checkout.
   */
  import { ArrowRight, Camera, Trash } from '@lucide/svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import ProBadge from '$lib/components/ui/ProBadge.svelte';
  import { IMAGE_ACCEPT } from '$lib/constants';
  import { presets } from '$lib/stores/presets.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { downscaleToDataURL, pickFiles } from '$lib/utils/file';
  import { formatDate } from '$lib/utils/format';
  import SettingRow from './SettingRow.svelte';
  import Section from './Section.svelte';

  const profile = $derived(settings.profile);
  const initial = $derived((profile.displayName || 'G').slice(0, 1).toUpperCase());
  const emailOk = $derived(!profile.email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(profile.email));

  /** The first edit is the moment a guest becomes a member. */
  function edit(patch: { displayName?: string; email?: string }) {
    settings.updateProfile({ ...patch, ...(profile.createdAt ? {} : { createdAt: Date.now() }) });
  }

  async function choosePhoto() {
    const [file] = await pickFiles(IMAGE_ACCEPT, false);
    if (!file) return;
    try {
      settings.updateProfile({ avatar: await downscaleToDataURL(file, 256) });
    } catch {
      ui.toast('That file could not be read as a picture.', 'error');
    }
  }
</script>

<Section title="Profile" intro="How you appear in the dock. It stays on this device.">
  <div class="flex items-center gap-5 py-6">
    <span class="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong text-[28px] font-semibold">
      {#if profile.avatar}
        <img src={profile.avatar} alt="Your avatar" class="size-full object-cover" />
      {:else}{initial}{/if}
    </span>
    <div class="flex flex-wrap gap-2">
      <Button variant="secondary" icon={Camera} onclick={choosePhoto}>Choose photo</Button>
      {#if profile.avatar}
        <Button variant="ghost" icon={Trash} onclick={() => settings.updateProfile({ avatar: undefined })}>Remove</Button>
      {/if}
    </div>
  </div>

  <SettingRow title="Name" for="profile-name" hint="Shown next to your plan at the bottom of the dock.">
    <input
      id="profile-name"
      class="input w-72 max-sm:w-full"
      type="text"
      maxlength="40"
      autocomplete="name"
      placeholder="Guest"
      value={profile.displayName === 'Guest' ? '' : profile.displayName}
      oninput={(e) => edit({ displayName: e.currentTarget.value.trimStart() || 'Guest' })}
    />
  </SettingRow>

  <SettingRow title="Email" for="profile-email" hint="Used to prefill checkout when you upgrade, and for nothing else.">
    <div class="w-72 max-sm:w-full">
      <input
        id="profile-email"
        class="input"
        type="email"
        autocomplete="email"
        placeholder="you@example.com"
        aria-invalid={!emailOk}
        value={profile.email}
        oninput={(e) => edit({ email: e.currentTarget.value.trim() })}
      />
      {#if !emailOk}<p class="mt-1.5 text-[12.5px] text-danger" role="alert">That does not look like an email address.</p>{/if}
    </div>
  </SettingRow>

  <SettingRow title="Member since" hint="The day you first saved your profile.">
    <span class="num text-fg-2">{profile.createdAt ? formatDate(profile.createdAt) : 'Not yet'}</span>
  </SettingRow>
</Section>

<Section title="Plan" intro="What your account includes.">
  <SettingRow
    title={settings.isPro ? 'Pro' : 'Free'}
    hint={settings.isPro
      ? 'Four videos, 4K, cloud sync, the advanced frame sampler and unlimited presets.'
      : 'Two videos, local sessions, standard presets and three custom ones.'}
  >
    <Button variant="secondary" onclick={() => router.go({ name: 'settings', tab: 'subscription' })}>
      {settings.isPro ? 'Manage plan' : 'Compare plans'}
      <ArrowRight size={15} strokeWidth={2} />
    </Button>
  </SettingRow>
</Section>

<Section title="On this device" intro="What this browser is holding for you.">
  <SettingRow title="Saved sessions" hint="Layouts, offsets and where you stopped.">
    <span class="num text-[15px]">{session.saved.length}</span>
  </SettingRow>
  <SettingRow title="Custom presets" hint={settings.isPro ? 'No limit on Pro.' : 'Free keeps up to three. Pro makes them unlimited.'}>
    <span class="num text-[15px]">
      {presets.custom.length}{#if !settings.isPro} of {settings.limits.maxCustomPresets}{/if}
    </span>
    {#if !settings.isPro && !presets.canAddCustom}<ProBadge />{/if}
  </SettingRow>
  <SettingRow title="Wallpaper" hint="Set under Appearance.">
    <span class="text-fg-2">{settings.wallpaper ? (settings.wallpaper.type === 'gif' ? 'Animated GIF' : 'Picture') : 'None'}</span>
  </SettingRow>
</Section>
