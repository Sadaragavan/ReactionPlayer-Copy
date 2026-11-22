/**
 * PlaybackEngine — the shared clock, the transport and the drift correction.
 *
 * Linked mode
 *   One master clock `T` (the master video's playhead, in seconds; negative when
 *   another video starts first). Video v plays at `T + offsetMs/1000`. While the
 *   master has footage it *is* the clock; outside its range a virtual clock
 *   (rAF delta time) keeps the timeline moving so the other videos can play on.
 *   Each follower is checked against the clock on every frame the master
 *   presents (requestVideoFrameCallback) and falls back to a rAF check when the
 *   master is parked: small drift is absorbed by a ±8 % playbackRate nudge
 *   (inaudible, no skipped frame), large drift by a hard seek.
 *
 *   Videos need not be the same length. The timeline is the union of all footage
 *   (`range`); a video outside its own footage waits on its first or last frame,
 *   playback ends only when every video has ended, a single step follows the
 *   video that is on screen, and while the master has no footage its sound is
 *   lent to the first video that does (`#lent`).
 *
 * Unlinked mode
 *   Every element plays on its own; the HUD scrubs and steps them one by one so
 *   offsets can be dialled in by eye. Linking then captures those playheads.
 */
import { FALLBACK_FPS, HARD_SEEK_THRESHOLD_S } from '../constants';
import { session } from '../stores/session.svelte';
import { settings } from '../stores/settings.svelte';
import type { ID, SessionVideo } from '../types';
import { copyCanvasToClipboard } from '../utils/file';
import { clamp } from '../utils/geometry';
import { canvasRatio, captureFrame, composeStage, type StageLayer } from './capture';
import { audioProxy } from './audioProxy.svelte';
import { mediaTracks } from './mediaTracks.svelte';
import { sourceIndexAt, sourceRange } from './playlist';
import { SidecarAudio } from './sidecar';
import { clampLocal, frameCentre, frameIndexAt, isActive, planCorrection, timelineRange, type TimelineVideo } from './timeline';
import { type FrameMeta, Track } from './track';

const noop = () => {};
const RATE_MIN = 0.0625;
const RATE_MAX = 16;

class PlaybackEngine {
  /** Linked: the shared clock is running. */
  playing = $state(false);
  /** Linked clock in master-local seconds. */
  clock = $state(0);
  /** Each video's own playhead (drives the unlinked scrubbers). */
  times = $state<Record<ID, number>>({});
  /** Whether each element is playing right now. */
  running = $state<Record<ID, boolean>>({});
  dims = $state<Record<ID, { w: number; h: number }>>({});
  fps = $state<Record<ID, number>>({});
  /** Elements the browser could not decode (e.g. an unsupported codec). */
  failed = $state<Record<ID, boolean>>({});
  /** The master is waiting for data. */
  buffering = $state(false);

  #tracks = new Map<ID, Track>();
  #raf = 0;
  #lastNow = 0;
  #lastSync = 0;
  #lastPersist = 0;
  #thumbTimer: ReturnType<typeof setTimeout> | null = null;
  /** Linked: the video heard in place of a master that has no footage right now. */
  #lent: ID | null = null;

  /* ── read side ── */

  get range() {
    return timelineRange(this.timelineVideos());
  }

  /** The videos as the timeline sees them: a source playlist counts for the whole stretch it covers, not just the current episode. */
  timelineVideos(): TimelineVideo[] {
    return (session.current?.videos ?? []).map((v) => {
      const span = v.sources ? sourceRange(session.spansOf(v)) : null;
      return span ? { ...v, span } : v;
    });
  }
  get anyRunning(): boolean {
    const s = session.current;
    if (!s) return false;
    return s.isLinked ? this.playing : Object.values(this.running).some(Boolean);
  }
  element(id: ID): HTMLVideoElement | null {
    return this.#tracks.get(id)?.el ?? null;
  }
  frameDur(id: ID): number {
    return this.#tracks.get(id)?.frameDur ?? 1 / FALLBACK_FPS;
  }

  /* ── lifecycle ── */

  /** Call once when a session is shown, before its <video> elements mount. */
  bind(): void {
    const s = session.current;
    if (!s) return;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.playing = false;
    this.running = {};
    this.failed = {};
    this.buffering = false;
    this.#lent = null;
    this.clock = s.clock ?? session.master?.currentTime ?? 0;
    this.#fitClock();
    this.times = Object.fromEntries(s.videos.map((v) => [v.id, v.currentTime]));
  }

