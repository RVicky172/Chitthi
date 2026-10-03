import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST } from './adjust';
import { runNodes, TexturePool, type GraphNode } from './gpu/graph';
import { MASK_MIX_PROGRAM, maskNodes } from './gpu/mask';
import type { GpuDevice, GpuTexture } from './gpu/types';
import { DEFAULT_EDIT, mergeEdit } from './instagram';
import {
  frameToPhoto,
  maskActive,
  mergeMasks,
  newBrushPart,
  newMask,
  paintStroke,
  rasterDims,
  rasterMask,
  rasterPart,
  rasterSize,
  type BrushPart,
  type BrushStroke,
  type FrameMask,
  type Mask,
} from './masks';

const stroke = (pts: number[], o: Partial<BrushStroke> = {}): BrushStroke => ({
  pts,
  size: 0.2,
  feather: 0,
  flow: 100,
  erase: false,
  ...o,
});
const N = 100;
const at = (m: Float32Array, x: number, y: number) => m[y * N + x];
/** Every stroke painted from nothing: what any cached raster must equal. */
function fresh(strokes: BrushStroke[]): Float32Array {
  const m = new Float32Array(N * N);
  for (const s of strokes) paintStroke(m, N, N, s);
  return m;
}

describe('brush strokes', () => {
  it('cover the brush swept along the points, with a hard edge when not feathered', () => {
    const m = fresh([stroke([0.2, 0.5, 0.8, 0.5])]);
    expect(at(m, 50, 50)).toBe(1);
    expect(at(m, 20, 55)).toBe(1);
    // Radius 10 px: inside at 8 px from the line, outside at 12.
    expect(at(m, 50, 42)).toBe(1);
    expect(at(m, 50, 37)).toBe(0);
    expect(at(m, 5, 50)).toBe(0);
  });
  it('fade from the centre with feather, smoothly', () => {
    const m = fresh([stroke([0.5, 0.5], { feather: 100, size: 0.4 })]);
    const row = [50, 55, 60, 65, 69].map((x) => at(m, x, 50));
    expect(row[0]).toBeGreaterThan(0.95);
    for (let i = 1; i < row.length; i++) expect(row[i]).toBeLessThan(row[i - 1]);
    expect(row[4]).toBeLessThan(0.05);
  });
  it('build up with flow over passes, never past 1, and erase takes away', () => {
    const s = stroke([0.5, 0.5], { flow: 50 });
    expect(at(fresh([s]), 50, 50)).toBeCloseTo(0.5, 6);
    expect(at(fresh([s, s]), 50, 50)).toBeCloseTo(0.75, 6);
    expect(at(fresh([s, s, stroke([0.5, 0.5], { erase: true, flow: 50 })]), 50, 50)).toBeCloseTo(0.375, 6);
    expect(Math.max(...fresh(Array(30).fill(s)))).toBeLessThanOrEqual(1);
  });
  it('one pass is one pass: a stroke crossing itself does not build up', () => {
    const m = fresh([stroke([0.2, 0.5, 0.8, 0.5, 0.5, 0.2, 0.5, 0.8], { flow: 40 })]);
    expect(at(m, 50, 50)).toBeCloseTo(0.4, 6);
  });
  it('ignore what falls outside the raster', () => {
    const m = fresh([stroke([-0.3, -0.3, 1.4, -0.2])]);
    expect(m.every((v) => v === 0)).toBe(true);
  });
});

describe('cached rasters', () => {
  it('match painting from nothing while a stroke is drawn, strokes are added, and one is undone', () => {
    const part: BrushPart = { ...newBrushPart(), strokes: [] };
    const a = stroke([0.1, 0.1, 0.4, 0.3], { flow: 60, feather: 40 }),
      b = stroke([0.6, 0.6, 0.6, 0.9], { erase: true, flow: 70 });
    const steps: BrushStroke[][] = [[a], [a, b]];
    // The third stroke grows point by point, as during a drag.
    let pts = [0.2, 0.8];
    for (let i = 0; i < 6; i++) {
      pts = [...pts, 0.2 + i * 0.1, 0.8 - i * 0.05];
      steps.push([a, b, stroke(pts, { flow: 50, feather: 70 })]);
    }
    steps.push([a, b], [a], [a, b], []);
    for (const strokes of steps) expect(rasterPart({ ...part, strokes }, N, N)).toEqual(fresh(strokes));
  });
  it('are kept per part and size: asking again does no work', () => {
    const part = { ...newBrushPart(), strokes: [stroke([0.5, 0.5])] };
    expect(rasterPart(part, N, N)).toBe(rasterPart(part, N, N));
    expect(rasterPart(part, 50, 50)).toHaveLength(2500);
  });
});

