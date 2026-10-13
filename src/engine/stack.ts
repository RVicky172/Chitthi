import type { Box } from './layers';
import { EDGE_EPS, MAIN_VIDEO, projectLength, type Project, type TimedClip, type Track } from './timeline';
import { progressAt, type DipColour, type Direction, type Transition, type TransitionKind } from './transitions';
import { clipLength } from './video';

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

const isPicture = (t: Track) => t.kind === 'video' || t.kind === 'overlay';
const endOf = (c: TimedClip) => c.start + clipLength(c);

/** The two items of a transition from `outgoing` into `incoming` at time t. */
function pairOf<C extends TimedClip>(outgoing: C, incoming: C, transition: Transition, progress: number, t: number, track: string): StackItem<C>[] {
  const mix = (role: Mix['role']): Mix => ({
    kind: transition.kind,
    ...(transition.dir ? { dir: transition.dir } : {}),
    ...(transition.colour ? { colour: transition.colour } : {}),
    progress,
    role,
  });
  return [
    { clip: outgoing, local: t - outgoing.start, track, mix: mix('from') },
    { clip: incoming, local: t - incoming.start, track, mix: mix('to') },
  ];
}

/**
 * The transition playing at t around the clip `hit` that covers it (206 AC-2): its own, into the clip after it, or the
 * one leading into it from the clip before; both clips' items, or null when none plays. `tidyTransitions` keeps them on
 * touching clips, so a transition's window is all that has to be checked.
 */
export function transitionItems<C extends TimedClip>(clips: readonly C[], track: string, hit: C, t: number): StackItem<C>[] | null {
  const own = hit.transition;
  if (own) {
    const progress = progressAt(own, endOf(hit), t);
    const next = progress === null ? undefined : clips.find((c) => c.id === own.to && c.track === track);
    if (next) return pairOf(hit, next, own, progress!, t, track);
  }
  for (const c of clips) {
    const transition = c.transition;
    if (!transition || transition.to !== hit.id || c.track !== track) continue;
    const progress = progressAt(transition, hit.start, t);
    if (progress !== null) return pairOf(c, hit, transition, progress, t, track);
  }
  return null;
}

/**
 * The picture clips drawn at time t, bottom first: on every visible picture track the clip covering t (a gap draws
 * nothing, so the tracks below show). The main track keeps videoAt's clamp only where 2.x had it: before 0 its first
 * clip (when that starts at 0), at or past the video's end its last clip. Between the main track's end and a later
 * overlay clip's end its area is black (Q9). Edges are EDGE_EPS early, as in videoAt and frameRange, so the stack
 * agrees with the export's frames (framePlan) at every frame. With the main track the only picture track this is
 * exactly [videoAt(p, t)] (AC-10).
 */
export function frameStack<C extends TimedClip>(p: Project<C>, t: number): StackItem<C>[] {
  const out: StackItem<C>[] = [];
  for (const tr of p.tracks) {
    if (!isPicture(tr) || tr.hidden) continue;
    let first: C | undefined, last: C | undefined, hit: C | undefined;
    for (const c of p.clips) {
      if (c.track !== tr.id) continue;
      first ??= c;
      last = c;
      if (!hit && t >= c.start - EDGE_EPS && t < endOf(c) - EDGE_EPS) hit = c;
    }
    if (!hit && first && last && tr.id === MAIN_VIDEO)
      hit = t < 0 && first.start <= 0 ? first : t >= projectLength(p) - EDGE_EPS ? last : undefined;
    if (!hit) continue;
    const pair = transitionItems(p.clips, tr.id, hit, t);
    if (pair) out.push(...pair);
    else out.push({ clip: hit, local: t - hit.start, track: tr.id });
  }
  return out;
}

/**
 * The most video clips on screen at one moment: video clips (not photos) on every picture track, hidden ones included
 * so unhiding a track can't break the limit (D3). A sweep over the clips' start and end events; clips that only
 * touch (one ends where the next starts, within EDGE_EPS of floating point) don't overlap, as in frameStack.
 */
export function mostVideosAt(clips: TimedClip[], tracks: Track[]): number {
  const picture = new Set(tracks.filter(isPicture).map((t) => t.id));
  // A transition shows both its clips (206 Q7): a video is on screen from half its incoming transition before its
  // start to half its own after its end.
  const leading = new Map<string, number>();
  for (const c of clips) if (c.transition) leading.set(c.transition.to, c.transition.dur / 2);
  const events: [number, number][] = [];
  for (const c of clips) {
    if (c.kind !== 'video' || !picture.has(c.track)) continue;
    const from = c.start - (leading.get(c.id) ?? 0),
      to = endOf(c) + (c.transition ? c.transition.dur / 2 : 0);
    // An end counts EDGE_EPS early (as frameStack's), so it comes before a start at (about) the same time.
    events.push([from, 1], [Math.max(from, to - EDGE_EPS), -1]);
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0,
    most = 0;
  for (const [, d] of events) most = Math.max(most, (n += d));
  return most;
}

/** A line the box snapped to, in pixels: `x` is a vertical line at x = at, `y` a horizontal one at y = at. */
export interface SnapGuide {
  axis: 'x' | 'y';
  at: number;
}

/** The smallest move (within tol) that puts the centre or an edge (half extent h) on one of the lines. */
function snapAxis(c: number, h: number, lines: number[], tol: number): { d: number; at: number } | null {
  let best: { d: number; at: number } | null = null;
  for (const at of lines)
    for (const f of [c, c - h, c + h]) {
      const d = at - f;
      if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at };
    }
  return best;
}

/**
 * Where a moved box lands: its centre or the edges of its (rotated) bounding box snap to the frame's centre lines
 * and edges when within `tolerance`, the nearest on each axis. Everything is in frame pixels: `box` as layerBox gives
 * it (`box.rot` in radians; ClipTransform.rot is degrees), and `tolerance` too (the stage converts its 8 screen
 * px). Returns the centre as shares of the frame (as layers' and clip transforms' x, y) and the lines snapped to, for
 * the stage to draw.
 */
export function snapBox(
  box: Box,
  W: number,
  H: number,
  tolerance: number,
): { x: number; y: number; guides: SnapGuide[] } {
  const cos = Math.abs(Math.cos(box.rot)),
    sin = Math.abs(Math.sin(box.rot));
  const hx = (box.w * cos + box.h * sin) / 2,
    hy = (box.w * sin + box.h * cos) / 2;
  const sx = snapAxis(box.cx, hx, [W / 2, 0, W], tolerance),
    sy = snapAxis(box.cy, hy, [H / 2, 0, H], tolerance);
  const guides: SnapGuide[] = [];
  if (sx) guides.push({ axis: 'x', at: sx.at });
  if (sy) guides.push({ axis: 'y', at: sy.at });
  return { x: (box.cx + (sx?.d ?? 0)) / W, y: (box.cy + (sy?.d ?? 0)) / H, guides };
}
