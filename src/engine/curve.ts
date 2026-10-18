import { isObjectLike } from './guards';

/*
 * The tone curve (specs/vision/editor-implementation.md, P1.2): a master curve for all three channels and one each for
 * red, green and blue, drawn on display values (sRGB, 0 to 1 both ways). Points are joined by a monotone cubic spline
 * (Fritsch–Carlson), which never overshoots between points, so a curve drawn rising never dips.
 *
 * For drawing, the curves become one table per channel of CURVE_SAMPLES values (master, then the channel's own curve),
 * read with linear interpolation. The Canvas 2D path and the GPU program read the same table, so they agree exactly.
 */

/** [input, output], both 0 to 1. */
export type CurvePoint = readonly [number, number];

/** The four curves. */
export interface ToneCurve {
  rgb: readonly CurvePoint[];
  r: readonly CurvePoint[];
  g: readonly CurvePoint[];
  b: readonly CurvePoint[];
}

/** One of the four curves. */
export type CurveChannel = keyof ToneCurve;

/** The curves, master first. */
export const CURVE_CHANNELS: readonly CurveChannel[] = ['rgb', 'r', 'g', 'b'];

/** The straight line: output equals input. */
export const IDENTITY: readonly CurvePoint[] = Object.freeze([Object.freeze([0, 0] as const), Object.freeze([1, 1] as const)]);

/** The curves that change nothing. */
export const FLAT_CURVE: Readonly<ToneCurve> = Object.freeze({ rgb: IDENTITY, r: IDENTITY, g: IDENTITY, b: IDENTITY });

/** Most points one curve may have. */
export const MAX_POINTS = 14;

/** The least distance between two points' inputs. */
export const MIN_GAP = 0.01;

/** Table size: every 2 levels of 255, plus both ends. */
export const CURVE_SAMPLES = 129;

/**
 * A value within 0–1.
 * @param value any number
 * @returns the value, clamped
 */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Whether a curve is the straight line.
 * @param points the curve's points
 * @returns true for exactly (0, 0) and (1, 1)
 */
export const isIdentity = (points: readonly CurvePoint[]): boolean => {
  const first = points.at(0);
  const second = points.at(1);
  return points.length === 2 && first?.[0] === 0 && first[1] === 0 && second?.[0] === 1 && second[1] === 1;
};

/**
 * Whether the curves change nothing.
 * @param curve the curves
 * @returns true when all four are the straight line
 */
export const curveNeutral = (curve: ToneCurve): boolean => CURVE_CHANNELS.every((channel) => isIdentity(curve[channel]));

/**
 * Whether a value is a point: two finite numbers.
 * @param value anything
 * @returns true for [number, number]
 */
const isPoint = (value: unknown): value is [number, number] =>
  Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === 'number' && Number.isFinite(part));

/**
 * A valid point list from anything: numbers clamped to 0–1, sorted by input, points closer than MIN_GAP merged (the
 * later one wins), at most MAX_POINTS.
 * @param raw anything
 * @returns the points; fewer than two gives the straight line
 */
export function mergePoints(raw: unknown): CurvePoint[] {
  if (!Array.isArray(raw)) return [...IDENTITY];
  const sorted = raw
    .filter(isPoint)
    .map(([x, y]): [number, number] => [clamp01(x), clamp01(y)])
    .sort((first, second) => first[0] - second[0]);
  const points: [number, number][] = [];
  for (const point of sorted) {
    const last = points.at(-1);
    if (last && point[0] - last[0] < MIN_GAP) points[points.length - 1] = point;
    else points.push(point);
  }
  if (points.length < 2) return [...IDENTITY];
  return points.slice(0, MAX_POINTS);
}

/**
 * The gate for curves from outside the running app.
 * @param raw anything
 * @returns valid curves
 */
export function mergeCurve(raw: unknown): ToneCurve {
  const fields = isObjectLike(raw) ? raw : {};
  return { rgb: mergePoints(fields.rgb), r: mergePoints(fields.r), g: mergePoints(fields.g), b: mergePoints(fields.b) };
}

/**
 * The spline's tangents (Fritsch–Carlson): the average of the neighbouring slopes, 0 at a peak or trough, then scaled
 * down where they would overshoot.
 * @param slopes the slopes between neighbouring points
 * @returns one tangent per point
 */
