import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mostVideosAt } from '@/engine/stack';
import { EDGE_EPS, type Project, type TimedClip } from '@/engine/timeline';
import { MAIN_VIDEO, MUSIC, defaultTracks } from '@/engine/tracks';
import { edgeGain } from '@/engine/keyframes';
import { limitsFor } from '@/engine/videoFormats';
import { MAX_NUDGE, previewSound, recordingMix, soundFix, soundPlan, withoutRecorded, type SoundClip } from '@/components/studio/previewSound';
import { FakeAudio, FakeLiveContext, FakeWorkletNode } from '../../../support/fakeAudio';
import type { AudioClip } from '@/engine/timeline';
import { defined } from '../../../support/defined';

type C = TimedClip & { name: string; volume: number };
const videoClip = (name: string, track: string, start: number, len: number): C => ({
  name,
  id: name,
  track,
  start,
  kind: 'video',
  in: 1,
  out: 1 + len,
  dur: 0,
  volume: 1,
});
const photo = (name: string, start: number, len: number): C => ({
  name,
  id: name,
  track: MAIN_VIDEO,
  start,
  kind: 'photo',
  in: 0,
  out: 0,
  dur: len,
  volume: 0,
});
// V1: a 0–4, photo 4–7, c 7–10. V2 (overlay): ov 2–3. V3 (overlay): w 2.25–5.
const vA = videoClip('a', MAIN_VIDEO, 0, 4),
  vC = videoClip('c', MAIN_VIDEO, 7, 3),
  ov = videoClip('ov', 'V2', 2, 1),
  vW = videoClip('w', 'V3', 2.25, 2.75);
const overlay = (id: string, hidden: boolean, muted: boolean) => ({
  id,
  kind: 'overlay' as const,
  name: id,
  hidden,
  muted,
  locked: false,
});
const project = (
  options: { hidden?: boolean; ovHidden?: boolean; wMuted?: boolean; wHidden?: boolean } = {},
): Project<C> => ({
  tracks: [
    ...defaultTracks()
      .filter((defaultTrack) => defaultTrack.id === MAIN_VIDEO)
      .map((track) => ({ ...track, hidden: !!options.hidden })),
    overlay('V2', !!options.ovHidden, false),
    overlay('V3', !!options.wHidden, !!options.wMuted),
    ...defaultTracks().filter((defaultTrack) => defaultTrack.id === MUSIC),
  ],
  clips: [vA, photo('p', 4, 3), vC, ov, vW],
  audio: [],
  layers: [],
  fadeOut: false,
});
const names = (plan: ReturnType<typeof soundPlan<C>>) => ({
  current: plan.current.map((x) => [x.clip.name, x.local]),
  next: plan.next.map((x) => x.name),
  held: plan.held.map((x) => x.name),
});

