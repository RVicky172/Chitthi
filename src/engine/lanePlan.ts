import { transitionItems } from './stack';
import { MAIN_VIDEO } from './tracks';
import { clipLength, type Project, type TimedClip } from './timeline';
import { playLength, sourceAt, type SpeedClip } from './speed';

/*
 * Which clips the decoder pool (decodePool.ts) needs lanes for at a time, and the part of its file each lane covers.
 * Moved out of decodePool.ts (207 T022) so the pool's file stays within the size rules; pure, no decoding here.
 */

/** The clips a time needs, as `lanePlan` returns them. */
export interface LanePlan<C> {
  /** The video clips showing, bottom track first. */
  visible: C[];
  /** Each track's next video clip to start soon. */
  next: C[];
}

const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/**
 * The clip a picture track shows at a time: the one covering it; on the main track only, before 0 its first clip
 * (when that starts at 0) and at or past the video's end its last clip, as `videoAt` does.
 * @param onTrack the track's clips, in start order
 * @param track the track's id
 * @param time timeline seconds
 * @returns the clip, or undefined for a gap
 */
function clipAt<C extends TimedClip>(onTrack: readonly C[], track: string, time: number): C | undefined {
  const hit = onTrack.find((clip) => time >= clip.start && time < endOf(clip));
  if (hit || track !== MAIN_VIDEO) return hit;
  const first = onTrack.at(0);
  const last = onTrack.at(-1);
  if (!first || !last) return undefined;
  if (time < 0 && first.start <= 0) return first;
  return time >= endOf(last) ? last : undefined;
}

/**
 * A track's next video clip whose picture starts (its incoming transition first) less than `ahead` seconds after a
 * time.
 * @param onTrack the track's clips, in start order
 * @param shown the clips showing now
 * @param time timeline seconds
 * @param ahead seconds to look ahead
 * @returns the clip, or undefined
 */
function nextToStart<C extends TimedClip>(
  onTrack: readonly C[],
  shown: readonly C[],
  time: number,
  ahead: number,
): C | undefined {
  // A clip's picture starts half its incoming transition before the clip does.
  const pictureStart = (clip: C) =>
    clip.start - (onTrack.find((other) => other.transition?.to === clip.id)?.transition?.dur ?? 0) / 2;
  return onTrack.find(
    (clip) => !shown.includes(clip) && clip.kind === 'video' && clip.start > time && pictureStart(clip) - time < ahead,
  );
}

/**
 * The clips a time needs (Q10): the video clip visible on every visible picture track (bottom track first; the main
 * track clamps at its ends as `videoAt` does) and, during a transition, the other clip of it too (206); and each such
 * track's next video clip to start soon. Photos need no lane.
 * @param project the project
 * @param time timeline seconds
 * @param ahead seconds to look ahead for the next clips
 * @returns the visible clips and the next ones
 */
export function lanePlan<C extends TimedClip>(project: Project<C>, time: number, ahead: number): LanePlan<C> {
  const visible: C[] = [];
  const next: C[] = [];
  for (const track of project.tracks) {
    if ((track.kind !== 'video' && track.kind !== 'overlay') || track.hidden) continue;
    const onTrack = project.clips.filter((clip) => clip.track === track.id);
    if (!onTrack.length) continue;
    const hit = clipAt(onTrack, track.id, time);
    const shown = hit ? (transitionItems(onTrack, track.id, hit, time)?.map((item) => item.clip) ?? [hit]) : [];
    for (const clip of shown) if (clip.kind === 'video') visible.push(clip);
    const upcoming = nextToStart(onTrack, shown, time, ahead);
    if (upcoming) next.push(upcoming);
  }
  return { visible, next };
}

/** The part of a file a lane covers, as `laneWindow` gives it: a `PoolClip`'s `in`, `out`, `reverse` and `still`. */
export interface LaneWindow {
  in: number;
  out: number;
  /** Shown from `out` back to `in`. */
  reverse?: true;
  /** One source time throughout (a freeze frame). */
  still?: true;
}

/**
 * The source span a clip's lane covers (207 §3a): from `sourceAt` at the first and last times it shows, its
 * transition handles (206) included, so a clip at 2× covers twice its length and a reversed clip covers out → in.
 * Never before the file's start; the file's end is the frame source's to clamp, as before.
 * @param clip the video clip
 * @param lead seconds it shows before its start (its incoming transition's handle)
 * @param trail seconds it shows after its end (its outgoing transition's handle)
 * @returns the span, with `reverse` for a reversed clip and `still` for a freeze frame
 */
export function laneWindow(clip: SpeedClip, lead: number, trail: number): LaneWindow {
  if (clip.freeze !== undefined) return { in: clip.freeze, out: clip.freeze, still: true };
  const first = sourceAt(clip, -lead);
  const last = sourceAt(clip, playLength(clip) + trail);
  const window: LaneWindow = { in: Math.max(0, Math.min(first, last)), out: Math.max(first, last) };
  if (clip.reverse && !clip.ramp) window.reverse = true;
  return window;
}
