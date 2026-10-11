import { describe, expect, it } from 'vitest';
import type { Box } from './layers';
import { frameStack, mostVideosAt, snapBox } from './stack';
import {
  MAIN_VIDEO,
  MUSIC,
  defaultTracks,
  framePlan,
  pack,
  projectLength,
  videoAt,
  type Project,
  type TimedClip,
  type Track,
} from './timeline';
import { legacyFixtures, type LegacyClip, type LegacyProject } from './timeline.testkit';
import { frameRange } from './video';

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
const ids = (p: Project, t: number) => frameStack(p, t).map((s) => s.clip.id);

/** A 2.x project on tracks (as timeline.test.ts builds it). */
function onTracks(p: LegacyProject): Project<LegacyClip & TimedClip> {
  const clips = pack(p.clips.map((c) => ({ ...c, track: MAIN_VIDEO, start: 0 })));
  return { tracks: defaultTracks(), clips, audio: [], layers: p.layers, fadeOut: p.fadeOut };
}

/* ---------- frameStack ---------- */

describe('frameStack: the picture clips drawn at a time, bottom first', () => {
  // Main 0–6; overlay V2 1–2 and 4–5 (a gap between); overlay V3 1.5–4.5.
  const p = project(
    [
      clip('m', MAIN_VIDEO, 0, 6),
      clip('a', 'V2', 1, 1, 'video'),
      clip('b', 'V2', 4, 1),
      clip('c', 'V3', 1.5, 3, 'video'),
    ],
    [overlay('V2'), overlay('V3')],
  );

  it('lists every visible picture track’s clip in drawing order, with the seconds into it and its track', () => {
    expect(frameStack(p, 1.75)).toEqual([
      { clip: p.clips[0], local: 1.75, track: MAIN_VIDEO },
      { clip: p.clips[1], local: 0.75, track: 'V2' },
      { clip: p.clips[3], local: 0.25, track: 'V3' },
    ]);
    // Drawing order is the tracks array's, not the clips array's.
    const swapped = { ...p, tracks: [p.tracks[0], p.tracks[1], p.tracks[3], p.tracks[2]] };
    expect(ids(swapped, 1.75)).toEqual(['m', 'c', 'a']);
  });

  it('a gap on an overlay track leaves the tracks below it', () => {
    expect(ids(p, 3)).toEqual(['m', 'c']);
    expect(ids(p, 0.5)).toEqual(['m']);
    expect(ids(p, 4.75)).toEqual(['m', 'b']);
  });

  it('leaves hidden tracks out (the main track too)', () => {
    const hide = (id: string) => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, hidden: true } : t)) });
    expect(ids(hide('V2'), 1.75)).toEqual(['m', 'c']);
    expect(ids(hide(MAIN_VIDEO), 1.75)).toEqual(['a', 'c']);
    expect(ids(hide(MAIN_VIDEO), -1)).toEqual([]);
    expect(ids(hide(MAIN_VIDEO), 6)).toEqual([]);
  });

  it('ignores clips on audio or unknown tracks', () => {
    const q = project([...p.clips, clip('x', MUSIC, 0, 6), clip('y', 'V9', 0, 6)], [overlay('V2'), overlay('V3')]);
    expect(ids(q, 1.75)).toEqual(['m', 'a', 'c']);
  });

  it('an overlay clip starting at 2.0 s first shows in frame 60 at 30 fps and is gone in the frame after its last', () => {
    const q = project([clip('m', MAIN_VIDEO, 0, 6), clip('o', 'V2', 2, 1.5, 'video')], [overlay('V2')]);
    const [f0, f1] = frameRange(2, 3.5, 30);
    expect([f0, f1]).toEqual([60, 105]);
    expect(ids(q, 59 / 30)).toEqual(['m']);
    expect(ids(q, 60 / 30)).toEqual(['m', 'o']);
    expect(frameStack(q, 60 / 30)[1].local).toBe(0);
    expect(ids(q, 104 / 30)).toEqual(['m', 'o']);
    expect(ids(q, 105 / 30)).toEqual(['m']);
    for (let i = 0; i < 180; i++) expect(ids(q, i / 30).includes('o'), `frame ${i}`).toBe(i >= f0 && i < f1);
  });

  it('the main track clamps only before 0 and at or past the video’s end; black after it ends before an overlay does (Q9)', () => {
    // Main 0–4 (two clips), overlay 3–7: the video is 7 s long.
    const q = project(
      [clip('m1', MAIN_VIDEO, 0, 2), clip('m2', MAIN_VIDEO, 2, 2), clip('o', 'V2', 3, 4, 'video')],
      [overlay('V2')],
    );
    expect(projectLength(q)).toBe(7);
    expect(frameStack(q, -1)).toEqual([{ clip: q.clips[0], local: -1, track: MAIN_VIDEO }]);
    expect(ids(q, 3.5)).toEqual(['m2', 'o']);
    expect(ids(q, 4)).toEqual(['o']);
    expect(ids(q, 6.99)).toEqual(['o']);
    // At or past the video's end: the main track's last clip, nothing from the overlay (no clamp there).
    expect(frameStack(q, 7)).toEqual([{ clip: q.clips[1], local: 5, track: MAIN_VIDEO }]);
    expect(ids(q, 9)).toEqual(['m2']);
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
    const q = project([clip('a', MAIN_VIDEO, 0, 2), clip('b', MAIN_VIDEO, 3.5, 2)]);
    expect(ids(q, 2)).toEqual([]);
    expect(ids(q, 3.49)).toEqual([]);
    expect(ids(q, 3.5)).toEqual(['b']);
  });
});

