/**
 * HTTP `Range` header parsing for the `local-media://` protocol.
 *
 * Chromium's media stack seeks by asking for `bytes=START-` (and sometimes a
 * closed range or a suffix). Answering exactly those requests with `206` is what
 * makes scrubbing instant and keeps a 20 GB file out of memory.
 */

export type RangeResult =
  /** No usable Range header: send the whole file with 200. */
  | { kind: 'full' }
  /** Send bytes `start..end` (both inclusive) with 206. */
  | { kind: 'partial'; start: number; end: number }
  /** The range lies beyond the file: answer 416. */
  | { kind: 'unsatisfiable' };

/**
 * Reads a single `bytes=` range against a file of `size` bytes.
 *
 *   bytes=0-99      the first hundred bytes
 *   bytes=500-      from byte 500 to the end
 *   bytes=-200      the last 200 bytes
 *
 * A malformed header, another unit, or several ranges at once are ignored (a
 * server may), which means the whole file is sent. `end` is clamped to the last byte.
 */
export function parseRangeHeader(header: string | null | undefined, size: number): RangeResult {
  if (!header) return { kind: 'full' };
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
  if (!m) return { kind: 'full' };
  const [, from, to] = m;
  if (from === '' && to === '') return { kind: 'full' };
  if (size <= 0) return { kind: 'unsatisfiable' };

  if (from === '') {
    // Suffix range: the last N bytes.
    const n = Number(to);
    if (!Number.isSafeInteger(n) || n <= 0) return { kind: 'unsatisfiable' };
    return { kind: 'partial', start: Math.max(0, size - n), end: size - 1 };
  }

  const start = Number(from);
  if (!Number.isSafeInteger(start) || start >= size) return { kind: 'unsatisfiable' };
  if (to === '') return { kind: 'partial', start, end: size - 1 };
  const end = Number(to);
  if (!Number.isSafeInteger(end) || end < start) return { kind: 'full' };
  return { kind: 'partial', start, end: Math.min(end, size - 1) };
}

/** `Content-Range` value for a 206 (start-end of size) or for a 416 (an asterisk instead of a range). */
export function contentRange(result: RangeResult, size: number): string | null {
  if (result.kind === 'partial') return `bytes ${result.start}-${result.end}/${size}`;
  if (result.kind === 'unsatisfiable') return `bytes */${size}`;
  return null;
}
