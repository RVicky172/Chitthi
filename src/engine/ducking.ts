/*
 * Ducking (208 §3, AC-6): Music and Effects tracks lowered wherever the voice speaks. The voice is computed from the
 * files' scans, never decoded again: for each 50 ms step, the power sum of every voice source's scanned RMS × its gain
 * (without ducking). Speaking = above the track's threshold, pauses under 0.5 s bridged; the duck curve ramps down over
 * 0.3 s before speech (we know the future) and up over 0.8 s after it, in dB every 10 ms. The export and the preview
 * read it through the same `duckGain`.
 */
import { sourceGainAt } from './keyframes';
import { RMS_FLOOR, RMS_STEP, type SoundScan } from './soundScan';
import type { SoundSource } from './soundPlan';
import { projectLength, type Project } from './timeline';
import { countsAsVoice, soundRole, trackVolume, type Track } from './tracks';

/** Each ducked audio track's duck curve, by track id: dB every 10 ms. */
export type DuckCurves = ReadonlyMap<string, Float32Array>;

/** Seconds between a duck curve's points. */
export const DUCK_STEP = 0.01;
/** The fixed timing (Q11): down before speech, up after it, and the pauses bridged, seconds. */
export const DUCK_TIMING = { down: 0.3, up: 0.8, bridge: 0.5 } as const;

/**
 * The tracks ducking lowers: sound tracks with ducking on that aren't Voice tracks (Q9).
 * @param tracks the project's tracks
 * @returns those tracks, in order
 */
export const duckedTracks = (tracks: readonly Track[]): Track[] =>
  tracks.filter((track) => track.kind === 'audio' && track.duck && soundRole(track) !== 'voice');

/**
 * A source's track when its sound counts as voice (Q10): a Voice track's clip, or a video or overlay clip's own sound,
 * unless its track's Counts as voice is off.
 * @param source the sound source
 * @param trackOf each clip's track, by clip id
 * @param tracks the tracks by id
 * @returns the track, or null when it isn't voice
 */
function voiceTrack(source: SoundSource, trackOf: ReadonlyMap<string, string>, tracks: ReadonlyMap<string, Track>): Track | null {
  const track = tracks.get(source.track ?? trackOf.get(source.ref) ?? '');
  if (!track || !countsAsVoice(track)) return null;
  if (source.role && source.role !== 'voice') return null;
  return track;
}

/**
 * The voice's level through the video, in 50 ms steps (AC-6).
 * @param project the project
 * @param plan its sound plan (`audioPlan`)
 * @param scanFor a source's scan by its ref; undefined while it is measured (it counts as silent)
 * @returns dBFS per step, `RMS_FLOOR` where nothing speaks
 */
export function voiceLevel(
  project: Project,
  plan: readonly SoundSource[],
  scanFor: (ref: string) => SoundScan | undefined,
): Float32Array {
  const steps = Math.ceil(projectLength(project) / RMS_STEP - 1e-9);
  const power = new Float64Array(steps);
  const trackOf = new Map(project.clips.map((clip) => [clip.id, clip.track]));
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  for (const source of plan) {
    const track = voiceTrack(source, trackOf, tracks);
    const scan = track ? scanFor(source.ref) : undefined;
    if (!track || !scan) continue;
    const volume = trackVolume(track);
    const rate = source.rate ?? 1;
    const last = Math.min(steps, Math.ceil(source.end / RMS_STEP));
    for (let step = Math.max(0, Math.floor(source.start / RMS_STEP)); step < last; step++) {
      // Each step at its middle, so a step on a clip's edge is counted once.
      const time = (step + 0.5) * RMS_STEP;
      if (time < source.start || time >= source.end) continue;
      const level = scan.rms[Math.floor((source.from + (time - source.start) * rate) / RMS_STEP)];
      if (level === undefined) continue;
      const gain = sourceGainAt(source, time) * volume;
      power[step] = (power[step] ?? 0) + 10 ** (level / 10) * gain * gain;
    }
  }
  return Float32Array.from(power, (sum) => (sum > 0 ? Math.max(RMS_FLOOR, 10 * Math.log10(sum)) : RMS_FLOOR));
}

/**
 * Where the voice is speaking (AC-6): above the threshold, with pauses shorter than `bridge` filled.
 * @param level dBFS per 50 ms step (`voiceLevel`)
 * @param threshold dBFS
 * @param bridge seconds: shorter pauses count as speaking
 * @returns 1 where speaking, per step
 */
