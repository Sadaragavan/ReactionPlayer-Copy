/**
 * Source playlist maths. Pure functions, no DOM, no stores.
 *
 * A reactor may react to several episodes in a row, so one source layer can hold a playlist. Each item sits on the shared
 * timeline (master seconds): the first where its `offsetMs` puts it, every later one after the previous item ends plus a
 * `gapMs` break. A break of `null` means the item starts only when the user starts it, so until then it waits on its first
 * frame while the reaction plays on.
 */
import type { SessionVideo, SourceItem } from '../types';

export type PlaylistItem = Pick<SourceItem, 'duration' | 'gapMs'>;

export interface Span {
  /** Master seconds at which the item starts, or null while it waits to be started. */
  start: number | null;
  /** Master seconds at which it ends, or null when it has not started or its length is not known yet. */
  end: number | null;
}

/** Where every item starts and ends on the timeline. `firstOffsetMs` is the first item's offset (`local = T + offset`). */
export function sourceSpans(items: readonly PlaylistItem[], firstOffsetMs: number): Span[] {
  const spans: Span[] = [];
  items.forEach((item, i) => {
    let start: number | null;
    if (i === 0) start = -firstOffsetMs / 1000 + 0; // + 0 turns -0 into 0
    else {
      const prevEnd = spans[i - 1].end;
      start = prevEnd !== null && item.gapMs !== null ? prevEnd + Math.max(0, item.gapMs) / 1000 : null;
    }
    spans.push({ start, end: start !== null && item.duration > 0 ? start + item.duration : null });
  });
  return spans;
}

/**
 * Which item is on screen at master time `t`: the first, until it has ended; then the next, which is shown (not
 * played) from the instant the previous one ends, and so on. An item that has not started keeps the screen.
 */
export function sourceIndexAt(spans: readonly Span[], t: number): number {
  let i = 0;
  while (i < spans.length - 1) {
    const end = spans[i].end;
    if (end === null || t < end) break;
    i++;
  }
  return i;
}

/** The part of the timeline the playlist covers so far: from the first start to the last known end. */
export function sourceRange(spans: readonly Span[]): { start: number; end: number } | null {
  const first = spans[0]?.start;
  if (first === undefined || first === null) return null;
  let end: number | null = null;
  for (const s of spans) if (s.end !== null) end = s.end;
  return end === null ? null : { start: first, end };
}

export interface Placement {
  /** The offset the layer should have while this item is current. */
  offsetMs: number;
  /** True while the item has not been started. */
  waiting: boolean;
}

/** How the layer is placed on the timeline while item `i` is current. A waiting item is parked at the end of the one before. */
export function placementOf(spans: readonly Span[], i: number): Placement {
  const s = spans[i];
  if (s?.start !== null && s?.start !== undefined) return { offsetMs: Math.round(-s.start * 1000) + 0, waiting: false };
  const prevEnd = spans[i - 1]?.end ?? 0;
  return { offsetMs: Math.round(-prevEnd * 1000) + 0, waiting: true };
}

/** The break that makes item `i` start at `startSec` (never negative). Null when the previous item's end is not known. */
export function gapForStart(spans: readonly Span[], i: number, startSec: number): number | null {
  const prevEnd = spans[i - 1]?.end;
  if (i === 0 || prevEnd === null || prevEnd === undefined) return null;
  return Math.max(0, Math.round((startSec - prevEnd) * 1000));
}

/** The reaction outlasts the sources by more than `slackSec`: time for the question “play another source?”. */
export function sourceEndsEarly(sourceEnd: number | null, reactionEnd: number, slackSec = 5): boolean {
  return sourceEnd !== null && reactionEnd > sourceEnd + slackSec;
}

/**
 * Copies the current episode's fields onto the layer that holds the playlist, so everything else in the app sees an
 * ordinary video. Mutates `v`; does nothing when it has no playlist.
 */
export function mirrorCurrentItem(v: SessionVideo): void {
  const items = v.sources;
  if (!items?.length) return;
  const i = Math.min(Math.max(v.sourceIndex ?? 0, 0), items.length - 1);
  const it = items[i];
  const place = placementOf(sourceSpans(items, v.firstOffsetMs ?? 0), i);
  v.sourceIndex = i;
  v.title = it.title;
  v.kind = it.kind;
  v.url = it.url;
  v.filePath = it.filePath;
  v.fileName = it.fileName;
  v.fileSize = it.fileSize;
  v.duration = it.duration;
  v.audioTrack = it.audioTrack;
  v.subtitle = it.subtitle;
  v.offsetMs = place.offsetMs;
  v.waiting = place.waiting;
}
