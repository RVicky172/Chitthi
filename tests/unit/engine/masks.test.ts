import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST } from '@/engine/adjust';
import { runNodes, TexturePool, type GraphNode } from '@/engine/gpu/graph';
import { MASK_MIX_PROGRAM, maskNodes } from '@/engine/gpu/mask';
import type { GpuDevice, GpuTexture } from '@/engine/gpu/types';
import { DEFAULT_EDIT, mergeEdit } from '@/engine/instagram';
import { segmentAt, segmentOf, segmentVersion, setSegment, shareSegments } from '@/engine/segments';
import {
  aiTargets,
  type AiPart,
  newPart,
  type LinearPart,
  type RadialPart,
  maskActive,
  newBrushPart,
  newMask,
  type BrushPart,
  type BrushStroke,
  type Mask,
} from '@/engine/masks';
import { dragPart, frameToPhoto, partHandles, photoToFrame, type FrameMask } from '@/engine/maskPlace';
import {
  oklab,
  rasterShape,
  type PhotoSample,
  rasterDims,
  rasterMask,
  rasterPart,
  rasterSize,
} from '@/engine/maskRaster';
import { mergeMasks } from '@/engine/maskGate';
import { paintStroke } from '@/engine/maskBrush';

import { defined } from '../../support/defined';
const stroke = (pts: number[], options: Partial<BrushStroke> = {}): BrushStroke => ({
  pts,
  size: 0.2,
  feather: 0,
  flow: 100,
  erase: false,
  ...options,
});
const count = 100;
const at = (values: Float32Array, x: number, y: number) => values[y * count + x];
/** Every stroke painted from nothing: what any cached raster must equal. */
function fresh(strokes: BrushStroke[]): Float32Array {
  const values = new Float32Array(count * count);
  for (const brushStroke of strokes) paintStroke(values, count, count, brushStroke);
  return values;
}

describe('brush strokes', () => {
  it('cover the brush swept along the points, with a hard edge when not feathered', () => {
    const values = fresh([stroke([0.2, 0.5, 0.8, 0.5])]);
    expect(at(values, 50, 50)).toBe(1);
    expect(at(values, 20, 55)).toBe(1);
    // Radius 10 px: inside at 8 px from the line, outside at 12.
    expect(at(values, 50, 42)).toBe(1);
    expect(at(values, 50, 37)).toBe(0);
    expect(at(values, 5, 50)).toBe(0);
  });
  it('fade from the centre with feather, smoothly', () => {
    const values = fresh([stroke([0.5, 0.5], { feather: 100, size: 0.4 })]);
    const row = [50, 55, 60, 65, 69].map((x) => at(values, x, 50));
    expect(row[0]).toBeGreaterThan(0.95);
    for (let index = 1; index < row.length; index++) expect(row[index]).toBeLessThan(row[index - 1]);
    expect(row[4]).toBeLessThan(0.05);
  });
  it('build up with flow over passes, never past 1, and erase takes away', () => {
    const brushStroke = stroke([0.5, 0.5], { flow: 50 });
    expect(at(fresh([brushStroke]), 50, 50)).toBeCloseTo(0.5, 6);
    expect(at(fresh([brushStroke, brushStroke]), 50, 50)).toBeCloseTo(0.75, 6);
    expect(at(fresh([brushStroke, brushStroke, stroke([0.5, 0.5], { erase: true, flow: 50 })]), 50, 50)).toBeCloseTo(
      0.375,
      6,
    );
    expect(Math.max(...fresh(Array(30).fill(brushStroke)))).toBeLessThanOrEqual(1);
  });
  it('one pass is one pass: a stroke crossing itself does not build up', () => {
    const values = fresh([stroke([0.2, 0.5, 0.8, 0.5, 0.5, 0.2, 0.5, 0.8], { flow: 40 })]);
    expect(at(values, 50, 50)).toBeCloseTo(0.4, 6);
  });
  it('ignore what falls outside the raster', () => {
    const values = fresh([stroke([-0.3, -0.3, 1.4, -0.2])]);
    expect(values.every((value) => value === 0)).toBe(true);
  });
});

