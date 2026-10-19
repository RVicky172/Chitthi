import { describe, expect, it } from 'vitest';
import { duckCurve, duckCurves, duckGain, duckedTracks, speaking, voiceLevel } from '@/engine/ducking';
import { sourceGainAt } from '@/engine/keyframes';
import { chainGainAt } from '@/engine/mixGain';
import { RMS_FLOOR, RMS_STEP, type SoundScan } from '@/engine/soundScan';
import { audioPlan } from '@/engine/soundPlan';
import type { AudioClip, Project, TimedClip } from '@/engine/timeline';
import { DUCK_DEFAULTS, MAIN_VIDEO, MUSIC, defaultTracks, type Track } from '@/engine/tracks';
import { defined } from '../../support/defined';

/* 208 AC-6: ducking lowers Music / Effects tracks wherever the voice is speaking. */

const LENGTH = 10;
const audio = (id: string, patch: Partial<Track> = {}): Track => ({
  id, kind: 'audio', name: id, hidden: false, muted: false, locked: false, ...patch,
});
const overlay = (id: string, patch: Partial<Track> = {}): Track => ({
  id, kind: 'overlay', name: id, hidden: false, muted: false, locked: false, ...patch,
});

/**
 * A scan whose 50 ms RMS is `loud` dBFS inside the stretches and `quiet` elsewhere.
 * @param stretches seconds, [from, to)
 * @param loud dBFS while loud
 * @param quiet dBFS elsewhere
 * @returns the scan, LENGTH seconds
 */
function scanOf(stretches: [number, number][], loud = -20, quiet = -80): SoundScan {
  const rms = new Float32Array(LENGTH / RMS_STEP).map((_, step) => {
    const time = step * RMS_STEP + 1e-9;
    return stretches.some(([from, to]) => time >= from && time < to) ? loud : quiet;
  });
  return { rate: 100, peaks: new Uint8Array(LENGTH * 100), rms, dur: LENGTH };
}

const sound = (id: string, track: string, patch: Partial<AudioClip> = {}): AudioClip => ({
  id, track, start: 0, in: 0, out: LENGTH, volume: 1, toEnd: false, srcDur: LENGTH, ...patch,
});
type SC = TimedClip & { volume: number };
const camera = (id: string, track: string, volume: number): SC => ({
  id, track, start: 0, kind: 'video', in: 0, out: LENGTH, dur: 0, volume,
});

/**
 * A 10 s project: a silent main clip, a Voice track, the Music track ducked at the defaults.
 * @param voice the voice track's clips
 * @param extra more tracks and clips
 * @param extra.tracks tracks to add after the voice track
 * @param extra.clips picture clips besides the main one
 * @returns the project
 */
function project(voice: AudioClip[], extra: { tracks?: Track[]; clips?: SC[] } = {}): Project {
  const [main, music] = defaultTracks();
  return {
    tracks: [defined(main), { ...defined(music), duck: { ...DUCK_DEFAULTS } }, audio('A2', { role: 'voice' }), ...(extra.tracks ?? [])],
    clips: [camera('v', MAIN_VIDEO, 0), ...(extra.clips ?? [])],
    audio: [sound('song', MUSIC, { volume: 0.8 }), ...voice],
    layers: [],
    fadeOut: false,
  };
}

/**
 * The voice level of a project whose sources' scans are given by ref.
 * @param tp the project
 * @param scans the scans by source ref
 * @returns dBFS per 50 ms step
 */
const levelOf = (tp: Project, scans: Record<string, SoundScan>) =>
  voiceLevel(tp, audioPlan(tp), (ref) => scans[ref]);

const db = (power: number) => 10 * Math.log10(power);

