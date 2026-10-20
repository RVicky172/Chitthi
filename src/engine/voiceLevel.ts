/*
 * The recording level meter's maths (209 AC-4), free of DOM and Web Audio: a window's peak in dBFS and the Too loud
 * mark. The recorder reads an AnalyserNode's samples into these about 30 times a second.
 */

/** A peak at or above this marks Too loud, dBFS. */
export const LOUD_DBFS = -1;
/** How long Too loud stays shown after the last loud peak, ms. */
export const LOUD_HOLD_MS = 2_000;

/**
 * A window's peak level.
 * @param samples the samples, −1…1
 * @returns dBFS (0 for a full-scale sample), −Infinity for silence
 */
export function peakDbfs(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * When the input was last too loud, after one more reading.
 * @param loudAt the time of the last loud peak, ms, or null
 * @param peak this reading's peak, dBFS
 * @param now this reading's time, ms
 * @returns now when this peak is at or above −1 dBFS, else the time it had
 */
export const lastLoud = (loudAt: number | null, peak: number, now: number): number | null => (peak >= LOUD_DBFS ? now : loudAt);

/**
 * Whether the meter shows Too loud.
 * @param loudAt the time of the last loud peak, ms, or null
 * @param now the time, ms
 * @returns true within 2 s of it
 */
export const tooLoud = (loudAt: number | null, now: number): boolean => loudAt !== null && now - loudAt < LOUD_HOLD_MS;
