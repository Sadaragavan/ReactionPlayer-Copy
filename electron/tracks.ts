/**
 * Reads the track list and the subtitle text out of a video file, because Chromium shows neither: it exposes only the
 * audio tracks (and only with the `AudioVideoTracks` feature on), and never a subtitle stream stored inside the file.
 *
 *   Matroska / WebM (.mkv, .webm): audio and subtitle tracks; text subtitles (SubRip, ASS/SSA) are extracted.
 *   MP4 / MOV (.mp4, .m4v, .mov): subtitle tracks stored as `tx3g` (what ffmpeg calls mov_text) are extracted.
 *
 * Bitmap subtitles (PGS, VobSub, DVB) are listed but cannot be shown. Only the structure of the file is read: the
 * video and audio data are skipped by seeking, so a 20 GB file is scanned in a moment, not loaded.
 * Pure Node, no Electron import.
 */
import { open, type FileHandle } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { cleanAssText, splitLimit, type Cue } from '../src/shared/subtitles';
import { extensionOf } from '../src/shared/mediaUrl';
import { PgsDecoder } from './pgs';
import type { MediaTrackInfo, SubtitleTrackInfo, AudioTrackInfo } from '../src/shared/api';

/** Reads a file through a small read-ahead window, so walking thousands of tiny headers is not thousands of reads. */
class Reader {
  #buf = Buffer.alloc(0);
  #at = 0;
  constructor(
    private readonly fh: FileHandle,
    readonly size: number
  ) {}

