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
} from './curve';

const xs = Array.from({ length: 256 }, (_, i) => i / 255);

describe('spline', () => {
  it('is the straight line for the identity curve', () => {
    const f = spline(IDENTITY);
    for (const x of xs) expect(f(x)).toBeCloseTo(x, 12);
  });
  it('passes through every point', () => {
    const pts: CurvePoint[] = [
      [0, 0.05],
      [0.25, 0.2],
      [0.5, 0.55],
      [0.8, 0.9],
      [1, 1],
    ];
    const f = spline(pts);
    for (const [x, y] of pts) expect(f(x)).toBeCloseTo(y, 9);
  });
  it('never dips on a rising curve, even with a steep S', () => {
    const f = spline([
      [0, 0],
      [0.2, 0.02],
      [0.3, 0.6],
      [0.7, 0.98],
      [1, 1],
    ]);
    for (let i = 1; i < xs.length; i++) expect(f(xs[i])).toBeGreaterThanOrEqual(f(xs[i - 1]) - 1e-12);
  });
  it('never overshoots its points, and stays between 0 and 1', () => {
    const pts: CurvePoint[] = [
      [0, 0],
      [0.4, 1],
      [0.6, 0],
      [1, 1],
    ];
    const f = spline(pts);
    for (const x of xs) {
      expect(f(x)).toBeGreaterThanOrEqual(0);
      expect(f(x)).toBeLessThanOrEqual(1);
    }
    // Between the points at 0.4 (1) and 0.6 (0) it only falls.
    for (let x = 0.4; x < 0.6; x += 0.01) expect(f(x + 0.01)).toBeLessThanOrEqual(f(x) + 1e-12);
  });
  it('is flat beyond the first and last points', () => {
    const f = spline([
      [0.2, 0.3],
      [0.8, 0.7],
    ]);
    expect(f(0)).toBe(0.3);
    expect(f(1)).toBe(0.7);
  });
});

describe('mergePoints and mergeCurve', () => {
  it('turn anything that is not a point list into the straight line', () => {
    for (const v of [
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
      expect(mergePoints(v)).toEqual(IDENTITY);
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
    const many = Array.from({ length: 30 }, (_, i) => [i / 29, i / 29]);
    expect(mergePoints(many)).toHaveLength(MAX_POINTS);
  });
  it('fill in missing channels and drop unknown ones', () => {
    const c = mergeCurve({
      rgb: [
        [0, 0.1],
        [1, 0.9],
      ],
      hue: [[0, 1]],
    });
    expect(c.rgb).toEqual([
      [0, 0.1],
      [1, 0.9],
    ]);
    expect(curveNeutral({ ...c, rgb: IDENTITY })).toBe(true);
    expect(Object.keys(c).sort()).toEqual(['b', 'g', 'r', 'rgb']);
  });
});

describe('curveTable', () => {
  it('is the identity for flat curves', () => {
    const t = curveTable(FLAT_CURVE);
    for (let k = 0; k < 3; k++) for (const v of [0, 0.1, 0.5, 0.77, 1]) expect(readTable(t, k, v)).toBeCloseTo(v, 6);
  });
  it('applies the master curve, then each channel its own', () => {
    // Master halves everything; red then doubles it back (a straight segment up to 0.5); green and blue stay halved.
    const t = curveTable({
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
    expect(t).toHaveLength(CURVE_SAMPLES * 3);
    expect(readTable(t, 0, 0.4)).toBeCloseTo(0.4, 2);
    expect(readTable(t, 1, 0.4)).toBeCloseTo(0.2, 6);
    expect(readTable(t, 2, 0.4)).toBeCloseTo(0.2, 6);
  });
  it('clamps inputs outside 0–1', () => {
    const t = curveTable(FLAT_CURVE);
    expect(readTable(t, 0, -0.5)).toBe(0);
    expect(readTable(t, 0, 2)).toBeCloseTo(1, 6);
  });
});
