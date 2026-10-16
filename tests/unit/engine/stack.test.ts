import { describe, expect, it } from 'vitest';
import type { Box } from '@/engine/layers';
import { valueAt } from '@/engine/keyframes';
import { frameStack, mostVideosAt, snapBox } from '@/engine/stack';
import { MAIN_VIDEO, MUSIC, defaultTracks, type Track } from '@/engine/tracks';
import { framePlan, frameRange, pack, projectLength, videoAt, type Project, type TimedClip } from '@/engine/timeline';
import { legacyFixtures, type LegacyClip, type LegacyProject } from '../../support/timeline.testkit';
import type { Transition } from '@/engine/transitions';

/* ---------- helpers ---------- */

const clip = (id: string, track: string, start: number, len: number, kind: 'photo' | 'video' = 'photo'): TimedClip => ({
  id,
  track,
  start,
  kind,
  dur: kind === 'photo' ? len : 0,
  in: kind === 'video' ? 1 : 0,
  out: kind === 'video' ? 1 + len : 0,
});
const overlay = (id: string, patch: Partial<Track> = {}): Track => ({
  id,
  kind: 'overlay',
  name: `Overlay ${id}`,
  hidden: false,
  muted: false,
  locked: false,
  ...patch,
});
/** Tracks in drawing order: the main video track, the music, then the overlays given. */
const project = (clips: TimedClip[], overlays: Track[] = []): Project => ({
  tracks: [...defaultTracks(), ...overlays],
  clips,
  audio: [],
  layers: [],
  fadeOut: true,
});
const ids = (fixture: Project, time: number) => frameStack(fixture, time).map((draw) => draw.clip.id);

/** A 2.x project on tracks (as timeline.test.ts builds it). */
function onTracks(legacyProject: LegacyProject): Project<LegacyClip & TimedClip> {
  const clips = pack(legacyProject.clips.map((legacyClip) => ({ ...legacyClip, track: MAIN_VIDEO, start: 0 })));
  return { tracks: defaultTracks(), clips, audio: [], layers: legacyProject.layers, fadeOut: legacyProject.fadeOut };
}

/* ---------- frameStack ---------- */

