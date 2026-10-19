import { describe, expect, it } from 'vitest';
import type { Transition } from '@/engine/transitions';
import {
  clampTransform,
  clipLength,
  framePlan,
  gaps,
  IDENTITY,
  isIdentity,
  pack,
  presetTransform,
  projectLength,
  videoAt,
  type AudioClip,
  type Project,
  type TimedClip,
} from '@/engine/timeline';
import {
  MAIN_VIDEO,
  MUSIC,
  TRACK_LIMITS,
  addTrack,
  defaultTracks,
  deleteTrack,
  lockedReason,
  moveTrack,
  patchTrack,
  renameTrack,
  tooManyTracks,
  type Track,
} from '@/engine/tracks';
import { audioPlan } from '@/engine/soundPlan';
import { RAMP_PRESETS, SOUND_SPEEDS, soundMuted, type SpeedFields } from '@/engine/speed';
import { fromSequence, toDocument } from '@/engine/projectDoc';
import { mergeProject } from '@/engine/projectGate';
import {
  legacyAudioPlan,
  legacyClipAt,
  legacyDoc,
  legacyFixtures,
  legacyFramePlan,
  legacyTimeline,
  legacyTotal,
  type LegacyClip,
  type LegacyProject,
} from '../../support/timeline.testkit';
import { countKeys, type Ease, type Keyframe } from '@/engine/keyframes';
import { mergeLayers } from '@/engine/layerGate';
import { newSticker, type Layer } from '@/engine/layers';
import { limitsFor } from '@/engine/videoFormats';
import { defined } from '../../support/defined';
import { codeUnitOrder } from '../../support/codeUnitOrder';
import { seededRandom } from '../../support/seededRandom';

/**
 * A 2.x project on tracks, built by hand (fromSequence is tested on its own, with the document).
 * @param project the 2.x project
 * @returns the project on tracks
 */
function onTracks(project: LegacyProject): Project<LegacyClip & TimedClip> {
  const clips = pack(project.clips.map((clip) => ({ ...clip, track: MAIN_VIDEO, start: 0 })));
  const audio: AudioClip[] = project.music
    ? [
        {
          id: 'music',
          track: MUSIC,
          start: 0,
          in: project.music.offset,
          volume: project.music.volume,
          toEnd: true,
          srcDur: project.music.dur,
        },
      ]
    : [];
  return { tracks: defaultTracks(), clips, audio, layers: project.layers, fadeOut: project.fadeOut };
}

/**
 * 1,000 seeded times from just before 0 to past the end, plus every clip boundary ± 1 µs.
 * @param project the 2.x project
 * @returns the times
 */
function times(project: LegacyProject): number[] {
  const total = legacyTotal(project.clips);
  const rnd = seededRandom(7);
  const out = [-1, 0, total, total + 3];
  for (const placed of legacyTimeline(project.clips))
    out.push(placed.start, placed.end, placed.start - 1e-6, placed.start + 1e-6, placed.end - 1e-6);
  for (let index = 0; index < 1000; index++) out.push(-0.5 + rnd() * (total + 1));
  return out;
}

const fixtures = Object.entries(legacyFixtures());

describe('the track model gives the 2.x answers for every 2.x project', () => {
  it.each(fixtures)('%s: starts and length', (_, project) => {
    const tp = onTracks(project);
    const ref = legacyTimeline(project.clips);
    // Bit-identical starts: the same additions in the same order.
    expect(tp.clips.map((clip) => clip.start)).toEqual(ref.map((placed) => placed.start));
    expect(projectLength(tp)).toBe(legacyTotal(project.clips));
  });

  it.each(fixtures)('%s: the frame at any time', (_, project) => {
    const tp = onTracks(project);
    const ref = legacyTimeline(project.clips);
    for (const time of times(project)) {
      const want = legacyClipAt(ref, time);
      const got = videoAt(tp, time);
      expect(got?.clip.id, `t = ${time}`).toBe(want?.clip.id);
      if (want) expect(got?.local, `t = ${time}`).toBe(time - want.start);
    }
  });

  it.each(fixtures)('%s: the export’s frames at 30 and 60 fps', (_, project) => {
    const tp = onTracks(project);
    for (const fps of [30, 60])
      expect(
        framePlan(tp, fps).map((span) => ({ id: span.clip?.id, f0: span.f0, f1: span.f1, start: span.start })),
        `${fps} fps`,
      ).toEqual(legacyFramePlan(project, fps));
  });

  it.each(fixtures)(
    '%s: the paused frame (videoAt) is the export’s at every frame, hair edges included',
    (name, project) => {
      const tp = onTracks(project);
      for (const fps of [30, 60]) {
        let hairs = 0;
        for (const span of framePlan(tp, fps))
          for (let index = span.f0; index < span.f1; index++) {
            const got = videoAt(tp, index / fps);
            expect(got?.clip, `${fps} fps, frame ${index}`).toBe(span.clip ?? undefined);
            // A start summed in floating point a hair after the frame's time: exact edges would pick the earlier clip.
            if (span.clip && index / fps < span.clip.start) hairs++;
          }
        if (name === 'tinyClips' || name === 'clips500') expect(hairs, `${fps} fps`).toBeGreaterThan(0);
      }
    },
  );

  it.each(fixtures)('%s: the export’s sound', (_, project) => {
    expect(audioPlan(onTracks(project))).toEqual(legacyAudioPlan(project));
  });
});

describe('tracks', () => {
  const project = legacyFixtures().mixed;

  it('every project starts with one video track and one music track', () => {
    expect(defaultTracks()).toEqual([
      { id: MAIN_VIDEO, kind: 'video', name: 'Video', hidden: false, muted: false, locked: false },
      { id: MUSIC, kind: 'audio', name: 'Music', hidden: false, muted: false, locked: false },
    ]);
  });

  it('a hidden video track draws no clip (black with layers) but keeps the length and the clips’ sound', () => {
    const tp = onTracks({ ...project, music: { offset: 1, volume: 0.5, dur: 60 } });
    const hidden = {
      ...tp,
      tracks: tp.tracks.map((track) => (track.id === MAIN_VIDEO ? { ...track, hidden: true } : track)),
    };
    expect(projectLength(hidden)).toBe(projectLength(tp));
    for (const time of [-1, 0, 2, projectLength(tp)]) expect(videoAt(hidden, time)).toBeNull();
    const frames = framePlan(hidden, 30);
    expect(frames).toEqual([{ clip: null, f0: 0, f1: Math.round(projectLength(tp) * 30), start: 0 }]);
    expect(audioPlan(hidden)).toEqual(audioPlan(tp));
  });

  it('a muted music track leaves the music out; the clips’ sound stays', () => {
    const tp = onTracks({ ...project, music: { offset: 1, volume: 0.5, dur: 60 } });
    const muted = { ...tp, tracks: tp.tracks.map((track) => (track.id === MUSIC ? { ...track, muted: true } : track)) };
    expect(audioPlan(muted)).toEqual(audioPlan(tp).filter((source) => source.ref !== 'music'));
    expect(audioPlan(tp).some((source) => source.ref === 'music')).toBe(true);
  });

  it('a locked track changes nothing in the picture or the sound', () => {
    const tp = onTracks(project);
    const locked = { ...tp, tracks: tp.tracks.map((track) => ({ ...track, locked: true })) };
    expect(framePlan(locked, 30)).toEqual(framePlan(tp, 30));
    expect(audioPlan(locked)).toEqual(audioPlan(tp));
  });

  it('pack only places the main video track and keeps every other field', () => {
    const clips = pack([
      { id: 'a', kind: 'photo' as const, dur: 2, in: 0, out: 0, track: MAIN_VIDEO, start: 9 },
      { id: 'b', kind: 'photo' as const, dur: 1, in: 0, out: 0, track: 'O1', start: 4.25 },
      { id: 'c', kind: 'video' as const, dur: 0, in: 1, out: 3, track: MAIN_VIDEO, start: 0 },
    ]);
    expect(clips.map((clip) => [clip.id, clip.start])).toEqual([
      ['a', 0],
      ['b', 4.25],
      ['c', 2],
    ]);
    expect(clips[2]).toMatchObject({ kind: 'video', in: 1, out: 3 });
  });

  it('track limits: 8 + 8 in the desktop app, 4 picture + 8 sound in the browser (208 D2)', () => {
    expect(TRACK_LIMITS(true)).toEqual({ visual: 8, audio: 8 });
    expect(TRACK_LIMITS(false)).toEqual({ visual: 4, audio: 8 });
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
    expect(tracks.every((track) => !track.hidden && !track.muted && !track.locked)).toBe(true); // the input is left alone
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
      for (let index = 1; index < plan.length; index++) expect(plan[index].f0).toBe(plan[index - 1].f1);
      expect(defined(plan.at(-1)).f1).toBe(8 * fps);
      expect(plan.map((span) => span.clip?.id ?? null)).toEqual(['a', null, 'b', null, 'c']);
    }
    const gap = framePlan(withGaps, 30)[1];
    expect(gap).toEqual({ clip: null, f0: 60, f1: 105, start: 2 });
    expect(gap.f1 - gap.f0).toBe(45); // 1.5 s at 30 fps (spec AC-4)
    expect(framePlan(lateStart, 30)[0]).toEqual({ clip: null, f0: 0, f1: 30, start: 0 });
  });

  it('is silent from the video track in a gap, while the music plays on through it (AC-4)', () => {
    const music = { id: 'music', track: MUSIC, start: 0, in: 0, volume: 0.8, toEnd: true, srcDur: 20 };
    const plan = audioPlan({
      ...withGaps,
      clips: withGaps.clips.map((timedClip) => ({ ...timedClip, volume: 1 })),
      audio: [music],
    });
    const own = plan.filter((source) => source.ref !== 'music');
    expect(own.map((source) => source.ref)).toEqual(['c']);
    for (const gap of gaps(withGaps, MAIN_VIDEO))
      for (const source of own) expect(source.end <= gap.start || source.start >= gap.end).toBe(true);
    expect(plan.find((source) => source.ref === 'music')).toMatchObject({ start: 0, end: 8, from: 0 });
  });
});

/* ---------- T014: the document, the 2.x migration and the gate ---------- */

describe('the 2.x project becomes tracks (fromSequence)', () => {
  it.each(fixtures)('%s: one video track back to back, one music track', (_, project) => {
    const tp = fromSequence({
      clips: project.clips,
      music: project.music && { ...project.music, media: 'msong' },
      layers: project.layers,
      fadeOut: project.fadeOut,
    });
    expect(tp.tracks).toEqual(defaultTracks());
    expect(tp.clips.map((clip) => [clip.id, clip.track, clip.start])).toEqual(
      legacyTimeline(project.clips).map((placed) => [placed.clip.id, MAIN_VIDEO, placed.start]),
    );
    expect(tp.clips.map(({ track: _t, start: _s, ...rest }) => rest)).toEqual(project.clips);
    expect(tp.audio).toEqual(
      project.music
        ? [
            {
              id: 'music',
              track: MUSIC,
              start: 0,
              in: project.music.offset,
              volume: project.music.volume,
              toEnd: true,
              srcDur: project.music.dur,
              media: 'msong',
            },
          ]
        : [],
    );
    expect(tp.layers).toBe(project.layers);
    expect(tp.fadeOut).toBe(project.fadeOut);
  });
});

