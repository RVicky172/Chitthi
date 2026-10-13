import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '../engine/instagram';
import { TEXT_STYLES } from '../data/layers';
import { layerAt, type Ease, type Keyframe } from '../engine/keyframes';
import { newSticker, newText, scaleLayer, type Layer, type TextLayer } from '../engine/layers';
import { IDENTITY, MAIN_VIDEO, defaultTracks, presetTransform, tooManyTracks, type Track } from '../engine/timeline';
import {
  NEW_TRACK,
  addMedia,
  addTrack,
  applyPreset,
  clipPlace,
  deleteGap,
  deleteTrack,
  duplicateClip,
  duplicateClipWhy,
  endVStep,
  getVideo,
  loadVideoProject,
  mediaIO,
  moveClip,
  moveClipToTime,
  moveClipToTrack,
  moveTrack,
  renameTrack,
  setClipTransform,
  splitAtPlayheadWhy,
  nudgeClip,
  rippleDeleteClip,
  rippleTrimToPlayhead,
  rollClip,
  selectClip,
  setPlayhead,
  setTrack,
  slideClip,
  slipClip,
  slipMusic,
  splitAtPlayhead,
  trimClip,
  moveClipTo,
  removeClip,
  setMagnetic,
  setSnapping,
  setTool,
  undoV,
  updateClip,
  updateClipWhy,
  videoLength,
  deleteKeys,
  moveKeys,
  removeAnimation,
  setClipTransformAt,
  setClipVolume,
  setKeyEase,
  setLayerTimes,
  toggleKey,
  updateLayerAt,
  setVLayers,
  type VClip,
  type VMusic,
} from './video';

/*
 * The video store's Magnetic switch, tool and Snap (202 T020). Clips are made by hand (no media decoding in Node):
 * photos of the given lengths at the given starts on the main track (or another).
 */
const clip = (id: string, start: number, dur: number, track = MAIN_VIDEO): VClip => ({
  id,
  kind: 'photo',
  track,
  start,
  name: id,
  file: new Blob(),
  url: '',
  w: 10,
  h: 10,
  srcDur: 0,
  dur,
  in: 0,
  out: 0,
  edit: { ...DEFAULT_EDIT },
  motion: 'none',
  fade: false,
  volume: 0,
  thumb: '',
  strip: [],
  still: null,
});
const starts = () => getVideo().clips.map((c) => [c.id, c.start]);

describe('Magnetic on (the default): every edit as before', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('c', 5, 1)] }));

  it('starts on, with the Select tool and Snap on', () => {
    expect(getVideo().magnetic).toBe(true);
    expect(getVideo().tool).toBe('select');
    expect(getVideo().snapping).toBe(true);
    expect(getVideo().canUndo).toBe(false);
  });
  it('delete and reorder pack the track, one undo step each', () => {
    expect(removeClip('b')).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['c', 2],
    ]);
    undoV();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 5],
    ]);
    expect(moveClipTo('a', 2)).toBe(true);
    expect(starts()).toEqual([
      ['b', 0],
      ['c', 3],
      ['a', 4],
    ]);
  });
  it('a project loaded with gaps while magnetic is packed', () => {
    loadVideoProject({ clips: [clip('a', 1, 2), clip('b', 4, 3)] });
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });
});

describe('Magnetic off', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 3, 3), clip('c', 7, 1)], magnetic: false }));

  it('keeps gaps through other changes; the length is where the last clip ends', () => {
    expect(updateClip('b', { fade: true }, '')).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 3],
      ['c', 7],
    ]);
    expect(videoLength(getVideo())).toBe(8);
  });
  it('switching it off is not an undo step and changes no clip', () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3)] });
    setMagnetic(false);
    expect(getVideo().magnetic).toBe(false);
    expect(getVideo().canUndo).toBe(false);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });
  it('switching it on closes the gaps in one undo step; undo brings back the gaps and Magnetic off (D1)', () => {
    setMagnetic(true);
    expect(getVideo().magnetic).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 5],
    ]);
    expect(getVideo().canUndo).toBe(true);
    undoV();
    expect(getVideo().magnetic).toBe(false);
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 3],
      ['c', 7],
    ]);
  });
});

describe('the tool and Snap are view settings (D4)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2)] }));
  it('change without an undo step or making the export stale', () => {
    const before = getVideo().result;
    setTool('roll');
    setSnapping(false);
    expect(getVideo().tool).toBe('roll');
    expect(getVideo().snapping).toBe(false);
    expect(getVideo().canUndo).toBe(false);
    expect(getVideo().result).toBe(before);
  });
});

/* ---------- 202 T021: the actions with Magnetic off, and the new tools ---------- */

const len = (id: string) => {
  const c = getVideo().clips.find((x) => x.id === id)!;
  return c.kind === 'photo' ? c.dur : c.out - c.in;
};

