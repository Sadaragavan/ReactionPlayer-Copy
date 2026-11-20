import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/lib/engine/importConfig';
import { buildSession, cloneSession, exportConfig } from '../src/lib/engine/sessionFactory';
import { sourceSpans } from '../src/lib/engine/playlist';

const file = (title: string, duration: number, path: string) => ({ title, kind: 'file' as const, url: '', path, fileName: title, duration });
const input = () => ({
  videos: [{ ...file('Ep 1', 100, '/c/ep1.mp4'), moreSources: [file('Ep 2', 80, '/c/ep2.mp4'), file('Ep 3', 60, '/c/ep3.mp4')] }, file('React', 300, '/c/rx.mp4')],
  layout: 'split' as const,
  linked: true,
  masterPolicy: 'source' as const
});

describe('a session created with several sources', () => {
  const { session, files } = buildSession(input());
  const source = session.videos[0];

  it('keeps them as a playlist in the source layer, the first sharing the layer’s id', () => {
    expect(source.sources?.map((s) => s.title)).toEqual(['Ep 1', 'Ep 2', 'Ep 3']);
    expect(source.sources?.[0].id).toBe(source.id);
    expect(source.sourceIndex).toBe(0);
  });

  it('makes every later episode wait to be started', () => {
    expect(source.sources?.slice(1).map((s) => s.gapMs)).toEqual([null, null]);
  });

  it('gives the clock to the reaction, so it does not restart with each episode', () => {
    expect(session.masterId).toBe(session.videos[1].id);
  });

  it('registers a file for every episode under its own id', () => {
    expect(files.map((f) => f.picked.path)).toEqual(['/c/ep1.mp4', '/c/rx.mp4', '/c/ep2.mp4', '/c/ep3.mp4']);
    expect(new Set(files.map((f) => f.id)).size).toBe(4);
  });

  it('lays the episodes end to end once they are started', () => {
    const items = source.sources!.map((s, i) => ({ ...s, gapMs: i === 0 ? null : i === 1 ? 5000 : 0 }));
    const spans = sourceSpans(items, source.firstOffsetMs ?? 0);
    expect(spans.map((s) => [s.start, s.end])).toEqual([[0, 100], [105, 185], [185, 245]]);
  });
});

describe('a single source stays an ordinary video', () => {
  it('has no playlist', () => {
    const one = input();
    delete (one.videos[0] as { moreSources?: unknown }).moreSources;
    const { session } = buildSession(one);
    expect(session.videos[0].sources).toBeUndefined();
    expect(session.masterId).toBe(session.videos[0].id);
  });
});

describe('saving and loading a playlist', () => {
  it('survives export and import', () => {
    const { session } = buildSession(input());
    session.videos[0].sources![1].gapMs = 2500;
    const text = JSON.parse(JSON.stringify(exportConfig(session)));
    const back = parseConfig(text)!;
    const v = back.videos[0];
    expect(v.sources?.map((s) => [s.title, s.gapMs, s.filePath])).toEqual([
      ['Ep 1', null, '/c/ep1.mp4'],
      ['Ep 2', 2500, '/c/ep2.mp4'],
      ['Ep 3', null, '/c/ep3.mp4']
    ]);
    expect(v.sources?.[0].id).toBe(v.id);
    expect(new Set(v.sources?.map((s) => s.id)).size).toBe(3);
    expect(v.title).toBe('Ep 1');
  });

  it('ignores a malformed playlist instead of failing', () => {
    const { session } = buildSession(input());
    const text = JSON.parse(JSON.stringify(exportConfig(session)));
    text.session.videos[0].sources = [{ title: 5 }];
    expect(parseConfig(text)!.videos[0].sources).toBeUndefined();
  });

  it('gives a copy its own ids for every episode', () => {
    const { session } = buildSession(input());
    const { session: copy, idMap } = cloneSession(structuredClone(session));
    const ids = copy.videos[0].sources!.map((s) => s.id);
    expect(ids[0]).toBe(copy.videos[0].id);
    expect(ids.every((id) => !session.videos[0].sources!.some((s) => s.id === id))).toBe(true);
    expect(Object.keys(idMap)).toHaveLength(4); // both layers, plus the two later episodes (the first shares its layer's id)
  });
});