describe('cached rasters', () => {
  it('match painting from nothing while a stroke is drawn, strokes are added, and one is undone', () => {
    const part: BrushPart = { ...newBrushPart(), strokes: [] };
    const brushStroke = stroke([0.1, 0.1, 0.4, 0.3], { flow: 60, feather: 40 }),
      eraser = stroke([0.6, 0.6, 0.6, 0.9], { erase: true, flow: 70 });
    const steps: BrushStroke[][] = [[brushStroke], [brushStroke, eraser]];
    // The third stroke grows point by point, as during a drag.
    let pts = [0.2, 0.8];
    for (let index = 0; index < 6; index++) {
      pts = [...pts, 0.2 + index * 0.1, 0.8 - index * 0.05];
      steps.push([brushStroke, eraser, stroke(pts, { flow: 50, feather: 70 })]);
    }
    steps.push([brushStroke, eraser], [brushStroke], [brushStroke, eraser], []);
    for (const strokes of steps) expect(rasterPart({ ...part, strokes }, count, count)).toEqual(fresh(strokes));
  });
  it('are kept per part and size: asking again does no work', () => {
    const part = { ...newBrushPart(), strokes: [stroke([0.5, 0.5])] };
    expect(rasterPart(part, count, count)).toBe(rasterPart(part, count, count));
    expect(rasterPart(part, 50, 50)).toHaveLength(2500);
  });
});

describe('a mask', () => {
  const left = stroke([0.25, 0, 0.25, 1], { size: 0.5 }),
    top = stroke([0, 0.25, 1, 0.25], { size: 0.5 });
  const mask = (parts: [BrushStroke, BrushPart['combine'], boolean?][], invert = false): Mask => ({
    ...newMask('Test'),
    invert,
    parts: parts.map(([brushStroke, combine, inv]) => ({
      ...newBrushPart(combine),
      invert: !!inv,
      strokes: [brushStroke],
    })),
  });
  const corners = (values: Float32Array) => [
    at(values, 10, 10),
    at(values, 90, 10),
    at(values, 10, 90),
    at(values, 90, 90),
  ];
  it('combines its parts in order: add, subtract, intersect', () => {
    expect(
      corners(
        rasterMask(
          mask([
            [left, 'add'],
            [top, 'add'],
          ]),
          count,
          count,
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
          count,
          count,
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
          count,
          count,
        ),
      ),
    ).toEqual([1, 0, 0, 0]);
    // The first part is always added, whatever it says.
    expect(corners(rasterMask(mask([[left, 'subtract']]), count, count))).toEqual([1, 0, 1, 0]);
  });
  it('inverts a part or the whole mask', () => {
    expect(corners(rasterMask(mask([[left, 'add', true]]), count, count))).toEqual([0, 1, 0, 1]);
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
          count,
          count,
        ),
      ),
    ).toEqual([0, 0, 0, 1]);
  });
  it('applies only when on, with parts and with settings that change something', () => {
    const blank = newMask('A');
    expect(maskActive(blank)).toBe(false);
    expect(maskActive({ ...blank, adjust: { ...DEFAULT_ADJUST, exposure: 1 } })).toBe(true);
    expect(maskActive({ ...blank, on: false, adjust: { ...DEFAULT_ADJUST, exposure: 1 } })).toBe(false);
    expect(maskActive({ ...blank, parts: [], adjust: { ...DEFAULT_ADJUST, clarity: 30 } })).toBe(false);
  });
});