describe('preview sound: whose sound plays (204 §4, D1; 203 §7, AC-8, Q7)', () => {
  it('plays the clip under the playhead and loads the next ones starting within 2 s', () => {
    expect(names(soundPlan(project(), 0.5))).toEqual({ current: [['a', 0.5]], next: ['ov', 'w'], held: [] });
    expect(names(soundPlan(project(), 5.5))).toEqual({ current: [], next: ['c'], held: [] });
    expect(names(soundPlan(project(), 6.5))).toEqual({ current: [], next: ['c'], held: [] });
    expect(names(soundPlan(project(), 4.5))).toEqual({ current: [['w', 2.25]], next: [], held: [] });
  });

  it('plays every clip sounding at t, bottom first: the main clip and each overlay clip', () => {
    expect(names(soundPlan(project(), 2.5))).toEqual({
      current: [
        ['a', 2.5],
        ['ov', 0.5],
        ['w', 0.25],
      ],
      next: [],
      held: [],
    });
  });

  it('a muted overlay track adds no sound: its clip on screen is kept loaded and silent, nothing is loaded ahead', () => {
    expect(names(soundPlan(project({ wMuted: true }), 2.5))).toEqual({
      current: [
        ['a', 2.5],
        ['ov', 0.5],
      ],
      next: [],
      held: ['w'],
    });
    expect(names(soundPlan(project({ wMuted: true }), 0.5))).toEqual({ current: [['a', 0.5]], next: ['ov'], held: [] });
  });

  it('a hidden track still sounds: the main one (201 D2) and an overlay (Q7, Hide is pictures)', () => {
    expect(names(soundPlan(project({ hidden: true }), 0.5))).toEqual({
      current: [['a', 0.5]],
      next: ['ov', 'w'],
      held: [],
    });
    const all = names(soundPlan(project(), 2.5));
    expect(names(soundPlan(project({ hidden: true, ovHidden: true, wHidden: true }), 2.5))).toEqual(all);
    expect(names(soundPlan(project({ hidden: true }), 5.5))).toEqual({ current: [], next: ['c'], held: [] });
    expect(names(soundPlan(project({ wHidden: true, wMuted: true }), 2.5)).held).toEqual(['w']);
  });

  it('finds the clips at t by the stack’s edges: a clip starting a hair after t plays, it isn’t "next"', () => {
    const time = 2 - EDGE_EPS / 2;
    const plan = soundPlan(project(), time);
    expect(plan.current.map((x) => x.clip.name)).toEqual(['a', 'ov']);
    expect(plan.next.map((x) => x.name)).toEqual(['w']);
    // At an overlay clip's end it has stopped.
    expect(names(soundPlan(project(), 3 - EDGE_EPS / 2)).current.map((x) => x[0])).toEqual(['a', 'w']);
  });
});

