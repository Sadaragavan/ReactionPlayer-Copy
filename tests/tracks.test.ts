import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractSubtitles, probeTracks } from '../electron/tracks';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('Matroska', () => {
  it('lists every audio track, with names and languages', async () => {
    const info = await probeTracks(fixture('subs.mkv'));
    expect(info.audio).toEqual([
      { index: 0, label: 'English', language: 'eng', isDefault: expect.any(Boolean), codec: 'A_AAC', playable: true },
      { index: 1, label: 'Japanese', language: 'jpn', isDefault: expect.any(Boolean), codec: 'A_AAC', playable: true }
    ]);
    expect(info.videoCodec).toBe('V_MPEG4/ISO/AVC');
  });

  it('lists the subtitle tracks and whether they can be shown', async () => {
    const { subtitles } = await probeTracks(fixture('subs.mkv'));
    expect(subtitles.map((s) => [s.label, s.language, s.codec, s.supported])).toEqual([
      ['English subs', 'eng', 'S_TEXT/UTF8', true],
      ['Signs', 'jpn', 'S_TEXT/ASS', true]
    ]);
  });

  it('extracts SubRip text with its timing', async () => {
    const { subtitles } = await probeTracks(fixture('subs.mkv'));
    const cues = await extractSubtitles(fixture('subs.mkv'), subtitles[0].track);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ text: 'Hello <i>world</i>'.replace(/<\/?i>/g, ''), start: 1 });
    expect(cues[0].end).toBeCloseTo(3, 2);
    expect(cues[1]).toMatchObject({ text: 'Second line\nwith two rows' });
    expect(cues[1].start).toBeCloseTo(4, 2);
    expect(cues[1].end).toBeCloseTo(6.5, 2);
  });

  it('extracts ASS text, dropping the override tags and keeping the position', async () => {
    const { subtitles } = await probeTracks(fixture('subs.mkv'));
    const cues = await extractSubtitles(fixture('subs.mkv'), subtitles[1].track);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ text: 'Konnichiwa\nsekai', pos: 'top', italic: true });
    expect(cues[0].start).toBeCloseTo(1.5, 2);
    expect(cues[1].text).toBe('Plain ASS line');
  });

  it('returns nothing for a track that does not exist', async () => {
    expect(await extractSubtitles(fixture('subs.mkv'), 99)).toEqual([]);
  });
});

describe('audio Chromium cannot decode', () => {
  it('flags AC-3 in an MKV as not playable', async () => {
    const info = await probeTracks(fixture('ac3.mkv'));
    expect(info.audio).toEqual([expect.objectContaining({ codec: 'A_AC3', playable: false })]);
  });
});

describe('MP4', () => {
  it('lists the audio track and the video codec', async () => {
    const info = await probeTracks(fixture('subs.mp4'));
    expect(info.audio).toEqual([expect.objectContaining({ index: 0, codec: 'mp4a', playable: true, language: 'eng' })]);
    expect(info.videoCodec).toBe('avc1');
  });

  it('lists and extracts a mov_text subtitle track', async () => {
    const { subtitles } = await probeTracks(fixture('subs.mp4'));
    expect(subtitles).toHaveLength(1);
    expect(subtitles[0]).toMatchObject({ codec: 'tx3g', supported: true, language: 'eng' });
    const cues = await extractSubtitles(fixture('subs.mp4'), subtitles[0].track);
    expect(cues.map((c) => c.text)).toEqual(['Hello world', 'Second line\nwith two rows']);
    expect(cues[0].start).toBeCloseTo(1, 1);
    expect(cues[1].start).toBeCloseTo(4, 1);
  });
});

describe('anything else', () => {
  it('reports no tracks instead of throwing', async () => {
    expect(await probeTracks(fixture('a.srt'))).toEqual({ audio: [], subtitles: [] });
    expect(await probeTracks('/no/such/file.mkv')).toEqual({ audio: [], subtitles: [] });
    expect(await extractSubtitles('/no/such/file.mp4', 1)).toEqual([]);
  });
});

describe('picture subtitles (PGS) in a Matroska file', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { subtitleMkv } = await import('./helpers/mkvBuilder');
  const { clearSet, displaySet } = await import('./helpers/pgsBuilder');
  const pal = { 1: [235, 128, 128, 255] as [number, number, number, number] };
  const set = displaySet({ width: 1920, height: 1080, palette: pal, objects: [{ id: 1, x: 100, y: 900, w: 4, h: 2, px: [1, 1, 1, 1, 0, 1, 1, 0] }] });

  for (const zlib of [false, true]) {
    it(`lists and extracts it${zlib ? ' when the muxer compressed every block with zlib' : ''}`, async () => {
      const dir = await mkdtemp(join(tmpdir(), 'rp-pgs-'));
      const file = join(dir, 'pgs.mkv');
      await writeFile(file, subtitleMkv('S_HDMV/PGS', [{ ms: 1000, data: set }, { ms: 3500, data: clearSet(1920, 1080) }], { zlib }));
      try {
        const info = await probeTracks(file);
        expect(info.subtitles).toEqual([expect.objectContaining({ track: 1, codec: 'S_HDMV/PGS', supported: true, label: 'English' })]);
        const cues = await extractSubtitles(file, 1);
        expect(cues).toHaveLength(1);
        expect(cues[0]).toMatchObject({ start: 1, end: 3.5, text: '', frame: { w: 1920, h: 1080 } });
        expect(cues[0].images?.[0]).toMatchObject({ x: 100, y: 900, w: 4, h: 2 });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
});
