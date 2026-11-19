/**
 * The request handler behind `local-media://`.
 *
 * It maps the URL back to an absolute path, refuses anything that is not a known
 * media type, and answers with the exact byte range Chromium asked for, read as a
 * stream from disk. Pure Node + Fetch API (no Electron import), so it is unit tested directly.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { fromMediaUrl, mimeFor } from '../src/shared/mediaUrl';
import { contentRange, parseRangeHeader } from './range';

/** Headers every response carries. `*` + `cross-origin` keep a canvas clean when a frame is drawn from the video. */
const COMMON = {
  'Accept-Ranges': 'bytes',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Cache-Control': 'no-store'
} as const;

const text = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...COMMON, ...extra } });

export async function handleMediaRequest(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS') return text(405, 'Method not allowed');
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...COMMON, 'Access-Control-Allow-Headers': 'Range' } });
  }

  const path = fromMediaUrl(request.url);
  if (!path) return text(400, 'Bad media URL');
  const mime = mimeFor(path);
  if (!mime) return text(403, 'Not a media file');

  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) return text(404, 'Not found');
    size = info.size;
  } catch {
    return text(404, 'Not found');
  }

  const range = parseRangeHeader(request.headers.get('range'), size);
  if (range.kind === 'unsatisfiable') return text(416, 'Range not satisfiable', { 'Content-Range': contentRange(range, size) ?? '' });

  const start = range.kind === 'partial' ? range.start : 0;
  const end = range.kind === 'partial' ? range.end : size - 1;
  const length = size === 0 ? 0 : end - start + 1;
  const headers: Record<string, string> = { ...COMMON, 'Content-Type': mime, 'Content-Length': String(length) };
  if (range.kind === 'partial') headers['Content-Range'] = contentRange(range, size) ?? '';
  const status = range.kind === 'partial' ? 206 : 200;

  if (request.method === 'HEAD' || length === 0) return new Response(null, { status, headers });

  const stream = createReadStream(path, { start, end });
  // A seek abandons the previous request: stop reading so the disk is not kept busy.
  request.signal?.addEventListener('abort', () => stream.destroy(), { once: true });
  return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers });
}
