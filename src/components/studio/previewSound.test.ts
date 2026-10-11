import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mostVideosAt } from '../../engine/stack';
import { EDGE_EPS, MAIN_VIDEO, MUSIC, defaultTracks, type Project, type TimedClip } from '../../engine/timeline';
import { limitsFor } from '../../engine/video';
import { MAX_NUDGE, previewSound, soundFix, soundPlan, type SoundClip } from './previewSound';

type C = TimedClip & { name: string; volume: number };
const v = (name: string, track: string, start: number, len: number): C => ({
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
const a = v('a', MAIN_VIDEO, 0, 4),
  c = v('c', MAIN_VIDEO, 7, 3),
  ov = v('ov', 'V2', 2, 1),
  w = v('w', 'V3', 2.25, 2.75);
const overlay = (id: string, hidden: boolean, muted: boolean) => ({
  id,
  kind: 'overlay' as const,
  name: id,
  hidden,
  muted,
  locked: false,
});
const project = (
  o: { hidden?: boolean; ovHidden?: boolean; wMuted?: boolean; wHidden?: boolean } = {},
): Project<C> => ({
  tracks: [
    ...defaultTracks()
      .filter((t) => t.id === MAIN_VIDEO)
      .map((t) => ({ ...t, hidden: !!o.hidden })),
    overlay('V2', !!o.ovHidden, false),
    overlay('V3', !!o.wHidden, !!o.wMuted),
    ...defaultTracks().filter((t) => t.id === MUSIC),
  ],
  clips: [a, photo('p', 4, 3), c, ov, w],
  audio: [],
  layers: [],
  fadeOut: false,
});
const names = (r: ReturnType<typeof soundPlan<C>>) => ({
  current: r.current.map((x) => [x.clip.name, x.local]),
  next: r.next.map((x) => x.name),
  held: r.held.map((x) => x.name),
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
    const t = 2 - EDGE_EPS / 2;
    const r = soundPlan(project(), t);
    expect(r.current.map((x) => x.clip.name)).toEqual(['a', 'ov']);
    expect(r.next.map((x) => x.name)).toEqual(['w']);
    // At an overlay clip's end it has stopped.
    expect(names(soundPlan(project(), 3 - EDGE_EPS / 2)).current.map((x) => x[0])).toEqual(['a', 'w']);
  });
});

