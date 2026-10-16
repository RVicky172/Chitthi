import { describe, expect, it } from 'vitest';
import {
  CURVE_SAMPLES,
  curveNeutral,
  curveTable,
  FLAT_CURVE,
  IDENTITY,
  MAX_POINTS,
  mergeCurve,
  mergePoints,
  readTable,
  spline,
  type CurvePoint,
} from '@/engine/curve';

const xs = Array.from({ length: 256 }, (_, index) => index / 255);

describe('spline', () => {
  it('is the straight line for the identity curve', () => {
    const curve = spline(IDENTITY);
    for (const x of xs) expect(curve(x)).toBeCloseTo(x, 12);
  });
  it('passes through every point', () => {
    const pts: CurvePoint[] = [
      [0, 0.05],
      [0.25, 0.2],
      [0.5, 0.55],
      [0.8, 0.9],
      [1, 1],
    ];
    const curve = spline(pts);
    for (const [x, y] of pts) expect(curve(x)).toBeCloseTo(y, 9);
  });
  it('never dips on a rising curve, even with a steep S', () => {
    const curve = spline([
      [0, 0],
      [0.2, 0.02],
      [0.3, 0.6],
      [0.7, 0.98],
      [1, 1],
    ]);
    for (let index = 1; index < xs.length; index++)
      expect(curve(xs[index])).toBeGreaterThanOrEqual(curve(xs[index - 1]) - 1e-12);
  });
  it('never overshoots its points, and stays between 0 and 1', () => {
    const pts: CurvePoint[] = [
      [0, 0],
      [0.4, 1],
      [0.6, 0],
      [1, 1],
    ];
    const curve = spline(pts);
    for (const x of xs) {
      expect(curve(x)).toBeGreaterThanOrEqual(0);
      expect(curve(x)).toBeLessThanOrEqual(1);
    }
    // Between the points at 0.4 (1) and 0.6 (0) it only falls.
    for (let x = 0.4; x < 0.6; x += 0.01) expect(curve(x + 0.01)).toBeLessThanOrEqual(curve(x) + 1e-12);
  });
  it('is flat beyond the first and last points', () => {
    const curve = spline([
      [0.2, 0.3],
      [0.8, 0.7],
    ]);
    expect(curve(0)).toBe(0.3);
    expect(curve(1)).toBe(0.7);
  });
});

describe('mergePoints and mergeCurve', () => {
  it('turn anything that is not a point list into the straight line', () => {
    for (const value of [
      undefined,
      null,
      'x',
      3,
      [],
      [[0.5, 0.5]],
      [
        [0, 'a'],
        [1, 1],
      ],
    ])
      expect(mergePoints(value)).toEqual(IDENTITY);
  });
  it('clamp, sort, merge points closer than 0.01, and keep at most 14', () => {
    expect(
      mergePoints([
        [1.5, -1],
        [0.5, 0.6],
        [-1, 0],
        [0.505, 0.7],
      ]),
    ).toEqual([
      [0, 0],
      [0.505, 0.7],
      [1, 0],
    ]);
    const many = Array.from({ length: 30 }, (_, index) => [index / 29, index / 29]);
    expect(mergePoints(many)).toHaveLength(MAX_POINTS);
  });
  it('fill in missing channels and drop unknown ones', () => {
    const curve = mergeCurve({
      rgb: [
        [0, 0.1],
        [1, 0.9],
      ],
      hue: [[0, 1]],
    });
    expect(curve.rgb).toEqual([
      [0, 0.1],
      [1, 0.9],
    ]);
    expect(curveNeutral({ ...curve, rgb: IDENTITY })).toBe(true);
    expect(Object.keys(curve).sort()).toEqual(['b', 'g', 'r', 'rgb']);
  });
});

describe('curveTable', () => {
  it('is the identity for flat curves', () => {
    const values = curveTable(FLAT_CURVE);
    for (let step = 0; step < 3; step++)
      for (const value of [0, 0.1, 0.5, 0.77, 1]) expect(readTable(values, step, value)).toBeCloseTo(value, 6);
  });
  it('applies the master curve, then each channel its own', () => {
    // Master halves everything; red then doubles it back (a straight segment up to 0.5); green and blue stay halved.
    const values = curveTable({
      ...FLAT_CURVE,
      rgb: [
        [0, 0],
        [1, 0.5],
      ],
      r: [
        [0, 0],
        [0.5, 1],
      ],
    });
    expect(values).toHaveLength(CURVE_SAMPLES * 3);
    expect(readTable(values, 0, 0.4)).toBeCloseTo(0.4, 2);
    expect(readTable(values, 1, 0.4)).toBeCloseTo(0.2, 6);
    expect(readTable(values, 2, 0.4)).toBeCloseTo(0.2, 6);
  });
  it('clamps inputs outside 0–1', () => {
    const values = curveTable(FLAT_CURVE);
    expect(readTable(values, 0, -0.5)).toBe(0);
    expect(readTable(values, 0, 2)).toBeCloseTo(1, 6);
  });
});
