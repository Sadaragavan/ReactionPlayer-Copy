/**
 * Subtitle parsing, shared by the renderer (external files) and the main process (tracks read out of a video).
 * Pure functions: SubRip (.srt), WebVTT (.vtt) and Advanced SubStation (.ass, .ssa), reduced to timed lines of text.
 * Styling beyond italics and top/middle/bottom placement is dropped on purpose; the player draws the text itself.
 */

/** A picture drawn for a picture-based subtitle (PGS), placed in a frame of the composition's size. */
export interface CueImage {
  x: number;
  y: number;
  w: number;
  h: number;
  /** A PNG data URL. */
  src: string;
}

export interface Cue {
  /** Seconds. */
  start: number;
  end: number;
  /** The text, lines separated by `\n`, with no markup. Empty for a picture cue. */
  text: string;
  /** Picture-based subtitles: the bitmaps, and the size of the picture they were authored for. */
  images?: CueImage[];
  frame?: { w: number; h: number };
  /** Whole-cue italics. */
  italic?: boolean;
  /** Where it sits (default bottom). */
  pos?: 'top' | 'middle' | 'bottom';
}

export const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'ass', 'ssa'] as const;

export const isSubtitlePath = (path: string) => (SUBTITLE_EXTENSIONS as readonly string[]).includes((/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase());

const decodeEntities = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** Removes `<i>`-style tags and entities from SubRip / WebVTT text; reports whether the whole cue was italic. */
function cleanMarkup(raw: string): { text: string; italic: boolean } {
  const italic = /^\s*<i>[\s\S]*<\/i>\s*$/i.test(raw);
  const text = decodeEntities(raw.replace(/<\/?[a-z][^>]*>/gi, '').replace(/\{\\[^}]*\}/g, ''));
  return { text: text.split('\n').map((l) => l.trim()).filter(Boolean).join('\n'), italic };
}

/** `00:01:02,500`, `01:02.500` or `1:02:03.45` (hours optional, comma or dot, 2 or 3 decimals) → seconds, or NaN. */
export function parseTimestamp(raw: string): number {
  const m = /^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?\s*$/.exec(raw);
  if (!m) return NaN;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac;
}

const sortCues = (cues: Cue[]) => cues.sort((a, b) => a.start - b.start || a.end - b.end);

/** SubRip and WebVTT share a shape: blocks separated by blank lines, a line `start --> end`, then the text. */
function parseTimedBlocks(text: string): Cue[] {
  const cues: Cue[] = [];
  for (const block of text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, rest] = lines[at].split('-->');
    const start = parseTimestamp(a);
    const end = parseTimestamp(rest.trim().split(/\s+/)[0] ?? '');
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const { text: t, italic } = cleanMarkup(lines.slice(at + 1).join('\n'));
    if (t) cues.push({ start, end, text: t, ...(italic ? { italic } : {}) });
  }
  return sortCues(cues);
}

export const parseSrt = parseTimedBlocks;
export const parseVtt = parseTimedBlocks;

/** The text field of an ASS event: override blocks removed, `\N` as a line break, `\an` read as a position. */
export function cleanAssText(raw: string): { text: string; italic: boolean; pos?: Cue['pos'] } | null {
  if (/\{[^}]*\\p[1-9]/.test(raw)) return null; // a vector drawing, not text
  const an = /\{[^}]*\\an?(\d)/.exec(raw)?.[1];
  const pos = an ? (Number(an) >= 7 ? 'top' : Number(an) >= 4 ? 'middle' : 'bottom') : undefined;
  const italic = /\{[^}]*\\i1/.test(raw) && !/\{[^}]*\\i0/.test(raw);
  const text = raw
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\[Nn]/g, '\n')
    .replace(/\\h/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return text ? { text, italic, ...(pos && pos !== 'bottom' ? { pos } : {}) } : null;
}

export function parseAss(text: string): Cue[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let cols: string[] | null = null;
  let inEvents = false;
  const cues: Cue[] = [];
  for (const line of lines) {
    if (/^\s*\[.*\]\s*$/.test(line)) {
      inEvents = /^\s*\[events\]\s*$/i.test(line);
      continue;
    }
    if (!inEvents) continue;
    const fmt = /^\s*format\s*:\s*(.*)$/i.exec(line);
    if (fmt) {
      cols = fmt[1].split(',').map((c) => c.trim().toLowerCase());
      continue;
    }
    const dlg = /^\s*dialogue\s*:\s*(.*)$/i.exec(line);
    if (!dlg || !cols) continue;
    const textAt = cols.indexOf('text');
    const parts = splitLimit(dlg[1], ',', cols.length - 1);
    const start = parseTimestamp(parts[cols.indexOf('start')] ?? '');
    const end = parseTimestamp(parts[cols.indexOf('end')] ?? '');
    const clean = cleanAssText(parts[textAt] ?? '');
    if (clean && Number.isFinite(start) && Number.isFinite(end)) cues.push({ start, end, text: clean.text, ...(clean.italic ? { italic: true } : {}), ...(clean.pos ? { pos: clean.pos } : {}) });
  }
  return sortCues(cues);
}

/** Splits at most `limit` times; the last piece keeps any further separators (the text of an ASS line contains commas). */
export function splitLimit(s: string, sep: string, limit: number): string[] {
  const out: string[] = [];
  let rest = s;
  while (out.length < limit) {
    const i = rest.indexOf(sep);
    if (i < 0) break;
    out.push(rest.slice(0, i));
    rest = rest.slice(i + sep.length);
  }
  out.push(rest);
  return out;
}

/** Picks the parser from the file name, falling back to what the text looks like. */
export function parseSubtitleFile(name: string, text: string): Cue[] {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  if (ext === 'ass' || ext === 'ssa' || /^\s*\[script info\]/i.test(text.replace(/^\uFEFF/, ''))) return parseAss(text);
  return parseTimedBlocks(text);
}

/**
 * The cues showing at `t` seconds. Cues are sorted by start, so this finds the last one that has started and looks back a
 * little for earlier ones that are still on (subtitles may overlap).
 */
export function cuesAt(cues: readonly Cue[], t: number): Cue[] {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const out: Cue[] = [];
  for (let i = found; i >= 0 && i > found - 8; i--) if (cues[i].end > t) out.unshift(cues[i]);
  return out;
}
