import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PgsDecoder, decodeRle, encodePng, ycrcbToRgb } from '../electron/pgs';
import { clearSet, displaySet, encodeRle } from './helpers/pgsBuilder';

const W = 1920;
const H = 1080;
// index → [Y, Cr, Cb, A]: 1 = white, 2 = a mid red, 3 = half-transparent black
const PAL: Record<number, [number, number, number, number]> = { 1: [235, 128, 128, 255], 2: [63, 240, 102, 255], 3: [16, 128, 128, 128] };

/** Reads the pixels back out of an indexed PNG made by `encodePng`. */
function readPng(buf: Buffer) {
  let p = 8;
  const chunks: Record<string, Buffer> = {};
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    chunks[buf.toString('latin1', p + 4, p + 8)] = buf.subarray(p + 8, p + 8 + len);
    p += 12 + len;
  }
  const w = chunks.IHDR.readUInt32BE(0);
  const h = chunks.IHDR.readUInt32BE(4);
  const raw = inflateSync(chunks.IDAT);
  const px: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.push(raw[y * (w + 1) + 1 + x]);
  return { w, h, px, plte: chunks.PLTE, trns: chunks.tRNS };
}

describe('run-length coding', () => {
  it('round-trips short runs, long runs and single pixels', () => {
    const w = 200;
    const row = [...Array(70).fill(0), 5, ...Array(100).fill(2), 7, 7, ...Array(27).fill(0)];
    const px = [...row, ...row.map((v) => (v ? 3 : 0))];
    expect(Array.from(decodeRle(encodeRle(px, w, 2), w, 2))).toEqual(px);
  });
  it('does not run past the picture on bad data', () => {
    expect(decodeRle(Uint8Array.from([0, 0x80 | 60, 9, 0, 0]), 10, 1)).toHaveLength(10);
  });
});

describe('color', () => {
  it('turns limited-range white, black and red into the right RGB', () => {
    expect(ycrcbToRgb(235, 128, 128, true)).toEqual([255, 255, 255]);
    expect(ycrcbToRgb(16, 128, 128, true)).toEqual([0, 0, 0]);
    const [r, g, b] = ycrcbToRgb(63, 240, 102, true);
    expect(r).toBeGreaterThan(220);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);
  });
});

describe('PGS decoder', () => {
  const obj = { id: 1, x: 400, y: 900, w: 6, h: 3, px: [1, 1, 1, 2, 2, 2, 0, 3, 3, 3, 0, 0, 1, 0, 1, 0, 1, 0] };

  it('shows a picture from its display set until the next one clears it', () => {
    const d = new PgsDecoder();
    d.feed(10, displaySet({ width: W, height: H, palette: PAL, objects: [obj] }));
    d.feed(13.5, clearSet(W, H));
    const cues = d.finish();
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ start: 10, end: 13.5, text: '', frame: { w: W, h: H } });
    expect(cues[0].images?.[0]).toMatchObject({ x: 400, y: 900, w: 6, h: 3 });
  });

  it('makes a PNG with the bitmap, the palette and its transparency', () => {
    const d = new PgsDecoder();
    d.feed(1, displaySet({ width: W, height: H, palette: PAL, objects: [obj] }));
    const png = readPng(Buffer.from(d.finish()[0].images![0].src.split(',')[1], 'base64'));
    expect({ w: png.w, h: png.h }).toEqual({ w: 6, h: 3 });
    expect(png.px).toEqual(obj.px);
    expect(Array.from(png.plte.subarray(3, 6))).toEqual([255, 255, 255]); // index 1: white
    expect(png.trns[1]).toBe(255);
    expect(png.trns[3]).toBe(128);
  });

  it('chains subtitles and gives the last one a few seconds', () => {
    const d = new PgsDecoder();
    d.feed(1, displaySet({ width: W, height: H, palette: PAL, objects: [obj] }));
    d.feed(2, clearSet(W, H));
    d.feed(5, displaySet({ width: W, height: H, palette: PAL, objects: [{ ...obj, y: 100 }], number: 3 }));
    const cues = d.finish();
    expect(cues.map((c) => [c.start, c.end])).toEqual([[1, 2], [5, 10]]);
    expect(cues[1].images?.[0].y).toBe(100);
  });

  it('replaces a subtitle directly with the next one', () => {
    const d = new PgsDecoder();
    d.feed(1, displaySet({ width: W, height: H, palette: PAL, objects: [obj] }));
    d.feed(3, displaySet({ width: W, height: H, palette: PAL, objects: [obj], number: 2 }));
    expect(d.finish().map((c) => [c.start, c.end])).toEqual([[1, 3], [3, 8]]);
  });

  it('crops an object when the composition asks', () => {
    const d = new PgsDecoder();
    d.feed(1, displaySet({ width: W, height: H, palette: PAL, objects: [{ ...obj, crop: { x: 2, y: 1, w: 3, h: 2 } }] }));
    const png = readPng(Buffer.from(d.finish()[0].images![0].src.split(',')[1], 'base64'));
    expect({ w: png.w, h: png.h, px: png.px }).toEqual({ w: 3, h: 2, px: [3, 3, 0, 1, 0, 1] });
  });

  it('draws two objects of one composition as two images', () => {
    const d = new PgsDecoder();
    d.feed(1, displaySet({ width: W, height: H, palette: PAL, objects: [obj, { ...obj, id: 2, x: 900 }] }));
    expect(d.finish()).toHaveLength(2);
  });

  it('survives garbage', () => {
    const d = new PgsDecoder();
    d.feed(1, Buffer.from([0x16, 0xff, 0xff, 1, 2, 3]));
    d.feed(2, Buffer.from([0x15, 0, 2, 9, 9]));
    expect(d.finish()).toEqual([]);
  });
});

describe('PNG', () => {
  it('has the PNG signature and a valid structure', () => {
    const png = encodePng(Uint8Array.from([0, 1, 1, 0]), 2, 2, new Uint8Array(1024).fill(255));
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(png.subarray(-12, -8).readUInt32BE(0)).toBe(0);
    expect(png.subarray(-8, -4).toString('latin1')).toBe('IEND');
  });
});
