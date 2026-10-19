import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { duckCurve } from '@/engine/ducking';
import { gainCurve, sourceGainAt } from '@/engine/keyframes';
import { chainCurve, chainGainAt, type DuckCurves } from '@/engine/mixGain';
import { audioPlan, type SoundSource } from '@/engine/soundPlan';
import { DUCK_DEFAULTS, MAIN_VIDEO, MUSIC, defaultTracks, type Track } from '@/engine/tracks';
import { LoudnessMeter } from '@/engine/loudness';
import { mixWindow, openAudio, planLoudness, soundWindows, type ExportAudio } from '@/engine/exportSound';
import type { ExportClip, ExportJob } from '@/engine/videoExport';
import { defined } from '../../support/defined';
import { FakeBuffer, FakeOfflineContext, type ParamCall } from '../../support/fakeAudio';

/* 208 T060 (AC-3, AC-12): the export mixes every sound clip and track with the gain chain, window by window. */

const RATE = 48_000;

/** The stretches of source each file was asked for, as the fake decoder saw them. */
let requests: { file: Blob; from: number; to: number }[] = [];
/** Files that sound: a 1 kHz sine at this amplitude in both channels (the rest decode to silence). */
const tones = new Map<Blob, number>();

/**
 * A decoded stretch of a file: its tone, or silence.
 * @param file the file
 * @param from source seconds
 * @param to source seconds
 * @returns the buffer
 */
function decoded(file: Blob, from: number, to: number): FakeBuffer {
  const buffer = new FakeBuffer(2, Math.max(1, Math.round((to - from) * RATE)), RATE);
  const amplitude = tones.get(file);
  if (amplitude)
    for (const channel of buffer.channels)
      for (let index = 0; index < channel.length; index++) channel[index] = amplitude * Math.sin(2 * Math.PI * 1000 * (from + index / RATE));
  return buffer;
}

/**
 * The fake decoder: every file has sound, handed over as one buffer per request.
 * @param file the file
 * @returns the opened sound
 */
const fakeOpen = (file: Blob) =>
  Promise.resolve({
    input: { dispose: () => undefined },
    sink: {
      async *buffers(from: number, to: number) {
        requests.push({ file, from, to });
        await Promise.resolve();
        yield { buffer: decoded(file, from, to), timestamp: from, duration: to - from };
      },
    },
  }) as unknown as Parameters<typeof openAudio>[1] extends ((file: Blob) => infer R) | undefined ? R : never;

const audioTrack = (id: string, patch: Partial<Track> = {}): Track => ({
  id, kind: 'audio', name: id, hidden: false, muted: false, locked: false, role: 'effects', ...patch,
});
const clip = (id: string, start: number, length: number, volume: number, patch: Partial<ExportClip> = {}): ExportClip =>
  ({
    id, track: MAIN_VIDEO, start, kind: 'video', in: 0, out: length, dur: 0, volume, file: new Blob([id]),
    edit: {}, motion: 'none', fade: false, ...patch,
  }) as ExportClip;
const sound = (id: string, track: string, start: number, patch: Partial<ExportAudio> = {}): ExportAudio => ({
  id, track, start, in: 0, out: 1, volume: 1, toEnd: false, srcDur: 30, file: new Blob([id]), ...patch,
});

/**
 * An export job of a project (output settings unused by the sound).
 * @param project the tracks, clips and sound clips
 * @param ducks the duck curves
 * @returns the job
 */
function job(project: Pick<ExportJob, 'tracks' | 'clips' | 'audio'>, ducks?: DuckCurves): ExportJob {
  return { ...project, layers: [], fadeOut: false, width: 1080, height: 1920, fps: 30, bitrate: 1, sink: { kind: 'memory' }, ...(ducks ? { ducks } : {}) };
}

