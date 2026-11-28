/**
 * PGS (HDMV Presentation Graphic Stream) subtitles: the picture-based format on Blu-rays, and what most “English
 * subtitles” in a Blu-ray rip's MKV are. Each display set carries a palette and run-length-coded bitmaps; this turns
 * them into timed PNG images the player can lay over the video.
 *
 * A Matroska block holds the segments of one display set, without the `PG` header and timestamps a .sup file has:
 *   segment = type (1 byte) · length (2 bytes) · payload
 *   0x16 presentation composition (what to show, where), 0x17 window, 0x14 palette, 0x15 object (the bitmap), 0x80 end
 */
import { deflateSync } from 'node:zlib';
import type { Cue, CueImage } from '../src/shared/subtitles';

interface PgsObject {
  w: number;
  h: number;
  /** Fragments of RLE data until the last one arrives. */
  rle: Buffer[];
  pixels?: Uint8Array;
}

interface CompositionObject {
  id: number;
  x: number;
  y: number;
  crop?: { x: number; y: number; w: number; h: number };
}

interface Composition {
  width: number;
  height: number;
  state: number;
  paletteId: number;
  objects: CompositionObject[];
}

/** Palette entry: RGB converted from YCrCb, and alpha. */
type Palette = Uint8Array; // 256 × [r, g, b, a]

/* ── run-length decoding ── */

/**
 * The bitmap's rows: a byte other than 0 is one pixel of that color; 0 introduces a run or a line end:
 *   00 00            end of line          00 4n / 00 4n nn    n zeros (6 or 14 bit count)
 *   00 8n cc / 00 Cn nn cc   n pixels of color cc
 */
export function decodeRle(data: Uint8Array, w: number, h: number): Uint8Array {
  const px = new Uint8Array(w * h);
  let x = 0;
  let y = 0;
  let i = 0;
  const fill = (n: number, c: number) => {
    const end = Math.min(x + n, w);
    if (c) px.fill(c, y * w + x, y * w + end);
    x += n;
  };
  while (i < data.length && y < h) {
    const b = data[i++];
    if (b !== 0) {
      fill(1, b);
      continue;
    }
    const f = data[i++];
    if (f === undefined) break;
    if (f === 0) {
      x = 0;
      y++;
    } else if (f < 0x40) fill(f, 0);
    else if (f < 0x80) fill(((f & 0x3f) << 8) | data[i++], 0);
    else if (f < 0xc0) fill(f & 0x3f, data[i++]);
    else {
      const n = ((f & 0x3f) << 8) | data[i++];
      fill(n, data[i++]);
    }
  }
  return px;
}

/* ── color ── */

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/** Limited-range YCrCb to RGB: BT.709 for HD pictures, BT.601 below. */
export function ycrcbToRgb(y: number, cr: number, cb: number, hd: boolean): [number, number, number] {
  const Y = (y - 16) * (255 / 219);
  const U = (cb - 128) * (255 / 224);
  const V = (cr - 128) * (255 / 224);
  return hd
    ? [clamp(Y + 1.5748 * V), clamp(Y - 0.1873 * U - 0.4681 * V), clamp(Y + 1.8556 * U)]
    : [clamp(Y + 1.402 * V), clamp(Y - 0.3441 * U - 0.7141 * V), clamp(Y + 1.772 * U)];
}

/* ── PNG ── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  Buffer.from(data.buffer, data.byteOffset, data.length).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** An 8-bit indexed PNG with per-entry transparency: small, because a subtitle is a few flat colors. */
export function encodePng(pixels: Uint8Array, w: number, h: number, palette: Palette): Buffer {
  const used = pixels.reduce((m, p) => (p > m ? p : m), 0) + 1;
  const plte = Buffer.alloc(used * 3);
  const trns = Buffer.alloc(used);
  for (let i = 0; i < used; i++) {
    plte[i * 3] = palette[i * 4];
    plte[i * 3 + 1] = palette[i * 4 + 1];
    plte[i * 3 + 2] = palette[i * 4 + 2];
    trns[i] = palette[i * 4 + 3];
  }
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(pixels.buffer, pixels.byteOffset + y * w, w).copy(raw, y * (w + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 3; // indexed color
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]);
}

/* ── the decoder ── */

export class PgsDecoder {
  #palettes = new Map<number, Palette>();
  #objects = new Map<number, PgsObject>();
  #pcs: Composition | null = null;
  #cues: Cue[] = [];
  /** The cues started by the last display set, which end when the next one begins. */
  #open: Cue[] = [];

