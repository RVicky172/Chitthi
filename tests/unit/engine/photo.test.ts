import { describe, expect, it } from 'vitest';
import { lookPixel, lookPixels } from '@/engine/photo';

/**
 * Runs one RGB pixel through a look and returns the result.
 * @param rgb the pixel
 * @param id the look
 * @returns the pixel after the look
 */
const look = (rgb: [number, number, number], id: Parameters<typeof lookPixels>[1]) => {
  const pixels = new Uint8ClampedArray([...rgb, 255]);
  lookPixels(pixels, id);
  return [pixels[0], pixels[1], pixels[2]];
};
const sat = ([red, green, blue]: number[]) =>
  (Math.max(red, green, blue) - Math.min(red, green, blue)) / Math.max(red, green, blue);

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

/**
 * How a Uint8ClampedArray stores a number: clamped, and rounded to the nearest even integer on exact halves.
 * @param value the number written
 * @returns the byte read back
 */
const toByte = (value: number) => {
  const clamped = Math.min(255, Math.max(0, value)),
    frame = Math.floor(clamped),
    delta = clamped - frame;
  return delta > 0.5 ? frame + 1 : delta < 0.5 ? frame : frame % 2 ? frame + 1 : frame;
};

describe('lookPixel', () => {
  it('gives exactly what lookPixels gives, for every look, across the colour range', () => {
    const looks = ['none', 'vivid', 'warm', 'cool', 'bw', 'tinted', 'vintage'] as const;
    const out = [0, 0, 0];
    for (const id of looks)
      for (let red = 0; red <= 255; red += 15)
        for (let green = 0; green <= 255; green += 15)
          for (let blue = 0; blue <= 255; blue += 15) {
            const pixels = new Uint8ClampedArray([red, green, blue, 255]);
            lookPixels(pixels, id);
            lookPixel(red, green, blue, id, out);
            expect([...pixels.slice(0, 3)]).toEqual(out.map((value) => toByte(value)));
          }
  });
});