describe('preview sound elements for several clips at once (203 §7, D1’s bound)', () => {
  const made: FakeAudio[] = [];
  beforeEach(() => {
    made.length = 0;
    vi.stubGlobal('document', {
      createElement: () => {
        const el = new FakeAudio();
        made.push(el);
        return el;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const asSound = (x: C): SoundClip => ({
    id: x.id,
    url: `blob:${x.id}`,
    in: x.in,
    out: x.out,
    volume: x.volume,
    ...(x.keys ? { keys: x.keys } : {}),
  });
  const tick = (sound: ReturnType<typeof previewSound>, fixture: Project<C>, time: number, play: boolean) => {
    const plan = soundPlan(fixture, time);
    sound.update(
      {
        current: plan.current.map((x) => ({ clip: asSound(x.clip), local: x.local, edges: x.edges })),
        next: plan.next.map(asSound),
        held: plan.held.map(asSound),
      },
      play,
      30,
    );
    return plan;
  };
  const el = (sound: ReturnType<typeof previewSound>, id: string) =>
    sound.element(id) as unknown as FakeAudio | undefined;

  it('plays one element per current clip, each at its own time', () => {
    const sound = previewSound();
    tick(sound, project(), 2.5, true);
    expect(sound.size).toBe(3);
    for (const [id, local] of [
      ['a', 2.5],
      ['ov', 0.5],
      ['w', 0.25],
    ] as const) {
      const audio = defined(el(sound, id));
      expect(audio.paused, id).toBe(false);
      expect(audio.currentTime, id).toBeCloseTo(1 + local, 9);
    }
    // Paused: every current element waits at its time.
    tick(sound, project(), 2.6, false);
    for (const [id, local] of [
      ['a', 2.6],
      ['ov', 0.6],
      ['w', 0.35],
    ] as const) {
      expect(defined(el(sound, id)).paused, id).toBe(true);
      expect(defined(el(sound, id)).currentTime, id).toBeCloseTo(1 + local, 9);
    }
    sound.dispose();
  });

  it('keeps a muted overlay’s clip silent, pre-seeks the next ones and releases the rest', () => {
    const sound = previewSound();
    tick(sound, project({ wMuted: true }), 2.5, true);
    expect(sound.size).toBe(3);
    expect(defined(el(sound, 'a')).paused).toBe(false);
    expect(defined(el(sound, 'ov')).paused).toBe(false);
    expect(defined(el(sound, 'w')).paused).toBe(true);
    expect(defined(el(sound, 'w')).muted).toBe(true);
    // At 5.5 only c (next) is wanted: a, ov and w are released.
    const old = ['a', 'ov', 'w'].map((id) => defined(el(sound, id)));
    tick(sound, project({ wMuted: true }), 5.5, true);
    expect(sound.size).toBe(1);
    for (const audio of old) expect(audio.src).toBe('');
    expect(defined(el(sound, 'c')).paused).toBe(true);
    expect(defined(el(sound, 'c')).currentTime).toBe(vC.in);
    sound.dispose();
  });

  it('never keeps more elements than current + next + held, and the clips on screen within the videos limit', () => {
    const limit = limitsFor('reel', false, true).videosAtOnce;
    for (const options of [{}, { wMuted: true }, { hidden: true, ovHidden: true }]) {
      const fixture = project(options);
      expect(mostVideosAt(fixture.clips, fixture.tracks)).toBeLessThanOrEqual(limit);
      const sound = previewSound();
      let most = 0;
      for (let index = -10; index <= 110; index++) {
        const time = index / 10;
        const plan = tick(sound, fixture, time, index % 3 !== 0);
        const want = new Set([
          ...plan.current.map((x) => x.clip.id),
          ...plan.next.map((x) => x.id),
          ...plan.held.map((x) => x.id),
        ]);
        expect(sound.size, `t = ${time}`).toBe(want.size);
        expect(plan.current.length + plan.held.length, `t = ${time}`).toBeLessThanOrEqual(
          mostVideosAt(fixture.clips, fixture.tracks),
        );
        most = Math.max(most, sound.size);
      }
      // Current and held stay within the limit; at most one next clip per picture track on top.
      expect(most).toBeLessThanOrEqual(limit + fixture.tracks.filter((tr) => tr.kind !== 'audio').length);
      expect(made.filter((audio) => audio.src !== '')).toHaveLength(sound.size);
      sound.dispose();
      expect(made.every((audio) => audio.src === '')).toBe(true);
      made.length = 0;
    }
  });
  it('205: a clip with volume keys sounds at its keyed volume on every tick, and is muted at 0 % (AC-10)', () => {
    const sound = previewSound();
    const fadeIn = {
      ...project(),
      clips: project().clips.map((x) =>
        x.id === 'a'
          ? {
              ...x,
              volume: 0,
              keys: {
                volume: [
                  { t: 0, v: 0, ease: 'linear' as const },
                  { t: 2, v: 1, ease: 'linear' as const },
                ],
              },
            }
          : x,
      ),
    };
    tick(sound, fadeIn, 0, true);
    expect([defined(el(sound, 'a')).volume, defined(el(sound, 'a')).muted]).toEqual([0, true]);
    for (const [time, want] of [
      [0.5, 0.25],
      [1, 0.5],
      [3, 1],
    ] as const) {
      tick(sound, fadeIn, time, true);
      expect(defined(el(sound, 'a')).volume, `at ${time}`).toBeCloseTo(want, 9);
      expect(defined(el(sound, 'a')).muted, `at ${time}`).toBe(false);
    }
    // A clip without keys keeps its stored volume.
    tick(sound, fadeIn, 2.5, true);
    expect(defined(el(sound, 'ov')).volume).toBe(defined(fadeIn.clips.find((x) => x.id === 'ov')).volume);
    sound.dispose();
  });

  it('206: both clips of a transition play into their handles, at their equal-power volumes (AC-6)', () => {
    const sound = previewSound();
    // x 0–4 (source 1–5), a 1 s dissolve into y 4–8 (source 1–5): the transition plays 3.5–4.5.
    const x = {
        ...videoClip('x', MAIN_VIDEO, 0, 4),
        volume: 0.8,
        transition: { kind: 'dissolve' as const, dur: 1, to: 'y' },
      },
      y = videoClip('y', MAIN_VIDEO, 4, 4);
    const fixture: Project<C> = { tracks: defaultTracks(), clips: [x, y], audio: [], layers: [], fadeOut: false };
    // Playing inside the transition: both elements play.
    tick(sound, fixture, 3.6, true);
    expect([defined(el(sound, 'x')).paused, defined(el(sound, 'y')).paused]).toEqual([false, false]);
    // Paused (each element seeks exactly): each waits at its source past its own ends (x past 5 s, y before 1 s).
    for (const time of [3.6, 4, 4.4]) {
      tick(sound, fixture, time, false);
      const outgoing = defined(el(sound, 'x')),
        incoming = defined(el(sound, 'y'));
      expect(outgoing.currentTime, `at ${time}`).toBeCloseTo(1 + time, 9);
      expect(incoming.currentTime, `at ${time}`).toBeCloseTo(1 + time - 4, 9);
      expect(outgoing.volume, `at ${time}`).toBeCloseTo(
        0.8 * edgeGain({ start: 0, end: 4, trail: 0.5, edgeOut: 'power' }, time),
        9,
      );
      expect(incoming.volume, `at ${time}`).toBeCloseTo(
        edgeGain({ start: 4, end: 8, lead: 0.5, edgeIn: 'power' }, time),
        9,
      );
    }
    sound.dispose();
  });
});

describe('preview sound drift correction (204 §4)', () => {
  it('leaves the rate at 1 within a frame', () => {
    expect(soundFix(0, 30, 1)).toEqual({ seek: false, rate: 1 });
    expect(soundFix(0.03, 30, 1)).toEqual({ seek: false, rate: 1 });
    expect(soundFix(-0.016, 60, 1)).toEqual({ seek: false, rate: 1 });
  });

  it('nudges toward the picture by at most 3 % over a frame', () => {
    const late = soundFix(-0.05, 30, 1),
      early = soundFix(0.05, 30, 1),
      far = soundFix(0.2, 30, 1);
    expect(late.seek || late.rate).toBeGreaterThan(1);
    expect(early.seek || early.rate).toBeLessThan(1);
    expect(far).toEqual({ seek: false, rate: 1 - MAX_NUDGE });
    expect(soundFix(-0.2, 30, 1)).toEqual({ seek: false, rate: 1 + MAX_NUDGE });
  });

  it('keeps nudging until within 10 ms, then goes back to 1', () => {
    const fix = soundFix(-0.02, 30, 1.03);
    expect(fix.seek).toBe(false);
    expect(!fix.seek && fix.rate).toBeGreaterThan(1);
    expect(soundFix(-0.008, 30, 1.03)).toEqual({ seek: false, rate: 1 });
  });

  it('moves the rate in 0.5 % steps, so it is not rewritten on every tick', () => {
    const rates = new Set<number>();
    for (let delta = -0.24; delta <= 0.24; delta += 0.0007) {
      const fix = soundFix(delta, 30, 1.01);
      if (fix.seek) throw new Error('seeked');
      expect(Math.abs(fix.rate * 200 - Math.round(fix.rate * 200))).toBeLessThan(1e-9);
      rates.add(fix.rate);
    }
    expect(rates.size).toBeLessThanOrEqual(13);
  });

  it('seeks over 0.25 s', () => {
    expect(soundFix(0.26, 30, 1)).toEqual({ seek: true });
    expect(soundFix(-0.4, 30, 1.03)).toEqual({ seek: true });
  });

  it('brings a 3-frame drift within a frame in about 2 s, and settles', () => {
    let drift = -0.1,
      rate = 1,
      time = 0,
      inFrame = Infinity;
    const dt = 1 / 60;
    for (; time < 6; time += dt) {
      const fix = soundFix(drift, 30, rate);
      if (fix.seek) throw new Error('seeked');
      rate = fix.rate;
      drift += (rate - 1) * dt;
      if (Math.abs(drift) <= 1 / 30) inFrame = Math.min(inFrame, time);
      if (rate === 1 && time > 0.1) break;
    }
    expect(inFrame).toBeLessThan(2.5);
    expect(rate).toBe(1);
    expect(Math.abs(drift)).toBeLessThanOrEqual(0.01);
    expect(time).toBeLessThan(4);
  });
});

describe('207: the preview’s sound at speed (AC-6, D5)', () => {
  // Main: fast 0–2 (2×), back 2–4 (reversed), slow 4–6 (0.5×), quick 6–7 (3×). V2 (muted): m 0–1 at 3×.
  const atSpeed = (name: string, track: string, start: number, len: number, fields: Partial<C>): C => ({
    ...videoClip(name, track, start, len),
    ...fields,
  });
  const fixture = (): Project<C> => ({
    tracks: [
      ...defaultTracks().filter((defaultTrack) => defaultTrack.id === MAIN_VIDEO),
      overlay('V2', false, true),
      ...defaultTracks().filter((defaultTrack) => defaultTrack.id === MUSIC),
    ],
    clips: [
      atSpeed('fast', MAIN_VIDEO, 0, 2, { in: 1, out: 5, speed: 2 }),
      atSpeed('back', MAIN_VIDEO, 2, 2, { reverse: true }),
      atSpeed('slow', MAIN_VIDEO, 4, 2, { in: 1, out: 2, speed: 0.5 }),
      atSpeed('quick', MAIN_VIDEO, 6, 1, { in: 1, out: 4, speed: 3 }),
      atSpeed('m', 'V2', 0, 1, { in: 1, out: 4, speed: 3 }),
    ],
    audio: [],
    layers: [],
    fadeOut: false,
  });

  it('a clip at 0.5–2× sounds with its speed as its rate', () => {
    const plan = soundPlan(fixture(), 0.5);
    expect(plan.current.map((sounding) => [sounding.clip.name, sounding.rate])).toEqual([['fast', 2]]);
    expect(soundPlan(fixture(), 4.5).current.map((sounding) => sounding.rate)).toEqual([0.5]);
  });

  it('a clip the export leaves silent is left out of current, next and held', () => {
    expect(names(soundPlan(fixture(), 2.5))).toEqual({ current: [], next: ['slow'], held: [] });
    expect(names(soundPlan(fixture(), 6.5))).toEqual({ current: [], next: [], held: [] });
    expect(names(soundPlan(fixture(), 0.5)).held).toEqual([]);
    expect(names(soundPlan(fixture(), 1.5)).next).toEqual([]);
  });

  it('a clip at 1× has no rate (as before 207)', () => {
    expect('rate' in defined(soundPlan(project(), 0.5).current[0])).toBe(false);
  });
});

describe('207: a clip at a speed plays its element at that rate, pitch kept (AC-6, D5)', () => {
  const made: FakeAudio[] = [];
  beforeEach(() => {
    made.length = 0;
    vi.stubGlobal('document', {
      createElement: () => {
        const element = new FakeAudio();
        made.push(element);
        return element;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('at 2× the element plays at 2 with preservesPitch, at the source time sourceAt gives', () => {
    const fast: C = { ...videoClip('fast', MAIN_VIDEO, 0, 2), in: 1, out: 5, speed: 2 };
    const fixture: Project<C> = { tracks: defaultTracks(), clips: [fast], audio: [], layers: [], fadeOut: false };
    const sound = previewSound();
    const plan = soundPlan(fixture, 0.5);
    sound.update(
      {
        current: plan.current.map((sounding) => ({
          clip: { id: sounding.clip.id, url: 'blob:fast', in: 1, out: 5, volume: 1, speed: 2 },
          local: sounding.local,
          ...(sounding.rate ? { rate: sounding.rate } : {}),
        })),
        next: [],
        held: [],
      },
      true,
      30,
    );
    const element = defined(made[0]);
    expect([element.paused, element.playbackRate, element.preservesPitch]).toEqual([false, 2, true]);
    expect(element.currentTime).toBeCloseTo(2, 9);
    sound.dispose();
  });
});

/* ---------- 208 T090: sound clips in the preview, through one Web Audio graph (AC-7, AC-9, D3, Q2) ---------- */

describe('208: the preview plays sound clips (Q2: Solo is the preview’s)', () => {
  type S = AudioClip & { url: string };
  const sound = (id: string, track: string, start: number, length: number, patch: Partial<S> = {}): S => ({
    id, track, start, in: 1, out: 1 + length, volume: 1, toEnd: false, srcDur: 30, url: `blob:${id}`, ...patch,
  });
  const audioTrack = (id: string, patch: Record<string, unknown> = {}) => ({ id, kind: 'audio' as const, name: id, hidden: false, muted: false, locked: false, ...patch });
  // A 10 s video (a 0–4, photo 4–7, c 7–10); the song on Music from 0 to the end, a whoosh on A2 at 3–3.5, a voice on
  // A3 at 5–9.
  const withSounds = (a2: Record<string, unknown> = {}, a3: Record<string, unknown> = {}): Project<C> & { audio: S[] } => ({
    ...project(),
    tracks: [...project().tracks, audioTrack('A2', a2), audioTrack('A3', a3)],
    audio: [sound('song', MUSIC, 0, 0, { toEnd: true, out: undefined }), sound('whoosh', 'A2', 3, 0.5), sound('talk', 'A3', 5, 4)],
  });
  const sounding = (plan: ReturnType<typeof soundPlan<C, S>>) => ({
    sounds: plan.sounds.map((x) => [x.clip.id, x.local, x.length]),
    nextSounds: plan.nextSounds.map((x) => x.id),
  });

  it('the sound clips under the playhead, with their time and length heard, and those starting within 2 s', () => {
    expect(sounding(soundPlan(withSounds(), 3.25))).toEqual({ sounds: [['song', 3.25, 10], ['whoosh', 0.25, 0.5]], nextSounds: ['talk'] });
    expect(sounding(soundPlan(withSounds(), 0.5))).toEqual({ sounds: [['song', 0.5, 10]], nextSounds: [] });
    expect(sounding(soundPlan(withSounds(), 9.5))).toEqual({ sounds: [['song', 9.5, 10]], nextSounds: [] });
  });

  it('a muted track is silent; with a track soloed only soloed sound tracks play, clip sound stays', () => {
    expect(sounding(soundPlan(withSounds({ muted: true }), 3.25)).sounds.map((x) => x[0])).toEqual(['song']);
    const solo = soundPlan(withSounds({}, { solo: true }), 6);
    expect(sounding(solo).sounds.map((x) => x[0])).toEqual(['talk']);
    expect(solo.current.map((x) => x.clip.id)).toEqual(soundPlan(withSounds(), 6).current.map((x) => x.clip.id));
    expect(sounding(soundPlan(withSounds({ solo: true }), 1.5)).nextSounds).toEqual(['whoosh']);
  });

  it('sound past the video’s end isn’t heard (Q6)', () => {
    const late = { ...withSounds(), audio: [sound('tail', 'A2', 9, 5)] };
    expect(sounding(soundPlan(late, 9.5)).sounds).toEqual([['tail', 0.5, 1]]);
    expect(sounding(soundPlan(late, 10.5)).sounds).toEqual([]);
  });
});

describe('208: the preview’s Web Audio graph (D3, AC-7, AC-9)', () => {
  const made: FakeAudio[] = [];
  let context: FakeLiveContext;
  beforeEach(() => {
    made.length = 0;
    context = new FakeLiveContext();
    vi.stubGlobal('document', {
      createElement: () => {
        const el = new FakeAudio();
        made.push(el);
        return el;
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const clipSound: SoundClip = { id: 'a', url: 'blob:a', in: 1, out: 5, volume: 1 };
  const song = { id: 'song', url: 'blob:song', in: 2, start: 0, volume: 1.6 };
  const gains = { a: 0.5, song: 1.6 } as Record<string, number>;
  const mix = (time: number, master = 1) => ({ time, master, gainOf: (ref: string) => gains[ref] ?? null });
  const lastRamp = (index: number) => {
    const calls = defined(context.gains[index]).gain.calls.filter((call) => call.kind === 'ramp');
    return calls.at(-1);
  };

  it('each element plays through its own gain into one master gain to the speakers', () => {
    const sound = previewSound(() => context as unknown as AudioContext);
    sound.update({ current: [{ clip: clipSound, local: 0.5 }], next: [], held: [], sounds: [{ clip: song, local: 0.5, length: 10 }], nextSounds: [] }, true, 30, mix(0.5));
    // The master first, then a gain per element.
    const [master, clipGain, songGain] = context.gains;
    expect(defined(master).to).toBe(context.destination);
    expect(context.sources.map((source) => source.to)).toEqual([clipGain, songGain]);
    expect([defined(clipGain).to, defined(songGain).to]).toEqual([master, master]);
    // Elements stay at full volume: the gains (up to 200 % and more) are the nodes'.
    expect(made.map((el) => [el.volume, el.muted])).toEqual([
      [1, false],
      [1, false],
    ]);
    sound.dispose();
  });

  it('the chain gain at each tick, as a ramp of at most a frame; the master gain is the loudness gain', () => {
    const sound = previewSound(() => context as unknown as AudioContext);
    context.currentTime = 12;
    sound.update({ current: [{ clip: clipSound, local: 0.5 }], next: [], held: [], sounds: [{ clip: song, local: 0.5, length: 10 }], nextSounds: [] }, true, 30, mix(0.5, 1.4));
    expect(lastRamp(1)).toEqual({ kind: 'ramp', value: 0.5, time: 12 + 1 / 30 });
    expect(lastRamp(2)).toEqual({ kind: 'ramp', value: 1.6, time: 12 + 1 / 30 });
    expect(lastRamp(0)).toEqual({ kind: 'ramp', value: 1.4, time: 12 + 1 / 30 });
    // An unchanged gain isn't scheduled again.
    const before = defined(context.gains[1]).gain.calls.length;
    sound.update({ current: [{ clip: clipSound, local: 0.6 }], next: [], held: [], sounds: [{ clip: song, local: 0.6, length: 10 }], nextSounds: [] }, true, 30, mix(0.6, 1.4));
    expect(defined(context.gains[1]).gain.calls).toHaveLength(before);
    sound.dispose();
  });

  it('a sound clip’s element plays its file from its in point, seeked to the playhead; stops past its length', () => {
    const sound = previewSound(() => context as unknown as AudioContext);
    sound.update({ current: [], next: [], held: [], sounds: [{ clip: song, local: 3, length: 10 }], nextSounds: [] }, true, 30, mix(3));
    const element = defined(made[0]);
    expect(element.src).toBe('blob:song');
    expect(element.currentTime).toBe(5);
    expect(element.paused).toBe(false);
    sound.update({ current: [], next: [], held: [], sounds: [{ clip: song, local: 10, length: 10 }], nextSounds: [] }, true, 30, mix(10));
    expect(element.paused).toBe(true);
    sound.dispose();
  });

  it('resumes the context on Play (a user gesture)', async () => {
    const sound = previewSound(() => context as unknown as AudioContext);
    sound.update({ current: [{ clip: clipSound, local: 0.5 }], next: [], held: [], sounds: [], nextSounds: [] }, false, 30, mix(0.5));
    expect(context.state).toBe('suspended');
    await sound.resume();
    expect(context.state).toBe('running');
    sound.dispose();
  });

  it('without Web Audio, the element’s volume follows the gain (capped at 100 %)', () => {
    const sound = previewSound(() => null);
    sound.update({ current: [{ clip: clipSound, local: 0.5 }], next: [], held: [], sounds: [{ clip: song, local: 0.5, length: 10 }], nextSounds: [] }, true, 30, mix(0.5));
    expect(made.map((el) => el.volume)).toEqual([0.5, 1]);
    sound.dispose();
  });
});

describe('208: the preview’s limiter (D3, T091)', () => {
  let context: FakeLiveContext;
  beforeEach(() => {
    context = new FakeLiveContext();
    vi.stubGlobal('document', { createElement: () => new FakeAudio() });
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  });
  afterEach(() => vi.unstubAllGlobals());
  const clipSound: SoundClip = { id: 'a', url: 'blob:a', in: 1, out: 5, volume: 1 };
  const tick = (sound: ReturnType<typeof previewSound>, limit: boolean) =>
    sound.update({ current: [{ clip: clipSound, local: 0.5 }], next: [], held: [] }, true, 30, { time: 0.5, master: 1, limit, gainOf: () => 1 });
  const loaded = () => vi.waitFor(() => expect(context.modules.length).toBeGreaterThan(0));

  it('loads the limiter worklet after the master gain: master → limiter → speakers, told when to limit', async () => {
    const sound = previewSound(() => context as unknown as AudioContext, () => Promise.resolve('/assets/limiter.worklet.js'));
    tick(sound, false);
    await loaded();
    await vi.waitFor(() => expect(sound.limiter).toBe('worklet'));
    expect(context.modules).toEqual(['/assets/limiter.worklet.js']);
    const master = defined(context.gains[0]);
    const worklet = master.to as FakeWorkletNode;
    expect(worklet).toBeInstanceOf(FakeWorkletNode);
    expect(worklet.name).toBe('chitthi-limiter');
    expect(worklet.to).toBe(context.destination);
    expect(worklet.posted).toEqual([{ limit: false }]);
    tick(sound, true);
    expect(worklet.posted).toEqual([{ limit: false }, { limit: true }]);
    sound.dispose();
  });

  it('when the worklet can’t load, the browser’s compressor stands in as a hard limiter, only while limiting', async () => {
    context.failWorklet = true;
    const sound = previewSound(() => context as unknown as AudioContext, () => Promise.resolve('/assets/limiter.worklet.js'));
    tick(sound, true);
    await vi.waitFor(() => expect(sound.limiter).toBe('compressor'));
    const compressor = defined(context.compressors[0]);
    expect([compressor.threshold.value, compressor.knee.value, compressor.ratio.value, compressor.attack.value, compressor.release.value]).toEqual([-1, 0, 20, 0.001, 0.1]);
    const master = defined(context.gains[0]);
    expect(master.to).toBe(compressor);
    expect(compressor.to).toBe(context.destination);
    tick(sound, false);
    expect(master.to).toBe(context.destination);
    sound.dispose();
  });
});

describe('preview sound while a voice is recorded (209 AC-5)', () => {
  const voice = { id: 'A2', kind: 'audio' as const, name: 'Voice', hidden: false, muted: false, locked: false, role: 'voice' as const };
  const sound = (id: string, track: string): AudioClip => ({ id, track, start: 0, in: 0, out: 5, volume: 1, toEnd: false, srcDur: 5 });
  const withSounds = (): Project<C> & { audio: AudioClip[] } => ({ ...project(), tracks: [...project().tracks, voice], audio: [sound('song', MUSIC), sound('old take', 'A2')] });
  const heard = (plan: ReturnType<typeof soundPlan<C>>) => plan.sounds.map((sounding) => sounding.clip.id);

  it('never plays the track being recorded onto', () => {
    expect(heard(soundPlan(withSounds(), 1))).toEqual(['song', 'old take']);
    expect(heard(soundPlan(withoutRecorded(withSounds(), { track: 'A2', hear: true }), 1))).toEqual(['song']);
    expect(withoutRecorded(withSounds(), null).tracks).toEqual(withSounds().tracks);
  });

  it('is silent unless Hear the video is on', () => {
    const mix = { time: 1, master: 0.8, limit: true, gainOf: () => 0.5 };
    const silent = recordingMix(mix, { track: 'A2', hear: false });
    expect(silent.master).toBe(0);
    expect(silent.gainOf('song')).toBe(0);
    expect(recordingMix(mix, { track: 'A2', hear: true })).toBe(mix);
    expect(recordingMix(mix, null)).toBe(mix);
  });
});
