import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  MAIN_VIDEO,
  MUSIC,
  TRACK_LIMITS,
  addTrack,
  audioPlan,
  clampTransform,
  defaultTracks,
  deleteTrack,
  framePlan,
  fromSequence,
  gaps,
  isIdentity,
  lockedReason,
  mergeProject,
  moveTrack,
  pack,
  patchTrack,
  presetTransform,
  projectLength,
  renameTrack,
  toDocument,
  tooManyTracks,
  videoAt,
  type AudioClip,
  type Project,
  type TimedClip,
  type Track,
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
import { countKeys, type Ease, type Keyframe } from './keyframes';
import { mergeLayers, newSticker, type Layer } from './layers';
import { clipLength, limitsFor } from './video';
import * as V from './video';

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

  it.each(fixtures)('%s: the paused frame (videoAt) is the export’s at every frame, hair edges included', (name, p) => {
    const tp = onTracks(p);
    for (const fps of [30, 60]) {
      let hairs = 0;
      for (const span of framePlan(tp, fps))
        for (let i = span.f0; i < span.f1; i++) {
          const got = videoAt(tp, i / fps);
          expect(got?.clip, `${fps} fps, frame ${i}`).toBe(span.clip ?? undefined);
          // A start summed in floating point a hair after the frame's time: exact edges would pick the earlier clip.
          if (span.clip && i / fps < span.clip.start) hairs++;
        }
      if (name === 'tinyClips' || name === 'clips500') expect(hairs, `${fps} fps`).toBeGreaterThan(0);
    }
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

/* ---------- T021: track switches and the lock guard ---------- */

describe('track switches (patchTrack) and the lock guard (lockedReason)', () => {
  const tracks = defaultTracks();

  it('hides a picture track, mutes a sound track and locks either', () => {
    expect(patchTrack(tracks, MAIN_VIDEO, { hidden: true })[0]).toMatchObject({ hidden: true, muted: false });
    expect(patchTrack(tracks, MUSIC, { muted: true })[1]).toMatchObject({ muted: true, hidden: false });
    expect(patchTrack(tracks, MUSIC, { locked: true })[1].locked).toBe(true);
    expect(patchTrack(tracks, MAIN_VIDEO, { locked: true })[0].locked).toBe(true);
    expect(tracks.every((t) => !t.hidden && !t.muted && !t.locked)).toBe(true); // the input is left alone
  });

  it('a sound track has no Hide and a picture track no Mute; unknown tracks and no-ops give the same array', () => {
    expect(patchTrack(tracks, MUSIC, { hidden: true })).toBe(tracks);
    expect(patchTrack(tracks, MAIN_VIDEO, { muted: true })).toBe(tracks);
    expect(patchTrack(tracks, 'X9', { locked: true })).toBe(tracks);
    expect(patchTrack(tracks, MAIN_VIDEO, { locked: false })).toBe(tracks);
  });

  it('a locked track says why; an unlocked or unknown track lets the edit through', () => {
    expect(lockedReason(tracks, MAIN_VIDEO)).toBeNull();
    expect(lockedReason(tracks, 'X9')).toBeNull();
    const locked = patchTrack(tracks, MAIN_VIDEO, { locked: true });
    expect(lockedReason(locked, MAIN_VIDEO)).toBe('The Video track is locked. Unlock it to change its clips.');
    expect(lockedReason(locked, MUSIC)).toBeNull();
    expect(lockedReason(patchTrack(tracks, MUSIC, { locked: true }), MUSIC)).toMatch(/^The Music track is locked/);
  });
});

/* ---------- 202 T010: gaps on the main track ---------- */

describe('gaps on the main video track (202)', () => {
  const clip = (id: string, start: number, len: number, kind: 'photo' | 'video' = 'photo'): TimedClip => ({
    id,
    track: MAIN_VIDEO,
    start,
    kind,
    dur: kind === 'photo' ? len : 0,
    in: kind === 'video' ? 1 : 0,
    out: kind === 'video' ? 1 + len : 0,
  });
  const project = (clips: TimedClip[]): Project => ({
    tracks: defaultTracks(),
    clips,
    audio: [],
    layers: [],
    fadeOut: true,
  });
  // 0–2 photo, gap 2–3.5, 3.5–5.5 photo, gap 5.5–6, 6–8 video.
  const withGaps = project([clip('a', 0, 2), clip('b', 3.5, 2), clip('c', 6, 2, 'video')]);
  const lateStart = project([clip('a', 1, 2), clip('b', 3, 1)]);

  it('lists the gaps between clips, and before a first clip that starts later', () => {
    expect(gaps(withGaps, MAIN_VIDEO)).toEqual([
      { start: 2, end: 3.5 },
      { start: 5.5, end: 6 },
    ]);
    expect(gaps(lateStart, MAIN_VIDEO)).toEqual([{ start: 0, end: 1 }]);
    expect(gaps(onTracks(legacyFixtures().mixed), MAIN_VIDEO)).toEqual([]);
    expect(gaps(withGaps, MUSIC)).toEqual([]);
    expect(projectLength(withGaps)).toBe(8);
  });

  it('shows no clip inside a gap; clamps before 0 and at or past the end as 2.x did', () => {
    expect(videoAt(withGaps, 2.5)).toBeNull();
    expect(videoAt(withGaps, 2)).toBeNull();
    expect(videoAt(withGaps, 5.75)).toBeNull();
    expect(videoAt(withGaps, 1.99)?.clip.id).toBe('a');
    expect(videoAt(withGaps, 3.5)).toMatchObject({ clip: { id: 'b' }, local: 0 });
    expect(videoAt(withGaps, -1)).toMatchObject({ clip: { id: 'a' }, local: -1 });
    expect(videoAt(withGaps, 8)).toMatchObject({ clip: { id: 'c' }, local: 2 });
    expect(videoAt(withGaps, 9)?.clip.id).toBe('c');
    expect(videoAt(lateStart, 0.5)).toBeNull();
    expect(videoAt(lateStart, -1)).toBeNull();
    expect(videoAt(lateStart, 1)?.clip.id).toBe('a');
  });

  it('exports every frame: a gap is a span of black frames of its exact length', () => {
    for (const fps of [30, 60]) {
      const plan = framePlan(withGaps, fps);
      expect(plan[0].f0).toBe(0);
      for (let i = 1; i < plan.length; i++) expect(plan[i].f0).toBe(plan[i - 1].f1);
      expect(plan.at(-1)!.f1).toBe(8 * fps);
      expect(plan.map((s) => s.clip?.id ?? null)).toEqual(['a', null, 'b', null, 'c']);
    }
    const gap = framePlan(withGaps, 30)[1];
    expect(gap).toEqual({ clip: null, f0: 60, f1: 105, start: 2 });
    expect(gap.f1 - gap.f0).toBe(45); // 1.5 s at 30 fps (spec AC-4)
    expect(framePlan(lateStart, 30)[0]).toEqual({ clip: null, f0: 0, f1: 30, start: 0 });
  });

  it('is silent from the video track in a gap, while the music plays on through it (AC-4)', () => {
    const music = { id: 'music', track: MUSIC, start: 0, in: 0, volume: 0.8, toEnd: true, srcDur: 20 };
    const plan = audioPlan({ ...withGaps, clips: withGaps.clips.map((c) => ({ ...c, volume: 1 })), audio: [music] });
    const own = plan.filter((s) => s.ref !== 'music');
    expect(own.map((s) => s.ref)).toEqual(['c']);
    for (const g of gaps(withGaps, MAIN_VIDEO))
      for (const s of own) expect(s.end <= g.start || s.start >= g.end).toBe(true);
    expect(plan.find((s) => s.ref === 'music')).toMatchObject({ start: 0, end: 8, from: 0 });
  });
});

/* ---------- T014: the document, the 2.x migration and the gate ---------- */

/** A 2.x project as a document: clips in order with their media, the song, layers (no version). */
function legacyDoc(p: LegacyProject) {
  const media = [
    ...p.clips.map((c) => ({
      id: `m${c.id}`,
      kind: c.kind,
      name: `${c.id}.${c.kind === 'photo' ? 'jpg' : 'mp4'}`,
      type: c.kind === 'photo' ? 'image/jpeg' : 'video/mp4',
      size: 1000,
      w: 1600,
      h: 900,
      srcDur: c.kind === 'video' ? c.out + 1 : 0,
    })),
    ...(p.music
      ? [
          {
            id: 'msong',
            kind: 'audio' as const,
            name: 'song.mp3',
            type: 'audio/mpeg',
            size: 5000,
            w: 0,
            h: 0,
            srcDur: p.music.dur,
          },
        ]
      : []),
  ];
  return {
    kind: 'vlog' as const,
    format: 'yt1080' as const,
    fps: 30 as const,
    quality: 'standard' as const,
    fadeOut: p.fadeOut,
    clips: p.clips.map((c) => ({ ...c, media: `m${c.id}` })),
    music: p.music ? { ...p.music, media: 'msong' } : null,
    layers: p.layers,
    media,
  };
}

describe('the 2.x project becomes tracks (fromSequence)', () => {
  it.each(fixtures)('%s: one video track back to back, one music track', (_, p) => {
    const tp = fromSequence({
      clips: p.clips,
      music: p.music && { ...p.music, media: 'msong' },
      layers: p.layers,
      fadeOut: p.fadeOut,
    });
    expect(tp.tracks).toEqual(defaultTracks());
    expect(tp.clips.map((c) => [c.id, c.track, c.start])).toEqual(
      legacyTimeline(p.clips).map((q) => [q.clip.id, MAIN_VIDEO, q.start]),
    );
    expect(tp.clips.map(({ track: _t, start: _s, ...rest }) => rest)).toEqual(p.clips);
    expect(tp.audio).toEqual(
      p.music
        ? [
            {
              id: 'music',
              track: MUSIC,
              start: 0,
              in: p.music.offset,
              volume: p.music.volume,
              toEnd: true,
              srcDur: p.music.dur,
              media: 'msong',
            },
          ]
        : [],
    );
    expect(tp.layers).toBe(p.layers);
    expect(tp.fadeOut).toBe(p.fadeOut);
  });
});

describe('the project document (toDocument, mergeProject)', () => {
  it.each(fixtures)('%s: 2.x document → version 1 → JSON → the gate: unchanged, and 2.x’s placement', (_, p) => {
    const first = mergeProject(JSON.parse(JSON.stringify(legacyDoc(p))), true);
    expect(first.dropped).toEqual([]);
    expect(first.doc.version).toBe(1);
    expect(first.doc.clips.map((c) => c.start)).toEqual(legacyTimeline(p.clips).map((q) => q.start));
    expect(projectLength(first.doc)).toBe(legacyTotal(p.clips));
    const again = mergeProject(JSON.parse(JSON.stringify(toDocument(first.doc))), true);
    expect(again.dropped).toEqual([]);
    expect(again.doc).toEqual(first.doc);
    expect(framePlan(again.doc, 30).map((f) => ({ id: f.clip?.id, f0: f.f0, f1: f.f1, start: f.start }))).toEqual(
      legacyFramePlan(p, 30),
    );
    expect(audioPlan(again.doc)).toEqual(legacyAudioPlan(p));
  });

  it('a document keeps only what a project is: no blobs, URLs, thumbnails or unknown fields', () => {
    const { doc } = mergeProject(legacyDoc(legacyFixtures().mixed), true);
    const withJunk = {
      ...doc,
      clips: doc.clips.map((c) => ({ ...c, url: 'blob:x', thumb: 'data:', strip: ['a'], still: {}, file: {} })),
      extra: 1,
    };
    const out = toDocument(withJunk as typeof doc);
    expect(Object.keys(out).sort()).toEqual([
      'audio',
      'clips',
      'fadeOut',
      'format',
      'fps',
      'kind',
      'layers',
      'magnetic',
      'media',
      'quality',
      'tracks',
      'version',
    ]);
    expect(Object.keys(out.clips[0]).sort()).toEqual([
      'dur',
      'edit',
      'fade',
      'id',
      'in',
      'kind',
      'media',
      'motion',
      'out',
      'start',
      'track',
      'volume',
    ]);
    expect(JSON.parse(JSON.stringify(out))).toEqual(out);
  });

  const good = () => mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
  const bad: [string, (d: ReturnType<typeof good>) => unknown][] = [
    ['null', () => null],
    ['a string', () => 'project'],
    ['a number', () => 42],
    ['an array', () => []],
    ['an unknown version', (d) => ({ ...d, version: 7 })],
    ['a version as text', (d) => ({ ...d, version: '1' })],
    ['clips not an array', (d) => ({ ...d, clips: 'x' })],
    ['a clip that is null', (d) => ({ ...d, clips: [null, ...d.clips] })],
    ['NaN start', (d) => ({ ...d, clips: d.clips.map((c, i) => (i ? c : { ...c, start: NaN })) })],
    [
      'Infinity duration',
      (d) => ({ ...d, clips: d.clips.map((c) => (c.kind === 'photo' ? { ...c, dur: Infinity } : c)) }),
    ],
    ['negative duration', (d) => ({ ...d, clips: d.clips.map((c) => (c.kind === 'photo' ? { ...c, dur: -2 } : c)) })],
    ['huge start', (d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, start: 1e300 })) })],
    ['in ≥ out', (d) => ({ ...d, clips: d.clips.map((c) => (c.kind === 'video' ? { ...c, in: 5, out: 5 } : c)) })],
    [
      'out past the source',
      (d) => ({ ...d, clips: d.clips.map((c) => (c.kind === 'video' ? { ...c, out: 1e6 } : c)) }),
    ],
    ['negative in', (d) => ({ ...d, clips: d.clips.map((c) => (c.kind === 'video' ? { ...c, in: -4 } : c)) })],
    ['an unknown track', (d) => ({ ...d, clips: d.clips.map((c, i) => (i ? c : { ...c, track: 'V9' })) })],
    ['a clip on the music track', (d) => ({ ...d, clips: d.clips.map((c, i) => (i ? c : { ...c, track: MUSIC })) })],
    ['missing media', (d) => ({ ...d, media: d.media.slice(1) })],
    [
      'media of the wrong kind',
      (d) => ({ ...d, media: d.media.map((m) => (m.kind === 'photo' ? { ...m, kind: 'video' } : m)) }),
    ],
    ['duplicate clip ids', (d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, id: 'same' })) })],
    ['a bad clip id', (d) => ({ ...d, clips: d.clips.map((c, i) => (i ? c : { ...c, id: '<b>' })) })],
    [
      '600 clips',
      (d) => ({
        ...d,
        kind: 'reel',
        format: 'reel',
        clips: Array.from({ length: 600 }, (_, i) => ({ ...d.clips[0], id: `c${i}` })),
      }),
    ],
    [
      '20 picture tracks',
      (d) => ({
        ...d,
        tracks: [
          ...d.tracks,
          ...Array.from({ length: 20 }, (_, i) => ({
            id: `O${i}`,
            kind: 'overlay',
            name: 'O',
            hidden: false,
            muted: false,
            locked: false,
          })),
        ],
      }),
    ],
    ['no tracks', (d) => ({ ...d, tracks: [] })],
    [
      'the main track turned into audio',
      (d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === MAIN_VIDEO ? { ...t, kind: 'audio' } : t)) }),
    ],
    [
      'a track of an unknown kind',
      (d) => ({
        ...d,
        tracks: [...d.tracks, { id: 'X1', kind: 'subtitle', name: 'X', hidden: false, muted: false, locked: false }],
      }),
    ],
    [
      'a bad edit',
      (d) => ({
        ...d,
        clips: d.clips.map((c) => ({ ...c, edit: { zoom: 'max', rot: 45, adjust: 'warm', masks: 'm' } })),
      }),
    ],
    [
      'a bad motion and volume',
      (d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, motion: 'spin', volume: 9, fade: 'yes' })) }),
    ],
    ['bad layers', (d) => ({ ...d, layers: [{ kind: 'video' }, 3, null] })],
    ['bad settings', (d) => ({ ...d, kind: 'tv', format: 'yt8k', fps: 120, quality: 'ultra', fadeOut: 'no' })],
    [
      'music on a picture track',
      (d) => ({
        ...d,
        audio: [{ id: 'music', track: MAIN_VIDEO, start: 0, in: 0, volume: 1, toEnd: true, srcDur: 9, media: 'x' }],
      }),
    ],
    [
      'music with NaN volume and negative offset',
      (d) => ({ ...d, audio: d.audio.map((a) => ({ ...a, volume: NaN, in: -3 })) }),
    ],
    ['2.x music that is a string', (d) => ({ clips: d.clips, music: 'song', layers: [], media: d.media })],
    ['a 2.x clip list of junk', () => ({ clips: [1, 'a', { kind: 'photo' }], music: null, layers: [] })],
    ['Magnetic off, clips out of order', (d) => ({ ...d, magnetic: false, clips: d.clips.slice().reverse() })],
    [
      'Magnetic off, every clip at 0',
      (d) => ({ ...d, magnetic: false, clips: d.clips.map((c) => ({ ...c, start: 0 })) }),
    ],
    [
      'Magnetic off, starts as text',
      (d) => ({ ...d, magnetic: false, clips: d.clips.map((c) => ({ ...c, start: '2' })) }),
    ],
    [
      'Magnetic off, a negative start',
      (d) => ({ ...d, magnetic: false, clips: d.clips.map((c) => ({ ...c, start: -5 })) }),
    ],
    ['Magnetic as text', (d) => ({ ...d, magnetic: 'off' })],
    [
      'Magnetic off, a clip inside another',
      (d) => ({ ...d, magnetic: false, clips: d.clips.map((c, i) => (i === 2 ? { ...c, start: 3.5 } : c)) }),
    ],
  ];

  it(`has ${bad.length} malformed documents (at least 30)`, () => expect(bad.length).toBeGreaterThanOrEqual(30));

  it.each(bad)('%s: a valid project, never an exception', (_, make) => {
    const d = good();
    let out: ReturnType<typeof mergeProject> | undefined;
    expect(() => (out = mergeProject(make(d), false))).not.toThrow();
    const { doc } = out!;
    expect(doc.version).toBe(1);
    // Valid by its own rules: tracks, clips, times, limits; and a second pass changes nothing.
    expect(doc.tracks.find((t) => t.id === MAIN_VIDEO)?.kind).toBe('video');
    expect(doc.tracks.find((t) => t.id === MUSIC)?.kind).toBe('audio');
    expect(doc.tracks.filter((t) => t.kind !== 'audio').length).toBeLessThanOrEqual(TRACK_LIMITS(false).visual);
    expect(doc.clips.length).toBeLessThanOrEqual(60);
    for (const c of doc.clips) {
      expect(doc.tracks.some((t) => t.id === c.track && t.kind !== 'audio')).toBe(true);
      const m = doc.media.find((x) => x.id === c.media);
      expect(m?.kind).toBe(c.kind);
      expect(Number.isFinite(c.start) && c.start >= 0).toBe(true);
      if (c.kind === 'video') expect(0 <= c.in && c.in < c.out && c.out <= m!.srcDur).toBe(true);
      else expect(Number.isFinite(c.dur) && c.dur >= 0).toBe(true);
    }
    expect(new Set(doc.clips.map((c) => c.id)).size).toBe(doc.clips.length);
    for (const a of doc.audio) expect(doc.tracks.find((t) => t.id === a.track)?.kind).toBe('audio');
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(doc))), false).doc).toEqual(doc);
  });

  it('says why it dropped or changed something', () => {
    const d = good();
    expect(mergeProject({ ...d, version: 7 }, true).dropped.join(' ')).toMatch(/newer|version/i);
    expect(mergeProject({ ...d, media: d.media.slice(1) }, true).dropped.join(' ')).toMatch(/media/i);
    expect(
      mergeProject({ ...d, clips: d.clips.map((c, i) => (i ? c : { ...c, track: 'V9' })) }, true).dropped.join(' '),
    ).toMatch(/track/i);
    expect(mergeProject(null, true).dropped.length).toBe(1);
  });
});

