/**
 * Brings data saved by an older version up to the current shape, so nothing that is read from disk (or from a file the
 * user imports) is ever missing a field the code now relies on.
 *
 *   zIndex   layers could not be ordered before: the source was always painted on top.
 *   hidden   “hidden” used to be an opacity of 0. It is now a flag of its own, and the opacity is back to 100 %.
 */
import type { LayerTransform, Preset, Session } from '../types';
import { slotsWithZIndex, withZIndex } from './zorder';

type Loose = Partial<LayerTransform>;

function fixVisibility<T extends Loose>(t: T): T {
  return t.opacity === 0 ? { ...t, hidden: true, opacity: 1 } : t;
}

/** Returns the session with every layer carrying a `zIndex`. Cheap to call on data that is already current. */
export function migrateSession(s: Session): Session {
  const ids = s.videos.map((v) => v.id);
  const coordinates = withZIndex(ids, s.alignment.coordinates as Record<string, Loose>);
  for (const id of ids) if (coordinates[id]) coordinates[id] = fixVisibility(coordinates[id]);
  const base = s.alignment.base ? slotsWithZIndex(s.alignment.base as Loose[]) : undefined;
  return { ...s, alignment: { ...s.alignment, coordinates: coordinates as Session['alignment']['coordinates'], base: base as LayerTransform[] | undefined } };
}

export function migratePreset(p: Preset): Preset {
  return { ...p, slots: slotsWithZIndex(p.slots as Loose[]) as LayerTransform[] };
}