/** A stand-in for <audio> (unit tests have no DOM): what previewSound reads and writes. */
class FakeAudio {
  paused = true;
  currentTime = 0;
  playbackRate = 1;
  volume = 1;
  muted = false;
  preload = '';
  src = '';
  dataset: Record<string, string> = {};
  addEventListener() {}
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = '';
  }
  load() {}
}

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

  const asSound = (x: C): SoundClip => ({ id: x.id, url: `blob:${x.id}`, in: x.in, out: x.out, volume: x.volume });
  const tick = (s: ReturnType<typeof previewSound>, p: Project<C>, t: number, play: boolean) => {
    const plan = soundPlan(p, t);
    s.update(
      {
        current: plan.current.map((x) => ({ clip: asSound(x.clip), local: x.local })),
        next: plan.next.map(asSound),
        held: plan.held.map(asSound),
      },
      play,
      30,
    );
    return plan;
  };
  const el = (s: ReturnType<typeof previewSound>, id: string) => s.element(id) as unknown as FakeAudio | undefined;

  it('plays one element per current clip, each at its own time', () => {
    const s = previewSound();
    tick(s, project(), 2.5, true);
    expect(s.size).toBe(3);
    for (const [id, local] of [
      ['a', 2.5],
      ['ov', 0.5],
      ['w', 0.25],
    ] as const) {
      const e = el(s, id)!;
      expect(e.paused, id).toBe(false);
      expect(e.currentTime, id).toBeCloseTo(1 + local, 9);
    }
    // Paused: every current element waits at its time.
    tick(s, project(), 2.6, false);
    for (const [id, local] of [
      ['a', 2.6],
      ['ov', 0.6],
      ['w', 0.35],
    ] as const) {
      expect(el(s, id)!.paused, id).toBe(true);
      expect(el(s, id)!.currentTime, id).toBeCloseTo(1 + local, 9);
    }
    s.dispose();
  });

  it('keeps a muted overlay’s clip silent, pre-seeks the next ones and releases the rest', () => {
    const s = previewSound();
    tick(s, project({ wMuted: true }), 2.5, true);
    expect(s.size).toBe(3);
    expect(el(s, 'a')!.paused).toBe(false);
    expect(el(s, 'ov')!.paused).toBe(false);
    expect(el(s, 'w')!.paused).toBe(true);
    // At 5.5 only c (next) is wanted: a, ov and w are released.
    const old = ['a', 'ov', 'w'].map((id) => el(s, id)!);
    tick(s, project({ wMuted: true }), 5.5, true);
    expect(s.size).toBe(1);
    for (const e of old) expect(e.src).toBe('');
    expect(el(s, 'c')!.paused).toBe(true);
    expect(el(s, 'c')!.currentTime).toBe(c.in);
    s.dispose();
  });

  it('never keeps more elements than current + next + held, and the clips on screen within the videos limit', () => {
    const limit = limitsFor('reel', false, true).videosAtOnce;
    for (const o of [{}, { wMuted: true }, { hidden: true, ovHidden: true }]) {
      const p = project(o);
      expect(mostVideosAt(p.clips, p.tracks)).toBeLessThanOrEqual(limit);
      const s = previewSound();
      let most = 0;
      for (let i = -10; i <= 110; i++) {
        const t = i / 10;
        const plan = tick(s, p, t, i % 3 !== 0);
        const want = new Set([
          ...plan.current.map((x) => x.clip.id),
          ...plan.next.map((x) => x.id),
          ...plan.held.map((x) => x.id),
        ]);
        expect(s.size, `t = ${t}`).toBe(want.size);
        expect(plan.current.length + plan.held.length, `t = ${t}`).toBeLessThanOrEqual(mostVideosAt(p.clips, p.tracks));
        most = Math.max(most, s.size);
      }
      expect(most).toBeLessThanOrEqual(limit + p.tracks.length);
      expect(made.filter((e) => e.src !== '').length).toBe(s.size);
      s.dispose();
      expect(made.every((e) => e.src === '')).toBe(true);
      made.length = 0;
    }
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
    const r = soundFix(-0.02, 30, 1.03);
    expect(r.seek).toBe(false);
    expect(!r.seek && r.rate).toBeGreaterThan(1);
    expect(soundFix(-0.008, 30, 1.03)).toEqual({ seek: false, rate: 1 });
  });

  it('moves the rate in 0.5 % steps, so it is not rewritten on every tick', () => {
    const rates = new Set<number>();
    for (let d = -0.24; d <= 0.24; d += 0.0007) {
      const f = soundFix(d, 30, 1.01);
      if (f.seek) throw new Error('seeked');
      expect(Math.abs(f.rate * 200 - Math.round(f.rate * 200))).toBeLessThan(1e-9);
      rates.add(f.rate);
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
      t = 0,
      inFrame = Infinity;
    const dt = 1 / 60;
    for (; t < 6; t += dt) {
      const f = soundFix(drift, 30, rate);
      if (f.seek) throw new Error('seeked');
      rate = f.rate;
      drift += (rate - 1) * dt;
      if (Math.abs(drift) <= 1 / 30) inFrame = Math.min(inFrame, t);
      if (rate === 1 && t > 0.1) break;
    }
    expect(inFrame).toBeLessThan(2.5);
    expect(rate).toBe(1);
    expect(Math.abs(drift)).toBeLessThanOrEqual(0.01);
    expect(t).toBeLessThan(4);
  });
});
