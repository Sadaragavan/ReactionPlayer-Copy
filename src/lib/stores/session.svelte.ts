/**
 * sessionStore — the single source of truth for what is open, what is saved
 * and how the layers are laid out.
 *
 *   current   the session being played (deep reactive)
 *   saved     plain snapshots of every stored session, newest first
 *
 * Mutations go through the methods below; each one schedules a debounced save.
 * Playhead positions arrive from the playback engine via `recordTimes`.
 */
import { LS_LAST_SESSION, MAX_VIDEOS } from '../constants';
import { usesDemoClips, warmDemoClips } from '../engine/demo';
import { parseConfig } from '../engine/importConfig';
import { buildLayout, slotsToCoordinates } from '../engine/layouts';
import { type FsFileHandle, type PickedFile, fileFor, forget, registerFile, restoreSessionMedia } from '../engine/media';
import { migrateSession } from '../engine/migrate';
import { type NewSessionInput, buildSession, cloneSession, exportConfig } from '../engine/sessionFactory';
import { offsetsFromLocals, rebaseOffsets } from '../engine/timeline';
import { type ZOp, reorder, canReorder, zFromTopFirst } from '../engine/zorder';
import type { ID, LayerTransform, LayoutType, Preset, Session, SessionVideo } from '../types';
import { saveJSON, slugify, type SaveOutcome } from '../utils/file';
import { idbDelete, idbGet, idbGetAll, idbPut, lsGet, lsRemove, lsSet } from './persistence';
import { ui } from './ui.svelte';

const byRecent = (a: Session, b: Session) => b.lastModified - a.lastModified;
const clone = <T>(v: T): T => structuredClone($state.snapshot(v)) as T;

class SessionStore {
  current = $state<Session | null>(null);
  saved = $state<Session[]>([]);
  lastId = $state<ID | null>(null);
  /** The layer the user last touched (transient). */
  selectedId = $state<ID | null>(null);
  /** Local-file videos in the open session that still need a file. */
  missing = $state<ID[]>([]);
  ready = $state(false);

  #timer: ReturnType<typeof setTimeout> | null = null;

  /* ── derived ── */

  get canContinue(): boolean {
    return !!this.lastId && this.saved.some((s) => s.id === this.lastId);
  }
  get lastSession(): Session | null {
    return this.saved.find((s) => s.id === this.lastId) ?? null;
  }
  get master(): SessionVideo | null {
    const s = this.current;
    return s ? (s.videos.find((v) => v.id === s.masterId) ?? s.videos[0] ?? null) : null;
  }
  get isLocked(): boolean {
    return this.current?.alignment.locked ?? false;
  }
  video(id: ID): SessionVideo | undefined {
    return this.current?.videos.find((v) => v.id === id);
  }

  async init(): Promise<void> {
    // Read here, not when the store is created: on desktop the settings file is loaded first (see initPersistence).
    this.lastId = lsGet<ID | null>(LS_LAST_SESSION, null);
    this.saved = (await idbGetAll<Session>('sessions')).map(migrateSession).sort(byRecent);
    this.ready = true;
  }

  /* ── lifecycle ── */

  /** Builds, registers and opens a new session. Videos beyond the fourth are dropped. */
  create(input: NewSessionInput): Session {
    const videos = input.videos.slice(0, MAX_VIDEOS);
    const { session, files } = buildSession({ ...input, videos });
    for (const f of files) registerFile(f.id, f.picked);
    this.current = session;
    this.selectedId = null;
    this.missing = [];
    this.#remember(session.id);
    void this.save();
    return session;
  }

  /** Opens a saved session. Viewports always start locked so nothing moves by accident. */
  async open(id: ID): Promise<boolean> {
    const found = this.saved.find((s) => s.id === id) ?? (await idbGet<Session>('sessions', id));
    if (!found) return false;
    const s = migrateSession(clone(found));
    s.alignment.locked = true;
    s.isTheaterMode = false;
    if (usesDemoClips(s)) await warmDemoClips();
    this.current = s;
    this.selectedId = null;
    this.#remember(id);
    this.missing = await restoreSessionMedia(s);
    return true;
  }

