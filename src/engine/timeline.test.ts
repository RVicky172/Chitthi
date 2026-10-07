import { describe, expect, it } from 'vitest';
import {
  MAIN_VIDEO,
  MUSIC,
  TRACK_LIMITS,
  audioPlan,
  defaultTracks,
  framePlan,
  fromSequence,
  gaps,
  lockedReason,
  mergeProject,
  pack,
  patchTrack,
  projectLength,
  toDocument,
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