describe('voiceLevel (208 AC-6, Q10)', () => {
  it('is the power sum of the voice sources’ RMS × their gain, in 50 ms steps over the video', () => {
    const tp = project([sound('talk', 'A2'), sound('talk2', 'A2', { start: 0, track: 'A3' })], { tracks: [audio('A3', { role: 'voice', volume: 0.5 })] });
    const level = levelOf(tp, { talk: scanOf([[0, 10]]), talk2: scanOf([[0, 10]]) });
    expect(level).toHaveLength(LENGTH / RMS_STEP);
    // −20 dBFS at gain 1 plus −20 dBFS at gain 0.5 (its track's volume): 10⁻² × (1 + 0.25).
    expect(defined(level[50])).toBeCloseTo(db(0.01 * 1.25), 3);
  });

  it('counts video and overlay clips’ own sound, not Music or Effects tracks', () => {
    const tp = project([], { tracks: [overlay('O1'), audio('A3', { role: 'effects' })], clips: [camera('cam', 'O1', 1)] });
    tp.audio.push(sound('bang', 'A3'));
    const level = levelOf(tp, { cam: scanOf([[0, 10]], -30), song: scanOf([[0, 10]], -6), bang: scanOf([[0, 10]], -6) });
    expect(defined(level[50])).toBeCloseTo(-30, 3);
  });

  it('leaves out a track whose Counts as voice is off', () => {
    const tp = project([sound('talk', 'A2')], { tracks: [overlay('O1', { voice: false })], clips: [camera('cam', 'O1', 1)] });
    const level = levelOf(tp, { talk: scanOf([[0, 10]], -30), cam: scanOf([[0, 10]], -10) });
    expect(defined(level[50])).toBeCloseTo(-30, 3);
    tp.tracks = tp.tracks.map((track) => (track.id === 'A2' ? { ...track, voice: false } : track));
    expect(defined(levelOf(tp, { talk: scanOf([[0, 10]], -30) })[50])).toBe(RMS_FLOOR);
  });

  it('follows the clip’s place and in point, and is the floor where nothing speaks', () => {
    const tp = project([sound('talk', 'A2', { start: 4, in: 1, out: 3 })]);
    const level = levelOf(tp, { talk: scanOf([[1, 2]]) });
    // Source 1–2 s plays at 4–5 s on the timeline; source 2–3 s (quiet) at 5–6 s.
    expect(defined(level[Math.round(4.5 / RMS_STEP)])).toBeCloseTo(-20, 3);
    expect(defined(level[Math.round(5.5 / RMS_STEP)])).toBeCloseTo(-80, 3);
    expect(defined(level[Math.round(2 / RMS_STEP)])).toBe(RMS_FLOOR);
  });
});

describe('speaking (208 AC-6)', () => {
  const steps = (...runs: [number, number][]) => {
    const level = new Float32Array(100).fill(-80);
    for (const [from, to] of runs) level.fill(-20, from, to);
    return level;
  };

  it('is on above the threshold', () => {
    const on = speaking(steps([10, 20]), -40);
    expect([...on.slice(8, 22)]).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
    expect([...speaking(steps([10, 20]), -15)].every((step) => step === 0)).toBe(true);
  });

  it('bridges pauses shorter than 0.5 s, not 0.5 s or longer, nor the silence at the ends', () => {
    // A pause of 9 steps (0.45 s) is bridged, of 10 (0.5 s) isn't.
    const bridged = speaking(steps([10, 20], [29, 40]), -40);
    expect([...bridged.slice(20, 29)].every((step) => step === 1)).toBe(true);
    const kept = speaking(steps([10, 20], [30, 40]), -40);
    expect([...kept.slice(20, 30)].every((step) => step === 0)).toBe(true);
    expect(bridged[0]).toBe(0);
    expect(bridged[99]).toBe(0);
  });
});

