/**
 * Running ffmpeg. The app ships one (`@ffmpeg-installer/ffmpeg`) because Chromium cannot decode the audio on many
 * movie and anime releases (AC-3, E-AC-3, DTS, TrueHD); a system `ffmpeg` on the PATH is the fallback.
 * No Electron import, so it is testable.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

let cached: Promise<string | null> | null = null;

function run(bin: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const p = spawn(bin, args, { stdio: 'ignore', windowsHide: true });
      p.on('error', () => resolve(false));
      p.on('exit', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

/** The ffmpeg to use: the bundled one (unpacked from the asar archive when packaged), else `ffmpeg` from the PATH, else null. */
export function findFfmpeg(): Promise<string | null> {
  cached ??= (async () => {
    try {
      const bundled = (createRequire(import.meta.url)('@ffmpeg-installer/ffmpeg') as { path: string }).path.replace('app.asar', 'app.asar.unpacked');
      if (await run(bundled, ['-version'])) return bundled;
    } catch {
      /* not installed for this platform */
    }
    return (await run('ffmpeg', ['-version'])) ? 'ffmpeg' : null;
  })();
  return cached;
}

const clock = (h: string, m: string, s: string) => Number(h) * 3600 + Number(m) * 60 + Number(s);

/**
 * Runs ffmpeg with `args` (put `-progress pipe:1 -nostats` among them for progress) and resolves when it exits cleanly.
 * `onProgress` gets the fraction done, once ffmpeg has reported the input's length.
 */
export function runFfmpeg(bin: string, args: string[], onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let total = 0;
    let err = '';
    p.stderr.on('data', (d: Buffer) => {
      err = (err + d.toString()).slice(-4000);
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      if (m && !total) total = clock(m[1], m[2], m[3]);
    });
    p.stdout.on('data', (d: Buffer) => {
      for (const m of d.toString().matchAll(/out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)) {
        if (total > 0) onProgress?.(Math.min(1, clock(m[1], m[2], m[3]) / total));
      }
    });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`))));
  });
}
