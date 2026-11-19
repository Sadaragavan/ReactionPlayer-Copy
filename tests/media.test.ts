import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { handleMediaRequest } from '../electron/media';
import { fromMediaUrl, mimeFor, toMediaUrl } from '../src/shared/mediaUrl';

let dir: string;
let video: string;
const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'rp-media-'));
  video = join(dir, 'my clip #1.mp4');
  await writeFile(video, bytes);
  await writeFile(join(dir, 'notes.txt'), 'secret');
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const get = (path: string, range?: string, method = 'GET') =>
  handleMediaRequest(new Request(toMediaUrl(path), { method, headers: range ? { Range: range } : {} }));

describe('local-media URLs', () => {
  it('round-trips paths, including spaces, # and a Windows drive', () => {
    for (const p of ['/home/me/a b.mp4', '/clips/#1 (final).mkv', 'C:\\Users\\Me\\Videos\\x.webm', '/data/ünï.mov']) {
      const back = fromMediaUrl(toMediaUrl(p));
      expect(back).toBe(p.replace(/\\/g, '/'));
    }
  });

  it('refuses other schemes, other hosts and path traversal', () => {
    expect(fromMediaUrl('https://media/etc/passwd')).toBeNull();
    expect(fromMediaUrl('local-media://elsewhere/a.mp4')).toBeNull();
    expect(fromMediaUrl('local-media://media/a/..%2Fb.mp4')).toBeNull();
    expect(fromMediaUrl('not a url')).toBeNull();
  });

  it('knows the MIME types of the supported containers', () => {
    expect(mimeFor('a.mp4')).toBe('video/mp4');
    expect(mimeFor('a.MKV')).toBe('video/x-matroska');
    expect(mimeFor('a.webm')).toBe('video/webm');
    expect(mimeFor('a.mov')).toBe('video/quicktime');
    expect(mimeFor('a.txt')).toBeNull();
  });
});

describe('handleMediaRequest', () => {
  it('serves the whole file with 200 and advertises byte ranges', async () => {
    const res = await get(video);
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('content-length')).toBe('256');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('answers a closed range with 206 and exactly those bytes', async () => {
    const res = await get(video, 'bytes=10-19');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 10-19/256');
    expect(res.headers.get('content-length')).toBe('10');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes.slice(10, 20));
  });

  it('answers an open-ended seek and a suffix range', async () => {
    const open = await get(video, 'bytes=200-');
    expect(open.status).toBe(206);
    expect(open.headers.get('content-range')).toBe('bytes 200-255/256');
    expect(new Uint8Array(await open.arrayBuffer())).toEqual(bytes.slice(200));

    const tail = await get(video, 'bytes=-16');
    expect(tail.headers.get('content-range')).toBe('bytes 240-255/256');
    expect(new Uint8Array(await tail.arrayBuffer())).toEqual(bytes.slice(240));
  });

  it('answers 416 with the file size for a range past the end', async () => {
    const res = await get(video, 'bytes=256-');
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */256');
  });

  it('answers HEAD with the headers and no body', async () => {
    const res = await get(video, 'bytes=0-9', 'HEAD');
    expect(res.status).toBe(206);
    expect(res.headers.get('content-length')).toBe('10');
    expect(await res.text()).toBe('');
  });

  it('refuses files that are not media, and files that are missing', async () => {
    expect((await get(join(dir, 'notes.txt'))).status).toBe(403);
    expect((await get(join(dir, 'gone.mp4'))).status).toBe(404);
    expect((await handleMediaRequest(new Request('local-media://wrong/x.mp4'))).status).toBe(400);
  });
});
