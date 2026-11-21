/**
 * Playable copies of what Chromium cannot play. A file whose audio is AC-3, E-AC-3, DTS or TrueHD has a silent
 * track as far as Chromium is concerned, so that one track is converted to AAC (small and quick: the video is not
 * touched) and kept in the cache folder; the player plays it alongside the video. Nothing is ever written next to
 * the user's files.
 */
import { createHash } from 'node:crypto';
import { mkdir, readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { findFfmpeg, runFfmpeg } from './ffmpeg';

export class Proxies {
  readonly #jobs = new Map<string, Promise<string>>();

  constructor(private readonly dir: string) {}

  /** The AAC copy (a `.m4a` file) of the `index`-th audio track of `path`. Converts on the first request, then reuses it. */
  async audio(path: string, index: number, onProgress?: (fraction: number) => void): Promise<string> {
    const info = await stat(path);
    const key = createHash('sha1').update(`${path}|${info.size}|${info.mtimeMs}|a${index}`).digest('hex').slice(0, 24);
    const out = join(this.dir, `${key}.m4a`);
    try {
      await stat(out);
      void utimes(out, new Date(), new Date()).catch(() => undefined);
      return out;
    } catch {
      /* not converted yet */
    }
    const running = this.#jobs.get(key);
    if (running) return running;
    const job = (async () => {
      const ffmpeg = await findFfmpeg();
      if (!ffmpeg) throw new Error('ffmpeg is not available, so this audio cannot be converted.');
      await mkdir(this.dir, { recursive: true });
      const part = `${out}.part`;
      try {
        await runFfmpeg(
          ffmpeg,
          ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', path, '-map', `0:a:${index}`, '-vn', '-sn', '-dn', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-y', '-f', 'mp4', part],
          onProgress
        );
        await rename(part, out);
      } catch (err) {
        await rm(part, { force: true }).catch(() => undefined);
        throw err;
      }
      return out;
    })().finally(() => this.#jobs.delete(key));
    this.#jobs.set(key, job);
    return job;
  }

  /** Deletes converted audio that has not been used for `days` days. */
  async prune(days = 30): Promise<void> {
    try {
      const limit = Date.now() - days * 86_400_000;
      for (const name of await readdir(this.dir)) {
        const file = join(this.dir, name);
        if ((await stat(file)).mtimeMs < limit) await rm(file, { force: true });
      }
    } catch {
      /* no cache yet */
    }
  }
}