  /** Feeds the segments of one Matroska block, which began at `time` seconds. */
  feed(time: number, data: Uint8Array): void {
    const buf = Buffer.from(data.buffer, data.byteOffset, data.length);
    let p = 0;
    while (p + 3 <= buf.length) {
      const type = buf[p];
      const len = buf.readUInt16BE(p + 1);
      const body = buf.subarray(p + 3, p + 3 + len);
      p += 3 + len;
      if (type === 0x16) this.#composition(body);
      else if (type === 0x14) this.#palette(body);
      else if (type === 0x15) this.#object(body);
      else if (type === 0x80) this.#end(time);
    }
  }

  /** Every cue, in order. Whatever was still on screen at the end gets a few seconds. */
  finish(): Cue[] {
    for (const c of this.#open) if (c.end <= c.start) c.end = c.start + 5;
    this.#open = [];
    return this.#cues;
  }

  #composition(b: Buffer): void {
    if (b.length < 11) return;
    const count = b[10];
    const objects: CompositionObject[] = [];
    let p = 11;
    for (let i = 0; i < count && p + 8 <= b.length; i++) {
      const o: CompositionObject = { id: b.readUInt16BE(p), x: b.readUInt16BE(p + 4), y: b.readUInt16BE(p + 6) };
      const cropped = (b[p + 3] & 0x40) !== 0;
      p += 8;
      if (cropped && p + 8 <= b.length) {
        o.crop = { x: b.readUInt16BE(p), y: b.readUInt16BE(p + 2), w: b.readUInt16BE(p + 4), h: b.readUInt16BE(p + 6) };
        p += 8;
      }
      objects.push(o);
    }
    const state = b[7];
    if (state === 0x80) {
      // A new epoch: nothing before it can be referred to again.
      this.#objects.clear();
    }
    this.#pcs = { width: b.readUInt16BE(0), height: b.readUInt16BE(2), state, paletteId: b[9], objects };
  }

  #palette(b: Buffer): void {
    if (b.length < 2) return;
    const id = b[0];
    const pal = this.#palettes.get(id) ?? new Uint8Array(256 * 4);
    const hd = (this.#pcs?.height ?? 1080) >= 720;
    for (let p = 2; p + 5 <= b.length; p += 5) {
      const [r, g, bl] = ycrcbToRgb(b[p + 1], b[p + 2], b[p + 3], hd);
      pal.set([r, g, bl, b[p + 4]], b[p] * 4);
    }
    this.#palettes.set(id, pal);
  }

  #object(b: Buffer): void {
    if (b.length < 4) return;
    const id = b.readUInt16BE(0);
    const flag = b[3];
    if (flag & 0x80) {
      if (b.length < 11) return;
      this.#objects.set(id, { w: b.readUInt16BE(7), h: b.readUInt16BE(9), rle: [Buffer.from(b.subarray(11))] });
    } else this.#objects.get(id)?.rle.push(Buffer.from(b.subarray(4)));
    const o = this.#objects.get(id);
    if (o && flag & 0x40) o.pixels = decodeRle(Buffer.concat(o.rle), o.w, o.h);
  }

  #end(time: number): void {
    // The previous display set stays up until this one replaces it.
    for (const c of this.#open) c.end = Math.max(time, c.start);
    this.#open = [];
    const pcs = this.#pcs;
    if (!pcs || !pcs.objects.length) return;
    const palette = this.#palettes.get(pcs.paletteId);
    if (!palette) return;
    for (const co of pcs.objects) {
      const obj = this.#objects.get(co.id);
      if (!obj?.pixels) continue;
      let { w, h } = obj;
      let pixels = obj.pixels;
      if (co.crop && (co.crop.w < w || co.crop.h < h)) {
        const c = { x: Math.min(co.crop.x, w), y: Math.min(co.crop.y, h), w: Math.min(co.crop.w, w - co.crop.x), h: Math.min(co.crop.h, h - co.crop.y) };
        const cut = new Uint8Array(c.w * c.h);
        for (let y = 0; y < c.h; y++) cut.set(obj.pixels.subarray((c.y + y) * w + c.x, (c.y + y) * w + c.x + c.w), y * c.w);
        pixels = cut;
        w = c.w;
        h = c.h;
      }
      if (w <= 0 || h <= 0) continue;
      const image: CueImage = { x: co.x, y: co.y, w, h, src: `data:image/png;base64,${encodePng(pixels, w, h, palette).toString('base64')}` };
      const cue: Cue = { start: time, end: time, text: '', images: [image], frame: { w: pcs.width, h: pcs.height } };
      this.#cues.push(cue);
      this.#open.push(cue);
    }
  }
}