describe('mergeMasks', () => {
  it('keeps valid masks and clamps what is out of range', () => {
    const [mask] = mergeMasks([
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
    expect(mask).toMatchObject({ id: 'm1', name: 'Sky glow', on: true, invert: true });
    expect(mask.parts[0]).toMatchObject({
      id: 'b1',
      combine: 'intersect',
      strokes: [{ pts: [0.1, 0.2, 1.5, -0.5], size: 0.6, feather: 0, flow: 1, erase: true }],
    });
    expect(mask.adjust.exposure).toBe(4);
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
    expect(ms[0].parts[0]).toMatchObject({ kind: 'brush', strokes: [] });
    expect(ms[1].id).not.toBe('a');
    expect(ms[1].name).toBe('Mask');
  });
  it('limits how many masks, parts, strokes and points there are', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `m${index}`, parts: [] }));
    expect(mergeMasks(many)).toHaveLength(16);
    const huge = { pts: Array(20000).fill(0.5) };
    const [mask] = mergeMasks([{ parts: Array(20).fill({ kind: 'brush', strokes: Array(900).fill(huge) }) }]);
    expect(mask.parts).toHaveLength(8);
    const part = mask.parts[0] as BrushPart;
    expect(part.strokes).toHaveLength(400);
    expect(part.strokes[0].pts).toHaveLength(8000);
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
    const [photoX, photoY] = frameToPhoto({ ...base, rot: 90 }, 300, 0);
    expect(photoX).toBeCloseTo(0, 9);
    expect(photoY).toBeCloseTo(0, 9);
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
    const ids = nodes.map((node) => node.program.id);
    expect(ids[1]).toBe('light');
    expect(ids.at(-1)).toBe('maskmix');
    expect(out).toBe(nodes.length - 1);
    const mix = defined(nodes.at(-1));
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
        const size = { width, height };
        uploads.push(size);
        return size;
      },
      target: (width: number, height: number) => ({ width, height }),
      pass: () => {},
      release: () => {},
    } as unknown as GpuDevice;
    const pool = new TexturePool(dev),
      input = { width: 8, height: 8 } as GpuTexture,
      nodes: Parameters<typeof maskNodes>[0] = [];
    maskNodes(nodes, 'source', { ...DEFAULT_ADJUST, exposure: 1 }, frame, 8, 8);
    for (let round = 0; round < 10; round++) pool.give(runNodes(dev, pool, input, nodes));
    expect(uploads).toHaveLength(1);
  });
});

describe('gradients', () => {
  const lin = (options: Partial<LinearPart> = {}) => ({ ...(newPart('linear') as LinearPart), ...options });
  const rad = (options: Partial<RadialPart> = {}) => ({ ...(newPart('radial') as RadialPart), ...options });
  it('linear: full before the fade, nothing after it, smooth and falling in between', () => {
    // Downwards, the fade from y = 30 to y = 70 (of 100).
    const values = rasterShape(lin({ x: 0.5, y: 0.5, angle: 90, width: 0.4 }), count, count);
    expect(at(values, 50, 10)).toBe(1);
    expect(at(values, 50, 90)).toBe(0);
    expect(at(values, 10, 50)).toBeCloseTo(0.5, 1);
    for (let y = 31; y < 70; y++) expect(at(values, 50, y)).toBeLessThan(at(values, 50, y - 1) + 1e-9);
    // Every column is the same along the fade's lines.
    expect(at(values, 3, 40)).toBeCloseTo(at(values, 97, 40), 9);
  });
  it('linear: turns with its angle', () => {
    const values = rasterShape(lin({ x: 0.5, y: 0.5, angle: 0, width: 0.2 }), count, count);
    expect([at(values, 10, 50), at(values, 90, 50)]).toEqual([1, 0]);
  });
  it('radial: full inside, nothing outside, fading over the feather; an ellipse turned by its angle', () => {
    const values = rasterShape(rad({ x: 0.5, y: 0.5, rx: 0.3, ry: 0.3, feather: 50 }), count, count);
    expect(at(values, 50, 50)).toBe(1);
    expect(at(values, 62, 50)).toBe(1);
    expect(at(values, 72, 50)).toBeGreaterThan(0);
    expect(at(values, 72, 50)).toBeLessThan(1);
    expect(at(values, 85, 50)).toBe(0);
    const raster = rasterShape(rad({ rx: 0.4, ry: 0.1, feather: 0, angle: 90 }), count, count);
    // Turned a quarter: tall, not wide.
    expect([at(raster, 50, 20), at(raster, 20, 50)]).toEqual([1, 0]);
  });
});