describe('a mask', () => {
  const left = stroke([0.25, 0, 0.25, 1], { size: 0.5 }),
    top = stroke([0, 0.25, 1, 0.25], { size: 0.5 });
  const mask = (parts: [BrushStroke, BrushPart['combine'], boolean?][], invert = false): Mask => ({
    ...newMask('Test'),
    invert,
    parts: parts.map(([s, combine, inv]) => ({ ...newBrushPart(combine), invert: !!inv, strokes: [s] })),
  });
  const corners = (m: Float32Array) => [at(m, 10, 10), at(m, 90, 10), at(m, 10, 90), at(m, 90, 90)];
  it('combines its parts in order: add, subtract, intersect', () => {
    expect(
      corners(
        rasterMask(
          mask([
            [left, 'add'],
            [top, 'add'],
          ]),
          N,
          N,
        ),
      ),
    ).toEqual([1, 1, 1, 0]);
    expect(
      corners(
        rasterMask(
          mask([
            [left, 'add'],
            [top, 'subtract'],
          ]),
          N,
          N,
        ),
      ),
    ).toEqual([0, 0, 1, 0]);
    expect(
      corners(
        rasterMask(
          mask([
            [left, 'add'],
            [top, 'intersect'],
          ]),
          N,
          N,
        ),
      ),
    ).toEqual([1, 0, 0, 0]);
    // The first part is always added, whatever it says.
    expect(corners(rasterMask(mask([[left, 'subtract']]), N, N))).toEqual([1, 0, 1, 0]);
  });
  it('inverts a part or the whole mask', () => {
    expect(corners(rasterMask(mask([[left, 'add', true]]), N, N))).toEqual([0, 1, 0, 1]);
    expect(
      corners(
        rasterMask(
          mask(
            [
              [left, 'add'],
              [top, 'add'],
            ],
            true,
          ),
          N,
          N,
        ),
      ),
    ).toEqual([0, 0, 0, 1]);
  });
  it('applies only when on, with parts and with settings that change something', () => {
    const m = newMask('A');
    expect(maskActive(m)).toBe(false);
    expect(maskActive({ ...m, adjust: { ...DEFAULT_ADJUST, exposure: 1 } })).toBe(true);
    expect(maskActive({ ...m, on: false, adjust: { ...DEFAULT_ADJUST, exposure: 1 } })).toBe(false);
    expect(maskActive({ ...m, parts: [], adjust: { ...DEFAULT_ADJUST, clarity: 30 } })).toBe(false);
  });
});

describe('mergeMasks', () => {
  it('keeps valid masks and clamps what is out of range', () => {
    const [m] = mergeMasks([
      {
        id: 'm1',
        name: '  Sky   glow ',
        invert: true,
        parts: [
          {
            id: 'b1',
            kind: 'brush',
            combine: 'intersect',
            strokes: [{ pts: [0.1, 0.2, 9, -9], size: 4, feather: -5, flow: 0, erase: true }],
          },
        ],
        adjust: { exposure: 99 },
      },
    ]);
    expect(m).toMatchObject({ id: 'm1', name: 'Sky glow', on: true, invert: true });
    expect(m.parts[0]).toMatchObject({
      id: 'b1',
      combine: 'intersect',
      strokes: [{ pts: [0.1, 0.2, 1.5, -0.5], size: 0.6, feather: 0, flow: 1, erase: true }],
    });
    expect(m.adjust.exposure).toBe(4);
  });
  it('drops what cannot be a mask, a part or a stroke, and gives repeated ids new ones', () => {
    expect(mergeMasks('x')).toEqual([]);
    const ms = mergeMasks([
      null,
      {
        id: 'a',
        parts: [{ kind: 'laser' }, { kind: 'brush', strokes: [{ pts: [0.1] }, { pts: [0.1, 'x'] }, 'nope'] }],
      },
      { id: 'a', name: '' },
    ]);
    expect(ms).toHaveLength(2);
    expect(ms[0].parts).toHaveLength(1);
    expect(ms[0].parts[0].strokes).toEqual([]);
    expect(ms[1].id).not.toBe('a');
    expect(ms[1].name).toBe('Mask');
  });
  it('limits how many masks, parts, strokes and points there are', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, parts: [] }));
    expect(mergeMasks(many)).toHaveLength(16);
    const s = { pts: Array(20000).fill(0.5) };
    const [m] = mergeMasks([{ parts: Array(20).fill({ kind: 'brush', strokes: Array(900).fill(s) }) }]);
    expect(m.parts).toHaveLength(8);
    expect(m.parts[0].strokes).toHaveLength(400);
    expect(m.parts[0].strokes[0].pts).toHaveLength(8000);
  });
  it('are part of every edit, and older edits have none', () => {
    expect(DEFAULT_EDIT.masks).toEqual([]);
    expect(mergeEdit({ fit: 'fit' }).masks).toEqual([]);
    expect(mergeEdit({ masks: [{ id: 'x', parts: [] }] }).masks).toHaveLength(1);
  });
});

