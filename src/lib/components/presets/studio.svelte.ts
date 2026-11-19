/**
 * State of the alignment studio.
 *
 * The studio edits *slots* — exactly what a preset stores: slot 0 is the source,
 * slot 1 the reaction, slots 2–3 the extras. Each slot carries the
 * placement being tuned, the still sampled from its video (the newest capture)
 * and the stills before it (the last eight). One instance lives for as long as the
 * studio is open; `dispose()` frees the sampling clips.
 */
import { CANVAS_ASPECTS, MAX_VIDEOS, MIN_LAYER_SIZE, FALLBACK_FPS } from '$lib/constants';
import { captureErrorMessage, canvasRatio, whenSettled } from '$lib/engine/capture';
import { buildLayout, coordinatesToSlots } from '$lib/engine/layouts';
import { pickedUrl, type PickedFile } from '$lib/engine/media';
import { playback } from '$lib/engine/playback.svelte';
import { roleForIndex } from '$lib/engine/sessionFactory';
import { presets } from '$lib/stores/presets.svelte';
import { session } from '$lib/stores/session.svelte';
import { ui } from '$lib/stores/ui.svelte';
import type { CanvasAspect, ID, LayerTransform, Preset, Rect, SampledFrame, VideoRole } from '$lib/types';
import { clamp, pixelAspectFor, resizeRect, roundTo, toNormAspect } from '$lib/utils/geometry';
import { HISTORY_LIMIT, type Clip, composeThumbnail, grabFrame, openClip, seekTo, visibleFrameAspect } from './sampling';

export type StudioShape = Exclude<CanvasAspect, 'fill'>;
export type StudioMode = 'normal' | 'onion' | 'wipe';

/** The canvas shapes a preset can be made on (a preset never follows the window). */
export const SHAPES = CANVAS_ASPECTS.flatMap((a) =>
  a.value !== 'fill' && a.ratio !== null ? [{ value: a.value, label: a.label, ratio: a.ratio }] : []
);

export interface StudioSlot {
  role: VideoRole;
  /** The placement being tuned: exactly what the preset will store for this slot. */
  t: LayerTransform;
  /** The still being aligned — the newest capture. */
  frame: SampledFrame | null;
  /** Stills captured before it, newest first (up to eight). */
  history: SampledFrame[];
  /** Where the stills come from, for the sampler panel. */
  label: string;
  /** True while a clip is open in the studio for scrubbing. */
  clip: boolean;
  time: number;
  duration: number;
  busy: boolean;
}

export class Studio {
  name = $state('');
  /** Set while editing one of the user's own presets; saving then replaces it. */
  editingId = $state<ID | null>(null);
  canvas = $state<StudioShape>('16:9');
  slots = $state<StudioSlot[]>([]);
  selected = $state(0);
  mode = $state<StudioMode>('normal');
  /** How see-through the source is in onion-skin mode (view only, never saved). */
  onion = $state(0.5);
  /** Where the wipe line sits, 0–1 along its axis (view only). */
  wipe = $state(0.5);
  wipeAxis = $state<'x' | 'y'>('x');
  saving = $state(false);

  readonly ratio = $derived(canvasRatio(this.canvas));
  readonly current = $derived<StudioSlot | undefined>(this.slots[this.selected]);

  /** Bumped whenever a clip is opened or dropped, so views that show a clip know to look again. */
  clipRev = $state(0);

  #clips = new Map<number, Clip>();

  constructor() {
    this.startBlank(2);
  }

  /* ── starting points ─────────────────────────────────────── */