describe('the project document (toDocument, mergeProject)', () => {
  it.each(fixtures)('%s: 2.x document → version 1 → JSON → the gate: unchanged, and 2.x’s placement', (_, project) => {
    const first = mergeProject(JSON.parse(JSON.stringify(legacyDoc(project))), true);
    expect(first.dropped).toEqual([]);
    expect(first.doc.version).toBe(1);
    expect(first.doc.clips.map((clip) => clip.start)).toEqual(
      legacyTimeline(project.clips).map((placed) => placed.start),
    );
    expect(projectLength(first.doc)).toBe(legacyTotal(project.clips));
    const again = mergeProject(JSON.parse(JSON.stringify(toDocument(first.doc))), true);
    expect(again.dropped).toEqual([]);
    expect(again.doc).toEqual(first.doc);
    expect(
      framePlan(again.doc, 30).map((span) => ({ id: span.clip?.id, f0: span.f0, f1: span.f1, start: span.start })),
    ).toEqual(legacyFramePlan(project, 30));
    expect(audioPlan(again.doc)).toEqual(legacyAudioPlan(project));
  });

  it('a document keeps only what a project is: no blobs, URLs, thumbnails or unknown fields', () => {
    const { doc } = mergeProject(legacyDoc(legacyFixtures().mixed), true);
    const withJunk = {
      ...doc,
      clips: doc.clips.map((clip) => ({ ...clip, url: 'blob:x', thumb: 'data:', strip: ['a'], still: {}, file: {} })),
      extra: 1,
    };
    const out = toDocument(withJunk);
    expect(Object.keys(out).sort(codeUnitOrder)).toEqual([
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
    expect(Object.keys(out.clips[0]).sort(codeUnitOrder)).toEqual([
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
    ['an unknown version', (doc) => ({ ...doc, version: 7 })],
    ['a version as text', (doc) => ({ ...doc, version: '1' })],
    ['clips not an array', (doc) => ({ ...doc, clips: 'x' })],
    ['a clip that is null', (doc) => ({ ...doc, clips: [null, ...doc.clips] })],
    [
      'NaN start',
      (doc) => ({ ...doc, clips: doc.clips.map((clip, index) => (index ? clip : { ...clip, start: NaN })) }),
    ],
    [
      'Infinity duration',
      (doc) => ({
        ...doc,
        clips: doc.clips.map((clip) => (clip.kind === 'photo' ? { ...clip, dur: Infinity } : clip)),
      }),
    ],
    [
      'negative duration',
      (doc) => ({ ...doc, clips: doc.clips.map((clip) => (clip.kind === 'photo' ? { ...clip, dur: -2 } : clip)) }),
    ],
    ['huge start', (doc) => ({ ...doc, clips: doc.clips.map((clip) => ({ ...clip, start: 1e300 })) })],
    [
      'in ≥ out',
      (doc) => ({
        ...doc,
        clips: doc.clips.map((clip) => (clip.kind === 'video' ? { ...clip, in: 5, out: 5 } : clip)),
      }),
    ],
    [
      'out past the source',
      (doc) => ({ ...doc, clips: doc.clips.map((clip) => (clip.kind === 'video' ? { ...clip, out: 1e6 } : clip)) }),
    ],
    [
      'negative in',
      (doc) => ({ ...doc, clips: doc.clips.map((clip) => (clip.kind === 'video' ? { ...clip, in: -4 } : clip)) }),
    ],
    [
      'an unknown track',
      (doc) => ({ ...doc, clips: doc.clips.map((clip, index) => (index ? clip : { ...clip, track: 'V9' })) }),
    ],
    [
      'a clip on the music track',
      (doc) => ({ ...doc, clips: doc.clips.map((clip, index) => (index ? clip : { ...clip, track: MUSIC })) }),
    ],
    ['missing media', (doc) => ({ ...doc, media: doc.media.slice(1) })],
    [
      'media of the wrong kind',
      (doc) => ({
        ...doc,
        media: doc.media.map((media) => (media.kind === 'photo' ? { ...media, kind: 'video' } : media)),
      }),
    ],
    ['duplicate clip ids', (doc) => ({ ...doc, clips: doc.clips.map((clip) => ({ ...clip, id: 'same' })) })],
    [
      'a bad clip id',
      (doc) => ({ ...doc, clips: doc.clips.map((clip, index) => (index ? clip : { ...clip, id: '<b>' })) }),
    ],
    [
      '600 clips',
      (doc) => ({
        ...doc,
        kind: 'reel',
        format: 'reel',
        clips: Array.from({ length: 600 }, (_, index) => ({ ...doc.clips[0], id: `c${index}` })),
      }),
    ],
    [
      '20 picture tracks',
      (doc) => ({
        ...doc,
        tracks: [
          ...doc.tracks,
          ...Array.from({ length: 20 }, (_, index) => ({
            id: `O${index}`,
            kind: 'overlay',
            name: 'O',
            hidden: false,
            muted: false,
            locked: false,
          })),
        ],
      }),
    ],
    ['no tracks', (doc) => ({ ...doc, tracks: [] })],
    [
      'the main track turned into audio',
      (doc) => ({
        ...doc,
        tracks: doc.tracks.map((track) => (track.id === MAIN_VIDEO ? { ...track, kind: 'audio' } : track)),
      }),
    ],
    [
      'a track of an unknown kind',
      (doc) => ({
        ...doc,
        tracks: [...doc.tracks, { id: 'X1', kind: 'subtitle', name: 'X', hidden: false, muted: false, locked: false }],
      }),
    ],
    [
      'a bad edit',
      (doc) => ({
        ...doc,
        clips: doc.clips.map((clip) => ({ ...clip, edit: { zoom: 'max', rot: 45, adjust: 'warm', masks: 'm' } })),
      }),
    ],
    [
      'a bad motion and volume',
      (doc) => ({ ...doc, clips: doc.clips.map((clip) => ({ ...clip, motion: 'spin', volume: 9, fade: 'yes' })) }),
    ],
    ['bad layers', (doc) => ({ ...doc, layers: [{ kind: 'video' }, 3, null] })],
    ['bad settings', (doc) => ({ ...doc, kind: 'tv', format: 'yt8k', fps: 120, quality: 'ultra', fadeOut: 'no' })],
    [
      'music on a picture track',
      (doc) => ({
        ...doc,
        audio: [{ id: 'music', track: MAIN_VIDEO, start: 0, in: 0, volume: 1, toEnd: true, srcDur: 9, media: 'x' }],
      }),
    ],
    [
      'music with NaN volume and negative offset',
      (doc) => ({ ...doc, audio: doc.audio.map((audio) => ({ ...audio, volume: NaN, in: -3 })) }),
    ],
    ['2.x music that is a string', (doc) => ({ clips: doc.clips, music: 'song', layers: [], media: doc.media })],
    ['a 2.x clip list of junk', () => ({ clips: [1, 'a', { kind: 'photo' }], music: null, layers: [] })],
    ['Magnetic off, clips out of order', (doc) => ({ ...doc, magnetic: false, clips: doc.clips.slice().reverse() })],
    [
      'Magnetic off, every clip at 0',
      (doc) => ({ ...doc, magnetic: false, clips: doc.clips.map((clip) => ({ ...clip, start: 0 })) }),
    ],
    [
      'Magnetic off, starts as text',
      (doc) => ({ ...doc, magnetic: false, clips: doc.clips.map((clip) => ({ ...clip, start: '2' })) }),
    ],
    [
      'Magnetic off, a negative start',
      (doc) => ({ ...doc, magnetic: false, clips: doc.clips.map((clip) => ({ ...clip, start: -5 })) }),
    ],
    ['Magnetic as text', (doc) => ({ ...doc, magnetic: 'off' })],
    [
      'Magnetic off, a clip inside another',
      (doc) => ({
        ...doc,
        magnetic: false,
        clips: doc.clips.map((clip, index) => (index === 2 ? { ...clip, start: 3.5 } : clip)),
      }),
    ],
  ];

  it(`has ${bad.length} malformed documents (at least 30)`, () => expect(bad.length).toBeGreaterThanOrEqual(30));

  it.each(bad)('%s: a valid project, never an exception', (_, make) => {
    const projectDoc = good();
    let out: ReturnType<typeof mergeProject> | undefined;
    expect(() => (out = mergeProject(make(projectDoc), false))).not.toThrow();
    const { doc } = defined(out);
    expect(doc.version).toBe(1);
    // Valid by its own rules: tracks, clips, times, limits; and a second pass changes nothing.
    expect(doc.tracks.find((track) => track.id === MAIN_VIDEO)?.kind).toBe('video');
    expect(doc.tracks.find((track) => track.id === MUSIC)?.kind).toBe('audio');
    expect(doc.tracks.filter((track) => track.kind !== 'audio').length).toBeLessThanOrEqual(TRACK_LIMITS(false).visual);
    expect(doc.clips.length).toBeLessThanOrEqual(60);
    for (const clip of doc.clips) {
      expect(doc.tracks.some((listed) => listed.id === clip.track && listed.kind !== 'audio')).toBe(true);
      const docMedia = doc.media.find((x) => x.id === clip.media);
      expect(docMedia?.kind).toBe(clip.kind);
      expect(Number.isFinite(clip.start) && clip.start >= 0).toBe(true);
      if (clip.kind === 'video')
        expect(0 <= clip.in && clip.in < clip.out && clip.out <= defined(docMedia).srcDur).toBe(true);
      else expect(Number.isFinite(clip.dur) && clip.dur >= 0).toBe(true);
    }
    expect(new Set(doc.clips.map((clip) => clip.id)).size).toBe(doc.clips.length);
    for (const docAudio of doc.audio)
      expect(doc.tracks.find((listed) => listed.id === docAudio.track)?.kind).toBe('audio');
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(doc))), false).doc).toEqual(doc);
  });

  it('says why it dropped or changed something', () => {
    const doc = good();
    expect(mergeProject({ ...doc, version: 7 }, true).dropped.join(' ')).toMatch(/newer|version/i);
    expect(mergeProject({ ...doc, media: doc.media.slice(1) }, true).dropped.join(' ')).toMatch(/media/i);
    expect(
      mergeProject(
        { ...doc, clips: doc.clips.map((clip, index) => (index ? clip : { ...clip, track: 'V9' })) },
        true,
      ).dropped.join(' '),
    ).toMatch(/track/i);
    expect(mergeProject(null, true).dropped).toHaveLength(1);
  });
});

describe('Magnetic in the document (202)', () => {
  // mixed: photo 3 s, video 4.5 s, photo 1.5 s, video 0.33 s; packed at 0, 3, 7.5, 9.
  const good = () => mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
  const starts = (raw: unknown) => mergeProject(raw, true).doc.clips.map((clip) => clip.start);

  it('missing means on: packed, and written as on', () => {
    const projectDoc = good();
    expect(projectDoc.magnetic).toBe(true);
    expect(toDocument(projectDoc).magnetic).toBe(true);
    const noField = Object.fromEntries(Object.entries(toDocument(projectDoc)).filter(([key]) => key !== 'magnetic'));
    expect(
      starts({ ...noField, clips: projectDoc.clips.map((clip, index) => ({ ...clip, start: index * 10 })) }),
    ).toEqual([0, 3, 7.5, 9]);
    expect(mergeProject({ ...noField }, true).doc.magnetic).toBe(true);
  });
  it('only false switches it off; on packs a document with gaps', () => {
    const projectDoc = good();
    expect(mergeProject({ ...projectDoc, magnetic: 'off' }, true).doc.magnetic).toBe(true);
    expect(mergeProject({ ...projectDoc, magnetic: 0 }, true).doc.magnetic).toBe(true);
    expect(
      starts({
        ...projectDoc,
        magnetic: true,
        clips: projectDoc.clips.map((clip, index) => ({ ...clip, start: index * 10 })),
      }),
    ).toEqual([0, 3, 7.5, 9]);
  });
  it('off keeps the gaps, and goes through the gate unchanged', () => {
    const loose = { ...good(), magnetic: false };
    const spaced = { ...loose, clips: loose.clips.map((clip, index) => ({ ...clip, start: 1 + index * 10 })) };
    const once = mergeProject(JSON.parse(JSON.stringify(toDocument(spaced))), true);
    expect(once.dropped).toEqual([]);
    expect(once.doc.magnetic).toBe(false);
    expect(once.doc.clips.map((clip) => clip.start)).toEqual([1, 11, 21, 31]);
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(once.doc))), true).doc).toEqual(once.doc);
  });
  it('off sorts the clips by start', () => {
    const loose = { ...good(), magnetic: false };
    const out = mergeProject(
      { ...loose, clips: loose.clips.map((clip, index) => ({ ...clip, start: 40 - index * 10 })) },
      true,
    );
    expect(out.doc.clips.map((clip) => clip.start)).toEqual([10, 20, 30, 40]);
    expect(out.dropped).toEqual([]);
  });
  it('off moves an overlapping clip to the end of the clip it overlaps, with a reason (D3)', () => {
    const loose = { ...good(), magnetic: false };
    // The second clip (4.5 s) starts at 2, inside the first (0–3): it moves to 3.
    const one = mergeProject(
      { ...loose, clips: loose.clips.map((clip, index) => ({ ...clip, start: [0, 2, 20, 30][index] })) },
      true,
    );
    expect(one.doc.clips.map((clip) => clip.start)).toEqual([0, 3, 20, 30]);
    expect(one.dropped.join(' ')).toMatch(/overlapped/);
    // All at 0: each goes after the one before (the order of the document kept for equal starts).
    const all = mergeProject({ ...loose, clips: loose.clips.map((clip) => ({ ...clip, start: 0 })) }, true);
    expect(all.doc.clips.map((clip) => clip.start)).toEqual([0, 3, 7.5, 9]);
    expect(all.doc.clips.map((clip) => clip.id)).toEqual(loose.clips.map((clip) => clip.id));
    expect(all.dropped).toHaveLength(3);
  });
});

/* ---------- 203 T010: the clip transform ---------- */

describe('the clip transform (203 AC-4)', () => {
  it('identity is the whole frame, and a clip without a transform is at identity', () => {
    expect(IDENTITY).toEqual({ x: 0.5, y: 0.5, w: 1, rot: 0, opacity: 1, radius: 0 });
    expect(isIdentity()).toBe(true);
    expect(isIdentity({ ...IDENTITY })).toBe(true);
    for (const key of Object.keys(IDENTITY) as (keyof typeof IDENTITY)[])
      expect(isIdentity({ ...IDENTITY, [key]: IDENTITY[key] + 0.01 }), key).toBe(false);
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
    const margin = 0.04 * W;
    const box = (entry: Parameters<typeof presetTransform>[0]) => {
      const transform = presetTransform(entry, W, H);
      expect(transform).toMatchObject({ w: 0.35, rot: 0, opacity: 1, radius: 0 });
      const bw = transform.w * W,
        bh = transform.w * H;
      return {
        left: transform.x * W - bw / 2,
        right: W - (transform.x * W + bw / 2),
        top: transform.y * H - bh / 2,
        bottom: H - (transform.y * H + bh / 2),
      };
    };
    const tl = box('top-left'),
      tr = box('top-right'),
      bl = box('bottom-left'),
      br = box('bottom-right');
    for (const [corner, near] of [
      [tl, ['left', 'top']],
      [tr, ['right', 'top']],
      [bl, ['left', 'bottom']],
      [br, ['right', 'bottom']],
    ] as const)
      for (const side of near) expect(corner[side], side).toBeCloseTo(margin, 6);
    // Inside the frame, on the far sides too.
    for (const corner of [tl, tr, bl, br]) for (const value of Object.values(corner)) expect(value).toBeGreaterThan(0);
    // The numbers, worked out by hand.
    const left = presetTransform('top-left', W, H);
    expect(left.x).toBeCloseTo(0.215, 9);
    expect(left.y).toBeCloseTo(0.175 + (0.04 * W) / H, 9);
  });
});

/* ---------- 203 T010: adding, renaming, moving and deleting tracks ---------- */

