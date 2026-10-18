import { describe, expect, it } from 'vitest';
import type { Ease, Keyframe } from '@/engine/keyframes';
import type { TimedClip } from '@/engine/timeline';
import type { Track } from '@/engine/tracks';
import type { Transition } from '@/engine/transitions';
import { RAMP_PRESETS, type SpeedFields } from '@/engine/speed';
import { defined } from '../../../support/defined';
import {
  clipLabel,
  describeClipChange,
  describeKeyChange,
  describeSpeedChange,
  describeTransitionChange,
  draggedLength,
  easeName,
  easeShape,
  filmstripTimes,
  keyPropName,
  keyTimes,
  panelCut,
  pictureTracksTopFirst,
  rowUnderPointer,
  speedBadge,
  transitionBlock,
  type RowBounds,
} from '@/components/studio/timelineRows';

/**
 * A track with every switch off.
 * @param id its id
 * @param kind video or audio
 * @param name its name
 * @returns the track
 */
const track = (id: string, kind: Track['kind'], name: string): Track => ({
  id,
  kind,
  name,
  hidden: false,
  muted: false,
  locked: false,
});
const MAIN = track('V1', 'video', 'Video');
const OVERLAY_1 = track('V2', 'overlay', 'Overlay 1');
const OVERLAY_2 = track('V3', 'overlay', 'Overlay 2');
const MUSIC = track('A1', 'audio', 'Music');
/** The tracks in drawing order: the main track, then the overlays from the bottom one up, then the music. */
const TRACKS = [MAIN, OVERLAY_1, OVERLAY_2, MUSIC];

/**
 * A clip with the fields the timeline's announcements read.
 * @param id its id
 * @param trackId its track
 * @param start where it starts
 * @param length how long it plays
 * @param sourceIn where in the source it starts
 * @returns the clip
 */
const clip = (id: string, trackId: string, start: number, length: number, sourceIn = 0) => ({
  id,
  track: trackId,
  start,
  kind: 'video' as const,
  dur: 0,
  in: sourceIn,
  out: sourceIn + length,
});

describe('pictureTracksTopFirst', () => {
  it('lists the top overlay first and the main track last, without the music', () => {
    expect(pictureTracksTopFirst(TRACKS).map((row) => row.id)).toEqual(['V3', 'V2', 'V1']);
  });
  it('is just the main track in a project without overlays', () => {
    expect(pictureTracksTopFirst([MAIN, MUSIC]).map((row) => row.id)).toEqual(['V1']);
  });
});

describe('clipLabel', () => {
  it('numbers main-track clips as before 203', () => {
    expect(clipLabel(MAIN, 2)).toBe('Clip 2');
  });
  it('reads inside a sentence as before 203 ("Trim the start of clip 2")', () => {
    expect(clipLabel(MAIN, 2, true)).toBe('clip 2');
    expect(clipLabel(OVERLAY_1, 2, true)).toBe('Overlay 1, clip 2');
  });
  it('names the overlay track, so two rows never both say "Clip 1"', () => {
    expect(clipLabel(OVERLAY_1, 1)).toBe('Overlay 1, clip 1');
    expect(clipLabel(OVERLAY_2, 1)).not.toBe(clipLabel(OVERLAY_1, 1));
  });
});

describe('rowUnderPointer', () => {
  /** Rows as laid out top first: Overlay 2 at 20–84 px, Overlay 1 at 84–148, the main track at 148–212. */
  const rows: RowBounds[] = [
    { trackId: 'V3', top: 20, bottom: 84 },
    { trackId: 'V2', top: 84, bottom: 148 },
    { trackId: 'V1', top: 148, bottom: 212 },
  ];
  it('finds the row the pointer is over', () => {
    expect(rowUnderPointer(rows, 30, 16)).toBe('V3');
    expect(rowUnderPointer(rows, 100, 16)).toBe('V2');
    expect(rowUnderPointer(rows, 211, 16)).toBe('V1');
  });
  it('a row owns its top edge, the row above its bottom edge', () => {
    expect(rowUnderPointer(rows, 84, 16)).toBe('V2');
  });
  it('just above the top row means a new track', () => {
    expect(rowUnderPointer(rows, 10, 16)).toBe('new');
    expect(rowUnderPointer(rows, 4, 16)).toBe('new');
  });
  it('further above, or below the picture rows, is no row', () => {
    expect(rowUnderPointer(rows, 3, 16)).toBeNull();
    expect(rowUnderPointer(rows, 212, 16)).toBeNull();
    expect(rowUnderPointer([], 50, 16)).toBeNull();
  });
});