  resume(): Promise<boolean> {
    return this.lastId ? this.open(this.lastId) : Promise.resolve(false);
  }

  /** Writes the session to disk. Resolves false when it could not be written. */
  async save(): Promise<boolean> {
    const s = this.current;
    if (!s) return false;
    this.#clearTimer();
    s.updatedAt = Date.now();
    const snap = clone(s);
    this.saved = [snap, ...this.saved.filter((x) => x.id !== snap.id)].sort(byRecent);
    const stored = await idbPut('sessions', snap);
    return stored !== undefined;
  }

  /** Persists on the next quiet moment. `reset: false` keeps an already-pending timer (used while playing). */
  schedule(delay = 600, reset = true): void {
    if (!this.current) return;
    if (this.#timer && !reset) return;
    this.#clearTimer();
    this.#timer = setTimeout(() => void this.save(), delay);
  }

  touch(): void {
    if (this.current) this.current.lastModified = Date.now();
    this.schedule();
  }

  async close(): Promise<void> {
    await this.save();
    this.current = null;
    this.selectedId = null;
    this.missing = [];
  }

  /* ── library actions ── */

  async duplicate(id: ID): Promise<Session | null> {
    const src = this.current?.id === id ? clone(this.current) : this.saved.find((s) => s.id === id);
    if (!src) return null;
    const { session, idMap } = cloneSession(clone(src));
    for (const [oldId, newId] of Object.entries(idMap)) {
      const file = fileFor(oldId);
      const path = this.video(oldId)?.filePath ?? this.saved.flatMap((x) => x.videos).find((v) => v.id === oldId)?.filePath;
      if (file || path) registerFile(newId, { file, path, name: file?.name ?? '', size: file?.size ?? 0 });
      else {
        const handle = await idbGet<FsFileHandle>('handles', oldId);
        if (handle) await idbPut('handles', handle, newId);
      }
    }
    this.saved = [session, ...this.saved].sort(byRecent);
    await idbPut('sessions', clone(session));
    return session;
  }

  async remove(id: ID): Promise<void> {
    const target = this.saved.find((s) => s.id === id) ?? (this.current?.id === id ? this.current : undefined);
    this.saved = this.saved.filter((s) => s.id !== id);
    await idbDelete('sessions', id);
    if (target) forget(target.videos.map((v) => v.id));
    if (this.current?.id === id) {
      this.#clearTimer();
      this.current = null;
    }
    if (this.lastId === id) this.#remember(this.saved[0]?.id ?? null);
  }

  async rename(id: ID, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (this.current?.id === id) {
      this.current.name = trimmed;
      await this.save();
      return;
    }
    const s = this.saved.find((x) => x.id === id);
    if (!s) return;
    s.name = trimmed;
    s.updatedAt = Date.now();
    await idbPut('sessions', clone(s));
  }

  /** Offers the session's layout and sync as a `.json` file. Null when there is no such session. */
  async exportJSON(id: ID): Promise<SaveOutcome | null> {
    const s = this.current?.id === id ? clone(this.current) : this.saved.find((x) => x.id === id);
    return s ? saveJSON(exportConfig(clone(s)), `${slugify(s.name)}.reaction-session.json`) : null;
  }

  /**
   * Adds a session from the text of an exported config. The result is saved, not
   * opened. Local videos play again if their saved path still exists; otherwise they come back as “choose file” prompts.
   */
  async importConfig(text: string): Promise<Session | { error: string }> {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { error: 'That file is not a Reaction Player session.' };
    }
    const imported = parseConfig(raw);
    if (!imported) return { error: 'That file is not a Reaction Player session.' };
    this.saved = [imported, ...this.saved].sort(byRecent);
    await idbPut('sessions', clone(imported));
    return imported;
  }

