import { describe, expect, it } from 'vitest';
import { MAIN_VIDEO, MUSIC, defaultTracks, type Project, type TimedClip } from '../../engine/timeline';
import { MAX_NUDGE, soundFix, soundPlan } from './previewSound';

describe('preview sound: whose sound plays (204 §4, D1)', () => {
  type C = TimedClip & { name: string };
  const v = (name: string, track: string, start: number, len: number): C => ({
    name,
    id: name,
    track,
    start,
    kind: 'video',
    in: 1,
    out: 1 + len,
    dur: 0,
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
  });
  // V1: a 0–4, photo 4–7, c 7–10. V2 (overlay): ov 2–3.
  const a = v('a', MAIN_VIDEO, 0, 4),
    c = v('c', MAIN_VIDEO, 7, 3),
    ov = v('ov', 'V2', 2, 1);
  const project = (hidden = false): Project<C> => ({
    tracks: [
      ...defaultTracks()
        .filter((t) => t.id === MAIN_VIDEO)
        .map((t) => ({ ...t, hidden })),
      { id: 'V2', kind: 'overlay', name: 'Overlay', hidden: false, muted: false, locked: false },
      ...defaultTracks().filter((t) => t.id === MUSIC),
    ],
    clips: [a, photo('p', 4, 3), c, ov],
    audio: [],
    layers: [],
    fadeOut: false,
  });
  const names = (r: ReturnType<typeof soundPlan<C>>) => ({
    current: r.current && [r.current.clip.name, r.current.local],
    next: r.next.map((x) => x.name),
  });

  it('plays the clip on top and loads the next ones starting within 2 s', () => {
    expect(names(soundPlan(project(), 0.5))).toEqual({ current: ['a', 0.5], next: ['ov'] });
    expect(names(soundPlan(project(), 2.5))).toEqual({ current: ['ov', 0.5], next: [] });
    expect(names(soundPlan(project(), 5.5))).toEqual({ current: null, next: ['c'] });
    expect(names(soundPlan(project(), 4.5))).toEqual({ current: null, next: [] });
  });

  it("still plays a hidden video track's sound (201 D2)", () => {
    expect(names(soundPlan(project(true), 0.5))).toEqual({ current: ['a', 0.5], next: ['ov'] });
    expect(names(soundPlan(project(true), 5.5))).toEqual({ current: null, next: ['c'] });
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
