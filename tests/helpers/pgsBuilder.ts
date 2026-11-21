/** Builds PGS display sets by hand, so the decoder can be tested without a Blu-ray. */
export const seg = (type: number, body: Buffer) => Buffer.concat([Buffer.from([type, body.length >> 8, body.length & 255]), body]);
const u16 = (n: number) => Buffer.from([n >> 8, n & 255]);

/** Run-length codes a row-major bitmap with the PGS scheme. */
export function encodeRle(px: number[], w: number, h: number): Buffer {
  const out: number[] = [];
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = px[y * w + x];
      let n = 1;
      while (x + n < w && px[y * w + x + n] === c && n < 0x3fff) n++;
      if (c === 0) {
        if (n < 0x40) out.push(0, n);
        else out.push(0, 0x40 | (n >> 8), n & 255);
      } else if (n === 1) out.push(c);
      else if (n < 0x40) out.push(0, 0x80 | n, c);
      else out.push(0, 0xc0 | (n >> 8), n & 255, c);
      x += n;
    }
    out.push(0, 0);
  }
  return Buffer.from(out);
}

export interface Obj { id: number; x: number; y: number; w: number; h: number; px: number[]; crop?: { x: number; y: number; w: number; h: number } }

/** palette: index → [Y, Cr, Cb, A] */
export function displaySet(o: { width: number; height: number; state?: number; palette: Record<number, [number, number, number, number]>; objects: Obj[]; number?: number }): Buffer {
  const parts: Buffer[] = [];
  const comp = o.objects.flatMap((ob) => [u16(ob.id), Buffer.from([0, ob.crop ? 0x40 : 0]), u16(ob.x), u16(ob.y), ...(ob.crop ? [u16(ob.crop.x), u16(ob.crop.y), u16(ob.crop.w), u16(ob.crop.h)] : [])]);
  parts.push(seg(0x16, Buffer.concat([u16(o.width), u16(o.height), Buffer.from([0x10]), u16(o.number ?? 1), Buffer.from([o.state ?? 0x80, 0, 0, o.objects.length]), ...comp])));
  parts.push(seg(0x17, Buffer.from([1, 0, 0, 0, 0, 0, 0, 0, 0, 0])));
  if (Object.keys(o.palette).length) {
    parts.push(seg(0x14, Buffer.concat([Buffer.from([0, 0]), ...Object.entries(o.palette).map(([i, [y, cr, cb, a]]) => Buffer.from([Number(i), y, cr, cb, a]))])));
  }
  for (const ob of o.objects) {
    const rle = encodeRle(ob.px, ob.w, ob.h);
    parts.push(seg(0x15, Buffer.concat([u16(ob.id), Buffer.from([0, 0xc0]), Buffer.from([0, (rle.length + 4) >> 8, (rle.length + 4) & 255]), u16(ob.w), u16(ob.h), rle])));
  }
  parts.push(seg(0x80, Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** An empty display set: clears the screen. */
export const clearSet = (width: number, height: number, number = 2) => displaySet({ width, height, state: 0, number, palette: {}, objects: [] });

/** The whole stream in .sup file form (`PG`, timestamps in 90 kHz, then each segment), for checking against ffmpeg. */
export function toSup(sets: { time: number; data: Buffer }[]): Buffer {
  const out: Buffer[] = [];
  for (const { time, data } of sets) {
    let p = 0;
    while (p < data.length) {
      const len = data.readUInt16BE(p + 1);
      const h = Buffer.alloc(10);
      h.write('PG', 0, 'latin1');
      h.writeUInt32BE(Math.round(time * 90000), 2);
      h.writeUInt32BE(0, 6);
      out.push(h, data.subarray(p, p + 3 + len));
      p += 3 + len;
    }
  }
  return Buffer.concat(out);
}