describe('describeClipChange', () => {
  it('says a moved main-track clip as before 203', () => {
    const was = [clip('a', 'V1', 0, 2), clip('b', 'V1', 2, 3, 1)];
    const now = [clip('a', 'V1', 0, 2), clip('b', 'V1', 2.5, 3, 1)];
    expect(describeClipChange(was, now, TRACKS, 'b')).toBe('Clip 2, 2.5 s to 5.5 s, playing its source from 1.0 s');
  });
  it('names the overlay track of a changed overlay clip', () => {
    const was = [clip('a', 'V1', 0, 4), clip('o', 'V2', 1, 2)];
    const now = [clip('a', 'V1', 0, 4), clip('o', 'V2', 1.5, 2)];
    expect(describeClipChange(was, now, TRACKS, 'o')).toBe(
      'Overlay 1, clip 1, 1.5 s to 3.5 s, playing its source from 0.0 s',
    );
  });
  it('says which track a clip moved to', () => {
    const was = [clip('a', 'V1', 0, 4), clip('b', 'V1', 4, 2)];
    const now = [clip('a', 'V1', 0, 4), clip('b', 'V3', 1, 2)];
    expect(describeClipChange(was, now, TRACKS, 'b')).toBe(
      'Overlay 2, clip 1, 1.0 s to 3.0 s, playing its source from 0.0 s',
    );
  });
  it('counts removed clips per track', () => {
    const was = [clip('a', 'V1', 0, 4), clip('o', 'V2', 1, 2), clip('p', 'V2', 3, 1)];
    const now = [clip('a', 'V1', 0, 4)];
    expect(describeClipChange(was, now, TRACKS, null)).toBe('2 clips removed from Overlay 1, 0 left');
    expect(describeClipChange([clip('a', 'V1', 0, 4)], [], TRACKS, null)).toBe('Clip removed, 0 left');
  });
  it("says a clip's new box when only its transform changed (a stage drag, an arrow key, the inspector)", () => {
    const was = [{ ...clip('o', 'V2', 1, 2), tf: { x: 0.5, y: 0.5, w: 1, rot: 0, opacity: 1, radius: 0 } }];
    const now = [{ ...clip('o', 'V2', 1, 2), tf: { x: 0.72, y: 0.2, w: 0.35, rot: 0, opacity: 1, radius: 0 } }];
    expect(describeClipChange(was, now, TRACKS, 'o')).toBe('Overlay 1, clip 1: x 72 %, y 20 %, size 35 %');
  });
  it('says nothing when no picture clip changed', () => {
    const clips = [clip('a', 'V1', 0, 4)];
    expect(describeClipChange(clips, clips, TRACKS, 'a')).toBe('');
  });
});

/* ---------- 205 T062: the keyframe lane ---------- */

const key = (time: number, value: number, ease: Ease = 'ease-in-out'): Keyframe => ({ t: time, v: value, ease });

describe('keyTimes: the diamonds of the collapsed lane (AC-7)', () => {
  it('is the union of every animated value’s key times, sorted, with the values at each and their ease', () => {
    const withKeys = { keys: { x: [key(0, 0), key(2, 1, 'hold')], opacity: [key(1, 1, 'linear'), key(2, 0, 'hold')] } };
    expect(keyTimes(withKeys)).toEqual([
      { t: 0, props: ['x'], ease: 'ease-in-out' },
      { t: 1, props: ['opacity'], ease: 'linear' },
      { t: 2, props: ['x', 'opacity'], ease: 'hold' },
    ]);
  });

  it('keys within half a frame are one diamond; different eases there show as mixed', () => {
    const withKeys = { keys: { x: [key(1, 0, 'linear')], y: [key(1 + 0.4 / 30, 0, 'hold')] } };
    expect(keyTimes(withKeys)).toEqual([{ t: 1, props: ['x', 'y'], ease: 'mixed' }]);
    expect(keyTimes(withKeys, 1000)).toHaveLength(2);
  });

  it('no keys: no diamonds', () => {
    expect(keyTimes({})).toEqual([]);
    expect(keyTimes({ keys: { x: [] } })).toEqual([]);
  });
});

