import { describe, expect, it } from 'vitest';
import { lookPixel, lookPixels } from './photo';

/** Runs one RGB pixel through a look and returns the result. */
const look = (rgb: [number, number, number], id: Parameters<typeof lookPixels>[1]) => {
  const a = new Uint8ClampedArray([...rgb, 255]);
  lookPixels(a, id);
  return [a[0], a[1], a[2]];
};
const sat = ([r, g, b]: number[]) => (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);

describe('hand-tinted look', () => {
  it('turns muted colours (skin, sky, walls) into a warm black-and-white', () => {
    const skin = look([196, 160, 132], 'tinted');
    // Warm paper tone: red over green over blue, but only faintly.
    expect(skin[0]).toBeGreaterThan(skin[2]);
    expect(sat(skin)).toBeLessThan(0.12);
  });

  it('keeps a thin wash of colour where the photo was strongly coloured', () => {
    const sari = look([200, 30, 40], 'tinted');
    expect(sari[0]).toBeGreaterThan(sari[1] + 40);
    // A wash, not the original: less saturated than the source pixel.
    expect(sat(sari)).toBeLessThan(sat([200, 30, 40]));
  });

  it('leaves pure greys neutral apart from the paper tone', () => {
    const grey = look([128, 128, 128], 'tinted');
    expect(grey[0] - grey[2]).toBeGreaterThan(0);
    expect(grey[0] - grey[2]).toBeLessThan(16);
  });
});

/** How a Uint8ClampedArray stores a number: clamped, and rounded to the nearest even integer on exact halves. */
const toByte = (v: number) => {
  const c = Math.min(255, Math.max(0, v)),
    f = Math.floor(c),
    d = c - f;
  return d > 0.5 ? f + 1 : d < 0.5 ? f : f % 2 ? f + 1 : f;
};

describe('lookPixel', () => {
  it('gives exactly what lookPixels gives, for every look, across the colour range', () => {
    const looks = ['none', 'vivid', 'warm', 'cool', 'bw', 'tinted', 'vintage'] as const;
    const o = [0, 0, 0];
    for (const id of looks)
      for (let r = 0; r <= 255; r += 15)
        for (let g = 0; g <= 255; g += 15)
          for (let b = 0; b <= 255; b += 15) {
            const a = new Uint8ClampedArray([r, g, b, 255]);
            lookPixels(a, id);
            lookPixel(r, g, b, id, o);
            expect([...a.slice(0, 3)]).toEqual(o.map((v) => toByte(v)));
          }
  });
});