/* ---------- AC-10: without overlays, the stack is videoAt ---------- */

describe('for 201 / 202 projects the stack is exactly [videoAt] at every frame time (AC-10)', () => {
  const same = (p: Project, t: number) => {
    const want = videoAt(p, t);
    const got = frameStack(p, t);
    expect(
      got.map(({ clip, local }) => ({ clip, local })),
      `t = ${t}`,
    ).toEqual(want ? [want] : []);
    for (const s of got) expect(s.track).toBe(MAIN_VIDEO);
  };
  const frameTimes = (p: Project, fps: number) => {
    const frames = Math.max(1, Math.round(projectLength(p) * fps));
    const out = [-1, -1 / fps, projectLength(p), projectLength(p) + 3];
    for (let i = 0; i <= frames; i++) out.push(i / fps);
    return out;
  };

  it.each(Object.entries(legacyFixtures()))('%s at 30 and 60 fps', (name, lp) => {
    const p = onTracks(lp);
    for (const fps of name === 'clips500' ? [30] : [30, 60]) for (const t of frameTimes(p, fps)) same(p, t);
  });

  it.each([
    ['gaps', [clip('a', MAIN_VIDEO, 0, 2), clip('b', MAIN_VIDEO, 3.5, 2), clip('c', MAIN_VIDEO, 6, 2, 'video')]],
    ['late start', [clip('a', MAIN_VIDEO, 1, 2), clip('b', MAIN_VIDEO, 3, 1)]],
    ['fractions', [clip('a', MAIN_VIDEO, 1 / 3, 0.37), clip('b', MAIN_VIDEO, 1.1, 0.1, 'video')]],
  ] as const)('202 %s at 30 and 60 fps', (_, clips) => {
    const p = project([...clips]);
    for (const fps of [30, 60]) for (const t of frameTimes(p, fps)) same(p, t);
    const hidden = { ...p, tracks: p.tracks.map((t) => ({ ...t, hidden: true })) };
    for (const t of frameTimes(hidden, 30)) same(hidden, t);
  });
});

describe('for 201 / 202 projects the stack is the export’s frame plan at every frame (AC-10)', () => {
  const agrees = (p: Project, fps: number) => {
    for (const span of framePlan(p, fps))
      for (let i = span.f0; i < span.f1; i++) {
        const got = frameStack(p, i / fps);
        if (span.clip) expect(got[0]?.clip, `${fps} fps, frame ${i}`).toBe(span.clip);
        else expect(got, `${fps} fps, frame ${i}`).toEqual([]);
      }
  };

  it.each(Object.entries(legacyFixtures()))('%s at 30 and 60 fps', (_, lp) => {
    const p = onTracks(lp);
    for (const fps of [30, 60]) agrees(p, fps);
  });

  it('202 projects with gaps at 30 and 60 fps', () => {
    const p = project([
      clip('a', MAIN_VIDEO, 1 / 3, 0.37),
      clip('b', MAIN_VIDEO, 1.1, 2),
      clip('c', MAIN_VIDEO, 3.5, 2),
    ]);
    for (const fps of [30, 60]) agrees(p, fps);
  });

  it('a clip ending a rounding hair after the next one starts: the frame on the edge is the later clip’s', () => {
    // a covers [0.2, 0.30000000000000004) (0.2 + 0.1 in floating point), b starts at 0.3 on an overlay track.
    const a = { ...clip('a', MAIN_VIDEO, 0.2, 0.1, 'video'), in: 0, out: 0.1 };
    const q = project([a, clip('b', 'V2', 0.3, 1, 'video')], [overlay('V2')]);
    expect(a.start + (a.out - a.in)).toBeGreaterThan(9 / 30);
    expect(ids(q, 9 / 30)).toEqual(['b']);
    expect(mostVideosAt(q.clips, q.tracks)).toBe(1);
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
    const many = [...defaultTracks(), ...[2, 3, 4, 5, 6].map((i) => overlay(`V${i}`))];
    const clips = [clip('m', MAIN_VIDEO, 0, 20, 'video')];
    for (let i = 0; i < 5; i++) clips.push(clip(`o${i}`, `V${i + 2}`, i, 5, 'video'));
    expect(mostVideosAt(clips, many)).toBe(6);
  });
});