describe('the duck curve (208 AC-6)', () => {
  /**
   * The expected curve: −amount while speaking, down over 0.3 s before, up over 0.8 s after.
   * @param time seconds
   * @param amount dB
   * @returns dB
   */
  function expected(time: number, amount: number): number {
    let dB = 0;
    for (const [from, to] of [[2, 5], [8, 8.6]] as const) {
      let here = 0;
      if (time >= from && time <= to) here = -amount;
      else if (time >= from - 0.3 && time < from) here = (-amount * (time - (from - 0.3))) / 0.3;
      else if (time > to && time <= to + 0.8) here = -amount * (1 - (time - to) / 0.8);
      dB = Math.min(dB, here);
    }
    return dB;
  }

  // Speech at 2.0–5.0 s with a 0.3 s pause (bridged) at 3.0 s, and 8.0–8.6 s; quiet room noise elsewhere.
  const tp = project([sound('talk', 'A2')]);
  const level = levelOf(tp, { talk: scanOf([[2, 3], [3.3, 5], [8, 8.6]]) });

  it.each([12, 3, 30])('at %i dB, every 10 ms equals the expected curve within 0.1 dB', (amount) => {
    const curve = duckCurve(speaking(level, -40), amount);
    for (let index = 0; index <= LENGTH * 100; index++) {
      const time = index / 100;
      expect(Math.abs(20 * Math.log10(duckGain(curve, time)) - expected(time, amount))).toBeLessThan(0.1);
    }
  });

  it('no voice: the gain is unchanged', () => {
    const silent = levelOf(project([]), {});
    const curve = duckCurve(speaking(silent, -40), 12);
    for (let time = 0; time <= LENGTH; time += 0.37) expect(duckGain(curve, time)).toBe(1);
  });

  it('only Music and Effects tracks with ducking are lowered, through the chain', () => {
    const tracks = [...tp.tracks, audio('A3', { role: 'effects' }), audio('A4', { role: 'voice' })];
    expect(duckedTracks(tracks).map((track) => track.id)).toEqual([MUSIC]);
    const curve = duckCurve(speaking(level, -40), 12);
    const plan = audioPlan(tp);
    const song = defined(plan.find((source) => source.ref === 'song'));
    const talk = defined(plan.find((source) => source.ref === 'talk'));
    const ducks = new Map([[MUSIC, curve]]);
    expect(chainGainAt(song, tp.tracks, ducks, 4)).toBeCloseTo(sourceGainAt(song, 4) * 10 ** (-12 / 20), 9);
    expect(chainGainAt(song, tp.tracks, ducks, 0.5)).toBeCloseTo(sourceGainAt(song, 0.5), 9);
    expect(chainGainAt(talk, tp.tracks, ducks, 4)).toBe(sourceGainAt(talk, 4));
  });
});

