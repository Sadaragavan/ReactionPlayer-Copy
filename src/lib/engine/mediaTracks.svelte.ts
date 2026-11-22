/**
 * What is stored in each video file: its audio tracks (and whether Chromium can decode them), its subtitle tracks, subtitle
 * files beside it, and its video codec. Read once per file by the main process (`electron/tracks.ts`); empty in a browser.
 */
import type { AudioTrackInfo, SubtitleTrackInfo } from '../../shared/api';
import { desktop } from '../platform';
import type { ID } from '../types';

export interface TrackProbe {
  audio: AudioTrackInfo[];
  subtitles: SubtitleTrackInfo[];
  sidecars: { path: string; name: string }[];
  videoCodec?: string;
}

class MediaTracks {
  /** By media id. `undefined` until the file has been read. */
  probes = $state<Record<ID, TrackProbe>>({});
  #started = new Set<string>();

  /** Reads the track list of a local video once. Resolves when it is stored in `probes`. */
  async prefetch(mediaId: ID, path: string | undefined): Promise<TrackProbe | undefined> {
    if (!desktop || !path) return undefined;
    const key = `${mediaId}|${path}`;
    if (!this.#started.has(key)) {
      this.#started.add(key);
      try {
        const info = await desktop.subtitles.probe(path);
        this.probes[mediaId] = { audio: info.audio, subtitles: info.subtitles, sidecars: info.sidecars, videoCodec: info.videoCodec };
      } catch {
        /* nothing listed: the menus fall back to what Chromium reports */
      }
    }
    return this.probes[mediaId];
  }
}

export const mediaTracks = new MediaTracks();

/** A readable name for a container's video codec id. */
export function videoCodecName(codec: string | undefined): string {
  if (!codec) return '';
  if (/HEVC|hvc1|hev1/i.test(codec)) return 'HEVC (H.265)';
  if (/AVC|avc1/i.test(codec)) return 'H.264';
  if (/AV1|av01/i.test(codec)) return 'AV1';
  if (/VP9|vp09/i.test(codec)) return 'VP9';
  if (/VP8/i.test(codec)) return 'VP8';
  return codec;
}