export function speaking(level: Float32Array, threshold: number, bridge: number = DUCK_TIMING.bridge): Uint8Array {
  const on = Uint8Array.from(level, (value) => (value > threshold ? 1 : 0));
  const longest = Math.round(bridge / RMS_STEP) - 1;
  let lastOn = -1;
  for (let step = 0; step < on.length; step++) {
    if (!on[step]) continue;
    if (lastOn >= 0 && step - lastOn - 1 <= longest) on.fill(1, lastOn + 1, step);
    lastOn = step;
  }
  return on;
}

/**
 * The duck curve (AC-6, Q11): 0 dB, down to −amount over 0.3 s before each stretch of speech, held through it, and
 * back up over 0.8 s after it; overlapping ramps keep the lower.
 * @param speech where the voice speaks, per 50 ms step (`speaking`)
 * @param amount dB
 * @returns dB every 10 ms, from 0 to the end of the last step
 */
export function duckCurve(speech: Uint8Array, amount: number): Float32Array {
  const perStep = Math.round(RMS_STEP / DUCK_STEP);
  const curve = new Float32Array(speech.length * perStep + 1);
  const duck = (from: number, to: number) => {
    const first = Math.max(0, Math.ceil((from - DUCK_TIMING.down) / DUCK_STEP - 1e-9));
    const last = Math.min(curve.length - 1, Math.floor((to + DUCK_TIMING.up) / DUCK_STEP + 1e-9));
    for (let index = first; index <= last; index++) {
      const time = index * DUCK_STEP;
      let here = -amount;
      if (time < from) here = (-amount * (time - (from - DUCK_TIMING.down))) / DUCK_TIMING.down;
      else if (time > to) here = -amount * (1 - (time - to) / DUCK_TIMING.up);
      curve[index] = Math.min(curve[index] ?? 0, here);
    }
  };
  let start = -1;
  for (let step = 0; step <= speech.length; step++) {
    const on = step < speech.length && speech[step] === 1;
    if (on && start < 0) start = step;
    if (!on && start >= 0) {
      duck(start * RMS_STEP, step * RMS_STEP);
      start = -1;
    }
  }
  return curve;
}

/**
 * A duck curve's gain at a time, in dB linearly between its points.
 * @param curve dB every 10 ms (`duckCurve`)
 * @param time timeline seconds
 * @returns the gain, 0–1 (1 past the curve's ends)
 */
export function duckGain(curve: Float32Array, time: number): number {
  const position = time / DUCK_STEP;
  if (position < 0 || position > curve.length - 1) return 1;
  const index = Math.floor(position);
  const from = curve[index] ?? 0;
  const to = curve[index + 1] ?? from;
  return 10 ** ((from + (to - from) * (position - index)) / 20);
}

/** The duck curves of a project, and the voice sources whose scans aren't ready (counted as silent until then). */
export interface DuckResult {
  curves: DuckCurves;
  /** Their refs, in the plan's order: the panel says "measuring". */
  measuring: string[];
}

/** The last result and what it was computed from: an edit that changes nothing ducking reads costs nothing. */
let last: { key: string; result: DuckResult } | null = null;

/**
 * The duck curves of every ducked track (AC-6, AC-7): one voice level, each track's own threshold and amount. Read
 * from the scans only, so a new curve after an edit takes milliseconds; the same inputs return the same result.
 * @param project the project
 * @param plan its sound plan (`audioPlan`)
 * @param scanFor a source's scan by its ref
 * @returns the curves by track id and the voices still measuring
 */
export function duckCurves(
  project: Project,
  plan: readonly SoundSource[],
  scanFor: (ref: string) => SoundScan | undefined,
): DuckResult {
  const ducked = duckedTracks(project.tracks);
  if (ducked.length === 0) return { curves: new Map(), measuring: [] };
  const trackOf = new Map(project.clips.map((clip) => [clip.id, clip.track]));
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  const voices = plan.flatMap((source) => {
    const track = voiceTrack(source, trackOf, tracks);
    return track ? [{ source, volume: trackVolume(track), ready: scanFor(source.ref) !== undefined }] : [];
  });
  const key = JSON.stringify([projectLength(project), voices, ducked.map((track) => [track.id, track.duck])]);
  if (last?.key === key) return last.result;
  const level = voiceLevel(project, plan, scanFor);
  const curves = new Map<string, Float32Array>();
  for (const track of ducked) {
    const duck = track.duck;
    if (duck) curves.set(track.id, duckCurve(speaking(level, duck.threshold), duck.amount));
  }
  const result = { curves, measuring: voices.filter((voice) => !voice.ready).map((voice) => voice.source.ref) };
  last = { key, result };
  return result;
}