describe('duck curves follow the edit (208 AC-7)', () => {
  const talkScan = scanOf([[1, 3]]);
  const scans: Record<string, SoundScan> = { talk: talkScan };
  const curvesOf = (tp: Project, ready: Record<string, SoundScan> = scans) => duckCurves(tp, audioPlan(tp), (ref) => ready[ref]);
  const musicAt = (tp: Project, time: number, ready?: Record<string, SoundScan>) =>
    duckGain(defined(curvesOf(tp, ready).curves.get(MUSIC)), time);
  const ducked = 10 ** (-12 / 20);

  it('each ducked track gets its curve at its own amount and threshold', () => {
    const tp = project([sound('talk', 'A2')], { tracks: [audio('A3', { role: 'effects', duck: { amount: 6, threshold: -60 } })] });
    const { curves } = curvesOf(tp);
    expect([...curves.keys()]).toEqual([MUSIC, 'A3']);
    expect(duckGain(defined(curves.get('A3')), 2)).toBeCloseTo(10 ** (-6 / 20), 6);
    expect(musicAt(tp, 2)).toBeCloseTo(ducked, 6);
    // −80 dBFS room noise is under both thresholds.
    expect(musicAt(tp, 6)).toBe(1);
  });

  it('moving, trimming, muting or turning down the voice clip changes the curve', () => {
    const tp = project([sound('talk', 'A2')]);
    expect(musicAt(tp, 2)).toBeCloseTo(ducked, 6);
    const moved = project([sound('talk', 'A2', { start: 4, out: 6 })]);
    expect(musicAt(moved, 2)).toBe(1);
    expect(musicAt(moved, 6)).toBeCloseTo(ducked, 6);
    const trimmed = project([sound('talk', 'A2', { in: 2 })]);
    expect(musicAt(trimmed, 0.5)).toBeCloseTo(ducked, 6);
    expect(musicAt(trimmed, 2)).toBe(1);
    const muted = project([sound('talk', 'A2')]);
    muted.tracks = muted.tracks.map((track) => (track.id === 'A2' ? { ...track, muted: true } : track));
    expect(musicAt(muted, 2)).toBe(1);
    // −20 dBFS at 1 % is −60 dBFS: under the −40 threshold.
    expect(musicAt(project([sound('talk', 'A2', { volume: 0.01 })]), 2)).toBe(1);
  });

  it('the same edit gives the same curves without computing them again', () => {
    const tp = project([sound('talk', 'A2')]);
    expect(curvesOf(tp)).toBe(curvesOf(project([sound('talk', 'A2')])));
    expect(curvesOf(tp)).not.toBe(curvesOf(project([sound('talk', 'A2', { start: 0.5 })])));
  });

  it('a voice whose scan isn’t ready is reported as measuring (and counts as silent until then)', () => {
    const tp = project([sound('talk', 'A2'), sound('later', 'A2', { start: 5, in: 0, out: 2 })]);
    const waiting = curvesOf(tp);
    expect(waiting.measuring).toEqual(['later']);
    const ready = curvesOf(tp, { ...scans, later: talkScan });
    expect(ready.measuring).toEqual([]);
    expect(ready).not.toBe(waiting);
  });

  it('without a ducked track there is nothing to compute', () => {
    const tp = project([sound('talk', 'A2')]);
    tp.tracks = tp.tracks.map((track) => ({ ...track, duck: undefined }));
    expect(curvesOf(tp)).toEqual({ curves: new Map(), measuring: [] });
  });

  it('a 10-minute project with 8 sound tracks is computed from its scans in under 1 s', () => {
    const minutes = 10 * 60;
    const long = (stretches: [number, number][]): SoundScan => {
      const rms = new Float32Array(minutes / RMS_STEP).map((_, step) =>
        stretches.some(([from, to]) => step * RMS_STEP >= from && step * RMS_STEP < to) ? -20 : -80,
      );
      return { rate: 100, peaks: new Uint8Array(0), rms, dur: minutes };
    };
    const tracks = [audio('A2', { role: 'voice' }), ...[3, 4, 5, 6, 7].map((number) => audio(`A${number}`, { role: 'voice' })), audio('A8', { role: 'effects', duck: { ...DUCK_DEFAULTS } })];
    const clips: AudioClip[] = [];
    const ready: Record<string, SoundScan> = {};
    const scan = long(Array.from({ length: 100 }, (_, index): [number, number] => [index * 6, index * 6 + 3]));
    for (const track of tracks.slice(0, 6))
      for (let index = 0; index < 20; index++) {
        const id = `${track.id}-${index}`;
        clips.push(sound(id, track.id, { start: index * 30, in: index * 30, out: index * 30 + 30, srcDur: minutes }));
        ready[id] = scan;
      }
    const tp: Project = {
      ...project([]),
      clips: [{ ...camera('v', MAIN_VIDEO, 1), out: minutes }],
    };
    tp.tracks = [...tp.tracks.filter((track) => track.id !== 'A2'), ...tracks];
    tp.audio = [...tp.audio, ...clips];
    ready.v = scan;
    const begin = performance.now();
    const { curves } = duckCurves(tp, audioPlan(tp), (ref) => ready[ref]);
    const took = performance.now() - begin;
    expect([...curves.keys()]).toEqual([MUSIC, 'A8']);
    expect(duckGain(defined(curves.get('A8')), 1)).toBeCloseTo(ducked, 6);
    expect(took).toBeLessThan(1000);
  });
});
