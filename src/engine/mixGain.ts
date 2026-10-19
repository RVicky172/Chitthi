/*
 * The gain chain (208 §2, AC-5): the one place a sound's gains are multiplied, so the export (which samples it into
 * `setValueCurveAtTime`) and the preview (which sets it each tick) hear the same thing. What a source plays at is its
 * volume or volume keys × its ramps, fades and transitions (`sourceGainAt`) × its track's volume × ducking; the loudness
 * gain and the limiter act on the summed mix after it.
 */
import { duckGain, type DuckCurves } from './ducking';
import { sampleCurve, sourceGainAt } from './keyframes';
import type { SoundSource } from './soundPlan';
import { trackVolume, type Track } from './tracks';

export type { DuckCurves } from './ducking';

/**
 * A source's track volume (208 Q8).
 * @param source the sound source
 * @param tracks the project's tracks
 * @returns its audio track's volume, 0–2; 1 for a video clip's own sound or a track that isn't there
 */
export function trackGain(source: SoundSource, tracks: readonly Track[]): number {
  if (source.track === undefined) return 1;
  const track = tracks.find((candidate) => candidate.id === source.track);
  return track ? trackVolume(track) : 1;
}

/**
 * How far ducking lowers a source at a time (208 §3): its track's duck curve, when it has one.
 * @param source the sound source
 * @param ducks the duck curves
 * @param time timeline seconds
 * @returns the gain, 0–1
 */
export function duckOf(source: SoundSource, ducks: DuckCurves, time: number): number {
  const curve = source.track === undefined ? undefined : ducks.get(source.track);
  return curve ? duckGain(curve, time) : 1;
}

/**
 * What a source plays at, at a timeline time: the whole chain.
 * @param source the sound source
 * @param tracks the project's tracks
 * @param ducks the duck curves
 * @param time timeline seconds
 * @returns the gain, 0–4 (a sound clip and its track at 200 % each)
 */
export function chainGainAt(source: SoundSource, tracks: readonly Track[], ducks: DuckCurves, time: number): number {
  return sourceGainAt(source, time) * trackGain(source, tracks) * duckOf(source, ducks, time);
}

/**
 * The export's gain curve for a source over a stretch of the timeline, through the whole chain (`gainCurve`'s points,
 * at most 5 ms apart, AC-5).
 * @param source the sound source
 * @param tracks the project's tracks
 * @param ducks the duck curves
 * @param from the stretch's start, timeline seconds
 * @param length its length, seconds
 * @returns the gains, at least two
 */
export function chainCurve(
  source: SoundSource,
  tracks: readonly Track[],
  ducks: DuckCurves,
  from: number,
  length: number,
): Float32Array {
  const track = trackGain(source, tracks);
  return sampleCurve((time) => sourceGainAt(source, time) * track * duckOf(source, ducks, time), from, length);
}