  /* ── videos ── */

  updateVideo(id: ID, patch: Partial<SessionVideo>): void {
    const v = this.video(id);
    if (!v) return;
    Object.assign(v, patch);
    this.schedule();
  }

  setDuration(id: ID, duration: number): void {
    const v = this.video(id);
    if (v && Number.isFinite(duration) && Math.abs(v.duration - duration) > 0.001) v.duration = duration;
  }

  /** Called by the engine; saves lazily so playback never thrashes storage. */
  recordTimes(locals: Record<ID, number>, clock?: number): void {
    const s = this.current;
    if (!s) return;
    for (const v of s.videos) {
      const t = locals[v.id];
      if (Number.isFinite(t)) v.currentTime = t;
    }
    if (clock !== undefined && Number.isFinite(clock)) s.clock = clock;
    s.lastModified = Date.now();
    this.schedule(4000, false);
  }

  setVolume(id: ID, volume: number): void {
    this.updateVideo(id, { volume: Math.min(1, Math.max(0, volume)), muted: volume <= 0 });
  }

  toggleMute(id: ID): void {
    const v = this.video(id);
    if (v) this.updateVideo(id, { muted: !v.muted });
  }

  /** Linked timelines share one speed; unlinked ones are set per video. */
  setRate(id: ID, rate: number): void {
    const s = this.current;
    if (!s) return;
    for (const v of s.videos) if (s.isLinked || v.id === id) v.playbackRate = rate;
    this.schedule();
  }

  setOffset(id: ID, ms: number): void {
    if (id === this.current?.masterId) return;
    this.updateVideo(id, { offsetMs: Math.round(ms) });
  }

  nudgeOffset(id: ID, deltaMs: number): void {
    const v = this.video(id);
    if (v) this.setOffset(id, v.offsetMs + deltaMs);
  }

  /** Makes `id` the clock and the only audible video; offsets are re-based so nothing shifts on screen. */
  setMaster(id: ID): void {
    const s = this.current;
    if (!s || s.masterId === id) return;
    const offsets = rebaseOffsets(s.videos, id);
    for (const v of s.videos) {
      v.offsetMs = offsets[v.id];
      v.muted = v.id !== id;
    }
    s.masterId = id;
    this.schedule();
  }

  /** Linking captures the alignment dialled in while unlinked as per-video offsets. */
  setLinked(on: boolean, locals?: Record<ID, number>): void {
    const s = this.current;
    if (!s) return;
    if (on && locals) {
      const offsets = offsetsFromLocals(s.masterId, locals, s.videos.map((v) => v.id));
      for (const v of s.videos) v.offsetMs = offsets[v.id];
    }
    s.isLinked = on;
    if (on) for (const v of s.videos) v.playbackRate = s.videos.find((m) => m.id === s.masterId)?.playbackRate ?? 1;
    this.schedule();
  }

  /** A local file for a layer that had none (after a reload, or a fresh pick). */
  relink(id: ID, picked: PickedFile): void {
    const saved = this.video(id);
    const differs = !!saved?.fileName && (saved.fileName !== picked.name || (!!saved.fileSize && saved.fileSize !== picked.size));
    registerFile(id, picked);
    this.updateVideo(id, { kind: 'file', fileName: picked.name, fileSize: picked.size, filePath: picked.path });
    this.missing = this.missing.filter((m) => m !== id);
    if (differs) ui.toast(`“${picked.name}” is not the file saved with this layer (“${saved?.fileName}”). Check that it lines up.`, 'info');
  }

  /* ── layout ── */

  select(id: ID | null): void {
    this.selectedId = id;
  }

  setLayer(id: ID, patch: Partial<LayerTransform>): void {
    const s = this.current;
    const t = s?.alignment.coordinates[id];
    if (!s || !t) return;
    Object.assign(t, patch);
    if ('x' in patch || 'y' in patch || 'w' in patch || 'h' in patch || 'crop' in patch) s.alignment.layoutType = 'custom';
    this.schedule();
  }

