import { describe, expect, it } from 'vitest';
import { buildTheme, contrast, fitGamut, oklchToSrgb, pickSwatches, srgbToOklch, themeFromPixels } from '../src/lib/utils/palette';

/** RGBA pixels from a list of [r, g, b, count]. */
const pixels = (parts: [number, number, number, number][]) => Uint8ClampedArray.from(parts.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat()));
const hueDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

describe('colour conversion', () => {
  it('round-trips through OKLCH', () => {
    for (const rgb of [[255, 0, 0], [12, 200, 99], [250, 250, 250], [30, 30, 90], [0, 0, 0]] as [number, number, number][]) {
      const back = oklchToSrgb(srgbToOklch(...rgb));
      rgb.forEach((v, i) => expect(Math.abs(back[i] - v)).toBeLessThanOrEqual(1));
    }
  });
  it('puts white at lightness 1, black at 0, and grey at no chroma', () => {
    expect(srgbToOklch(255, 255, 255).l).toBeCloseTo(1, 2);
    expect(srgbToOklch(0, 0, 0).l).toBeCloseTo(0, 3);
    expect(srgbToOklch(128, 128, 128).c).toBeLessThan(0.001);
  });
  it('lowers the chroma of a colour outside sRGB until it fits', () => {
    const fitted = fitGamut({ l: 0.8, c: 0.4, h: 200 });
    expect(fitted.c).toBeLessThan(0.4);
    expect(fitted.l).toBe(0.8);
  });
});

describe('picking swatches', () => {
  it('follows the dominant colour of a blue picture', () => {
    const s = pickSwatches(pixels([[30, 90, 220, 800], [20, 20, 30, 150], [240, 240, 240, 50]]));
    expect(s.vivid).toBe(true);
    expect(hueDistance(s.accent.h, srgbToOklch(30, 90, 220).h)).toBeLessThan(15);
  });
  it('picks a second colour at least 60° from the first when the picture has one', () => {
    const s = pickSwatches(pixels([[220, 40, 40, 500], [40, 200, 90, 300]]));
    expect(hueDistance(s.accent.h, s.accent2.h)).toBeGreaterThanOrEqual(60);
    expect(hueDistance(s.accent.h, srgbToOklch(220, 40, 40).h)).toBeLessThan(15);
  });
  it('falls back to a neighbouring hue for the second colour in a one-colour picture', () => {
    const s = pickSwatches(pixels([[200, 120, 20, 900]]));
    expect(hueDistance(s.accent.h, s.accent2.h)).toBeGreaterThan(20);
  });
  it('is not fooled by a big dark or white area', () => {
    const s = pickSwatches(pixels([[2, 2, 2, 6000], [255, 255, 255, 3000], [200, 60, 160, 400]]));
    expect(hueDistance(s.accent.h, srgbToOklch(200, 60, 160).h)).toBeLessThan(15);
  });
  it('treats greys and a fully transparent picture as having no colour', () => {
    expect(pickSwatches(pixels([[120, 120, 120, 500], [10, 10, 10, 500]])).vivid).toBe(false);
    expect(pickSwatches(Uint8ClampedArray.from([200, 30, 30, 0, 200, 30, 30, 0])).vivid).toBe(false);
    expect(themeFromPixels(pixels([[90, 90, 90, 100]]))).toBeNull();
  });
  it('always gives an accent that is readable on black', () => {
    for (const rgb of [[255, 240, 120], [20, 40, 160], [240, 90, 90], [60, 200, 160], [150, 60, 220]]) {
      const s = pickSwatches(pixels([[rgb[0], rgb[1], rgb[2], 500]]));
      expect(contrast(oklchToSrgb(s.accent), [0, 0, 0])).toBeGreaterThan(7);
      expect(contrast(oklchToSrgb(s.accent2), [0, 0, 0])).toBeGreaterThan(7);
    }
  });
});