describe('Magnetic off: nothing moves unless asked', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 3, 3), clip('c', 7, 1)], magnetic: false }));

  it('Delete lifts (a gap stays); Shift + Delete ripples', () => {
    expect(removeClip('b')).toBe(true);
    expect(starts()).toEqual([
      ['a', 0],
      ['c', 7],
    ]);
    undoV();
    expect(rippleDeleteClip('b')).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['c', 4],
    ]);
  });
  it('a trim ripples only when asked (Shift)', () => {
    expect(trimClip('a', 'end', 0.5)).toBeNull();
    expect([len('a'), ...starts().map((x) => x[1])]).toEqual([2.5, 0, 3, 7]);
    expect(trimClip('b', 'end', 1, { ripple: true })).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 3],
      ['c', 8],
    ]);
  });
  it('a duplicate goes into the first gap after the original that fits, else after the last clip (D2)', () => {
    expect(duplicateClip('a')).toBe(true);
    expect(getVideo().clips.at(-1)!.start).toBe(8);
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 5, 1)], magnetic: false });
    expect(duplicateClip('a')).toBe(true);
    expect(getVideo().clips.map((c) => c.start)).toEqual([0, 2, 5]);
    expect(getVideo().selected).toBe(getVideo().clips[1].id);
  });
  it('a clip moves to a time, or the nearest free spot', () => {
    expect(moveClipToTime('c', 6.5)).toBeNull();
    expect(starts().at(-1)).toEqual(['c', 6.5]);
    expect(moveClipToTime('a', 4)).toBeNull();
    expect(starts()[0]).toEqual(['a', 1]);
  });
  it('a gap is closed on its own', () => {
    expect(deleteGap(2.5)).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2],
      ['c', 6],
    ]);
    expect(deleteGap(0.5)).toMatch(/no gap/i);
  });
  it('split keeps the times of a clip after a gap', () => {
    setPlayhead(4);
    expect(splitAtPlayhead()).toBe(true);
    expect(getVideo().clips.map((c) => [c.start, c.dur])).toEqual([
      [0, 2],
      [3, 1],
      [4, 2],
      [7, 1],
    ]);
  });
  it('Select + Alt + arrows moves the clip by frames', () => {
    setTool('select');
    expect(nudgeClip('b', 3)).toBeNull();
    expect(getVideo().clips[1].start).toBeCloseTo(3.1, 9);
  });
});

describe('Magnetic on: trims always ripple', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('c', 5, 1)] }));
  it('without Shift too', () => {
    expect(trimClip('a', 'end', 0.5)).toBeNull();
    expect(starts()).toEqual([
      ['a', 0],
      ['b', 2.5],
      ['c', 5.5],
    ]);
  });
  it('roll, slide and the tool keys keep the length; slip refuses a photo with its reason', () => {
    expect(rollClip('a', 0.5)).toBeNull();
    expect([len('a'), len('b'), videoLength(getVideo())]).toEqual([2.5, 2.5, 6]);
    expect(slideClip('b', -0.5)).toBeNull();
    expect([len('a'), getVideo().clips[1].start, len('c'), videoLength(getVideo())]).toEqual([2, 2, 1.5, 6]);
    expect(slipClip('b', 1)).toMatch(/photo/i);
    setTool('roll');
    expect(nudgeClip('a', 30)).toBeNull();
    expect(len('a')).toBeCloseTo(3, 9);
    setTool('select');
    expect(nudgeClip('a', 1)).toBeNull();
    expect(getVideo().clips.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });
  it('Q / W ripple-trim the selected clip’s start / end to the playhead', () => {
    selectClip('b');
    setPlayhead(3);
    expect(rippleTrimToPlayhead('start')).toBeNull();
    expect([len('b'), ...starts().map((x) => x[1])]).toEqual([2, 0, 2, 4]);
    setPlayhead(3);
    expect(rippleTrimToPlayhead('end')).toBeNull();
    expect([len('b'), ...starts().map((x) => x[1])]).toEqual([1, 0, 2, 3]);
    setPlayhead(0.5);
    expect(rippleTrimToPlayhead('end')).toMatch(/playhead/i);
  });
  it('every tool refuses on a locked track with the reason', () => {
    setTrack(MAIN_VIDEO, { locked: true });
    for (const why of [
      trimClip('a', 'end', 1),
      rollClip('a', 1),
      slideClip('b', 1),
      rippleDeleteClip('b'),
      moveClipToTime('a', 3),
      nudgeClip('a', 1),
      deleteGap(1),
    ])
      expect(why).toMatch(/locked/);
  });
});

describe('the music under the Slip keys (Q8)', () => {
  const music: VMusic = { track: 'A1', file: new Blob(), name: 'song', url: '', dur: 30, volume: 1, offset: 1, peaks: [] };
  it('moves its offset within the song', () => {
    loadVideoProject({ clips: [clip('a', 0, 5)], music });
    expect(slipMusic(2)).toBeNull();
    expect(getVideo().music!.offset).toBe(3);
    expect(slipMusic(-10)).toBeNull();
    expect(getVideo().music!.offset).toBe(0);
    expect(slipMusic(100)).toBeNull();
    expect(getVideo().music!.offset).toBe(25);
  });
});

/* ---------- 203 T040: tracks, overlay clips, transforms and the videos-at-once limit ---------- */

