import type { Box } from './layers';
import { clipLength, EDGE_EPS, projectLength, type Project, type TimedClip } from './timeline';
import { frameSourceAt } from './speed';
import { MAIN_VIDEO, type Track } from './tracks';
import { progressAt, type DipColour, type Direction, type Transition, type TransitionKind } from './transitions';

/*
 * What shows at a time when several picture tracks draw at once (P2.3, specs/features/203-compositing-pip plan §3),
 * free of DOM and React: the stack of clips drawn in a frame, the most videos on screen at one moment (the limit of
 * AC-9), and where a moved clip box snaps on the stage (AC-5). Tracks are in drawing order, bottom first.
 */

/** How a clip of a transition is drawn (206): the transition's kind and options, its eased progress, and which side. */
export interface Mix {
  kind: TransitionKind;
  dir?: Direction;
  colour?: DipColour;
  /** 0 → 1 over the transition, eased in and out. */
  progress: number;
  /** The outgoing clip (`from`) or the incoming one (`to`). */
  role: 'from' | 'to';
}

/**
 * A clip drawn at a time: the clip, seconds into it, and its track. During a transition both clips are drawn, each
 * with `mix`; `local` then runs past the clip's ends (its handles: the outgoing clip past its length, the incoming one
 * below 0).
 */
export interface StackItem<C extends TimedClip> {
  clip: C;
  local: number;
  track: string;
  mix?: Mix;
}

const isPicture = (track: Track) => track.kind === 'video' || track.kind === 'overlay';
const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/**
 * The two items of a transition from `outgoing` into `incoming`.
 * @param outgoing the clip the transition leaves
 * @param incoming the clip it goes into
 * @param transition the transition
 * @param progress its eased progress, 0–1
 * @param time the project time, seconds
 * @param track the clips' track
 * @returns the outgoing clip's item, then the incoming one's
 */
function pairOf<C extends TimedClip>(
  outgoing: C,
  incoming: C,
  transition: Transition,
  progress: number,
  time: number,
  track: string,
): StackItem<C>[] {
  const mix = (role: Mix['role']): Mix => ({
    kind: transition.kind,
    ...(transition.dir ? { dir: transition.dir } : {}),
    ...(transition.colour ? { colour: transition.colour } : {}),
    progress,
    role,
  });
  return [
    { clip: outgoing, local: time - outgoing.start, track, mix: mix('from') },
    { clip: incoming, local: time - incoming.start, track, mix: mix('to') },
  ];
}

/**
 * The source time a stack item shows (207): its video frame through `frameSourceAt`, so a clip at speed, reversed,
 * ramped or frozen shows the same frame in the preview and the export, its transition handles at its edge speed.
 * @param item the item
 * @returns source seconds, or null for a photo
 */
export const itemSource = <C extends TimedClip>(item: StackItem<C>): number | null =>
  item.clip.kind === 'video' ? frameSourceAt(item.clip, item.local) : null;

/**
 * The transition playing around the clip that covers a time (206 AC-2): its own, into the clip after it, or the one
 * leading into it from the clip before. `tidyTransitions` keeps them on touching clips, so a transition's window is
 * all that has to be checked.
 * @param clips the project's clips
 * @param track the track of `hit`
 * @param hit the clip covering `time`
 * @param time the project time, seconds
 * @returns both clips' items, or null when no transition plays
 */
export function transitionItems<C extends TimedClip>(
  clips: readonly C[],
  track: string,
  hit: C,
  time: number,
): StackItem<C>[] | null {
  const own = hit.transition;
  if (own) {
    const progress = progressAt(own, endOf(hit), time);
    if (progress !== null) {
      const next = clips.find((clip) => clip.id === own.to && clip.track === track);
      if (next) return pairOf(hit, next, own, progress, time, track);
    }
  }
  for (const clip of clips) {
    const transition = clip.transition;
    if (transition?.to !== hit.id || clip.track !== track) continue;
    const progress = progressAt(transition, hit.start, time);
    if (progress !== null) return pairOf(clip, hit, transition, progress, time, track);
  }
  return null;
}

/**
 * The clip a picture track shows at a time: the one covering it (edges EDGE_EPS early); on the main track only, before
 * 0 its first clip (when that starts at 0) and at or past the video's end its last clip, as 2.x's videoAt did.
 * @param project the project
 * @param track the picture track
 * @param time the project time, seconds
 * @returns the clip, or undefined for a gap
 */
function clipShownAt<C extends TimedClip>(project: Project<C>, track: Track, time: number): C | undefined {
  let first: C | undefined, last: C | undefined;
  for (const clip of project.clips) {
    if (clip.track !== track.id) continue;
    if (time >= clip.start - EDGE_EPS && time < endOf(clip) - EDGE_EPS) return clip;
    first ??= clip;
    last = clip;
  }
  if (!first || !last || track.id !== MAIN_VIDEO) return undefined;
  if (time < 0 && first.start <= 0) return first;
  return time >= projectLength(project) - EDGE_EPS ? last : undefined;
}