describe('Magnetic in the document (202)', () => {
  // mixed: photo 3 s, video 4.5 s, photo 1.5 s, video 0.33 s; packed at 0, 3, 7.5, 9.
  const good = () => mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
  const starts = (raw: unknown) => mergeProject(raw, true).doc.clips.map((c) => c.start);

  it('missing means on: packed, and written as on', () => {
    const d = good();
    expect(d.magnetic).toBe(true);
    expect(toDocument(d).magnetic).toBe(true);
    const { magnetic: _, ...noField } = toDocument(d);
    expect(starts({ ...noField, clips: d.clips.map((c, i) => ({ ...c, start: i * 10 })) })).toEqual([0, 3, 7.5, 9]);
    expect(mergeProject({ ...noField }, true).doc.magnetic).toBe(true);
  });
  it('only false switches it off; on packs a document with gaps', () => {
    const d = good();
    expect(mergeProject({ ...d, magnetic: 'off' }, true).doc.magnetic).toBe(true);
    expect(mergeProject({ ...d, magnetic: 0 }, true).doc.magnetic).toBe(true);
    expect(starts({ ...d, magnetic: true, clips: d.clips.map((c, i) => ({ ...c, start: i * 10 })) })).toEqual([
      0, 3, 7.5, 9,
    ]);
  });
  it('off keeps the gaps, and goes through the gate unchanged', () => {
    const d = { ...good(), magnetic: false };
    const spaced = { ...d, clips: d.clips.map((c, i) => ({ ...c, start: 1 + i * 10 })) };
    const once = mergeProject(JSON.parse(JSON.stringify(toDocument(spaced))), true);
    expect(once.dropped).toEqual([]);
    expect(once.doc.magnetic).toBe(false);
    expect(once.doc.clips.map((c) => c.start)).toEqual([1, 11, 21, 31]);
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(once.doc))), true).doc).toEqual(once.doc);
  });
  it('off sorts the clips by start', () => {
    const d = { ...good(), magnetic: false };
    const out = mergeProject({ ...d, clips: d.clips.map((c, i) => ({ ...c, start: 40 - i * 10 })) }, true);
    expect(out.doc.clips.map((c) => c.start)).toEqual([10, 20, 30, 40]);
    expect(out.dropped).toEqual([]);
  });
  it('off moves an overlapping clip to the end of the clip it overlaps, with a reason (D3)', () => {
    const d = { ...good(), magnetic: false };
    // The second clip (4.5 s) starts at 2, inside the first (0–3): it moves to 3.
    const one = mergeProject({ ...d, clips: d.clips.map((c, i) => ({ ...c, start: [0, 2, 20, 30][i] })) }, true);
    expect(one.doc.clips.map((c) => c.start)).toEqual([0, 3, 20, 30]);
    expect(one.dropped.join(' ')).toMatch(/overlapped/);
    // All at 0: each goes after the one before (the order of the document kept for equal starts).
    const all = mergeProject({ ...d, clips: d.clips.map((c) => ({ ...c, start: 0 })) }, true);
    expect(all.doc.clips.map((c) => c.start)).toEqual([0, 3, 7.5, 9]);
    expect(all.doc.clips.map((c) => c.id)).toEqual(d.clips.map((c) => c.id));
    expect(all.dropped.length).toBe(3);
  });
});