const ov = (id: string): Track => ({ id, kind: 'overlay', name: `Overlay ${id.slice(1)}`, hidden: false, muted: false, locked: false });
/** Tracks: the main video track, the given overlay tracks (bottom first), the music. */
const withOverlays = (...ids: string[]): Track[] => {
  const [main, music] = defaultTracks();
  return [main, ...ids.map(ov), music];
};
/** A video clip playing `len` seconds (its whole source) at `start` on `track`. */
const vid = (id: string, start: number, len: number, track = MAIN_VIDEO): VClip => ({ ...clip(id, start, 0, track), kind: 'video', srcDur: len, in: 0, out: len, volume: 1 });
const on = (track: string) =>
  getVideo()
    .clips.filter((c) => c.track === track)
    .map((c) => [c.id, c.start]);
const trackIds = () => getVideo().tracks.map((t) => t.id);
/** Undoes everything: the number of steps (each action here is one). */
const undos = () => {
  let n = 0;
  while (getVideo().canUndo) {
    undoV();
    n++;
  }
  return n;
};
// Chrome's limit (3 videos at once in the browser) needs WebCodecs' VideoDecoder; Node has none (1 at a time).
const withDecoder = () => vi.stubGlobal('VideoDecoder', class {});

describe('203: tracks (AC-1, AC-2)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2)], tracks: withOverlays() }));

  it('Add track: "Overlay N" at the top of the picture tracks, one undo step each, refused at the limit with the reason', () => {
    expect(addTrack()).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
    expect(getVideo().tracks[1].name).toBe('Overlay 1');
    expect(addTrack()).toBeNull();
    expect(addTrack()).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'O2', 'O3', 'A1']);
    // The browser's limit, 4 picture tracks, with what the desktop app allows.
    expect(addTrack()).toBe(tooManyTracks(false));
    expect(trackIds()).toHaveLength(5);
    expect(undos()).toBe(3);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'A1']);
  });
  it('rename (trimmed, 1–40 characters) and move among the overlays, one undo step each; refusals give the reason', () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('x', 0, 1, 'O1'), clip('y', 1, 1, 'O2')], tracks: withOverlays('O1', 'O2') });
    expect(renameTrack('O1', '  Face cam ')).toBeNull();
    expect(getVideo().tracks[1].name).toBe('Face cam');
    expect(renameTrack('O1', '   ')).toMatch(/name/);
    expect(renameTrack('O1', 'x'.repeat(41))).toMatch(/40/);
    expect(renameTrack('O1', 'Face cam')).toBeNull(); // unchanged: no step
    expect(moveTrack('O1', 1)).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O2', 'O1', 'A1']);
    // The clips stay grouped in the tracks' order, the main track first.
    expect(getVideo().clips.map((c) => c.id)).toEqual(['a', 'y', 'x']);
    expect(moveTrack('O1', 1)).toMatch(/top track/);
    expect(moveTrack(MAIN_VIDEO, 1)).toMatch(/bottom picture track/);
    expect(undos()).toBe(2);
    expect(getVideo().tracks[1].name).toBe('Overlay 1');
    expect(getVideo().clips.map((c) => c.id)).toEqual(['a', 'x', 'y']);
  });
  it('delete takes the track’s clips in one undo step; the main track, the music and a locked track are refused', () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('x', 0, 1, 'O1')], tracks: withOverlays('O1') });
    selectClip('x');
    expect(deleteTrack(MAIN_VIDEO)).toMatch(/can’t be deleted/);
    expect(deleteTrack('A1')).toMatch(/Only overlay/);
    setTrack('O1', { locked: true });
    expect(deleteTrack('O1')).toMatch(/locked/);
    setTrack('O1', { locked: false });
    expect(deleteTrack('O1')).toBeNull();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'A1']);
    expect(getVideo().clips.map((c) => c.id)).toEqual(['a']);
    expect(getVideo().selected).toBe('a');
    undoV();
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
    expect(getVideo().clips.map((c) => c.id)).toEqual(['a', 'x']);
  });
  it('Mute is for overlay tracks (their clips’ sound), not the main track (Hide only)', () => {
    loadVideoProject({ clips: [clip('a', 0, 2)], tracks: withOverlays('O1') });
    setTrack('O1', { muted: true });
    setTrack(MAIN_VIDEO, { muted: true });
    expect(getVideo().tracks.map((t) => t.muted)).toEqual([false, true, false]);
    expect(undos()).toBe(1);
  });
  it('clipPlace numbers clips per track (the inspector’s "Clip N")', () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 2), clip('x', 3, 1, 'O1')], tracks: withOverlays('O1') });
    expect(clipPlace('b')).toMatchObject({ n: 2, track: { id: MAIN_VIDEO } });
    expect(clipPlace('x')).toMatchObject({ n: 1, track: { id: 'O1' } });
    expect(clipPlace('nope')).toBeNull();
  });
});

