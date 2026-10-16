import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_PRESETS, presetApplied } from '@/engine/presets';
import { colourNeutral, DEFAULT_ADJUST, mergeAdjust } from '@/engine/adjust';
import { chainPixels } from '@/engine/chain';
import { colourNodes } from '@/engine/gpu/colour';
import { runNodes, TexturePool, type DataInput } from '@/engine/gpu/graph';
import { LUT_PROGRAM } from '@/engine/gpu/lut';
import type { GpuDevice, GpuTexture } from '@/engine/gpu/types';
import { toHalf } from '@/engine/gpu/webgpu';
import {
  addLut,
  identityLut,
  lutById,
  LutError,
  lutPixel,
  lutScale,
  lutTexture,
  parseCube,
  removeLut,
  type Lut,
} from '@/engine/lut';

import { defined } from '../../support/defined';
/** A .cube file for a table made by colourOf(red, green, blue) at size points per side. */
function cube(size: number, colourOf: (red: number, green: number, blue: number) => number[], head = ''): string {
  const lines = [head, `LUT_3D_SIZE ${size}`];
  for (let blue = 0; blue < size; blue++)
    for (let green = 0; green < size; green++)
      for (let red = 0; red < size; red++)
        lines.push(
          colourOf(red / (size - 1), green / (size - 1), blue / (size - 1))
            .map((value) => value.toFixed(6))
            .join(' '),
        );
  return lines.join('\n');
}
const same = (red: number, green: number, blue: number) => [red, green, blue];
const at = (lut: Lut, red: number, green: number, blue: number) => {
  const out = [0, 0, 0];
  lutPixel(lut, red, green, blue, out, lutScale(lut));
  return out;
};

describe('parseCube', () => {
  it('reads the title, size and values, skipping comments, blank lines, a BOM and Windows line ends', () => {
    const text = `${String.fromCharCode(0xfeff)}# made by hand\r\nTITLE "Teal and orange"\r\n\r\n${cube(2, same).replace(/\n/g, '\r\n')}`;
    const lut = parseCube(text, 'x.cube');
    expect(lut.title).toBe('Teal and orange');
    expect(lut.size).toBe(2);
    expect([...lut.data.slice(0, 6)]).toEqual([0, 0, 0, 1, 0, 0]);
    expect([...lut.data.slice(-3)]).toEqual([1, 1, 1]);
  });
  it('names the LUT after its file when it has no title, and skips keywords it does not know', () => {
    expect(parseCube(cube(3, same, 'LUT_IN_VIDEO_RANGE'), 'Film look.cube').title).toBe('Film look');
  });
  it('reads DOMAIN_MIN / DOMAIN_MAX and LUT_3D_INPUT_RANGE', () => {
    const lut = parseCube(`DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n${cube(2, same)}`);
    expect(lut.max).toEqual([2, 2, 2]);
    // Half of the domain is the middle of the table.
    expect(at(lut, 1, 1, 1).map((value) => +value.toFixed(6))).toEqual([0.5, 0.5, 0.5]);
    expect(parseCube(`LUT_3D_INPUT_RANGE -0.5 1.5\n${cube(2, same)}`).min).toEqual([-0.5, -0.5, -0.5]);
  });
  it.each([
    ['empty', ''],
    ['no size', '0 0 0\n1 1 1'],
    ['a 1D LUT', 'LUT_1D_SIZE 4\n0 0 0'],
    ['size 1', 'LUT_3D_SIZE 1\n0 0 0'],
    ['size 66', 'LUT_3D_SIZE 66'],
    ['a size that is not a whole number', 'LUT_3D_SIZE 2.5'],
    ['two sizes', 'LUT_3D_SIZE 2\nLUT_3D_SIZE 2'],
    ['too few values', cube(2, same).split('\n').slice(0, -1).join('\n')],
    ['too many values', `${cube(2, same)}\n0 0 0`],
    ['a value that is not a number', cube(2, same).replace('1.000000 1.000000 1.000000', '1 1 x')],
    ['four numbers on a line', cube(2, same).replace('1.000000 1.000000 1.000000', '1 1 1 1')],
    ['a domain the wrong way round', `DOMAIN_MIN 1 0 0\nDOMAIN_MAX 0 1 1\n${cube(2, same)}`],
    ['a broken domain line', `DOMAIN_MAX 1 1\n${cube(2, same)}`],
  ])('rejects %s with a LutError', (_, text) => {
    expect(() => parseCube(text)).toThrow(LutError);
  });
  it('gives the same table the same id and a different table a different one', () => {
    expect(parseCube(cube(3, same), 'a').id).toBe(parseCube(`TITLE "b"\n${cube(3, same)}`, 'b').id);
    expect(parseCube(cube(3, same)).id).not.toBe(parseCube(cube(3, (red, green, blue) => [blue, green, red])).id);
    expect(parseCube(cube(3, same)).id).toMatch(/^[0-9a-z]{2,16}$/);
  });
  it('keeps wild values within what the GPU’s 16-bit floats can hold', () => {
    const lut = parseCube(cube(2, same).replace('1.000000 1.000000 1.000000', '1e9 0 -1e9'));
    expect([...lut.data.slice(-3)]).toEqual([64, 0, -64]);
  });
});

