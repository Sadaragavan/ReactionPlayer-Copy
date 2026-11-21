/**
 * File persistence in the app's data folder (`app.getPath('userData')`):
 *
 *   settings.json        flat key → value object (preferences, last session id)
 *   presets.json         the user's custom presets
 *   sessions/<id>.json   one file per session
 *   thumbnails/          session and preset thumbnails, kept out of the JSON
 *   wallpapers/          the Home wallpaper and a small meta file
 *
 * Every write is atomic (temp file + rename) and writes to the same file are
 * queued, so a crash or a quick close can never leave half a file behind.
 * No Electron import: the root folder is passed in, which keeps this testable.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StoredWallpaper } from '../src/shared/api';
import { toMediaUrl } from '../src/shared/mediaUrl';

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/i;
const THUMB_EXT = ['jpg', 'png', 'webp'] as const;
const EXT_OF: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
const MIME_OF: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Writes `data` to `file` so that readers see either the old file or the new one, never a mix. */
export async function writeFileAtomic(file: string, data: string | Uint8Array): Promise<void> {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, data);
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

function decodeImage(dataUrl: string): { bytes: Buffer; ext: string } | null {
  const m = IMAGE_DATA_URL.exec(dataUrl);
  if (!m) return null;
  return { bytes: Buffer.from(m[2].replace(/\s/g, ''), 'base64'), ext: EXT_OF[m[1].toLowerCase()] };
}

export class Storage {
  readonly #root: string;
  readonly #chains = new Map<string, Promise<unknown>>();
  readonly #pending = new Set<Promise<unknown>>();

  constructor(root: string) {
    this.#root = root;
  }

  get root(): string {
    return this.#root;
  }

  #p = (...parts: string[]) => join(this.#root, ...parts);

  /** Serialises work per key (a file) and remembers it, so `idle()` can wait for it. */
  #queue<T>(key: string, job: () => Promise<T>): Promise<T> {
    const prev = this.#chains.get(key) ?? Promise.resolve();
    const run = prev.then(job, job);
    const tail = run.catch(() => undefined);
    this.#chains.set(key, tail);
    this.#pending.add(tail);
    void tail.then(() => {
      this.#pending.delete(tail);
      if (this.#chains.get(key) === tail) this.#chains.delete(key);
    });
    return run;
  }