  #slot(i: number, t: LayerTransform): StudioSlot {
    return { role: roleForIndex(i), t, frame: null, history: [], label: '', clip: false, time: 0, duration: 0, busy: false };
  }

  #begin(name: string, canvas: StudioShape, ts: LayerTransform[], editingId: ID | null) {
    this.#dropClips();
    this.name = name;
    this.canvas = canvas;
    this.editingId = editingId;
    this.slots = ts.map((t, i) => this.#slot(i, t));
    this.selected = 0;
    this.mode = 'normal';
  }

  startBlank(count = 2) {
    this.#begin('', '16:9', buildLayout('split', count), null);
  }

  /** Opens a preset: the user's own for editing, a standard one as a starting point for a new preset. */
  startFromPreset(p: Preset) {
    const ts = p.slots.map((s) => ({ ...s, crop: { ...s.crop } }));
    this.#begin(p.builtIn ? `${p.name} copy` : p.name, p.canvasAspect ?? '16:9', ts, p.builtIn ? null : p.id);
  }

  /** Takes the layout of the open session and a still of each of its videos as it plays right now. */
  startFromSession(): boolean {
    const s = session.current;
    if (!s) return false;
    const ts = coordinatesToSlots(s.videos, s.alignment.coordinates);
    this.#begin(`${s.name} layout`.slice(0, 48), s.canvasAspect === 'fill' ? '16:9' : s.canvasAspect, ts, null);
    s.videos.forEach((_, i) => this.sampleSession(i, true));
    return true;
  }

  /* ── slots ───────────────────────────────────────────────── */

  setCount(n: number) {
    const next = clamp(n, 2, MAX_VIDEOS);
    if (next < this.slots.length) {
      for (let i = next; i < this.slots.length; i++) this.#release(i);
      this.slots = this.slots.slice(0, next);
      this.selected = Math.min(this.selected, next - 1);
      return;
    }
    const base = buildLayout('split', next);
    while (this.slots.length < next) this.slots.push(this.#slot(this.slots.length, base[this.slots.length]));
  }

  select(i: number) {
    if (i >= 0 && i < this.slots.length) this.selected = i;
  }

  patch(i: number, p: Partial<LayerTransform>) {
    const s = this.slots[i];
    if (s) Object.assign(s.t, p);
  }

  setRect(i: number, r: Rect) {
    this.patch(i, { x: roundTo(r.x), y: roundTo(r.y), w: roundTo(r.w), h: roundTo(r.h) });
  }

  resetSlot(i: number) {
    const base = buildLayout('split', this.slots.length)[i];
    if (base && this.slots[i]) this.slots[i].t = base;
  }

  /** Shape (w/h in canvas units) a layer keeps while it is resized, or null when it is free. */
  normAspect(i: number): number | null {
    const s = this.slots[i];
    if (!s) return null;
    const px = pixelAspectFor(s.t.aspect, visibleFrameAspect(s.frame, s.t.crop));
    return px === null ? null : toNormAspect(px, this.ratio, 1);
  }

  /** Sets a layer's aspect lock and reshapes its box to match, growing from its top-left corner. */
  setAspect(i: number, lock: LayerTransform['aspect']) {
    this.patch(i, { aspect: lock });
    const t = this.slots[i]?.t;
    const norm = this.normAspect(i);
    if (t && norm) this.setRect(i, resizeRect(t, 'se', 0, 0, norm, MIN_LAYER_SIZE));
  }

  /* ── sampling ────────────────────────────────────────────── */

  clipEl(i: number): HTMLVideoElement | null {
    void this.clipRev; // reading it makes callers re-run when a clip comes or goes
    return this.#clips.get(i)?.el ?? null;
  }

  /** Opens a picked or dropped video. On desktop it plays from its path; in a browser from a blob URL. */
  async loadFile(i: number, picked: PickedFile) {
    const url = pickedUrl(picked);
    await this.#open(i, url, picked.name, picked.path ? { cors: true } : { objectUrl: url });
  }

  async loadUrl(i: number, url: string, name: string) {
    await this.#open(i, url, name, {});
  }

  async #open(i: number, src: string, name: string, opts: { objectUrl?: string; cors?: boolean }) {
    const slot = this.slots[i];
    if (!slot) return;
    slot.busy = true;
    try {
      const clip = await openClip(src, name, opts);
      this.#release(i);
      this.#clips.set(i, clip);
      this.clipRev++;
      clip.el.addEventListener('seeked', () => (slot.time = clip.el.currentTime));
      slot.clip = true;
      slot.label = name;
      slot.duration = Number.isFinite(clip.el.duration) ? clip.el.duration : 0;
      slot.time = clip.el.currentTime;
      await this.capture(i);
    } catch (err) {
      if (opts.objectUrl) URL.revokeObjectURL(opts.objectUrl);
      ui.toast(err instanceof Error ? err.message : 'Could not open that video.', 'error');
    } finally {
      slot.busy = false;
    }
  }

  /** Fast path for the time slider: just move, the still is only taken on Capture. */
  seek(i: number, t: number) {
    const el = this.clipEl(i);
    const slot = this.slots[i];
    if (!el || !slot) return;
    el.currentTime = clamp(t, 0, slot.duration || t);
    slot.time = el.currentTime;
  }

  /** Moves by whole frames (the player's frame shortcuts use the same idea). */
  async step(i: number, frames: number) {
    const el = this.clipEl(i);
    const slot = this.slots[i];
    if (!el || !slot) return;
    slot.time = await seekTo(el, el.currentTime + frames / FALLBACK_FPS);
  }

  /** Takes a still of the picture the clip shows now and makes it this slot's frame. */
  async capture(i: number) {
    const el = this.clipEl(i);
    const slot = this.slots[i];
    if (!el || !slot) return;
    slot.busy = true;
    try {
      await whenSettled(el);
      this.#setFrame(i, grabFrame(el, i), slot.label);
    } catch (err) {
      ui.toast(captureErrorMessage(err), 'error');
    } finally {
      slot.busy = false;
    }
  }

  /** A still of what the open session's video for this slot shows right now. */
  sampleSession(i: number, quiet = false): boolean {
    const v = session.current?.videos[i];
    const el = v ? playback.element(v.id) : null;
    if (!v || !el || !el.videoWidth) {
      if (!quiet) ui.toast('That video has no picture yet. Open the session and let it load.', 'info');
      return false;
    }
    try {
      this.#setFrame(i, grabFrame(el, i), v.title);
      return true;
    } catch (err) {
      if (!quiet) ui.toast(captureErrorMessage(err), 'error');
      return false;
    }
  }

  #setFrame(i: number, frame: SampledFrame, label: string) {
    const slot = this.slots[i];
    if (!slot) return;
    if (slot.frame) slot.history = [slot.frame, ...slot.history].slice(0, HISTORY_LIMIT);
    slot.frame = frame;
    slot.label = label;
  }

  /** Brings an earlier still back as the frame being aligned; the current one goes into the history. */
  useFrame(i: number, id: ID) {
    const slot = this.slots[i];
    const f = slot?.history.find((x) => x.id === id);
    if (!slot || !f) return;
    slot.history = [...(slot.frame ? [slot.frame] : []), ...slot.history.filter((x) => x.id !== id)].slice(0, HISTORY_LIMIT);
    slot.frame = f;
  }

  clearFrame(i: number) {
    const slot = this.slots[i];
    if (slot) slot.frame = null;
  }

  /* ── saving ──────────────────────────────────────────────── */

  /** Writes the preset, replacing the one being edited. */
  async save(): Promise<Preset> {
    this.saving = true;
    try {
      const snap = $state.snapshot(this.slots) as StudioSlot[];
      const thumbnail = await composeThumbnail(snap, this.canvas);
      return await presets.save({
        id: this.editingId ?? undefined,
        name: this.name.trim().slice(0, 48) || 'Untitled preset',
        layoutType: 'custom',
        slots: snap.map((s) => ({ ...s.t, crop: { ...s.t.crop } })),
        canvasAspect: this.canvas,
        thumbnail
      });
    } finally {
      this.saving = false;
    }
  }

  /* ── clean-up ────────────────────────────────────────────── */

  #release(i: number) {
    const c = this.#clips.get(i);
    if (!c) return;
    c.el.removeAttribute('src');
    c.el.load();
    if (c.objectUrl) URL.revokeObjectURL(c.objectUrl);
    this.#clips.delete(i);
    this.clipRev++;
    const slot = this.slots[i];
    if (slot) slot.clip = false;
  }

  #dropClips() {
    for (const i of [...this.#clips.keys()]) this.#release(i);
  }

  dispose() {
    this.#dropClips();
  }
}