describe('203: adding photos and videos to a track (AC-3)', () => {
  const lengths: Record<string, number> = {};
  const file = (name: string, len: number, type = name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg') => {
    lengths[name] = len;
    return { name, blob: new Blob(['x'], { type }), type };
  };
  beforeEach(() => {
    vi.spyOn(mediaIO, 'photo').mockImplementation(async (name) => ({ ...clip(`${name}#`, 0, lengths[name]), name }));
    vi.spyOn(mediaIO, 'video').mockImplementation(async (name) => ({ ...vid(`${name}#`, 0, lengths[name]), name }));
    vi.spyOn(mediaIO, 'strip').mockResolvedValue(undefined);
    withDecoder();
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('x', 2, 1, 'O1')], tracks: withOverlays('O1') });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('without options: at the end of the main track as before, one undo step; main clips stay first', async () => {
    expect(await addMedia([file('p.jpg', 3), file('q.mp4', 4)])).toEqual([]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 2],
      ['p.jpg#', 5],
      ['q.mp4#', 8],
    ]);
    expect(getVideo().clips.map((c) => c.id)).toEqual(['a', 'b', 'p.jpg#', 'q.mp4#', 'x']);
    expect(undos()).toBe(1);
  });
  it('on an overlay track: from the playhead, each after the clips there when it doesn’t fit; never packed', async () => {
    setPlayhead(1);
    expect(await addMedia([file('p.jpg', 3), file('q.mp4', 1)], { track: 'O1' })).toEqual([]);
    // p (3 s) doesn't fit before x (2–3): it goes after x; q follows p.
    expect(on('O1')).toEqual([
      ['x', 2],
      ['p.jpg#', 3],
      ['q.mp4#', 6],
    ]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
    expect(await addMedia([file('r.jpg', 1)], { track: 'O1', at: 0.5 })).toEqual([]);
    expect(on('O1')[0]).toEqual(['r.jpg#', 0.5]);
    expect(undos()).toBe(2);
  });
  it('dropped above the top track: a new overlay track first, with the clips, in one undo step', async () => {
    expect(await addMedia([file('p.jpg', 2)], { track: NEW_TRACK, at: 4 })).toEqual([]);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'O2', 'A1']);
    expect(on('O2')).toEqual([['p.jpg#', 4]]);
    expect(undos()).toBe(1);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
    // Nothing added: no track either.
    expect(await addMedia([file('bad.gif', 1, 'image/gif')], { track: NEW_TRACK })).toHaveLength(1);
    expect(trackIds()).toEqual([MAIN_VIDEO, 'O1', 'A1']);
  });
  it('on the main track at a time with Magnetic on: inserted where it falls in the order', async () => {
    expect(await addMedia([file('p.jpg', 1)], { track: MAIN_VIDEO, at: 2.5 })).toEqual([]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['p.jpg#', 2],
      ['b', 3],
    ]);
  });
  it('with Magnetic off and no time: after the main track’s last clip, its gaps kept', async () => {
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 3, 1)], magnetic: false });
    expect(await addMedia([file('p.jpg', 1)])).toEqual([]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 3],
      ['p.jpg#', 4],
    ]);
  });
  it('refused on a locked track, a sound track or a missing one', async () => {
    setTrack('O1', { locked: true });
    expect(await addMedia([file('p.jpg', 1)], { track: 'O1' })).toEqual([expect.stringMatching(/locked/)]);
    expect(await addMedia([file('p.jpg', 1)], { track: 'A1' })).toEqual([expect.stringMatching(/picture track/)]);
    expect(await addMedia([file('p.jpg', 1)], { track: 'O9' })).toEqual([expect.stringMatching(/picture track/)]);
  });
  it('a video that would show more than 3 at once is left out with the reason; photos still go in', async () => {
    loadVideoProject({ clips: [vid('m', 0, 10), vid('x', 0, 5, 'O1'), vid('y', 0, 5, 'O2')], tracks: withOverlays('O1', 'O2', 'O3') });
    const msgs = await addMedia([file('q.mp4', 2), file('p.jpg', 2)], { track: 'O3', at: 1 });
    expect(msgs).toEqual([expect.stringMatching(/^q\.mp4 wasn’t added\. At most 3 videos can show at the same time in the browser/)]);
    expect(on('O3')).toEqual([['p.jpg#', 1]]);
    // Once the other overlay videos have ended, a video fits.
    expect(await addMedia([file('r.mp4', 2)], { track: 'O3', at: 6 })).toEqual([]);
    expect(on('O3')).toEqual([
      ['p.jpg#', 1],
      ['r.mp4#', 6],
    ]);
  });
  it('the length limit applies to where the clips end', async () => {
    expect(await addMedia([file('q.mp4', 200)], { track: 'O1', at: 80 })).toEqual([expect.stringMatching(/trimmed to 10 seconds/)]);
    expect(getVideo().clips.find((c) => c.id === 'q.mp4#')!.out).toBe(10);
    expect(await addMedia([file('p.jpg', 2)], { track: 'O1', at: 89.8 })).toEqual([expect.stringMatching(/end after 90 seconds/)]);
  });
});