// 12 s: the main clip; Music (70 %, ducked) with the song to the end; a Voice track; Effects tracks A3 (150 %) to A8.
const eight = (): ExportJob => {
  const [main, music] = defaultTracks();
  const tracks = [
    defined(main),
    { ...defined(music), volume: 0.7, duck: { ...DUCK_DEFAULTS } },
    audioTrack('A2', { role: 'voice' }),
    audioTrack('A3', { volume: 1.5 }),
    ...[4, 5, 6, 7, 8].map((number) => audioTrack(`A${number}`)),
  ];
  const audio = [
    sound('song', MUSIC, 0, { toEnd: true, out: undefined, volume: 0.8 }),
    sound('talk', 'A2', 2, { out: 4 }),
    ...[3, 4, 5, 6, 7, 8].map((number) => sound(`fx${number}`, `A${number}`, number, { fadeIn: 0.1, fadeOut: 0.2, volume: 1.2 })),
  ];
  return job({ tracks, clips: [clip('cam', 0, 12, 0.8)], audio });
};
/** −12 dB while the voice speaks, 2–6 s (the 50 ms steps 40–119). */
const ducks: DuckCurves = new Map([[MUSIC, duckCurve(Uint8Array.from({ length: 240 }, (_, step) => (step >= 40 && step < 120 ? 1 : 0)), 12)]]);

/**
 * The calls a window scheduled on each source's gain, by its ref.
 * @param sources the opened sources
 * @param context the window's context
 * @param windowStart its start
 * @param windowEnd its end
 * @returns the calls of the sources playing in it
 */
function callsBySource(sources: SoundSource[], context: FakeOfflineContext, windowStart: number, windowEnd: number) {
  const playing = sources.filter((source) => source.end > windowStart && source.start < windowEnd);
  expect(context.gains).toHaveLength(playing.length);
  return new Map(playing.map((source, index) => [source.ref, defined(context.gains[index]).gain.calls]));
}

beforeEach(() => {
  requests = [];
  tones.clear();
  FakeOfflineContext.made.length = 0;
  vi.stubGlobal('OfflineAudioContext', FakeOfflineContext);
});
afterEach(() => vi.unstubAllGlobals());