describe('ranges', () => {
  /** A 100 × 100 photo: left half dark red, right half a grey ramp from black (top) to white (bottom). */
  const photo: PhotoSample = (() => {
    const pixels = new Uint8ClampedArray(count * count * 4);
    for (let y = 0; y < count; y++)
      for (let x = 0; x < count; x++) {
        const index = (y * count + x) * 4,
          amount = Math.round((y / (count - 1)) * 255);
        pixels.set(x < 50 ? [150, 30, 25, 255] : [amount, amount, amount, 255], index);
      }
    return { data: pixels, token: 1 };
  })();
  const luma = (options: object) => ({ ...newPart('luma'), ...options }) as Parameters<typeof rasterShape>[0];
  const colour = (options: object) => ({ ...newPart('colour'), ...options }) as Parameters<typeof rasterShape>[0];
  it('brightness: the tones in the range, softly edged', () => {
    const values = rasterShape(luma({ lo: 40, hi: 60, smooth: 10 }), count, count, photo);
    expect(at(values, 80, 50)).toBe(1);
    expect(at(values, 80, 5)).toBe(0);
    expect(at(values, 80, 95)).toBe(0);
    expect(at(values, 80, 37)).toBeGreaterThan(0);
    expect(at(values, 80, 37)).toBeLessThan(1);
  });
  it('colour: the picked colour and those near it, not greys', () => {
    const values = rasterShape(colour({ r: 160, g: 35, b: 30, range: 30 }), count, count, photo);
    expect(at(values, 10, 10)).toBe(1);
    expect(at(values, 80, 30)).toBe(0);
    expect(at(values, 80, 70)).toBe(0);
    // A narrow range misses even a slightly different red.
    const narrow = rasterShape(colour({ r: 200, g: 60, b: 40, range: 1 }), count, count, photo);
    expect(at(narrow, 10, 10)).toBe(0);
  });
  it('cover everything without the photo, and are cached per photo', () => {
    const part = newPart('luma');
    expect(rasterShape(luma({}), 4, 4).every((value) => value === 1)).toBe(true);
    expect(rasterPart(part, count, count, photo)).toBe(rasterPart(part, count, count, photo));
    expect(rasterPart(part, count, count, { ...photo, token: 2 })).not.toBe(rasterPart(part, count, count, photo));
  });
  it('OKLab puts white at L 1 and black at 0, greys without colour', () => {
    expect(oklab(255, 255, 255)[0]).toBeCloseTo(1, 3);
    expect(oklab(0, 0, 0)[0]).toBeCloseTo(0, 6);
    const lab = oklab(128, 128, 128);
    expect(Math.hypot(lab[1], lab[2])).toBeLessThan(1e-3);
  });
});

describe('new kinds in mergeMasks', () => {
  it('keep gradients and ranges, clamped, with a range in order', () => {
    const [mask] = mergeMasks([
      {
        parts: [
          { kind: 'linear', x: 9, y: 0.2, angle: 400, width: 0 },
          { kind: 'radial', rx: 0.5, ry: -1, feather: 300, combine: 'subtract' },
          { kind: 'colour', r: 300, g: 12.6, b: 'x', range: 0 },
          { kind: 'luma', lo: 80, hi: 20, smooth: 5, combine: 'intersect' },
        ],
      },
    ]);
    expect(mask.parts.map((part) => part.kind)).toEqual(['linear', 'radial', 'colour', 'luma']);
    expect(mask.parts[0]).toMatchObject({ x: 1.5, y: 0.2, angle: 180, width: 0.01 });
    expect(mask.parts[1]).toMatchObject({ rx: 0.5, ry: 0.01, feather: 100, combine: 'subtract' });
    expect(mask.parts[2]).toMatchObject({ r: 255, g: 13, b: 128, range: 1 });
    expect(mask.parts[3]).toMatchObject({ lo: 20, hi: 80, smooth: 5, combine: 'intersect' });
  });
  it('make later range parts intersect by default, shapes add', () => {
    expect([
      newPart('colour', false).combine,
      newPart('luma', false).combine,
      newPart('radial', false).combine,
    ]).toEqual(['intersect', 'intersect', 'add']);
  });
});

