import { describe, expect, it } from 'vitest';
import { gapForStart, placementOf, sourceEndsEarly, sourceIndexAt, sourceRange, sourceSpans } from '../src/lib/engine/playlist';
import { clampLocal, isActive, timelineRange } from '../src/lib/engine/timeline';

const item = (duration: number, gapMs: number | null = null) => ({ duration, gapMs });

describe('sourceSpans', () => {
  it('starts the first item where its offset puts it', () => {
    expect(sourceSpans([item(100)], 0)[0]).toEqual({ start: 0, end: 100 });
    expect(sourceSpans([item(100)], -3000)[0]).toEqual({ start: 3, end: 103 });
  });

  it('chains items with their breaks', () => {
    const spans = sourceSpans([item(100), item(50, 0), item(30, 2500)], 0);
    expect(spans[1]).toEqual({ start: 100, end: 150 });
    expect(spans[2]).toEqual({ start: 152.5, end: 182.5 });
  });

  it('leaves an item that waits to be started without a start, and everything after it', () => {
    const spans = sourceSpans([item(100), item(50, null), item(30, 0)], 0);
    expect(spans[1]).toEqual({ start: null, end: null });
    expect(spans[2]).toEqual({ start: null, end: null });
  });

  it('does not know an end before the length is known', () => {
    expect(sourceSpans([item(0), item(10, 0)], 0)).toEqual([{ start: 0, end: null }, { start: null, end: null }]);
  });
});

describe('sourceIndexAt: the next one is swapped in the moment the first ends', () => {
  const spans = sourceSpans([item(100), item(50, 5000), item(30, null)], 0);
  // item 1 starts at 105 and ends at 155; item 2 waits.

  it('shows the first item until it ends', () => {
    expect(sourceIndexAt(spans, -10)).toBe(0);
    expect(sourceIndexAt(spans, 99.9)).toBe(0);
  });

  it('swaps at the end, during the break, before the next one plays', () => {
    expect(sourceIndexAt(spans, 100)).toBe(1);
    expect(sourceIndexAt(spans, 104)).toBe(1);
  });

  it('stays on an item that has not been started', () => {
    expect(sourceIndexAt(spans, 155)).toBe(2);
    expect(sourceIndexAt(spans, 5000)).toBe(2);
  });

  it('goes back when the clock does', () => {
    expect(sourceIndexAt(spans, 50)).toBe(0);
  });
});

describe('placement while an item is current', () => {
  const spans = sourceSpans([item(100), item(50, 5000), item(30, null)], 0);

  it('puts a started item at its start', () => {
    expect(placementOf(spans, 1)).toEqual({ offsetMs: -105000, waiting: false });
  });

  it('parks a waiting item at the end of the previous one', () => {
    expect(placementOf(spans, 2)).toEqual({ offsetMs: -155000, waiting: true });
  });

  it('makes a waiting item inactive and parked on its first frame', () => {
    const v = { id: 'a', duration: 30, offsetMs: -155000, waiting: true };
    expect(isActive(v, 200)).toBe(false);
    expect(clampLocal(v, 200)).toBe(0);
  });
});

describe('starting a waiting item by hand', () => {
  const spans = sourceSpans([item(100), item(50, null)], 0);

  it('turns the moment it was started into the break', () => {
    expect(gapForStart(spans, 1, 112.4)).toBe(12400);
    const after = sourceSpans([item(100), item(50, 12400)], 0);
    expect(after[1].start).toBeCloseTo(112.4);
  });

  it('never makes a negative break', () => {
    expect(gapForStart(spans, 1, 90)).toBe(0);
  });

  it('cannot say without the previous end, or for the first item', () => {
    expect(gapForStart(sourceSpans([item(0), item(5, null)], 0), 1, 10)).toBeNull();
    expect(gapForStart(spans, 0, 10)).toBeNull();
  });
});

describe('the playlist on the timeline', () => {
  it('covers the first start to the last known end', () => {
    expect(sourceRange(sourceSpans([item(100), item(50, 5000)], 0))).toEqual({ start: 0, end: 155 });
    expect(sourceRange(sourceSpans([item(100), item(50, null)], 0))).toEqual({ start: 0, end: 100 });
  });

  it('replaces the current item in the timeline range', () => {
    const reaction = { id: 'r', duration: 400, offsetMs: 0 };
    const source = { id: 's', duration: 50, offsetMs: -105000, span: { start: 0, end: 155 } };
    expect(timelineRange([reaction, source])).toEqual({ start: 0, end: 400 });
    const early = { id: 's', duration: 50, offsetMs: 20000, span: { start: -20, end: 135 } };
    expect(timelineRange([reaction, early])).toEqual({ start: -20, end: 400 });
  });

  it('ignores a waiting item that has no span', () => {
    expect(timelineRange([{ id: 'a', duration: 30, offsetMs: 0, waiting: true }, { id: 'b', duration: 10, offsetMs: 0 }])).toEqual({ start: 0, end: 10 });
  });
});

describe('the reaction outlasts the sources', () => {
  it('asks only when it clearly does, and when the end is known', () => {
    expect(sourceEndsEarly(100, 300)).toBe(true);
    expect(sourceEndsEarly(100, 104)).toBe(false);
    expect(sourceEndsEarly(null, 300)).toBe(false);
  });
});
