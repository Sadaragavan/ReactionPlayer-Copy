<script lang="ts">
  /**
   * New Session stepper.
   *   1 · Videos   a source, a reaction and two optional extra angles: drop, browse or paste a link.
   *                When the reaction covers several episodes, more sources can follow the first; they play one after another.
   *   2 · Layout   split / grid / corner or a preset, canvas shape, linked or free timelines
   * Opened from the dock, or by dropping files on Home (`ui.newSessionFiles` pre-fills the slots).
   */
  import { untrack } from 'svelte';
  import { ArrowLeft, ArrowRight, Plus, Sparkles } from '@lucide/svelte';
  import { demoSessionInput, warmDemoClips } from '$lib/engine/demo';
  import { MAX_VIDEOS } from '$lib/constants';
  import { pickVideoFiles, pickedUrl, releasePickedUrl, type PickedFile } from '$lib/engine/media';
  import { probeVideo } from '$lib/engine/probe';
  import { defaultSessionName, roleForIndex, ROLE_LABEL, type NewVideoInput } from '$lib/engine/sessionFactory';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { CanvasAspect, LayoutType, Preset } from '$lib/types';
  import { titleFromFileName } from '$lib/utils/file';
  import Button from '../ui/Button.svelte';
  import Modal from '../ui/Modal.svelte';
  import LayoutStep from './LayoutStep.svelte';
  import VideoSlot, { type SlotData } from './VideoSlot.svelte';

  const HINTS = ['The video being reacted to. It always sits on top.', 'Your reaction footage.', 'An extra angle.', 'An extra angle.'];

  let step = $state<1 | 2>(1);
  let slots = $state<(SlotData | null)[]>([null, null, null, null]);
  /** Further sources that play after the first, in order. */
  let more = $state<(SlotData | null)[]>([]);
  let layout = $state<Exclude<LayoutType, 'custom'>>('split');
  let preset = $state<Preset | null>(null);
  let canvas = $state<CanvasAspect>('16:9');
  let linked = $state(true);
  let name = $state('');

  const maxVideos = MAX_VIDEOS;
  const MAX_SOURCES = 20;
  const filled = $derived(slots.filter((s): s is SlotData => s !== null));
  const moreFilled = $derived(more.filter((s): s is SlotData => s !== null));
  const good = (s: SlotData | null) => !!s && !s.busy && !s.error;
  const ready = $derived(good(slots[0]) && good(slots[1]) && [...filled, ...moreFilled].every((s) => !s.busy && !s.error));

  // Every time the dialog opens it starts clean, then takes any files dropped on Home.
  $effect(() => {
    if (!ui.newSessionOpen) return;
    untrack(() => {
      step = 1;
      slots = [null, null, null, null];
      more = [];
      const wanted = ui.newSessionPreset;
      ui.newSessionPreset = null;
      preset = wanted;
      name = '';
      linked = settings.playback.autoLink;
      layout = settings.settings.defaultLayout;
      canvas = wanted?.canvasAspect ?? '16:9';
      const dropped = ui.newSessionFiles;
      ui.newSessionFiles = [];
      dropped.slice(0, maxVideos).forEach((f, i) => void setFile(i, f));
    });
  });

  /** Reads duration, size and a still, and writes them into the slot — unless the slot was refilled meanwhile. */
  /** `list` picks the slots (the main four) or the extra sources that follow the first one. */
  async function load(i: number, base: SlotData, src: string, list: 'main' | 'more' = 'main') {
    const arr = () => (list === 'main' ? slots : more);
    arr()[i] = { ...base, busy: true };
    const same = () => arr()[i]?.file === base.file && arr()[i]?.url === base.url;
    try {
      const r = await probeVideo(src);
      if (same()) arr()[i] = { ...base, duration: r.duration, width: r.width, height: r.height, thumb: r.thumb };
    } catch (err) {
      if (same()) arr()[i] = { ...base, error: err instanceof Error ? err.message : 'Could not read this video.' };
    }
  }

  async function setFile(i: number, p: PickedFile, list: 'main' | 'more' = 'main') {
    const src = pickedUrl(p);
    try {
      await load(i, { title: titleFromFileName(p.name), kind: 'file', url: '', file: p.file, path: p.path, handle: p.handle, fileName: p.name, fileSize: p.size }, src, list);
    } finally {
      releasePickedUrl(p, src);
    }
  }

  async function setUrl(i: number, raw: string, list: 'main' | 'more' = 'main') {
    let u: URL;
    try {
      u = new URL(raw);
      if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
    } catch {
      ui.toast('That is not a web link. Start it with https://', 'error');
      return;
    }
    const tail = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '') || u.hostname;
    await load(i, { title: titleFromFileName(tail), kind: 'url', url: u.href }, u.href, list);
  }

  async function choose(i: number, list: 'main' | 'more' = 'main') {
    const [picked] = await pickVideoFiles(false);
    if (picked) await setFile(i, picked, list);
  }

  function addSource() {
    if (more.length < MAX_SOURCES - 1) more.push(null);
  }

  const close = () => (ui.newSessionOpen = false);

  function start() {
    const toInput = (s: SlotData): NewVideoInput => ({
      title: s.title,
      kind: s.kind,
      url: s.kind === 'url' ? s.url : '',
      file: s.file,
      path: s.path,
      handle: s.handle,
      fileName: s.fileName,
      fileSize: s.fileSize,
      duration: s.duration
    });
    const videos = filled.map(toInput);
    if (moreFilled.length) videos[0] = { ...videos[0], moreSources: moreFilled.map(toInput) };
    session.create({
      name: name.trim() || undefined,
      videos,
      layout: preset ? { preset: $state.snapshot(preset) as Preset } : layout,
      linked,
      masterPolicy: settings.playback.masterAudio,
      muteOthers: settings.playback.muteOthers,
      canvasAspect: canvas
    });
    close();
    router.go('session');
  }

  async function demo() {
    await warmDemoClips();
    session.create(demoSessionInput(settings.settings.defaultLayout, settings.playback.masterAudio, settings.playback.autoLink, settings.playback.muteOthers));
    close();
    router.go('session');
  }
