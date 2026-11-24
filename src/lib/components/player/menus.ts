/**
 * Menu builders for the player. Menus are plain data (see MenuEntry), built at
 * the moment they open; entries that show a live value (a stepper) read the
 * stores again whenever the panel re-renders, so a nudge is visible at once.
 */
import {
  ArrowDownToLine,
  ArrowUpToLine,
  AudioLines,
  ChevronDown,
  Captions,
  Save,
  ChevronUp,
  Copy,
  ListPlus,
  Gauge,
  LayoutGrid,
  Lock,
  LockOpen,
  Maximize,
  Ratio,
  RectangleHorizontal,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX
} from '@lucide/svelte';
import { ASPECT_OPTIONS, CANVAS_ASPECTS, OFFSET_STEPS, PLAYBACK_RATES } from '$lib/constants';
import { setAspect } from '$lib/engine/aspect';
import { captureErrorMessage } from '$lib/engine/capture';
import { playback } from '$lib/engine/playback.svelte';
import { session } from '$lib/stores/session.svelte';
import { ui } from '$lib/stores/ui.svelte';
import { saveLayoutAsPreset } from '$lib/engine/appActions';
import { mediaTracks } from '$lib/engine/mediaTracks.svelte';
import { subtitles } from '$lib/engine/subtitles.svelte';
import { type ZOp, Z_LABEL } from '$lib/engine/zorder';
import { trackLabel } from '$lib/utils/format';
import type { ID, IconComponent, MenuEntry } from '$lib/types';
import { formatOffset } from '$lib/utils/format';
import { toggleFullscreen } from '$lib/utils/fullscreen';

type TrackList = ArrayLike<{ label: string; language: string; enabled: boolean }>;

/** Linked: the stored offset. Unlinked: how far this playhead is from the master's right now. */
function offsetMs(id: ID): number {
  const s = session.current;
  const v = session.video(id);
  if (!s || !v) return 0;
  if (s.isLinked) return v.offsetMs;
  return Math.round(((playback.times[id] ?? 0) - (playback.times[s.masterId] ?? 0)) * 1000);
}

function nudge(id: ID, ms: number): void {
  if (session.current?.isLinked) return playback.nudgeOffset(id, ms);
  playback.seekVideo(id, (playback.element(id)?.currentTime ?? 0) + ms / 1000);
}

function zeroOffset(id: ID): void {
  const s = session.current;
  if (!s) return;
  if (s.isLinked) playback.setOffset(id, 0);
  else playback.seekVideo(id, playback.times[s.masterId] ?? 0);
}

async function copyFrame(id: ID): Promise<void> {
  try {
    await playback.copyFrame(id);
    ui.toast('Frame copied.', 'success');
  } catch (err) {
    ui.toast(captureErrorMessage(err), 'error');
  }
}

function audioTracks(id: ID): TrackList | null {
  const list = (playback.element(id) as (HTMLVideoElement & { audioTracks?: TrackList }) | null)?.audioTracks;
  return list && list.length > 1 ? list : null;
}

const Z_ENTRIES: { op: ZOp; icon: IconComponent; hint: string }[] = [
  { op: 'front', icon: ArrowUpToLine, hint: 'Shift ]' },
  { op: 'forward', icon: ChevronUp, hint: ']' },
  { op: 'backward', icon: ChevronDown, hint: '[' },
  { op: 'back', icon: ArrowDownToLine, hint: 'Shift [' }
];

