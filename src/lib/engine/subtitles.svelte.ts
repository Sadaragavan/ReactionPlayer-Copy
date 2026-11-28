/**
 * Subtitles for the player: which tracks a video holds, the cues of the track or file a layer shows, and the lookup the
 * layer asks for on every frame.
 *
 * Desktop: tracks stored in the video (MKV, WebM, MP4) and subtitle files next to it are read by the main process
 * (`electron/tracks.ts`), because Chromium exposes neither. Browser: only subtitle files picked by hand.
 */
import { cuesAt, parseSubtitleFile, SUBTITLE_EXTENSIONS, type Cue } from '../../shared/subtitles';
import { desktop } from '../platform';
import { mediaTracks } from './mediaTracks.svelte';
import { session } from '../stores/session.svelte';
import { ui } from '../stores/ui.svelte';
import type { ID, SessionVideo, SubtitleSetting } from '../types';
import { pickFiles } from '../utils/file';

class SubtitleStore {
  /** The cues each layer is showing, by layer id. Raw: a picture subtitle stream holds thousands of cues with embedded images. */
  cues = $state.raw<Record<ID, Cue[]>>({});

  /** Which setting each layer's cues were loaded for, so an unchanged layer is not read again. */
  #loaded = new Map<ID, string>();
  /** Subtitle files picked in a browser (no path to read again), by name. */
  #picked = new Map<string, Cue[]>();

  /** What is stored in (or beside) a video, for the menu. */
  probeOf(mediaId: ID) {
    return mediaTracks.probes[mediaId];
  }

  /** Loads (or clears) a layer's cues to match its subtitle setting. */
  async sync(layer: Pick<SessionVideo, 'id' | 'filePath' | 'subtitle'>): Promise<void> {
    const s = layer.subtitle;
    const key = s ? `${s.kind}|${s.track ?? ''}|${s.path ?? ''}|${s.label}|${layer.filePath ?? ''}` : '';
    if (this.#loaded.get(layer.id) === key) return;
    this.#loaded.set(layer.id, key);
    if (!s) {
      const { [layer.id]: _gone, ...rest } = this.cues;
      this.cues = rest;
      return;
    }
    let cues: Cue[] = [];
    try {
      if (s.kind === 'embedded' && desktop && layer.filePath && s.track !== undefined) cues = await desktop.subtitles.extract(layer.filePath, s.track);
      else if (s.kind === 'file' && desktop && s.path) {
        const text = await desktop.subtitles.readFile(s.path);
        cues = text === null ? [] : parseSubtitleFile(s.path, text);
      } else if (s.kind === 'file') cues = this.#picked.get(s.label) ?? [];
    } catch {
      cues = [];
    }
    // The layer may have moved on to another choice while this was reading.
    if (this.#loaded.get(layer.id) !== key) return;
    this.cues = { ...this.cues, [layer.id]: cues };
    if (!cues.length) ui.toast(`Couldn’t read any subtitles from “${s.label}”.`, 'error');
  }

  /** The lines showing on a layer at video time `t` (seconds), the layer's own delay included. */
  at(layerId: ID, t: number, delayMs = 0): Cue[] {
    const cues = this.cues[layerId];
    return cues?.length ? cuesAt(cues, t - delayMs / 1000) : [];
  }

  choose(layerId: ID, setting: SubtitleSetting | null): void {
    session.setTrackChoice(layerId, { subtitle: setting });
  }

  /** Shifts the subtitles of a layer by `ms` (positive shows them later). */
  nudge(layerId: ID, ms: number): void {
    const s = session.video(layerId)?.subtitle;
    if (s) session.setTrackChoice(layerId, { subtitle: { ...s, delayMs: (s.delayMs ?? 0) + ms } });
  }

  /** Asks for a subtitle file (.srt, .vtt, .ass, .ssa) and shows it on the layer. */
  async chooseFile(layerId: ID): Promise<void> {
    if (desktop) {
      const picked = await desktop.subtitles.pickFile();
      if (picked) this.choose(layerId, { kind: 'file', path: picked.path, label: picked.name });
      return;
    }
    const [file] = await pickFiles(SUBTITLE_EXTENSIONS.map((e) => `.${e}`).join(','), false);
    if (!file) return;
    this.#picked.set(file.name, parseSubtitleFile(file.name, await file.text()));
    this.choose(layerId, { kind: 'file', label: file.name });
  }
}

export const subtitles = new SubtitleStore();