describe('gradient handles', () => {
  const place = { cx: 200, cy: 150, w: 300, h: 200, rot: 90, flip: true };
  const flat = { ...place, rot: 0, flip: false };
  it('photoToFrame undoes frameToPhoto, turned and mirrored', () => {
    for (const [share, value] of [
      [0, 0],
      [0.3, 0.8],
      [1.2, -0.1],
    ]) {
      const [x, y] = photoToFrame(place, share, value),
        back = frameToPhoto(place, x, y);
      expect(back[0]).toBeCloseTo(share, 9);
      expect(back[1]).toBeCloseTo(value, 9);
    }
  });
  it('sit at the centre and at the end or radii of a gradient', () => {
    const linear = { ...(newPart('linear') as LinearPart), x: 0.5, y: 0.5, angle: 0, width: 0.4 };
    expect(partHandles(linear, flat)).toEqual([
      { id: 'move', x: 200, y: 150 },
      { id: 'end', x: 260, y: 150 },
    ]);
    const radial = { ...(newPart('radial') as RadialPart), x: 0.5, y: 0.5, rx: 0.2, ry: 0.1, angle: 0 };
    const [, rx, ry] = partHandles(radial, flat);
    expect([rx.x, rx.y]).toEqual([260, 150]);
    expect(ry.x).toBeCloseTo(200, 9);
    expect(ry.y).toBeCloseTo(180, 9);
    expect(partHandles(newPart('brush'), flat)).toEqual([]);
  });
  it('move, turn and resize a gradient, or draw one anew', () => {
    const linear = { ...(newPart('linear') as LinearPart), x: 0.5, y: 0.5, angle: 0, width: 0.4 };
    const mv = dragPart(linear, 'move', [0.5, 0.5], [0.6, 0.4], flat);
    expect(mv.x).toBeCloseTo(0.6, 9);
    expect(mv.y).toBeCloseTo(0.4, 9);
    // The end dragged to 45 px straight below the centre: the fade now points down and is 90 px (0.3 of the width) long.
    const dragged = dragPart(linear, 'end', [0.7, 0.5], [0.5, 0.725], flat);
    expect(dragged.angle).toBeCloseTo(90, 9);
    expect(dragged.width).toBeCloseTo(0.3, 9);
    const drawn = dragPart(linear, 'draw', [0.2, 0.2], [0.2, 0.8], flat);
    expect(drawn.x).toBeCloseTo(0.2, 9);
    expect(drawn.y).toBeCloseTo(0.5, 9);
    expect(drawn.angle).toBeCloseTo(90, 9);
    expect(drawn.width).toBeCloseTo(0.4, 9);
    const part = dragPart(newPart('radial') as RadialPart, 'draw', [0.5, 0.5], [0.6, 0.5], flat);
    expect([part.x, part.y, part.angle]).toEqual([0.5, 0.5, 0]);
    expect(part.rx).toBeCloseTo(0.1, 9);
    expect(part.ry).toBeCloseTo(0.1, 9);
  });
});