  async bytes(pos: number, len: number): Promise<Buffer> {
    len = Math.max(0, Math.min(len, this.size - pos));
    if (pos >= this.#at && pos + len <= this.#at + this.#buf.length) return this.#buf.subarray(pos - this.#at, pos - this.#at + len);
    const want = Math.min(Math.max(len, 64 * 1024), this.size - pos);
    const buf = Buffer.alloc(want);
    const { bytesRead } = await this.fh.read(buf, 0, want, pos);
    this.#buf = buf.subarray(0, bytesRead);
    this.#at = pos;
    return this.#buf.subarray(0, Math.min(len, bytesRead));
  }
}

const text = (b: Buffer) => b.toString('utf8').replace(/\0+$/, '');
const uint = (b: Buffer) => b.reduce((n, x) => n * 256 + x, 0);

/* ───────────────────────────── Matroska ───────────────────────────── */

const ID = {
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackType: 0x83,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Language: 0x22b59c,
  LanguageBCP47: 0x22b59d,
  Name: 0x536e,
  FlagDefault: 0x88,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
  BlockGroup: 0xa0,
  Block: 0xa1,
  BlockDuration: 0x9b,
  ContentEncodings: 0x6d80,
  ContentEncoding: 0x6240,
  ContentCompression: 0x5034,
  ContentCompAlgo: 0x4254,
  ContentCompSettings: 0x4255
} as const;

/** Elements whose children we want; every other element is skipped by its size. */
const DESCEND = new Set<number>([ID.Segment, ID.Info, ID.Tracks, ID.TrackEntry, ID.Cluster, ID.BlockGroup, ID.ContentEncodings, ID.ContentEncoding, ID.ContentCompression]);

interface Header {
  id: number;
  /** -1 for an unknown size. */
  size: number;
  /** Where the payload starts. */
  data: number;
}

async function header(r: Reader, pos: number): Promise<Header | null> {
  const b = await r.bytes(pos, 12);
  if (b.length < 2) return null;
  const idLen = 1 + Math.clz32(b[0]) - 24;
  if (idLen > 4 || idLen < 1) return null;
  const id = uint(b.subarray(0, idLen));
  if (b.length < idLen + 1) return null;
  const sLen = 1 + Math.clz32(b[idLen]) - 24;
  if (sLen > 8 || b.length < idLen + sLen) return null;
  let size = b[idLen] & (0xff >> sLen);
  let allOnes = size === 0xff >> sLen;
  for (let i = 1; i < sLen; i++) {
    size = size * 256 + b[idLen + i];
    if (b[idLen + i] !== 0xff) allOnes = false;
  }
  return { id, size: allOnes ? -1 : size, data: pos + idLen + sLen };
}

interface MkvTrack {
  number: number;
  type: number;
  codec: string;
  language: string;
  name: string;
  isDefault: boolean;
  codecPrivate?: Buffer;
  /** ContentCompression: 0 = zlib, 3 = a stripped header put back in front of every block. */
  compAlgo?: number;
  compSettings?: Buffer;
}

const TEXT_CODECS = new Set(['S_TEXT/UTF8', 'S_TEXT/ASCII', 'S_TEXT/ASS', 'S_TEXT/SSA', 'S_ASS', 'S_SSA']);
const PGS = 'S_HDMV/PGS';
const isAss = (codec: string) => /ASS|SSA/.test(codec);

/**
 * Walks the file once. `want` is the subtitle track to extract (omit it to read only the track list, which stops at the
 * first cluster). Elements are walked flat: the ones in DESCEND are entered, the rest skipped, which also copes with
 * clusters of unknown size.
 */
async function walkMatroska(path: string, want?: number): Promise<{ tracks: MkvTrack[]; cues: Cue[] }> {
  const fh = await open(path, 'r');
  try {
    const r = new Reader(fh, (await fh.stat()).size);
    const tracks: MkvTrack[] = [];
    const cues: Cue[] = [];
    let scale = 1_000_000;
    let current: MkvTrack | null = null;
    let entryEnd = -1;
    let clusterTime = 0;
    let lastCue: Cue | null = null;
    let wantAss = false;
    let pgs: PgsDecoder | null = null;
    let pos = 0;

    while (pos < r.size) {
      if (current && entryEnd >= 0 && pos >= entryEnd) {
        tracks.push(current);
        current = null;
      }
      const h = await header(r, pos);
      if (!h) break;
      const end = h.size < 0 ? r.size : h.data + h.size;

      if (h.id === ID.Cluster && want === undefined) break; // the track list is before the first cluster
      if (h.id === ID.TrackEntry) {
        if (current) tracks.push(current);
        current = { number: 0, type: 0, codec: '', language: 'eng', name: '', isDefault: false };
        entryEnd = end;
        pos = h.data;
        continue;
      }
      if (DESCEND.has(h.id)) {
        pos = h.data;
        continue;
      }

      const small = h.size >= 0 && h.size <= 4096 && h.id !== ID.SimpleBlock && h.id !== ID.Block;
      if (small) {
        const b = await r.bytes(h.data, h.size);
        switch (h.id) {
          case ID.TimecodeScale:
            scale = uint(b) || scale;
            break;
          case ID.Timecode:
            clusterTime = uint(b);
            break;
          case ID.TrackNumber:
            if (current) current.number = uint(b);
            break;
          case ID.TrackType:
            if (current) current.type = uint(b);
            break;
          case ID.CodecID:
            if (current) current.codec = text(b);
            break;
          case ID.Language:
            if (current && current.language === 'eng') current.language = text(b);
            break;
          case ID.LanguageBCP47:
            if (current) current.language = text(b);
            break;
          case ID.Name:
            if (current) current.name = text(b);
            break;
          case ID.FlagDefault:
            if (current) current.isDefault = uint(b) === 1;
            break;
          case ID.CodecPrivate:
            if (current) current.codecPrivate = Buffer.from(b);
            break;
          case ID.ContentCompAlgo:
            if (current) current.compAlgo = uint(b);
            break;
          case ID.ContentCompSettings:
            if (current) current.compSettings = Buffer.from(b);
            break;
          case ID.BlockDuration:
            if (lastCue && want !== undefined) lastCue.end = lastCue.start + (uint(b) * scale) / 1e9;
            break;
        }
      } else if ((h.id === ID.SimpleBlock || h.id === ID.Block) && want !== undefined && h.size > 4) {
        // A BlockDuration belongs to the block just before it, so a block of another track must not leave `lastCue` behind.
        lastCue = null;
        const head = await r.bytes(h.data, 4);
        const tLen = 1 + Math.clz32(head[0]) - 24;
        const track = uint(head.subarray(0, tLen)) & (0xff >> tLen);
        if (track === want) {
          if (!wantAss && tracks.length) wantAss = isAss(tracks.find((t) => t.number === want)?.codec ?? '');
          const info = tracks.find((t) => t.number === want);
          const payload = unpack(await r.bytes(h.data + tLen + 3, h.size - tLen - 3), info);
          const rel = (head[tLen] << 8) | head[tLen + 1];
          const signed = rel > 0x7fff ? rel - 0x10000 : rel;
          const start = ((clusterTime + signed) * scale) / 1e9;
          if (info?.codec === PGS) {
            const rel0 = (head[tLen] << 8) | head[tLen + 1];
            pgs ??= new PgsDecoder();
            pgs.feed(((clusterTime + (rel0 > 0x7fff ? rel0 - 0x10000 : rel0)) * scale) / 1e9, payload);
            pos = end;
            continue;
          }
          const raw = text(Buffer.from(payload));
          let clean: { text: string; italic: boolean; pos?: Cue['pos'] } | null;
          if (wantAss) clean = cleanAssText(splitLimit(raw, ',', 8)[8] ?? '');
          else {
            const t = raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).join('\n').replace(/<\/?[a-z][^>]*>/gi, '');
            clean = t ? { text: t, italic: false } : null;
          }
          if (clean) {
            const cue: Cue = { start, end: start + 4, text: clean.text, ...(clean.italic ? { italic: true } : {}), ...(clean.pos ? { pos: clean.pos } : {}) };
            lastCue = cue;
            cues.push(cue);
          }
        }
      }
      pos = end;
    }
    if (current) tracks.push(current);
    if (pgs) cues.push(...(pgs as PgsDecoder).finish());
    return { tracks, cues: cues.sort((a, b) => a.start - b.start) };
  } finally {
    await fh.close();
  }
}