describe('frameStack: the picture clips drawn at a time, bottom first', () => {
  // Main 0–6; overlay V2 1–2 and 4–5 (a gap between); overlay V3 1.5–4.5.
  const fixture = project(
    [
      clip('m', MAIN_VIDEO, 0, 6),
      clip('a', 'V2', 1, 1, 'video'),
      clip('b', 'V2', 4, 1),
      clip('c', 'V3', 1.5, 3, 'video'),
    ],
    [overlay('V2'), overlay('V3')],
  );

  it('lists every visible picture track’s clip in drawing order, with the seconds into it and its track', () => {
    expect(frameStack(fixture, 1.75)).toEqual([
      { clip: fixture.clips[0], local: 1.75, track: MAIN_VIDEO },
      { clip: fixture.clips[1], local: 0.75, track: 'V2' },
      { clip: fixture.clips[3], local: 0.25, track: 'V3' },
    ]);
    // Drawing order is the tracks array's, not the clips array's.
    const swapped = {
      ...fixture,
      tracks: [fixture.tracks[0], fixture.tracks[1], fixture.tracks[3], fixture.tracks[2]],
    };
    expect(ids(swapped, 1.75)).toEqual(['m', 'c', 'a']);
  });

  it('a gap on an overlay track leaves the tracks below it', () => {
    expect(ids(fixture, 3)).toEqual(['m', 'c']);
    expect(ids(fixture, 0.5)).toEqual(['m']);
    expect(ids(fixture, 4.75)).toEqual(['m', 'b']);
  });

  it('leaves hidden tracks out (the main track too)', () => {
    const hide = (id: string) => ({
      ...fixture,
      tracks: fixture.tracks.map((track) => (track.id === id ? { ...track, hidden: true } : track)),
    });
    expect(ids(hide('V2'), 1.75)).toEqual(['m', 'c']);
    expect(ids(hide(MAIN_VIDEO), 1.75)).toEqual(['a', 'c']);
    expect(ids(hide(MAIN_VIDEO), -1)).toEqual([]);
    expect(ids(hide(MAIN_VIDEO), 6)).toEqual([]);
  });

  it('ignores clips on audio or unknown tracks', () => {
    const scene = project(
      [...fixture.clips, clip('x', MUSIC, 0, 6), clip('y', 'V9', 0, 6)],
      [overlay('V2'), overlay('V3')],
    );
    expect(ids(scene, 1.75)).toEqual(['m', 'a', 'c']);
  });

  it('an overlay clip starting at 2.0 s first shows in frame 60 at 30 fps and is gone in the frame after its last', () => {
    const scene = project([clip('m', MAIN_VIDEO, 0, 6), clip('o', 'V2', 2, 1.5, 'video')], [overlay('V2')]);
    const [f0, f1] = frameRange(2, 3.5, 30);
    expect([f0, f1]).toEqual([60, 105]);
    expect(ids(scene, 59 / 30)).toEqual(['m']);
    expect(ids(scene, 60 / 30)).toEqual(['m', 'o']);
    expect(frameStack(scene, 60 / 30)[1].local).toBe(0);
    expect(ids(scene, 104 / 30)).toEqual(['m', 'o']);
    expect(ids(scene, 105 / 30)).toEqual(['m']);
    for (let index = 0; index < 180; index++)
      expect(ids(scene, index / 30).includes('o'), `frame ${index}`).toBe(index >= f0 && index < f1);
  });

  it('the main track clamps only before 0 and at or past the video’s end; black after it ends before an overlay does (Q9)', () => {
    // Main 0–4 (two clips), overlay 3–7: the video is 7 s long.
    const scene = project(
      [clip('m1', MAIN_VIDEO, 0, 2), clip('m2', MAIN_VIDEO, 2, 2), clip('o', 'V2', 3, 4, 'video')],
      [overlay('V2')],
    );
    expect(projectLength(scene)).toBe(7);
    expect(frameStack(scene, -1)).toEqual([{ clip: scene.clips[0], local: -1, track: MAIN_VIDEO }]);
    expect(ids(scene, 3.5)).toEqual(['m2', 'o']);
    expect(ids(scene, 4)).toEqual(['o']);
    expect(ids(scene, 6.99)).toEqual(['o']);
    // At or past the video's end: the main track's last clip, nothing from the overlay (no clamp there).
    expect(frameStack(scene, 7)).toEqual([{ clip: scene.clips[1], local: 5, track: MAIN_VIDEO }]);
    expect(ids(scene, 9)).toEqual(['m2']);
    // A main track starting later shows nothing before 0 (as videoAt).
    const late = project([clip('m', MAIN_VIDEO, 1, 2)]);
    expect(ids(late, -1)).toEqual([]);
    expect(ids(late, 0.5)).toEqual([]);
    expect(ids(late, 3)).toEqual(['m']);
    // An overlay track never clamps.
    const over = project([clip('o', 'V2', 0, 2)], [overlay('V2')]);
    expect(ids(over, -1)).toEqual([]);
    expect(ids(over, 2)).toEqual([]);
    expect(ids(project([]), 0)).toEqual([]);
  });

  it('a gap on the main track shows nothing there', () => {
    const scene = project([clip('a', MAIN_VIDEO, 0, 2), clip('b', MAIN_VIDEO, 3.5, 2)]);
    expect(ids(scene, 2)).toEqual([]);
    expect(ids(scene, 3.49)).toEqual([]);
    expect(ids(scene, 3.5)).toEqual(['b']);
  });
});

/* ---------- AC-10: without overlays, the stack is videoAt ---------- */

