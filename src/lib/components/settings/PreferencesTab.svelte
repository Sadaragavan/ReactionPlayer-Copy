<script lang="ts">
  /**
   * Preferences: how playback, sync and the controls behave, and the data the
   * app keeps on this computer. Every control writes straight through to `settings`, so there
   * is no Save button; the player reads the same values live.
   */
  import { FolderOpen, Keyboard, RotateCcw, Trash } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import NumberField from '$lib/components/ui/NumberField.svelte';
  import Segmented from '$lib/components/ui/Segmented.svelte';
  import Slider from '$lib/components/ui/Slider.svelte';
  import Switch from '$lib/components/ui/Switch.svelte';
  import { playback as playbackEngine } from '$lib/engine/playback.svelte';
  import { desktop } from '$lib/platform';
  import { clearAllLocalData } from '$lib/stores/persistence';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import type { HardwareAcceleration, LayoutType, MasterAudioPolicy } from '$lib/types';
  import SettingRow from './SettingRow.svelte';
  import Section from './Section.svelte';

  const p = $derived(settings.playback);

  const MASTER: { value: MasterAudioPolicy; label: string }[] = [
    { value: 'source', label: 'Source' },
    { value: 'reaction', label: 'Reaction' }
  ];
  const ACCEL: { value: HardwareAcceleration; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' }
  ];
  const LAYOUTS: { value: Exclude<LayoutType, 'custom'>; label: string }[] = [
    { value: 'split', label: 'Side by side' },
    { value: 'grid', label: 'Stacked' },
    { value: 'pip', label: 'Corner' }
  ];
  let gpu = $state<{ videoDecode: string; rasterization: string; renderer: string } | null>(null);
  const hardwareDecode = $derived(!!gpu && gpu.videoDecode.startsWith('enabled'));
  onMount(() => {
    void desktop?.gpuStatus().then((g) => (gpu = g)).catch(() => undefined);
  });

  const SEEK = [1, 2, 5, 10, 30].map((s) => ({ value: s, label: `${s} s` }));
  const HIDE = [
    { value: 1500, label: '1.5 s' },
    { value: 2500, label: '2.5 s' },
    { value: 4000, label: '4 s' },
    { value: 8000, label: '8 s' }
  ];

  let confirm = $state<'reset' | 'wipe' | null>(null);

  function reset() {
    confirm = null;
    // The open session (if any) keeps its own placement; only app-wide preferences return to defaults.
    settings.resetSettings();
    ui.toast('Preferences are back to their defaults.', 'success');
  }

  async function wipe() {
    confirm = null;
    playbackEngine.release();
    await session.close();
    await clearAllLocalData();
    // Everything in memory is stale now: start from a clean page.
    location.hash = '#/';
    location.reload();
  }
</script>

