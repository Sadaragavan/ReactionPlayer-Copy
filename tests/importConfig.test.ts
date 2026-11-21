import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/lib/engine/importConfig';
import { stackOf } from '../src/lib/engine/zorder';

const coord = (extra: object = {}) => ({ x: 0, y: 0, w: 0.5, h: 1, crop: { t: 0, r: 0, b: 0, l: 0 }, opacity: 1, fit: 'contain', aspect: 'auto', ...extra });
const config = (coords: Record<string, object>, videos: object[] = [{ id: 'a', kind: 'file', title: 'A' }, { id: 'b', kind: 'file', title: 'B' }]) => ({
  app: 'reaction-player',
  version: 1,
  session: { name: 'S', masterId: 'a', videos, alignment: { layoutType: 'custom', coordinates: coords } }
});

describe('parseConfig', () => {
  it('reads zIndex from a new file', () => {
    const s = parseConfig(config({ a: coord({ zIndex: 0 }), b: coord({ zIndex: 1 }) }))!;
    const [a, b] = s.videos;
    expect(s.alignment.coordinates[a.id].zIndex).toBeLessThan(s.alignment.coordinates[b.id].zIndex);
  });

  it('gives an old file the source-on-top stacking', () => {
    const s = parseConfig(config({ a: coord(), b: coord() }))!;
    const ids = s.videos.map((v) => v.id);
    const z = Object.fromEntries(ids.map((id) => [id, s.alignment.coordinates[id].zIndex]));
    expect(stackOf(ids, z)).toEqual([ids[1], ids[0]]);
  });

  it('keeps hidden and locked layers, and turns an old opacity of 0 into hidden', () => {
    const s = parseConfig(config({ a: coord({ zIndex: 1, locked: true }), b: coord({ zIndex: 0, opacity: 0 }) }))!;
    const [a, b] = s.videos;
    expect(s.alignment.coordinates[a.id].locked).toBe(true);
    expect(s.alignment.coordinates[b.id]).toMatchObject({ hidden: true, opacity: 1 });
  });

  it('clamps a hostile zIndex into a compact stack', () => {
    const s = parseConfig(config({ a: coord({ zIndex: 1e12 }), b: coord({ zIndex: 'x' }) }))!;
    for (const v of s.videos) expect([0, 1]).toContain(s.alignment.coordinates[v.id].zIndex);
  });

  it('keeps a local video’s path only if it looks like a video file', () => {
    const s = parseConfig(
      config({}, [
        { id: 'a', kind: 'file', title: 'A', filePath: '/clips/a.mp4' },
        { id: 'b', kind: 'file', title: 'B', filePath: '/etc/passwd' }
      ])
    )!;
    expect(s.videos[0].filePath).toBe('/clips/a.mp4');
    expect(s.videos[1].filePath).toBeUndefined();
  });

  it('refuses a file that is not a session', () => {
    expect(parseConfig({ app: 'other' })).toBeNull();
    expect(parseConfig(null)).toBeNull();
  });
});

describe('parseConfig: audio track and subtitles', () => {
  const withVideo = (extra: object) => config({}, [{ id: 'a', kind: 'file', title: 'A', ...extra }, { id: 'b', kind: 'file', title: 'B' }]);

  it('keeps the chosen audio track and an embedded subtitle track', () => {
    const s = parseConfig(withVideo({ audioTrack: 1, subtitle: { kind: 'embedded', track: 4, label: 'English', delayMs: 250 } }))!;
    expect(s.videos[0].audioTrack).toBe(1);
    expect(s.videos[0].subtitle).toEqual({ kind: 'embedded', track: 4, label: 'English', delayMs: 250 });
  });

  it('keeps a subtitle file only if it really is one', () => {
    expect(parseConfig(withVideo({ subtitle: { kind: 'file', path: '/c/ep1.en.srt', label: 'ep1.en.srt' } }))!.videos[0].subtitle?.path).toBe('/c/ep1.en.srt');
    expect(parseConfig(withVideo({ subtitle: { kind: 'file', path: '/etc/passwd', label: 'x' } }))!.videos[0].subtitle).toBeUndefined();
  });

  it('drops a malformed choice and clamps a wild delay', () => {
    expect(parseConfig(withVideo({ subtitle: { kind: 'embedded', track: 'x' } }))!.videos[0].subtitle).toBeUndefined();
    expect(parseConfig(withVideo({ subtitle: { kind: 'embedded', track: 1, delayMs: 1e12 } }))!.videos[0].subtitle?.delayMs).toBe(600000);
  });
});