/* ---------- 203 T010: the clip transform ---------- */

describe('the clip transform (203 AC-4)', () => {
  it('identity is the whole frame, and a clip without a transform is at identity', () => {
    expect(IDENTITY).toEqual({ x: 0.5, y: 0.5, w: 1, rot: 0, opacity: 1, radius: 0 });
    expect(isIdentity(undefined)).toBe(true);
    expect(isIdentity({ ...IDENTITY })).toBe(true);
    for (const k of Object.keys(IDENTITY) as (keyof typeof IDENTITY)[])
      expect(isIdentity({ ...IDENTITY, [k]: IDENTITY[k] + 0.01 }), k).toBe(false);
  });

  it('has one definition: the drawing fast path (video.ts) is the one timeline.ts exports', () => {
    expect(IDENTITY).toBe(V.IDENTITY);
    expect(isIdentity).toBe(V.isIdentity);
    for (const k of Object.keys(V.IDENTITY) as (keyof typeof IDENTITY)[])
      expect(V.isIdentity({ ...V.IDENTITY, [k]: V.IDENTITY[k] + 0.25 }), k).toBe(false);
  });

  it('clamps every field to its range', () => {
    const lo = clampTransform({ x: -9, y: -0.6, w: 0, rot: -400, opacity: -1, radius: -0.1 });
    expect(lo).toEqual({ x: -0.5, y: -0.5, w: 0.05, rot: -180, opacity: 0, radius: 0 });
    const hi = clampTransform({ x: 9, y: 1.6, w: 99, rot: 400, opacity: 2, radius: 3 });
    expect(hi).toEqual({ x: 1.5, y: 1.5, w: 4, rot: 180, opacity: 1, radius: 0.5 });
    const inside = { x: -0.25, y: 1.25, w: 0.35, rot: -45, opacity: 0.4, radius: 0.2 };
    expect(clampTransform(inside)).toEqual(inside);
  });

  it('missing, NaN, infinite or non-number fields take the identity value; never throws', () => {
    expect(clampTransform(undefined)).toEqual(IDENTITY);
    expect(clampTransform({})).toEqual(IDENTITY);
    expect(clampTransform({ x: 0.2 })).toEqual({ ...IDENTITY, x: 0.2 });
    expect(clampTransform({ x: NaN, y: Infinity, w: -Infinity, rot: NaN, opacity: NaN, radius: NaN })).toEqual(
      IDENTITY,
    );
    const junk = { x: '0.2', y: null, w: {}, rot: [], opacity: true } as unknown as Partial<typeof IDENTITY>;
    expect(clampTransform(junk)).toEqual(IDENTITY);
    expect(clampTransform(IDENTITY)).not.toBe(IDENTITY); // a copy: callers may change it
  });

  it('Full frame is identity at any frame size', () => {
    expect(presetTransform('full', 1080, 1920)).toEqual(IDENTITY);
    expect(presetTransform('full', 1920, 1080)).toEqual(IDENTITY);
  });

  // The box has the frame's aspect: width 0.35 W, height 0.35 H; the margin is 4 % of the frame width on both axes.
  it.each([
    { ratio: '9:16', W: 1080, H: 1920 },
    { ratio: '16:9', W: 1920, H: 1080 },
  ])('the four corners at $ratio: 35 percent wide, 4 percent of the width from the two nearest edges', ({ W, H }) => {
    const m = 0.04 * W;
    const box = (p: Parameters<typeof presetTransform>[0]) => {
      const t = presetTransform(p, W, H);
      expect(t).toMatchObject({ w: 0.35, rot: 0, opacity: 1, radius: 0 });
      const bw = t.w * W,
        bh = t.w * H;
      return {
        left: t.x * W - bw / 2,
        right: W - (t.x * W + bw / 2),
        top: t.y * H - bh / 2,
        bottom: H - (t.y * H + bh / 2),
      };
    };
    const tl = box('top-left'),
      tr = box('top-right'),
      bl = box('bottom-left'),
      br = box('bottom-right');
    for (const [b, near] of [
      [tl, ['left', 'top']],
      [tr, ['right', 'top']],
      [bl, ['left', 'bottom']],
      [br, ['right', 'bottom']],
    ] as const)
      for (const side of near) expect(b[side], side).toBeCloseTo(m, 6);
    // Inside the frame, on the far sides too.
    for (const b of [tl, tr, bl, br]) for (const v of Object.values(b)) expect(v).toBeGreaterThan(0);
    // The numbers, worked out by hand.
    const left = presetTransform('top-left', W, H);
    expect(left.x).toBeCloseTo(0.215, 9);
    expect(left.y).toBeCloseTo(0.175 + (0.04 * W) / H, 9);
  });
});

/* ---------- 203 T010: adding, renaming, moving and deleting tracks ---------- */

