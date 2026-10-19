import { describe, expect, it } from 'vitest';
import { CLIP_RANGES, SOUND_RANGES, sourceGainAt, type Keyframe } from '@/engine/keyframes';
import { chainCurve, chainGainAt, trackGain, type DuckCurves } from '@/engine/mixGain';
import { audioPlan, type SoundSource } from '@/engine/soundPlan';
import type { AudioClip, Project, TimedClip } from '@/engine/timeline';
import { MAIN_VIDEO, defaultTracks, type Track } from '@/engine/tracks';
import { defined } from '../../support/defined';
import { seededRandom } from '../../support/seededRandom';

/* 208 AC-5: what is heard = the clip's volume (or its keys, 0–2) × its fades × its track's volume × ducking. */

const NO_DUCKS: DuckCurves = new Map();
const linear = (time: number, value: number): Keyframe => ({ t: time, v: value, ease: 'linear' });

const effects: Track = { id: 'A2', kind: 'audio', name: 'Audio 2', hidden: false, muted: false, locked: false, role: 'effects', volume: 0.8 };
const main: TimedClip & { volume: number } = { id: 'v', track: MAIN_VIDEO, start: 0, kind: 'video', in: 0, out: 12, dur: 0, volume: 0.5 };
/** A sound clip 1–10 s on Audio 2 at 150 %, fading in over 1 s and out over 2 s. */
const whoosh: AudioClip = { id: 's', track: 'A2', start: 1, in: 0, out: 9, volume: 1.5, fadeIn: 1, fadeOut: 2, toEnd: false, srcDur: 9, name: 'Whoosh' };
/** Its volume keyed 0.4 → 2 over 4 s, and a key past the range (2.5, heard as 2) at 7 s. */
const keyed: AudioClip = { ...whoosh, keys: { volume: [linear(0, 0.4), linear(4, 2), linear(6, 1), linear(7, 2.5)] } };

const project = (audio: AudioClip[]): Project => ({
  tracks: [...defaultTracks(), effects],
  clips: [main],
  audio,
  layers: [],
  fadeOut: false,
});

/**
 * The sound clip's source in the plan.
 * @param clip the sound clip
 * @returns its sound source
 */
const planned = (clip: AudioClip): SoundSource => defined(audioPlan(project([clip])).find((source) => source.ref === clip.id));

/**
 * The chain by hand: keys interpolated linearly (clamped to 0–2), else the volume, × the linear fades × the track's
 * volume.
 * @param clip the sound clip
 * @param time timeline seconds
 * @returns the gain
 */
function byHand(clip: AudioClip, time: number): number {
  const local = time - clip.start;
  const end = clip.start + defined(clip.out) - clip.in;
  let volume = clip.volume;
  const keys = clip.keys?.volume;
  if (keys) {
    const after = keys.findIndex((key) => key.t > local);
    if (after === -1) volume = defined(keys[keys.length - 1]).v;
    else if (after === 0) volume = defined(keys[0]).v;
    else {
      const from = defined(keys[after - 1]);
      const to = defined(keys[after]);
      volume = from.v + ((to.v - from.v) * (local - from.t)) / (to.t - from.t);
    }
    volume = Math.min(2, Math.max(0, volume));
  }
  const fadeIn = Math.min(1, local / defined(clip.fadeIn));
  const fadeOut = Math.min(1, (end - time) / defined(clip.fadeOut));
  return volume * fadeIn * fadeOut * defined(effects.volume);
}

/**
 * Expects two gains equal within 0.01 dB (both silent counts as equal).
 * @param actual the gain computed
 * @param expected the gain by hand
 */
function withinHundredthDb(actual: number, expected: number): void {
  if (expected < 1e-6) {
    expect(actual).toBeLessThan(1e-6);
    return;
  }
  expect(Math.abs(20 * Math.log10(actual / expected))).toBeLessThan(0.01);
}

describe('volume ranges (208 D6)', () => {
  it('sound clips key their volume on 0–2; video clips stay 0–1', () => {
    expect(SOUND_RANGES.volume).toEqual([0, 2]);
    expect(CLIP_RANGES.volume).toEqual([0, 1]);
  });

  it('a sound clip’s keys are heard up to 2, a video clip’s up to 1', () => {
    const loud = { ...whoosh, keys: { volume: [linear(0, 1.8)] }, fadeIn: 0, fadeOut: 0 };
    expect(sourceGainAt(planned(loud), 5)).toBeCloseTo(1.8, 12);
    const clip = { ...main, keys: { volume: [linear(0, 1.8)] } };
    const sound = defined(audioPlan({ ...project([]), clips: [clip] })[0]);
    expect(sourceGainAt(sound, 5)).toBe(1);
  });
});

describe('trackGain', () => {
  it('a sound clip’s track volume; 1 for a video clip’s own sound and a track without a volume', () => {
    expect(trackGain(planned(whoosh), [...defaultTracks(), effects])).toBe(0.8);
    expect(trackGain(planned({ ...whoosh, track: 'A1' }), defaultTracks())).toBe(1);
    const clipSound = defined(audioPlan(project([]))[0]);
    expect(trackGain(clipSound, [...defaultTracks(), effects])).toBe(1);
  });
});

describe('chainGainAt (208 AC-5)', () => {
  it.each([
    ['volume and fades', whoosh],
    ['volume keys past 1 (and one past 2)', keyed],
  ])('%s: at 1,000 times equals the chain by hand within 0.01 dB', (_, clip) => {
    const source = planned(clip);
    const random = seededRandom(208);
    for (let index = 0; index < 1000; index++) {
      const time = source.start + random() * (source.end - source.start);
      withinHundredthDb(chainGainAt(source, project([clip]).tracks, NO_DUCKS, time), byHand(clip, time));
    }
  });

  it('a video clip’s own sound is today’s gain (no track volume, keys on 0–1)', () => {
    const source = defined(audioPlan(project([]))[0]);
    for (const time of [0, 0.01, 3, 11.99]) expect(chainGainAt(source, project([]).tracks, NO_DUCKS, time)).toBe(sourceGainAt(source, time));
  });

  it('the track’s volume goes up to 2 (+6 dB)', () => {
    const tracks = [...defaultTracks(), { ...effects, volume: 2 }];
    const source = planned(whoosh);
    expect(chainGainAt(source, tracks, NO_DUCKS, 5)).toBeCloseTo(1.5 * 2, 12);
  });
});

describe('chainCurve (208 AC-5)', () => {
  it('samples the chain with no step longer than 5 ms, both ends included', () => {
    const source = planned(keyed);
    const tracks = project([keyed]).tracks;
    const from = 1;
    const length = 9;
    const curve = chainCurve(source, tracks, NO_DUCKS, from, length);
    expect(length / (curve.length - 1)).toBeLessThanOrEqual(0.005 + 1e-12);
    for (let index = 0; index < curve.length; index += 97) {
      const time = from + (index * length) / (curve.length - 1);
      expect(defined(curve[index])).toBeCloseTo(chainGainAt(source, tracks, NO_DUCKS, time), 6);
    }
    expect(defined(curve[curve.length - 1])).toBeCloseTo(chainGainAt(source, tracks, NO_DUCKS, from + length), 6);
  });
});
