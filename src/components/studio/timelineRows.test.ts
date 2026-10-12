import { describe, expect, it } from 'vitest';
import type { Track } from '../../engine/timeline';
import { clipLabel, describeClipChange, pictureTracksTopFirst, rowUnderPointer, type RowBounds } from './timelineRows';

/** A track with every switch off. */
const track = (id: string, kind: Track['kind'], name: string): Track => ({ id, kind, name, hidden: false, muted: false, locked: false });
const MAIN = track('V1', 'video', 'Video');
const OVERLAY_1 = track('V2', 'overlay', 'Overlay 1');
const OVERLAY_2 = track('V3', 'overlay', 'Overlay 2');
const MUSIC = track('A1', 'audio', 'Music');
/** The tracks in drawing order: the main track, then the overlays from the bottom one up, then the music. */
const TRACKS = [MAIN, OVERLAY_1, OVERLAY_2, MUSIC];

/** A clip with the fields the timeline's announcements read. */
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
    expect(pictureTracksTopFirst(TRACKS).map((t) => t.id)).toEqual(['V3', 'V2', 'V1']);
  });
  it('is just the main track in a project without overlays', () => {
    expect(pictureTracksTopFirst([MAIN, MUSIC]).map((t) => t.id)).toEqual(['V1']);
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
    expect(describeClipChange(was, now, TRACKS, 'o')).toBe('Overlay 1, clip 1, 1.5 s to 3.5 s, playing its source from 0.0 s');
  });
  it('says which track a clip moved to', () => {
    const was = [clip('a', 'V1', 0, 4), clip('b', 'V1', 4, 2)];
    const now = [clip('a', 'V1', 0, 4), clip('b', 'V3', 1, 2)];
    expect(describeClipChange(was, now, TRACKS, 'b')).toBe('Overlay 2, clip 1, 1.0 s to 3.0 s, playing its source from 0.0 s');
  });
  it('counts removed clips per track', () => {
    const was = [clip('a', 'V1', 0, 4), clip('o', 'V2', 1, 2), clip('p', 'V2', 3, 1)];
    const now = [clip('a', 'V1', 0, 4)];
    expect(describeClipChange(was, now, TRACKS, null)).toBe('2 clips removed from Overlay 1, 0 left');
    expect(describeClipChange([clip('a', 'V1', 0, 4)], [], TRACKS, null)).toBe('Clip removed, 0 left');
  });
  it('says nothing when no picture clip changed', () => {
    const clips = [clip('a', 'V1', 0, 4)];
    expect(describeClipChange(clips, clips, TRACKS, 'a')).toBe('');
  });
});
