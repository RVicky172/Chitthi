import { describe, expect, it } from 'vitest';
// The module loads in plain Node: `require('electron')` there is only the binary's path, and `app` is used only when
// developing a file.
import { parsePpm16 } from '../../../electron/raw.cjs';

/**
 * A 16-bit PPM file: the header text, then big-endian samples.
 * @param header the header, e.g. `P6 2 1 65535\n`
 * @param samples the samples (three per pixel)
 * @returns the file's bytes
 */
function ppm(header: string, samples: number[]): Uint8Array {
  const bytes = new Uint8Array(header.length + samples.length * 2);
  bytes.set(Array.from(header, (char) => char.charCodeAt(0)));
  const pixels = new DataView(bytes.buffer, header.length);
  samples.forEach((sample, index) => pixels.setUint16(index * 2, sample));
  return bytes;
}

describe('parsePpm16 (dcraw_emu output)', () => {
  it('reads width, height and the samples', () => {
    const image = parsePpm16(ppm('P6\n2 1\n65535\n', [1, 2, 3, 65535, 256, 0]));
    expect(image.width).toBe(2);
    expect(image.height).toBe(1);
    expect(Array.from(image.data)).toEqual([1, 2, 3, 65535, 256, 0]);
  });

  it('skips comments, tabs and carriage returns in the header', () => {
    const image = parsePpm16(ppm('P6\r\n# made by dcraw_emu\n1\t1 # size\n65535\n', [7, 8, 9]));
    expect([image.width, image.height, Array.from(image.data)]).toEqual([1, 1, [7, 8, 9]]);
  });

  it('refuses other formats, 8-bit files and short files', () => {
    expect(() => parsePpm16(new Uint8Array(0))).toThrow('Not a PPM image');
    expect(() => parsePpm16(ppm('P5\n1 1\n65535\n', [1]))).toThrow('Not a 16-bit PPM image');
    expect(() => parsePpm16(ppm('P6\n1 1\n255\n', [1, 2]))).toThrow('Not a 16-bit PPM image');
    expect(() => parsePpm16(ppm('P6\n0 1\n65535\n', []))).toThrow('Not a 16-bit PPM image');
    expect(() => parsePpm16(ppm('P6\n2 2\n65535\n', [1, 2, 3]))).toThrow('The PPM image is cut short');
  });
});
