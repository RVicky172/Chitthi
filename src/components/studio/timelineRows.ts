// The timeline's picture rows (203 §10), free of React and the DOM so they can be unit-tested: which rows show and in
// what order, which row a pointer is over while dragging, how a clip is named, and what to announce after a change.
import { describeTransform } from '../../engine/clipBox';
import { IDENTITY, MAIN_VIDEO, type TimedClip, type Track } from '../../engine/timeline';
import { clipLength } from '../../engine/video';

/** A picture row's vertical extent on screen, in client pixels. */
export interface RowBounds {
  trackId: string;
  top: number;
  bottom: number;
}

/** Where a dragged clip or dropped file goes: a picture track's id, or `'new'` for a new track above the top row. */
export type RowTarget = string | 'new';

/** Whether a track holds pictures (the main track or an overlay track). */
const isPictureTrack = (track: Track) => track.kind === 'video' || track.kind === 'overlay';

/**
 * The picture tracks as the timeline lists them.
 * @param tracks the project's tracks in drawing order (the main track, then the overlays from the bottom one up)
 * @returns the picture tracks with the top overlay first and the main track last, as they stack in the frame
 */
export function pictureTracksTopFirst(tracks: Track[]): Track[] {
  return tracks.filter(isPictureTrack).reverse();
}

/**
 * The picture row under the pointer while a clip or a file is dragged.
 * @param rows the picture rows' bounds, top row first
 * @param clientY the pointer's vertical position, client pixels
 * @param newTrackZone how many pixels above the top row count as "a new track"
 * @returns the track id of the row (a row owns its top edge), `'new'` just above the top row, or null elsewhere
 */
export function rowUnderPointer(rows: RowBounds[], clientY: number, newTrackZone: number): RowTarget | null {
  const row = rows.find((bounds) => clientY >= bounds.top && clientY < bounds.bottom);
  if (row) return row.trackId;
  const topRow = rows[0];
  return topRow && clientY < topRow.top && clientY >= topRow.top - newTrackZone ? 'new' : null;
}

/**
 * A clip's name for screen readers, titles and announcements.
 * @param track the clip's track
 * @param numberOnTrack the clip's position on its track, from 1
 * @param inSentence for use inside a sentence ("Trim the start of clip 2"): the main track's "clip" in lower case
 * @returns "Clip 2" on the main track (as before 203), "Overlay 1, clip 2" on an overlay track
 */
export function clipLabel(track: Track, numberOnTrack: number, inSentence = false): string {
  if (track.id === MAIN_VIDEO) return `${inSentence ? 'clip' : 'Clip'} ${numberOnTrack}`;
  return `${track.name}, clip ${numberOnTrack}`;
}

/**
 * What to announce after a change to the picture tracks (the timeline's live region, once a drag settles).
 * @param before the clips before the change
 * @param after the clips after it
 * @param tracks the project's tracks (for the clips' track names)
 * @param selectedId the selected clip, announced first when it changed
 * @returns the changed clip (the selected one, else the first) with its track, number, times and source start (or,
 *   when only its box changed, its new position and size); else how many clips were removed and from which track; ''
 *   when no picture clip changed
 */
export function describeClipChange(before: TimedClip[], after: TimedClip[], tracks: Track[], selectedId: string | null): string {
  const pictureTrackIds = new Set(tracks.filter(isPictureTrack).map((track) => track.id));
  const previous = new Map(before.map((clip) => [clip.id, clip]));
  const changed = after.filter((clip) => {
    if (!pictureTrackIds.has(clip.track)) return false;
    const old = previous.get(clip.id);
    return !old || movedInTime(old, clip) || old.tf !== clip.tf;
  });
  const announced = changed.find((clip) => clip.id === selectedId) ?? changed[0];
  if (announced) {
    const track = tracks.find((candidate) => candidate.id === announced.track)!;
    const numberOnTrack = after.filter((clip) => clip.track === announced.track).indexOf(announced) + 1;
    const old = previous.get(announced.id);
    if (old && !movedInTime(old, announced)) return describeTransform(clipLabel(track, numberOnTrack), announced.tf ?? IDENTITY);
    const end = announced.start + clipLength(announced);
    const span = `${clipLabel(track, numberOnTrack)}, ${announced.start.toFixed(1)} s to ${end.toFixed(1)} s`;
    return announced.kind === 'video' ? `${span}, playing its source from ${announced.in.toFixed(1)} s` : span;
  }
  const afterIds = new Set(after.map((clip) => clip.id));
  const removed = before.filter((clip) => pictureTrackIds.has(clip.track) && !afterIds.has(clip.id));
  if (!removed.length) return '';
  const track = tracks.find((candidate) => candidate.id === removed[0].track)!;
  const left = after.filter((clip) => clip.track === track.id).length;
  const what = removed.length === 1 ? 'Clip' : `${removed.length} clips`;
  return track.id === MAIN_VIDEO ? `${what} removed, ${left} left` : `${what} removed from ${track.name}, ${left} left`;
}

/** Whether a clip changed track, start, length or source start (anything but its box). */
function movedInTime(before: TimedClip, after: TimedClip): boolean {
  return before.track !== after.track || before.start !== after.start || clipLength(before) !== clipLength(after) || before.in !== after.in;
}
