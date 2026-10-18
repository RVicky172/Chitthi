import { SPEED_LIMITS, rampPointRange, type RampPoint } from '../../engine/speed';

/*
 * The Speed group's and the ramp editor's pure helpers (207 §8, AC-11, AC-12): how a speed is written, the speed
 * slider's log scale, the ramp editor's keys and speed axis, and what it announces.
 */

/** log₁₀ of the slowest and fastest speeds: the slider and the ramp editor's axis are even in these. */
const LOG_MIN = Math.log10(SPEED_LIMITS.min);
const LOG_SPAN = Math.log10(SPEED_LIMITS.max) - LOG_MIN;

/** The ramp editor's key steps: along the clip (a share), and speed (×); Shift takes the larger. */
const KEY_STEPS = { along: 0.01, alongShift: 0.1, speed: 0.1, speedShift: 1 } as const;

/**
 * A speed kept within 0.1–10× and rounded to 0.01×.
 * @param speed the speed
 * @returns the speed
 */
const tidySpeed = (speed: number) => Math.round(Math.min(SPEED_LIMITS.max, Math.max(SPEED_LIMITS.min, speed)) * 100) / 100;

/**
 * A speed as the inspector and the timeline write it: at most two decimals, then ×.
 * @param speed the speed
 * @returns e.g. "2×", "0.5×", "1.25×"
 */
export const speedText = (speed: number): string => `${Number(speed.toFixed(2))}×`;

/**
 * The speed slider's position for a speed: 0.1× at 0, 1× at 0.5, 10× at 1 (a log scale, AC-11).
 * @param speed the speed
 * @returns 0–1
 */
export const speedToSlider = (speed: number): number =>
  Math.min(1, Math.max(0, (Math.log10(Math.max(SPEED_LIMITS.min, speed)) - LOG_MIN) / LOG_SPAN));

/**
 * The speed at a slider position, to 0.01×.
 * @param position 0–1
 * @returns the speed
 */
export const sliderToSpeed = (position: number): number => tidySpeed(10 ** (LOG_MIN + Math.min(1, Math.max(0, position)) * LOG_SPAN));

/**
 * Where a speed sits on the ramp editor's axis: 10× at the top (0), 0.1× at the bottom (`height`), a log scale.
 * @param speed the speed
 * @param height the axis's height, pixels
 * @returns pixels from the top
 */
export const speedToY = (speed: number, height: number): number => (1 - speedToSlider(speed)) * height;

/**
 * The speed at a height on the ramp editor's axis (a point dragged there).
 * @param y pixels from the top
 * @param height the axis's height, pixels
 * @returns the speed, to 0.01×
 */
export const yToSpeed = (y: number, height: number): number => sliderToSpeed(1 - y / height);

/**
 * Where a ramp editor key moves a point (AC-12): ← / → along the clip by 0.01 (Shift 0.1), ↑ / ↓ its speed by 0.1×
 * (Shift 1×); kept between its neighbours (the ends in place) and within 0.1–10×.
 * @param points the ramp's points
 * @param index the focused point
 * @param key the key's `KeyboardEvent.key`
 * @param shift whether Shift is held
 * @returns the point's new place and speed, or null for another key or a missing point
 */
export function rampKeyStep(points: readonly RampPoint[], index: number, key: string, shift: boolean): RampPoint | null {
  const point = points[index];
  if (!point) return null;
  const along = shift ? KEY_STEPS.alongShift : KEY_STEPS.along;
  const faster = shift ? KEY_STEPS.speedShift : KEY_STEPS.speed;
  const moves: Record<string, [number, number]> = {
    ArrowLeft: [-along, 0],
    ArrowRight: [along, 0],
    ArrowUp: [0, faster],
    ArrowDown: [0, -faster],
  };
  const move = moves[key];
  if (!move) return null;
  const [low, high] = rampPointRange(points, index);
  return { at: Math.min(high, Math.max(low, point.at + move[0])), v: tidySpeed(point.v + move[1]) };
}

/**
 * What the ramp editor announces about a point.
 * @param points the ramp's points
 * @param index the point
 * @returns e.g. "Point 3 of 5: 50 % along, 0.3×"
 */
export function describePoint(points: readonly RampPoint[], index: number): string {
  const point = points[index];
  if (!point) return '';
  let which = '';
  if (index === 0) which = ' (start)';
  else if (index === points.length - 1) which = ' (end)';
  return `Point ${index + 1} of ${points.length}${which}: ${Math.round(point.at * 100)} % along, ${speedText(point.v)}`;
}
