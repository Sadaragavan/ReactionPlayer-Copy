<script lang="ts">
  /**
   * Presets: the library of layouts, and the studio where you make your own.
   *
   * A preset places every video on the black canvas. In the studio you sample a
   * frame from each video, then drag, nudge and crop those stills until the
   * picture lines up (with onion skin and a wipe line to check it), and save the
   * result with a thumbnail of the aligned canvas. A session started from a
   * preset begins with its viewports locked.
   */
  import { onDestroy } from 'svelte';
  import { Clapperboard, Plus, SlidersHorizontal } from '@lucide/svelte';
  import PresetCard from '$lib/components/presets/PresetCard.svelte';
  import { Studio } from '$lib/components/presets/studio.svelte';
  import StudioView from '$lib/components/presets/StudioView.svelte';
  import Dock from '$lib/components/shell/Dock.svelte';
  import PageShell from '$lib/components/shell/PageShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import ProBadge from '$lib/components/ui/ProBadge.svelte';
  import { presets } from '$lib/stores/presets.svelte';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { Preset } from '$lib/types';

  const studio = new Studio();
  onDestroy(() => studio.dispose());

  let view = $state<'library' | 'studio'>('library');
  let pendingDelete = $state<Preset | null>(null);

  const seePro = () => router.go({ name: 'settings', tab: 'subscription' });

  /** Free plan: a new preset needs a free slot. Says so, with a way out, when there is none. */
  function ensureRoom(): boolean {
    if (presets.canAddCustom) return true;
    ui.toast(`The free plan keeps ${settings.limits.maxCustomPresets} custom presets. Delete one, or go Pro for unlimited.`, 'info', {
      label: 'See Pro',
      run: seePro
    });
    return false;
  }

  function create() {
    if (!ensureRoom()) return;
    studio.startBlank(2);
    view = 'studio';
  }

  /** Your own presets edit in place; a standard one opens as a copy, which needs a free slot to save. */
  function edit(p: Preset) {
    if (p.builtIn && !ensureRoom()) return;
    studio.startFromPreset(p);
    view = 'studio';
  }

  function fromSession() {
    if (!ensureRoom()) return;
    if (!studio.startFromSession()) return;
    view = 'studio';
    if (!studio.slots.some((s) => s.frame)) ui.toast('Layout copied. Add a frame to each slot to line them up.', 'info');
  }

  function use(p: Preset) {
    ui.newSessionPreset = p;
    ui.newSessionOpen = true;
  }

  async function save() {
    const saved = await studio.save();
    if (!saved) {
      ensureRoom();
      return;
    }
    ui.toast(`Saved “${saved.name}”`, 'success');
    view = 'library';
  }

  async function confirmDelete() {
    const p = pendingDelete;
    if (!p) return;
    pendingDelete = null;
    await presets.remove(p.id);
    ui.toast(`Deleted “${p.name}”`, 'success');
  }
</script>

{#if view === 'studio'}
  <div class="flex h-full max-md:flex-col">
    <Dock />
    <StudioView {studio} onback={() => (view = 'library')} onsave={save} />
  </div>
{:else}
  <PageShell wide>
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="title-wide text-[28px] md:text-[34px]">Presets</h1>
        <p class="mt-2 max-w-xl text-fg-2">Layouts that place every video on the canvas. A session started from one begins with its viewports locked.</p>
      </div>
      <div class="flex flex-wrap gap-2">
        {#if session.current}
          <Button variant="secondary" icon={Clapperboard} onclick={fromSession}>From the open session</Button>
        {/if}
        <Button variant="primary" icon={Plus} onclick={create}>New preset</Button>
      </div>
    </div>

    <section class="mt-10" aria-labelledby="mine">
      <div class="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="mine" class="text-[16px] font-semibold">Your presets</h2>
        {#if !settings.isPro}
          <span class="num text-[12.5px] text-fg-3">{presets.custom.length} of {settings.limits.maxCustomPresets} on the free plan</span>
        {/if}
      </div>

      {#if !presets.canAddCustom}
        <div class="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border border-line px-4 py-3">
          <ProBadge />
          <p class="min-w-0 flex-1 text-[13.5px] text-fg-2">You have used all {settings.limits.maxCustomPresets} custom presets. Pro makes them unlimited.</p>
          <Button size="sm" variant="secondary" onclick={seePro}>See Pro</Button>
        </div>
      {/if}

      {#if presets.custom.length === 0}
        <EmptyState icon={SlidersHorizontal} title="No presets of your own yet">
          Line up a source and a reaction once, then reuse that layout in every session.
          {#snippet actions()}
            <Button variant="primary" icon={Plus} onclick={create}>New preset</Button>
          {/snippet}
        </EmptyState>
      {:else}
        <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
          {#each presets.custom as p (p.id)}
            <PresetCard preset={p} onuse={() => use(p)} onedit={() => edit(p)} ondelete={() => (pendingDelete = p)} />
          {/each}
        </div>
      {/if}
    </section>

    <section class="mt-12" aria-labelledby="standard">
      <h2 id="standard" class="text-[16px] font-semibold">Standard presets</h2>
      <p class="mt-1 mb-4 text-fg-2">They fit any canvas shape. Make a copy to adjust one.</p>
      <div class="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-5">
        {#each presets.builtIn as p (p.id)}
          <PresetCard preset={p} onuse={() => use(p)} onedit={() => edit(p)} />
        {/each}
      </div>
    </section>
  </PageShell>
{/if}

<Modal open={!!pendingDelete} onclose={() => (pendingDelete = null)} title="Delete preset" width="max-w-md">
  <p class="p-5 text-fg-2">
    “{pendingDelete?.name}” will be removed from this browser. Sessions that already use it keep their layout.
  </p>
  {#snippet footer()}
    <Button variant="ghost" data-autofocus onclick={() => (pendingDelete = null)}>Cancel</Button>
    <Button variant="danger" onclick={confirmDelete}>Delete preset</Button>
  {/snippet}
</Modal>
