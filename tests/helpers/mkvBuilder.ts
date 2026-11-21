import { deflateSync } from 'node:zlib';

/** A few bytes of EBML, enough to write a Matroska file with one subtitle track by hand. */
const idBytes = (id: number) => {
  const out: number[] = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 255);
  return Buffer.from(out);
};
const size = (n: number) => {
  // 8-byte size: simple and always valid.
  const b = Buffer.alloc(8);
  b[0] = 0x01;
  b.writeUIntBE(n, 2, 6);
  return b;
};
export const el = (id: number, payload: Buffer) => Buffer.concat([idBytes(id), size(payload.length), payload]);
export const uintEl = (id: number, n: number) => {
  const bytes: number[] = [];
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 255);
  return el(id, Buffer.from(bytes.length ? bytes : [0]));
};
export const strEl = (id: number, s: string) => el(id, Buffer.from(s, 'latin1'));

export interface BlockSpec {
  /** Milliseconds from the start (TimecodeScale 1 ms). */
  ms: number;
  data: Buffer;
}

/** One subtitle track (number 1) whose blocks are optionally zlib-compressed (ContentCompression). */
export function subtitleMkv(codec: string, blocks: BlockSpec[], opts: { zlib?: boolean } = {}): Buffer {
  const encodings = opts.zlib ? el(0x6d80, el(0x6240, Buffer.concat([uintEl(0x5031, 0), uintEl(0x5032, 1), uintEl(0x5033, 0), el(0x5034, uintEl(0x4254, 0))]))) : Buffer.alloc(0);
  const track = el(0xae, Buffer.concat([uintEl(0xd7, 1), uintEl(0x83, 17), strEl(0x86, codec), strEl(0x22b59c, 'eng'), strEl(0x536e, 'English'), encodings]));
  const simple = blocks.map((b) => {
    const payload = opts.zlib ? deflateSync(b.data) : b.data;
    const head = Buffer.alloc(4);
    head[0] = 0x81; // track 1
    head.writeInt16BE(b.ms, 1);
    head[3] = 0x80; // keyframe
    return el(0xa3, Buffer.concat([head, payload]));
  });
  const cluster = el(0x1f43b675, Buffer.concat([uintEl(0xe7, 0), ...simple]));
  const segment = el(0x18538067, Buffer.concat([el(0x1549a966, uintEl(0x2ad7b1, 1_000_000)), el(0x1654ae6b, track), cluster]));
  return Buffer.concat([el(0x1a45dfa3, strEl(0x4282, 'matroska')), segment]);
}
