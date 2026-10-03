/*
 * The tone curve (docs/planning/EDITOR-IMPLEMENTATION.md, P1.2): a master curve for all three channels and one each for
 * red, green and blue, drawn on display values (sRGB, 0 to 1 both ways). Points are joined by a monotone cubic spline
 * (Fritsch–Carlson), which never overshoots between points, so a curve drawn rising never dips.
 *
 * For drawing, the curves become one table per channel of CURVE_SAMPLES values (master, then the channel's own curve),
 * read with linear interpolation. The Canvas 2D path and the GPU program read the same table, so they agree exactly.
 */

/** [input, output], both 0 to 1. */
export type CurvePoint = readonly [number, number];

export interface ToneCurve {
  rgb: readonly CurvePoint[];
  r: readonly CurvePoint[];
  g: readonly CurvePoint[];
  b: readonly CurvePoint[];
}

export type CurveChannel = keyof ToneCurve;
export const CURVE_CHANNELS: readonly CurveChannel[] = ['rgb', 'r', 'g', 'b'];

export const IDENTITY: readonly CurvePoint[] = Object.freeze([
  Object.freeze([0, 0]) as CurvePoint,
  Object.freeze([1, 1]) as CurvePoint,
]);
export const FLAT_CURVE: Readonly<ToneCurve> = Object.freeze({ rgb: IDENTITY, r: IDENTITY, g: IDENTITY, b: IDENTITY });

/** Most points one curve may have, and the least distance between two points' inputs. */
export const MAX_POINTS = 14;
export const MIN_GAP = 0.01;
/** Table size: every 2 levels of 255, plus both ends. */
export const CURVE_SAMPLES = 129;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export const isIdentity = (pts: readonly CurvePoint[]): boolean =>
  pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1;
export const curveNeutral = (c: ToneCurve): boolean => CURVE_CHANNELS.every((k) => isIdentity(c[k]));

/**
 * A valid point list from anything: numbers clamped to 0–1, sorted by input, points closer than MIN_GAP merged (the
 * later one wins), at most MAX_POINTS. Fewer than two points gives the straight line.
 */
export function mergePoints(raw: unknown): CurvePoint[] {
  if (!Array.isArray(raw)) return [...IDENTITY];
  const pts = raw
    .filter(
      (p): p is [number, number] =>
        Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && Number.isFinite(v)),
    )
    .map(([x, y]) => [clamp01(x), clamp01(y)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && p[0] - last[0] < MIN_GAP) out[out.length - 1] = p;
    else out.push(p);
  }
  if (out.length < 2) return [...IDENTITY];
  return out.slice(0, MAX_POINTS);
}

export function mergeCurve(raw: unknown): ToneCurve {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { rgb: mergePoints(o.rgb), r: mergePoints(o.r), g: mergePoints(o.g), b: mergePoints(o.b) };
}

/** The spline through the points as a function of input (0–1). Flat beyond the first and last points. */
export function spline(pts: readonly CurvePoint[]): (x: number) => number {
  const n = pts.length;
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);
  if (n < 2) return (x) => x;
  const d = xs.slice(0, -1).map((x, k) => (ys[k + 1] - ys[k]) / (xs[k + 1] - x));
  const m = xs.map((_, k) =>
    k === 0 ? d[0] : k === n - 1 ? d[n - 2] : d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2,
  );
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) {
      m[k] = m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k],
      b = m[k + 1] / d[k],
      s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k],
      t = (x - xs[k]) / h,
      t2 = t * t,
      t3 = t2 * t;
    return clamp01(
      (2 * t3 - 3 * t2 + 1) * ys[k] +
        (t3 - 2 * t2 + t) * h * m[k] +
        (-2 * t3 + 3 * t2) * ys[k + 1] +
        (t3 - t2) * h * m[k + 1],
    );
  };
}

/**
 * The drawing table: CURVE_SAMPLES values for red, then green, then blue, each the master curve followed by the
 * channel's own curve, at inputs 0, 1/(n-1), … 1.
 */
export function curveTable(c: ToneCurve): Float32Array {
  const master = spline(c.rgb),
    out = new Float32Array(CURVE_SAMPLES * 3);
  (['r', 'g', 'b'] as const).forEach((ch, k) => {
    const f = spline(c[ch]);
    for (let i = 0; i < CURVE_SAMPLES; i++) out[k * CURVE_SAMPLES + i] = f(master(i / (CURVE_SAMPLES - 1)));
  });
  return out;
}

/** Reads channel k (0 red, 1 green, 2 blue) of a table at v (0–1), with linear interpolation, as the GPU does. */
export function readTable(t: Float32Array, k: number, v: number): number {
  const x = clamp01(v) * (CURVE_SAMPLES - 1),
    i = Math.min(CURVE_SAMPLES - 2, x | 0),
    base = k * CURVE_SAMPLES;
  return t[base + i] + (t[base + i + 1] - t[base + i]) * (x - i);
}