/** The right-click menu of one video layer. */
export function videoMenu(id: ID): MenuEntry[] {
  const s = session.current;
  const v = session.video(id);
  const t = s?.alignment.coordinates[id];
  if (!s || !v || !t) return [];
  const isMaster = s.masterId === id;
  const tracks = audioTracks(id);
  const locked = s.alignment.locked;

  return [
    { id: 'copy', label: 'Copy frame to clipboard', icon: Copy, onSelect: () => void copyFrame(id) },
    { id: 'master', label: 'Set as master audio source', icon: Volume2, checked: isMaster, onSelect: () => playback.setMaster(id) },
    isMaster
      ? { id: 'offset', label: 'Sync offset', icon: Timer, hint: 'Master clock', disabled: true }
      : {
          type: 'stepper',
          id: 'offset',
          label: s.isLinked ? 'Sync offset' : 'Nudge playhead',
          icon: Timer,
          value: () => formatOffset(offsetMs(id)),
          steps: [...OFFSET_STEPS],
          onStep: (ms: number) => nudge(id, ms),
          onReset: () => zeroOffset(id)
        },
    {
      id: 'reset',
      label: 'Reset viewport alignment',
      icon: RotateCcw,
      hint: locked ? 'Locked' : undefined,
      disabled: locked,
      onSelect: () => session.resetLayer(id)
    },
    ...(v?.role === 'source'
      ? ([{ id: 'add-source', label: 'Add another source…', icon: ListPlus, onSelect: () => (ui.addSourceOpen = true) }] as MenuEntry[])
      : []),
    { type: 'separator', id: 'sep-z' },
    ...Z_ENTRIES.map(({ op, icon, hint }) => ({
      id: `z-${op}`,
      label: Z_LABEL[op],
      icon,
      hint: locked ? 'Locked' : hint,
      disabled: !session.canReorderLayer(id, op),
      onSelect: () => session.reorderLayer(id, op)
    })),
    { type: 'separator', id: 'sep-a' },
    {
      id: 'speed',
      label: s.isLinked ? 'Speed (all videos)' : 'Speed',
      icon: Gauge,
      children: PLAYBACK_RATES.map((r) => ({
        id: `rate-${r}`,
        label: `${r}×`,
        checked: v.playbackRate === r,
        onSelect: () => session.setRate(id, r)
      }))
    },
    {
      id: 'aspect',
      label: 'Aspect ratio',
      icon: Ratio,
      disabled: locked,
      hint: locked ? 'Locked' : undefined,
      children: ASPECT_OPTIONS.map((o) => ({ id: `aspect-${o.value}`, label: o.label, checked: t.aspect === o.value, onSelect: () => setAspect(id, o.value) }))
    },
    {
      id: 'fit',
      label: t.fit === 'cover' ? 'Show whole picture' : 'Fill the viewport',
      icon: Maximize,
      onSelect: () => session.setLayer(id, { fit: t.fit === 'cover' ? 'contain' : 'cover' })
    },
    audioMenu(id),
    subtitleMenu(id),
    { id: 'mute', label: v.muted ? 'Unmute' : 'Mute', icon: v.muted ? Volume2 : VolumeX, onSelect: () => session.toggleMute(id) }
  ];
}

/**
 * The Audio track submenu. The list comes from the file's container, because Chromium hides the tracks it cannot decode
 * (AC-3, DTS…): those are listed too, and played from a converted copy. Without a container list (a browser) it is Chromium's own.
 */
function audioMenu(id: ID): MenuEntry {
  const v = session.video(id);
  const found = mediaTracks.probes[session.mediaIdOf(v ?? { id })]?.audio ?? [];
  if (found.length > 1) {
    const current = v?.audioTrack !== undefined && found[v.audioTrack] ? v.audioTrack : (found.find((t) => t.isDefault)?.index ?? 0);
    return {
      id: 'track',
      label: 'Audio track',
      icon: AudioLines,
      children: found.map((t) => ({
        id: `track-${t.index}`,
        label: trackLabel(t.label, t.language, t.index),
        hint: t.playable ? undefined : 'Converted',
        checked: current === t.index,
        onSelect: () => {
          session.setTrackChoice(id, { audioTrack: t.index });
          void playback.refreshAudio(id);
        }
      }))
    };
  }
  const tracks = audioTracks(id);
  if (!tracks) return { id: 'track', label: 'Audio track', icon: AudioLines, hint: 'Single track', disabled: true };
  return {
    id: 'track',
    label: 'Audio track',
    icon: AudioLines,
    children: Array.from(tracks, (tr, i) => ({
      id: `track-${i}`,
      label: trackLabel(tr.label, tr.language, i),
      checked: (v?.audioTrack ?? Array.from(tracks).findIndex((x) => x.enabled)) === i,
      onSelect: () => {
        Array.from(tracks).forEach((x, k) => (x.enabled = k === i));
        session.setTrackChoice(id, { audioTrack: i });
      }
    }))
  };
}