describe('overlay tracks (203 AC-1, AC-2)', () => {
  const ids = (ts: Track[]) => ts.map((t) => t.id);
  const add = (ts: Track[], desktop = false): Track[] => {
    const r = addTrack(ts, desktop);
    if ('error' in r) throw new Error(r.error);
    return r.tracks;
  };
  const ok = <T>(r: T | { error: string }): T => {
    if (r && typeof r === 'object' && 'error' in r) throw new Error((r as { error: string }).error);
    return r as T;
  };
  const err = (r: unknown) => (r && typeof r === 'object' && 'error' in r ? (r as { error: string }).error : null);

  it('adds an empty overlay track at the top of the picture tracks, named Overlay 1, 2 …', () => {
    const tracks = defaultTracks();
    const r = addTrack(tracks, false);
    if ('error' in r) throw new Error(r.error);
    expect(r.tracks).toHaveLength(3);
    const o = r.tracks.find((t) => t.id === r.id)!;
    expect(o).toMatchObject({ kind: 'overlay', name: 'Overlay 1', hidden: false, muted: false, locked: false });
    expect(o.id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    // Drawing order, bottom first: the main track, the new overlay, then the sound tracks.
    expect(ids(r.tracks)).toEqual([MAIN_VIDEO, r.id, MUSIC]);
    expect(tracks).toEqual(defaultTracks()); // the input is left alone
    const two = add(r.tracks);
    expect(two.map((t) => t.name)).toEqual(['Video', 'Overlay 1', 'Overlay 2', 'Music']);
    expect(new Set(ids(two)).size).toBe(4);
  });

  it('names a new track with the lowest free number, and ids stay unique', () => {
    const three = add(add(add(defaultTracks(), true), true), true);
    const o2 = three.find((t) => t.name === 'Overlay 2')!;
    const gone = ok(deleteTrack(three, [], o2.id)).tracks;
    const again = add(gone, true);
    expect(again.map((t) => t.name)).toEqual(['Video', 'Overlay 1', 'Overlay 3', 'Overlay 2', 'Music']);
    expect(new Set(ids(again)).size).toBe(again.length);
    // A renamed track frees its number.
    const renamed = ok(renameTrack(three, three[1].id, 'Face cam'));
    expect(add(renamed, true).at(-2)!.name).toBe('Overlay 1');
  });

  it('is refused at the picture track limit with the message the button shows: 4 on the web, 8 on desktop', () => {
    let web = defaultTracks();
    for (let i = 0; i < 3; i++) web = add(web);
    expect(web.filter((t) => t.kind !== 'audio')).toHaveLength(TRACK_LIMITS(false).visual);
    expect(err(addTrack(web, false))).toBe(tooManyTracks(false));
    expect(tooManyTracks(false)).toMatch(/\b4\b/);
    expect(tooManyTracks(false)).toMatch(/desktop app.*\b8\b/);
    let desk = web;
    for (let i = 0; i < 4; i++) desk = add(desk, true);
    expect(desk.filter((t) => t.kind !== 'audio')).toHaveLength(TRACK_LIMITS(true).visual);
    expect(err(addTrack(desk, true))).toBe(tooManyTracks(true));
    expect(tooManyTracks(true)).toMatch(/\b8\b/);
    expect(tooManyTracks(true)).not.toMatch(/desktop app/);
  });

  it('renames a track: trimmed, 1–40 characters', () => {
    const tracks = add(defaultTracks());
    const id = tracks[1].id;
    expect(ok(renameTrack(tracks, id, '  Face cam  '))[1].name).toBe('Face cam');
    expect(ok(renameTrack(tracks, id, 'x'.repeat(40)))[1].name).toHaveLength(40);
    expect(err(renameTrack(tracks, id, 'x'.repeat(41)))).toMatch(/40/);
    expect(err(renameTrack(tracks, id, '   '))).toMatch(/name/i);
    expect(err(renameTrack(tracks, 'X9', 'B-roll'))).toBeTruthy();
    expect(renameTrack(tracks, id, ' Overlay 1 ')).toBe(tracks); // no change: the same array
    expect(tracks[1].name).toBe('Overlay 1');
  });

  it('moves an overlay track up or down among the overlay tracks; the main track stays the bottom', () => {
    const tracks = add(add(add(defaultTracks(), true), true), true);
    const [, a, b, c] = ids(tracks);
    expect(ids(ok(moveTrack(tracks, a, 1)))).toEqual([MAIN_VIDEO, b, a, c, MUSIC]);
    expect(ids(ok(moveTrack(tracks, c, -1)))).toEqual([MAIN_VIDEO, a, c, b, MUSIC]);
    expect(err(moveTrack(tracks, c, 1))).toMatch(/top/);
    expect(err(moveTrack(tracks, a, -1))).toMatch(/main video track/);
    expect(err(moveTrack(tracks, MAIN_VIDEO, 1))).toMatch(/main video track/);
    expect(err(moveTrack(tracks, MUSIC, -1))).toBeTruthy();
    expect(err(moveTrack(tracks, 'X9', 1))).toBeTruthy();
    expect(ids(tracks)).toEqual([MAIN_VIDEO, a, b, c, MUSIC]); // the input is left alone
  });

  it('deletes an overlay track with its clips; the main and music tracks can’t be deleted', () => {
    const tracks = add(add(defaultTracks()));
    const [, a, b] = ids(tracks);
    const clip = (id: string, track: string): TimedClip => ({
      id,
      track,
      start: 0,
      kind: 'photo',
      dur: 2,
      in: 0,
      out: 0,
    });
    const clips = [clip('m', MAIN_VIDEO), clip('x', a), clip('y', b), clip('z', a)];
    const r = ok(deleteTrack(tracks, clips, a));
    expect(ids(r.tracks)).toEqual([MAIN_VIDEO, b, MUSIC]);
    expect(r.clips.map((c) => c.id)).toEqual(['m', 'y']);
    expect(err(deleteTrack(tracks, clips, MAIN_VIDEO))).toMatch(/main video track/);
    expect(err(deleteTrack(tracks, clips, MUSIC))).toBeTruthy();
    expect(err(deleteTrack(tracks, clips, 'X9'))).toBeTruthy();
    // A locked track keeps its clips: unlock it first.
    expect(err(deleteTrack(patchTrack(tracks, a, { locked: true }), clips, a))).toMatch(/locked/);
  });

  it('mutes an overlay track (its clips’ sound), but the main track keeps Hide only', () => {
    const tracks = add(defaultTracks());
    const id = tracks[1].id;
    expect(patchTrack(tracks, id, { muted: true })[1]).toMatchObject({ muted: true, hidden: false });
    expect(patchTrack(tracks, id, { hidden: true })[1]).toMatchObject({ hidden: true, muted: false });
    expect(patchTrack(tracks, MAIN_VIDEO, { muted: true })).toBe(tracks);
  });
});

/* ---------- 203 T018: overlay tracks and transforms in the document and its gate (AC-11) ---------- */

describe('overlay tracks and transforms in the document (203 AC-11)', () => {
  // The mixed 2.x project (photo 3 s, video 4.5 s, photo 1.5 s, video 0.33 s; packed at 0, 3, 7.5, 9) with two
  // overlay tracks of transformed clips: the AC-6 picture (the dev fixture isn't importable here), as a document.
  const fixture = () => {
    const d = mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
    const [photo, video] = d.clips;
    const tracks: Track[] = [
      d.tracks[0],
      { id: 'O1', kind: 'overlay', name: 'Face cam', hidden: false, muted: false, locked: false },
      { id: 'O2', kind: 'overlay', name: 'Overlay 2', hidden: false, muted: true, locked: false },
      d.tracks[1],
    ];
    const free = { x: 0.3, y: 0.7, w: 0.5, rot: -12, opacity: 0.8, radius: 0.1 };
    const clips = [
      ...d.clips,
      { ...video, id: 'o1a', track: 'O1', start: 1, tf: presetTransform('top-right', 1920, 1080) },
      { ...video, id: 'o1b', track: 'O1', start: 6, tf: free },
      { ...photo, id: 'o2a', track: 'O2', start: 2, tf: presetTransform('bottom-left', 1920, 1080) },
      { ...photo, id: 'o2b', track: 'O2', start: 6 },
    ];
    return toDocument({ ...d, tracks, clips });
  };
  type Doc = ReturnType<typeof fixture>;
  const onTrack = (doc: Doc, id: string) => doc.clips.filter((c) => c.track === id);

  it('writes a transform only when it isn’t the identity, under the name transform', () => {
    const doc = fixture();
    expect(doc.clips.map((c) => [c.id, 'transform' in c, 'tf' in c])).toEqual([
      ...doc.clips.slice(0, 4).map((c) => [c.id, false, false]),
      ['o1a', true, false],
      ['o1b', true, false],
      ['o2a', true, false],
      ['o2b', false, false],
    ]);
    expect(doc.clips.find((c) => c.id === 'o1b')!.transform).toEqual({
      x: 0.3,
      y: 0.7,
      w: 0.5,
      rot: -12,
      opacity: 0.8,
      radius: 0.1,
    });
    // An identity transform in memory is not written either.
    const g = mergeProject(doc, true).doc;
    const same = toDocument({ ...g, clips: g.clips.map((c) => ({ ...c, tf: { ...IDENTITY } })) });
    expect(same.clips.some((c) => 'transform' in c)).toBe(false);
  });

  it('the AC-6 fixture: document → gate → document is equal, and the gate gives the clips their tf', () => {
    const doc = fixture();
    const text = JSON.stringify(doc);
    const once = mergeProject(JSON.parse(text), true);
    expect(once.dropped).toEqual([]);
    expect(once.doc.tracks.map((t) => [t.id, t.kind])).toEqual([
      [MAIN_VIDEO, 'video'],
      ['O1', 'overlay'],
      ['O2', 'overlay'],
      [MUSIC, 'audio'],
    ]);
    expect(once.doc.clips.find((c) => c.id === 'o1a')!.tf).toEqual(presetTransform('top-right', 1920, 1080));
    expect('tf' in once.doc.clips.find((c) => c.id === 'o2b')!).toBe(false);
    expect('transform' in once.doc.clips.find((c) => c.id === 'o1a')!).toBe(false);
    expect(toDocument(once.doc)).toEqual(doc);
    expect(JSON.stringify(toDocument(once.doc))).toBe(text);
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(once.doc))), true).doc).toEqual(once.doc);
  });

  it.each(fixtures)('%s: a 201 / 202 document round-trips byte-identical (no transform written)', (_, p) => {
    const first = mergeProject(legacyDoc(p), true).doc;
    for (const d of [first, { ...first, magnetic: false }]) {
      const text = JSON.stringify(toDocument(d));
      expect(text).not.toMatch(/"transform"|"tf"/);
      const back = mergeProject(JSON.parse(text), true);
      expect(back.dropped).toEqual([]);
      expect(JSON.stringify(toDocument(back.doc))).toBe(text);
    }
  });

  const tfOf = (fn: (t: Record<string, unknown>) => unknown) => (d: Doc) => ({
    ...d,
    clips: d.clips.map((c) => (c.id === 'o1a' ? { ...c, transform: fn({ ...c.transform }) } : c)),
  });
  const overlay = (i: number) => ({
    id: `O${i}`,
    kind: 'overlay',
    name: `Overlay ${i}`,
    hidden: false,
    muted: false,
    locked: false,
  });
  const startsOn = (track: string, starts: unknown[]) => (d: Doc) => {
    let k = 0;
    return { ...d, clips: d.clips.map((c) => (c.track === track ? { ...c, start: starts[k++] } : c)) };
  };
  type Gated = ReturnType<typeof mergeProject>;
  const clipOf = (r: Gated, id: string) => r.doc.clips.find((c) => c.id === id);
  const why = (r: Gated) => r.dropped.join(' ');
  const trackIds = (r: Gated) => r.doc.tracks.map((t) => t.id);
  const startsOf = (r: Gated, track: string) => onTrack(r.doc, track).map((c) => [c.id, c.start]);
  const TR = presetTransform('top-right', 1920, 1080);
  const UNREAD = /position and size couldn’t be read; it fills the frame/;
  const ADJUSTED = /position and size were out of range or incomplete and were adjusted/;
  const leftOut = (name: string) => `A project holds up to 4 picture and 4 sound tracks here; “${name}” was left out.`;
  /** o1a has no tf and the reason says its transform couldn't be read. */
  const unread = (r: Gated) => {
    expect('tf' in clipOf(r, 'o1a')!).toBe(false);
    expect(why(r)).toMatch(UNREAD);
  };
  /** o1a's tf has these fields (the rest of the top-right preset) and the reason says it was adjusted. */
  const adjusted = (fields: Partial<typeof IDENTITY>) => (r: Gated) => {
    expect(clipOf(r, 'o1a')!.tf).toEqual({ ...TR, ...fields });
    expect(r.dropped).toEqual([expect.stringMatching(ADJUSTED)]);
  };
  const bad: [string, (d: Doc) => unknown, (r: Gated) => void][] = [
    ['a transform that is text', tfOf(() => 'top-right'), unread],
    ['a transform that is an array', tfOf(() => [0.5, 0.5, 1]), unread],
    ['a transform that is null', tfOf(() => null), unread],
    ['a transform that is a number', tfOf(() => 3), unread],
    ['an empty transform', tfOf(() => ({})), unread],
    [
      'a transform with only a width',
      tfOf(() => ({ w: 0.3 })),
      (r) => {
        expect(clipOf(r, 'o1a')!.tf).toEqual({ ...IDENTITY, w: 0.3 });
        expect(why(r)).toMatch(ADJUSTED);
      },
    ],
    ['x and y far outside', tfOf((t) => ({ ...t, x: 1e9, y: -1e9 })), adjusted({ x: 1.5, y: -0.5 })],
    // JSON writes NaN and ±Infinity as null: those fields take the identity value.
    [
      'NaN and infinite fields',
      tfOf((t) => ({ ...t, x: NaN, w: Infinity, rot: -Infinity })),
      adjusted({ x: 0.5, w: 1 }),
    ],
    ['a width of 0', tfOf((t) => ({ ...t, w: 0 })), adjusted({ w: 0.05 })],
    ['a negative width', tfOf((t) => ({ ...t, w: -2 })), adjusted({ w: 0.05 })],
    ['a huge width', tfOf((t) => ({ ...t, w: 1e6 })), adjusted({ w: 4 })],
    ['a rotation of 720', tfOf((t) => ({ ...t, rot: 720 })), adjusted({ rot: 180 })],
    ['opacity 2', tfOf((t) => ({ ...t, opacity: 2 })), adjusted({ opacity: 1 })],
    ['a negative opacity', tfOf((t) => ({ ...t, opacity: -0.5 })), adjusted({ opacity: 0 })],
    ['a corner radius of 3', tfOf((t) => ({ ...t, radius: 3 })), adjusted({ radius: 0.5 })],
    ['fields as text', tfOf(() => ({ x: '0.2', y: '0.2', w: '0.3', rot: '0', opacity: '1', radius: '0' })), unread],
    [
      'fields of the wrong type',
      tfOf(() => ({ x: true, y: null, w: {}, rot: [], opacity: 'x', radius: false })),
      unread,
    ],
    [
      'unknown fields in a transform',
      tfOf((t) => ({ ...t, skew: 30, href: 'javascript:x' })),
      (r) => {
        expect(clipOf(r, 'o1a')!.tf).toEqual(TR);
        expect(r.dropped).toEqual([]);
      },
    ],
    [
      'an identity transform written out',
      tfOf(() => ({ ...IDENTITY })),
      (r) => {
        expect('tf' in clipOf(r, 'o1a')!).toBe(false);
        expect(r.dropped).toEqual([]);
      },
    ],
    [
      'a main track clip with a transform out of range',
      (d) => ({ ...d, clips: d.clips.map((c, i) => (i ? c : { ...c, transform: { x: 9, w: 9, opacity: 9 } })) }),
      (r) => {
        expect(r.doc.clips[0].tf).toEqual({ ...IDENTITY, x: 1.5, w: 4 });
        expect(why(r)).toMatch(ADJUSTED);
      },
    ],
    [
      'a tf field written instead of transform',
      (d) => ({ ...d, clips: d.clips.map((c) => ({ ...c, tf: 'x' })) }),
      (r) => {
        expect('tf' in r.doc.clips[0]).toBe(false);
        expect(clipOf(r, 'o1a')!.tf).toEqual(TR);
        expect(r.dropped).toEqual([]);
      },
    ],
    [
      '12 overlay tracks (beyond the limit), clips on the last',
      (d) => ({
        ...d,
        tracks: [d.tracks[0], ...Array.from({ length: 12 }, (_, i) => overlay(i + 1)), d.tracks.at(-1)],
        clips: d.clips.map((c) => (c.id === 'o2b' ? { ...c, track: 'O12' } : c)),
      }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        for (let i = 4; i <= 12; i++) expect(r.dropped).toContain(leftOut(`Overlay ${i}`));
        expect(clipOf(r, 'o2b')).toBeUndefined();
        expect(r.dropped).toContain('A clip on a missing or sound track was left out.');
      },
    ],
    [
      'two overlay tracks with the same id',
      (d) => ({ ...d, tracks: [d.tracks[0], d.tracks[1], { ...d.tracks[2], id: 'O1' }, d.tracks[3]] }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', MUSIC]);
        expect(r.doc.tracks[1].name).toBe('Face cam');
        expect(clipOf(r, 'o2a')).toBeUndefined();
        expect(why(r)).toMatch(/track was unreadable.*missing or sound track/);
      },
    ],
    [
      'an overlay track with a bad id',
      (d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === 'O2' ? { ...t, id: '<O2>' } : t)) }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', MUSIC]);
        expect(onTrack(r.doc, 'O2')).toEqual([]);
        expect(why(r)).toMatch(/track was unreadable.*missing or sound track/);
      },
    ],
    [
      'an overlay track turned into sound',
      (d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === 'O1' ? { ...t, kind: 'audio' } : t)) }),
      (r) => {
        expect(r.doc.tracks.find((t) => t.id === 'O1')!.kind).toBe('audio');
        expect(clipOf(r, 'o1a')).toBeUndefined();
        expect(clipOf(r, 'o1b')).toBeUndefined();
        expect(r.dropped).toEqual(Array(2).fill('A clip on a missing or sound track was left out.'));
      },
    ],
    [
      'a clip on a missing overlay track',
      (d) => ({ ...d, clips: [...d.clips, { ...d.clips[4], id: 'x', track: 'O9' }] }),
      (r) => {
        expect(clipOf(r, 'x')).toBeUndefined();
        expect(r.dropped).toEqual(['A clip on a missing or sound track was left out.']);
      },
    ],
    [
      'the overlay tracks gone: their clips are left out',
      (d) => ({ ...d, tracks: [d.tracks[0], d.tracks[3]] }),
      (r) => {
        expect(r.doc.clips.map((c) => c.track)).toEqual(Array(4).fill(MAIN_VIDEO));
        expect(r.dropped).toEqual(Array(4).fill('A clip on a missing or sound track was left out.'));
      },
    ],
    [
      'two overlay clips at the same start',
      startsOn('O1', [1, 1]),
      (r) => {
        expect(startsOf(r, 'O1')).toEqual([
          ['o1a', 1],
          ['o1b', 5.5],
        ]);
        expect(r.dropped).toEqual(['Two clips overlapped on the Face cam track; one was moved to after the other.']);
      },
    ],
    [
      'an overlay clip inside another',
      startsOn('O1', [1, 2]),
      (r) => {
        expect(startsOf(r, 'O1')).toEqual([
          ['o1a', 1],
          ['o1b', 5.5],
        ]);
        expect(why(r)).toMatch(/overlapped on the Face cam track/);
      },
    ],
    [
      'overlay clips out of order',
      startsOn('O2', [6, 2]),
      (r) => {
        expect(startsOf(r, 'O2')).toEqual([
          ['o2b', 2],
          ['o2a', 6],
        ]);
        expect(r.dropped).toEqual([]);
      },
    ],
    [
      'three overlay clips all at 0',
      (d) => {
        const z = startsOn('O1', [0, 0])(d);
        return { ...z, clips: [...z.clips, { ...d.clips[4], id: 'o1c', start: 0, transform: undefined }] };
      },
      (r) => {
        expect(startsOf(r, 'O1')).toEqual([
          ['o1a', 0],
          ['o1b', 4.5],
          ['o1c', 9],
        ]);
        expect(r.dropped).toEqual(
          Array(2).fill('Two clips overlapped on the Face cam track; one was moved to after the other.'),
        );
      },
    ],
    [
      'overlapping overlay clips with Magnetic off',
      (d) => ({ ...startsOn('O2', [2, 3])(d), magnetic: false }),
      (r) => {
        expect(r.doc.magnetic).toBe(false);
        expect(startsOf(r, 'O2')).toEqual([
          ['o2a', 2],
          ['o2b', 5],
        ]);
        expect(why(r)).toMatch(/overlapped on the Overlay 2 track/);
      },
    ],
    [
      'a negative start on an overlay clip',
      startsOn('O1', [-3, 6]),
      (r) => {
        expect(startsOf(r, 'O1')).toEqual([
          ['o1a', 0],
          ['o1b', 6],
        ]);
        expect(r.dropped).toEqual([]);
      },
    ],
    [
      'a start as text on an overlay clip',
      startsOn('O2', ['2', 6]),
      (r) => {
        expect(startsOf(r, 'O2')).toEqual([
          ['o2a', 0],
          ['o2b', 6],
        ]);
        expect(r.dropped).toEqual([]);
      },
    ],
    [
      'too many clips across tracks',
      (d) => ({
        ...d,
        clips: Array.from({ length: 90 }, (_, i) => ({ ...d.clips[4], id: `c${i}`, track: ['V1', 'O1', 'O2'][i % 3] })),
      }),
      (r) => {
        expect(r.doc.clips).toHaveLength(60);
        expect(r.dropped[0]).toBe('A project holds up to 60 clips here; 30 were left out.');
        for (const t of [MAIN_VIDEO, 'O1', 'O2']) expect(onTrack(r.doc, t)).toHaveLength(20);
      },
    ],
    [
      'a second track of kind video',
      (d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === 'O1' ? { ...t, id: 'V2', kind: 'video' } : t)) }),
      (r) => {
        expect(r.doc.tracks.find((t) => t.id === 'V2')!.kind).toBe('overlay');
        expect(r.dropped[0]).toBe('The “Face cam” track became an overlay track: a project has one main video track.');
      },
    ],
    [
      'the main track listed above the overlays',
      (d) => ({ ...d, tracks: [d.tracks[1], d.tracks[2], d.tracks[0], d.tracks[3]] }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', 'O2', MUSIC]);
        expect(r.dropped).toEqual(['The main video track was moved below the overlay tracks.']);
      },
    ],
    [
      'the sound track listed first',
      (d) => ({ ...d, tracks: [d.tracks[3], d.tracks[1], d.tracks[0], d.tracks[2]] }),
      (r) => {
        expect(trackIds(r)).toEqual([MUSIC, MAIN_VIDEO, 'O1', 'O2']);
        expect(r.dropped).toEqual(['The main video track was moved below the overlay tracks.']);
      },
    ],
    [
      'no main track, overlays kept',
      (d) => ({ ...d, tracks: d.tracks.slice(1) }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', 'O2', MUSIC]);
        expect(r.doc.clips).toHaveLength(8);
      },
    ],
    [
      'no main track and the picture tracks full',
      (d) => ({ ...d, tracks: [overlay(1), overlay(2), overlay(3), overlay(4), d.tracks[3]] }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        expect(r.dropped).toEqual([leftOut('Overlay 4')]);
      },
    ],
    [
      'the picture tracks full with the main track listed last',
      (d) => ({ ...d, tracks: [overlay(1), overlay(2), overlay(3), overlay(4), d.tracks[0], d.tracks[3]] }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        expect(r.dropped).toEqual([leftOut('Overlay 4'), 'The main video track was moved below the overlay tracks.']);
      },
    ],
    [
      'the picture tracks full with the main track listed first',
      (d) => ({ ...d, tracks: [d.tracks[0], overlay(1), overlay(2), overlay(3), overlay(4), d.tracks[3]] }),
      (r) => {
        expect(trackIds(r)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        expect(r.dropped).toEqual([leftOut('Overlay 4')]);
      },
    ],
    [
      'the main track muted',
      (d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === MAIN_VIDEO ? { ...t, muted: true } : t)) }),
      (r) => {
        expect(r.doc.tracks[0].muted).toBe(false);
        expect(r.doc.tracks.find((t) => t.id === 'O2')!.muted).toBe(true);
      },
    ],
    [
      'overlay track switches and name of the wrong type',
      (d) => ({
        ...d,
        tracks: d.tracks.map((t) => (t.id === 'O1' ? { ...t, name: 42, hidden: 'yes', muted: 1, locked: 'no' } : t)),
      }),
      (r) => {
        expect(r.doc.tracks[1]).toEqual({
          id: 'O1',
          kind: 'overlay',
          name: 'Overlay',
          hidden: false,
          muted: false,
          locked: false,
        });
      },
    ],
    [
      'an overlay track name of 500 characters',
      (d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === 'O2' ? { ...t, name: 'n'.repeat(500) } : t)) }),
      (r) => expect(r.doc.tracks[2].name).toBe('n'.repeat(40)),
    ],
    [
      'overlay clips moved past the length limit',
      (d) => ({
        ...d,
        kind: 'reel',
        format: 'reel',
        clips: [
          d.clips[0],
          ...Array.from({ length: 19 }, (_, i) => ({ ...d.clips[0], id: `p${i}`, track: 'O1', start: 0, dur: 10 })),
        ],
      }),
      (r) => {
        // A web reel is 90 s at most: the clips moved to 90 s and later go.
        expect(onTrack(r.doc, 'O1').map((c) => c.start)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
        expect(r.dropped.filter((m) => /didn’t fit within/.test(m))).toEqual([
          '10 clips didn’t fit within the 90-second limit and were left out.',
        ]);
      },
    ],
  ];

  it(`has ${bad.length} malformed documents (at least 30)`, () => expect(bad.length).toBeGreaterThanOrEqual(30));

  it.each(bad)('%s: a valid project, never an exception', (_, make, check) => {
    expect(() => mergeProject(make(fixture()), false)).not.toThrow();
    let out: ReturnType<typeof mergeProject> | undefined;
    expect(() => (out = mergeProject(JSON.parse(JSON.stringify(make(fixture()))), false))).not.toThrow();
    check(out!);
    const { doc } = out!;
    expect(doc.version).toBe(1);
    const pictures = doc.tracks.filter((t) => t.kind !== 'audio');
    // The main track is the bottom picture track, the only one of kind video; the rest are overlays.
    expect(pictures[0]?.id).toBe(MAIN_VIDEO);
    expect(pictures[0].muted).toBe(false);
    expect(pictures.slice(1).every((t) => t.kind === 'overlay')).toBe(true);
    expect(pictures.length).toBeLessThanOrEqual(TRACK_LIMITS(false).visual);
    expect(doc.tracks.find((t) => t.id === MUSIC)?.kind).toBe('audio');
    expect(new Set(doc.tracks.map((t) => t.id)).size).toBe(doc.tracks.length);
    const lim = limitsFor(doc.kind, false);
    expect(doc.clips.length).toBeLessThanOrEqual(lim.clips);
    for (const c of doc.clips) {
      expect(pictures.some((t) => t.id === c.track)).toBe(true);
      expect(Number.isFinite(c.start) && c.start >= 0 && c.start < lim.seconds).toBe(true);
      expect('transform' in c).toBe(false);
      if ('tf' in c) {
        expect(isIdentity(c.tf)).toBe(false);
        expect(clampTransform(c.tf)).toEqual(c.tf);
      }
    }
    // Every picture track in start order without overlaps.
    for (const t of pictures) {
      const on = onTrack(doc, t.id);
      for (let i = 1; i < on.length; i++)
        expect(on[i].start, `${t.id} ${on[i].id}`).toBeGreaterThanOrEqual(
          on[i - 1].start + clipLength(on[i - 1]) - 1e-6,
        );
    }
    expect(new Set(doc.clips.map((c) => c.id)).size).toBe(doc.clips.length);
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(doc))), false).doc).toEqual(doc);
  });

  const gate = (make: (d: Doc) => unknown) => mergeProject(JSON.parse(JSON.stringify(make(fixture()))), true);

  it('clamps a transform out of range, and says so', () => {
    const r = gate(tfOf((t) => ({ ...t, w: 9, opacity: -1, rot: 400 })));
    expect(r.doc.clips.find((c) => c.id === 'o1a')!.tf).toMatchObject({ w: 4, opacity: 0, rot: 180 });
    expect(r.dropped.join(' ')).toMatch(/position and size/i);
    const junk = gate(tfOf(() => 'top-right'));
    expect('tf' in junk.doc.clips.find((c) => c.id === 'o1a')!).toBe(false);
    expect(junk.dropped.join(' ')).toMatch(/position and size/i);
    // An identity transform is fine as it is: no tf, nothing to say.
    const id = gate(tfOf(() => ({ ...IDENTITY })));
    expect(id.dropped).toEqual([]);
    expect('tf' in id.doc.clips.find((c) => c.id === 'o1a')!).toBe(false);
  });

  it('drops a clip on a missing track with a reason', () => {
    const r = gate((d) => ({ ...d, clips: [...d.clips, { ...d.clips[4], id: 'x', track: 'O9' }] }));
    expect(r.doc.clips.some((c) => c.id === 'x')).toBe(false);
    expect(r.dropped.join(' ')).toMatch(/missing.*track/);
  });

  it('moves an overlapping overlay clip to the end of the one it overlaps, never dropping it (202 D3)', () => {
    // O1: two 4.5 s video clips; the second starts at 2, inside the first (1–5.5): it moves to 5.5.
    const r = gate(startsOn('O1', [1, 2]));
    expect(onTrack(r.doc, 'O1').map((c) => [c.id, c.start])).toEqual([
      ['o1a', 1],
      ['o1b', 5.5],
    ]);
    expect(r.dropped).toEqual(['Two clips overlapped on the Face cam track; one was moved to after the other.']);
    // Out of order on O2 is only sorted; Magnetic on still packs the main track.
    const sorted = gate(startsOn('O2', [6, 2]));
    expect(onTrack(sorted.doc, 'O2').map((c) => [c.id, c.start])).toEqual([
      ['o2b', 2],
      ['o2a', 6],
    ]);
    expect(sorted.dropped).toEqual([]);
    // Equal starts keep the document's order, each after the one before.
    const all = gate(startsOn('O1', [0, 0]));
    expect(onTrack(all.doc, 'O1').map((c) => [c.id, c.start])).toEqual([
      ['o1a', 0],
      ['o1b', 4.5],
    ]);
    expect(all.doc.clips).toHaveLength(fixture().clips.length);
  });

  it('a non-main track of kind video becomes an overlay track', () => {
    const r = gate((d) => ({ ...d, tracks: d.tracks.map((t) => (t.id === 'O1' ? { ...t, kind: 'video' } : t)) }));
    expect(r.doc.tracks.find((t) => t.id === 'O1')!.kind).toBe('overlay');
    expect(onTrack(r.doc, 'O1')).toHaveLength(2);
    expect(r.dropped.join(' ')).toMatch(/Face cam.*overlay/);
  });

  it('puts the main track first among the picture tracks: nothing is drawn under it', () => {
    const r = gate((d) => ({ ...d, tracks: [d.tracks[1], d.tracks[0], d.tracks[2], d.tracks[3]] }));
    expect(r.doc.tracks.map((t) => t.id)).toEqual([MAIN_VIDEO, 'O1', 'O2', MUSIC]);
    expect(r.dropped.join(' ')).toMatch(/main video track/);
    expect(r.doc.clips).toHaveLength(fixture().clips.length);
  });

  it('keeps overlay tracks within the limit, and their clips go with a reason', () => {
    const f = fixture();
    const r = mergeProject(
      {
        ...f,
        tracks: [f.tracks[0], ...Array.from({ length: 6 }, (_, i) => overlay(i + 1)), f.tracks[3]],
        clips: f.clips.map((c) => (c.id === 'o2b' ? { ...c, track: 'O6' } : c)),
      },
      false,
    );
    expect(r.doc.tracks.map((t) => t.id)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
    expect(r.doc.clips.some((c) => c.id === 'o2b')).toBe(false);
    expect(r.dropped).toEqual([
      leftOut('Overlay 4'),
      leftOut('Overlay 5'),
      leftOut('Overlay 6'),
      'A clip on a missing or sound track was left out.',
    ]);
  });

  it('toDocument never writes a transform out of range', () => {
    const g = mergeProject(fixture(), true).doc;
    const wild = { x: 9, y: -9, w: 0, rot: 999, opacity: 7, radius: -1 };
    const out = toDocument({ ...g, clips: g.clips.map((c) => (c.id === 'o1a' ? { ...c, tf: wild } : c)) });
    expect(out.clips.find((c) => c.id === 'o1a')!.transform).toEqual(clampTransform(wild));
  });
});