const label = (t: MkvTrack, n: number) => t.name || `Track ${n}`;

/** Codecs Chromium cannot decode: a file whose only audio is one of these plays in silence. */
const UNPLAYABLE_AUDIO = /^(A_(AC3|EAC3|DTS|TRUEHD|MLP)|ac-3|ec-3|dts[cehl]|mlpa)/i;

/** A block's payload with the track's ContentCompression undone (zlib, or a header the muxer stripped). */
function unpack(payload: Buffer, track: MkvTrack | undefined): Buffer {
  if (track?.compAlgo === 0) {
    try {
      return inflateSync(payload);
    } catch {
      return payload;
    }
  }
  if (track?.compAlgo === 3 && track.compSettings) return Buffer.concat([track.compSettings, payload]);
  return Buffer.from(payload);
}

function describeMkv(tracks: MkvTrack[]): MediaTrackInfo {
  const audio: AudioTrackInfo[] = tracks
    .filter((t) => t.type === 2)
    .map((t, i) => ({ index: i, label: label(t, i + 1), language: t.language, isDefault: t.isDefault, codec: t.codec, playable: !UNPLAYABLE_AUDIO.test(t.codec) }));
  const subtitles: SubtitleTrackInfo[] = tracks
    .filter((t) => t.type === 17)
    .map((t, i) => ({ track: t.number, label: label(t, i + 1), language: t.language, codec: t.codec, isDefault: t.isDefault, supported: TEXT_CODECS.has(t.codec) || t.codec === PGS }));
  return { audio, subtitles, videoCodec: tracks.find((t) => t.type === 1)?.codec };
}

/* ───────────────────────────── MP4 / MOV ───────────────────────────── */

interface Box {
  type: string;
  start: number;
  data: number;
  end: number;
}

function boxes(buf: Buffer, from = 0, to = buf.length): Box[] {
  const out: Box[] = [];
  let p = from;
  while (p + 8 <= to) {
    let size = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    let data = p + 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(p + 8));
      data = p + 16;
    } else if (size === 0) size = to - p;
    if (size < 8 || p + size > to) break;
    out.push({ type, start: p, data, end: p + size });
    p += size;
  }
  return out;
}
const child = (buf: Buffer, parent: Box, type: string) => boxes(buf, parent.data, parent.end).find((b) => b.type === type);

interface Mp4Sub {
  id: number;
  language: string;
  name: string;
  format: string;
  timescale: number;
  times: { start: number; duration: number }[];
  offsets: { pos: number; size: number }[];
}

/** The `moov` box holds every track's sample tables. */
async function readMoov(r: Reader): Promise<Buffer | null> {
  let pos = 0;
  while (pos + 8 <= r.size) {
    const head = await r.bytes(pos, 16);
    let size = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    let hdr = 8;
    if (size === 1) {
      size = Number(head.readBigUInt64BE(8));
      hdr = 16;
    } else if (size === 0) size = r.size - pos;
    if (size < 8) return null;
    if (type === 'moov') {
      if (size > 256 * 1024 * 1024) return null;
      return Buffer.from(await r.bytes(pos + hdr, size - hdr));
    }
    pos += size;
  }
  return null;
}