describe('placing masks', () => {
  it('maps a frame point to the photo, whatever its turn and mirror', () => {
    const base = { cx: 200, cy: 150, w: 300, h: 200, rot: 0, flip: false };
    expect(frameToPhoto(base, 200, 150)).toEqual([0.5, 0.5]);
    expect(frameToPhoto(base, 50, 50)).toEqual([0, 0]);
    expect(frameToPhoto({ ...base, flip: true }, 50, 50)).toEqual([1, 0]);
    // Turned a quarter clockwise: the photo's top-left corner is now at the frame's top right.
    const [u, v] = frameToPhoto({ ...base, rot: 90 }, 300, 0);
    expect(u).toBeCloseTo(0, 9);
    expect(v).toBeCloseTo(0, 9);
  });
  it('rasterise at a few sizes with the photo’s proportions', () => {
    expect([rasterSize(80), rasterSize(700), rasterSize(1350), rasterSize(1700), rasterSize(9000)]).toEqual([
      256, 512, 1024, 2048, 2048,
    ]);
    expect(rasterDims(4000, 3000, 1024)).toEqual([1024, 768]);
    expect(rasterDims(1080, 1350, 256)).toEqual([205, 256]);
  });
});

describe('masks on the GPU', () => {
  const frame: FrameMask = { key: 'mask:t', width: 8, height: 8, data: new Uint8Array(64) };
  it('run the mask’s own steps on the picture so far, then mix by the mask', () => {
    const nodes: GraphNode[] = [{ program: MASK_MIX_PROGRAM, uniforms: new Float32Array(4) }];
    const out = maskNodes(nodes, 0, { ...DEFAULT_ADJUST, exposure: 1, clarity: 20 }, frame, 8, 8);
    const ids = nodes.map((n) => n.program.id);
    expect(ids[1]).toBe('light');
    expect(ids.at(-1)).toBe('maskmix');
    expect(out).toBe(nodes.length - 1);
    const mix = nodes.at(-1)!;
    expect(mix.inputs?.slice(0, 2)).toEqual([0, nodes.length - 2]);
    expect(mix.inputs?.[2]).toMatchObject({ key: 'mask:t', width: 8, height: 8 });
  });
  it('start from the source when nothing came before, and add nothing for settings that do nothing', () => {
    const nodes: never[] = [];
    expect(maskNodes(nodes, 'source', DEFAULT_ADJUST, frame, 8, 8)).toBe('source');
    expect(nodes).toEqual([]);
  });
  it('upload each mask once, frame after frame', () => {
    const uploads: unknown[] = [];
    const dev = {
      uploadMask: (_s: unknown, width: number, height: number) => {
        const t = { width, height };
        uploads.push(t);
        return t;
      },
      target: (width: number, height: number) => ({ width, height }),
      pass: () => {},
      release: () => {},
    } as unknown as GpuDevice;
    const pool = new TexturePool(dev),
      input = { width: 8, height: 8 } as GpuTexture,
      nodes: Parameters<typeof maskNodes>[0] = [];
    maskNodes(nodes, 'source', { ...DEFAULT_ADJUST, exposure: 1 }, frame, 8, 8);
    for (let f = 0; f < 10; f++) pool.give(runNodes(dev, pool, input, nodes));
    expect(uploads).toHaveLength(1);
  });
});