  /** Resolves when every write started so far has finished (used before the app quits). */
  async idle(): Promise<void> {
    while (this.#pending.size) await Promise.all([...this.#pending]);
  }

  async #ensure(...dirs: string[]): Promise<void> {
    await mkdir(this.#p(...dirs), { recursive: true });
  }

  /** Reads JSON; a missing file is null, an unreadable one is moved aside (never deleted) and reported as null. */
  async #readJson(file: string): Promise<unknown | null> {
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch {
      return null;
    }
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      await rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
      return null;
    }
  }

  /* ── thumbnails ── */

  async #writeThumb(base: string, dataUrl: unknown): Promise<void> {
    await this.#ensure('thumbnails');
    await this.#removeThumb(base);
    if (typeof dataUrl !== 'string') return;
    const img = decodeImage(dataUrl);
    if (!img || !(THUMB_EXT as readonly string[]).includes(img.ext)) return;
    await writeFileAtomic(this.#p('thumbnails', `${base}.${img.ext}`), img.bytes);
  }

  async #removeThumb(base: string): Promise<void> {
    await Promise.all(THUMB_EXT.map((e) => rm(this.#p('thumbnails', `${base}.${e}`), { force: true })));
  }

  async #readThumb(base: string): Promise<string | undefined> {
    for (const ext of THUMB_EXT) {
      try {
        const bytes = await readFile(this.#p('thumbnails', `${base}.${ext}`));
        return `data:${MIME_OF[ext]};base64,${bytes.toString('base64')}`;
      } catch {
        /* try the next extension */
      }
    }
    return undefined;
  }

  /* ── settings ── */

  async readSettings(): Promise<Json | null> {
    const v = await this.#readJson(this.#p('settings.json'));
    return isObj(v) ? v : null;
  }

  writeSettings(data: Json): Promise<void> {
    return this.#queue('settings.json', async () => {
      await this.#ensure();
      await writeFileAtomic(this.#p('settings.json'), JSON.stringify(data, null, 2));
    });
  }

  /* ── sessions ── */

  async readSession(id: string): Promise<unknown | null> {
    if (!ID.test(id)) return null;
    const v = await this.#readJson(this.#p('sessions', `${id}.json`));
    if (!isObj(v)) return null;
    const thumbnail = await this.#readThumb(id);
    return thumbnail ? { ...v, thumbnail } : v;
  }

  async listSessions(): Promise<unknown[]> {
    let names: string[];
    try {
      names = await readdir(this.#p('sessions'));
    } catch {
      return [];
    }
    const out = await Promise.all(names.filter((n) => n.endsWith('.json')).map((n) => this.readSession(n.slice(0, -5))));
    return out.filter((s) => s !== null);
  }

  writeSession(id: string, session: unknown): Promise<void> {
    if (!ID.test(id)) return Promise.reject(new Error('Invalid session id.'));
    if (!isObj(session)) return Promise.reject(new Error('A session must be an object.'));
    return this.#queue(`sessions/${id}`, async () => {
      await this.#ensure('sessions');
      const { thumbnail, ...rest } = session;
      await this.#writeThumb(id, thumbnail);
      await writeFileAtomic(this.#p('sessions', `${id}.json`), JSON.stringify(rest, null, 2));
    });
  }

  deleteSession(id: string): Promise<void> {
    if (!ID.test(id)) return Promise.resolve();
    return this.#queue(`sessions/${id}`, async () => {
      await rm(this.#p('sessions', `${id}.json`), { force: true });
      await this.#removeThumb(id);
    });
  }

  /* ── presets ── */

  async readPresets(): Promise<unknown[]> {
    const v = await this.#readJson(this.#p('presets.json'));
    if (!Array.isArray(v)) return [];
    return Promise.all(
      v.filter(isObj).map(async (p) => {
        const id = typeof p.id === 'string' && ID.test(p.id) ? p.id : null;
        const thumbnail = id ? await this.#readThumb(`preset-${id}`) : undefined;
        return thumbnail ? { ...p, thumbnail } : p;
      })
    );
  }

  writePresets(presets: unknown[]): Promise<void> {
    return this.#queue('presets.json', async () => {
      await this.#ensure();
      const list = presets.filter(isObj);
      const keep = new Set<string>();
      const stripped: Json[] = [];
      for (const p of list) {
        const { thumbnail, ...rest } = p;
        stripped.push(rest);
        if (typeof p.id === 'string' && ID.test(p.id)) {
          keep.add(`preset-${p.id}`);
          await this.#writeThumb(`preset-${p.id}`, thumbnail);
        }
      }
      // Thumbnails of deleted presets go with them.
      try {
        for (const name of await readdir(this.#p('thumbnails'))) {
          const base = name.replace(/\.[a-z]+$/, '');
          if (base.startsWith('preset-') && !keep.has(base)) await rm(this.#p('thumbnails', name), { force: true });
        }
      } catch {
        /* no thumbnails folder yet */
      }
      await writeFileAtomic(this.#p('presets.json'), JSON.stringify(stripped, null, 2));
    });
  }

  /* ── wallpaper ── */

  async readWallpaper(): Promise<StoredWallpaper | null> {
    const meta = await this.#readJson(this.#p('wallpapers', 'wallpaper.json'));
    if (!isObj(meta)) return null;
    const type = meta.type === 'gif' ? 'gif' : 'image';
    const name = typeof meta.name === 'string' ? meta.name : undefined;
    if (typeof meta.file === 'string' && /^[\w.-]+$/.test(meta.file)) {
      return { type, name, url: toMediaUrl(this.#p('wallpapers', meta.file)) };
    }
    return typeof meta.url === 'string' ? { type, name, url: meta.url } : null;
  }

  writeWallpaper(w: StoredWallpaper): Promise<StoredWallpaper> {
    return this.#queue('wallpapers', async () => {
      await this.#ensure('wallpapers');
      await this.#clearWallpaperFiles();
      const meta: Json = { type: w.type === 'gif' ? 'gif' : 'image', name: w.name };
      const img = w.url.startsWith('data:') ? decodeImage(w.url) : null;
      if (w.url.startsWith('data:') && !img) throw new Error('That is not a supported picture.');
      if (img) {
        // A new file name every time, so the page never shows a cached copy of the old wallpaper.
        const file = `wallpaper-${Date.now()}.${img.ext}`;
        await writeFileAtomic(this.#p('wallpapers', file), img.bytes);
        meta.file = file;
      } else {
        meta.url = w.url;
      }
      await writeFileAtomic(this.#p('wallpapers', 'wallpaper.json'), JSON.stringify(meta, null, 2));
      return { type: meta.type as StoredWallpaper['type'], name: w.name, url: img ? toMediaUrl(this.#p('wallpapers', meta.file as string)) : w.url };
    });
  }

  deleteWallpaper(): Promise<void> {
    return this.#queue('wallpapers', () => this.#clearWallpaperFiles());
  }

  async #clearWallpaperFiles(): Promise<void> {
    try {
      for (const name of await readdir(this.#p('wallpapers'))) await rm(this.#p('wallpapers', name), { force: true });
    } catch {
      /* nothing stored yet */
    }
  }

  /* ── everything ── */

  async clearAll(): Promise<void> {
    await this.idle();
    await Promise.all(
      ['settings.json', 'presets.json', 'sessions', 'thumbnails', 'wallpapers', 'cache'].map((n) => rm(this.#p(n), { recursive: true, force: true }))
    );
  }
}