/** The plain formulas, every pixel: what the fast loops must equal. */
const smooth = (time: number) => (time <= 0 ? 0 : time >= 1 ? 1 : time * time * (3 - 2 * time));
describe('gradient rasters', () => {
  it('equal the plain formulas at every pixel, at any position, angle and size', () => {
    const gridWidth = 97,
      height = 61;
    let worst = 0;
    for (let step = 0; step < 80; step++) {
      const part = {
        ...(newPart('linear') as LinearPart),
        x: Math.random() * 2 - 0.5,
        y: Math.random() * 2 - 0.5,
        angle: Math.random() * 360 - 180,
        width: 0.01 + Math.random(),
      };
      if (step % 7 === 0) part.angle = [0, 90, -90, 180][step % 4];
      const values = rasterShape(part, gridWidth, height);
      const radians = (part.angle * Math.PI) / 180,
        cosine = Math.cos(radians),
        sine = Math.sin(radians),
        bandWidth = Math.max(1, part.width * gridWidth);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < gridWidth; x++)
          worst = Math.max(
            worst,
            Math.abs(
              values[y * gridWidth + x] -
                (1 -
                  smooth(
                    ((x + 0.5 - part.x * gridWidth) * cosine + (y + 0.5 - part.y * height) * sine) / bandWidth + 0.5,
                  )),
            ),
          );
      const shape = {
        ...(newPart('radial') as RadialPart),
        x: Math.random(),
        y: Math.random(),
        rx: 0.02 + Math.random() * 0.6,
        ry: 0.02 + Math.random() * 0.6,
        angle: Math.random() * 360 - 180,
        feather: Math.random() * 100,
      };
      const raster = rasterShape(shape, gridWidth, height);
      const ra = (shape.angle * Math.PI) / 180,
        rc = Math.cos(ra),
        rs = Math.sin(ra),
        Rx = Math.max(1, shape.rx * gridWidth),
        Ry = Math.max(1, shape.ry * gridWidth);
      const band = Math.min(1, Math.max(shape.feather / 100, 1.5 / Math.min(Rx, Ry))),
        inner = 1 - band;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < gridWidth; x++) {
          const dx = x + 0.5 - shape.x * gridWidth,
            dy = y + 0.5 - shape.y * height,
            lx = (dx * rc + dy * rs) / Rx,
            ly = (dy * rc - dx * rs) / Ry,
            delta = Math.hypot(lx, ly);
          worst = Math.max(
            worst,
            Math.abs(raster[y * gridWidth + x] - (delta <= inner ? 1 : 1 - smooth((delta - inner) / band))),
          );
        }
    }
    expect(worst).toBeLessThan(1e-5);
  });
});

describe('AI parts (P1.8)', () => {
  // A 4 × 2 map: the left half found (1), the right half not (0).
  const seg = { w: 4, h: 2, data: new Float32Array([1, 1, 0, 0, 1, 1, 0, 0]) };
  const sample = (segs: PhotoSample['segs']): PhotoSample => ({
    data: new Uint8ClampedArray(40 * 20 * 4),
    token: 1,
    segs,
  });

  it('are kept by the gate, with a known target', () => {
    const [mask] = mergeMasks([
      {
        name: 'Sky',
        parts: [
          { kind: 'ai', target: 'sky', invert: true },
          { kind: 'ai', target: 'moon' },
        ],
      },
    ]);
    expect(mask.parts.map((part) => (part.kind === 'ai' ? part.target : part.kind))).toEqual(['sky', 'subject']);
    expect(mask.parts[0].invert).toBe(true);
  });

  it('list the targets of masks that are on', () => {
    const on = { ...newMask('A', 'ai'), parts: [{ ...(newPart('ai') as AiPart), target: 'sky' as const }] };
    const off = { ...newMask('B', 'ai'), on: false };
    expect(aiTargets([on, off, newMask('C', 'linear')])).toEqual(['sky']);
  });

  it('draw the map over the whole photo, and nothing before it is found', () => {
    const part = newPart('ai') as AiPart;
    const values = rasterShape(part, 40, 20, sample({ subject: seg }));
    expect(values[5 * 40 + 5]).toBeCloseTo(1);
    expect(values[5 * 40 + 35]).toBeCloseTo(0);
    expect(values[5 * 40 + 19]).toBeGreaterThan(0.3);
    expect(values[5 * 40 + 19]).toBeLessThan(0.7);
    expect(rasterShape(part, 40, 20, sample({})).every((value) => value === 0)).toBe(true);
    expect(
      rasterShape({ ...part, target: 'sky' }, 40, 20, sample({ subject: seg })).every((value) => value === 0),
    ).toBe(true);
  });

  it('read the map bilinearly', () => {
    expect(segmentAt(seg, 0.125, 0.25)).toBe(1);
    expect(segmentAt(seg, 0.5, 0.5)).toBeCloseTo(0.5);
    expect(segmentAt(seg, 0.99, 0.99)).toBe(0);
  });

  it('a segmentation arriving changes the version that keys cached samples', () => {
    const src = {};
    const v0 = segmentVersion(src);
    setSegment(src, 'subject', seg);
    expect(segmentVersion(src)).toBeGreaterThan(v0);
    const copy = {};
    shareSegments(src, copy);
    expect(segmentOf(copy, 'subject')).toBe(seg);
  });
});