  /** Registers a <video> for a session video id; returns the cleanup. Used via `use:video`. */
  attach(id: ID, el: HTMLVideoElement): () => void {
    const track = new Track(id, el, {
      onMeta: (t) => this.#onMeta(t),
      onFrame: (t, m) => this.#onFrame(t, m),
      onState: (t) => this.#onState(t)
    });
    this.#tracks.set(id, track);
    el.preservesPitch = true;
    el.disablePictureInPicture = true;
    this.applyProps();
    if (el.readyState >= 1) this.#onMeta(track);
    return () => {
      this.#sidecars.get(id)?.dispose();
      this.#sidecars.delete(id);
      this.#audioToken.set(id, (this.#audioToken.get(id) ?? 0) + 1);
      audioProxy.forget(id);
      track.destroy();
      this.#tracks.delete(id);
      delete this.running[id];
      delete this.times[id];
    };
  }

  /** Pauses everything and stores the position. Call when leaving the session page. */
  release(): void {
    this.pause();
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    if (this.#thumbTimer) clearTimeout(this.#thumbTimer);
  }

  /* ── transport ── */

  async play(): Promise<void> {
    const s = session.current;
    if (!s) return;
    if (s.isLinked) {
      const r = this.range;
      if (r.end > r.start && this.clock >= r.end - 0.05) this.clock = r.start;
      this.playing = true;
      this.#lastNow = performance.now();
      this.#syncLinked(true);
    } else {
      const all = [...this.#tracks.values()];
      const live = all.filter((t) => !t.el.ended);
      for (const t of live.length ? live : all) void t.el.play().catch(noop);
    }
    this.#loop();
  }

  pause(): void {
    if (!session.current) return;
    this.playing = false;
    for (const t of this.#tracks.values()) if (!t.el.paused) t.el.pause();
    this.#updateLent();
    this.#settleClock();
    this.#syncRunning();
    this.#tick();
    this.#persist(true);
    this.#scheduleThumb();
  }

  /**
   * The clock is sampled once per animation frame, so at the instant of a pause it
   * can trail the picture by up to a frame. Re-reading the element makes the very
   * first single-step after a pause move by exactly one frame. The picture that
   * counts is the master's while it has footage, else the first video that does.
   */
  #settleClock(): void {
    const ref = this.#reference();
    const el = ref ? this.#tracks.get(ref.id)?.el : null;
    if (ref && el && session.current?.isLinked && el.readyState >= 2 && !el.seeking && isActive(ref, this.clock)) {
      this.clock = el.currentTime - ref.offsetMs / 1000;
    }
  }

  /** The video whose picture and frame grid a single step follows: the master while it has footage, else the first video that does. */
  #reference(): SessionVideo | null {
    const s = session.current;
    const master = session.master;
    if (!s || !master) return null;
    if (isActive(master, this.clock)) return master;
    return s.videos.find((v) => isActive(v, this.clock)) ?? master;
  }

  /**
   * Keeps the playhead inside the footage after something moved its edges (an offset, a duration that has just
   * become known). Waits until every duration is known, so a half-loaded session cannot clip a saved position.
   */
  #fitClock(): void {
    const s = session.current;
    if (!s?.isLinked || !s.videos.every((v) => v.duration > 0)) return;
    const r = this.range;
    const c = clamp(this.clock, r.start, r.end);
    if (c !== this.clock) this.clock = c;
  }

  toggle(): void {
    if (this.anyRunning) this.pause();
    else void this.play();
  }

  /** Unlinked: play or pause a single video. */
  toggleVideo(id: ID): void {
    const el = this.element(id);
    if (!el) return;
    if (el.paused) void el.play().catch(noop);
    else el.pause();
  }

  /** Linked: move the shared clock. */
  seek(t: number): void {
    const r = this.range;
    this.clock = clamp(t, r.start, Math.max(r.start, r.end));
    this.#syncLinked(true);
    this.#tick();
    this.#persist(false);
    this.#scheduleThumb();
  }