/** The Subtitles submenu: off, the tracks stored in the video, subtitle files beside it, and any file. */
function subtitleMenu(id: ID): MenuEntry {
  const v = session.video(id);
  const current = v?.subtitle;
  const found = subtitles.probeOf(session.mediaIdOf(v ?? { id }));
  const same = (a: typeof current, b: NonNullable<typeof current>) => !!a && a.kind === b.kind && a.track === b.track && a.path === b.path && a.label === b.label;

  const entries: MenuEntry[] = [{ id: 'sub-off', label: 'Off', checked: !current, onSelect: () => subtitles.choose(id, null) }];
  for (const [i, t] of (found?.subtitles ?? []).entries()) {
    const setting = { kind: 'embedded' as const, track: t.track, label: trackLabel(t.label, t.language, i) };
    entries.push({
      id: `sub-${t.track}`,
      label: setting.label,
      hint: t.supported ? undefined : 'Image-based, can’t show',
      disabled: !t.supported,
      checked: current?.kind === 'embedded' && current.track === t.track,
      onSelect: () => subtitles.choose(id, { ...setting, delayMs: current?.delayMs })
    });
  }
  for (const f of found?.sidecars ?? []) {
    const setting = { kind: 'file' as const, path: f.path, label: f.name };
    entries.push({ id: `sub-file-${f.path}`, label: f.name, checked: same(current, setting), onSelect: () => subtitles.choose(id, { ...setting, delayMs: current?.delayMs }) });
  }
  entries.push({ type: 'separator', id: 'sub-sep' }, { id: 'sub-load', label: 'Load a subtitle file…', onSelect: () => void subtitles.chooseFile(id) });
  if (current) {
    entries.push({
      type: 'stepper',
      id: 'sub-delay',
      label: 'Subtitle delay',
      value: () => formatOffset(session.video(id)?.subtitle?.delayMs ?? 0),
      steps: [-500, -100, 100, 500],
      onStep: (ms: number) => subtitles.nudge(id, ms),
      onReset: () => session.video(id)?.subtitle && session.setTrackChoice(id, { subtitle: { ...session.video(id)!.subtitle!, delayMs: 0 } })
    });
  }
  return { id: 'subtitles', label: 'Subtitles', icon: Captions, hint: current ? current.label : undefined, children: entries };
}

const LAYOUT_LABEL = { split: 'Side by side', grid: 'Stacked grid', pip: 'Picture in picture' } as const;

/** The right-click menu of the empty canvas: layout, canvas shape, lock, theater, fullscreen. */
export function stageMenu(): MenuEntry[] {
  const s = session.current;
  if (!s) return [];
  const locked = s.alignment.locked;

  return [
    {
      id: 'layout',
      label: 'Layout',
      icon: LayoutGrid,
      disabled: locked,
      hint: locked ? 'Locked' : undefined,
      children: (Object.keys(LAYOUT_LABEL) as (keyof typeof LAYOUT_LABEL)[]).map((type) => ({
        id: `layout-${type}`,
        label: LAYOUT_LABEL[type],
        checked: s.alignment.layoutType === type,
        onSelect: () => session.applyLayout(type)
      }))
    },
    {
      id: 'canvas',
      label: 'Canvas shape',
      icon: RectangleHorizontal,
      children: CANVAS_ASPECTS.map((a) => ({
        id: `canvas-${a.value}`,
        label: a.label,
        checked: s.canvasAspect === a.value,
        onSelect: () => session.setCanvasAspect(a.value)
      }))
    },
    { id: 'lock', label: locked ? 'Unlock viewports' : 'Lock viewports', icon: locked ? LockOpen : Lock, onSelect: () => session.toggleLocked() },
    {
      id: 'reset-all',
      label: 'Reset all viewports',
      icon: RotateCcw,
      disabled: locked,
      hint: locked ? 'Locked' : undefined,
      onSelect: () => s.videos.forEach((v) => session.resetLayer(v.id))
    },
    { id: 'save-preset', label: s.presetId ? 'Update layout preset' : 'Save layout as preset', icon: Save, onSelect: () => void saveLayoutAsPreset() },
    { type: 'separator', id: 'sep-stage' },
    {
      id: 'theater',
      label: s.isTheaterMode ? 'Leave theater mode' : 'Theater mode',
      icon: RectangleHorizontal,
      hint: 'T',
      onSelect: () => session.setTheater(!s.isTheaterMode)
    },
    { id: 'fullscreen', label: 'Fullscreen', icon: Maximize, hint: 'F', onSelect: () => void toggleFullscreen() }
  ];
}