<Section title="Sync engine" intro="How the videos are kept together while they play.">
  <SettingRow
    title="Sync tolerance"
    hint="How far a video may drift from the shared clock before the player corrects it. Lower is tighter, but the speed is nudged more often."
  >
    <div class="w-40 max-sm:flex-1">
      <Slider label="Sync tolerance in milliseconds" min={5} max={200} step={5} value={p.syncToleranceMs} oninput={(v) => settings.patchPlayback({ syncToleranceMs: v })} />
    </div>
    <NumberField
      class="w-24"
      caption="±"
      label="Sync tolerance in milliseconds"
      unit="ms"
      value={p.syncToleranceMs}
      min={5}
      max={500}
      step={5}
      digits={0}
      onchange={(v) => settings.patchPlayback({ syncToleranceMs: v })}
    />
  </SettingRow>

  <SettingRow
    title="Master audio"
    hint="Which video provides the clock and the sound when a session starts. Change it later from a video’s right-click menu."
  >
    <Segmented label="Master audio" options={MASTER} value={p.masterAudio} onchange={(v) => settings.patchPlayback({ masterAudio: v })} />
  </SettingRow>

  <SettingRow
    title="Keep the sound going"
    hint="If the master video is shorter or starts later, you hear the next video that has footage until the master picks up again."
  >
    <Switch label="Keep the sound going without the master" checked={p.audioFollowsFootage} onchange={(v) => settings.patchPlayback({ audioFollowsFootage: v })} />
  </SettingRow>

  <SettingRow
    title="Hardware acceleration"
    hint="Composites each layer on the GPU. Auto does it only while something plays. The browser always picks the decoder itself."
  >
    <Segmented label="Hardware acceleration" options={ACCEL} value={p.hardwareAcceleration} onchange={(v) => settings.patchPlayback({ hardwareAcceleration: v })} />
  </SettingRow>

  {#if gpu}
    <SettingRow
      title="Video decoding"
      hint={hardwareDecode
        ? 'The graphics chip decodes video, which leaves the processor free for the sync engine.'
        : 'The processor is decoding video. Two videos at once can stutter on a laptop; updating the graphics driver usually turns hardware decoding on.'}
    >
      <span class="text-[13px] {hardwareDecode ? 'text-fg-2' : 'text-accent'}">{hardwareDecode ? 'Hardware' : 'Software'}{gpu.renderer ? ` · ${gpu.renderer}` : ''}</span>
    </SettingRow>
  {/if}
</Section>

<Section title="Playback" intro="What a new session starts with.">
  <SettingRow title="Start linked" hint="One shared timeline for every video. Unlink to line each one up on its own.">
    <Switch label="Start new sessions linked" checked={p.autoLink} onchange={(v) => settings.patchPlayback({ autoLink: v })} />
  </SettingRow>

  <SettingRow title="Mute the other videos" hint="Off: every video is heard, the reaction as well as the source. On: new sessions play only the master's audio (change it any time from a layer's menu).">
    <Switch label="Mute every video but the master in new sessions" checked={p.muteOthers} onchange={(v) => settings.patchPlayback({ muteOthers: v })} />
  </SettingRow>

  <SettingRow title="Ask about another source" hint="When the reaction runs longer than the source by more than this, the player asks whether to add another source. 0 turns the question off.">
    <NumberField class="w-24" caption="min" label="Minutes past the source before asking" value={p.sourcePromptMinutes} min={0} max={600} step={1} digits={0} onchange={(v) => settings.patchPlayback({ sourcePromptMinutes: Math.round(v) })} />
  </SettingRow>

  <SettingRow title="Loop" hint="Start over when the shared timeline reaches its end.">
    <Switch label="Loop" checked={p.loop} onchange={(v) => settings.patchPlayback({ loop: v })} />
  </SettingRow>

  <SettingRow title="Layout" hint="How the viewports are arranged when you start a new session.">
    <Segmented label="Default layout" options={LAYOUTS} value={settings.settings.defaultLayout} onchange={(v) => settings.setDefaultLayout(v)} />
  </SettingRow>

  <SettingRow title="Arrow-key seek" hint="Left and Right jump this far. While paused they step a single frame.">
    <Segmented label="Arrow-key seek distance" options={SEEK} value={p.seekStepSec} onchange={(v) => settings.patchPlayback({ seekStepSec: v })} />
  </SettingRow>
</Section>

<Section title="Controls" intro="The bars docked to the window edges while a session plays.">
  <SettingRow title="Hide after" hint="How long the mouse can sit still before the controls fade away.">
    <Segmented label="Hide controls after" options={HIDE} value={p.hudAutoHideMs} onchange={(v) => settings.patchPlayback({ hudAutoHideMs: v })} />
  </SettingRow>

  <SettingRow title="Stay while paused" hint="Keep the controls on screen whenever nothing is playing.">
    <Switch label="Keep controls visible while paused" checked={p.keepHudWhilePaused} onchange={(v) => settings.patchPlayback({ keepHudWhilePaused: v })} />
  </SettingRow>

  <SettingRow title="Keyboard shortcuts" hint="Space, L, T, F, [ and ] for layer order, the arrows and more. Press ? anywhere to see them.">
    <Button variant="secondary" icon={Keyboard} onclick={() => (ui.shortcutsOpen = true)}>Show shortcuts</Button>
  </SettingRow>
</Section>

<Section title="This computer" intro={desktop ? 'Sessions, presets, settings and the wallpaper are plain files in the app’s data folder. Nothing leaves this computer.' : 'Sessions, presets and settings live in this browser only.'}>
  {#if desktop}
    <SettingRow title="Data folder" hint="Where settings.json, presets.json and your sessions are kept.">
      <Button variant="secondary" icon={FolderOpen} onclick={() => void desktop?.revealDataFolder()}>Open folder</Button>
    </SettingRow>
  {/if}
  <SettingRow title="Reset settings" hint="Puts every preference above back to its default. Sessions and presets stay.">
    <Button variant="secondary" icon={RotateCcw} onclick={() => (confirm = 'reset')}>Reset settings</Button>
  </SettingRow>

  <SettingRow title="Clear all data" hint="Deletes every saved session, preset, the wallpaper and your settings from this computer. Your video files are not touched.">
    <Button variant="danger" icon={Trash} onclick={() => (confirm = 'wipe')}>Clear all data</Button>
  </SettingRow>
</Section>

<Modal
  open={confirm !== null}
  onclose={() => (confirm = null)}
  title={confirm === 'wipe' ? 'Clear all data' : 'Reset settings'}
  width="max-w-md"
>
  <p class="p-5 text-fg-2">
    {#if confirm === 'wipe'}
      This removes everything Reaction Player has stored on this computer and cannot be undone. Export any session you want to keep first.
    {:else}
      Every preference on this page returns to its default. Your wallpaper, sessions and presets are kept.
    {/if}
  </p>
  {#snippet footer()}
    <Button variant="ghost" data-autofocus onclick={() => (confirm = null)}>Cancel</Button>
    {#if confirm === 'wipe'}
      <Button variant="danger" onclick={wipe}>Delete everything</Button>
    {:else}
      <Button variant="primary" onclick={reset}>Reset settings</Button>
    {/if}
  {/snippet}
</Modal>