</script>

<Modal open={ui.newSessionOpen} onclose={close} title="New session" width="max-w-2xl">
  <div class="p-5">
    <ol class="mb-5 flex gap-6 text-[13px]" aria-label="Steps">
      {#each ['Videos', 'Layout'] as label, i (label)}
        <li class="relative pb-2 {step === i + 1 ? 'text-fg' : 'text-fg-3'}" aria-current={step === i + 1 ? 'step' : undefined}>
          <span class="num mr-1.5">{i + 1}</span>{label}
          {#if step === i + 1}<span class="absolute inset-x-0 bottom-0 h-0.5 bg-accent"></span>{/if}
        </li>
      {/each}
    </ol>

    {#if step === 1}
      <div class="space-y-3">
        {#each slots as slot, i (i)}
          <VideoSlot
            role={roleForIndex(i)}
            label={i > 1 ? `${ROLE_LABEL.extra} ${i - 1}` : ROLE_LABEL[roleForIndex(i)]}
            hint={i === 0 && more.length ? 'The first episode. The sources below play after it.' : HINTS[i]}
            {slot}
            onchoose={() => choose(i)}
            onfiles={(files) => files[0] && setFile(i, files[0])}
            onurl={(u) => setUrl(i, u)}
            onclear={() => (slots[i] = null)}
          />
          {#if i === 0}
            {#each more as extra, k (k)}
              <VideoSlot
                role="source"
                label="Source {k + 2}"
                hint="Plays after Source {k + 1}. It waits on its first frame until you start it."
                slot={extra}
                onchoose={() => choose(k, 'more')}
                onfiles={(files) => files[0] && setFile(k, files[0], 'more')}
                onurl={(u) => setUrl(k, u, 'more')}
                onclear={() => more.splice(k, 1)}
              />
            {/each}
            <Button variant="ghost" size="sm" icon={Plus} onclick={addSource}>Add another source</Button>
          {/if}
        {/each}
      </div>
    {:else}
      <LayoutStep
        count={filled.length}
        bind:layout
        bind:preset
        bind:canvas
        bind:linked
        bind:name
        placeholder={defaultSessionName(filled)}
      />
    {/if}
  </div>

  {#snippet footer()}
    {#if step === 1}
      <Button variant="ghost" icon={Sparkles} class="mr-auto" onclick={demo}>Try the demo</Button>
      <Button variant="primary" disabled={!ready} onclick={() => (step = 2)}>
        Next<ArrowRight size={16} strokeWidth={1.9} />
      </Button>
    {:else}
      <Button variant="ghost" icon={ArrowLeft} class="mr-auto" onclick={() => (step = 1)}>Back</Button>
      <Button variant="primary" onclick={start}>Start session</Button>
    {/if}
  {/snippet}
</Modal>