function parseMp4Subtitles(moov: Buffer): Mp4Sub[] {
  const out: Mp4Sub[] = [];
  for (const trak of boxes(moov).filter((b) => b.type === 'trak')) {
    const tkhd = child(moov, trak, 'tkhd');
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    if (!tkhd || !mdia || !hdlr) continue;
    const handler = moov.toString('latin1', hdlr.data + 8, hdlr.data + 12);
    if (!['sbtl', 'text', 'subt'].includes(handler)) continue;
    const mdhd = child(moov, mdia, 'mdhd')!;
    const v1 = moov[mdhd.data] === 1;
    const timescale = moov.readUInt32BE(mdhd.data + (v1 ? 20 : 12));
    const lang = moov.readUInt16BE(mdhd.data + (v1 ? 32 : 20));
    const language = String.fromCharCode(((lang >> 10) & 31) + 0x60, ((lang >> 5) & 31) + 0x60, (lang & 31) + 0x60);
    const name = text(moov.subarray(hdlr.data + 24, hdlr.end)).replace(/^[\x00-\x1f]+/, '').trim();
    const minf = child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    if (!stbl) continue;
    const stsd = child(moov, stbl, 'stsd');
    const format = stsd ? moov.toString('latin1', stsd.data + 12, stsd.data + 16) : '';
    const stts = child(moov, stbl, 'stts');
    const stsz = child(moov, stbl, 'stsz');
    const stsc = child(moov, stbl, 'stsc');
    const stco = child(moov, stbl, 'stco');
    const co64 = child(moov, stbl, 'co64');
    if (!stts || !stsz || !stsc || !(stco || co64)) continue;

    const times: Mp4Sub['times'] = [];
    let t = 0;
    for (let i = 0, n = moov.readUInt32BE(stts.data + 4), p = stts.data + 8; i < n; i++, p += 8) {
      const count = moov.readUInt32BE(p);
      const delta = moov.readUInt32BE(p + 4);
      for (let k = 0; k < count; k++) {
        times.push({ start: t, duration: delta });
        t += delta;
      }
    }
    const fixed = moov.readUInt32BE(stsz.data + 4);
    const count = moov.readUInt32BE(stsz.data + 8);
    const sizes = Array.from({ length: count }, (_, i) => (fixed ? fixed : moov.readUInt32BE(stsz.data + 12 + i * 4)));
    const chunks: number[] = [];
    const co = (stco ?? co64)!;
    for (let i = 0, n = moov.readUInt32BE(co.data + 4); i < n; i++) chunks.push(stco ? moov.readUInt32BE(co.data + 8 + i * 4) : Number(moov.readBigUInt64BE(co.data + 8 + i * 8)));
    const runs: { first: number; per: number }[] = [];
    for (let i = 0, n = moov.readUInt32BE(stsc.data + 4); i < n; i++) runs.push({ first: moov.readUInt32BE(stsc.data + 8 + i * 12), per: moov.readUInt32BE(stsc.data + 12 + i * 12) });
    const offsets: Mp4Sub['offsets'] = [];
    let sample = 0;
    for (let c = 0; c < chunks.length && sample < sizes.length; c++) {
      const run = [...runs].reverse().find((x) => x.first <= c + 1);
      let off = chunks[c];
      for (let k = 0; k < (run?.per ?? 1) && sample < sizes.length; k++, sample++) {
        offsets.push({ pos: off, size: sizes[sample] });
        off += sizes[sample];
      }
    }
    out.push({ id: moov.readUInt32BE(tkhd.data + (moov[tkhd.data] === 1 ? 20 : 12)), language, name, format, timescale, times, offsets });
  }
  return out;
}

const mp4Label = (t: { name: string }, n: number) => (t.name && !/handler|SubtitleHandler|Text/i.test(t.name) ? t.name : `Track ${n}`);