/* ---------- 203 T020: the sound of overlay clips (AC-8, AC-10, Q7) ---------- */

describe('overlay clips’ sound in the export (203 AC-8, Q7)', () => {
  type SC = TimedClip & { volume: number };
  const video = (id: string, track: string, start: number, from: number, len: number, volume: number): SC => ({
    id,
    track,
    start,
    kind: 'video',
    in: from,
    out: from + len,
    dur: 0,
    volume,
  });
  const still = (id: string, track: string, start: number, len: number): SC => ({
    id,
    track,
    start,
    kind: 'photo',
    in: 0,
    out: 0,
    dur: len,
    volume: 0,
  });
  const overlay = (id: string, patch: Partial<Track> = {}): Track => ({
    id,
    kind: 'overlay',
    name: id,
    hidden: false,
    muted: false,
    locked: false,
    ...patch,
  });
  // V1: a 0–4 (video), p 4–6 (photo), b 6–9 (video). O1: x 1–3, q 4–5 (photo), y 5–7 (volume 0). O2: z 2–3.5.
  // The music plays from 2 s into the song to the end (9 s).
  const fixture = (o1: Partial<Track> = {}, o2: Partial<Track> = {}, main: Partial<Track> = {}): Project<SC> => ({
    tracks: [
      { ...defaultTracks()[0], ...main },
      overlay('O1', o1),
      overlay('O2', o2),
      defaultTracks()[1],
    ],
    clips: [
      video('a', MAIN_VIDEO, 0, 1, 4, 0.8),
      still('p', MAIN_VIDEO, 4, 2),
      video('b', MAIN_VIDEO, 6, 0, 3, 1),
      video('x', 'O1', 1, 5, 2, 0.5),
      still('q', 'O1', 4, 1),
      video('y', 'O1', 5, 0, 2, 0),
      video('z', 'O2', 2, 0, 1.5, 1),
    ],
    audio: [{ id: 'music', track: MUSIC, start: 0, in: 2, volume: 0.6, toEnd: true, srcDur: 60 }],
    layers: [],
    fadeOut: false,
  });
  const cut = (ref: string, start: number, end: number, from: number, volume: number) => ({
    ref,
    start,
    end,
    from,
    volume,
    fadeIn: 0.03,
    fadeOut: 0.03,
  });
  const music = { ref: 'music', start: 0, end: 9, from: 2, volume: 0.6, fadeIn: 0, fadeOut: 1.5 };

  it('mixes each overlay video clip’s own sound at its volume, after the main track’s clips, with the same ramps', () => {
    expect(audioPlan(fixture())).toEqual([
      cut('a', 0, 4, 1, 0.8),
      cut('b', 6, 9, 0, 1),
      cut('x', 1, 3, 5, 0.5),
      cut('z', 2, 3.5, 0, 1),
      music,
    ]);
  });

  it('a muted overlay track adds nothing', () => {
    const all = audioPlan(fixture());
    expect(audioPlan(fixture({}, { muted: true }))).toEqual(all.filter((s) => s.ref !== 'z'));
    expect(audioPlan(fixture({ muted: true }))).toEqual(all.filter((s) => s.ref !== 'x'));
    const bare = fixture();
    expect(audioPlan(fixture({ muted: true }, { muted: true }))).toEqual(
      audioPlan({ ...bare, clips: bare.clips.filter((c) => c.track === MAIN_VIDEO) }),
    );
  });

  it('a hidden overlay track keeps its sound (Hide is pictures); so does the hidden main track (201 D2)', () => {
    const all = audioPlan(fixture());
    expect(audioPlan(fixture({ hidden: true }))).toEqual(all);
    expect(audioPlan(fixture({ hidden: true }, { hidden: true }, { hidden: true }))).toEqual(all);
    expect(audioPlan(fixture({ hidden: true, muted: true }))).toEqual(all.filter((s) => s.ref !== 'x'));
  });

  it.each(fixtures)('%s: overlay tracks without sound leave the 2.x sound sources unchanged (AC-10)', (_, p) => {
    const tp = onTracks(p);
    const [main, ...rest] = tp.tracks;
    const empty = { ...tp, tracks: [main, overlay('O1'), ...rest] };
    expect(audioPlan(empty)).toEqual(legacyAudioPlan(p));
    const silent = {
      ...tp,
      tracks: [main, overlay('O1', { muted: true }), overlay('O2'), ...rest],
      // A clip on a muted track and a clip at volume 0: the pictures differ, the sound mustn't.
      clips: [
        ...tp.clips,
        ...([video('m', 'O1', 0, 0, 1, 1), video('n', 'O2', 0, 0, 1, 0)] as unknown as typeof tp.clips),
      ],
    };
    expect(audioPlan(silent)).toEqual(legacyAudioPlan(p));
  });
});