describe('the export’s sound with audio tracks (208 AC-12)', () => {
  it('opens every sound of the plan, in its order, with its file', async () => {
    const sources = await openAudio(eight(), fakeOpen);
    expect(sources.map((source) => source.ref)).toEqual(['cam', 'song', 'talk', 'fx3', 'fx4', 'fx5', 'fx6', 'fx7', 'fx8']);
    audioPlan(eight()).forEach((planned, index) => expect(sources[index]).toMatchObject(planned));
  });

  it('an 8-track window: a curve of the whole chain where track volume or ducking acts, today’s ramps elsewhere', async () => {
    const tp = { ...eight(), ducks };
    const sources = await openAudio(tp, fakeOpen);
    await mixWindow(sources, 0, 10, tp);
    const context = defined(FakeOfflineContext.made[0]);
    const calls = callsBySource(sources, context, 0, 10);
    const kinds = [...calls].map(([ref, list]) => [ref, list.map((call) => call.kind).join(',')]);
    expect(kinds).toEqual([
      ['cam', 'set,ramp,ramp'],
      ['song', 'curve'],
      ['talk', 'set,ramp,ramp'],
      ['fx3', 'curve'],
      ['fx4', 'set,ramp,ramp,ramp'],
      ['fx5', 'set,ramp,ramp,ramp'],
      ['fx6', 'set,ramp,ramp,ramp'],
      ['fx7', 'set,ramp,ramp,ramp'],
      ['fx8', 'set,ramp,ramp,ramp'],
    ]);
    for (const source of sources) {
      const list = calls.get(source.ref);
      if (!list) continue;
      const from = Math.max(0, source.start);
      const to = Math.min(10, source.end);
      for (const call of list) {
        if (call.kind === 'curve') {
          expect(call).toEqual({ kind: 'curve', curve: chainCurve(source, tp.tracks, ducks, from, to - from), time: from, duration: to - from });
        } else if (call.kind !== 'cancel') {
          expect(call.value).toBeCloseTo(chainGainAt(source, tp.tracks, ducks, call.time), 9);
        }
      }
    }
    // The ducked, quieter song: 70 % × 80 % × −12 dB while the voice speaks.
    const song = defined(calls.get('song')?.[0]) as Extract<ParamCall, { kind: 'curve' }>;
    expect(defined(song.curve[Math.round(4 / 0.005)])).toBeCloseTo(0.7 * 0.8 * 10 ** (-12 / 20), 5);
  });

  it('memory per window doesn’t grow with the tracks: one 10 s context, and each file decoded only for the window', async () => {
    const one = job({ tracks: defaultTracks(), clips: [clip('cam', 0, 12, 0.8)], audio: [] });
    for (const tp of [one, eight()]) {
      FakeOfflineContext.made.length = 0;
      requests = [];
      const sources = await openAudio(tp, fakeOpen);
      await mixWindow(sources, 0, 10, tp);
      await mixWindow(sources, 10, 2, tp);
      expect(FakeOfflineContext.made.map((context) => [context.channels, context.length, context.sampleRate])).toEqual([
        [2, 10 * RATE, RATE],
        [2, 2 * RATE, RATE],
      ]);
      for (const request of requests) expect(request.to - request.from).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});

describe('projects from before 208 export their sound as before (208 AC-3)', () => {
  it('ramps for plain sounds and `gainCurve` for keyed ones: no track volume, no ducking', async () => {
    const keys = { volume: [{ t: 0, v: 0.2, ease: 'linear' as const }, { t: 3, v: 1, ease: 'linear' as const }] };
    const tp = job({
      tracks: defaultTracks(),
      clips: [clip('a', 0, 4, 1), clip('b', 4, 4, 0.5, { keys })],
      audio: [sound('music', MUSIC, 0, { toEnd: true, out: undefined, in: 2, volume: 0.6 })],
    });
    const sources = await openAudio(tp, fakeOpen);
    await mixWindow(sources, 0, 8, tp);
    const calls = callsBySource(sources, defined(FakeOfflineContext.made[0]), 0, 8);
    const music = defined(sources.find((source) => source.ref === 'music'));
    expect(calls.get('music')).toEqual([
      { kind: 'set', value: 0.6, time: 0 },
      { kind: 'ramp', value: 0.6, time: 8 - music.fadeOut },
      { kind: 'ramp', value: 0, time: 8 },
    ]);
    const keyed = defined(sources.find((source) => source.ref === 'b'));
    expect(calls.get('b')).toEqual([{ kind: 'curve', curve: gainCurve(keyed, 4, 4), time: 4, duration: 4 }]);
    const plain = defined(sources.find((source) => source.ref === 'a'));
    for (const call of defined(calls.get('a'))) if (call.kind === 'set' || call.kind === 'ramp') expect(call.value).toBeCloseTo(sourceGainAt(plain, call.time), 12);
  });
});

describe('the loudness target in the export (208 AC-8, D4)', () => {
  const TOTAL = 12;
  /**
   * A 12 s job: a silent main clip, the song (a 1 kHz tone) on the Music track, and 10 ms hits on an Effects track.
   * @param song the song's amplitude
   * @param hits the hits' amplitude, or 0 for none
   * @param loudness the target, LUFS; missing = Off
   * @returns the job
   */
  function loudJob(song: number, hits = 0, loudness?: number): ExportJob {
    const songClip = sound('song', MUSIC, 0, { toEnd: true, out: undefined, volume: 1 });
    tones.set(songClip.file, song);
    const audio = [songClip];
    if (hits)
      for (const [index, at] of [2, 5, 8, 10].entries()) {
        const hit = sound(`hit${index}`, 'A3', at, { out: 0.01 });
        tones.set(hit.file, hits);
        audio.push(hit);
      }
    const tp = job({ tracks: [...defaultTracks(), audioTrack('A3')], clips: [clip('cam', 0, TOTAL, 0)], audio });
    return loudness === undefined ? tp : { ...tp, loudness };
  }

  /**
   * Renders a job's sound as the export feeds it, window by window.
   * @param tp the job
   * @returns the stereo sound, its measurement, and whether each window passed untouched
   */
  async function render(tp: ExportJob) {
    const sources = await openAudio(tp, fakeOpen);
    const measure = await planLoudness(sources, tp, TOTAL);
    const left: Float32Array[] = [];
    const right: Float32Array[] = [];
    const untouched: boolean[] = [];
    for await (const window of soundWindows(sources, tp, TOTAL, measure)) {
      const [first, second] = 'buffer' in window ? [window.buffer.getChannelData(0), window.buffer.getChannelData(1)] : window.channels;
      untouched.push('buffer' in window);
      left.push(first);
      right.push(second);
    }
    const join = (parts: Float32Array[]) => {
      const all = new Float32Array(parts.reduce((sum, part) => sum + part.length, 0));
      let at = 0;
      for (const part of parts) {
        all.set(part, at);
        at += part.length;
      }
      return all;
    };
    return { left: join(left), right: join(right), measure, untouched };
  }

  const measured = (left: Float32Array, right: Float32Array) => {
    const meter = new LoudnessMeter(RATE);
    meter.add(left, right);
    return { lufs: meter.integrated(), peak: meter.truePeak() };
  };

  it('Off: no measuring, and every window is the mix as before 208, sample for sample', async () => {
    const tp = loudJob(0.05);
    const { left, measure, untouched } = await render(tp);
    expect(measure).toBeNull();
    expect(untouched.every(Boolean)).toBe(true);
    const sources = await openAudio(tp, fakeOpen);
    const before = await mixWindow(sources, 0, 10, tp);
    expect(left.subarray(0, 10 * RATE)).toEqual(before.getChannelData(0));
  });

  it('a quiet song turned up to −14 LUFS: within 0.5 LU and never over −1 dBTP; as many samples as the video', async () => {
    const { left, right, measure } = await render(loudJob(0.05, 0, -14));
    expect(defined(measure).lufs).toBeCloseTo(-26, 0);
    expect(defined(measure).gain).toBeCloseTo(12, 0);
    expect(left).toHaveLength(TOTAL * RATE);
    const out = measured(left, right);
    expect(Math.abs(out.lufs - -14)).toBeLessThanOrEqual(0.5);
    expect(out.peak).toBeLessThanOrEqual(-1 + 1e-6);
  });

  it('heavy limiting (loud clicks over a quiet song): the corrective pass still lands within 0.5 LU', async () => {
    const { left, right, measure } = await render(loudJob(0.05, 0.9, -14));
    expect(defined(measure).reduction).toBeGreaterThan(6);
    const out = measured(left, right);
    expect(Math.abs(out.lufs - -14)).toBeLessThanOrEqual(0.5);
    expect(out.peak).toBeLessThanOrEqual(-1 + 1e-6);
  });

  it('a turned-down mix: −14 from a loud song is a negative gain, still on target', async () => {
    const { left, right, measure } = await render(loudJob(0.5, 0, -14));
    expect(defined(measure).gain).toBeLessThan(0);
    expect(Math.abs(measured(left, right).lufs - -14)).toBeLessThanOrEqual(0.5);
  });

  it('a stored measurement of the same mix is used without measuring again; a changed mix is measured', async () => {
    const tp = loudJob(0.05, 0, -14);
    const sources = await openAudio(tp, fakeOpen);
    const first = defined(await planLoudness(sources, tp, TOTAL));
    requests = [];
    expect(await planLoudness(sources, { ...tp, measured: first }, TOTAL)).toEqual(first);
    expect(requests).toHaveLength(0);
    const quieter = { ...tp, audio: tp.audio.map((clipped) => ({ ...clipped, volume: 0.5 })), measured: first };
    const again = defined(await planLoudness(await openAudio(quieter, fakeOpen), quieter, TOTAL));
    expect(requests.length).toBeGreaterThan(0);
    expect(again.key).not.toBe(first.key);
    expect(again.gain).toBeCloseTo(first.gain + 6.02, 0);
  });
});
