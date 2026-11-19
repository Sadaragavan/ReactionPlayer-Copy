import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Storage } from '../electron/storage';
import { fromMediaUrl } from '../src/shared/mediaUrl';

let dir: string;
let store: Storage;
// A 1×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rp-store-'));
  store = new Storage(dir);
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('settings', () => {
  it('is null on first run, then returns what was written', async () => {
    expect(await store.readSettings()).toBeNull();
    await store.writeSettings({ settings: { a: 1 }, 'last-session': 'ses_1' });
    expect(await store.readSettings()).toEqual({ settings: { a: 1 }, 'last-session': 'ses_1' });
  });

  it('keeps the last of several quick writes and leaves no temp files', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.writeSettings({ n: i })));
    expect(await store.readSettings()).toEqual({ n: 19 });
    expect((await readdir(dir)).filter((f) => f.includes('.tmp'))).toEqual([]);
  });

  it('sets a corrupt file aside instead of crashing or deleting it', async () => {
    await writeFile(join(dir, 'settings.json'), '{ nope');
    expect(await store.readSettings()).toBeNull();
    expect((await readdir(dir)).some((f) => f.startsWith('settings.json.corrupt-'))).toBe(true);
  });
});

describe('sessions', () => {
  it('writes one file per session and keeps the thumbnail out of the JSON', async () => {
    await store.writeSession('ses_a', { id: 'ses_a', name: 'A', thumbnail: PNG });
    const raw = JSON.parse(await readFile(join(dir, 'sessions', 'ses_a.json'), 'utf8'));
    expect(raw).toEqual({ id: 'ses_a', name: 'A' });
    expect((await readdir(join(dir, 'thumbnails'))).length).toBe(1);
    expect(await store.readSession('ses_a')).toEqual({ id: 'ses_a', name: 'A', thumbnail: PNG });
  });

  it('lists sessions and deletes them with their thumbnails', async () => {
    await store.writeSession('ses_a', { id: 'ses_a', thumbnail: PNG });
    await store.writeSession('ses_b', { id: 'ses_b' });
    expect((await store.listSessions()).length).toBe(2);
    await store.deleteSession('ses_a');
    expect((await store.listSessions()).length).toBe(1);
    expect(await readdir(join(dir, 'thumbnails'))).toEqual([]);
  });

  it('drops the old thumbnail when a session is saved without one', async () => {
    await store.writeSession('ses_a', { id: 'ses_a', thumbnail: PNG });
    await store.writeSession('ses_a', { id: 'ses_a' });
    expect((await store.readSession('ses_a') as { thumbnail?: string }).thumbnail).toBeUndefined();
  });

  it('refuses ids that could leave the folder', async () => {
    await expect(store.writeSession('../evil', { id: 'x' })).rejects.toThrow();
    await expect(store.writeSession('a/b', { id: 'x' })).rejects.toThrow();
    expect(await store.readSession('../settings')).toBeNull();
  });

  it('keeps zIndex and a file path exactly as written', async () => {
    const session = { id: 'ses_z', videos: [{ id: 'v', filePath: '/clips/a.mp4' }], alignment: { coordinates: { v: { zIndex: 3, hidden: true } } } };
    await store.writeSession('ses_z', session);
    expect(await store.readSession('ses_z')).toEqual(session);
  });
});

describe('presets', () => {
  it('round-trips with thumbnails and removes the thumbnails of deleted presets', async () => {
    await store.writePresets([{ id: 'pre_1', name: 'One', thumbnail: PNG, slots: [{ zIndex: 1 }] }, { id: 'pre_2', name: 'Two' }]);
    const read = (await store.readPresets()) as { id: string; thumbnail?: string }[];
    expect(read.map((p) => p.id)).toEqual(['pre_1', 'pre_2']);
    expect(read[0].thumbnail).toBe(PNG);
    await store.writePresets([{ id: 'pre_2', name: 'Two' }]);
    expect(await readdir(join(dir, 'thumbnails'))).toEqual([]);
  });
});

describe('wallpaper', () => {
  it('stores an upload as a file and hands back a local-media URL', async () => {
    const saved = await store.writeWallpaper({ type: 'image', url: PNG, name: 'w.png' });
    expect(saved.url.startsWith('local-media://media/')).toBe(true);
    const path = fromMediaUrl(saved.url)!;
    expect((await readFile(path)).length).toBeGreaterThan(0);
    expect(await store.readWallpaper()).toEqual(saved);
  });

  it('keeps a pasted link as it is, and replaces the previous file', async () => {
    await store.writeWallpaper({ type: 'image', url: PNG });
    const link = await store.writeWallpaper({ type: 'gif', url: 'https://example.com/a.gif', name: 'a' });
    expect(link).toEqual({ type: 'gif', url: 'https://example.com/a.gif', name: 'a' });
    expect((await readdir(join(dir, 'wallpapers'))).sort()).toEqual(['wallpaper.json']);
  });

  it('rejects something that is not a picture', async () => {
    await expect(store.writeWallpaper({ type: 'image', url: 'data:text/html;base64,PGI+' })).rejects.toThrow();
  });
});

describe('clearAll', () => {
  it('removes everything', async () => {
    await store.writeSettings({ a: 1 });
    await store.writeSession('ses_a', { id: 'ses_a', thumbnail: PNG });
    await store.writePresets([{ id: 'pre_1' }]);
    await store.writeWallpaper({ type: 'image', url: PNG });
    await store.clearAll();
    expect(await readdir(dir)).toEqual([]);
  });
});