describe('lutPixel', () => {
  it('changes nothing with an identity table, between the points as well as on them', () => {
    for (const size of [2, 17, 33]) {
      const lut = identityLut(size);
      for (let index = 0; index < 200; index++) {
        const rgb = [Math.random(), Math.random(), Math.random()];
        at(lut, rgb[0], rgb[1], rgb[2]).forEach((value, step) => expect(value).toBeCloseTo(rgb[step], 6));
      }
    }
  });
  it('is exact for any table that is linear in the colour, as tetrahedral interpolation is', () => {
    const mapping = (red: number, green: number, blue: number) => [
      0.2 + 0.5 * red + 0.1 * blue,
      0.9 * green - 0.1 * red,
      0.3 * blue + 0.3 * green + 0.2,
    ];
    const lut = parseCube(cube(5, mapping));
    for (let index = 0; index < 200; index++) {
      const rgb = [Math.random(), Math.random(), Math.random()];
      at(lut, rgb[0], rgb[1], rgb[2]).forEach((value, step) =>
        expect(value).toBeCloseTo(mapping(rgb[0], rgb[1], rgb[2])[step], 5),
      );
    }
  });
  it('keeps greys grey when the table does, even between points', () => {
    const lut = parseCube(
      cube(9, (red, green, blue) => {
        const mean = (red + green + blue) / 3;
        return [mean + (red - mean) * 1.5, mean + (green - mean) * 0.5, mean + (blue - mean) * 1.2].map(
          (value) => value * value,
        );
      }),
    );
    for (const value of [0.03, 0.31, 0.5, 0.77, 0.99]) {
      const [red, green, blue] = at(lut, value, value, value);
      expect(green).toBeCloseTo(red, 9);
      expect(blue).toBeCloseTo(red, 9);
    }
  });
  it('reads the table’s edge for values outside its range', () => {
    const lut = parseCube(cube(3, (red, green, blue) => [1 - red, green, blue]));
    expect(at(lut, -0.5, 1.5, 0.5)).toEqual([1, 1, 0.5]);
  });
});

describe('lutTexture', () => {
  it('lays one tile per blue slice in rows, small enough for any device even at 65³', () => {
    const texture = lutTexture(identityLut(65));
    expect([texture.width, texture.height, texture.cols]).toEqual([585, 520, 9]);
    const t3 = lutTexture(identityLut(3));
    expect([t3.width, t3.height, t3.cols]).toEqual([6, 6, 2]);
    // r = 2, g = 1, b = 2: the third slice is tile (0, 1); red across, green down.
    const step = ((3 + 1) * t3.width + 2) * 4;
    expect([...t3.rgba.slice(step, step + 4)]).toEqual([1, 0.5, 1, 1]);
  });
  it('is packed once per table', () => {
    const lut = identityLut(5);
    expect(lutTexture(lut)).toBe(lutTexture(lut));
  });
});

