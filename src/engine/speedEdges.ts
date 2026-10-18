import { curveLocalAt, curveSourceAt, playLength, sourceAt, type SpeedClip } from './speed';

/*
 * A video clip's edges at its speed (P2.7, specs/features/207-speed plan §2), for the edits (edits.ts) and split: an
 * edit moves an edge in timeline seconds and the source point behind it moves by the clip's speed there. A reversed
 * clip's start edge is its out point and its end edge its in point (AC-3); a ramped clip's edge moves along its curve,
 * which stays over a fixed source span (`rampSpan`, D2, D-050). At 1×
 * forwards every sum is the one the edits did before 207, so their results are unchanged to the last bit.
 */

/** A video clip and its source's length. */
export interface EdgeClip extends SpeedClip {
  srcDur: number;
}

/** A clip's source part after a split: its in and out points, and a ramp's span. */
type SourcePart = Pick<SpeedClip, 'in' | 'out' | 'rampSpan'>;

/**
 * A ramped clip's span, fixed before its in or out point moves (D-050).
 * @param clip the clip
 * @returns its `rampSpan` field: the span it has, else its in–out; none without a ramp
 */
const spanField = (clip: SpeedClip): Pick<SpeedClip, 'rampSpan'> =>
  clip.ramp ? { rampSpan: clip.rampSpan ?? [clip.in, clip.out] } : {};

/**
 * Whether a timeline edge of a clip is its source's out point (else its in point).
 * @param clip the clip
 * @param side the timeline edge
 * @returns true for the out point
 */
const isOutPoint = (clip: SpeedClip, side: 'start' | 'end') => (side === 'end') !== Boolean(clip.reverse && !clip.ramp);

/**
 * The longest a clip can get by moving one edge, timeline seconds: that edge's source point at the source's end (or
 * start), at the clip's speed (a ramp's along its curve).
 * @param clip the video clip
 * @param side the edge moved
 * @returns seconds
 */
export function edgeRoom(clip: EdgeClip, side: 'start' | 'end'): number {
  const toOut = isOutPoint(clip, side);
  if (clip.ramp) return side === 'end' ? curveLocalAt(clip, clip.srcDur) : playLength(clip) - curveLocalAt(clip, 0);
  const speed = clip.speed ?? 1;
  return (toOut ? clip.srcDur - clip.in : clip.out) / speed;
}

/**
 * A video clip with one edge moved so that it lasts `length` timeline seconds (its other edge stays).
 * @param clip the video clip
 * @param side the edge moved
 * @param length the new length, seconds
 * @returns the trimmed clip (its start not yet moved)
 */
export function withLength<C extends EdgeClip>(clip: C, side: 'start' | 'end', length: number): C {
  if (clip.ramp) {
    // The edge moves along the curve, which stays where it was (D-050).
    const edge = curveSourceAt(clip, side === 'end' ? length : playLength(clip) - length);
    return side === 'end'
      ? { ...clip, ...spanField(clip), out: Math.min(clip.srcDur, edge) }
      : { ...clip, ...spanField(clip), in: Math.max(0, edge) };
  }
  const speed = clip.speed ?? 1;
  return isOutPoint(clip, side)
    ? { ...clip, out: Math.min(clip.srcDur, clip.in + length * speed) }
    : { ...clip, in: Math.max(0, clip.out - length * speed) };
}

/**
 * A video clip with one edge moved by timeline seconds: the end edge (+ lengthens) or the start edge (+ shortens).
 * @param clip the video clip
 * @param side the edge
 * @param by seconds the edge moves, + later
 * @returns the clip (its start not moved)
 */
export function moveEdge<C extends EdgeClip>(clip: C, side: 'start' | 'end', by: number): C {
  if (clip.ramp) return withLength(clip, side, playLength(clip) + (side === 'end' ? by : -by));
  // Source seconds the clip gains (− loses): its out point moves out by them, or its in point back.
  const grow = (side === 'end' ? by : -by) * (clip.speed ?? 1);
  return isOutPoint(clip, side)
    ? { ...clip, out: Math.min(clip.srcDur, clip.out + grow) }
    : { ...clip, in: Math.max(0, clip.in - grow) };
}

/**
 * The source parts of a video clip cut at a time into it (split): the cut is the source time showing there, a
 * reversed clip's left part keeps its out point, and both parts of a ramped clip keep its curve and span (D-050).
 * @param clip the video clip
 * @param local the cut, seconds from its start
 * @returns the left part's source fields and the right part's (the ramp itself is the clip's)
 */
export function splitSource(clip: SpeedClip, local: number): [SourcePart, SourcePart] {
  const cut = sourceAt(clip, local);
  if (clip.ramp)
    return [
      { in: clip.in, out: cut, ...spanField(clip) },
      { in: cut, out: clip.out, ...spanField(clip) },
    ];
  return clip.reverse
    ? [
        { in: cut, out: clip.out },
        { in: clip.in, out: cut },
      ]
    : [
        { in: clip.in, out: cut },
        { in: cut, out: clip.out },
      ];
}