describe('easeShape and names (D3)', () => {
  it('a rounded diamond for an ease, a square for hold, a pointed diamond for linear', () => {
    expect(easeShape('ease-in')).toBe('round');
    expect(easeShape('ease-out')).toBe('round');
    expect(easeShape('ease-in-out')).toBe('round');
    expect(easeShape('mixed')).toBe('round');
    expect(easeShape('hold')).toBe('square');
    expect(easeShape('linear')).toBe('pointed');
  });

  it('names eases and values as the inspector does', () => {
    expect(easeName('ease-in-out')).toBe('Ease in and out');
    expect(easeName('hold')).toBe('Hold');
    expect(easeName('mixed')).toBe('Mixed');
    expect(keyPropName('rot', 'clip')).toBe('Rotation');
    expect(keyPropName('rot', 'layer')).toBe('Turn');
    expect(keyPropName('volume', 'clip')).toBe('Clip sound');
    expect(keyPropName('radius', 'clip')).toBe('Corners');
  });
});

describe('describeKeyChange: the live region after a keyframe change (AC-7, AC-13)', () => {
  const before = { x: [key(1, 0), key(3, 1)] };

  it('says nothing when the keys are the same', () => {
    expect(describeKeyChange(before, before, 'Clip 1', 0)).toBe('');
    expect(describeKeyChange(undefined, undefined, 'Clip 1', 0)).toBe('');
    expect(describeKeyChange(before, { x: [key(1, 0), key(3, 1)] }, 'Clip 1', 0)).toBe('');
  });

  it('a move, an add, a removal, in timeline seconds', () => {
    expect(describeKeyChange(before, { x: [key(1.5, 0), key(3, 1)] }, 'Clip 1', 2)).toBe(
      'Clip 1: keyframe moved from 3.00 s to 3.50 s',
    );
    expect(describeKeyChange(before, { x: [key(1, 0), key(2, 0.5), key(3, 1)] }, 'Clip 1', 2)).toBe(
      'Clip 1: keyframe added at 4.00 s',
    );
    expect(describeKeyChange(before, { x: [key(3, 1)] }, 'Clip 1', 2)).toBe('Clip 1: keyframe at 3.00 s removed');
  });

  it('the start and the end of an animation', () => {
    expect(describeKeyChange(undefined, { x: [key(1, 0)] }, 'Title', 0)).toBe('Title: animated, keyframe at 1.00 s');
    expect(describeKeyChange(before, undefined, 'Title', 0)).toBe('Title: animation removed');
  });

  it('a new interpolation, and a changed value', () => {
    expect(describeKeyChange(before, { x: [key(1, 0, 'hold'), key(3, 1)] }, 'Clip 1', 0)).toBe(
      'Clip 1: keyframe at 1.00 s, Hold',
    );
    expect(describeKeyChange(before, { x: [key(1, 0.5), key(3, 1)] }, 'Clip 1', 0)).toBe(
      'Clip 1: keyframe at 1.00 s changed',
    );
  });
});

/* ---------- 206 T060: which cut the Transitions panel acts on (AC-8) ---------- */

describe('panelCut: the cut the Transitions panel acts on (AC-8)', () => {
  const at = (id: string, start: number, len: number, trackId = 'V1') => ({
    id,
    track: trackId,
    start,
    kind: 'photo' as const,
    dur: len,
    in: 0,
    out: 0,
  });
  // V1: a 0–2, b 2–4 (touching), c 6–7 after a gap. V2: o 1–3 alone.
  const clips = [at('a', 0, 2), at('b', 2, 2), at('c', 6, 1), at('o', 1, 2, 'V2')];
  const tracks = [MAIN, OVERLAY_1];
  const state = (selected: string | null, transitionSel: string | null = null, locked = false) => ({
    clips,
    tracks: locked ? tracks.map((original) => ({ ...original, locked: true })) : tracks,
    selected,
    transitionSel,
  });

  it('a selected cut first', () => {
    expect(panelCut(state('c', 'a'))).toEqual({ clip: 'a', track: 'V1' });
  });
  it('else the cut at the selected clip’s end, or its start when nothing touches its end', () => {
    expect(panelCut(state('a'))).toEqual({ clip: 'a', track: 'V1' });
    expect(panelCut(state('b'))).toEqual({ clip: 'a', track: 'V1' });
  });
  it('says why when there is no cut to use', () => {
    expect(panelCut(state(null))).toEqual({ why: 'Select a clip, or a cut between two clips on the timeline.' });
    expect(panelCut(state('c'))).toEqual({
      why: 'This clip doesn’t touch another clip on its track: a transition goes between two clips that touch.',
    });
    expect(panelCut(state('o'))).toEqual({
      why: 'This clip doesn’t touch another clip on its track: a transition goes between two clips that touch.',
    });
    expect(panelCut(state('a', null, true))).toEqual({
      why: 'The Video track is locked. Unlock it to change its clips.',
    });
  });
});