describe('the theme', () => {
  const theme = buildTheme(pickSwatches(pixels([[30, 90, 220, 800]])), { keepBlack: false });
  it('sets every colour the interface uses', () => {
    for (const name of ['--color-accent', '--color-accent-soft', '--color-accent-line', '--color-accent-2', '--color-fg', '--color-fg-2', '--color-fg-3', '--color-line', '--color-line-strong', '--color-hover', '--color-press', '--ember-core', '--ember', '--ember-deep', '--ember-rgb', '--ember-hot-rgb', '--ember-deep-rgb', '--paper']) {
      expect(theme[name], name).toBeTruthy();
    }
  });
  it('writes valid CSS colours and rgb triples', () => {
    expect(theme['--color-accent']).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+\)$/);
    expect(theme['--color-line']).toMatch(/^oklch\([\d.]+ [\d.]+ [\d.]+ \/ 0\.12\)$/);
    expect(theme['--ember-rgb']).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
  });
  it('tints the greys towards the accent and keeps text readable on black', () => {
    const fg = srgbToOklch(...(theme['--ember-hot-rgb'].split(' ').map(Number) as [number, number, number]));
    expect(hueDistance(fg.h, srgbToOklch(30, 90, 220).h)).toBeLessThan(20);
    const m = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/.exec(theme['--color-fg-2'])!;
    expect(contrast(oklchToSrgb({ l: +m[1], c: +m[2], h: +m[3] }), [0, 0, 0])).toBeGreaterThan(7);
  });
});

describe('keeping the black base', () => {
  const swatches = pickSwatches(pixels([[30, 90, 220, 800]]));
  const kept = buildTheme(swatches, { keepBlack: true });
  const full = buildTheme(swatches, { keepBlack: false });

  it('changes only the accents and the glow', () => {
    expect(Object.keys(kept).sort()).toEqual(
      ['--color-accent', '--color-accent-soft', '--color-accent-line', '--color-accent-2', '--ember-core', '--ember', '--ember-deep', '--ember-hot-rgb', '--ember-rgb', '--ember-deep-rgb'].sort()
    );
  });
  it('leaves the text, lines and hover tones alone, and tints them in the full theme', () => {
    for (const name of ['--color-fg', '--color-fg-2', '--color-fg-3', '--color-line', '--color-line-strong', '--color-hover', '--color-press', '--paper']) {
      expect(kept[name]).toBeUndefined();
      expect(full[name]).toBeTruthy();
    }
  });
  it('makes the accent colours the same in both', () => {
    for (const name of Object.keys(kept)) expect(full[name]).toBe(kept[name]);
  });
  it('is the default', () => {
    expect(buildTheme(swatches)).toEqual(kept);
  });
});

describe('colours picked by hand', async () => {
  const { hexToOklch, oklchToHex, accentFromColor, companionAccent, swatchesFromPicks, MIN_ACCENT_LIGHTNESS } = await import('../src/lib/utils/palette');

  it('reads hex colours in three and six digits, with or without the hash', () => {
    expect(hexToOklch('#ffffff')?.l).toBeCloseTo(1, 2);
    expect(hexToOklch('000')?.l).toBeCloseTo(0, 3);
    expect(hexToOklch('f00')).toEqual(hexToOklch('#ff0000'));
    expect(hexToOklch('#12345')).toBeNull();
    expect(hexToOklch('red')).toBeNull();
    expect(hexToOklch('#gggggg')).toBeNull();
  });

  it('writes hex that reads back as the same colour', () => {
    for (const hex of ['#7aa2ff', '#ffd400', '#5eead4', '#b57bff']) expect(oklchToHex(hexToOklch(hex)!)).toBe(hex);
  });

  it('keeps hue and chroma and lightens a dark colour so it reads on black', () => {
    const picked = hexToOklch('#1a2a8c')!;
    const r = accentFromColor('#1a2a8c')!;
    expect(r.adjusted).toBe(true);
    expect(r.accent.l).toBeGreaterThanOrEqual(MIN_ACCENT_LIGHTNESS);
    expect(hueDistance(r.accent.h, picked.h)).toBeLessThan(2);
    expect(contrast(oklchToSrgb(r.accent), [0, 0, 0])).toBeGreaterThan(7);
  });

  it('leaves a colour that already reads on black alone', () => {
    const r = accentFromColor('#7aa2ff')!;
    expect(r.adjusted).toBe(false);
    expect(oklchToHex(r.accent)).toBe('#7aa2ff');
  });

  it('accepts white and grey as accents, and refuses what is not a colour', () => {
    expect(accentFromColor('#ffffff')?.accent.c).toBeLessThan(0.02);
    expect(accentFromColor('nope')).toBeNull();
  });

  it('makes a second accent 40° away unless one is picked', () => {
    const a = accentFromColor('#7aa2ff')!.accent;
    expect(hueDistance(companionAccent(a).h, a.h)).toBeCloseTo(40, 0);
    const s = swatchesFromPicks('#7aa2ff', '#ff6b6b')!;
    expect(hueDistance(s.accent2.h, hexToOklch('#ff6b6b')!.h)).toBeLessThan(2);
    expect(swatchesFromPicks('zzz')).toBeNull();
  });
});
