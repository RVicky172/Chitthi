import type { Track } from '../../engine/tracks';
import { recordTarget } from '../../engine/voiceTake';
import type { RecoverEntry } from '../../state/voiceRecorder';

/*
 * What the Record voice controls show (209 §8): the meter's fill and readout, the Recording offset, the recovery
 * offer's label and where the take goes. Pure, so tested without a browser.
 */

/** The meter's floor, dBFS. */
const FLOOR = -60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * How full the meter's bar is (AC-4).
 * @param dbfs the peak, dBFS
 * @returns 0–1 over −60…0 dBFS
 */
export const meterFill = (dbfs: number): number => (dbfs <= FLOOR ? 0 : Math.min(1, 1 - dbfs / FLOOR));

/**
 * A number with a real minus sign.
 * @param value the number, already rounded
 * @returns e.g. "−12"
 */
const signed = (value: number): string => (value < 0 ? `−${-value}` : String(value));

/**
 * The meter's readout (its text value for screen readers).
 * @param dbfs the peak, dBFS
 * @returns e.g. "−12 dBFS", or "Silent" below the meter's floor
 */
export const meterText = (dbfs: number): string => (dbfs <= FLOOR ? 'Silent' : `${signed(Math.round(dbfs) || 0)} dBFS`);

/**
 * The Recording offset as shown (AC-3).
 * @param seconds the offset, s
 * @returns e.g. "+40 ms"
 */
export function offsetText(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  return ms > 0 ? `+${ms} ms` : `${signed(ms)} ms`;
}

/**
 * A length as shown in the offer.
 * @param seconds the length
 * @returns "41 s" under a minute, else "2:05"
 */
function lengthText(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The recovery offer's label (AC-9): "Voice 3, 41 s, recorded 19 Oct 14:02".
 * @param entry the take
 * @returns the label, saying when it stopped early or can't be read
 */
export function recoveryLabel(entry: RecoverEntry): string {
  const when = new Date(entry.startedAt);
  const time = `${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
  const recorded = `recorded ${when.getDate()} ${MONTHS[when.getMonth()] ?? ''} ${time}`;
  if (entry.length === null) return `${entry.name}, ${recorded}, can’t be read`;
  return `${entry.name}, ${lengthText(entry.length)}, ${recorded}${entry.done ? '' : ', stopped early'}`;
}

/**
 * Where the next take goes (AC-1).
 * @param tracks the project's tracks
 * @param chosen the track whose record button was used, or null
 * @param selected the selected sound's track, or null
 * @returns e.g. "Records onto Narration.", or why not
 */
export function targetText(tracks: Track[], chosen: string | null, selected: string | null): string {
  const target = recordTarget(tracks, chosen, selected);
  if ('error' in target) return target.error;
  const existing = tracks.find((track) => track.id === target.track);
  return existing ? `Records onto ${existing.name}.` : 'Records onto a new Voice track.';
}