function tangents(slopes: readonly number[]): number[] {
  const count = slopes.length + 1;
  const slope = (index: number) => slopes[index] ?? 0;
  const tangent: number[] = Array.from({ length: count }, (_, index) => {
    if (index === 0) return slope(0);
    if (index === count - 1) return slope(count - 2);
    return slope(index - 1) * slope(index) <= 0 ? 0 : (slope(index - 1) + slope(index)) / 2;
  });
  for (let index = 0; index < count - 1; index++) {
    const along = slope(index);
    if (along === 0) {
      tangent[index] = 0;
      tangent[index + 1] = 0;
      continue;
    }
    const fromStart = (tangent[index] ?? 0) / along;
    const fromEnd = (tangent[index + 1] ?? 0) / along;
    const size = fromStart * fromStart + fromEnd * fromEnd;
    if (size > 9) {
      const scale = 3 / Math.sqrt(size);
      tangent[index] = scale * fromStart * along;
      tangent[index + 1] = scale * fromEnd * along;
    }
  }
  return tangent;
}

/**
 * The spline through the points.
 * @param points the curve's points, sorted by input
 * @returns the curve as a function of input (0–1), flat beyond the first and last points, clamped to 0–1
 */
export function spline(points: readonly CurvePoint[]): (x: number) => number {
  const curve = monotoneSpline(points);
  return (x) => clamp01(curve(x));
}

/**
 * The monotone cubic (Fritsch–Carlson) through any points, unclamped: between two points it stays between their
 * outputs. The tone curve clamps it to 0–1; a speed ramp (207) uses it on speeds.
 * @param points the points, sorted by input
 * @returns the curve as a function of input, flat beyond the first and last points
 */
export function monotoneSpline(points: readonly CurvePoint[]): (x: number) => number {
  const count = points.length;
  const inputs = points.map((point) => point[0]);
  const outputs = points.map((point) => point[1]);
  if (count < 2) return (x) => x;
  const input = (index: number) => inputs[index] ?? 0;
  const output = (index: number) => outputs[index] ?? 0;
  const slopes = inputs.slice(0, -1).map((x, index) => (output(index + 1) - output(index)) / (input(index + 1) - x));
  const tangent = tangents(slopes);
  return (x) => {
    if (x <= input(0)) return output(0);
    if (x >= input(count - 1)) return output(count - 1);
    let segment = 0;
    while (segment < count - 2 && x > input(segment + 1)) segment++;
    const width = input(segment + 1) - input(segment);
    const along = (x - input(segment)) / width;
    const along2 = along * along;
    const along3 = along2 * along;
    return (
      (2 * along3 - 3 * along2 + 1) * output(segment) +
      (along3 - 2 * along2 + along) * width * (tangent[segment] ?? 0) +
      (-2 * along3 + 3 * along2) * output(segment + 1) +
      (along3 - along2) * width * (tangent[segment + 1] ?? 0)
    );
  };
}

/**
 * The drawing table: CURVE_SAMPLES values for red, then green, then blue, each the master curve followed by the
 * channel's own curve, at inputs 0, 1/(n-1), … 1.
 * @param curve the curves
 * @returns the table
 */
export function curveTable(curve: ToneCurve): Float32Array {
  const master = spline(curve.rgb);
  const table = new Float32Array(CURVE_SAMPLES * 3);
  (['r', 'g', 'b'] as const).forEach((channel, channelIndex) => {
    const own = spline(curve[channel]);
    for (let index = 0; index < CURVE_SAMPLES; index++) table[channelIndex * CURVE_SAMPLES + index] = own(master(index / (CURVE_SAMPLES - 1)));
  });
  return table;
}

/**
 * Reads a channel of a table, with linear interpolation, as the GPU does.
 * @param table the drawing table (curveTable)
 * @param channel 0 red, 1 green, 2 blue
 * @param value the input, 0–1
 * @returns the output
 */
export function readTable(table: Float32Array, channel: number, value: number): number {
  const position = clamp01(value) * (CURVE_SAMPLES - 1);
  const index = Math.min(CURVE_SAMPLES - 2, position | 0);
  const base = channel * CURVE_SAMPLES;
  const below = table[base + index] ?? 0;
  return below + ((table[base + index + 1] ?? 0) - below) * (position - index);
}
