/** Small formatting helpers: ids, time, sizes, relative dates. */

/** Short random id with an optional readable prefix, e.g. `ses_3f9a1c2e`. */
export function uid(prefix = ''): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return prefix ? `${prefix}_${raw}` : raw;
}

const pad = (n: number, len = 2) => String(Math.floor(n)).padStart(len, '0');

/** `m:ss` (or `h:mm:ss`). With `ms`, appends `.mmm`. Non-finite values read as 0:00. */
export function formatTime(seconds: number, ms = false): string {
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const base = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  return ms ? `${base}.${pad((s % 1) * 1000, 3)}` : base;
}

/** Signed offset for the sync stepper: `+120 ms`, `−1.250 s`, `0 ms`. */
export function formatOffset(ms: number): string {
  const rounded = Math.round(ms);
  if (rounded === 0) return '0 ms';
  const sign = rounded > 0 ? '+' : '−';
  const abs = Math.abs(rounded);
  return abs >= 1000 ? `${sign}${(abs / 1000).toFixed(3)} s` : `${sign}${abs} ms`;
}

export function formatBytes(n: number | undefined): string {
  if (!n || n < 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

const rtf = typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;

/** “2 hours ago”, “yesterday”, falling back to a plain date after a month. */
export function timeAgo(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 1000],
    ['minute', 60_000],
    ['hour', 3_600_000],
    ['day', 86_400_000],
    ['week', 604_800_000]
  ];
  if (!rtf || abs > 2_592_000_000) return formatDate(ts);
  if (abs < 45_000) return 'just now';
  for (let i = units.length - 1; i >= 0; i--) {
    const [unit, size] = units[i];
    if (abs >= size) return rtf.format(Math.round(diff / size), unit);
  }
  return 'just now';
}

export const formatDate = (ts: number) =>
  new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric' }).format(ts);

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