describe('a LUT in the colour settings', () => {
  const warm = parseCube(
    cube(5, (red, green, blue) => [red * 0.5, green, blue * 0.8]),
    'Warm',
  );
  afterEach(() => removeLut(warm.id));

  it('is validated by mergeAdjust: a bad id is dropped, the amount clamped; older saves get none', () => {
    expect(mergeAdjust({ lut: warm.id, lutAmount: 250 })).toMatchObject({ lut: warm.id, lutAmount: 100 });
    expect(mergeAdjust({ lut: '../../etc', lutAmount: -3 })).toMatchObject({ lut: '', lutAmount: 0 });
    expect(mergeAdjust({ lut: 7 }).lut).toBe('');
    expect(mergeAdjust({ look: 'warm', contrast: 10 })).toMatchObject({ lut: '', lutAmount: 100 });
  });
  it('counts only when its table is loaded and its amount is above 0', () => {
    const first = { ...DEFAULT_ADJUST, lut: warm.id };
    expect(colourNeutral(first)).toBe(true);
    addLut(warm);
    expect(lutById(warm.id)).toBe(warm);
    expect(colourNeutral(first)).toBe(false);
    expect(colourNeutral({ ...first, lutAmount: 0 })).toBe(true);
  });
  it('identity table, Canvas 2D path: not a single pixel changes', () => {
    const id = identityLut(33);
    addLut(id);
    const px = new Uint8ClampedArray(4 * 4096);
    for (let index = 0; index < px.length; index++) px[index] = (index * 2654435761) >>> 24;
    const out = px.slice();
    chainPixels(out, { ...DEFAULT_ADJUST, lut: id.id });
    removeLut(id.id);
    // Transparent pixels are skipped, so compare every one.
    expect(out).toEqual(px);
  });
  it('mixes with the picture by its amount on the Canvas 2D path', () => {
    addLut(warm);
    const px = new Uint8ClampedArray([204, 100, 200, 255]);
    const full = px.slice(),
      half = px.slice();
    chainPixels(full, { ...DEFAULT_ADJUST, lut: warm.id });
    chainPixels(half, { ...DEFAULT_ADJUST, lut: warm.id, lutAmount: 50 });
    expect([...full.slice(0, 3)]).toEqual([102, 100, 160]);
    expect([...half.slice(0, 3)]).toEqual([153, 100, 180]);
  });
  it('runs last in the GPU colour chain, reading the picture and the packed table', () => {
    addLut(warm);
    const nodes = colourNodes({
      ...DEFAULT_ADJUST,
      look: 'bw',
      exposure: 0.5,
      lut: warm.id,
      lutAmount: 40,
      contrast: 10,
    });
    expect(nodes.map((x) => x.program.id)).toEqual(['look', 'light', 'lut', 'adjust']);
    const lut = nodes[2];
    expect(lut.program).toBe(LUT_PROGRAM);
    expect(lut.inputs?.[0]).toBe('prev');
    const data = lut.inputs?.[1] as DataInput;
    expect([data.key, data.width, data.height]).toEqual([`lut:${warm.id}`, 15, 10]);
    // Rounds (u[0].x = 0) as the chain's last step; amount, size and tiles per row follow.
    expect([...lut.uniforms.slice(0, 4)].map((value) => +value.toFixed(4))).toEqual([0, 0.4, 5, 3]);
    expect(nodes[1].uniforms[8]).toBe(1);
  });
  it('uploads the table once and keeps it frame after frame', () => {
    addLut(warm);
    const uploads: GpuTexture[] = [],
      released: GpuTexture[] = [],
      seen: GpuTexture[][] = [];
    const dev = {
      backend: 'webgl2',
      maxSize: 4096,
      lost: false,
      upload: (_s: unknown, width: number, height: number) => ({ width, height }),
      uploadData: (_d: Float32Array, width: number, height: number) => {
        const size = { width, height };
        uploads.push(size);
        return size;
      },
      target: (width: number, height: number) => ({ width, height }),
      pass: (_p: unknown, inputs: readonly GpuTexture[]) => void seen.push([...inputs]),
      release: (texture: GpuTexture) => void released.push(texture),
    } as unknown as GpuDevice;
    const pool = new TexturePool(dev),
      input = dev.upload({} as TexImageSource, 8, 8),
      nodes = colourNodes({ ...DEFAULT_ADJUST, lut: warm.id });
    for (let frame = 0; frame < 10; frame++) pool.give(runNodes(dev, pool, input, nodes));
    expect(uploads).toHaveLength(1);
    expect(seen.every((textures) => textures[0] === input && textures[1] === uploads[0])).toBe(true);
    pool.clear();
    expect(released).toContain(uploads[0]);
  });
});

describe('toHalf', () => {
  it('converts to 16-bit float bits, rounding to nearest', () => {
    const bits = [
      ...toHalf(new Float32Array([0, -0, 1, -2, 0.5, 65504, 1e6, 2 ** -24, 2 ** -26, 1 + 2 ** -11, Infinity])),
    ];
    expect(bits).toEqual([0, 0x8000, 0x3c00, 0xc000, 0x3800, 0x7bff, 0x7c00, 1, 0, 0x3c00, 0x7c00]);
    expect(toHalf(new Float32Array([NaN]))[0] & 0x7c00).toBe(0x7c00);
  });
});

describe('built-in presets', () => {
  it('are the seven looks, each changing only the look', () => {
    expect(BUILT_IN_PRESETS.map((preset) => preset.adjust.look)).toEqual([
      'none',
      'vivid',
      'warm',
      'cool',
      'bw',
      'tinted',
      'vintage',
    ]);
    expect(BUILT_IN_PRESETS.every((preset) => Object.keys(preset.adjust).join() === 'look')).toBe(true);
  });
  it('show as applied when the settings hold what they set, whatever the sliders', () => {
    const vivid = defined(BUILT_IN_PRESETS.find((preset) => preset.adjust.look === 'vivid'));
    expect(presetApplied({ ...DEFAULT_ADJUST, look: 'vivid', contrast: 30 }, vivid)).toBe(true);
    expect(presetApplied(DEFAULT_ADJUST, vivid)).toBe(false);
  });
});