/* ---------- 206 T061: transitions on the timeline (AC-9) ---------- */

describe('transition blocks, their drags and their announcements (AC-9)', () => {
  it('transitionBlock: centred on the cut, as wide as the transition', () => {
    expect(transitionBlock(4, 1, 50)).toEqual({ left: 175, width: 50 });
  });

  it('draggedLength: an edge drag changes both sides, in whole frames, from 0.1 s up to the room', () => {
    // The end edge 10 px right at 50 px/s: 0.2 s more each side.
    expect(draggedLength(1, 10, 'end', 50, 30, 3)).toBeCloseTo(1.4, 9);
    expect(draggedLength(1, 10, 'start', 50, 30, 3)).toBeCloseTo(0.6, 9);
    // 1.28 s to the nearest frame.
    expect(draggedLength(1, 7, 'end', 50, 30, 3)).toBeCloseTo(38 / 30, 9);
    expect(draggedLength(1, 500, 'end', 50, 30, 2.5)).toBe(2.5);
    expect(draggedLength(1, -500, 'end', 50, 30, 3)).toBe(0.1);
  });

  const videoClip = (id: string, start: number, transition?: Transition): TimedClip => ({
    id,
    track: 'V1',
    start,
    kind: 'photo',
    dur: 2,
    in: 0,
    out: 0,
    ...(transition ? { transition } : {}),
  });
  const tracks = [MAIN, OVERLAY_1];
  const dissolve: Transition = { kind: 'dissolve', dur: 0.5, to: 'b' };

  it('describeTransitionChange: added, changed, removed (by hand or by an edit); silent otherwise', () => {
    const plain = [videoClip('a', 0), videoClip('b', 2), videoClip('c', 4)];
    const withOne = [videoClip('a', 0, dissolve), videoClip('b', 2), videoClip('c', 4)];
    expect(describeTransitionChange(plain, withOne, tracks)).toBe(
      'Cross-dissolve added between clip 1 and clip 2, 0.50 s',
    );
    expect(
      describeTransitionChange(
        withOne,
        [videoClip('a', 0, { ...dissolve, kind: 'wipe', dir: 'up' }), videoClip('b', 2), videoClip('c', 4)],
        tracks,
      ),
    ).toBe('Wipe up between clip 1 and clip 2, 0.50 s');
    expect(
      describeTransitionChange(
        withOne,
        [videoClip('a', 0, { ...dissolve, dur: 0.8 }), videoClip('b', 2), videoClip('c', 4)],
        tracks,
      ),
    ).toBe('Cross-dissolve between clip 1 and clip 2, 0.80 s');
    expect(
      describeTransitionChange(
        withOne,
        [videoClip('a', 0, { ...dissolve, kind: 'dip', colour: 'white' }), videoClip('b', 2), videoClip('c', 4)],
        tracks,
      ),
    ).toBe('Dip to white between clip 1 and clip 2, 0.50 s');
    expect(describeTransitionChange(withOne, plain, tracks)).toBe('Transition removed between clip 1 and clip 2');
    // b deleted: a's transition went with the cut (the clip change says the rest).
    expect(describeTransitionChange(withOne, [videoClip('a', 0), videoClip('c', 2)], tracks)).toBe(
      'Transition removed after clip 1',
    );
    expect(describeTransitionChange(withOne, withOne, tracks)).toBe('');
    expect(describeTransitionChange(plain, [videoClip('b', 0), videoClip('c', 2)], tracks)).toBe('');
  });
});

