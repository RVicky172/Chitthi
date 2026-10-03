import { afterEach, describe, expect, it } from 'vitest';
import { BUILT_IN_PRESETS, presetApplied } from '../data/presets';
import { colourNeutral, DEFAULT_ADJUST, mergeAdjust } from './adjust';
import { chainPixels } from './chain';
import { colourNodes } from './gpu/colour';
import { runNodes, TexturePool, type DataInput } from './gpu/graph';
import { LUT_PROGRAM } from './gpu/lut';
import type { GpuDevice, GpuTexture } from './gpu/types';
import { toHalf } from './gpu/webgpu';
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
} from './lut';

/** A .cube file for a table made by f(r, g, b) at size points per side. */
function cube(size: number, f: (r: number, g: number, b: number) => number[], head = ''): string {
  const lines = [head, `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++)
        lines.push(
          f(r / (size - 1), g / (size - 1), b / (size - 1))
            .map((v) => v.toFixed(6))
            .join(' '),
        );
  return lines.join('\n');
}
const same = (r: number, g: number, b: number) => [r, g, b];
const at = (l: Lut, r: number, g: number, b: number) => {
  const o = [0, 0, 0];
  lutPixel(l, r, g, b, o, lutScale(l));
  return o;
};

describe('parseCube', () => {
  it('reads the title, size and values, skipping comments, blank lines, a BOM and Windows line ends', () => {
    const text = `${String.fromCharCode(0xfeff)}# made by hand\r\nTITLE "Teal and orange"\r\n\r\n${cube(2, same).replace(/\n/g, '\r\n')}`;
    const l = parseCube(text, 'x.cube');
    expect(l.title).toBe('Teal and orange');
    expect(l.size).toBe(2);
    expect([...l.data.slice(0, 6)]).toEqual([0, 0, 0, 1, 0, 0]);
    expect([...l.data.slice(-3)]).toEqual([1, 1, 1]);
  });
  it('names the LUT after its file when it has no title, and skips keywords it does not know', () => {
    expect(parseCube(cube(3, same, 'LUT_IN_VIDEO_RANGE'), 'Film look.cube').title).toBe('Film look');
  });
  it('reads DOMAIN_MIN / DOMAIN_MAX and LUT_3D_INPUT_RANGE', () => {
    const l = parseCube(`DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n${cube(2, same)}`);
    expect(l.max).toEqual([2, 2, 2]);
    // Half of the domain is the middle of the table.
    expect(at(l, 1, 1, 1).map((v) => +v.toFixed(6))).toEqual([0.5, 0.5, 0.5]);
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
    expect(parseCube(cube(3, same)).id).not.toBe(parseCube(cube(3, (r, g, b) => [b, g, r])).id);
    expect(parseCube(cube(3, same)).id).toMatch(/^[0-9a-z]{2,16}$/);
  });
  it('keeps wild values within what the GPU’s 16-bit floats can hold', () => {
    const l = parseCube(cube(2, same).replace('1.000000 1.000000 1.000000', '1e9 0 -1e9'));
    expect([...l.data.slice(-3)]).toEqual([64, 0, -64]);
  });
});

describe('lutPixel', () => {
  it('changes nothing with an identity table, between the points as well as on them', () => {
    for (const size of [2, 17, 33]) {
      const l = identityLut(size);
      for (let i = 0; i < 200; i++) {
        const c = [Math.random(), Math.random(), Math.random()];
        at(l, c[0], c[1], c[2]).forEach((v, k) => expect(v).toBeCloseTo(c[k], 6));
      }
    }
  });
  it('is exact for any table that is linear in the colour, as tetrahedral interpolation is', () => {
    const f = (r: number, g: number, b: number) => [
      0.2 + 0.5 * r + 0.1 * b,
      0.9 * g - 0.1 * r,
      0.3 * b + 0.3 * g + 0.2,
    ];
    const l = parseCube(cube(5, f));
    for (let i = 0; i < 200; i++) {
      const c = [Math.random(), Math.random(), Math.random()];
      at(l, c[0], c[1], c[2]).forEach((v, k) => expect(v).toBeCloseTo(f(c[0], c[1], c[2])[k], 5));
    }
  });
  it('keeps greys grey when the table does, even between points', () => {
    const l = parseCube(
      cube(9, (r, g, b) => {
        const m = (r + g + b) / 3;
        return [m + (r - m) * 1.5, m + (g - m) * 0.5, m + (b - m) * 1.2].map((v) => v * v);
      }),
    );
    for (const v of [0.03, 0.31, 0.5, 0.77, 0.99]) {
      const [r, g, b] = at(l, v, v, v);
      expect(g).toBeCloseTo(r, 9);
      expect(b).toBeCloseTo(r, 9);
    }
  });
  it('reads the table’s edge for values outside its range', () => {
    const l = parseCube(cube(3, (r, g, b) => [1 - r, g, b]));
    expect(at(l, -0.5, 1.5, 0.5)).toEqual([1, 1, 0.5]);
  });
});

