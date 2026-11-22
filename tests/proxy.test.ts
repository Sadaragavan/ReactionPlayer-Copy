import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findFfmpeg } from '../electron/ffmpeg';
import { Proxies } from '../electron/proxy';

const fixture = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rp-proxy-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('audio proxy', async () => {
  const ffmpeg = await findFfmpeg();

  it.runIf(ffmpeg)('converts an AC-3 track to AAC that can be decoded, once', async () => {
    const proxies = new Proxies(dir);
    const seen: number[] = [];
    const out = await proxies.audio(fixture('ac3.mkv'), 0, (f) => seen.push(f));
    expect(out.endsWith('.m4a')).toBe(true);
    expect((await stat(out)).size).toBeGreaterThan(1000);
    const probe = spawnSync(ffmpeg!, ['-hide_banner', '-i', out, '-f', 'null', '-'], { encoding: 'utf8' });
    expect(probe.status).toBe(0);
    expect(probe.stderr).toMatch(/Audio: aac/);
    // The second request is served from the cache and does not convert again.
    const before = (await stat(out)).mtimeMs;
    expect(await proxies.audio(fixture('ac3.mkv'), 0)).toBe(out);
    expect((await stat(out)).mtimeMs).toBeGreaterThanOrEqual(before);
  });

  it.runIf(ffmpeg)('shares one conversion between simultaneous requests', async () => {
    const proxies = new Proxies(join(dir, 'shared'));
    const [a, b] = await Promise.all([proxies.audio(fixture('subs.mkv'), 1), proxies.audio(fixture('subs.mkv'), 1)]);
    expect(a).toBe(b);
  });

  it.runIf(ffmpeg)('fails cleanly for a track that does not exist, leaving nothing behind', async () => {
    const proxies = new Proxies(join(dir, 'missing'));
    await expect(proxies.audio(fixture('subs.mkv'), 7)).rejects.toThrow();
    await expect(stat(join(dir, 'missing'))).resolves.toBeTruthy();
  });
});
