<script lang="ts">
  /**
   * Session browser (“Load session”). Every session the app has saved, as a grid
   * of cards you can search and sort. Resuming opens the session with its
   * viewports locked, exactly where you stopped.
   */
  import { Clapperboard, FolderOpen, Search, Sparkles, Upload, X } from '@lucide/svelte';
  import SessionCard from '$lib/components/sessions/SessionCard.svelte';
  import { matchesQuery, sorter, type SortKey } from '$lib/components/sessions/stats';
  import PageShell from '$lib/components/shell/PageShell.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import EmptyState from '$lib/components/ui/EmptyState.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import { demoSessionInput, warmDemoClips } from '$lib/engine/demo';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { Session } from '$lib/types';
  import { openJSONText } from '$lib/utils/file';
  import { plural } from '$lib/utils/format';

  const SORTS: { value: SortKey; label: string }[] = [
    { value: 'recent', label: 'Recent' },
    { value: 'title', label: 'Title' },
    { value: 'duration', label: 'Duration' }
  ];

  let query = $state('');
  let sort = $state<SortKey>('recent');
  let pendingDelete = $state<Session | null>(null);

  const total = $derived(session.saved.length);
  const shown = $derived(session.saved.filter((s) => matchesQuery(s, query)).sort(sorter(sort)));

  async function resume(s: Session) {
    if (await session.open(s.id)) router.go('session');
    else ui.toast('Couldn’t open that session.', 'error');
  }

  async function duplicate(s: Session) {
    const copy = await session.duplicate(s.id);
    if (copy) ui.toast(`Duplicated as “${copy.name}”`, 'success');
  }

  async function exportConfig(s: Session) {
    const outcome = await session.exportJSON(s.id);
    if (outcome === 'saved') ui.toast('Layout file saved. It holds the layout and sync, not your videos.', 'success');
    else if (outcome === 'failed') ui.toast('Couldn’t save the layout file.', 'error');
  }

  async function confirmDelete() {
    const s = pendingDelete;
    if (!s) return;
    pendingDelete = null;
    await session.remove(s.id);
    ui.toast(`Deleted “${s.name}”`, 'success');
  }

  async function importConfig() {
    const text = await openJSONText();
    if (text === null) return;
    const result = await session.importConfig(text);
    if ('error' in result) {
      ui.toast(result.error, 'error');
    } else {
      ui.toast(`Imported “${result.name}”. Choose its video files when you open it.`, 'success');
    }
  }

  async function demo() {
    await warmDemoClips();
    session.create(demoSessionInput(settings.settings.defaultLayout, settings.playback.masterAudio, settings.playback.autoLink, settings.playback.muteOthers));
    router.go('session');
  }
</script>

<PageShell wide>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="title-wide text-[28px] md:text-[34px]">Load session</h1>
      <p class="mt-2 text-fg-2">{total ? plural(total, 'saved session') : 'Nothing saved yet'}</p>
    </div>
    <Button variant="secondary" icon={Upload} onclick={importConfig}>Import config</Button>
  </div>

  {#if total === 0}
    <div class="mt-8">
      <EmptyState icon={FolderOpen} title="No saved sessions yet">
        A session saves itself the moment you start it, along with where you stopped.
        {#snippet actions()}
          <Button variant="primary" icon={Clapperboard} onclick={() => (ui.newSessionOpen = true)}>New session</Button>
          <Button variant="secondary" icon={Sparkles} onclick={demo}>Try the demo</Button>
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div class="mt-8 flex flex-wrap items-center gap-3">
      <label class="relative max-w-md min-w-56 flex-1">
        <Search size={16} strokeWidth={1.8} class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
        <input class="input pr-9 pl-9" type="text" placeholder="Search sessions" aria-label="Search sessions" autocomplete="off" bind:value={query} />
        {#if query}
          <button
            type="button"
            class="absolute top-1/2 right-1.5 grid size-7 -translate-y-1/2 place-items-center rounded text-fg-3 hover:bg-hover hover:text-fg"
            aria-label="Clear search"
            onclick={() => (query = '')}
          >
            <X size={14} strokeWidth={2} />
          </button>
        {/if}
      </label>
      <Segmented class="ml-auto" label="Sort sessions" options={SORTS} value={sort} onchange={(v) => (sort = v)} />
    </div>

    {#if shown.length === 0}
      <div class="mt-6">
        <EmptyState icon={Search} title="No session matches “{query.trim()}”">
          Search covers session names and the titles of their videos.
          {#snippet actions()}
            <Button variant="secondary" onclick={() => (query = '')}>Clear search</Button>
          {/snippet}
        </EmptyState>
      </div>
    {:else}
      <div class="mt-6 grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-5">
        {#each shown as s (s.id)}
          <SessionCard
            session={s}
            onresume={() => resume(s)}
            onduplicate={() => duplicate(s)}
            onexport={() => exportConfig(s)}
            ondelete={() => (pendingDelete = s)}
            onrename={(name) => session.rename(s.id, name)}
          />
        {/each}
      </div>
    {/if}
  {/if}
</PageShell>

<Modal open={!!pendingDelete} onclose={() => (pendingDelete = null)} title="Delete session" width="max-w-md">
  <p class="p-5 text-fg-2">
    “{pendingDelete?.name}” will be removed from this browser, along with where you stopped. Your video files are not touched.
  </p>
  {#snippet footer()}
    <Button variant="ghost" data-autofocus onclick={() => (pendingDelete = null)}>Cancel</Button>
    <Button variant="danger" onclick={confirmDelete}>Delete session</Button>
  {/snippet}
</Modal>