describe('lutTexture', () => {
  it('lays one tile per blue slice in rows, small enough for any device even at 65³', () => {
    const t = lutTexture(identityLut(65));
    expect([t.width, t.height, t.cols]).toEqual([585, 520, 9]);
    const t3 = lutTexture(identityLut(3));
    expect([t3.width, t3.height, t3.cols]).toEqual([6, 6, 2]);
    // r = 2, g = 1, b = 2: the third slice is tile (0, 1); red across, green down.
    const k = ((3 + 1) * t3.width + 2) * 4;
    expect([...t3.rgba.slice(k, k + 4)]).toEqual([1, 0.5, 1, 1]);
  });
  it('is packed once per table', () => {
    const l = identityLut(5);
    expect(lutTexture(l)).toBe(lutTexture(l));
  });
});

describe('a LUT in the colour settings', () => {
  const warm = parseCube(
    cube(5, (r, g, b) => [r * 0.5, g, b * 0.8]),
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
    const a = { ...DEFAULT_ADJUST, lut: warm.id };
    expect(colourNeutral(a)).toBe(true);
    addLut(warm);
    expect(lutById(warm.id)).toBe(warm);
    expect(colourNeutral(a)).toBe(false);
    expect(colourNeutral({ ...a, lutAmount: 0 })).toBe(true);
  });
  it('identity table, Canvas 2D path: not a single pixel changes', () => {
    const id = identityLut(33);
    addLut(id);
    const px = new Uint8ClampedArray(4 * 4096);
    for (let i = 0; i < px.length; i++) px[i] = (i * 2654435761) >>> 24;
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
    const n = colourNodes({ ...DEFAULT_ADJUST, look: 'bw', exposure: 0.5, lut: warm.id, lutAmount: 40, contrast: 10 });
    expect(n.map((x) => x.program.id)).toEqual(['look', 'light', 'lut', 'adjust']);
    const lut = n[2];
    expect(lut.program).toBe(LUT_PROGRAM);
    expect(lut.inputs?.[0]).toBe('prev');
    const data = lut.inputs?.[1] as DataInput;
    expect([data.key, data.width, data.height]).toEqual([`lut:${warm.id}`, 15, 10]);
    // Rounds (u[0].x = 0) as the chain's last step; amount, size and tiles per row follow.
    expect([...lut.uniforms.slice(0, 4)].map((v) => +v.toFixed(4))).toEqual([0, 0.4, 5, 3]);
    expect(n[1].uniforms[8]).toBe(1);
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
        const t = { width, height };
        uploads.push(t);
        return t;
      },
      target: (width: number, height: number) => ({ width, height }),
      pass: (_p: unknown, inputs: readonly GpuTexture[]) => void seen.push([...inputs]),
      release: (t: GpuTexture) => void released.push(t),
    } as unknown as GpuDevice;
    const pool = new TexturePool(dev),
      input = dev.upload({} as TexImageSource, 8, 8),
      nodes = colourNodes({ ...DEFAULT_ADJUST, lut: warm.id });
    for (let f = 0; f < 10; f++) pool.give(runNodes(dev, pool, input, nodes));
    expect(uploads).toHaveLength(1);
    expect(seen.every((s) => s[0] === input && s[1] === uploads[0])).toBe(true);
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
    expect(BUILT_IN_PRESETS.map((p) => p.adjust.look)).toEqual([
      'none',
      'vivid',
      'warm',
      'cool',
      'bw',
      'tinted',
      'vintage',
    ]);
    expect(BUILT_IN_PRESETS.every((p) => Object.keys(p.adjust).join() === 'look')).toBe(true);
  });
  it('show as applied when the settings hold what they set, whatever the sliders', () => {
    const vivid = BUILT_IN_PRESETS.find((p) => p.adjust.look === 'vivid')!;
    expect(presetApplied({ ...DEFAULT_ADJUST, look: 'vivid', contrast: 30 }, vivid)).toBe(true);
    expect(presetApplied(DEFAULT_ADJUST, vivid)).toBe(false);
  });
});
