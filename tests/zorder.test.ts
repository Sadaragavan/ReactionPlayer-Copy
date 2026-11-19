import { describe, expect, it } from 'vitest';
import { buildLayout, builtInPresets, coordinatesToSlots, slotsToCoordinates } from '../src/lib/engine/layouts';
import { migratePreset, migrateSession } from '../src/lib/engine/migrate';
import {
  canReorder,
  defaultZ,
  hitTest,
  moveInTopFirst,
  reorder,
  slotsWithZIndex,
  sortByZ,
  stackOf,
  topFirst,
  videosByZ,
  withZIndex,
  zFromTopFirst,
  type HitLayer
} from '../src/lib/engine/zorder';
import type { LayerTransform, Session } from '../src/lib/types';

const ids = ['src', 'rx', 'x1'];
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('sorting', () => {
  it('paints from the lowest zIndex to the highest', () => {
    const items = [
      { id: 'a', zIndex: 5 },
      { id: 'b', zIndex: -2 },
      { id: 'c', zIndex: 0 }
    ];
    expect(sortByZ(items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(topFirst(items).map((i) => i.id)).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties by video order: the earlier video is on top', () => {
    const items = [
      { id: 'a', zIndex: 1 },
      { id: 'b', zIndex: 1 }
    ];
    expect(sortByZ(items).map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('does not change its input', () => {
    const items = [
      { zIndex: 2 },
      { zIndex: 1 }
    ];
    sortByZ(items);
    expect(items.map((i) => i.zIndex)).toEqual([2, 1]);
  });

  it('orders a session’s videos by their placements', () => {
    const videos = ids.map((id) => ({ id }));
    const coords = { src: { zIndex: 0 }, rx: { zIndex: 2 }, x1: { zIndex: 1 } };
    expect(videosByZ(videos, coords).map((v) => v.id)).toEqual(['src', 'x1', 'rx']);
  });
});

describe('hitTest', () => {
  const layers: HitLayer[] = [
    { id: 'low', rect: rect(0, 0, 1, 1), zIndex: 0 },
    { id: 'mid', rect: rect(0.2, 0.2, 0.6, 0.6), zIndex: 1 },
    { id: 'top', rect: rect(0.4, 0.4, 0.2, 0.2), zIndex: 2 }
  ];

  it('tests from the highest zIndex to the lowest', () => {
    expect(hitTest(layers, 0.5, 0.5)).toBe('top');
    expect(hitTest(layers, 0.3, 0.3)).toBe('mid');
    expect(hitTest(layers, 0.05, 0.05)).toBe('low');
  });

  it('does not depend on the order of the array', () => {
    expect(hitTest([...layers].reverse(), 0.5, 0.5)).toBe('top');
  });

  it('skips hidden layers', () => {
    const l = layers.map((x) => (x.id === 'top' ? { ...x, hidden: true } : x));
    expect(hitTest(l, 0.5, 0.5)).toBe('mid');
  });

  it('skips locked layers, so the click reaches what is beneath', () => {
    const l = layers.map((x) => (x.id === 'top' || x.id === 'mid' ? { ...x, locked: true } : x));
    expect(hitTest(l, 0.5, 0.5)).toBe('low');
  });

  it('returns null on bare canvas, and when nothing is hittable', () => {
    expect(hitTest([{ id: 'a', rect: rect(0, 0, 0.5, 0.5), zIndex: 0 }], 0.9, 0.9)).toBeNull();
    expect(hitTest(layers.map((l) => ({ ...l, hidden: true })), 0.5, 0.5)).toBeNull();
    expect(hitTest([], 0.5, 0.5)).toBeNull();
  });

  it('counts the edges of a layer as inside', () => {
    expect(hitTest([{ id: 'a', rect: rect(0.25, 0.25, 0.5, 0.5), zIndex: 0 }], 0.25, 0.75)).toBe('a');
  });
});

describe('reorder', () => {
  const z = { src: 2, rx: 1, x1: 0 };

  it('brings a layer forward one step', () => {
    expect(reorder(ids, z, 'rx', 'forward')).toEqual({ x1: 0, src: 1, rx: 2 });
  });

  it('sends a layer backward one step', () => {
    expect(reorder(ids, z, 'rx', 'backward')).toEqual({ src: 2, x1: 1, rx: 0 });
  });

  it('brings to the front and sends to the back', () => {
    expect(reorder(ids, z, 'x1', 'front')).toEqual({ rx: 0, src: 1, x1: 2 });
    expect(reorder(ids, z, 'src', 'back')).toEqual({ src: 0, x1: 1, rx: 2 });
  });

  it('leaves a layer at the end where it is', () => {
    expect(reorder(ids, z, 'src', 'front')).toEqual({ x1: 0, rx: 1, src: 2 });
    expect(reorder(ids, z, 'x1', 'backward')).toEqual({ x1: 0, rx: 1, src: 2 });
  });

  it('re-numbers a messy stack as 0…n-1', () => {
    const messy = { src: 40, rx: -7, x1: 3 };
    const out = reorder(ids, messy, 'rx', 'front');
    expect(Object.values(out).sort()).toEqual([0, 1, 2]);
    expect(stackOf(ids, out)).toEqual(['x1', 'src', 'rx']);
  });

  it('reports which moves would do something', () => {
    expect(canReorder(ids, z, 'src', 'front')).toBe(false);
    expect(canReorder(ids, z, 'src', 'forward')).toBe(false);
    expect(canReorder(ids, z, 'src', 'back')).toBe(true);
    expect(canReorder(ids, z, 'x1', 'back')).toBe(false);
    expect(canReorder(ids, z, 'x1', 'forward')).toBe(true);
    expect(canReorder(ids, z, 'missing', 'front')).toBe(false);
  });
});

describe('drag and drop in the panel', () => {
  it('turns a top → bottom list into zIndex values', () => {
    expect(zFromTopFirst(['a', 'b', 'c'])).toEqual({ a: 2, b: 1, c: 0 });
  });

  it('moves a row to the position of the row it is dropped on', () => {
    expect(moveInTopFirst(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    expect(moveInTopFirst(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveInTopFirst(['a', 'b', 'c'], 'b', 99)).toEqual(['a', 'c', 'b']);
  });
});

describe('layout defaults', () => {
  it('puts the source on top, then the reaction, then the extras', () => {
    expect(defaultZ(0, 3)).toBe(2);
    expect(buildLayout('split', 3).map((t) => t.zIndex)).toEqual([2, 1, 0]);
    expect(buildLayout('pip', 2).map((t) => t.zIndex)).toEqual([1, 0]);
    expect(buildLayout('grid', 4).map((t) => t.zIndex)).toEqual([3, 2, 1, 0]);
  });

  it('has presets with the reaction on top of the source', () => {
    const rx = builtInPresets().find((p) => p.id === 'std_rx-br')!;
    expect(rx.slots.map((s) => s.zIndex)).toEqual([0, 1]);
    expect(rx.slots[0]).toMatchObject({ w: 1, h: 1 });
  });

  it('gives every built-in preset a zIndex on every slot', () => {
    for (const p of builtInPresets()) for (const s of p.slots) expect(Number.isFinite(s.zIndex)).toBe(true);
  });
});

describe('persistence', () => {
  const videos = [{ id: 'v1' }, { id: 'v2' }];

  it('carries zIndex through slots and back, without hidden or locked', () => {
    const slots = buildLayout('pip', 2);
    const coords = slotsToCoordinates(videos, slots);
    coords.v2 = { ...coords.v2, zIndex: 5, hidden: true, locked: true };
    const back = coordinatesToSlots(videos, coords);
    expect(back[1].zIndex).toBe(5);
    expect(back[1]).not.toHaveProperty('hidden');
    expect(back[1]).not.toHaveProperty('locked');
  });

  it('survives a JSON round trip', () => {
    const preset = builtInPresets()[2];
    const again = JSON.parse(JSON.stringify(preset)) as typeof preset;
    expect(again.slots.map((s) => s.zIndex)).toEqual(preset.slots.map((s) => s.zIndex));
  });
});

describe('migration of data saved before layers could be ordered', () => {
  const legacy = (over: Partial<LayerTransform> = {}) => ({ ...rect(0, 0, 0.5, 1), crop: { t: 0, r: 0, b: 0, l: 0 }, opacity: 1, fit: 'contain', aspect: 'auto', ...over });

  it('derives the old source-on-top stacking when zIndex is missing', () => {
    const out = withZIndex(ids, { src: legacy(), rx: legacy(), x1: legacy() });
    expect(stackOf(ids, { src: out.src.zIndex, rx: out.rx.zIndex, x1: out.x1.zIndex })).toEqual(['x1', 'rx', 'src']);
  });

  it('keeps an existing order, compacted', () => {
    const out = withZIndex(ids, { src: legacy({ zIndex: -4 }), rx: legacy({ zIndex: 90 }), x1: legacy({ zIndex: 7 }) });
    expect([out.src.zIndex, out.rx.zIndex, out.x1.zIndex]).toEqual([0, 2, 1]);
  });

  it('derives everything again when only some layers have a value', () => {
    const out = withZIndex(ids, { src: legacy({ zIndex: 9 }), rx: legacy(), x1: legacy() });
    expect([out.src.zIndex, out.rx.zIndex, out.x1.zIndex]).toEqual([2, 1, 0]);
  });

  it('migrates slots', () => {
    const out = slotsWithZIndex([legacy(), legacy()]);
    expect(out.map((s) => s.zIndex)).toEqual([1, 0]);
  });

  it('migrates a whole session, including its base slots and an opacity-0 “hidden” layer', () => {
    const session = {
      id: 'ses_1',
      videos: [{ id: 'a' }, { id: 'b' }],
      alignment: { layoutType: 'split', locked: false, coordinates: { a: legacy(), b: legacy({ opacity: 0 }) }, base: [legacy(), legacy()] }
    } as unknown as Session;
    const out = migrateSession(session);
    expect(out.alignment.coordinates.a.zIndex).toBe(1);
    expect(out.alignment.coordinates.b.zIndex).toBe(0);
    expect(out.alignment.coordinates.b).toMatchObject({ hidden: true, opacity: 1 });
    expect(out.alignment.base?.map((s) => s.zIndex)).toEqual([1, 0]);
  });

  it('migrates a preset and leaves a current one alone', () => {
    const old = { id: 'p', name: 'p', builtIn: false, layoutType: 'custom', slots: [legacy(), legacy()], createdAt: 0, updatedAt: 0 } as never;
    expect(migratePreset(old).slots.map((s) => s.zIndex)).toEqual([1, 0]);
    const current = builtInPresets()[3];
    expect(migratePreset(current).slots.map((s) => s.zIndex)).toEqual(current.slots.map((s) => s.zIndex));
  });
});
