<script lang="ts">
  /**
   * “Add a source”: another episode for the source layer. It comes from a file, a drop or a pasted link, is read for
   * its length, and joins the end of the playlist. It waits on its first frame until it is started.
   */
  import { untrack } from 'svelte';
  import { pickVideoFiles, pickedUrl, releasePickedUrl, type PickedFile } from '$lib/engine/media';
  import { probeVideo } from '$lib/engine/probe';
  import { session } from '$lib/stores/session.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { titleFromFileName } from '$lib/utils/file';
  import Button from '../ui/Button.svelte';
  import Modal from '../ui/Modal.svelte';
  import VideoSlot, { type SlotData } from '../home/VideoSlot.svelte';

  let slot = $state<SlotData | null>(null);
  let picked: PickedFile | null = null;

  $effect(() => {
    if (!ui.addSourceOpen) return;
    untrack(() => {
      slot = null;
      picked = null;
    });
  });

  const close = () => (ui.addSourceOpen = false);
  const ready = $derived(!!slot && !slot.busy && !slot.error);

  async function load(base: SlotData, src: string) {
    slot = { ...base, busy: true };
    const same = () => slot?.file === base.file && slot?.url === base.url;
    try {
      const r = await probeVideo(src);
      if (same()) slot = { ...base, duration: r.duration, width: r.width, height: r.height, thumb: r.thumb };
    } catch (err) {
      if (same()) slot = { ...base, error: err instanceof Error ? err.message : 'Couldn’t read this video.' };
    }
  }

  async function setFile(p: PickedFile) {
    picked = p;
    const src = pickedUrl(p);
    try {
      await load({ title: titleFromFileName(p.name), kind: 'file', url: '', file: p.file, path: p.path, handle: p.handle, fileName: p.name, fileSize: p.size }, src);
    } finally {
      releasePickedUrl(p, src);
    }
  }

  async function setUrl(raw: string) {
    let u: URL;
    try {
      u = new URL(raw);
      if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
    } catch {
      ui.toast('That isn’t a web link. It should start with https://', 'error');
      return;
    }
    picked = null;
    const tail = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '') || u.hostname;
    await load({ title: titleFromFileName(tail), kind: 'url', url: u.href }, u.href);
  }

  async function choose() {
    const [p] = await pickVideoFiles(false);
    if (p) await setFile(p);
  }

  function add() {
    if (!slot || !ready) return;
    const id = session.addSource({ title: slot.title, kind: slot.kind, url: slot.url, duration: slot.duration, picked: picked ?? undefined, fileName: slot.fileName, fileSize: slot.fileSize });
    if (!id) return ui.toast('There’s no source to add to.', 'error');
    ui.toast(`Added “${slot.title}” to the sources.`, 'success');
    close();
  }
</script>

<Modal open={ui.addSourceOpen} onclose={close} title="Add a source" width="max-w-lg">
  <div class="space-y-3 p-5">
    <VideoSlot
      role="source"
      label="Next source"
      hint="Plays in the source layer after the sources before it. It waits on its first frame until you start it (N)."
      {slot}
      onchoose={choose}
      onfiles={(files) => files[0] && setFile(files[0])}
      onurl={setUrl}
      onclear={() => (slot = null)}
    />
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!ready} onclick={add}>Add to sources</Button>
  {/snippet}
</Modal>