/* ---------- 205 T014: keyframes in the document and its gate (AC-4) ---------- */

describe('keyframes in the document (205 AC-4)', () => {
  const k = (t: number, v: number, ease: Ease = 'ease-in-out'): Keyframe => ({ t, v, ease });
  const layer = (id: string, keys?: unknown): Layer =>
    ({ ...newSticker('⭐'), id, start: 1, end: 4, ...(keys !== undefined ? { keys } : {}) }) as Layer;
  /** The mixed 2.x project with its first video clip and a sticker layer animated. */
  const fixture = () => {
    const d = mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
    const clips = d.clips.map((c) =>
      c.kind === 'video' && c.id === d.clips.find((x) => x.kind === 'video')!.id
        ? {
            ...c,
            keys: {
              x: [k(0, 0.2, 'linear'), k(1.5, 0.8)],
              opacity: [k(0, 1), k(2, 0, 'hold')],
              volume: [k(0.5, 1), k(1, 0.25, 'ease-out')],
            },
          }
        : c,
    );
    // Through the layers' gate, so its fields are in the order the gate writes them.
    const layers = mergeLayers([layer('L1', { y: [k(0, 1.2), k(0.5, 0.5, 'ease-in')], rot: [k(0, -90)] })]);
    return toDocument({ ...d, clips, layers });
  };
  type Doc = ReturnType<typeof fixture>;
  type Gated = ReturnType<typeof mergeProject>;
  const animatedId = (d: Doc) => d.clips.find((c) => c.keys)!.id;
  const keysOf = (r: Gated, d: Doc) => r.doc.clips.find((c) => c.id === animatedId(d))!.keys;
  const layerKeys = (r: Gated) => r.doc.layers.find((l) => l.id === 'L1')?.keys;
  const why = (r: Gated) => r.dropped.join(' ');
  const UNREAD = /Some keyframes couldn’t be read and were left out/;
  const ADJUSTED = /Some keyframe values were out of range and were adjusted/;
  const EASE = /Some keyframes had an unknown interpolation and now ease in and out/;
  const SAME = /Some keyframes were at the same time; the last of each was kept/;
  const PER_VALUE = /A value can have at most 100 keyframes; the rest were left out/;
  const PER_PROJECT = /A project can have at most 5,000 keyframes; the rest were left out/;

  /** The animated clip's keys replaced by `keys`. */
  const clipKeys = (keys: unknown) => (d: Doc) => ({
    ...d,
    clips: d.clips.map((c) => (c.id === animatedId(d) ? { ...c, keys } : c)),
  });
  /** The animated clip's x keys replaced by `list`. */
  const xKeys = (list: unknown) => (d: Doc) => clipKeys({ ...d.clips.find((c) => c.keys)!.keys, x: list })(d);
  const layerWith = (keys: unknown) => (d: Doc) => ({ ...d, layers: [layer('L1', keys)] });

  /** The clip has no keys and the reason says they couldn't be read. */
  const noKeys = (r: Gated, d: Doc) => {
    expect('keys' in r.doc.clips.find((c) => c.id === animatedId(d))!).toBe(false);
    expect(why(r)).toMatch(UNREAD);
  };
  /** The clip's x keys are `list`, its other keys as written, and the only reasons match `reasons`. */
  const xIs =
    (list: Keyframe[] | undefined, ...reasons: RegExp[]) =>
    (r: Gated, d: Doc) => {
      const keys = keysOf(r, d)!;
      expect(keys.x).toEqual(list);
      expect(keys.opacity).toEqual([k(0, 1), k(2, 0, 'hold')]);
      expect(r.dropped).toEqual(reasons.map((re) => expect.stringMatching(re)));
    };

  const bad: [string, (d: Doc) => unknown, (r: Gated, d: Doc) => void][] = [
    ['keys that are text', clipKeys('x'), noKeys],
    ['keys that are an array', clipKeys([k(0, 1)]), noKeys],
    ['keys that are null', clipKeys(null), noKeys],
    ['keys that are a number', clipKeys(7), noKeys],
    [
      'empty keys',
      clipKeys({}),
      (r, d) => {
        expect('keys' in r.doc.clips.find((c) => c.id === animatedId(d))!).toBe(false);
        expect(r.dropped).toEqual([]);
      },
    ],
    ['a value whose keys are a number', xKeys(3), xIs(undefined, UNREAD)],
    ['a value whose keys are an object', xKeys({ t: 0, v: 1 }), xIs(undefined, UNREAD)],
    ['every key of a value unreadable', xKeys([1, 'a', null]), xIs(undefined, UNREAD)],
    ['a key that is a number', xKeys([3, k(1, 0.4)]), xIs([k(1, 0.4)], UNREAD)],
    ['a time as text', xKeys([{ t: '0', v: 0.2, ease: 'linear' }, k(1, 0.4)]), xIs([k(1, 0.4)], UNREAD)],
    // JSON writes NaN and ±Infinity as null.
    ['a value that was NaN', xKeys([{ t: 0, v: null, ease: 'linear' }, k(1, 0.4)]), xIs([k(1, 0.4)], UNREAD)],
    ['a time that was infinite', xKeys([{ t: null, v: 0.2, ease: 'linear' }, k(1, 0.4)]), xIs([k(1, 0.4)], UNREAD)],
    ['a key without a value', xKeys([{ t: 0, ease: 'linear' }, k(1, 0.4)]), xIs([k(1, 0.4)], UNREAD)],
    ['a time beyond a day', xKeys([k(1e9, 0.2), k(1, 0.4)]), xIs([k(1, 0.4)], UNREAD)],
    // Before the clip's start: kept (a start trim leaves keys outside the clip, AC-3).
    ['a key before the start', xKeys([k(-2, 0.2), k(1, 0.4)]), xIs([k(-2, 0.2), k(1, 0.4)])],
    ['a value out of range', xKeys([k(0, 9), k(1, -9)]), xIs([k(0, 1.5), k(1, -0.5)], ADJUSTED)],
    [
      'an opacity of 3 and a volume of −1',
      clipKeys({ opacity: [k(0, 3)], volume: [k(0, -1)] }),
      (r, d) => {
        expect(keysOf(r, d)).toEqual({ opacity: [k(0, 1)], volume: [k(0, 0)] });
        expect(r.dropped).toEqual([expect.stringMatching(ADJUSTED)]);
      },
    ],
    ['an unknown interpolation', xKeys([k(0, 0.2, 'bounce' as Ease), k(1, 0.4)]), xIs([k(0, 0.2), k(1, 0.4)], EASE)],
    ['a missing interpolation', xKeys([{ t: 0, v: 0.2 }, k(1, 0.4)]), xIs([k(0, 0.2), k(1, 0.4)], EASE)],
    ['an interpolation of the wrong type', xKeys([{ t: 0, v: 0.2, ease: 3 }]), xIs([k(0, 0.2)], EASE)],
    ['keys out of order are sorted', xKeys([k(2, 0.6), k(0, 0.2), k(1, 0.4)]), xIs([k(0, 0.2), k(1, 0.4), k(2, 0.6)])],
    [
      'equal times keep the last',
      xKeys([k(1, 0.4), k(0, 0.2), k(1, 0.9, 'hold')]),
      xIs([k(0, 0.2), k(1, 0.9, 'hold')], SAME),
    ],
    [
      'extra fields in a key are not kept',
      xKeys([{ t: 0, v: 0.2, ease: 'linear', href: 'javascript:x', tangent: 3 }]),
      xIs([k(0, 0.2, 'linear')]),
    ],
    [
      'an unknown value name',
      clipKeys({ skew: [k(0, 1)], x: [k(0, 0.2)] }),
      (r, d) => {
        expect(keysOf(r, d)).toEqual({ x: [k(0, 0.2)] });
        expect(why(r)).toMatch(UNREAD);
      },
    ],
    [
      'a __proto__ value name',
      (d) => JSON.parse(JSON.stringify(clipKeys({ MARK: [], x: [k(0, 0.2)] })(d)).replace('"MARK"', '"__proto__"')),
      (r, d) => {
        const keys = keysOf(r, d)!;
        expect(Object.keys(keys)).toEqual(['x']);
        expect(Object.getPrototypeOf(keys)).toBe(Object.prototype);
        expect(why(r)).toMatch(UNREAD);
      },
    ],
    [
      '150 keys on one value',
      xKeys(Array.from({ length: 150 }, (_, i) => k(149 - i, 0.5))),
      xIs(
        Array.from({ length: 100 }, (_, i) => k(i, 0.5)),
        PER_VALUE,
      ),
    ],
    [
      'more than 5,000 keys in the project',
      (d) => {
        const full = (props: string[]) =>
          Object.fromEntries(props.map((p) => [p, Array.from({ length: 100 }, (_, i) => k(i, 0.5))]));
        const clipProps = ['x', 'y', 'w', 'rot', 'opacity', 'radius', 'volume'];
        return {
          ...d,
          // 4 clips × 700 + 30 layers × 500 = 17,800 keys.
          clips: d.clips.map((c) => ({ ...c, keys: full(clipProps) })),
          layers: Array.from({ length: 30 }, (_, i) => layer(`L${i}`, full(['x', 'y', 'w', 'rot', 'opacity']))),
        };
      },
      (r) => {
        const total =
          r.doc.clips.reduce((n, c) => n + countKeys(c.keys), 0) + r.doc.layers.reduce((n, l) => n + countKeys(l.keys), 0);
        expect(total).toBe(5000);
        expect(r.doc.layers).toHaveLength(30);
        expect(r.dropped.filter((s) => PER_PROJECT.test(s))).toHaveLength(1);
      },
    ],
    [
      'layer keys that are text',
      layerWith('fly-in'),
      (r) => {
        expect(r.doc.layers.map((l) => l.id)).toEqual(['L1']);
        expect(layerKeys(r)).toBeUndefined();
        expect(why(r)).toMatch(UNREAD);
      },
    ],
    [
      'volume and radius on a layer',
      layerWith({ volume: [k(0, 1)], radius: [k(0, 0.2)], x: [k(0, 0.3)] }),
      (r) => {
        expect(layerKeys(r)).toEqual({ x: [k(0, 0.3)] });
        expect(why(r)).toMatch(UNREAD);
      },
    ],
    [
      'layer values out of the layers’ ranges',
      layerWith({ w: [k(0, 0)], rot: [k(0, 400)] }),
      (r) => {
        expect(layerKeys(r)).toEqual({ w: [k(0, 0.01)], rot: [k(0, 360)] });
        expect(r.dropped).toEqual([expect.stringMatching(ADJUSTED)]);
      },
    ],
  ];

  it('has at least 25 malformed documents', () => expect(bad.length).toBeGreaterThanOrEqual(25));

  it.each(bad)('%s: never throws, keeps what it can and says why', (_, make, check) => {
    const d = fixture();
    let r: Gated | undefined;
    expect(() => (r = mergeProject(JSON.parse(JSON.stringify(make(d))), true))).not.toThrow();
    check(r!, d);
  });

  it('writes keys only where there are some, and round-trips document → gate → document equal', () => {
    const doc = fixture();
    expect(doc.clips.map((c) => 'keys' in c)).toEqual(doc.clips.map((c) => c.id === animatedId(doc)));
    const text = JSON.stringify(doc);
    const once = mergeProject(JSON.parse(text), true);
    expect(once.dropped).toEqual([]);
    expect(keysOf(once, doc)).toEqual(doc.clips.find((c) => c.keys)!.keys);
    expect(layerKeys(once)).toEqual({ y: [k(0, 1.2), k(0.5, 0.5, 'ease-in')], rot: [k(0, -90)] });
    expect(toDocument(once.doc)).toEqual(doc);
    expect(JSON.stringify(toDocument(once.doc))).toBe(text);
  });

  it('does not write empty or missing keys', () => {
    const d = mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
    const text = JSON.stringify(toDocument(d));
    expect(JSON.stringify(toDocument({ ...d, clips: d.clips.map((c) => ({ ...c, keys: {} })) }))).toBe(text);
    expect(JSON.stringify(toDocument({ ...d, clips: d.clips.map((c) => ({ ...c, keys: undefined })) }))).toBe(text);
  });

  it.each(fixtures)('%s: a 201 / 202 document without keys stays byte-identical', (_, p) => {
    const first = mergeProject(legacyDoc(p), true).doc;
    const text = JSON.stringify(toDocument(first));
    expect(text).not.toMatch(/"keys"/);
    const back = mergeProject(JSON.parse(text), true);
    expect(back.dropped).toEqual([]);
    expect(JSON.stringify(toDocument(back.doc))).toBe(text);
  });
});