  /** Unlinked: move one video. */
  seekVideo(id: ID, t: number): void {
    const v = session.video(id);
    const el = this.element(id);
    if (!v || !el) return;
    el.currentTime = clamp(t, 0, Math.max(0, (el.duration || v.duration) - 0.001));
    this.times[id] = el.currentTime;
    this.#persist(false);
    this.#scheduleThumb();
  }

  /**
   * ← / → : jump by seconds while playing, by a frame while paused. Unlinked, `id` limits it to one clip
   * (the active one); without it every clip moves.
   */
  skip(seconds: number, id?: ID): void {
    const s = session.current;
    if (!s) return;
    if (!s.isLinked && id) {
      if (!this.running[id]) return void this.step(Math.sign(seconds), id);
      return this.seekVideo(id, (this.element(id)?.currentTime ?? 0) + seconds);
    }
    if (!this.anyRunning) return void this.step(Math.sign(seconds));
    if (s.isLinked) return this.seek(this.clock + seconds);
    for (const v of s.videos) this.seekVideo(v.id, (this.element(v.id)?.currentTime ?? 0) + seconds);
  }

  /** Single-frame step. Linked: the shared clock; unlinked: `id`, or every video. */
  async step(n: number, id?: ID): Promise<void> {
    const s = session.current;
    if (!s || !n) return;
    this.pause();
    if (id || !s.isLinked) {
      for (const v of id ? [{ id }] : s.videos) {
        const tr = this.#tracks.get(v.id);
        if (!tr) continue;
        await tr.measure();
        this.fps[v.id] = tr.fps;
        const k = frameIndexAt(tr.el.currentTime, tr.frameDur);
        this.seekVideo(v.id, frameCentre(k + n, tr.frameDur));
      }
      return;
    }
    // Linked: one frame of the video that is on screen, on that video's own frame grid.
    const ref = this.#reference();
    const tr = ref ? this.#tracks.get(ref.id) : undefined;
    if (ref && tr) {
      await tr.measure();
      this.fps[ref.id] = tr.fps;
    }
    const fd = tr?.frameDur ?? 1 / FALLBACK_FPS;
    const off = (ref?.offsetMs ?? 0) / 1000;
    this.seek(frameCentre(frameIndexAt(this.clock + off, fd) + n, fd) - off);
  }

  /* ── linking and offsets ── */

  setLinked(on: boolean): void {
    const s = session.current;
    if (!s || s.isLinked === on) return;
    const wasRunning = this.anyRunning;
    if (on) {
      const locals = this.#locals();
      session.setLinked(true, locals);
      this.clock = locals[s.masterId] ?? this.clock;
      this.playing = wasRunning;
      this.#lastNow = performance.now();
      this.#syncLinked(true);
      this.#loop();
    } else {
      session.setLinked(false);
      this.playing = false;
      this.#updateLent();
      this.#syncRunning();
    }
    this.#tick();
  }

  nudgeOffset(id: ID, deltaMs: number): void {
    session.nudgeOffset(id, deltaMs);
    this.refresh();
  }

  setOffset(id: ID, ms: number): void {
    session.setOffset(id, ms);
    this.refresh();
  }

  /**
   * Makes `id` the clock and the only audible video. The shared clock is
   * re-expressed in the new master's own time, so nothing jumps on screen.
   */
  setMaster(id: ID): void {
    const s = session.current;
    const v = session.video(id);
    if (!s || !v || s.masterId === id) return;
    const shift = v.offsetMs / 1000;
    session.setMaster(id);
    if (s.isLinked) this.clock += shift;
    this.refresh();
  }

  /** Re-places every element after something it depends on changed (an offset, the master). */
  refresh(): void {
    this.#fitClock();
    if (session.current?.isLinked) this.#syncLinked(true);
    this.#tick();
  }

  /**
   * Pushes volume, mute and speed from the store onto the elements. Call from an `$effect`.
   * A video that is being lent the master's sound takes the master's volume and mute instead of its own.
   */
  applyProps(): void {
    const s = session.current;
    if (!s) return;
    // Read unconditionally, so the effect that calls this also re-runs when the master's volume changes while its sound is lent.
    const master = session.master;
    const heard = { muted: master?.muted ?? false, volume: master?.volume ?? 1 };
    for (const v of s.videos) {
      const tr = this.#tracks.get(v.id);
      if (!tr || tr.probing) continue;
      const el = tr.el;
      const lent = v.id === this.#lent;
      const volume = lent ? heard.volume : v.volume;
      const muted = lent ? heard.muted : v.muted;
      if (el.volume !== volume) el.volume = volume;
      if (el.muted !== muted) el.muted = muted;
      if (!tr.correcting && el.playbackRate !== v.playbackRate) el.playbackRate = clamp(v.playbackRate, RATE_MIN, RATE_MAX);
    }
  }