describe('203: overlay clips under the edits (AC-3, Q8)', () => {
  beforeEach(() => {
    withDecoder();
    loadVideoProject({ clips: [clip('a', 0, 2), clip('b', 2, 3), clip('x', 1, 1, 'O1'), clip('y', 4, 1, 'O1')], tracks: withOverlays('O1') });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Delete lifts an overlay clip even with Magnetic on; the main track still closes up', () => {
    expect(removeClip('x')).toBe(true);
    expect(on('O1')).toEqual([['y', 4]]);
    expect(removeClip('a')).toBe(true);
    expect(on(MAIN_VIDEO)).toEqual([['b', 0]]);
  });
  it('a clip moves between picture tracks: onto an overlay where it fits, onto the main track inserted (Magnetic)', () => {
    expect(moveClipToTrack('b', 'O1', 2)).toBeNull();
    expect(on(MAIN_VIDEO)).toEqual([['a', 0]]);
    // b (3 s) doesn't fit between x and y: the nearest free spot is after y.
    expect(on('O1')).toEqual([
      ['x', 1],
      ['y', 4],
      ['b', 5],
    ]);
    undoV();
    expect(moveClipToTrack('y', MAIN_VIDEO, 0)).toBeNull();
    expect(on(MAIN_VIDEO)).toEqual([
      ['y', 0],
      ['a', 1],
      ['b', 3],
    ]);
    expect(getVideo().clips.map((c) => c.track)).toEqual([MAIN_VIDEO, MAIN_VIDEO, MAIN_VIDEO, 'O1']);
    expect(getVideo().selected).toBe('y');
  });
  it('refuses a target that isn’t a picture track, and locked tracks', () => {
    expect(moveClipToTrack('x', 'A1', 0)).toMatch(/picture track/);
    expect(moveClipToTrack('x', 'O7', 0)).toMatch(/picture track/);
    setTrack(MAIN_VIDEO, { locked: true });
    expect(moveClipToTrack('x', MAIN_VIDEO, 0)).toMatch(/locked/);
  });
  it('split takes the selected overlay clip under the playhead, else the main track’s', () => {
    setPlayhead(1.5);
    selectClip('x');
    expect(splitAtPlayheadWhy()).toBeNull();
    expect(getVideo().clips.filter((c) => c.track === 'O1').map((c) => [c.start, c.dur])).toEqual([
      [1, 0.5],
      [1.5, 0.5],
      [4, 1],
    ]);
    selectClip('b');
    setPlayhead(1);
    expect(splitAtPlayheadWhy()).toBeNull();
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      [getVideo().clips[1].id, 1],
      ['b', 2],
    ]);
    setPlayhead(0.1);
    expect(splitAtPlayheadWhy()).toMatch(/playhead inside a clip/);
  });
  it('duplicate on an overlay track goes into the next gap that fits, with Magnetic on too', () => {
    expect(duplicateClipWhy('x')).toBeNull();
    expect(on('O1').map((p) => p[1])).toEqual([1, 2, 4]);
    expect(duplicateClipWhy('y')).toBeNull();
    expect(on('O1').map((p) => p[1])).toEqual([1, 2, 4, 5]);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 2],
    ]);
  });
  it('moveClip steps within the clip’s own track', () => {
    expect(moveClip('b', -1)).toBe(true);
    expect(on(MAIN_VIDEO)).toEqual([
      ['b', 0],
      ['a', 3],
    ]);
    expect(moveClip('x', 1)).toBe(false); // overlay tracks keep times, not an order
  });
});

describe('203: the videos-at-once limit on what the store makes (AC-9)', () => {
  beforeEach(withDecoder);
  afterEach(() => vi.unstubAllGlobals());
  const many = /At most 3 videos can show at the same time in the browser.*desktop app allows 5/;
  const four = () => loadVideoProject({ clips: [vid('m', 0, 10), vid('x', 0, 2, 'O1'), vid('y', 2, 2, 'O2'), vid('z', 2, 2, 'O3')], tracks: withOverlays('O1', 'O2', 'O3') });

  it('duplicate and moves are refused when they would show a 4th video; allowed elsewhere, one step', () => {
    four();
    expect(duplicateClipWhy('x')).toMatch(many);
    expect(duplicateClip('x')).toBe(false);
    expect(moveClipToTrack('x', 'O1', 2)).toMatch(many);
    expect(getVideo().canUndo).toBe(false);
    expect(moveClipToTrack('x', 'O1', 4)).toBeNull();
    expect(undos()).toBe(1);
  });
  it('switching Magnetic on is refused when closing the gaps would show a 4th video', () => {
    loadVideoProject({ clips: [vid('a', 0, 2), vid('b', 5, 2), vid('x', 2, 2, 'O1'), vid('y', 2, 2, 'O2'), vid('z', 2, 2, 'O3')], tracks: withOverlays('O1', 'O2', 'O3'), magnetic: false });
    expect(setMagnetic(true)).toMatch(many);
    expect(getVideo().magnetic).toBe(false);
    expect(on(MAIN_VIDEO)).toEqual([
      ['a', 0],
      ['b', 5],
    ]);
  });
  it('the inspector’s own changes too (a main video lengthened under three overlay videos)', () => {
    loadVideoProject({ clips: [{ ...vid('a', 0, 2), srcDur: 10 }, vid('x', 2, 2, 'O1'), vid('y', 2, 2, 'O2'), vid('z', 2, 2, 'O3')], tracks: withOverlays('O1', 'O2', 'O3') });
    expect(updateClip('a', { out: 3 })).toBe(false);
    expect(getVideo().clips[0].out).toBe(2);
    expect(updateClip('a', { out: 1.5 })).toBe(true);
  });
  it('an older project already over the limit can still be edited down', () => {
    loadVideoProject({ clips: [vid('m', 0, 10), vid('w', 0, 2, 'O1'), vid('x', 0, 2, 'O2'), vid('y', 0, 2, 'O3')], tracks: withOverlays('O1', 'O2', 'O3') });
    expect(removeClip('y')).toBe(true);
    expect(moveClipToTrack('x', 'O2', 3)).toBeNull();
  });
  it('without WebCodecs (Firefox; Node here): one video at a time, with the reason', () => {
    vi.unstubAllGlobals();
    loadVideoProject({ clips: [vid('m', 0, 10), vid('x', 12, 2, 'O1')], tracks: withOverlays('O1') });
    expect(moveClipToTrack('x', 'O1', 4)).toMatch(/one video at a time/);
    expect(moveClipToTrack('x', MAIN_VIDEO)).toBeNull();
  });
});

