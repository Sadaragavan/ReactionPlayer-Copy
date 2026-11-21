/**
 * A separate audio element that plays along with a video, for the tracks Chromium cannot decode itself: the track is
 * converted to AAC once (`electron/proxy.ts`) and this plays the copy, following the video's play, pause, seek, speed and
 * volume, and pulling itself back whenever it drifts more than a few frames.
 */
const MAX_DRIFT_S = 0.12;

export class SidecarAudio {
  readonly audio = new Audio();
  readonly #off: (() => void)[] = [];
  readonly #timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly video: HTMLVideoElement,
    url: string
  ) {
    const a = this.audio;
    a.preload = 'auto';
    a.preservesPitch = true;
    a.src = url;
    this.#mirrorSettings();
    const on = (type: string, fn: () => void) => {
      video.addEventListener(type, fn);
      this.#off.push(() => video.removeEventListener(type, fn));
    };
    on('volumechange', () => this.#mirrorSettings());
    on('ratechange', () => this.#mirrorSettings());
    on('seeked', () => this.#follow(true));
    on('playing', () => this.#follow(true));
    on('pause', () => a.pause());
    on('waiting', () => a.pause());
    on('emptied', () => a.pause());
    this.#timer = setInterval(() => this.#follow(false), 200);
    this.#follow(true);
  }

  #mirrorSettings(): void {
    this.audio.volume = this.video.volume;
    this.audio.muted = this.video.muted;
    this.audio.playbackRate = this.video.playbackRate;
  }

  /** Starts, stops or re-aligns the audio to match the video. */
  #follow(hard: boolean): void {
    const v = this.video;
    const a = this.audio;
    if (v.paused || v.ended || v.seeking || v.readyState < 2) {
      if (!a.paused) a.pause();
      if (hard && Number.isFinite(v.currentTime) && Math.abs(a.currentTime - v.currentTime) > 0.02) a.currentTime = v.currentTime;
      return;
    }
    if (hard || Math.abs(a.currentTime - v.currentTime) > MAX_DRIFT_S) a.currentTime = v.currentTime;
    if (a.paused) void a.play().catch(() => undefined);
  }

  dispose(): void {
    clearInterval(this.#timer);
    for (const off of this.#off) off();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
  }
}