  /* ── pictures ── */

  /** Copies what a layer is showing (respecting its crop) to the clipboard as a PNG. */
  async copyFrame(id: ID): Promise<void> {
    const tr = this.#tracks.get(id);
    const t = session.current?.alignment.coordinates[id];
    if (!tr || !t) throw new Error('That video is not loaded.');
    await copyCanvasToClipboard(captureFrame(tr.el, t.crop));
  }

  /** A composite of the stage as it looks now, or null when the browser blocks pixel access. */
  thumbnail(width = 480): string | null {
    const s = session.current;
    if (!s) return null;
    try {
      const layers: StageLayer[] = s.videos.map((v) => {
        const el = this.#tracks.get(v.id)?.el;
        const t = s.alignment.coordinates[v.id];
        return {
          role: v.role,
          zIndex: t.zIndex,
          hidden: t.hidden,
          rect: { x: t.x, y: t.y, w: t.w, h: t.h },
          crop: t.crop,
          fit: t.fit,
          opacity: t.opacity,
          image: el && el.readyState >= 2 ? el : null,
          width: el?.videoWidth ?? 0,
          height: el?.videoHeight ?? 0
        };
      });
      return composeStage(layers, canvasRatio(s.canvasAspect), width).toDataURL('image/jpeg', 0.72);
    } catch {
      return null;
    }
  }

  /* ── internals: events ── */

  /** Converted-audio players for tracks Chromium cannot decode, by layer id. */
  readonly #sidecars = new Map<ID, SidecarAudio>();
  /** Bumped on every refresh, so a slow conversion cannot apply to a choice the user has since changed. */
  readonly #audioToken = new Map<ID, number>();

  /**
   * Makes the layer play the audio track it is set to (a file may hold several: languages, commentary). A track Chromium
   * can decode is switched on in the video itself. One it cannot (AC-3, E-AC-3, DTS, TrueHD) is converted to AAC and played
   * by a separate element that follows the video. Call after the video loads and after the choice changes.
   */
  async refreshAudio(id: ID): Promise<void> {
    const v = session.video(id);
    const el = this.#tracks.get(id)?.el;
    if (!v || !el) return;
    const token = (this.#audioToken.get(id) ?? 0) + 1;
    this.#audioToken.set(id, token);
    const native = (el as HTMLVideoElement & { audioTracks?: { length: number; [i: number]: { enabled: boolean } } }).audioTracks;
    const setNative = (index: number | null) => {
      if (native) for (let i = 0; i < native.length; i++) native[i].enabled = i === index;
    };
    const stop = () => {
      this.#sidecars.get(id)?.dispose();
      this.#sidecars.delete(id);
      audioProxy.forget(id);
    };

    const mediaId = session.mediaIdOf(v);
    const probe = await mediaTracks.prefetch(mediaId, v.filePath);
    if (this.#audioToken.get(id) !== token) return;
    const tracks = probe?.audio ?? [];
    if (!tracks.length) {
      // Nothing read from the container (a browser, or a format we do not read): use what Chromium reports.
      stop();
      if (native && v.audioTrack !== undefined && v.audioTrack < native.length) setNative(v.audioTrack);
      return;
    }
    const want = v.audioTrack !== undefined && tracks[v.audioTrack] ? v.audioTrack : (tracks.find((t) => t.isDefault)?.index ?? 0);
    const track = tracks[want];
    if (track.playable) {
      stop();
      // Chromium lists only the tracks it can decode, in order.
      setNative(tracks.filter((t) => t.playable && t.index < want).length);
      return;
    }
    setNative(null);
    if (!v.filePath) return;
    const url = await audioProxy.ensure(id, v.filePath, want, v.title);
    if (this.#audioToken.get(id) !== token) return;
    this.#sidecars.get(id)?.dispose();
    this.#sidecars.delete(id);
    if (url) this.#sidecars.set(id, new SidecarAudio(el, url));
  }

  #onMeta(t: Track): void {
    const { el, id } = t;
    delete this.failed[id];
    if (el.videoWidth) this.dims[id] = { w: el.videoWidth, h: el.videoHeight };
    if (Number.isFinite(el.duration)) session.setDuration(id, el.duration);
    void this.refreshAudio(id);
    this.#fitClock();
    const v = session.video(id);
    if (v && !this.running[id] && !this.playing) {
      const at = session.current?.isLinked ? clampLocal(v, this.clock) : v.currentTime;
      if (Math.abs(el.currentTime - at) > 0.004) el.currentTime = at;
    }
    this.#tick();
  }

  #onFrame(t: Track, _meta: FrameMeta): void {
    if (this.fps[t.id] !== t.fps) this.fps[t.id] = t.fps;
    const s = session.current;
    // Frame-locked sync: the instant the master shows a new picture, check the followers.
    if (s?.isLinked && this.playing && t.id === s.masterId && !t.el.paused) {
      this.#lastSync = performance.now();
      this.clock = t.el.currentTime;
      this.#syncLinked(false);
    }
  }

  #onState(t: Track): void {
    const { el, id } = t;
    this.running[id] = !el.paused && !el.ended;
    if (el.error) this.failed[id] = true;
    // Unlinked: when an episode ends the next one takes its place at once, on its first frame, and waits for the user to play it.
    if (el.ended && session.current && !session.current.isLinked) this.#nextSourceAfterEnd(id);
    if (id === session.current?.masterId) this.buffering = !el.paused && el.readyState < 3 && !el.seeking;
    if (this.anyRunning) this.#loop();
    this.#tick();
  }