  resetLayer(id: ID): void {
    const s = this.current;
    if (!s) return;
    const i = s.videos.findIndex((v) => v.id === id);
    const slot = s.alignment.base?.[i] ?? buildLayout('split', s.videos.length)[i];
    const cur = s.alignment.coordinates[id];
    if (i < 0 || !slot || !cur) return;
    // Placement goes back to its slot; the stacking, hiding and locking are the user's and stay.
    s.alignment.coordinates[id] = { ...slot, crop: { ...slot.crop }, zIndex: cur.zIndex, hidden: cur.hidden, locked: cur.locked };
    this.schedule();
  }

  /* ── stacking ── */

  /** Moves a layer in the stack; every layer is re-numbered 0…n-1. */
  reorderLayer(id: ID, op: ZOp): void {
    const s = this.current;
    if (!s || !s.alignment.coordinates[id]) return;
    const ids = s.videos.map((v) => v.id);
    const z = reorder(ids, this.#zMap(), id, op);
    for (const vid of ids) s.alignment.coordinates[vid].zIndex = z[vid];
    this.schedule();
  }

  canReorderLayer(id: ID, op: ZOp): boolean {
    const s = this.current;
    return !!s && !s.alignment.locked && canReorder(s.videos.map((v) => v.id), this.#zMap(), id, op);
  }

  /** The Layers panel's drag and drop: the list, top layer first, becomes the stack. */
  setStackOrder(topFirstIds: ID[]): void {
    const s = this.current;
    if (!s || topFirstIds.length !== s.videos.length) return;
    const z = zFromTopFirst(topFirstIds);
    for (const v of s.videos) if (z[v.id] !== undefined) s.alignment.coordinates[v.id].zIndex = z[v.id];
    this.schedule();
  }

  #zMap(): Record<ID, number> {
    const s = this.current;
    return Object.fromEntries((s?.videos ?? []).map((v) => [v.id, s!.alignment.coordinates[v.id].zIndex]));
  }

  applyLayout(type: Exclude<LayoutType, 'custom'>): void {
    const s = this.current;
    if (!s) return;
    const slots = buildLayout(type, s.videos.length);
    s.alignment.coordinates = slotsToCoordinates(s.videos, slots);
    s.alignment.base = slots;
    s.alignment.layoutType = type;
    s.presetId = undefined;
    this.schedule();
  }

  /** Applying a preset hard-locks the viewports at its coordinates. */
  applyPreset(preset: Preset): void {
    const s = this.current;
    if (!s) return;
    const slots = clone(preset.slots);
    s.alignment.coordinates = slotsToCoordinates(s.videos, slots);
    s.alignment.base = slots;
    s.alignment.layoutType = preset.layoutType;
    s.alignment.locked = true;
    s.presetId = preset.id;
    if (preset.canvasAspect) s.canvasAspect = preset.canvasAspect;
    this.schedule();
  }

  setLocked(locked: boolean): void {
    if (!this.current) return;
    this.current.alignment.locked = locked;
    if (locked) this.selectedId = null;
    this.schedule();
  }

  toggleLocked(): void {
    this.setLocked(!this.isLocked);
  }

  setTheater(on: boolean): void {
    if (this.current) this.current.isTheaterMode = on;
  }

  setCanvasAspect(aspect: Session['canvasAspect']): void {
    if (!this.current) return;
    this.current.canvasAspect = aspect;
    this.schedule();
  }

  setThumbnail(dataUrl: string): void {
    if (this.current) this.current.thumbnail = dataUrl;
  }

  /* ── internals ── */

  #remember(id: ID | null): void {
    this.lastId = id;
    if (id) lsSet(LS_LAST_SESSION, id);
    else lsRemove(LS_LAST_SESSION);
  }

  #clearTimer(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }
}

export const session = new SessionStore();
