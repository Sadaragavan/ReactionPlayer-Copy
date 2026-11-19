import { describe, expect, it } from 'vitest';
import { clampLocal, frameCentre, frameIndexAt, isActive, localAt, offsetsFromLocals, planCorrection, rebaseOffsets, timelineRange } from '../src/lib/engine/timeline';

const v = (id: string, duration: number, offsetMs = 0) => ({ id, duration, offsetMs });
/** `-0` and `0` are the same time; `toEqual` is not that lenient. */
const range = (videos: ReturnType<typeof v>[]) => {
  const r = timelineRange(videos);
  return { start: r.start + 0, end: r.end + 0 };
};

describe('timelineRange (the union of all footage)', () => {
  it('is the master’s own span when it is alone', () => {
    expect(range([v('a', 60)])).toEqual({ start: 0, end: 60 });
  });

  it('extends to the end of a longer follower', () => {
    expect(range([v('a', 60), v('b', 90, 0)])).toEqual({ start: 0, end: 90 });
  });

  it('starts before zero when a follower begins first (a positive offset means it is ahead)', () => {
    // b's local time is T + 5 s, so b has footage from T = −5 s.
    expect(range([v('a', 60), v('b', 40, 5000)])).toEqual({ start: -5, end: 60 });
  });

  it('ends later when a follower starts later (negative offset)', () => {
    expect(range([v('a', 60), v('b', 40, -30000)])).toEqual({ start: 0, end: 70 });
  });

  it('ignores videos whose length is not known yet', () => {
    expect(range([v('a', 0), v('b', 20, 1000)])).toEqual({ start: -1, end: 19 });
    expect(range([v('a', 0)])).toEqual({ start: 0, end: 0 });
  });
});

describe('where each video is on the shared clock', () => {
  it('adds the offset to the master time', () => {
    expect(localAt({ offsetMs: 1500 }, 10)).toBe(11.5);
    expect(localAt({ offsetMs: -250 }, 1)).toBe(0.75);
  });

  it('is active only inside its own footage', () => {
    const b = v('b', 10, 2000);
    expect(isActive(b, -3)).toBe(false);
    expect(isActive(b, -2)).toBe(true);
    expect(isActive(b, 7.99)).toBe(true);
    expect(isActive(b, 8)).toBe(false);
  });

  it('parks on the first or last frame outside its footage', () => {
    const b = v('b', 10, 2000);
    expect(clampLocal(b, -5)).toBe(0);
    expect(clampLocal(b, 3)).toBe(5);
    expect(clampLocal(b, 100)).toBe(10);
  });
});

describe('offsets', () => {
  it('captures the playheads dialled in while unlinked', () => {
    expect(offsetsFromLocals('a', { a: 10, b: 11.5, c: 9 }, ['a', 'b', 'c'])).toEqual({ a: 0, b: 1500, c: -1000 });
  });

  it('re-bases onto a new master without moving anything on screen', () => {
    const videos = [v('a', 60, 0), v('b', 60, 1500)];
    const out = rebaseOffsets(videos, 'b');
    expect(out).toEqual({ a: -1500, b: 0 });
    // At master time T on a, b is at T + 1.5; with b as master at T' = T + 1.5, a must be at T' − 1.5 = T.
    expect(localAt({ offsetMs: out.a }, 11.5)).toBe(10);
  });
});

describe('drift correction and frames', () => {
  it('leaves small drift alone, nudges moderate drift, seeks large drift', () => {
    expect(planCorrection(0.01, 20, 0.35, false)).toEqual({ kind: 'none' });
    expect(planCorrection(0.1, 20, 0.35, false)).toMatchObject({ kind: 'rate' });
    expect(planCorrection(0.5, 20, 0.35, false)).toEqual({ kind: 'seek' });
  });

  it('slows a follower that is ahead and speeds up one that is behind', () => {
    const ahead = planCorrection(0.1, 20, 0.35, false);
    const behind = planCorrection(-0.1, 20, 0.35, false);
    expect(ahead.kind === 'rate' && ahead.factor).toBeLessThan(1);
    expect(behind.kind === 'rate' && behind.factor).toBeGreaterThan(1);
  });

  it('keeps nudging until the drift is under half the tolerance', () => {
    expect(planCorrection(0.015, 20, 0.35, true)).toMatchObject({ kind: 'rate' });
    expect(planCorrection(0.009, 20, 0.35, true)).toEqual({ kind: 'none' });
  });

  it('lands a paused seek in the middle of a frame', () => {
    const d = 1 / 24;
    for (const k of [0, 1, 23, 24, 1000]) expect(frameIndexAt(frameCentre(k, d), d)).toBe(k);
    expect(frameIndexAt(5 * d - 1e-9, d)).toBe(5);
  });
});