/* ---------- snapBox ---------- */

describe('snapBox: a moved box snaps to the frame’s centre lines and edges', () => {
  const W = 1080,
    H = 1920;
  const box = (cx: number, cy: number, w = 200, h = 100, rot = 0): Box => ({ cx, cy, w, h, rot });

  it('snaps the centre to the centre lines within the tolerance', () => {
    expect(snapBox(box(545, 955), W, H, 8)).toEqual({
      x: 0.5,
      y: 0.5,
      guides: [
        { axis: 'x', at: 540 },
        { axis: 'y', at: 960 },
      ],
    });
    expect(snapBox(box(532, 968), W, H, 8)).toMatchObject({ x: 0.5, y: 0.5 });
  });

  it('snaps the edges to the frame’s edges', () => {
    // Left edge at 6 → 0; bottom edge at 1915 → 1920.
    const s = snapBox(box(106, 1865), W, H, 8);
    expect(s.x).toBeCloseTo(100 / W, 12);
    expect(s.y).toBeCloseTo(1870 / H, 12);
    expect(s.guides).toEqual([
      { axis: 'x', at: 0 },
      { axis: 'y', at: 1920 },
    ]);
    // Right edge 1075 → 1080; top edge -4 → 0.
    const r = snapBox(box(975, 46), W, H, 8);
    expect(r.x).toBeCloseTo(980 / W, 12);
    expect(r.y).toBeCloseTo(50 / H, 12);
    // A box's edge may snap to the centre line too.
    expect(snapBox(box(645, 300), W, H, 8).x).toBeCloseTo(640 / W, 12);
  });

  it('uses the rotated box’s bounding box for the edges', () => {
    // A 200 × 100 box turned 90°: 100 wide, 200 tall. Left edge at cx − 50.
    const s = snapBox(box(55, 400, 200, 100, Math.PI / 2), W, H, 8);
    expect(s.x).toBeCloseTo(50 / W, 9);
    expect(s.guides).toEqual([{ axis: 'x', at: 0 }]);
    // Unrotated, the same centre puts the left edge at −45: too far.
    expect(snapBox(box(55, 400), W, H, 8).guides).toEqual([]);
  });

  it('the nearest candidate wins on each axis', () => {
    // Narrow box: centre 3 px from 540, right edge (545) 5 px from 540 → the centre wins.
    const s = snapBox(box(537, 400, 16, 16), W, H, 8);
    expect(s.x).toBe(0.5);
    // Left edge 2 px past 540 (542), centre 10 px off → the edge wins.
    const e = snapBox(box(552, 400, 20, 20), W, H, 8);
    expect(e.x).toBeCloseTo(550 / W, 12);
    expect(e.guides).toEqual([{ axis: 'x', at: 540 }]);
  });

  it('leaves the box where it is outside the tolerance (and snaps at exactly the tolerance)', () => {
    expect(snapBox(box(400, 700), W, H, 8)).toEqual({ x: 400 / W, y: 700 / H, guides: [] });
    expect(snapBox(box(549, 700), W, H, 8)).toEqual({ x: 549 / W, y: 700 / H, guides: [] });
    expect(snapBox(box(548, 700), W, H, 8).x).toBe(0.5);
    expect(snapBox(box(545, 955), W, H, 0)).toEqual({ x: 545 / W, y: 955 / H, guides: [] });
  });
});
