/*
 * The loudness targets (208 AC-8, Q12) and the Audio panel's readout (AC-9), apart from the meter (loudness.ts) so the
 * store and the panel read them without loading it.
 */
import type { MixMeasure } from './exportSound';

/** Loudness targets (Q12): YouTube's and Instagram's reference, and a quieter one. */
export const LOUDNESS_PRESETS = { youtube: -14, quiet: -16 } as const;
/** A custom target's range, LUFS. */
export const LOUDNESS_RANGE = [-24, -9] as const;
/** Past this reduction (dB) the panel warns that the limiter works hard (AC-9). */
export const LIMITER_WARNING = 6;

/**
 * A level as the panel writes it: one decimal, with a real minus sign.
 * @param value dB or LUFS
 * @returns e.g. "−18.4"
 */
const level = (value: number): string => value.toFixed(1).replace('-', '−');

/** The Audio panel's loudness line, and its warning when the limiter works hard. */
export interface LoudnessReadout {
  text: string;
  warning: string | null;
}

/**
 * The Audio panel's loudness line (AC-9): “−18.4 LUFS, peak −2.1 dBTP; the export will be turned up 4.4 dB”.
 * @param measure the last measurement (null: none yet)
 * @param target the loudness target, or Off
 * @param measuring whether a measurement is under way (the last one is out of date)
 * @returns the line and the warning
 */
export function loudnessReadout(measure: MixMeasure | null, target: 'off' | number, measuring: boolean): LoudnessReadout {
  if (target === 'off') return { text: 'Loudness is off: the export keeps the mix as it is.', warning: null };
  if (measuring) return { text: 'Measuring loudness…', warning: null };
  if (!measure || !Number.isFinite(measure.lufs)) return { text: 'No sound to measure yet.', warning: null };
  let change = 'the export keeps this level';
  if (measure.gain >= 0.05) change = `the export will be turned up ${measure.gain.toFixed(1)} dB`;
  else if (measure.gain <= -0.05) change = `the export will be turned down ${(-measure.gain).toFixed(1)} dB`;
  const warning =
    measure.reduction > LIMITER_WARNING
      ? `The limiter will turn the loudest moments down by ${measure.reduction.toFixed(1)} dB, which can sound squashed. Lower the loudest sounds, or choose a quieter target.`
      : null;
  return { text: `${level(measure.lufs)} LUFS, peak ${level(measure.peak)} dBTP; ${change}`, warning };
}