describe('203: a clip’s place in the frame (AC-4, AC-5)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2), clip('x', 0, 2, 'O1')], tracks: withOverlays('O1') }));
  const tf = (id = 'x') => getVideo().clips.find((c) => c.id === id)!.tf;

  it('new and main clips have no transform (the whole frame)', () => {
    expect(tf('a')).toBeUndefined();
    expect(tf()).toBeUndefined();
  });
  it('a drag is one undo step however many changes it makes; values are clamped', () => {
    for (let i = 1; i <= 20; i++) expect(setClipTransform('x', { x: 0.5 + i / 100, y: 0.5 - i / 100 }, 'drag:x')).toBeNull();
    expect(tf()).toMatchObject({ x: 0.7, y: 0.3, w: 1 });
    expect(setClipTransform('x', { w: 9, opacity: -1, rot: 400 })).toBeNull();
    expect(tf()).toMatchObject({ w: 4, opacity: 0, rot: 180 });
    expect(undos()).toBe(2);
    expect(tf()).toBeUndefined();
  });
  it('back to the whole frame stores no transform; an unchanged value records nothing', () => {
    setClipTransform('x', { w: 0.5 }, '');
    setClipTransform('x', { w: 1 }, '');
    expect(tf()).toBeUndefined();
    endVStep();
    setClipTransform('x', { w: 1 }, '');
    expect(undos()).toBe(2);
  });
  it('presets: a corner at 35 % with a 4 % margin, upright, keeping opacity; Full frame', () => {
    setClipTransform('x', { opacity: 0.5, rot: 30 }, '');
    expect(applyPreset('x', 'top-right')).toBeNull();
    expect(tf()).toEqual({ ...presetTransform('top-right', 1080, 1920), opacity: 0.5 });
    expect(tf()!.x).toBeCloseTo(0.785, 9);
    expect(tf()!.w).toBe(0.35);
    expect(applyPreset('x', 'full')).toBeNull();
    expect(tf()).toEqual({ ...presetTransform('full', 1080, 1920), opacity: 0.5 });
    expect(undos()).toBe(3);
  });
  it('a main clip can be transformed too (Q3); locked tracks and missing clips are refused', () => {
    expect(setClipTransform('a', { w: 0.5 })).toBeNull();
    expect(tf('a')!.w).toBe(0.5);
    setTrack('O1', { locked: true });
    expect(setClipTransform('x', { w: 0.5 })).toMatch(/locked/);
    expect(applyPreset('x', 'top-left')).toMatch(/locked/);
    expect(setClipTransform('nope', { w: 0.5 })).toMatch(/isn’t on the timeline/);
  });
});

describe('203: the inspector shows why a clip change was refused (T054)', () => {
  beforeEach(() => loadVideoProject({ clips: [clip('a', 0, 2)] }));
  it('says the track is locked', () => {
    setTrack(MAIN_VIDEO, { locked: true });
    expect(updateClipWhy('a', { dur: 3 })).toMatch(/locked/);
    expect(updateClip('a', { dur: 3 })).toBe(false);
  });
  it('says the project would be too long', () => {
    expect(updateClipWhy('a', { dur: 100_000 })).toMatch(/up to/);
    expect(getVideo().clips[0].dur).toBe(2);
  });
  it('is null when the change is made', () => {
    expect(updateClipWhy('a', { dur: 3 })).toBeNull();
    expect(getVideo().clips[0].dur).toBe(3);
  });
});

/* ---------- 205 T050: keyframes in the store (AC-3, AC-5) ---------- */