describe('for 201 / 202 projects the stack is exactly [videoAt] at every frame time (AC-10)', () => {
  const same = (fixture: Project, time: number) => {
    const want = videoAt(fixture, time);
    const got = frameStack(fixture, time);
    expect(
      got.map(({ clip, local }) => ({ clip, local })),
      `t = ${time}`,
    ).toEqual(want ? [want] : []);
    for (const draw of got) expect(draw.track).toBe(MAIN_VIDEO);
  };
  const frameTimes = (fixture: Project, fps: number) => {
    const frames = Math.max(1, Math.round(projectLength(fixture) * fps));
    const out = [-1, -1 / fps, projectLength(fixture), projectLength(fixture) + 3];
    for (let index = 0; index <= frames; index++) out.push(index / fps);
    return out;
  };

  it.each(Object.entries(legacyFixtures()))('%s at 30 and 60 fps', (name, lp) => {
    const fixture = onTracks(lp);
    for (const fps of name === 'clips500' ? [30] : [30, 60])
      for (const time of frameTimes(fixture, fps)) same(fixture, time);
  });

  it.each([
    ['gaps', [clip('a', MAIN_VIDEO, 0, 2), clip('b', MAIN_VIDEO, 3.5, 2), clip('c', MAIN_VIDEO, 6, 2, 'video')]],
    ['late start', [clip('a', MAIN_VIDEO, 1, 2), clip('b', MAIN_VIDEO, 3, 1)]],
    ['fractions', [clip('a', MAIN_VIDEO, 1 / 3, 0.37), clip('b', MAIN_VIDEO, 1.1, 0.1, 'video')]],
  ] as const)('202 %s at 30 and 60 fps', (_, clips) => {
    const fixture = project([...clips]);
    for (const fps of [30, 60]) for (const time of frameTimes(fixture, fps)) same(fixture, time);
    const hidden = { ...fixture, tracks: fixture.tracks.map((track) => ({ ...track, hidden: true })) };
    for (const time of frameTimes(hidden, 30)) same(hidden, time);
  });
});

describe('for 201 / 202 projects the stack is the export’s frame plan at every frame (AC-10)', () => {
  const agrees = (fixture: Project, fps: number) => {
    for (const span of framePlan(fixture, fps))
      for (let index = span.f0; index < span.f1; index++) {
        const got = frameStack(fixture, index / fps);
        if (span.clip) expect(got[0]?.clip, `${fps} fps, frame ${index}`).toBe(span.clip);
        else expect(got, `${fps} fps, frame ${index}`).toEqual([]);
      }
  };

  it.each(Object.entries(legacyFixtures()))('%s at 30 and 60 fps', (_, lp) => {
    const fixture = onTracks(lp);
    for (const fps of [30, 60]) agrees(fixture, fps);
  });

  it('202 projects with gaps at 30 and 60 fps', () => {
    const fixture = project([
      clip('a', MAIN_VIDEO, 1 / 3, 0.37),
      clip('b', MAIN_VIDEO, 1.1, 2),
      clip('c', MAIN_VIDEO, 3.5, 2),
    ]);
    for (const fps of [30, 60]) agrees(fixture, fps);
  });

  it('a clip ending a rounding hair after the next one starts: the frame on the edge is the later clip’s', () => {
    // a covers [0.2, 0.30000000000000004) (0.2 + 0.1 in floating point), b starts at 0.3 on an overlay track.
    const first = { ...clip('a', MAIN_VIDEO, 0.2, 0.1, 'video'), in: 0, out: 0.1 };
    const fixture = project([first, clip('b', 'V2', 0.3, 1, 'video')], [overlay('V2')]);
    expect(first.start + (first.out - first.in)).toBeGreaterThan(9 / 30);
    expect(ids(fixture, 9 / 30)).toEqual(['b']);
    expect(mostVideosAt(fixture.clips, fixture.tracks)).toBe(1);
  });
});

/* ---------- mostVideosAt ---------- */

describe('mostVideosAt: the most video clips on screen at one moment', () => {
  const tracks = [...defaultTracks(), overlay('V2'), overlay('V3', { hidden: true })];

  it('counts overlaps across picture tracks, hidden tracks included', () => {
    const clips = [
      clip('m', MAIN_VIDEO, 0, 10, 'video'),
      clip('a', 'V2', 2, 3, 'video'),
      clip('b', 'V3', 4, 2, 'video'),
      clip('c', 'V2', 7, 1, 'video'),
    ];
    expect(mostVideosAt(clips, tracks)).toBe(3);
    expect(mostVideosAt(clips.slice(0, 2), tracks)).toBe(2);
    expect(mostVideosAt([], tracks)).toBe(0);
    expect(mostVideosAt([clips[0]], tracks)).toBe(1);
  });

  it('doesn’t count photos, or clips on audio or unknown tracks', () => {
    const clips = [
      clip('m', MAIN_VIDEO, 0, 10, 'video'),
      clip('p', 'V2', 2, 3),
      clip('x', MUSIC, 0, 10, 'video'),
      clip('y', 'V7', 0, 10, 'video'),
    ];
    expect(mostVideosAt(clips, tracks)).toBe(1);
  });

  it('touching clips don’t overlap (also a rounding hair apart)', () => {
    expect(mostVideosAt([clip('a', MAIN_VIDEO, 0, 2, 'video'), clip('b', 'V2', 2, 2, 'video')], tracks)).toBe(1);
    expect(
      // b starts a hair (1e-12 s) before a's end: rounding, not an overlap.
      mostVideosAt([clip('a', MAIN_VIDEO, 0.1, 0.2, 'video'), clip('b', 'V2', 0.1 + 0.2 - 1e-12, 1, 'video')], tracks),
    ).toBe(1);
    expect(mostVideosAt([clip('a', MAIN_VIDEO, 0, 2, 'video'), clip('b', 'V2', 1.99, 2, 'video')], tracks)).toBe(2);
  });

  it('finds the moment of most overlap among many clips', () => {
    // Five overlay tracks, staggered: at 4–5 all five plus the main video.
    const many = [...defaultTracks(), ...[2, 3, 4, 5, 6].map((index) => overlay(`V${index}`))];
    const clips = [clip('m', MAIN_VIDEO, 0, 20, 'video')];
    for (let index = 0; index < 5; index++) clips.push(clip(`o${index}`, `V${index + 2}`, index, 5, 'video'));
    expect(mostVideosAt(clips, many)).toBe(6);
  });
});

