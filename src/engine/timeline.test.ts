import { describe, expect, it } from 'vitest';
import {
  MAIN_VIDEO,
  MUSIC,
  TRACK_LIMITS,
  audioPlan,
  defaultTracks,
  framePlan,
  pack,
  projectLength,
  videoAt,
  type AudioClip,
  type Project,
  type TimedClip,
} from './timeline';
import {
  legacyAudioPlan,
  legacyClipAt,
  legacyFixtures,
  legacyFramePlan,
  legacyTimeline,
  legacyTotal,
  type LegacyClip,
  type LegacyProject,
} from './timeline.testkit';

/** A 2.x project on tracks, built by hand (fromSequence is tested on its own, with the document). */
function onTracks(p: LegacyProject): Project<LegacyClip & TimedClip> {
  const clips = pack(p.clips.map((c) => ({ ...c, track: MAIN_VIDEO, start: 0 })));
  const audio: AudioClip[] = p.music
    ? [
        {
          id: 'music',
          track: MUSIC,
          start: 0,
          in: p.music.offset,
          volume: p.music.volume,
          toEnd: true,
          srcDur: p.music.dur,
        },
      ]
    : [];
  return { tracks: defaultTracks(), clips, audio, layers: p.layers, fadeOut: p.fadeOut };
}

/** 1,000 seeded times from just before 0 to past the end, plus every clip boundary ± 1 µs. */
function times(p: LegacyProject): number[] {
  const total = legacyTotal(p.clips);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const out = [-1, 0, total, total + 3];
  for (const q of legacyTimeline(p.clips)) out.push(q.start, q.end, q.start - 1e-6, q.start + 1e-6, q.end - 1e-6);
  for (let i = 0; i < 1000; i++) out.push(-0.5 + rnd() * (total + 1));
  return out;
}

const fixtures = Object.entries(legacyFixtures());

describe('the track model gives the 2.x answers for every 2.x project', () => {
  it.each(fixtures)('%s: starts and length', (_, p) => {
    const tp = onTracks(p);
    const ref = legacyTimeline(p.clips);
    // Bit-identical starts: the same additions in the same order.
    expect(tp.clips.map((c) => c.start)).toEqual(ref.map((q) => q.start));
    expect(projectLength(tp)).toBe(legacyTotal(p.clips));
  });

  it.each(fixtures)('%s: the frame at any time', (_, p) => {
    const tp = onTracks(p);
    const ref = legacyTimeline(p.clips);
    for (const t of times(p)) {
      const want = legacyClipAt(ref, t);
      const got = videoAt(tp, t);
      expect(got?.clip.id, `t = ${t}`).toBe(want?.clip.id);
      if (want) expect(got?.local, `t = ${t}`).toBe(t - want.start);
    }
  });

  it.each(fixtures)('%s: the export’s frames at 30 and 60 fps', (_, p) => {
    const tp = onTracks(p);
    for (const fps of [30, 60])
      expect(
        framePlan(tp, fps).map((f) => ({ id: f.clip?.id, f0: f.f0, f1: f.f1, start: f.start })),
        `${fps} fps`,
      ).toEqual(legacyFramePlan(p, fps));
  });

  it.each(fixtures)('%s: the export’s sound', (_, p) => {
    expect(audioPlan(onTracks(p))).toEqual(legacyAudioPlan(p));
  });
});

describe('tracks', () => {
  const p = legacyFixtures().mixed;

  it('every project starts with one video track and one music track', () => {
    expect(defaultTracks()).toEqual([
      { id: MAIN_VIDEO, kind: 'video', name: 'Video', hidden: false, muted: false, locked: false },
      { id: MUSIC, kind: 'audio', name: 'Music', hidden: false, muted: false, locked: false },
    ]);
  });

  it('a hidden video track draws no clip (black with layers) but keeps the length and the clips’ sound', () => {
    const tp = onTracks({ ...p, music: { offset: 1, volume: 0.5, dur: 60 } });
    const hidden = { ...tp, tracks: tp.tracks.map((t) => (t.id === MAIN_VIDEO ? { ...t, hidden: true } : t)) };
    expect(projectLength(hidden)).toBe(projectLength(tp));
    for (const t of [-1, 0, 2, projectLength(tp)]) expect(videoAt(hidden, t)).toBeNull();
    const frames = framePlan(hidden, 30);
    expect(frames).toEqual([{ clip: null, f0: 0, f1: Math.round(projectLength(tp) * 30), start: 0 }]);
    expect(audioPlan(hidden)).toEqual(audioPlan(tp));
  });

  it('a muted music track leaves the music out; the clips’ sound stays', () => {
    const tp = onTracks({ ...p, music: { offset: 1, volume: 0.5, dur: 60 } });
    const muted = { ...tp, tracks: tp.tracks.map((t) => (t.id === MUSIC ? { ...t, muted: true } : t)) };
    expect(audioPlan(muted)).toEqual(audioPlan(tp).filter((s) => s.ref !== 'music'));
    expect(audioPlan(tp).some((s) => s.ref === 'music')).toBe(true);
  });

  it('a locked track changes nothing in the picture or the sound', () => {
    const tp = onTracks(p);
    const locked = { ...tp, tracks: tp.tracks.map((t) => ({ ...t, locked: true })) };
    expect(framePlan(locked, 30)).toEqual(framePlan(tp, 30));
    expect(audioPlan(locked)).toEqual(audioPlan(tp));
  });

  it('pack only places the main video track and keeps every other field', () => {
    const clips = pack([
      { id: 'a', kind: 'photo' as const, dur: 2, in: 0, out: 0, track: MAIN_VIDEO, start: 9 },
      { id: 'b', kind: 'photo' as const, dur: 1, in: 0, out: 0, track: 'O1', start: 4.25 },
      { id: 'c', kind: 'video' as const, dur: 0, in: 1, out: 3, track: MAIN_VIDEO, start: 0 },
    ]);
    expect(clips.map((c) => [c.id, c.start])).toEqual([
      ['a', 0],
      ['b', 4.25],
      ['c', 2],
    ]);
    expect(clips[2]).toMatchObject({ kind: 'video', in: 1, out: 3 });
  });

  it('track limits: 8 + 8 in the desktop app, 4 + 4 in the browser', () => {
    expect(TRACK_LIMITS(true)).toEqual({ visual: 8, audio: 8 });
    expect(TRACK_LIMITS(false)).toEqual({ visual: 4, audio: 4 });
  });
});
