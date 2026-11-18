/**
 * Reads a video's duration, size and a representative still without putting it
 * on screen. Used by the New Session stepper and the studio's source loader.
 *
 * Remote hosts that refuse CORS still give duration and size; only the still
 * (which needs pixel access) is skipped.
 */
export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  /** JPEG data URL, or undefined when the picture could not be read back. */
  thumb?: string;
}

function seekTo(el: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    el.addEventListener('seeked', done, { once: true });
    setTimeout(done, 1500);
    el.currentTime = t;
  });
}

export async function probeVideo(src: string, opts: { crossOrigin?: boolean } = {}): Promise<ProbeResult> {
  const el = document.createElement('video');
  el.muted = true;
  el.preload = 'auto';
  el.playsInline = true;
  if (opts.crossOrigin) el.crossOrigin = 'anonymous';

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('This video took too long to load.')), 15000);
      el.addEventListener(
        'loadedmetadata',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      el.addEventListener(
        'error',
        () => {
          clearTimeout(timer);
          reject(new Error('This browser cannot play that file. Try MP4 (H.264) or WebM.'));
        },
        { once: true }
      );
      el.src = src;
    });

    const result: ProbeResult = { duration: Number.isFinite(el.duration) ? el.duration : 0, width: el.videoWidth, height: el.videoHeight };
    try {
      await seekTo(el, Math.min(1, Math.max(0, result.duration / 3)));
      const edge = 320;
      const scale = Math.min(1, edge / Math.max(el.videoWidth, el.videoHeight, 1));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(el.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(el.videoHeight * scale));
      canvas.getContext('2d')!.drawImage(el, 0, 0, canvas.width, canvas.height);
      result.thumb = canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      /* tainted canvas or a seek that never landed: the metadata is enough */
    }
    return result;
  } finally {
    el.removeAttribute('src');
    el.load();
  }
}