/* ---------- snapBox ---------- */

describe('snapBox: a moved box snaps to the frame’s centre lines and edges', () => {
  const width = 1080,
    height = 1920;
  const box = (cx: number, cy: number, boxWidth = 200, boxHeight = 100, rot = 0): Box => ({
    cx,
    cy,
    w: boxWidth,
    h: boxHeight,
    rot,
  });

  it('snaps the centre to the centre lines within the tolerance', () => {
    expect(snapBox(box(545, 955), width, height, 8)).toEqual({
      x: 0.5,
      y: 0.5,
      guides: [
        { axis: 'x', at: 540 },
        { axis: 'y', at: 960 },
      ],
    });
    expect(snapBox(box(532, 968), width, height, 8)).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('snaps the edges to the frame’s edges', () => {
    // Left edge at 6 → 0; bottom edge at 1915 → 1920.
    const snappedBox = snapBox(box(106, 1865), width, height, 8);
    expect(snappedBox.x).toBeCloseTo(100 / width, 12);
    expect(snappedBox.y).toBeCloseTo(1870 / height, 12);
    expect(snappedBox.guides).toEqual([
      { axis: 'x', at: 0 },
      { axis: 'y', at: 1920 },
    ]);
    // Right edge 1075 → 1080; top edge -4 → 0.
    const rect = snapBox(box(975, 46), width, height, 8);
    expect(rect.x).toBeCloseTo(980 / width, 12);
    expect(rect.y).toBeCloseTo(50 / height, 12);
    // A box's edge may snap to the centre line too.
    expect(snapBox(box(645, 300), width, height, 8).x).toBeCloseTo(640 / width, 12);
  });

  it('uses the rotated box’s bounding box for the edges', () => {
    // A 200 × 100 box turned 90°: 100 wide, 200 tall. Left edge at cx − 50.
    const snappedBox = snapBox(box(55, 400, 200, 100, Math.PI / 2), width, height, 8);
    expect(snappedBox.x).toBeCloseTo(50 / width, 9);
    expect(snappedBox.guides).toEqual([{ axis: 'x', at: 0 }]);
    // Unrotated, the same centre puts the left edge at −45: too far.
    expect(snapBox(box(55, 400), width, height, 8).guides).toEqual([]);
  });

  it('the nearest candidate wins on each axis', () => {
    // Narrow box: centre 3 px from 540, right edge (545) 5 px from 540 → the centre wins.
    const snappedBox = snapBox(box(537, 400, 16, 16), width, height, 8);
    expect(snappedBox.x).toBe(0.5);
    // Left edge 2 px past 540 (542), centre 10 px off → the edge wins.
    const rect = snapBox(box(552, 400, 20, 20), width, height, 8);
    expect(rect.x).toBeCloseTo(550 / width, 12);
    expect(rect.guides).toEqual([{ axis: 'x', at: 540 }]);
  });

  it('leaves the box where it is outside the tolerance (and snaps at exactly the tolerance)', () => {
    expect(snapBox(box(400, 700), width, height, 8)).toEqual({ x: 400 / width, y: 700 / height, guides: [] });
    expect(snapBox(box(549, 700), width, height, 8)).toEqual({ x: 549 / width, y: 700 / height, guides: [] });
    expect(snapBox(box(548, 700), width, height, 8).x).toBe(0.5);
    expect(snapBox(box(545, 955), width, height, 0)).toEqual({ x: 545 / width, y: 955 / height, guides: [] });
  });
});

/* ---------- 206: transitions in the stack (AC-2, AC-3, AC-11, AC-13) ---------- */

/** A clip with a transition of `dur` seconds into clip `to`. */
const withTransition = (
  base: TimedClip,
  to: string,
  dur: number,
  kind: Transition['kind'] = 'dissolve',
  extra: Partial<Transition> = {},
): TimedClip => ({
  ...base,
  transition: { kind, dur, to, ...extra },
});
/** 205's Ease in and out at linear progress p (transitions are eased with it, Q12). */
const eased = (share: number) =>
  valueAt(
    [
      { t: 0, v: 0, ease: 'ease-in-out' },
      { t: 1, v: 1, ease: 'ease-in-out' },
    ],
    share,
  );

describe('frameStack during a transition (206 AC-2)', () => {
  // A photo 0–2, a 1 s dissolve into a video 2–4 (source from 1 s).
  const fixture = project([withTransition(clip('a', MAIN_VIDEO, 0, 2), 'b', 1), clip('b', MAIN_VIDEO, 2, 2, 'video')]);

  it('shows both clips in the track’s place from d/2 before the cut to d/2 after, the outgoing one first', () => {
    expect(ids(fixture, 1.49)).toEqual(['a']);
    expect(ids(fixture, 1.5)).toEqual(['a', 'b']);
    expect(ids(fixture, 2.49)).toEqual(['a', 'b']);
    expect(ids(fixture, 2.5)).toEqual(['b']);
  });

  it('gives each its local time past its ends (the handles) and the eased progress', () => {
    const [from, to] = frameStack(fixture, 2.25);
    expect(from).toEqual({
      clip: fixture.clips[0],
      local: 2.25,
      track: MAIN_VIDEO,
      mix: { kind: 'dissolve', progress: eased(0.75), role: 'from' },
    });
    expect(to).toEqual({
      clip: fixture.clips[1],
      local: 0.25,
      track: MAIN_VIDEO,
      mix: { kind: 'dissolve', progress: eased(0.75), role: 'to' },
    });
    const [early, incoming] = frameStack(fixture, 1.5);
    expect(early.mix!.progress).toBe(0);
    expect(incoming.local).toBeCloseTo(-0.5, 12);
  });

  it('carries the direction of a wipe or slide and the colour of a dip', () => {
    const wipe = project([
      withTransition(clip('a', MAIN_VIDEO, 0, 2), 'b', 1, 'wipe', { dir: 'up' }),
      clip('b', MAIN_VIDEO, 2, 2),
    ]);
    expect(frameStack(wipe, 2).map((draw) => draw.mix)).toEqual([
      { kind: 'wipe', dir: 'up', progress: eased(0.5), role: 'from' },
      { kind: 'wipe', dir: 'up', progress: eased(0.5), role: 'to' },
    ]);
    const dip = project([
      withTransition(clip('a', MAIN_VIDEO, 0, 2), 'b', 1, 'dip', { colour: 'white' }),
      clip('b', MAIN_VIDEO, 2, 2),
    ]);
    expect(frameStack(dip, 2)[0].mix).toEqual({ kind: 'dip', colour: 'white', progress: eased(0.5), role: 'from' });
  });

  it('on an overlay track the pair sits in the overlay’s place, above the main track', () => {
    const scene = project(
      [
        clip('m', MAIN_VIDEO, 0, 10),
        withTransition(clip('c', 'V2', 1, 3), 'd', 1),
        clip('d', 'V2', 4, 2),
        clip('e', 'V3', 0, 10),
      ],
      [overlay('V2'), overlay('V3')],
    );
    expect(ids(scene, 3.75)).toEqual(['m', 'c', 'd', 'e']);
    expect(ids(scene, 4.6)).toEqual(['m', 'd', 'e']);
  });

  it('leaves the project’s length and every clip’s start as they are', () => {
    const plain = project([clip('a', MAIN_VIDEO, 0, 2), clip('b', MAIN_VIDEO, 2, 2, 'video')]);
    expect(projectLength(fixture)).toBe(projectLength(plain));
    expect(fixture.clips.map((timedClip) => timedClip.start)).toEqual(plain.clips.map((timedClip) => timedClip.start));
  });

  it('a transition on a hidden track draws nothing (as its clips)', () => {
    const hidden = project(
      [clip('m', MAIN_VIDEO, 0, 10), withTransition(clip('c', 'V2', 1, 3), 'd', 1), clip('d', 'V2', 4, 2)],
      [overlay('V2', { hidden: true })],
    );
    expect(ids(hidden, 4)).toEqual(['m']);
  });
});

describe('AC-11: the stack at every export frame with transitions equals an independent reference', () => {
  /**
   * The reference: on each visible picture track, a clip shows over its own span and over the halves of its
   * transitions beyond it (its handles); where two show, it is a transition, the progress linear over [cut − d/2,
   * cut + d/2) and then eased. Written without frameStack's code.
   */
  function reference(fixture: Project, time: number) {
    const out: { id: string; local: number; track: string; progress?: number; role?: 'from' | 'to' }[] = [];
    for (const track of fixture.tracks) {
      if ((track.kind !== 'video' && track.kind !== 'overlay') || track.hidden) continue;
      const on = fixture.clips.filter((timedClip) => timedClip.track === track.id);
      const shown: typeof out = [];
      for (const timedClip of on) {
        const len = timedClip.kind === 'photo' ? timedClip.dur : timedClip.out - timedClip.in;
        const before = (on.find((other) => other.transition?.to === timedClip.id)?.transition?.dur ?? 0) / 2;
        const after = (timedClip.transition?.dur ?? 0) / 2;
        if (time >= timedClip.start - before - 1e-9 && time < timedClip.start + len + after - 1e-9)
          shown.push({ id: timedClip.id, local: time - timedClip.start, track: track.id });
      }
      if (shown.length === 2) {
        const outgoing = on.find((timedClip) => timedClip.id === shown[0].id)!;
        const delta = outgoing.transition!.dur;
        const cut = on.find((timedClip) => timedClip.id === shown[1].id)!.start;
        const progress = eased((time - (cut - delta / 2)) / delta);
        shown[0] = { ...shown[0], progress, role: 'from' };
        shown[1] = { ...shown[1], progress, role: 'to' };
      }
      out.push(...shown);
    }
    return out;
  }

  const kinds: [Transition['kind'], Partial<Transition>][] = [
    ['dissolve', {}],
    ['dip', { colour: 'black' }],
    ['wipe', { dir: 'right' }],
    ['slide', { dir: 'down' }],
    ['zoom', {}],
  ];
  for (const [kind, extra] of kinds)
    for (const fps of [30, 60]) {
      it(`${kind} at ${fps} fps, a video into a photo on the main track and a photo into a video on an overlay`, () => {
        const fixture = project(
          [
            withTransition(clip('v', MAIN_VIDEO, 0, 3, 'video'), 'p', 1, kind, extra),
            clip('p', MAIN_VIDEO, 3, 2),
            withTransition(clip('q', 'V2', 1, 2), 'w', 0.5, kind, extra),
            clip('w', 'V2', 3, 1.5, 'video'),
          ],
          [overlay('V2')],
        );
        const [, frames] = frameRange(0, projectLength(fixture), fps);
        for (let index = 0; index < frames; index++) {
          const time = index / fps;
          const got = frameStack(fixture, time).map((draw) => ({
            id: draw.clip.id,
            local: draw.local,
            track: draw.track,
            ...(draw.mix ? { progress: draw.mix.progress, role: draw.mix.role } : {}),
          }));
          expect(got, `frame ${index}`).toEqual(reference(fixture, time));
        }
      });
    }
});

describe('mostVideosAt with transitions (206 AC-3, Q7)', () => {
  const tracks = defaultTracks();
  it('counts both videos over a transition between them, and only then', () => {
    const plain = [clip('a', MAIN_VIDEO, 0, 2, 'video'), clip('b', MAIN_VIDEO, 2, 2, 'video')];
    expect(mostVideosAt(plain, tracks)).toBe(1);
    expect(mostVideosAt([withTransition(plain[0], 'b', 1), plain[1]], tracks)).toBe(2);
    // A photo on one side: one video at a time.
    expect(mostVideosAt([withTransition(clip('a', MAIN_VIDEO, 0, 2), 'b', 1), plain[1]], tracks)).toBe(1);
  });
});