/**
 * The picture clips drawn at a time, bottom first: on every visible picture track the clip covering it (a gap draws
 * nothing, so the tracks below show; the main track's clamp is `clipShownAt`'s). Between the main track's end and a
 * later overlay clip's end its area is black (Q9). Edges are EDGE_EPS early, as in videoAt and frameRange, so the
 * stack agrees with the export's frames (framePlan) at every frame. With the main track the only picture track this
 * is exactly [videoAt(project, time)] (AC-10).
 * @param project the project
 * @param time the project time, seconds
 * @returns the items to draw, bottom first; a transition gives two
 */
export function frameStack<C extends TimedClip>(project: Project<C>, time: number): StackItem<C>[] {
  const items: StackItem<C>[] = [];
  for (const track of project.tracks) {
    if (!isPicture(track) || track.hidden) continue;
    const hit = clipShownAt(project, track, time);
    if (!hit) continue;
    const pair = transitionItems(project.clips, track.id, hit, time);
    if (pair) items.push(...pair);
    else items.push({ clip: hit, local: time - hit.start, track: track.id });
  }
  return items;
}

/**
 * The most video clips on screen at one moment: video clips (not photos) on every picture track, hidden ones included
 * so unhiding a track can't break the limit (D3). A sweep over the clips' start and end events; clips that only
 * touch (one ends where the next starts, within EDGE_EPS of floating point) don't overlap, as in frameStack.
 * @param clips the project's clips
 * @param tracks the project's tracks
 * @returns the largest number of videos showing at once
 */
export function mostVideosAt(clips: readonly TimedClip[], tracks: readonly Track[]): number {
  const picture = new Set(tracks.filter(isPicture).map((track) => track.id));
  // A transition shows both its clips (206 Q7): a video is on screen from half its incoming transition before its
  // start to half its own after its end.
  const leading = new Map<string, number>();
  for (const clip of clips) if (clip.transition) leading.set(clip.transition.to, clip.transition.dur / 2);
  /** [time, +1 for a start or −1 for an end]. */
  const events: [number, number][] = [];
  for (const clip of clips) {
    if (clip.kind !== 'video' || !picture.has(clip.track)) continue;
    const from = clip.start - (leading.get(clip.id) ?? 0);
    const to = endOf(clip) + (clip.transition ? clip.transition.dur / 2 : 0);
    // An end counts EDGE_EPS early (as frameStack's), so it comes before a start at (about) the same time.
    events.push([from, 1], [Math.max(from, to - EDGE_EPS), -1]);
  }
  events.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  let showing = 0;
  let most = 0;
  for (const [, change] of events) {
    showing += change;
    most = Math.max(most, showing);
  }
  return most;
}

/** A line the box snapped to, in pixels: `x` is a vertical line at x = at, `y` a horizontal one at y = at. */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
}

/** A snap on one axis: how far the box moves, and the line it lands on. */
interface AxisSnap {
  move: number;
  at: number;
}

/** Where a moved box lands, as `snapBox` returns it. */
export interface SnappedBox {
  /** The centre, as shares of the frame (as layers' and clip transforms' x, y). */
  x: number;
  y: number;
  /** The lines snapped to, for the stage to draw. */
  guides: SnapGuide[];
}

/**
 * The smallest move on one axis that puts the box's centre or an edge on one of the lines.
 * @param centre the box's centre on this axis, pixels
 * @param halfExtent half the box's bounding size on this axis, pixels
 * @param lines the lines to snap to, pixels
 * @param tolerance the largest move allowed, pixels
 * @returns the move and the line, or null when none is within `tolerance`
 */
function snapAxis(centre: number, halfExtent: number, lines: readonly number[], tolerance: number): AxisSnap | null {
  let best: AxisSnap | null = null;
  for (const at of lines)
    for (const point of [centre, centre - halfExtent, centre + halfExtent]) {
      const move = at - point;
      if (Math.abs(move) <= tolerance && (!best || Math.abs(move) < Math.abs(best.move))) best = { move, at };
    }
  return best;
}

/**
 * Where a moved box lands: its centre or the edges of its (rotated) bounding box snap to the frame's centre lines
 * and edges when within `tolerance`, the nearest on each axis. Everything is in frame pixels: `box` as layerBox gives
 * it (`box.rot` in radians; ClipTransform.rot is degrees), and `tolerance` too (the stage converts its 8 screen px).
 * @param box the box, frame pixels
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @param tolerance how close an edge or the centre must come to a line to snap, pixels
 * @returns the centre as shares of the frame, and the lines snapped to
 */
export function snapBox(box: Box, frameWidth: number, frameHeight: number, tolerance: number): SnappedBox {
  const cos = Math.abs(Math.cos(box.rot));
  const sin = Math.abs(Math.sin(box.rot));
  const halfWidth = (box.w * cos + box.h * sin) / 2;
  const halfHeight = (box.w * sin + box.h * cos) / 2;
  const snapX = snapAxis(box.cx, halfWidth, [frameWidth / 2, 0, frameWidth], tolerance);
  const snapY = snapAxis(box.cy, halfHeight, [frameHeight / 2, 0, frameHeight], tolerance);
  const guides: SnapGuide[] = [];
  if (snapX) guides.push({ axis: 'x', at: snapX.at });
  if (snapY) guides.push({ axis: 'y', at: snapY.at });
  return { x: (box.cx + (snapX?.move ?? 0)) / frameWidth, y: (box.cy + (snapY?.move ?? 0)) / frameHeight, guides };
}