/** Handler, sample format, language and name of every track: enough to list the audio and name the video codec. */
function mp4Streams(moov: Buffer): { handler: string; format: string; language: string; name: string }[] {
  const out: { handler: string; format: string; language: string; name: string }[] = [];
  for (const trak of boxes(moov).filter((b) => b.type === 'trak')) {
    const mdia = child(moov, trak, 'mdia');
    const hdlr = mdia && child(moov, mdia, 'hdlr');
    const mdhd = mdia && child(moov, mdia, 'mdhd');
    const minf = mdia && child(moov, mdia, 'minf');
    const stbl = minf && child(moov, minf, 'stbl');
    const stsd = stbl && child(moov, stbl, 'stsd');
    if (!hdlr || !mdhd || !stsd) continue;
    const v1 = moov[mdhd.data] === 1;
    const lang = moov.readUInt16BE(mdhd.data + (v1 ? 32 : 20));
    out.push({
      handler: moov.toString('latin1', hdlr.data + 8, hdlr.data + 12),
      format: moov.toString('latin1', stsd.data + 12, stsd.data + 16),
      language: String.fromCharCode(((lang >> 10) & 31) + 0x60, ((lang >> 5) & 31) + 0x60, (lang & 31) + 0x60),
      name: text(moov.subarray(hdlr.data + 24, hdlr.end)).replace(/^[\x00-\x1f]+/, '').trim()
    });
  }
  return out;
}

async function describeMp4(r: Reader): Promise<MediaTrackInfo> {
  const moov = await readMoov(r);
  const subs = moov ? parseMp4Subtitles(moov) : [];
  const streams = moov ? mp4Streams(moov) : [];
  const audio: AudioTrackInfo[] = streams
    .filter((t) => t.handler === 'soun')
    .map((t, i) => ({ index: i, label: mp4Label(t, i + 1), language: t.language, isDefault: i === 0, codec: t.format, playable: !UNPLAYABLE_AUDIO.test(t.format) }));
  return {
    audio,
    videoCodec: streams.find((t) => t.handler === 'vide')?.format,
    subtitles: subs.map((t, i) => ({ track: t.id, label: mp4Label(t, i + 1), language: t.language, codec: t.format, isDefault: i === 0, supported: t.format === 'tx3g' }))
  };
}

async function extractMp4(r: Reader, id: number): Promise<Cue[]> {
  const moov = await readMoov(r);
  const track = moov && parseMp4Subtitles(moov).find((t) => t.id === id);
  if (!track || track.format !== 'tx3g') return [];
  const cues: Cue[] = [];
  for (let i = 0; i < track.offsets.length && i < track.times.length; i++) {
    const { pos, size } = track.offsets[i];
    if (size < 2) continue;
    const b = await r.bytes(pos, size);
    const len = b.readUInt16BE(0);
    const raw = text(Buffer.from(b.subarray(2, 2 + len))).replace(/\r\n?/g, '\n');
    const t = raw.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
    if (t) cues.push({ start: track.times[i].start / track.timescale, end: (track.times[i].start + track.times[i].duration) / track.timescale, text: t });
  }
  return cues;
}

/* ───────────────────────────── entry points ───────────────────────────── */

const MKV = ['mkv', 'webm', 'mka'];
const MP4 = ['mp4', 'm4v', 'mov'];

/** The audio and subtitle tracks stored in a video file. Empty for a container this does not read. Never throws. */
export async function probeTracks(path: string): Promise<MediaTrackInfo> {
  const ext = extensionOf(path);
  try {
    if (MKV.includes(ext)) return describeMkv((await walkMatroska(path)).tracks);
    if (MP4.includes(ext)) {
      const fh = await open(path, 'r');
      try {
        return await describeMp4(new Reader(fh, (await fh.stat()).size));
      } finally {
        await fh.close();
      }
    }
  } catch {
    /* unreadable: report no tracks */
  }
  return { audio: [], subtitles: [] };
}

/** The cues of one subtitle track (`track` is the number `probeTracks` gave). Empty when it cannot be read. Never throws. */
export async function extractSubtitles(path: string, track: number): Promise<Cue[]> {
  const ext = extensionOf(path);
  try {
    if (MKV.includes(ext)) {
      const { cues } = await walkMatroska(path, track);
      // A cue without a BlockDuration ends where the next one starts (or after four seconds).
      for (let i = 0; i < cues.length - 1; i++) if (cues[i].end - cues[i].start === 4 && cues[i + 1].start < cues[i].end) cues[i].end = cues[i + 1].start;
      return cues;
    }
    if (MP4.includes(ext)) {
      const fh = await open(path, 'r');
      try {
        return await extractMp4(new Reader(fh, (await fh.stat()).size), track);
      } finally {
        await fh.close();
      }
    }
  } catch {
    /* unreadable */
  }
  return [];
}