describe('205: keyframes in the store (AC-3, AC-5)', () => {
  const k = (t: number, v: number, ease: Ease = 'linear'): Keyframe => ({ t, v, ease });
  const sticker = (id: string, start: number, end: number, keys?: Layer['keys']): Layer =>
    ({ ...newSticker('⭐'), id, start, end, ...(keys ? { keys } : {}) }) as Layer;
  const getClip = (id: string) => getVideo().clips.find((c) => c.id === id)!;
  const getLayer = (id: string) => getVideo().layers.find((l) => l.id === id)!;
  /** a: photo 0–4 on the main track with x keys (0.25 → 0.75); x: photo 1–3 on O1 without keys; v: video 4–8, volume 1. */
  const load = () =>
    loadVideoProject({
      clips: [{ ...clip('a', 0, 4), keys: { x: [k(0, 0.25), k(4, 0.75)] } }, clip('x', 1, 2, 'O1'), vid('v', 4, 4)],
      tracks: withOverlays('O1'),
      layers: [sticker('L', 1, 5, { opacity: [k(0, 1), k(2, 0)] }), sticker('M', 0, 3)],
    });
  beforeEach(load);

  it('split gives each part its keys, with one at the cut holding the value there', () => {
    selectClip('a');
    setPlayhead(1);
    expect(splitAtPlayheadWhy()).toBeNull();
    const [left, right] = getVideo().clips.filter((c) => c.track === MAIN_VIDEO);
    expect(left.keys).toEqual({ x: [k(0, 0.25), k(1, 0.375)] });
    expect(right.keys).toEqual({ x: [k(0, 0.375), k(3, 0.75)] });
    expect(undos()).toBe(1);
  });

  it('duplicate copies the keys', () => {
    expect(duplicateClipWhy('a')).toBeNull();
    const copy = getVideo().clips.find((c) => c.id !== 'a' && c.track === MAIN_VIDEO && c.kind === 'photo')!;
    expect(copy.keys).toEqual(getClip('a').keys);
  });

  it('setLayerTimes shifts the keys when the start edge moves, and not when the layer moves whole', () => {
    expect(setLayerTimes('L', { start: 1.5 }, 'drag:L')).toBeNull();
    expect(getLayer('L').keys).toEqual({ opacity: [k(-0.5, 1), k(1.5, 0)] });
    expect(setLayerTimes('L', { start: 2, end: 6 }, '')).toBeNull();
    expect([getLayer('L').start, getLayer('L').end]).toEqual([2, 6]);
    expect(getLayer('L').keys).toEqual({ opacity: [k(-0.5, 1), k(1.5, 0)] });
    // A layer without keys just moves.
    expect(setLayerTimes('M', { start: 1 }, '')).toBeNull();
    expect('keys' in getLayer('M')).toBe(false);
    expect(undos()).toBe(3);
  });

  it('toggleKey: starts animating at the playhead, adds at the animated value, and removes', () => {
    setPlayhead(2);
    expect(toggleKey({ clip: 'x' }, 'w')).toBeNull();
    expect(getClip('x').keys).toEqual({ w: [k(1, 1, 'ease-in-out')] });
    expect(toggleKey({ clip: 'a' }, 'x')).toBeNull();
    expect(getClip('a').keys!.x).toEqual([k(0, 0.25), k(2, 0.5, 'ease-in-out'), k(4, 0.75)]);
    // At a key: removed.
    expect(toggleKey({ clip: 'a' }, 'x')).toBeNull();
    expect(getClip('a').keys!.x).toEqual([k(0, 0.25), k(4, 0.75)]);
    // Removing a value's last key keeps its value there as the stored one: nothing jumps.
    setPlayhead(1.5);
    expect(toggleKey({ layer: 'M' }, 'rot')).toBeNull();
    expect(getLayer('M').keys).toEqual({ rot: [k(1.5, 0, 'ease-in-out')] });
    expect(toggleKey({ layer: 'M' }, 'rot')).toBeNull();
    expect(getLayer('M').keys).toBeUndefined();
    expect(getLayer('M').rot).toBe(0);
    expect(undos()).toBe(5);
  });

  it('toggleKey and removeAnimation take several values at once (a layer’s position: X and Y), one step each', () => {
    setPlayhead(2);
    expect(toggleKey({ layer: 'M' }, ['x', 'y'])).toBeNull();
    expect(getLayer('M').keys).toEqual({ x: [k(2, 0.5, 'ease-in-out')], y: [k(2, 0.5, 'ease-in-out')] });
    setPlayhead(1);
    updateLayerAt('M', { x: 0.2, y: 0.3 }, '');
    expect(toggleKey({ layer: 'M' }, ['x', 'y'])).toBeNull();
    expect(getLayer('M').keys!.x).toHaveLength(1);
    expect(removeAnimation({ layer: 'M' }, ['x', 'y'])).toBeNull();
    expect(getLayer('M').keys).toBeUndefined();
    expect(undos()).toBe(4);
  });

  it('removeAnimation keeps the value at the playhead as the stored one', () => {
    setPlayhead(1);
    expect(removeAnimation({ clip: 'a' }, 'x')).toBeNull();
    expect(getClip('a').keys).toBeUndefined();
    expect(getClip('a').tf).toEqual({ ...IDENTITY, x: 0.375 });
    setPlayhead(2);
    expect(removeAnimation({ layer: 'L' }, 'opacity')).toBeNull();
    expect(getLayer('L').opacity).toBeCloseTo(0.5, 12);
    expect(getLayer('L').keys).toBeUndefined();
    expect(undos()).toBe(2);
  });

  it('moveKeys: a drag is one undo step; moving onto a key replaces it', () => {
    for (let i = 1; i <= 10; i++) expect(moveKeys({ clip: 'a' }, 'x', 4 - (i - 1) * 0.1, 4 - i * 0.1, 'drag:key')).toBeNull();
    expect(getClip('a').keys!.x!.map((key) => +key.t.toFixed(9))).toEqual([0, 3]);
    endVStep();
    expect(moveKeys({ clip: 'a' }, 'all', 3, 0, '')).toBeNull();
    expect(getClip('a').keys!.x).toEqual([k(0, 0.75)]);
    expect(undos()).toBe(2);
  });

  it('setKeyEase and deleteKeys, for one value or all at a time', () => {
    toggleKey({ layer: 'L' }, 'x');
    expect(getLayer('L').keys!.x).toEqual([k(-1, 0.5, 'ease-in-out')]);
    setPlayhead(1);
    expect(setKeyEase({ layer: 'L' }, 'all', 0, 'hold')).toBeNull();
    expect(getLayer('L').keys!.opacity![0].ease).toBe('hold');
    expect(deleteKeys({ layer: 'L' }, 'opacity', 2)).toBeNull();
    expect(getLayer('L').keys!.opacity).toEqual([k(0, 1, 'hold')]);
    expect(deleteKeys({ layer: 'L' }, 'all', -1)).toBeNull();
    expect(getLayer('L').keys).toEqual({ opacity: [k(0, 1, 'hold')] });
    expect(undos()).toBe(4);
  });

  it('setClipTransformAt writes keys for animated values and the box for the rest, in one undo step', () => {
    setPlayhead(2);
    expect(setClipTransformAt('a', { x: 0.6, y: 0.3 }, 'drag:a')).toBeNull();
    expect(setClipTransformAt('a', { x: 0.65, y: 0.35 }, 'drag:a')).toBeNull();
    expect(getClip('a').keys!.x).toEqual([k(0, 0.25), k(2, 0.65, 'ease-in-out'), k(4, 0.75)]);
    expect(getClip('a').tf).toEqual({ ...IDENTITY, y: 0.35 });
    // Not animated: as setClipTransform.
    expect(setClipTransformAt('x', { w: 0.4 }, '')).toBeNull();
    expect(getClip('x').tf).toEqual({ ...IDENTITY, w: 0.4 });
    expect(getClip('x').keys).toBeUndefined();
    expect(undos()).toBe(2);
  });

  it('updateLayerAt routes a patch or a function on the layer as shown at the playhead', () => {
    setPlayhead(2);
    updateLayerAt('L', { opacity: 0.25, x: 0.1 }, 'drag:L');
    expect(getLayer('L').keys!.opacity).toEqual([k(0, 1), k(1, 0.25, 'ease-in-out'), k(2, 0)]);
    expect(getLayer('L').x).toBe(0.1);
    expect(getLayer('L').opacity).toBe(1);
    setPlayhead(3);
    // The function sees the layer as drawn (opacity 0 at 3 s) and its changes are routed the same way.
    updateLayerAt('L', (shown) => ({ ...shown, opacity: shown.opacity + 0.5, y: 0.9 }), '');
    expect(getLayer('L').keys!.opacity!.at(-1)).toEqual(k(2, 0.5));
    expect(getLayer('L').y).toBe(0.9);
    expect(undos()).toBe(2);
  });

  it('updateLayerAt with an animated size: the Size slider keys w and leaves the stored font size alone', () => {
    const title = { ...newText(TEXT_STYLES[0], 'Hi'), id: 'T', w: 0.4, start: 0, keys: { w: [k(0, 0.4), k(2, 0.8)] } } as Layer;
    setVLayers([title], '');
    setPlayhead(1);
    updateLayerAt('T', (shown) => scaleLayer(shown, 0.9 / shown.w), '');
    const stored = getLayer('T') as TextLayer;
    expect(stored.keys!.w).toEqual([k(0, 0.4), k(1, 0.9, 'ease-in-out'), k(2, 0.8)]);
    expect(stored.w).toBe(0.4);
    expect(stored.size).toBeCloseTo((title as TextLayer).size, 12);
    // Drawn at 1 s: 0.9 wide, its font scaled with it.
    expect((layerAt(stored, 1) as TextLayer).size).toBeCloseTo(((title as TextLayer).size * 0.9) / 0.4, 12);
  });

  it('setClipVolume keys an animated volume and stores an unanimated one', () => {
    setPlayhead(5);
    expect(setClipVolume('v', 0.5, '')).toBeNull();
    expect(getClip('v').volume).toBe(0.5);
    expect(toggleKey({ clip: 'v' }, 'volume')).toBeNull();
    setPlayhead(7);
    expect(setClipVolume('v', 0, 'slider:v')).toBeNull();
    expect(getClip('v').keys!.volume).toEqual([k(1, 0.5, 'ease-in-out'), k(3, 0, 'ease-in-out')]);
    expect(getClip('v').volume).toBe(0.5);
    expect(undos()).toBe(3);
  });

  it('refuses on a locked track and over the limits, with the reason, recording nothing', () => {
    setTrack('O1', { locked: true });
    endVStep();
    const before = getVideo().clips;
    expect(toggleKey({ clip: 'x' }, 'x')).toMatch(/locked/);
    expect(setClipTransformAt('x', { x: 0.1 }, '')).toMatch(/locked/);
    expect(moveKeys({ clip: 'x' }, 'all', 0, 1, '')).toMatch(/locked/);
    expect(getVideo().clips).toBe(before);
    loadVideoProject({ clips: [{ ...clip('a', 0, 4), keys: { x: Array.from({ length: 100 }, (_, i) => k(i / 100, 0.5)) } }] });
    setPlayhead(3);
    expect(toggleKey({ clip: 'a' }, 'x')).toMatch(/at most 100/);
    expect(setClipTransformAt('a', { x: 0.3 }, '')).toMatch(/at most 100/);
    expect(getVideo().canUndo).toBe(false);
    expect(toggleKey({ clip: 'nope' }, 'x')).toMatch(/isn’t on the timeline/);
  });
});