describe('overlay tracks (203 AC-1, AC-2)', () => {
  const ids = (ts: Track[]) => ts.map((track) => track.id);
  const add = (ts: Track[], desktop = false): Track[] => {
    const added = addTrack(ts, desktop);
    if ('error' in added) throw new Error(added.error);
    return added.tracks;
  };
  const ok = <T>(result: T | { error: string }): T => {
    if (result && typeof result === 'object' && 'error' in result) throw new Error(result.error);
    return result;
  };
  const err = (result: unknown) =>
    result && typeof result === 'object' && 'error' in result ? (result as { error: string }).error : null;

  it('adds an empty overlay track at the top of the picture tracks, named Overlay 1, 2 …', () => {
    const tracks = defaultTracks();
    const added = addTrack(tracks, false);
    if ('error' in added) throw new Error(added.error);
    expect(added.tracks).toHaveLength(3);
    const track = defined(added.tracks.find((listed) => listed.id === added.id));
    expect(track).toMatchObject({ kind: 'overlay', name: 'Overlay 1', hidden: false, muted: false, locked: false });
    expect(track.id).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
    // Drawing order, bottom first: the main track, the new overlay, then the sound tracks.
    expect(ids(added.tracks)).toEqual([MAIN_VIDEO, added.id, MUSIC]);
    expect(tracks).toEqual(defaultTracks()); // the input is left alone
    const two = add(added.tracks);
    expect(two.map((listed) => listed.name)).toEqual(['Video', 'Overlay 1', 'Overlay 2', 'Music']);
    expect(new Set(ids(two)).size).toBe(4);
  });

  it('names a new track with the lowest free number, and ids stay unique', () => {
    const three = add(add(add(defaultTracks(), true), true), true);
    const o2 = defined(three.find((track) => track.name === 'Overlay 2'));
    const gone = ok(deleteTrack(three, [], o2.id)).tracks;
    const again = add(gone, true);
    expect(again.map((track) => track.name)).toEqual(['Video', 'Overlay 1', 'Overlay 3', 'Overlay 2', 'Music']);
    expect(new Set(ids(again)).size).toBe(again.length);
    // A renamed track frees its number.
    const renamed = ok(renameTrack(three, three[1].id, 'Face cam')).tracks;
    expect(defined(add(renamed, true).at(-2)).name).toBe('Overlay 1');
  });

  it('is refused at the picture track limit with the message the button shows: 4 on the web, 8 on desktop', () => {
    let web = defaultTracks();
    for (let index = 0; index < 3; index++) web = add(web);
    expect(web.filter((track) => track.kind !== 'audio')).toHaveLength(TRACK_LIMITS(false).visual);
    expect(err(addTrack(web, false))).toBe(tooManyTracks(false));
    expect(tooManyTracks(false)).toMatch(/\b4\b/);
    expect(tooManyTracks(false)).toMatch(/desktop app.*\b8\b/);
    let desk = web;
    for (let index = 0; index < 4; index++) desk = add(desk, true);
    expect(desk.filter((track) => track.kind !== 'audio')).toHaveLength(TRACK_LIMITS(true).visual);
    expect(err(addTrack(desk, true))).toBe(tooManyTracks(true));
    expect(tooManyTracks(true)).toMatch(/\b8\b/);
    expect(tooManyTracks(true)).not.toMatch(/desktop app/);
  });

  it('renames a track: trimmed, 1–40 characters', () => {
    const tracks = add(defaultTracks());
    const id = tracks[1].id;
    expect(ok(renameTrack(tracks, id, '  Face cam  ')).tracks[1].name).toBe('Face cam');
    expect(ok(renameTrack(tracks, id, 'x'.repeat(40))).tracks[1].name).toHaveLength(40);
    expect(err(renameTrack(tracks, id, 'x'.repeat(41)))).toMatch(/40/);
    expect(err(renameTrack(tracks, id, '   '))).toMatch(/name/i);
    expect(err(renameTrack(tracks, 'X9', 'B-roll'))).toBeTruthy();
    expect(ok(renameTrack(tracks, id, ' Overlay 1 ')).tracks).toBe(tracks); // no change: the same array
    expect(tracks[1].name).toBe('Overlay 1');
  });

  it('moves an overlay track up or down among the overlay tracks; the main track stays the bottom', () => {
    const tracks = add(add(add(defaultTracks(), true), true), true);
    const [, first, second, third] = ids(tracks);
    expect(ids(ok(moveTrack(tracks, first, 1)).tracks)).toEqual([MAIN_VIDEO, second, first, third, MUSIC]);
    expect(ids(ok(moveTrack(tracks, third, -1)).tracks)).toEqual([MAIN_VIDEO, first, third, second, MUSIC]);
    expect(err(moveTrack(tracks, third, 1))).toMatch(/top/);
    expect(err(moveTrack(tracks, first, -1))).toMatch(/main video track/);
    expect(err(moveTrack(tracks, MAIN_VIDEO, 1))).toMatch(/main video track/);
    expect(err(moveTrack(tracks, MUSIC, -1))).toBeTruthy();
    expect(err(moveTrack(tracks, 'X9', 1))).toBeTruthy();
    expect(ids(tracks)).toEqual([MAIN_VIDEO, first, second, third, MUSIC]); // the input is left alone
  });

  it('deletes an overlay track with its clips; the main and music tracks can’t be deleted', () => {
    const tracks = add(add(defaultTracks()));
    const [, first, second] = ids(tracks);
    const clip = (id: string, track: string): TimedClip => ({
      id,
      track,
      start: 0,
      kind: 'photo',
      dur: 2,
      in: 0,
      out: 0,
    });
    const clips = [clip('m', MAIN_VIDEO), clip('x', first), clip('y', second), clip('z', first)];
    const deleted = ok(deleteTrack(tracks, clips, first));
    expect(ids(deleted.tracks)).toEqual([MAIN_VIDEO, second, MUSIC]);
    expect(deleted.clips.map((timedClip) => timedClip.id)).toEqual(['m', 'y']);
    expect(err(deleteTrack(tracks, clips, MAIN_VIDEO))).toMatch(/main video track/);
    expect(err(deleteTrack(tracks, clips, MUSIC))).toBeTruthy();
    expect(err(deleteTrack(tracks, clips, 'X9'))).toBeTruthy();
    // A locked track keeps its clips: unlock it first.
    expect(err(deleteTrack(patchTrack(tracks, first, { locked: true }), clips, first))).toMatch(/locked/);
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
    const projectDoc = mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
    const [photo, video] = projectDoc.clips;
    const tracks: Track[] = [
      projectDoc.tracks[0],
      { id: 'O1', kind: 'overlay', name: 'Face cam', hidden: false, muted: false, locked: false },
      { id: 'O2', kind: 'overlay', name: 'Overlay 2', hidden: false, muted: true, locked: false },
      projectDoc.tracks[1],
    ];
    const free = { x: 0.3, y: 0.7, w: 0.5, rot: -12, opacity: 0.8, radius: 0.1 };
    const clips = [
      ...projectDoc.clips,
      { ...video, id: 'o1a', track: 'O1', start: 1, tf: presetTransform('top-right', 1920, 1080) },
      { ...video, id: 'o1b', track: 'O1', start: 6, tf: free },
      { ...photo, id: 'o2a', track: 'O2', start: 2, tf: presetTransform('bottom-left', 1920, 1080) },
      { ...photo, id: 'o2b', track: 'O2', start: 6 },
    ];
    return toDocument({ ...projectDoc, tracks, clips });
  };
  type Doc = ReturnType<typeof fixture>;
  const onTrack = (doc: Doc, id: string) => doc.clips.filter((clip) => clip.track === id);

  it('writes a transform only when it isn’t the identity, under the name transform', () => {
    const doc = fixture();
    expect(doc.clips.map((clip) => [clip.id, 'transform' in clip, 'tf' in clip])).toEqual([
      ...doc.clips.slice(0, 4).map((clip) => [clip.id, false, false]),
      ['o1a', true, false],
      ['o1b', true, false],
      ['o2a', true, false],
      ['o2b', false, false],
    ]);
    expect(defined(doc.clips.find((clip) => clip.id === 'o1b')).transform).toEqual({
      x: 0.3,
      y: 0.7,
      w: 0.5,
      rot: -12,
      opacity: 0.8,
      radius: 0.1,
    });
    // An identity transform in memory is not written either.
    const projectDoc = mergeProject(doc, true).doc;
    const same = toDocument({
      ...projectDoc,
      clips: projectDoc.clips.map((clip) => ({ ...clip, tf: { ...IDENTITY } })),
    });
    expect(same.clips.some((clip) => 'transform' in clip)).toBe(false);
  });

  it('the AC-6 fixture: document → gate → document is equal, and the gate gives the clips their tf', () => {
    const doc = fixture();
    const text = JSON.stringify(doc);
    const once = mergeProject(JSON.parse(text), true);
    expect(once.dropped).toEqual([]);
    expect(once.doc.tracks.map((track) => [track.id, track.kind])).toEqual([
      [MAIN_VIDEO, 'video'],
      ['O1', 'overlay'],
      ['O2', 'overlay'],
      [MUSIC, 'audio'],
    ]);
    expect(defined(once.doc.clips.find((clip) => clip.id === 'o1a')).tf).toEqual(
      presetTransform('top-right', 1920, 1080),
    );
    expect('tf' in defined(once.doc.clips.find((clip) => clip.id === 'o2b'))).toBe(false);
    expect('transform' in defined(once.doc.clips.find((clip) => clip.id === 'o1a'))).toBe(false);
    expect(toDocument(once.doc)).toEqual(doc);
    expect(JSON.stringify(toDocument(once.doc))).toBe(text);
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(once.doc))), true).doc).toEqual(once.doc);
  });

  it.each(fixtures)('%s: a 201 / 202 document round-trips byte-identical (no transform written)', (_, project) => {
    const first = mergeProject(legacyDoc(project), true).doc;
    for (const projectDoc of [first, { ...first, magnetic: false }]) {
      const text = JSON.stringify(toDocument(projectDoc));
      expect(text).not.toMatch(/"transform"|"tf"/);
      const back = mergeProject(JSON.parse(text), true);
      expect(back.dropped).toEqual([]);
      expect(JSON.stringify(toDocument(back.doc))).toBe(text);
    }
  });

  const tfOf = (change: (t: Record<string, unknown>) => unknown) => (doc: Doc) => ({
    ...doc,
    clips: doc.clips.map((clip) => (clip.id === 'o1a' ? { ...clip, transform: change({ ...clip.transform }) } : clip)),
  });
  const overlay = (index: number) => ({
    id: `O${index}`,
    kind: 'overlay',
    name: `Overlay ${index}`,
    hidden: false,
    muted: false,
    locked: false,
  });
  const startsOn = (track: string, starts: unknown[]) => (doc: Doc) => {
    let step = 0;
    return {
      ...doc,
      clips: doc.clips.map((clip) => (clip.track === track ? { ...clip, start: starts[step++] } : clip)),
    };
  };
  type Gated = ReturnType<typeof mergeProject>;
  const clipOf = (project: Gated, id: string) => project.doc.clips.find((clip) => clip.id === id);
  const why = (project: Gated) => project.dropped.join(' ');
  const trackIds = (project: Gated) => project.doc.tracks.map((track) => track.id);
  const startsOf = (project: Gated, track: string) => onTrack(project.doc, track).map((clip) => [clip.id, clip.start]);
  const TR = presetTransform('top-right', 1920, 1080);
  const UNREAD = /position and size couldn’t be read; it fills the frame/;
  const ADJUSTED = /position and size were out of range or incomplete and were adjusted/;
  const leftOut = (name: string) => `A project holds up to 4 picture and 8 sound tracks here; “${name}” was left out.`;
  /**
   * o1a has no tf and the reason says its transform couldn't be read.
   * @param project the gated document
   */
  const unread = (project: Gated) => {
    expect('tf' in defined(clipOf(project, 'o1a'))).toBe(false);
    expect(why(project)).toMatch(UNREAD);
  };
  /**
   * o1a's tf has these fields (the rest of the top-right preset) and the reason says it was adjusted.
   * @param fields the fields expected
   * @returns the check for a gated document
   */
  const adjusted = (fields: Partial<typeof IDENTITY>) => (project: Gated) => {
    expect(defined(clipOf(project, 'o1a')).tf).toEqual({ ...TR, ...fields });
    expect(project.dropped).toEqual([expect.stringMatching(ADJUSTED)]);
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
      (project) => {
        expect(defined(clipOf(project, 'o1a')).tf).toEqual({ ...IDENTITY, w: 0.3 });
        expect(why(project)).toMatch(ADJUSTED);
      },
    ],
    ['x and y far outside', tfOf((transform) => ({ ...transform, x: 1e9, y: -1e9 })), adjusted({ x: 1.5, y: -0.5 })],
    // JSON writes NaN and ±Infinity as null: those fields take the identity value.
    [
      'NaN and infinite fields',
      tfOf((transform) => ({ ...transform, x: NaN, w: Infinity, rot: -Infinity })),
      adjusted({ x: 0.5, w: 1 }),
    ],
    ['a width of 0', tfOf((transform) => ({ ...transform, w: 0 })), adjusted({ w: 0.05 })],
    ['a negative width', tfOf((transform) => ({ ...transform, w: -2 })), adjusted({ w: 0.05 })],
    ['a huge width', tfOf((transform) => ({ ...transform, w: 1e6 })), adjusted({ w: 4 })],
    ['a rotation of 720', tfOf((transform) => ({ ...transform, rot: 720 })), adjusted({ rot: 180 })],
    ['opacity 2', tfOf((transform) => ({ ...transform, opacity: 2 })), adjusted({ opacity: 1 })],
    ['a negative opacity', tfOf((transform) => ({ ...transform, opacity: -0.5 })), adjusted({ opacity: 0 })],
    ['a corner radius of 3', tfOf((transform) => ({ ...transform, radius: 3 })), adjusted({ radius: 0.5 })],
    ['fields as text', tfOf(() => ({ x: '0.2', y: '0.2', w: '0.3', rot: '0', opacity: '1', radius: '0' })), unread],
    [
      'fields of the wrong type',
      tfOf(() => ({ x: true, y: null, w: {}, rot: [], opacity: 'x', radius: false })),
      unread,
    ],
    [
      'unknown fields in a transform',
      tfOf((transform) => ({ ...transform, skew: 30, href: 'javascript:x' })),
      (project) => {
        expect(defined(clipOf(project, 'o1a')).tf).toEqual(TR);
        expect(project.dropped).toEqual([]);
      },
    ],
    [
      'an identity transform written out',
      tfOf(() => ({ ...IDENTITY })),
      (project) => {
        expect('tf' in defined(clipOf(project, 'o1a'))).toBe(false);
        expect(project.dropped).toEqual([]);
      },
    ],
    [
      'a main track clip with a transform out of range',
      (doc) => ({
        ...doc,
        clips: doc.clips.map((clip, index) => (index ? clip : { ...clip, transform: { x: 9, w: 9, opacity: 9 } })),
      }),
      (project) => {
        expect(project.doc.clips[0].tf).toEqual({ ...IDENTITY, x: 1.5, w: 4 });
        expect(why(project)).toMatch(ADJUSTED);
      },
    ],
    [
      'a tf field written instead of transform',
      (doc) => ({ ...doc, clips: doc.clips.map((clip) => ({ ...clip, tf: 'x' })) }),
      (project) => {
        expect('tf' in project.doc.clips[0]).toBe(false);
        expect(defined(clipOf(project, 'o1a')).tf).toEqual(TR);
        expect(project.dropped).toEqual([]);
      },
    ],
    [
      '12 overlay tracks (beyond the limit), clips on the last',
      (doc) => ({
        ...doc,
        tracks: [doc.tracks[0], ...Array.from({ length: 12 }, (_, index) => overlay(index + 1)), doc.tracks.at(-1)],
        clips: doc.clips.map((clip) => (clip.id === 'o2b' ? { ...clip, track: 'O12' } : clip)),
      }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        for (let index = 4; index <= 12; index++) expect(project.dropped).toContain(leftOut(`Overlay ${index}`));
        expect(clipOf(project, 'o2b')).toBeUndefined();
        expect(project.dropped).toContain('A clip on a missing or sound track was left out.');
      },
    ],
    [
      'two overlay tracks with the same id',
      (doc) => ({ ...doc, tracks: [doc.tracks[0], doc.tracks[1], { ...doc.tracks[2], id: 'O1' }, doc.tracks[3]] }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', MUSIC]);
        expect(project.doc.tracks[1].name).toBe('Face cam');
        expect(clipOf(project, 'o2a')).toBeUndefined();
        expect(why(project)).toMatch(/track was unreadable.*missing or sound track/);
      },
    ],
    [
      'an overlay track with a bad id',
      (doc) => ({ ...doc, tracks: doc.tracks.map((track) => (track.id === 'O2' ? { ...track, id: '<O2>' } : track)) }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', MUSIC]);
        expect(onTrack(project.doc, 'O2')).toEqual([]);
        expect(why(project)).toMatch(/track was unreadable.*missing or sound track/);
      },
    ],
    [
      'an overlay track turned into sound',
      (doc) => ({
        ...doc,
        tracks: doc.tracks.map((track) => (track.id === 'O1' ? { ...track, kind: 'audio' } : track)),
      }),
      (project) => {
        expect(defined(project.doc.tracks.find((track) => track.id === 'O1')).kind).toBe('audio');
        expect(clipOf(project, 'o1a')).toBeUndefined();
        expect(clipOf(project, 'o1b')).toBeUndefined();
        expect(project.dropped).toEqual(Array(2).fill('A clip on a missing or sound track was left out.'));
      },
    ],
    [
      'a clip on a missing overlay track',
      (doc) => ({ ...doc, clips: [...doc.clips, { ...doc.clips[4], id: 'x', track: 'O9' }] }),
      (project) => {
        expect(clipOf(project, 'x')).toBeUndefined();
        expect(project.dropped).toEqual(['A clip on a missing or sound track was left out.']);
      },
    ],
    [
      'the overlay tracks gone: their clips are left out',
      (doc) => ({ ...doc, tracks: [doc.tracks[0], doc.tracks[3]] }),
      (project) => {
        expect(project.doc.clips.map((clip) => clip.track)).toEqual(Array(4).fill(MAIN_VIDEO));
        expect(project.dropped).toEqual(Array(4).fill('A clip on a missing or sound track was left out.'));
      },
    ],
    [
      'two overlay clips at the same start',
      startsOn('O1', [1, 1]),
      (project) => {
        expect(startsOf(project, 'O1')).toEqual([
          ['o1a', 1],
          ['o1b', 5.5],
        ]);
        expect(project.dropped).toEqual([
          'Two clips overlapped on the Face cam track; one was moved to after the other.',
        ]);
      },
    ],
    [
      'an overlay clip inside another',
      startsOn('O1', [1, 2]),
      (project) => {
        expect(startsOf(project, 'O1')).toEqual([
          ['o1a', 1],
          ['o1b', 5.5],
        ]);
        expect(why(project)).toMatch(/overlapped on the Face cam track/);
      },
    ],
    [
      'overlay clips out of order',
      startsOn('O2', [6, 2]),
      (project) => {
        expect(startsOf(project, 'O2')).toEqual([
          ['o2b', 2],
          ['o2a', 6],
        ]);
        expect(project.dropped).toEqual([]);
      },
    ],
    [
      'three overlay clips all at 0',
      (doc) => {
        const started = startsOn('O1', [0, 0])(doc);
        return {
          ...started,
          clips: [...started.clips, { ...doc.clips[4], id: 'o1c', start: 0, transform: undefined }],
        };
      },
      (project) => {
        expect(startsOf(project, 'O1')).toEqual([
          ['o1a', 0],
          ['o1b', 4.5],
          ['o1c', 9],
        ]);
        expect(project.dropped).toEqual(
          Array(2).fill('Two clips overlapped on the Face cam track; one was moved to after the other.'),
        );
      },
    ],
    [
      'overlapping overlay clips with Magnetic off',
      (doc) => ({ ...startsOn('O2', [2, 3])(doc), magnetic: false }),
      (project) => {
        expect(project.doc.magnetic).toBe(false);
        expect(startsOf(project, 'O2')).toEqual([
          ['o2a', 2],
          ['o2b', 5],
        ]);
        expect(why(project)).toMatch(/overlapped on the Overlay 2 track/);
      },
    ],
    [
      'a negative start on an overlay clip',
      startsOn('O1', [-3, 6]),
      (project) => {
        expect(startsOf(project, 'O1')).toEqual([
          ['o1a', 0],
          ['o1b', 6],
        ]);
        expect(project.dropped).toEqual([]);
      },
    ],
    [
      'a start as text on an overlay clip',
      startsOn('O2', ['2', 6]),
      (project) => {
        expect(startsOf(project, 'O2')).toEqual([
          ['o2a', 0],
          ['o2b', 6],
        ]);
        expect(project.dropped).toEqual([]);
      },
    ],
    [
      'too many clips across tracks',
      (doc) => ({
        ...doc,
        clips: Array.from({ length: 90 }, (_, index) => ({
          ...doc.clips[4],
          id: `c${index}`,
          track: ['V1', 'O1', 'O2'][index % 3],
        })),
      }),
      (project) => {
        expect(project.doc.clips).toHaveLength(60);
        expect(project.dropped[0]).toBe('A project holds up to 60 clips here; 30 were left out.');
        for (const track of [MAIN_VIDEO, 'O1', 'O2']) expect(onTrack(project.doc, track)).toHaveLength(20);
      },
    ],
    [
      'a second track of kind video',
      (doc) => ({
        ...doc,
        tracks: doc.tracks.map((track) => (track.id === 'O1' ? { ...track, id: 'V2', kind: 'video' } : track)),
      }),
      (project) => {
        expect(defined(project.doc.tracks.find((track) => track.id === 'V2')).kind).toBe('overlay');
        expect(project.dropped[0]).toBe(
          'The “Face cam” track became an overlay track: a project has one main video track.',
        );
      },
    ],
    [
      'the main track listed above the overlays',
      (doc) => ({ ...doc, tracks: [doc.tracks[1], doc.tracks[2], doc.tracks[0], doc.tracks[3]] }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', 'O2', MUSIC]);
        expect(project.dropped).toEqual(['The main video track was moved below the overlay tracks.']);
      },
    ],
    [
      'the sound track listed first',
      (doc) => ({ ...doc, tracks: [doc.tracks[3], doc.tracks[1], doc.tracks[0], doc.tracks[2]] }),
      (project) => {
        expect(trackIds(project)).toEqual([MUSIC, MAIN_VIDEO, 'O1', 'O2']);
        expect(project.dropped).toEqual(['The main video track was moved below the overlay tracks.']);
      },
    ],
    [
      'no main track, overlays kept',
      (doc) => ({ ...doc, tracks: doc.tracks.slice(1) }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', 'O2', MUSIC]);
        expect(project.doc.clips).toHaveLength(8);
      },
    ],
    [
      'no main track and the picture tracks full',
      (doc) => ({ ...doc, tracks: [overlay(1), overlay(2), overlay(3), overlay(4), doc.tracks[3]] }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        expect(project.dropped).toEqual([leftOut('Overlay 4')]);
      },
    ],
    [
      'the picture tracks full with the main track listed last',
      (doc) => ({ ...doc, tracks: [overlay(1), overlay(2), overlay(3), overlay(4), doc.tracks[0], doc.tracks[3]] }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        expect(project.dropped).toEqual([
          leftOut('Overlay 4'),
          'The main video track was moved below the overlay tracks.',
        ]);
      },
    ],
    [
      'the picture tracks full with the main track listed first',
      (doc) => ({ ...doc, tracks: [doc.tracks[0], overlay(1), overlay(2), overlay(3), overlay(4), doc.tracks[3]] }),
      (project) => {
        expect(trackIds(project)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
        expect(project.dropped).toEqual([leftOut('Overlay 4')]);
      },
    ],
    [
      'the main track muted',
      (doc) => ({
        ...doc,
        tracks: doc.tracks.map((track) => (track.id === MAIN_VIDEO ? { ...track, muted: true } : track)),
      }),
      (project) => {
        expect(project.doc.tracks[0].muted).toBe(false);
        expect(defined(project.doc.tracks.find((track) => track.id === 'O2')).muted).toBe(true);
      },
    ],
    [
      'overlay track switches and name of the wrong type',
      (doc) => ({
        ...doc,
        tracks: doc.tracks.map((track) =>
          track.id === 'O1' ? { ...track, name: 42, hidden: 'yes', muted: 1, locked: 'no' } : track,
        ),
      }),
      (project) => {
        expect(project.doc.tracks[1]).toEqual({
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
      (doc) => ({
        ...doc,
        tracks: doc.tracks.map((track) => (track.id === 'O2' ? { ...track, name: 'n'.repeat(500) } : track)),
      }),
      (project) => expect(project.doc.tracks[2].name).toBe('n'.repeat(40)),
    ],
    [
      'overlay clips moved past the length limit',
      (doc) => ({
        ...doc,
        kind: 'reel',
        format: 'reel',
        clips: [
          doc.clips[0],
          ...Array.from({ length: 19 }, (_, index) => ({
            ...doc.clips[0],
            id: `p${index}`,
            track: 'O1',
            start: 0,
            dur: 10,
          })),
        ],
      }),
      (project) => {
        // A web reel is 90 s at most: the clips moved to 90 s and later go.
        expect(onTrack(project.doc, 'O1').map((clip) => clip.start)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80]);
        expect(project.dropped.filter((message) => message.includes('didn’t fit within'))).toEqual([
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
    check(defined(out));
    const { doc } = defined(out);
    expect(doc.version).toBe(1);
    const pictures = doc.tracks.filter((track) => track.kind !== 'audio');
    // The main track is the bottom picture track, the only one of kind video; the rest are overlays.
    expect(pictures[0]?.id).toBe(MAIN_VIDEO);
    expect(pictures[0].muted).toBe(false);
    expect(pictures.slice(1).every((track) => track.kind === 'overlay')).toBe(true);
    expect(pictures.length).toBeLessThanOrEqual(TRACK_LIMITS(false).visual);
    expect(doc.tracks.find((track) => track.id === MUSIC)?.kind).toBe('audio');
    expect(new Set(doc.tracks.map((track) => track.id)).size).toBe(doc.tracks.length);
    const lim = limitsFor(doc.kind, false);
    expect(doc.clips.length).toBeLessThanOrEqual(lim.clips);
    for (const clip of doc.clips) {
      expect(pictures.some((picture) => picture.id === clip.track)).toBe(true);
      expect(Number.isFinite(clip.start) && clip.start >= 0 && clip.start < lim.seconds).toBe(true);
      expect('transform' in clip).toBe(false);
      if ('tf' in clip) {
        expect(isIdentity(clip.tf)).toBe(false);
        expect(clampTransform(clip.tf)).toEqual(clip.tf);
      }
    }
    // Every picture track in start order without overlaps.
    for (const track of pictures) {
      const on = onTrack(doc, track.id);
      for (let index = 1; index < on.length; index++)
        expect(on[index].start, `${track.id} ${on[index].id}`).toBeGreaterThanOrEqual(
          on[index - 1].start + clipLength(on[index - 1]) - 1e-6,
        );
    }
    expect(new Set(doc.clips.map((clip) => clip.id)).size).toBe(doc.clips.length);
    expect(mergeProject(JSON.parse(JSON.stringify(toDocument(doc))), false).doc).toEqual(doc);
  });

  const gate = (make: (d: Doc) => unknown) => mergeProject(JSON.parse(JSON.stringify(make(fixture()))), true);

  it('clamps a transform out of range, and says so', () => {
    const project = gate(tfOf((transform) => ({ ...transform, w: 9, opacity: -1, rot: 400 })));
    expect(defined(project.doc.clips.find((clip) => clip.id === 'o1a')).tf).toMatchObject({
      w: 4,
      opacity: 0,
      rot: 180,
    });
    expect(project.dropped.join(' ')).toMatch(/position and size/i);
    const junk = gate(tfOf(() => 'top-right'));
    expect('tf' in defined(junk.doc.clips.find((clip) => clip.id === 'o1a'))).toBe(false);
    expect(junk.dropped.join(' ')).toMatch(/position and size/i);
    // An identity transform is fine as it is: no tf, nothing to say.
    const id = gate(tfOf(() => ({ ...IDENTITY })));
    expect(id.dropped).toEqual([]);
    expect('tf' in defined(id.doc.clips.find((clip) => clip.id === 'o1a'))).toBe(false);
  });

  it('drops a clip on a missing track with a reason', () => {
    const project = gate((doc) => ({ ...doc, clips: [...doc.clips, { ...doc.clips[4], id: 'x', track: 'O9' }] }));
    expect(project.doc.clips.some((clip) => clip.id === 'x')).toBe(false);
    expect(project.dropped.join(' ')).toMatch(/missing.*track/);
  });

  it('moves an overlapping overlay clip to the end of the one it overlaps, never dropping it (202 D3)', () => {
    // O1: two 4.5 s video clips; the second starts at 2, inside the first (1–5.5): it moves to 5.5.
    const project = gate(startsOn('O1', [1, 2]));
    expect(onTrack(project.doc, 'O1').map((clip) => [clip.id, clip.start])).toEqual([
      ['o1a', 1],
      ['o1b', 5.5],
    ]);
    expect(project.dropped).toEqual(['Two clips overlapped on the Face cam track; one was moved to after the other.']);
    // Out of order on O2 is only sorted; Magnetic on still packs the main track.
    const sorted = gate(startsOn('O2', [6, 2]));
    expect(onTrack(sorted.doc, 'O2').map((clip) => [clip.id, clip.start])).toEqual([
      ['o2b', 2],
      ['o2a', 6],
    ]);
    expect(sorted.dropped).toEqual([]);
    // Equal starts keep the document's order, each after the one before.
    const all = gate(startsOn('O1', [0, 0]));
    expect(onTrack(all.doc, 'O1').map((clip) => [clip.id, clip.start])).toEqual([
      ['o1a', 0],
      ['o1b', 4.5],
    ]);
    expect(all.doc.clips).toHaveLength(fixture().clips.length);
  });

  it('a non-main track of kind video becomes an overlay track', () => {
    const project = gate((doc) => ({
      ...doc,
      tracks: doc.tracks.map((track) => (track.id === 'O1' ? { ...track, kind: 'video' } : track)),
    }));
    expect(defined(project.doc.tracks.find((track) => track.id === 'O1')).kind).toBe('overlay');
    expect(onTrack(project.doc, 'O1')).toHaveLength(2);
    expect(project.dropped.join(' ')).toMatch(/Face cam.*overlay/);
  });

  it('puts the main track first among the picture tracks: nothing is drawn under it', () => {
    const project = gate((doc) => ({ ...doc, tracks: [doc.tracks[1], doc.tracks[0], doc.tracks[2], doc.tracks[3]] }));
    expect(project.doc.tracks.map((track) => track.id)).toEqual([MAIN_VIDEO, 'O1', 'O2', MUSIC]);
    expect(project.dropped.join(' ')).toMatch(/main video track/);
    expect(project.doc.clips).toHaveLength(fixture().clips.length);
  });

  it('keeps overlay tracks within the limit, and their clips go with a reason', () => {
    const projectDoc = fixture();
    const project = mergeProject(
      {
        ...projectDoc,
        tracks: [
          projectDoc.tracks[0],
          ...Array.from({ length: 6 }, (_, index) => overlay(index + 1)),
          projectDoc.tracks[3],
        ],
        clips: projectDoc.clips.map((clip) => (clip.id === 'o2b' ? { ...clip, track: 'O6' } : clip)),
      },
      false,
    );
    expect(project.doc.tracks.map((track) => track.id)).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', MUSIC]);
    expect(project.doc.clips.some((clip) => clip.id === 'o2b')).toBe(false);
    expect(project.dropped).toEqual([
      leftOut('Overlay 4'),
      leftOut('Overlay 5'),
      leftOut('Overlay 6'),
      'A clip on a missing or sound track was left out.',
    ]);
  });

  it('toDocument never writes a transform out of range', () => {
    const projectDoc = mergeProject(fixture(), true).doc;
    const wild = { x: 9, y: -9, w: 0, rot: 999, opacity: 7, radius: -1 };
    const out = toDocument({
      ...projectDoc,
      clips: projectDoc.clips.map((clip) => (clip.id === 'o1a' ? { ...clip, tf: wild } : clip)),
    });
    expect(defined(out.clips.find((clip) => clip.id === 'o1a')).transform).toEqual(clampTransform(wild));
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
    tracks: [{ ...defaultTracks()[0], ...main }, overlay('O1', o1), overlay('O2', o2), defaultTracks()[1]],
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
  const music = { ref: 'music', track: MUSIC, role: 'music', start: 0, end: 9, from: 2, volume: 0.6, fadeIn: 0, fadeOut: 1.5 };

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
    expect(audioPlan(fixture({}, { muted: true }))).toEqual(all.filter((source) => source.ref !== 'z'));
    expect(audioPlan(fixture({ muted: true }))).toEqual(all.filter((source) => source.ref !== 'x'));
    const bare = fixture();
    expect(audioPlan(fixture({ muted: true }, { muted: true }))).toEqual(
      audioPlan({ ...bare, clips: bare.clips.filter((clip) => clip.track === MAIN_VIDEO) }),
    );
  });

  it('a hidden overlay track keeps its sound (Hide is pictures); so does the hidden main track (201 D2)', () => {
    const all = audioPlan(fixture());
    expect(audioPlan(fixture({ hidden: true }))).toEqual(all);
    expect(audioPlan(fixture({ hidden: true }, { hidden: true }, { hidden: true }))).toEqual(all);
    expect(audioPlan(fixture({ hidden: true, muted: true }))).toEqual(all.filter((source) => source.ref !== 'x'));
  });

  it.each(fixtures)('%s: overlay tracks without sound leave the 2.x sound sources unchanged (AC-10)', (_, project) => {
    const tp = onTracks(project);
    const [main, ...rest] = tp.tracks;
    const empty = { ...tp, tracks: [main, overlay('O1'), ...rest] };
    expect(audioPlan(empty)).toEqual(legacyAudioPlan(project));
    const silent = {
      ...tp,
      tracks: [main, overlay('O1', { muted: true }), overlay('O2'), ...rest],
      // A clip on a muted track and a clip at volume 0: the pictures differ, the sound mustn't.
      clips: [
        ...tp.clips,
        ...([video('m', 'O1', 0, 0, 1, 1), video('n', 'O2', 0, 0, 1, 0)] as unknown as typeof tp.clips),
      ],
    };
    expect(audioPlan(silent)).toEqual(legacyAudioPlan(project));
  });
});

/* ---------- 205 T014: keyframes in the document and its gate (AC-4) ---------- */

describe('keyframes in the document (205 AC-4)', () => {
  const keyframe = (time: number, value: number, ease: Ease = 'ease-in-out'): Keyframe => ({ t: time, v: value, ease });
  const layer = (id: string, keys?: unknown): Layer =>
    ({ ...newSticker('⭐'), id, start: 1, end: 4, ...(keys !== undefined ? { keys } : {}) }) as Layer;
  /**
   * The mixed 2.x project with its first video clip and a sticker layer animated.
   * @returns the document
   */
  const fixture = () => {
    const projectDoc = mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
    const clips = projectDoc.clips.map((clip) =>
      clip.kind === 'video' && clip.id === defined(projectDoc.clips.find((x) => x.kind === 'video')).id
        ? {
            ...clip,
            keys: {
              x: [keyframe(0, 0.2, 'linear'), keyframe(1.5, 0.8)],
              opacity: [keyframe(0, 1), keyframe(2, 0, 'hold')],
              volume: [keyframe(0.5, 1), keyframe(1, 0.25, 'ease-out')],
            },
          }
        : clip,
    );
    // Through the layers' gate, so its fields are in the order the gate writes them.
    const layers = mergeLayers([
      layer('L1', { y: [keyframe(0, 1.2), keyframe(0.5, 0.5, 'ease-in')], rot: [keyframe(0, -90)] }),
    ]);
    return toDocument({ ...projectDoc, clips, layers });
  };
  type Doc = ReturnType<typeof fixture>;
  type Gated = ReturnType<typeof mergeProject>;
  const animatedId = (doc: Doc) => defined(doc.clips.find((clip) => clip.keys)).id;
  const keysOf = (project: Gated, projectDoc: Doc) =>
    defined(project.doc.clips.find((clip) => clip.id === animatedId(projectDoc))).keys;
  const layerKeys = (project: Gated) => project.doc.layers.find((kept) => kept.id === 'L1')?.keys;
  const why = (project: Gated) => project.dropped.join(' ');
  const UNREAD = /Some keyframes couldn’t be read and were left out/;
  const ADJUSTED = /Some keyframe values were out of range and were adjusted/;
  const EASE = /Some keyframes had an unknown interpolation and now ease in and out/;
  const SAME = /Some keyframes were at the same time; the last of each was kept/;
  const PER_VALUE = /A value can have at most 100 keyframes; the rest were left out/;
  const PER_PROJECT = 'A project can have at most 5,000 keyframes; the rest were left out';

  /**
   * The animated clip's keys replaced by `keys`.
   * @param keys the new keys
   * @returns the change for a document
   */
  const clipKeys = (keys: unknown) => (doc: Doc) => ({
    ...doc,
    clips: doc.clips.map((clip) => (clip.id === animatedId(doc) ? { ...clip, keys } : clip)),
  });
  /**
   * The animated clip's x keys replaced by `replacement`.
   * @param replacement the new x keys
   * @returns the change for a document
   */
  const xKeys = (replacement: unknown) => (doc: Doc) =>
    clipKeys({ ...defined(doc.clips.find((clip) => clip.keys)).keys, x: replacement })(doc);
  const layerWith = (keys: unknown) => (doc: Doc) => ({ ...doc, layers: [layer('L1', keys)] });

  /**
   * The clip has no keys and the reason says they couldn't be read.
   * @param project the gated document
   * @param projectDoc the document before the gate
   */
  const noKeys = (project: Gated, projectDoc: Doc) => {
    expect('keys' in defined(project.doc.clips.find((clip) => clip.id === animatedId(projectDoc)))).toBe(false);
    expect(why(project)).toMatch(UNREAD);
  };
  /**
   * The clip's x keys are `keyframes`, its other keys as written, and the only reasons match `reasons`.
   * @param keyframes the x keys expected
   * @param reasons the reasons expected
   * @returns the check for a gated document
   */
  const xIs =
    (keyframes: Keyframe[] | undefined, ...reasons: RegExp[]) =>
    (project: Gated, doc: Doc) => {
      const keys = defined(keysOf(project, doc));
      expect(keys.x).toEqual(keyframes);
      expect(keys.opacity).toEqual([keyframe(0, 1), keyframe(2, 0, 'hold')]);
      expect(project.dropped).toEqual(reasons.map((re): unknown => expect.stringMatching(re)));
    };

  const bad: [string, (d: Doc) => unknown, (r: Gated, d: Doc) => void][] = [
    ['keys that are text', clipKeys('x'), noKeys],
    ['keys that are an array', clipKeys([keyframe(0, 1)]), noKeys],
    ['keys that are null', clipKeys(null), noKeys],
    ['keys that are a number', clipKeys(7), noKeys],
    [
      'empty keys',
      clipKeys({}),
      (project, projectDoc) => {
        expect('keys' in defined(project.doc.clips.find((clip) => clip.id === animatedId(projectDoc)))).toBe(false);
        expect(project.dropped).toEqual([]);
      },
    ],
    ['a value whose keys are a number', xKeys(3), xIs(undefined, UNREAD)],
    ['a value whose keys are an object', xKeys({ t: 0, v: 1 }), xIs(undefined, UNREAD)],
    ['every key of a value unreadable', xKeys([1, 'a', null]), xIs(undefined, UNREAD)],
    ['a key that is a number', xKeys([3, keyframe(1, 0.4)]), xIs([keyframe(1, 0.4)], UNREAD)],
    ['a time as text', xKeys([{ t: '0', v: 0.2, ease: 'linear' }, keyframe(1, 0.4)]), xIs([keyframe(1, 0.4)], UNREAD)],
    // JSON writes NaN and ±Infinity as null.
    [
      'a value that was NaN',
      xKeys([{ t: 0, v: null, ease: 'linear' }, keyframe(1, 0.4)]),
      xIs([keyframe(1, 0.4)], UNREAD),
    ],
    [
      'a time that was infinite',
      xKeys([{ t: null, v: 0.2, ease: 'linear' }, keyframe(1, 0.4)]),
      xIs([keyframe(1, 0.4)], UNREAD),
    ],
    ['a key without a value', xKeys([{ t: 0, ease: 'linear' }, keyframe(1, 0.4)]), xIs([keyframe(1, 0.4)], UNREAD)],
    ['a time beyond a day', xKeys([keyframe(1e9, 0.2), keyframe(1, 0.4)]), xIs([keyframe(1, 0.4)], UNREAD)],
    // Before the clip's start: kept (a start trim leaves keys outside the clip, AC-3).
    [
      'a key before the start',
      xKeys([keyframe(-2, 0.2), keyframe(1, 0.4)]),
      xIs([keyframe(-2, 0.2), keyframe(1, 0.4)]),
    ],
    [
      'a value out of range',
      xKeys([keyframe(0, 9), keyframe(1, -9)]),
      xIs([keyframe(0, 1.5), keyframe(1, -0.5)], ADJUSTED),
    ],
    [
      'an opacity of 3 and a volume of −1',
      clipKeys({ opacity: [keyframe(0, 3)], volume: [keyframe(0, -1)] }),
      (project, doc) => {
        expect(keysOf(project, doc)).toEqual({ opacity: [keyframe(0, 1)], volume: [keyframe(0, 0)] });
        expect(project.dropped).toEqual([expect.stringMatching(ADJUSTED)]);
      },
    ],
    [
      'an unknown interpolation',
      xKeys([keyframe(0, 0.2, 'bounce' as Ease), keyframe(1, 0.4)]),
      xIs([keyframe(0, 0.2), keyframe(1, 0.4)], EASE),
    ],
    [
      'a missing interpolation',
      xKeys([{ t: 0, v: 0.2 }, keyframe(1, 0.4)]),
      xIs([keyframe(0, 0.2), keyframe(1, 0.4)], EASE),
    ],
    ['an interpolation of the wrong type', xKeys([{ t: 0, v: 0.2, ease: 3 }]), xIs([keyframe(0, 0.2)], EASE)],
    [
      'keys out of order are sorted',
      xKeys([keyframe(2, 0.6), keyframe(0, 0.2), keyframe(1, 0.4)]),
      xIs([keyframe(0, 0.2), keyframe(1, 0.4), keyframe(2, 0.6)]),
    ],
    [
      'equal times keep the last',
      xKeys([keyframe(1, 0.4), keyframe(0, 0.2), keyframe(1, 0.9, 'hold')]),
      xIs([keyframe(0, 0.2), keyframe(1, 0.9, 'hold')], SAME),
    ],
    [
      'extra fields in a key are not kept',
      xKeys([{ t: 0, v: 0.2, ease: 'linear', href: 'javascript:x', tangent: 3 }]),
      xIs([keyframe(0, 0.2, 'linear')]),
    ],
    [
      'an unknown value name',
      clipKeys({ skew: [keyframe(0, 1)], x: [keyframe(0, 0.2)] }),
      (project, doc) => {
        expect(keysOf(project, doc)).toEqual({ x: [keyframe(0, 0.2)] });
        expect(why(project)).toMatch(UNREAD);
      },
    ],
    [
      'a __proto__ value name',
      (doc) =>
        JSON.parse(
          JSON.stringify(clipKeys({ MARK: [], x: [keyframe(0, 0.2)] })(doc)).replace('"MARK"', '"__proto__"'),
        ) as unknown,
      (project, doc) => {
        const keys = defined(keysOf(project, doc));
        expect(Object.keys(keys)).toEqual(['x']);
        expect(Object.getPrototypeOf(keys)).toBe(Object.prototype);
        expect(why(project)).toMatch(UNREAD);
      },
    ],
    [
      '150 keys on one value',
      xKeys(Array.from({ length: 150 }, (_, index) => keyframe(149 - index, 0.5))),
      xIs(
        Array.from({ length: 100 }, (_, index) => keyframe(index, 0.5)),
        PER_VALUE,
      ),
    ],
    [
      'more than 5,000 keys in the project',
      (doc) => {
        const full = (props: string[]) =>
          Object.fromEntries(
            props.map((prop) => [prop, Array.from({ length: 100 }, (_, index) => keyframe(index, 0.5))]),
          );
        const clipProps = ['x', 'y', 'w', 'rot', 'opacity', 'radius', 'volume'];
        return {
          ...doc,
          // 4 clips × 700 + 30 layers × 500 = 17,800 keys.
          clips: doc.clips.map((clip) => ({ ...clip, keys: full(clipProps) })),
          layers: Array.from({ length: 30 }, (_, index) => layer(`L${index}`, full(['x', 'y', 'w', 'rot', 'opacity']))),
        };
      },
      (project) => {
        const total =
          project.doc.clips.reduce((sum, clip) => sum + countKeys(clip.keys), 0) +
          project.doc.layers.reduce((sum, kept) => sum + countKeys(kept.keys), 0);
        expect(total).toBe(5000);
        expect(project.doc.layers).toHaveLength(30);
        expect(project.dropped.filter((text) => text.includes(PER_PROJECT))).toHaveLength(1);
      },
    ],
    [
      'layer keys that are text',
      layerWith('fly-in'),
      (project) => {
        expect(project.doc.layers.map((kept) => kept.id)).toEqual(['L1']);
        expect(layerKeys(project)).toBeUndefined();
        expect(why(project)).toMatch(UNREAD);
      },
    ],
    [
      'volume and radius on a layer',
      layerWith({ volume: [keyframe(0, 1)], radius: [keyframe(0, 0.2)], x: [keyframe(0, 0.3)] }),
      (project) => {
        expect(layerKeys(project)).toEqual({ x: [keyframe(0, 0.3)] });
        expect(why(project)).toMatch(UNREAD);
      },
    ],
    [
      'layer values out of the layers’ ranges',
      layerWith({ w: [keyframe(0, 0)], rot: [keyframe(0, 400)] }),
      (project) => {
        expect(layerKeys(project)).toEqual({ w: [keyframe(0, 0.01)], rot: [keyframe(0, 360)] });
        expect(project.dropped).toEqual([expect.stringMatching(ADJUSTED)]);
      },
    ],
  ];

  it('has at least 25 malformed documents', () => expect(bad.length).toBeGreaterThanOrEqual(25));

  it.each(bad)('%s: never throws, keeps what it can and says why', (_, make, check) => {
    const doc = fixture();
    let project: Gated | undefined;
    expect(() => (project = mergeProject(JSON.parse(JSON.stringify(make(doc))), true))).not.toThrow();
    check(defined(project), doc);
  });

  it('writes keys only where there are some, and round-trips document → gate → document equal', () => {
    const doc = fixture();
    expect(doc.clips.map((clip) => 'keys' in clip)).toEqual(doc.clips.map((clip) => clip.id === animatedId(doc)));
    const text = JSON.stringify(doc);
    const once = mergeProject(JSON.parse(text), true);
    expect(once.dropped).toEqual([]);
    expect(keysOf(once, doc)).toEqual(defined(doc.clips.find((clip) => clip.keys)).keys);
    expect(layerKeys(once)).toEqual({ y: [keyframe(0, 1.2), keyframe(0.5, 0.5, 'ease-in')], rot: [keyframe(0, -90)] });
    expect(toDocument(once.doc)).toEqual(doc);
    expect(JSON.stringify(toDocument(once.doc))).toBe(text);
  });

  it('does not write empty or missing keys', () => {
    const projectDoc = mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
    const text = JSON.stringify(toDocument(projectDoc));
    expect(
      JSON.stringify(toDocument({ ...projectDoc, clips: projectDoc.clips.map((clip) => ({ ...clip, keys: {} })) })),
    ).toBe(text);
    expect(
      JSON.stringify(
        toDocument({ ...projectDoc, clips: projectDoc.clips.map((clip) => ({ ...clip, keys: undefined })) }),
      ),
    ).toBe(text);
  });

  it.each(fixtures)('%s: a 201 / 202 document without keys stays byte-identical', (_, project) => {
    const first = mergeProject(legacyDoc(project), true).doc;
    const text = JSON.stringify(toDocument(first));
    expect(text).not.toMatch(/"keys"/);
    const back = mergeProject(JSON.parse(text), true);
    expect(back.dropped).toEqual([]);
    expect(JSON.stringify(toDocument(back.doc))).toBe(text);
  });
});

/* ---------- 205 T040: volume keyframes in the sound plan (AC-10) ---------- */

describe('volume keyframes in the sound plan (205 AC-10)', () => {
  type SC = TimedClip & { volume: number };
  const key = (time: number, value: number, ease: Ease = 'linear'): Keyframe => ({ t: time, v: value, ease });
  const video = (id: string, start: number, volume: number, keys?: SC['keys']): SC => ({
    id,
    track: MAIN_VIDEO,
    start,
    kind: 'video',
    in: 1,
    out: 5,
    dur: 0,
    volume,
    ...(keys ? { keys } : {}),
  });
  const project = (clips: SC[]): Project => ({ tracks: defaultTracks(), clips, audio: [], layers: [], fadeOut: false });

  it('a clip with volume keys above 0 is mixed even at a stored volume of 0, with its keys as gain (clip time)', () => {
    const gain = [key(0, 0), key(2, 1, 'ease-in-out')];
    expect(audioPlan(project([video('a', 0, 0, { volume: gain }), video('b', 4, 0.5)]))).toEqual([
      { ref: 'a', start: 0, end: 4, from: 1, volume: 0, gain, fadeIn: 0.03, fadeOut: 0.03 },
      { ref: 'b', start: 4, end: 8, from: 1, volume: 0.5, fadeIn: 0.03, fadeOut: 0.03 },
    ]);
  });

  it('a clip whose volume keys are all 0 is silent (left out); box keys alone change nothing', () => {
    const silent = video('a', 0, 1, { volume: [key(0, 0), key(1, 0)] });
    const boxOnly = video('b', 4, 0.5, { x: [key(0, 0.2), key(1, 0.8)] });
    expect(audioPlan(project([silent, boxOnly]))).toEqual([
      { ref: 'b', start: 4, end: 8, from: 1, volume: 0.5, fadeIn: 0.03, fadeOut: 0.03 },
    ]);
  });
});

/* ---------- 206 AC-5: transitions in the document ---------- */

describe('transitions in the document (206 AC-5)', () => {
  /**
   * The mixed 2.x project (photo 3 s, video 4.5 s, photo 1.5 s, video 0.33 s, back to back) with a 1 s dissolve on the
   * first cut and a 0.6 s wipe to the right on the second.
   * @returns the document
   */
  const fixture = () => {
    const projectDoc = mergeProject(legacyDoc(legacyFixtures().mixed), true).doc;
    const [p6, v7, p8] = projectDoc.clips;
    const clips = projectDoc.clips.map((clip) => {
      if (clip.id === p6.id)
        return { ...clip, transition: { kind: 'dissolve', dur: 1, to: v7.id } satisfies Transition };
      if (clip.id === v7.id)
        return { ...clip, transition: { kind: 'wipe', dur: 0.6, to: p8.id, dir: 'right' } satisfies Transition };
      return clip;
    });
    return toDocument({ ...projectDoc, clips });
  };
  type Doc = ReturnType<typeof fixture>;
  type Gated = ReturnType<typeof mergeProject>;
  const ids = (doc: Doc) => doc.clips.map((clip) => clip.id);
  const transitionOf = (project: Gated, id: string) =>
    defined(project.doc.clips.find((clip) => clip.id === id)).transition;
  const UNREAD = /Some transitions couldn’t be read and were left out/;
  const KIND = /Some transitions were of an unknown kind and are now cross-dissolves/;
  const OPTION = /Some transition options were unknown and were set to the defaults/;
  const LENGTH = /Some transition lengths were out of range and were adjusted/;
  const CUT = /Some transitions weren’t on a cut between two touching clips and were left out/;

  /**
   * The first clip's transition replaced by `transition`.
   * @param transition the new transition
   * @returns the change for a document
   */
  const withTransition = (transition: unknown) => (doc: Doc) => ({
    ...doc,
    clips: doc.clips.map((clip, index) => (index === 0 ? { ...clip, transition } : clip)),
  });
  /**
   * The first clip's transition is `expected` (undefined: none), the second's as written, and the reasons `reasons`.
   * @param expected the first clip's transition
   * @param reasons the reasons expected
   * @returns the check for a gated document
   */
  const firstIs =
    (expected: Record<string, unknown> | undefined, ...reasons: RegExp[]) =>
    (project: Gated, projectDoc: Doc) => {
      const [p6, v7, p8] = ids(projectDoc);
      if (expected === undefined) expect('transition' in project.doc.clips[0]).toBe(false);
      else expect(transitionOf(project, p6)).toEqual({ to: v7, ...expected });
      expect(transitionOf(project, v7)).toEqual({ kind: 'wipe', dur: 0.6, to: p8, dir: 'right' });
      expect(project.dropped).toEqual(reasons.map((re): unknown => expect.stringMatching(re)));
    };
  /**
   * A transition into the second clip with these fields.
   * @param fields the transition's fields
   * @returns the change for a document
   */
  const into = (fields: Record<string, unknown>) => (doc: Doc) => withTransition({ to: ids(doc)[1], ...fields })(doc);

  const bad: [string, (d: Doc) => unknown, (r: Gated, d: Doc) => void][] = [
    ['a transition that is text', withTransition('dissolve'), firstIs(undefined, UNREAD)],
    ['a transition that is an array', withTransition([{ kind: 'dissolve' }]), firstIs(undefined, UNREAD)],
    ['a transition that is a number', withTransition(3), firstIs(undefined, UNREAD)],
    ['a transition that is null', withTransition(null), firstIs(undefined)],
    ['a missing kind', into({ dur: 1 }), firstIs({ kind: 'dissolve', dur: 1 }, KIND)],
    ['an unknown kind', into({ kind: 'spin', dur: 1 }), firstIs({ kind: 'dissolve', dur: 1 }, KIND)],
    ['a kind that is a number', into({ kind: 2, dur: 1 }), firstIs({ kind: 'dissolve', dur: 1 }, KIND)],
    ['a missing length', into({ kind: 'zoom' }), firstIs({ kind: 'zoom', dur: 0.5 }, LENGTH)],
    ['a length that is text', into({ kind: 'zoom', dur: '1' }), firstIs({ kind: 'zoom', dur: 0.5 }, LENGTH)],
    [
      'a length that isn’t a number (NaN → null)',
      into({ kind: 'zoom', dur: NaN }),
      firstIs({ kind: 'zoom', dur: 0.5 }, LENGTH),
    ],
    ['a length of 0', into({ kind: 'zoom', dur: 0 }), firstIs({ kind: 'zoom', dur: 0.1 }, LENGTH)],
    ['a negative length', into({ kind: 'zoom', dur: -2 }), firstIs({ kind: 'zoom', dur: 0.1 }, LENGTH)],
    ['a length over 3 s', into({ kind: 'zoom', dur: 10 }), firstIs({ kind: 'zoom', dur: 3 }, LENGTH)],
    [
      'a length off the frame grid (rounded down, no reason)',
      into({ kind: 'zoom', dur: 0.51 }),
      firstIs({ kind: 'zoom', dur: 0.5 }),
    ],
    [
      'an unknown wipe direction',
      into({ kind: 'wipe', dur: 1, dir: 'diagonal' }),
      firstIs({ kind: 'wipe', dur: 1, dir: 'left' }, OPTION),
    ],
    [
      'a slide direction that is a number',
      into({ kind: 'slide', dur: 1, dir: 1 }),
      firstIs({ kind: 'slide', dur: 1, dir: 'left' }, OPTION),
    ],
    [
      'a missing wipe direction (the default, no reason)',
      into({ kind: 'wipe', dur: 1 }),
      firstIs({ kind: 'wipe', dur: 1, dir: 'left' }),
    ],
    [
      'an unknown dip colour',
      into({ kind: 'dip', dur: 1, colour: 'red' }),
      firstIs({ kind: 'dip', dur: 1, colour: 'black' }, OPTION),
    ],
    [
      'options a kind doesn’t have (left out, no reason)',
      into({ kind: 'dissolve', dur: 1, dir: 'up', colour: 'white' }),
      firstIs({ kind: 'dissolve', dur: 1 }),
    ],
    ['a missing `to`', withTransition({ kind: 'dissolve', dur: 1 }), firstIs(undefined, CUT)],
    ['a `to` that is a number', withTransition({ kind: 'dissolve', dur: 1, to: 7 }), firstIs(undefined, CUT)],
    ['a `to` naming no clip', withTransition({ kind: 'dissolve', dur: 1, to: 'nobody' }), firstIs(undefined, CUT)],
    [
      'a `to` naming a clip that doesn’t start at its end',
      (doc) => withTransition({ kind: 'dissolve', dur: 1, to: ids(doc)[2] })(doc),
      firstIs(undefined, CUT),
    ],
    [
      'a transition on the last clip',
      (doc) => ({
        ...doc,
        clips: doc.clips.map((clip, index) =>
          index === 3 ? { ...clip, transition: { kind: 'dissolve', dur: 0.2, to: ids(doc)[0] } } : clip,
        ),
      }),
      (project, projectDoc) => {
        expect('transition' in project.doc.clips[3]).toBe(false);
        expect(transitionOf(project, ids(projectDoc)[0])).toEqual({ kind: 'dissolve', dur: 1, to: ids(projectDoc)[1] });
        expect(project.dropped).toEqual([expect.stringMatching(CUT)]);
      },
    ],
    [
      'extra fields (left out, no reason)',
      into({ kind: 'dissolve', dur: 1, speed: 2, note: 'x' }),
      firstIs({ kind: 'dissolve', dur: 1 }),
    ],
    [
      'a __proto__ field (left out, no reason)',
      (doc) =>
        JSON.parse(
          JSON.stringify(into({ kind: 'dissolve', dur: 1 })(doc)).replace(
            '"kind":"dissolve"',
            '"__proto__":{"polluted":1},"kind":"dissolve"',
          ),
        ) as unknown,
      firstIs({ kind: 'dissolve', dur: 1 }),
    ],
    [
      'a length longer than its clips leave room for (shortened, no reason)',
      (doc) => ({
        ...doc,
        clips: doc.clips.map((clip, index) =>
          index === 2 ? { ...clip, transition: { kind: 'dissolve', dur: 2, to: ids(doc)[3] } } : clip,
        ),
      }),
      (project, doc) => {
        // The last clip is 0.33 s: room 0.66 s, on frames 19 / 30 s.
        expect(transitionOf(project, ids(doc)[2])).toEqual({ kind: 'dissolve', dur: 19 / 30, to: ids(doc)[3] });
        expect(project.dropped).toEqual([]);
      },
    ],
  ];

  it('has at least 20 malformed documents', () => expect(bad.length).toBeGreaterThanOrEqual(20));

  it.each(bad)('%s: never throws, keeps what it can and says why', (_, make, check) => {
    const doc = fixture();
    let project: Gated | undefined;
    expect(() => (project = mergeProject(JSON.parse(JSON.stringify(make(doc))), true))).not.toThrow();
    check(defined(project), doc);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('writes transitions only where there are some, and round-trips document → gate → document equal', () => {
    const doc = fixture();
    expect(doc.clips.map((clip) => 'transition' in clip)).toEqual([true, true, false, false]);
    const text = JSON.stringify(doc);
    const once = mergeProject(JSON.parse(text), true);
    expect(once.dropped).toEqual([]);
    expect(toDocument(once.doc)).toEqual(doc);
    expect(JSON.stringify(toDocument(once.doc))).toBe(text);
  });

  it.each(fixtures)('%s: a 201–205 document without transitions stays byte-identical', (_, project) => {
    const once = mergeProject(legacyDoc(project), true).doc;
    const text = JSON.stringify(toDocument(once));
    expect(text).not.toMatch(/"transition"/);
    const back = mergeProject(JSON.parse(text), true);
    expect(back.dropped).toEqual([]);
    expect(JSON.stringify(toDocument(back.doc))).toBe(text);
  });
});

/* ---------- 206 T040: the sound plan across transitions (AC-6, AC-13) ---------- */

describe('audioPlan with transitions (206 AC-6)', () => {
  const videoClip = (id: string, start: number, len: number, transition?: Transition) =>
    ({
      id,
      track: MAIN_VIDEO,
      start,
      kind: 'video',
      dur: 0,
      in: 2,
      out: 2 + len,
      volume: 0.9,
      ...(transition ? { transition } : {}),
    }) as TimedClip;
  const project = (clips: TimedClip[]): Project => ({
    tracks: defaultTracks(),
    clips,
    audio: [],
    layers: [],
    fadeOut: false,
  });

  it('each kind: the sources play into their handles with the transition’s edges instead of the 0.03 s ramps', () => {
    const fixture = project([
      videoClip('a', 0, 3, { kind: 'dissolve', dur: 1, to: 'b' }),
      videoClip('b', 3, 3, { kind: 'dip', dur: 0.5, to: 'c', colour: 'black' }),
      videoClip('c', 6, 2),
    ]);
    expect(audioPlan(fixture)).toEqual([
      { ref: 'a', start: 0, end: 3, from: 2, volume: 0.9, fadeIn: 0.03, fadeOut: 0, trail: 0.5, edgeOut: 'power' },
      {
        ref: 'b',
        start: 3,
        end: 6,
        from: 2,
        volume: 0.9,
        fadeIn: 0,
        fadeOut: 0,
        lead: 0.5,
        edgeIn: 'power',
        trail: 0.25,
        edgeOut: 'dip',
      },
      { ref: 'c', start: 6, end: 8, from: 2, volume: 0.9, fadeIn: 0, fadeOut: 0.03, lead: 0.25, edgeIn: 'dip' },
    ]);
    for (const kind of ['wipe', 'slide', 'zoom'] as const) {
      const scene = project([videoClip('a', 0, 3, { kind, dur: 1, to: 'b' }), videoClip('b', 3, 3)]);
      expect(audioPlan(scene).map((source) => [source.edgeOut, source.edgeIn])).toEqual([
        ['power', undefined],
        [undefined, 'power'],
      ]);
    }
  });

  it('a cut without a transition keeps 205’s sources exactly (no new fields)', () => {
    const fixture = project([videoClip('a', 0, 3), videoClip('b', 3, 3)]);
    expect(audioPlan(fixture)).toEqual([
      { ref: 'a', start: 0, end: 3, from: 2, volume: 0.9, fadeIn: 0.03, fadeOut: 0.03 },
      { ref: 'b', start: 3, end: 6, from: 2, volume: 0.9, fadeIn: 0.03, fadeOut: 0.03 },
    ]);
    expect(audioPlan(fixture).every((source) => !('lead' in source) && !('trail' in source))).toBe(true);
  });
});

describe('207: clips’ sound at speed in the export (AC-6, Q8)', () => {
  type SC = TimedClip & { volume: number };
  /**
   * A video clip on the main track at volume 1.
   * @param id its id
   * @param start its start
   * @param part its source part
   * @param fields its speed fields
   * @returns the clip
   */
  const video = (id: string, start: number, part: [number, number], fields: SpeedFields = {}): SC => ({
    id,
    track: MAIN_VIDEO,
    start,
    kind: 'video',
    in: part[0],
    out: part[1],
    dur: fields.freeze === undefined ? 0 : 2,
    volume: 1,
    ...fields,
  });
  const project = (clips: SC[]): Project<SC> => ({ tracks: defaultTracks(), clips, audio: [], layers: [], fadeOut: false });
  const plan = (clips: SC[]) => audioPlan(project(pack(clips)));

  it('a clip from 0.5× to 2× sounds at its speed as its rate; at 1× it has none', () => {
    const sources = plan([
      video('one', 0, [0, 2]),
      video('fast', 0, [1, 5], { speed: 2 }),
      video('slow', 0, [0, 1], { speed: 0.5 }),
      video('edge', 0, [0, 1.5], { speed: 1.5 }),
    ]);
    expect(sources.map((source) => [source.ref, source.start, source.end, source.from, source.rate])).toEqual([
      ['one', 0, 2, 0, undefined],
      ['fast', 2, 4, 1, 2],
      ['slow', 4, 6, 0, 0.5],
      ['edge', 6, 7, 0, 1.5],
    ]);
    expect('rate' in defined(sources[0])).toBe(false);
  });

  it('outside 0.5–2×, reversed, ramped and frozen clips are left out', () => {
    const sources = plan([
      video('one', 0, [0, 2]),
      video('quick', 0, [0, 3], { speed: 3 }),
      video('crawl', 0, [0, 0.4], { speed: 0.4 }),
      video('back', 0, [0, 2], { reverse: true }),
      video('ramp', 0, [0, 2], { ramp: [...RAMP_PRESETS.hero] }),
      video('still', 0, [0, 2], { freeze: 1 }),
      video('last', 0, [0, 1]),
    ]);
    expect(sources.map((source) => source.ref)).toEqual(['one', 'last']);
  });

  it('soundMuted says why a clip is silent, and nothing for one that sounds', () => {
    const clip = video('c', 0, [0, 2]);
    expect(soundMuted(clip)).toBeNull();
    expect(soundMuted({ ...clip, speed: 2 })).toBeNull();
    expect(soundMuted({ ...clip, speed: 0.5 })).toBeNull();
    expect(soundMuted({ ...clip, speed: 3 })).toBe('Sound plays from 0.5× to 2×: at 3× this clip is silent.');
    expect(soundMuted({ ...clip, speed: 0.25 })).toBe('Sound plays from 0.5× to 2×: at 0.25× this clip is silent.');
    expect(soundMuted({ ...clip, reverse: true })).toBe('A reversed clip plays without sound.');
    expect(soundMuted({ ...clip, ramp: [...RAMP_PRESETS.hero] })).toBe('A clip with a speed ramp plays without sound.');
    expect(soundMuted({ ...clip, freeze: 1 })).toBe('A freeze frame has no sound.');
    expect(SOUND_SPEEDS).toEqual({ min: 0.5, max: 2 });
  });
});

/* ---------- 207 T060: speed, reverse, ramps and freeze frames in the document (AC-9) ---------- */

describe('speed in the document (207 AC-9)', () => {
  /**
   * The mixed 2.x project: photo 3 s, video (source 2–6.5 of a 7.5 s file), photo 1.5 s, video 0.33 s.
   * @returns its document
   */
  const fixture = () => toDocument(mergeProject(legacyDoc(legacyFixtures().mixed), true).doc);
  type Doc = ReturnType<typeof fixture>;
  type Gated = ReturnType<typeof mergeProject>;
  const UNREAD = /Some speed settings couldn’t be read and were left out/;
  const RANGE = /Some clip speeds were out of range and were adjusted/;
  const RAMP = /Some speed ramps couldn’t be read or had too few or too many points and were left out/;
  const MENDED = /Some speed ramps were out of order or incomplete and were mended/;
  const BOTH = /Some clips had a speed ramp with reverse or a constant speed; the ramp was kept/;
  const FREEZE = /Some freeze frames were outside their video or out of length and were adjusted/;
  const STILL = /Some freeze frames had speed settings, which were left out/;

  /**
   * The video clip (the second) with these fields added.
   * @param fields the document's fields
   * @returns the change for a document
   */
  const onVideo = (fields: Record<string, unknown>) => (doc: Doc) => ({
    ...doc,
    clips: doc.clips.map((clip, index) => (index === 1 ? { ...clip, ...fields } : clip)),
  });
  /**
   * The video clip's speed fields are `expected` and the reasons `reasons`.
   * @param expected the speed fields (and `dur` for a freeze frame) expected
   * @param reasons the reasons expected
   * @returns the check for a gated document
   */
  const videoHas =
    (expected: Record<string, unknown>, ...reasons: RegExp[]) =>
    (project: Gated) => {
      const clip = defined(project.doc.clips[1]);
      const fields = ['speed', 'reverse', 'ramp', 'rampSpan', 'freeze'] as const;
      const got: Record<string, unknown> = {};
      for (const field of fields) if (field in clip) got[field] = clip[field];
      if ('dur' in expected) got.dur = clip.dur;
      expect(got).toEqual(expected);
      expect(project.dropped).toEqual(reasons.map((re): unknown => expect.stringMatching(re)));
    };
  const ramp = (...pairs: [number, number][]) => pairs.map(([at, speed]) => ({ at, v: speed }));

  const bad: [string, (d: Doc) => unknown, (r: Gated) => void][] = [
    ['a speed that is text', onVideo({ speed: 'fast' }), videoHas({}, UNREAD)],
    ['a speed that isn’t a number (NaN → null)', onVideo({ speed: NaN }), videoHas({})],
    ['a speed of 0', onVideo({ speed: 0 }), videoHas({ speed: 0.1 }, RANGE)],
    ['a negative speed', onVideo({ speed: -3 }), videoHas({ speed: 0.1 }, RANGE)],
    ['a speed over 10×', onVideo({ speed: 50 }), videoHas({ speed: 10 }, RANGE)],
    ['a speed of 1 (not kept)', onVideo({ speed: 1 }), videoHas({})],
    ['reverse that is text', onVideo({ reverse: 'yes' }), videoHas({}, UNREAD)],
    ['reverse false (not kept)', onVideo({ reverse: false }), videoHas({})],
    ['a ramp that is text', onVideo({ ramp: 'hero' }), videoHas({}, RAMP)],
    ['a ramp of 1 point', onVideo({ ramp: ramp([0, 2]) }), videoHas({}, RAMP)],
    [
      'a ramp of 11 points',
      onVideo({ ramp: Array.from({ length: 11 }, (_, index) => ({ at: index / 10, v: 1 })) }),
      videoHas({}, RAMP),
    ],
    [
      'a ramp with an unreadable point',
      onVideo({ ramp: [{ at: 0, v: 1 }, { at: 0.5, v: 'x' }, null, { at: 1, v: 2 }] }),
      videoHas({ ramp: ramp([0, 1], [1, 2]) }, MENDED),
    ],
    [
      'a ramp left with 1 readable point',
      onVideo({ ramp: [{ at: 0, v: 1 }, { at: 'x', v: 2 }] }),
      videoHas({}, RAMP),
    ],
    [
      'a ramp out of order',
      onVideo({ ramp: ramp([1, 2], [0, 1], [0.5, 3]) }),
      videoHas({ ramp: ramp([0, 1], [0.5, 3], [1, 2]) }, MENDED),
    ],
    [
      'a ramp whose ends aren’t at 0 and 1',
      onVideo({ ramp: ramp([0.2, 1], [0.8, 2]) }),
      videoHas({ ramp: ramp([0, 1], [1, 2]) }, MENDED),
    ],
    [
      'a ramp with two points at one place',
      onVideo({ ramp: ramp([0, 1], [0.5, 2], [0.5, 3], [1, 1]) }),
      videoHas({ ramp: ramp([0, 1], [0.5, 2], [1, 1]) }, MENDED),
    ],
    [
      'a ramp with places outside 0–1',
      onVideo({ ramp: ramp([-1, 1], [0.5, 2], [3, 1]) }),
      videoHas({ ramp: ramp([0, 1], [0.5, 2], [1, 1]) }, MENDED),
    ],
    [
      'ramp speeds out of range',
      onVideo({ ramp: ramp([0, 50], [1, 0]) }),
      videoHas({ ramp: ramp([0, 10], [1, 0.1]) }, RANGE),
    ],
    [
      'a ramp with reverse',
      onVideo({ ramp: ramp([0, 1], [1, 2]), reverse: true }),
      videoHas({ ramp: ramp([0, 1], [1, 2]) }, BOTH),
    ],
    [
      'a ramp with a speed',
      onVideo({ ramp: ramp([0, 1], [1, 2]), speed: 3 }),
      videoHas({ ramp: ramp([0, 1], [1, 2]) }, BOTH),
    ],
    [
      'a ramp span that isn’t two numbers',
      onVideo({ ramp: ramp([0, 1], [1, 2]), rampSpan: ['a', 2] }),
      videoHas({}, RAMP),
    ],
    [
      'a ramp span that ends before it starts',
      onVideo({ ramp: ramp([0, 1], [1, 2]), rampSpan: [5, 3] }),
      videoHas({}, RAMP),
    ],
    ['a ramp span without a ramp (not kept)', onVideo({ rampSpan: [1, 7] }), videoHas({})],
    ['a freeze frame that is text', onVideo({ freeze: 'x' }), videoHas({}, UNREAD)],
    ['a freeze frame before the file', onVideo({ freeze: -1, dur: 2 }), videoHas({ freeze: 0, dur: 2 }, FREEZE)],
    ['a freeze frame past the file', onVideo({ freeze: 40, dur: 2 }), videoHas({ freeze: 7.5, dur: 2 }, FREEZE)],
    ['a freeze frame of 500 s', onVideo({ freeze: 3, dur: 500 }), videoHas({ freeze: 3, dur: 60 }, FREEZE)],
    ['a freeze frame without a length', onVideo({ freeze: 3 }), videoHas({ freeze: 3, dur: 2 }, FREEZE)],
    [
      'a freeze frame with a speed, reverse and a ramp',
      onVideo({ freeze: 3, dur: 2, speed: 2, reverse: true, ramp: ramp([0, 1], [1, 2]) }),
      videoHas({ freeze: 3, dur: 2 }, STILL),
    ],
    [
      'speed fields on a photo',
      (doc) => ({ ...doc, clips: doc.clips.map((clip, index) => (index === 0 ? { ...clip, speed: 2, freeze: 1 } : clip)) }),
      (project) => {
        expect(['speed' in project.doc.clips[0], 'freeze' in project.doc.clips[0]]).toEqual([false, false]);
        expect(project.dropped).toEqual([expect.stringMatching(UNREAD)]);
      },
    ],
    [
      'a polluting ramp point',
      (doc) =>
        JSON.parse(
          JSON.stringify(onVideo({ ramp: ramp([0, 1], [1, 2]) })(doc)).replace('{"at":0,', '{"__proto__":{"polluted":1},"at":0,'),
        ) as unknown,
      videoHas({ ramp: ramp([0, 1], [1, 2]) }),
    ],
  ];

  it('has at least 20 malformed documents', () => expect(bad.length).toBeGreaterThanOrEqual(20));

  it.each(bad)('%s: never throws, mends or drops with the reason, and round-trips', (_, make, check) => {
    const doc = fixture();
    let project: Gated | undefined;
    expect(() => (project = mergeProject(JSON.parse(JSON.stringify(make(doc))), true))).not.toThrow();
    check(defined(project));
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    const again = mergeProject(JSON.parse(JSON.stringify(toDocument(defined(project).doc))), true);
    expect(again.dropped).toEqual([]);
    expect(again.doc).toEqual(defined(project).doc);
  });

  it.each([
    ['a speed', { speed: 2 }],
    ['reverse at 0.5×', { speed: 0.5, reverse: true }],
    ['a ramp', { ramp: ramp([0, 3], [0.5, 0.5], [1, 3]) }],
    ['a ramp over its span', { ramp: ramp([0, 1], [1, 2]), rampSpan: [1, 7] }],
    ['a freeze frame', { freeze: 4.25, dur: 1.5 }],
  ])('%s is read without a reason, written, and round-trips gate → document → gate byte-identical', (_, fields) => {
    // The main track is Magnetic: a clip's new length moves the later clips once.
    const once = mergeProject(JSON.parse(JSON.stringify(onVideo(fields)(fixture()))), true);
    expect(once.dropped).toEqual([]);
    expect(once.doc.clips[1]).toMatchObject(fields);
    const text = JSON.stringify(toDocument(once.doc));
    expect(toDocument(once.doc).clips[1]).toMatchObject(fields);
    expect(JSON.stringify(toDocument(mergeProject(JSON.parse(text), true).doc))).toBe(text);
  });

  it.each(fixtures)('%s: a 201–206 document without speed changes stays byte-identical', (_, project) => {
    const once = mergeProject(legacyDoc(project), true).doc;
    const text = JSON.stringify(toDocument(once));
    expect(text).not.toMatch(/"(speed|reverse|ramp|rampSpan|freeze)"/);
    const back = mergeProject(JSON.parse(text), true);
    expect(back.dropped).toEqual([]);
    expect(JSON.stringify(toDocument(back.doc))).toBe(text);
  });
});

/* ---------- 208 T020: sound clips in the sound plan (AC-2, AC-3, Q6) ---------- */

describe('sound clips in the sound plan (208 AC-2, AC-3, Q6)', () => {
  type SC = TimedClip & { volume: number };
  const main: SC = { id: 'v', track: MAIN_VIDEO, start: 0, kind: 'video', in: 0, out: 10, dur: 0, volume: 1 };
  const audioTrack = (id: string, patch: Partial<Track>): Track => ({
    id,
    kind: 'audio',
    name: id,
    hidden: false,
    muted: false,
    locked: false,
    ...patch,
  });
  const sound = (id: string, track: string, start: number, patch: Partial<AudioClip> = {}): AudioClip => ({
    id,
    track,
    start,
    in: 0,
    out: 4,
    volume: 1,
    toEnd: false,
    srcDur: 60,
    ...patch,
  });
  const gain: Keyframe[] = [
    { t: 0, v: 0.5, ease: 'linear' },
    { t: 4, v: 1.8, ease: 'linear' },
  ];
  // The video is 10 s. Tracks in this order: Music, Voice (A3), Effects (A2), so the plan follows the tracks, not ids.
  const fixture = (a2: Partial<Track> = {}, a3: Partial<Track> = {}): Project<SC> => ({
    tracks: [...defaultTracks(), audioTrack('A3', { role: 'voice', ...a3 }), audioTrack('A2', { role: 'effects', ...a2 })],
    clips: [main],
    audio: [
      { id: 'music', track: MUSIC, start: 0, in: 2, volume: 0.6, toEnd: true, srcDur: 60 },
      sound('s1', 'A2', 1, { in: 0.5, out: 3.5, volume: 1.5, fadeIn: 0.5, fadeOut: 1, name: 'Whoosh' }),
      sound('s2', 'A3', 2, { keys: { volume: gain } }),
      sound('quiet', 'A3', 6, { volume: 0 }),
      // Runs past the video's end (10 s): cut there, fading out at the cut.
      sound('s4', 'A2', 8, { out: 6, fadeOut: 0.5 }),
      // Starts after the video's end: never heard.
      sound('late', 'A2', 11),
    ],
    layers: [],
    fadeOut: false,
  });
  const video = { ref: 'v', start: 0, end: 10, from: 0, volume: 1, fadeIn: 0.03, fadeOut: 0.03 };
  const music = { ref: 'music', track: MUSIC, role: 'music', start: 0, end: 10, from: 2, volume: 0.6, fadeIn: 0, fadeOut: 1.5 };
  const s2 = { ref: 's2', track: 'A3', role: 'voice', start: 2, end: 6, from: 0, volume: 1, gain, fadeIn: 0, fadeOut: 0 };
  const s1 = { ref: 's1', track: 'A2', role: 'effects', start: 1, end: 4, from: 0.5, volume: 1.5, fadeIn: 0.5, fadeOut: 1 };
  const s4 = { ref: 's4', track: 'A2', role: 'effects', start: 8, end: 10, from: 0, volume: 1, fadeIn: 0, fadeOut: 0.5 };

  it('lists the sound clips after the clips’ sounds, track by track in the tracks’ order, with fades, keys, track and role', () => {
    expect(audioPlan(fixture())).toEqual([video, music, s2, s1, s4]);
  });

  it('sound past the video’s end is cut there, and never lengthens the video (Q6)', () => {
    const plan = audioPlan(fixture());
    expect(plan.every((source) => source.end <= 10)).toBe(true);
    expect(plan.some((source) => source.ref === 'late')).toBe(false);
    expect(projectLength(fixture())).toBe(10);
  });

  it('a muted track adds nothing; Solo is the preview’s only (Q2), the export hears every unmuted track', () => {
    expect(audioPlan(fixture({ muted: true }))).toEqual([video, music, s2]);
    expect(audioPlan(fixture({}, { muted: true }))).toEqual([video, music, s1, s4]);
    expect(audioPlan(fixture({}, { solo: true }))).toEqual(audioPlan(fixture()));
  });

  it('the migrated music fades out over min(1.5 s, a third of the video); a set fade-out is kept', () => {
    const short = { ...fixture(), clips: [{ ...main, out: 3 }] };
    expect(audioPlan(short).find((source) => source.ref === 'music')).toMatchObject({ end: 3, fadeOut: 1 });
    const faded = fixture();
    faded.audio = faded.audio.map((clip) => (clip.id === 'music' ? { ...clip, fadeOut: 4, fadeIn: 2 } : clip));
    expect(audioPlan(faded).find((source) => source.ref === 'music')).toMatchObject({ fadeIn: 2, fadeOut: 4 });
  });

  it('a sound clip keyed above 0 is heard at a stored volume of 0; all keys at 0 is silent', () => {
    const project = fixture();
    project.audio = [sound('k', 'A2', 0, { volume: 0, keys: { volume: gain } }), sound('z', 'A2', 5, { volume: 1, keys: { volume: [{ t: 0, v: 0, ease: 'linear' }] } })];
    expect(audioPlan(project).map((source) => source.ref)).toEqual(['v', 'k']);
  });
});

/* ---------- 208 T080: sound clips, sound tracks and loudness in the document (AC-3, AC-11) ---------- */

describe('sound in the document (208 AC-11)', () => {
  /**
   * The 2.x project with its song (photo 2 s, video 4 s: a 6 s video), with a Voice track (A2) and an Effects track
   * (A3), a whoosh and a voice clip on them, and their media.
   * @returns its document, as the app writes it
   */
  const fixture = () => {
    const doc = toDocument(mergeProject(legacyDoc(legacyFixtures().musicOffset), true).doc);
    const soundMedia = (id: string, srcDur: number) => ({ id, kind: 'audio' as const, name: `${id}.wav`, type: 'audio/wav', size: 100, w: 0, h: 0, srcDur });
    return {
      ...doc,
      tracks: [
        ...doc.tracks,
        { id: 'A2', kind: 'audio' as const, name: 'Voice', hidden: false, muted: false, locked: false },
        { id: 'A3', kind: 'audio' as const, name: 'Audio 3', hidden: false, muted: false, locked: false },
      ],
      audio: [
        ...doc.audio,
        { id: 'talk', track: 'A2', start: 1, media: 'mtalk', in: 0, out: 3, volume: 1, toEnd: false, srcDur: 10 },
        { id: 'whoosh', track: 'A3', start: 2, media: 'mwhoosh', in: 0.5, out: 1.5, volume: 1, toEnd: false, srcDur: 2 },
      ],
      media: [...doc.media, soundMedia('mtalk', 10), soundMedia('mwhoosh', 2)],
    };
  };
  type Doc = ReturnType<typeof fixture>;
  type Gated = ReturnType<typeof mergeProject>;
  const SOUND_RANGE = /Some sound volumes, fades or in and out points were out of range and were adjusted/;
  const SOUND_UNREAD = /Some sound settings couldn’t be read and were left out/;
  const OVERLAP = /Some sounds overlapped another sound on their track and were left out/;
  const TRACK_RANGE = /Some sound track volumes or ducking settings were out of range and were adjusted/;
  const TRACK_UNREAD = /Some sound track settings couldn’t be read and were left out/;
  const LOUDNESS_RANGE_REASON = /The loudness target was out of range and was adjusted/;
  const LOUDNESS_UNREAD = /The loudness target couldn’t be read, so loudness is off/;
  const MISSING = /A sound on a missing or picture track, or without its media, was left out/;
  const KEY_RANGE = /Some keyframe values were out of range and were adjusted/;

  /**
   * The document with the whoosh's fields changed.
   * @param fields the fields
   * @returns the change
   */
  const onWhoosh = (fields: Record<string, unknown>) => (doc: Doc) => ({
    ...doc,
    audio: doc.audio.map((sound) => (sound.id === 'whoosh' ? { ...sound, ...fields } : sound)),
  });
  /**
   * The document with track A3's fields changed.
   * @param fields the fields
   * @returns the change
   */
  const onEffects = (fields: Record<string, unknown>) => (doc: Doc) => ({
    ...doc,
    tracks: doc.tracks.map((track) => (track.id === 'A3' ? { ...track, ...fields } : track)),
  });
  const whoosh = (project: Gated) => project.doc.audio.find((sound) => sound.id === 'whoosh');
  const effects = (project: Gated) => defined(project.doc.tracks.find((track) => track.id === 'A3'));
  /**
   * The check: what is read and the reasons given.
   * @param check what the gated project must show
   * @param reasons the reasons, in order
   * @returns the check
   */
  const expectThat =
    (check: (project: Gated) => void, ...reasons: RegExp[]) =>
    (project: Gated) => {
      check(project);
      expect(project.dropped).toEqual(reasons.map((re): unknown => expect.stringMatching(re)));
    };
  const whooshHas = (fields: Record<string, unknown>, ...reasons: RegExp[]) =>
    expectThat((project) => expect(whoosh(project)).toMatchObject(fields), ...reasons);
  const effectsHas = (fields: Record<string, unknown>, ...reasons: RegExp[]) =>
    expectThat((project) => expect(effects(project)).toMatchObject(fields), ...reasons);
  const loudnessIs = (loudness: number | undefined, ...reasons: RegExp[]) =>
    expectThat((project) => expect(project.doc.loudness).toBe(loudness), ...reasons);
  const key = (time: number, value: number) => ({ t: time, v: value, ease: 'linear' });

  const bad: [string, (d: Doc) => unknown, (r: Gated) => void][] = [
    ['a volume over 200 %', onWhoosh({ volume: 3 }), whooshHas({ volume: 2 }, SOUND_RANGE)],
    ['a negative volume', onWhoosh({ volume: -1 }), whooshHas({ volume: 0 }, SOUND_RANGE)],
    ['a volume that is text', onWhoosh({ volume: 'loud' }), whooshHas({ volume: 0.8 }, SOUND_UNREAD)],
    ['an out point past the file', onWhoosh({ out: 9 }), whooshHas({ in: 0.5, out: 2 }, SOUND_RANGE)],
    ['an out point before the in point', onWhoosh({ out: 0.2 }), whooshHas({ in: 0.5, out: 2 }, SOUND_RANGE)],
    ['a clip that isn’t toEnd without an out point', onWhoosh({ out: undefined }), whooshHas({ in: 0.5, out: 2 })],
    ['a fade over 10 s', onWhoosh({ fadeIn: 12, out: 2, in: 0, srcDur: 2 }), whooshHas({ fadeIn: 2 }, SOUND_RANGE)],
    ['a negative fade', onWhoosh({ fadeOut: -2 }), expectThat((project) => expect(defined(whoosh(project)).fadeOut).toBeUndefined(), SOUND_RANGE)],
    ['fades longer than the clip together', onWhoosh({ fadeIn: 0.75, fadeOut: 0.75 }), whooshHas({ fadeIn: 0.5, fadeOut: 0.5 }, SOUND_RANGE)],
    ['a fade that is text', onWhoosh({ fadeIn: 'slow' }), expectThat((project) => expect(defined(whoosh(project)).fadeIn).toBeUndefined(), SOUND_UNREAD)],
    ['a name that isn’t text', onWhoosh({ name: 42 }), expectThat((project) => expect(defined(whoosh(project)).name).toBeUndefined(), SOUND_UNREAD)],
    ['volume keys over 200 %', onWhoosh({ keys: { volume: [key(0, 1), key(0.5, 5)] } }), whooshHas({ keys: { volume: [key(0, 1), key(0.5, 2)] } }, KEY_RANGE)],
    ['keys for a value a sound has not', onWhoosh({ keys: { x: [key(0, 0.5)] } }), expectThat((project) => expect(defined(whoosh(project)).keys).toBeUndefined(), /Some keyframes couldn’t be read/)],
    [
      'two sounds overlapping on a track (the later one goes)',
      (doc) => ({ ...doc, audio: [...doc.audio, { ...defined(doc.audio.find((sound) => sound.id === 'whoosh')), id: 'whoosh2', start: 2.5 }] }),
      expectThat((project) => expect(project.doc.audio.map((sound) => sound.id)).toEqual(['music', 'talk', 'whoosh']), OVERLAP),
    ],
    [
      'a sound on a track that isn’t there',
      onWhoosh({ track: 'A7' }),
      expectThat((project) => expect(whoosh(project)).toBeUndefined(), MISSING),
    ],
    ['a role that isn’t one', onEffects({ role: 'drums' }), expectThat((project) => expect(effects(project).role).toBeUndefined(), TRACK_UNREAD)],
    ['a track volume over 200 %', onEffects({ volume: 5 }), effectsHas({ volume: 2 }, TRACK_RANGE)],
    ['a track volume that is text', onEffects({ volume: 'max' }), expectThat((project) => expect(effects(project).volume).toBeUndefined(), TRACK_UNREAD)],
    ['ducking out of range', onEffects({ duck: { amount: 50, threshold: -90 } }), effectsHas({ duck: { amount: 30, threshold: -60 } }, TRACK_RANGE)],
    ['ducking that isn’t settings', onEffects({ duck: 'yes' }), expectThat((project) => expect(effects(project).duck).toBeUndefined(), TRACK_UNREAD)],
    ['ducking on a Voice track', onEffects({ role: 'voice', duck: { amount: 12, threshold: -40 } }), expectThat((project) => expect(effects(project).duck).toBeUndefined(), TRACK_UNREAD)],
    ['solo and Counts as voice that are text', onEffects({ solo: 'on', voice: 'no' }), expectThat((project) => expect([effects(project).solo, effects(project).voice]).toEqual([undefined, undefined]), TRACK_UNREAD)],
    [
      'a ninth sound track',
      (doc) => ({
        ...doc,
        tracks: [...doc.tracks, ...[4, 5, 6, 7, 8, 9].map((number) => ({ id: `A${number}`, kind: 'audio' as const, name: `Audio ${number}`, hidden: false, muted: false, locked: false }))],
      }),
      expectThat(
        (project) => expect(project.doc.tracks.filter((track) => track.kind === 'audio')).toHaveLength(8),
        /A project holds up to 8 picture and 8 sound tracks here; “Audio 9” was left out/,
      ),
    ],
    ['a loudness over −9 LUFS', (doc) => ({ ...doc, loudness: 0 }), loudnessIs(-9, LOUDNESS_RANGE_REASON)],
    ['a loudness under −24 LUFS', (doc) => ({ ...doc, loudness: -60 }), loudnessIs(-24, LOUDNESS_RANGE_REASON)],
    ['a loudness that is text', (doc) => ({ ...doc, loudness: 'loud' }), loudnessIs(undefined, LOUDNESS_UNREAD)],
  ];

  it('has at least 20 malformed documents', () => expect(bad.length).toBeGreaterThanOrEqual(20));

  it.each(bad)('%s: never throws, mends or drops with the reason, and round-trips', (_, make, check) => {
    let project: Gated | undefined;
    expect(() => (project = mergeProject(JSON.parse(JSON.stringify(make(fixture()))), true))).not.toThrow();
    check(defined(project));
    const again = mergeProject(JSON.parse(JSON.stringify(toDocument(defined(project).doc))), true);
    expect(again.dropped).toEqual([]);
    expect(again.doc).toEqual(defined(project).doc);
  });

  it('a project with every new field reads without a reason, and round-trips document → gate → document byte-identical', () => {
    const every = {
      ...fixture(),
      loudness: -16,
      tracks: fixture().tracks.map((track) => {
        if (track.id === 'A1') return { ...track, volume: 0.7, duck: { amount: 9, threshold: -45 } };
        if (track.id === 'A2') return { ...track, role: 'voice', solo: true };
        if (track.id === 'A3') return { ...track, role: 'effects', voice: false, volume: 1.5 };
        return track;
      }),
      audio: fixture().audio.map((sound) =>
        sound.id === 'whoosh' ? { ...sound, volume: 1.8, fadeIn: 0.2, fadeOut: 0.3, name: 'whoosh.wav', keys: { volume: [key(0, 0.5), key(0.8, 1.6)] } } : sound,
      ),
    };
    const once = mergeProject(JSON.parse(JSON.stringify(every)), true);
    expect(once.dropped).toEqual([]);
    expect(once.doc.loudness).toBe(-16);
    expect(once.doc.tracks.find((track) => track.id === 'A1')).toMatchObject({ volume: 0.7, duck: { amount: 9, threshold: -45 } });
    expect(once.doc.tracks.find((track) => track.id === 'A2')).toMatchObject({ role: 'voice', solo: true });
    expect(once.doc.tracks.find((track) => track.id === 'A3')).toMatchObject({ role: 'effects', voice: false, volume: 1.5 });
    expect(whoosh(once)).toMatchObject({ volume: 1.8, fadeIn: 0.2, fadeOut: 0.3, name: 'whoosh.wav', out: 1.5, keys: { volume: [key(0, 0.5), key(0.8, 1.6)] } });
    const text = JSON.stringify(toDocument(once.doc));
    const back = mergeProject(JSON.parse(text), true);
    expect(back.dropped).toEqual([]);
    expect(JSON.stringify(toDocument(back.doc))).toBe(text);
  });

  it.each(fixtures)('%s: a 2.x or 201–207 document stays byte-identical, with none of the new fields', (_, project) => {
    const once = mergeProject(legacyDoc(project), true).doc;
    const text = JSON.stringify(toDocument(once));
    const written = JSON.parse(text) as { loudness?: unknown; tracks: object[]; audio: object[] };
    expect(written.loudness).toBeUndefined();
    for (const track of written.tracks) expect(Object.keys(track)).toEqual(['id', 'kind', 'name', 'hidden', 'muted', 'locked']);
    for (const sound of written.audio) expect(Object.keys(sound)).toEqual(['id', 'track', 'start', 'media', 'in', 'volume', 'toEnd', 'srcDur']);
    const back = mergeProject(JSON.parse(text), true);
    expect(back.dropped).toEqual([]);
    expect(JSON.stringify(toDocument(back.doc))).toBe(text);
  });
});
