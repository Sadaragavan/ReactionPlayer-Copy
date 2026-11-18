<script lang="ts">
  /**
   * New Session stepper.
   *   1 · Videos   a source, a reaction and (Pro) two extra angles: drop, browse or paste a link
   *   2 · Layout   split / grid / corner or a preset, canvas shape, linked or free timelines
   * Opened from the dock, or by dropping files on Home (`ui.newSessionFiles` pre-fills the slots).
   */
  import { untrack } from 'svelte';
  import { ArrowLeft, ArrowRight, Sparkles } from '@lucide/svelte';
  import { demoSessionInput, warmDemoClips } from '$lib/engine/demo';
  import { pickVideoFiles, type PickedFile } from '$lib/engine/media';
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
  let layout = $state<Exclude<LayoutType, 'custom'>>('split');
  let preset = $state<Preset | null>(null);
  let canvas = $state<CanvasAspect>('16:9');
  let linked = $state(true);
  let name = $state('');

  const maxVideos = $derived(settings.limits.maxVideos);
  const filled = $derived(slots.filter((s): s is SlotData => s !== null));
  const good = (s: SlotData | null) => !!s && !s.busy && !s.error;
  const ready = $derived(good(slots[0]) && good(slots[1]) && filled.every((s) => !s.busy && !s.error));
  const oversize = $derived(filled.some((s) => Math.min(s.width ?? 0, s.height ?? 0) > settings.limits.maxResolution));

  // Every time the dialog opens it starts clean, then takes any files dropped on Home.
  $effect(() => {
    if (!ui.newSessionOpen) return;
    untrack(() => {
      step = 1;
      slots = [null, null, null, null];
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
  async function load(i: number, base: SlotData, src: string) {
    slots[i] = { ...base, busy: true };
    const same = () => slots[i]?.file === base.file && slots[i]?.url === base.url;
    try {
      const r = await probeVideo(src);
      if (same()) slots[i] = { ...base, duration: r.duration, width: r.width, height: r.height, thumb: r.thumb };
    } catch (err) {
      if (same()) slots[i] = { ...base, error: err instanceof Error ? err.message : 'Could not read this video.' };
    }
  }

  async function setFile(i: number, p: PickedFile) {
    const blobUrl = URL.createObjectURL(p.file);
    try {
      await load(i, { title: titleFromFileName(p.file.name), kind: 'file', url: '', file: p.file, handle: p.handle, fileName: p.file.name, fileSize: p.file.size }, blobUrl);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function setUrl(i: number, raw: string) {
    let u: URL;
    try {
      u = new URL(raw);
      if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
    } catch {
      ui.toast('That is not a web link. Start it with https://', 'error');
      return;
    }
    const tail = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '') || u.hostname;
    await load(i, { title: titleFromFileName(tail), kind: 'url', url: u.href }, u.href);
  }

  async function choose(i: number) {
    const [picked] = await pickVideoFiles(false);
    if (picked) await setFile(i, picked);
  }

  const close = () => (ui.newSessionOpen = false);

  function upgrade() {
    close();
    router.go({ name: 'settings', tab: 'subscription' });
  }

  function start() {
    const videos: NewVideoInput[] = filled.map((s) => ({
      title: s.title,
      kind: s.kind,
      url: s.kind === 'url' ? s.url : '',
      file: s.file,
      handle: s.handle,
      fileName: s.fileName,
      fileSize: s.fileSize,
      duration: s.duration
    }));
    session.create({
      name: name.trim() || undefined,
      videos,
      layout: preset ? { preset: $state.snapshot(preset) as Preset } : layout,
      linked,
      masterPolicy: settings.playback.masterAudio,
      canvasAspect: canvas
    });
    close();
    router.go('session');
  }

  async function demo() {
    await warmDemoClips();
    session.create(demoSessionInput(settings.settings.defaultLayout, settings.playback.masterAudio, settings.playback.autoLink));
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
            hint={HINTS[i]}
            {slot}
            locked={i >= maxVideos}
            onchoose={() => choose(i)}
            onfiles={(files) => files[0] && setFile(i, files[0])}
            onurl={(u) => setUrl(i, u)}
            onclear={() => (slots[i] = null)}
            onupgrade={upgrade}
          />
        {/each}
      </div>
      {#if oversize}
        <p class="mt-3 text-[12.5px] text-fg-3">
          Free plays up to {settings.limits.maxResolution}p smoothly. Pro opens 4K.
        </p>
      {/if}
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
