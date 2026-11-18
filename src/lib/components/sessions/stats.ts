/** Numbers the session browser shows on each card. Pure functions over a saved session. */
import { timelineRange } from '$lib/engine/timeline';
import type { Session } from '$lib/types';
import { clamp } from '$lib/utils/geometry';

/** Length of the shared timeline: from the earliest footage to the end of the last video. */
export function sessionLength(s: Session): number {
  const r = timelineRange(s.videos);
  return Math.max(0, r.end - r.start);
}

/** Where the viewer left off, in seconds from the start of the shared timeline, and as a 0–1 fraction. */
export function sessionProgress(s: Session): { at: number; length: number; fraction: number } {
  const range = timelineRange(s.videos);
  const length = Math.max(0, range.end - range.start);
  const master = s.videos.find((v) => v.id === s.masterId) ?? s.videos[0];
  const clock = s.clock ?? master?.currentTime ?? 0;
  const at = clamp(clock - range.start, 0, length);
  return { at, length, fraction: length > 0 ? at / length : 0 };
}

/** Case-insensitive match on the session name and on every video's title and file name. */
export function matchesQuery(s: Session, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [s.name, ...s.videos.flatMap((v) => [v.title, v.fileName ?? ''])].some((t) => t.toLowerCase().includes(q));
}

export type SortKey = 'recent' | 'title' | 'duration';

export function sorter(key: SortKey): (a: Session, b: Session) => number {
  switch (key) {
    case 'title':
      return (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    case 'duration':
      return (a, b) => sessionLength(b) - sessionLength(a) || b.lastModified - a.lastModified;
    default:
      return (a, b) => b.lastModified - a.lastModified;
  }
}
