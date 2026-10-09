import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EDIT } from '../engine/instagram';
import { MAIN_VIDEO } from '../engine/timeline';
import {
  deleteGap,
  duplicateClip,
  getVideo,
  loadVideoProject,
  moveClipToTime,
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
  videoLength,
  type VClip,
  type VMusic,
} from './video';

/*
 * The video store's Magnetic switch, tool and Snap (202 T020). Clips are made by hand (no media decoding in Node):
 * photos of the given lengths at the given starts on the main track.
 */
const clip = (id: string, start: number, dur: number): VClip => ({
  id,
  kind: 'photo',
  track: MAIN_VIDEO,
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
