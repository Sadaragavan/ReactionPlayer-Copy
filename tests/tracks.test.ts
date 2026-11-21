import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extractSubtitles, probeTracks } from '../electron/tracks';

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

describe('Matroska', () => {
  it('lists every audio track, with names and languages', async () => {
    const info = await probeTracks(fixture('subs.mkv'));
    expect(info.audio).toEqual([
      { index: 0, label: 'English', language: 'eng', isDefault: expect.any(Boolean) },
      { index: 1, label: 'Japanese', language: 'jpn', isDefault: expect.any(Boolean) }
    ]);
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

describe('MP4', () => {
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