/* ---------- 207: speed on the timeline (AC-11, AC-12) ---------- */

describe('207: badges, filmstrips and announcements at speed', () => {
  const at = (fields: SpeedFields) => ({ ...clip('a', 'V1', 0, 4, 1), ...fields });

  it('speedBadge: the speed, ◀ for reverse, Ramp, Still; none at 1× forwards or on a photo', () => {
    expect(speedBadge(at({}))).toBeNull();
    expect(speedBadge(at({ speed: 2 }))).toBe('2×');
    expect(speedBadge(at({ speed: 0.5 }))).toBe('0.5×');
    expect(speedBadge(at({ reverse: true }))).toBe('◀ 1×');
    expect(speedBadge(at({ speed: 2, reverse: true }))).toBe('◀ 2×');
    expect(speedBadge(at({ ramp: [...RAMP_PRESETS.hero] }))).toBe('Ramp');
    expect(speedBadge(at({ freeze: 2 }))).toBe('Still');
    expect(speedBadge({ ...at({ speed: 2 }), kind: 'photo' })).toBeNull();
  });

  it('filmstripTimes: the source time at each tile’s middle, through sourceAt', () => {
    // Source 1–5 at 1×: tiles at 1.5, 2.5, 3.5, 4.5.
    expect(filmstripTimes(at({}), 4)).toEqual([1.5, 2.5, 3.5, 4.5]);
    // At 2× the clip is 2 s long and covers the same source.
    expect(filmstripTimes(at({ speed: 2 }), 4)).toEqual([1.5, 2.5, 3.5, 4.5]);
    expect(filmstripTimes(at({ reverse: true }), 4)).toEqual([4.5, 3.5, 2.5, 1.5]);
    expect(filmstripTimes(at({ freeze: 2.5 }), 3)).toEqual([2.5, 2.5, 2.5]);
    const ramped = at({ ramp: [...RAMP_PRESETS.hero] });
    const times = filmstripTimes(ramped, 6);
    times.slice(1).forEach((time, index) => expect(time).toBeGreaterThan(defined(times[index])));
    expect(filmstripTimes({ ...at({}), kind: 'photo' }, 3)).toEqual([]);
  });

  it('describeClipChange says the speed, reverse, ramp or still', () => {
    const was = [clip('a', 'V1', 0, 4, 1)];
    const say = (fields: SpeedFields) => describeClipChange(was, [at(fields)], TRACKS, 'a');
    expect(say({ speed: 2 })).toBe('Clip 1, 0.0 s to 2.0 s, playing its source from 1.0 s at 2×');
    expect(say({ speed: 2, reverse: true })).toBe('Clip 1, 0.0 s to 2.0 s, playing its source backwards from 5.0 s at 2×');
    expect(say({ ramp: [{ at: 0, v: 2 }, { at: 1, v: 2 }] })).toBe(
      'Clip 1, 0.0 s to 2.0 s, playing its source from 1.0 s with a speed ramp',
    );
    expect(say({ freeze: 2.5, dur: 2 } as SpeedFields)).toBe('Clip 1, 0.0 s to 2.0 s, a still of its source at 2.5 s');
  });

  it('describeSpeedChange: the clip, its new speed and length; nothing when no speed changed', () => {
    const was = [clip('a', 'V1', 0, 4, 1), clip('b', 'V1', 4, 4.2, 0)];
    const slower = [was[0], { ...clip('b', 'V1', 4, 4.2, 0), speed: 0.5 }];
    expect(describeSpeedChange(was, slower, TRACKS)).toBe('Clip 2: 0.5×, now 8.4 s');
    expect(describeSpeedChange(was, [{ ...defined(was[0]), reverse: true as const }, was[1]], TRACKS)).toBe(
      'Clip 1: reversed at 1×, now 4.0 s',
    );
    expect(describeSpeedChange(was, [{ ...defined(was[0]), ramp: [...RAMP_PRESETS.hero] }, was[1]], TRACKS)).toMatch(
      /^Clip 1: speed ramp, now \d+\.\d s$/,
    );
    expect(describeSpeedChange(slower, was, TRACKS)).toBe('Clip 2: 1×, now 4.2 s');
    expect(describeSpeedChange(was, was, TRACKS)).toBe('');
  });
});