  #nextSourceAfterEnd(id: ID): void {
    const v = session.video(id);
    if (!v?.sources) return;
    const next = (v.sourceIndex ?? 0) + 1;
    if (next < v.sources.length) {
      session.activateSource(next);
      // The new episode is not playing, whatever the one before was doing.
      this.running[id] = false;
    }
  }

  /**
   * Linked: shows the episode the clock is in. The next one replaces the previous the moment it ends and sits on its
   * first frame, not playing, until its own start time (or until the user starts it).
   */
  #followPlaylist(): void {
    const v = session.sourceVideo;
    if (!v?.sources) return;
    const index = sourceIndexAt(session.spansOf(v), this.clock);
    if (index !== (v.sourceIndex ?? 0)) {
      session.activateSource(index);
      if (v.waiting) this.running[v.id] = false;
      const tr = this.#tracks.get(v.id);
      if (tr) tr.correcting = false;
    }
  }

  /** Starts the waiting episode now, at the current point of the timeline. Unlinked there is no timeline: it simply plays. */
  startNextSource(): boolean {
    const v = session.sourceVideo;
    const s = session.current;
    if (!v?.sources || !s) return false;
    if (!s.isLinked) {
      this.toggleVideo(v.id);
      return true;
    }
    if (!session.startSource(this.clock)) return false;
    this.refresh();
    if (!this.playing) void this.play();
    return true;
  }

  #syncRunning(): void {
    for (const [id, t] of this.#tracks) this.running[id] = !t.el.paused && !t.el.ended;
  }

  /* ── internals: the loop ── */

  #loop(): void {
    if (this.#raf) return;
    this.#lastNow = performance.now();
    const frame = (now: number) => {
      this.#raf = 0;
      const s = session.current;
      if (!s) return;
      if (s.isLinked && this.playing) {
        this.#advance(now);
        if (this.playing && now - this.#lastSync > 12) this.#syncLinked(false);
      }
      this.#tick();
      this.#persist(false);
      if (this.anyRunning) this.#raf = requestAnimationFrame(frame);
    };
    this.#raf = requestAnimationFrame(frame);
  }

  /** Moves the clock: read from the master while it has footage, else advance a virtual one. */
  #advance(now: number): void {
    const s = session.current!;
    const dt = clamp((now - this.#lastNow) / 1000, 0, 0.25);
    this.#lastNow = now;
    const m = session.master;
    const me = this.#tracks.get(s.masterId)?.el;
    if (m && me && isActive(m, this.clock) && !me.paused && !me.seeking && me.readyState >= 2) this.clock = me.currentTime;
    else this.clock += dt * (m?.playbackRate ?? 1);

    const r = this.range;
    if (r.end > r.start && this.clock >= r.end - 0.001) {
      if (settings.playback.loop) {
        this.clock = r.start;
      } else {
        this.playing = false;
        this.clock = r.end;
      }
      this.#syncLinked(true);
      this.#persist(true);
    }
  }

  /**
   * Puts every element where the clock says it should be.
   * `force` (user seek, play, link) hard-places everything; otherwise only drift is corrected.
   */
  #syncLinked(force: boolean): void {
    const s = session.current;
    if (!s?.isLinked) return;
    const tolerance = settings.playback.syncToleranceMs;
    this.#followPlaylist();
    this.#updateLent();
    for (const v of s.videos) {
      const tr = this.#tracks.get(v.id);
      if (!tr) continue;
      const el = tr.el;
      const target = clampLocal(v, this.clock);

      // Not playing, or this video has no footage at this moment: park it on the right picture.
      if (!this.playing || !isActive(v, this.clock)) {
        if (!el.paused) el.pause();
        tr.correcting = false;
        if (el.playbackRate !== v.playbackRate) el.playbackRate = clamp(v.playbackRate, RATE_MIN, RATE_MAX);
        if (force || Math.abs(el.currentTime - target) > 0.004) el.currentTime = target;
        continue;
      }

      // Playing with footage: start it, or leave the master alone (it is the clock).
      if (force || el.paused) {
        el.currentTime = target;
        el.playbackRate = clamp(v.playbackRate, RATE_MIN, RATE_MAX);
        tr.correcting = false;
        void el.play().catch(noop);
        continue;
      }
      if (v.id === s.masterId) continue;

      const plan = planCorrection(el.currentTime - target, tolerance, HARD_SEEK_THRESHOLD_S, tr.correcting);
      if (plan.kind === 'seek') {
        el.currentTime = target + 0.06 * v.playbackRate; // lead covers the seek latency
        el.playbackRate = clamp(v.playbackRate, RATE_MIN, RATE_MAX);
        tr.correcting = false;
      } else if (plan.kind === 'rate') {
        el.playbackRate = clamp(v.playbackRate * plan.factor, RATE_MIN, RATE_MAX);
        tr.correcting = true;
      } else if (tr.correcting) {
        el.playbackRate = clamp(v.playbackRate, RATE_MIN, RATE_MAX);
        tr.correcting = false;
      }
    }
  }

  /**
   * Linked: while the master has no footage (it has ended, or has not started yet) its sound would just stop although
   * other videos are still playing. The first video that has footage is heard in its place. Nothing is lent while
   * another video is already audible, while paused, or when the preference is off.
   */
  #lendTarget(): ID | null {
    const s = session.current;
    const master = session.master;
    if (!s?.isLinked || !this.playing || !master || !settings.playback.audioFollowsFootage) return null;
    if (isActive(master, this.clock)) return null;
    const active = s.videos.filter((v) => v.id !== master.id && isActive(v, this.clock));
    if (active.some((v) => !v.muted && v.volume > 0)) return null;
    return active[0]?.id ?? null;
  }

  #updateLent(): void {
    const next = this.#lendTarget();
    if (next === this.#lent) return;
    this.#lent = next;
    this.applyProps();
  }

  #tick(): void {
    for (const [id, tr] of this.#tracks) {
      const t = tr.el.currentTime;
      if (this.times[id] !== t) this.times[id] = t;
    }
  }

  #locals(): Record<ID, number> {
    const out: Record<ID, number> = {};
    for (const [id, tr] of this.#tracks) out[id] = tr.el.currentTime;
    return out;
  }

  /** Writes positions to the store: at most once a second while playing, immediately when `now`. */
  #persist(now: boolean): void {
    const t = performance.now();
    if (!now && t - this.#lastPersist < 1000) return;
    this.#lastPersist = t;
    session.recordTimes(this.#locals(), this.clock);
  }

  /** The session browser's preview follows the last thing the user did, not every frame. */
  #scheduleThumb(): void {
    if (this.#thumbTimer) clearTimeout(this.#thumbTimer);
    this.#thumbTimer = setTimeout(() => {
      const url = this.thumbnail();
      if (url) session.setThumbnail(url);
    }, 900);
  }
}

export const playback = new PlaybackEngine();
