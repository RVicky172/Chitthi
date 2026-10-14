/*
 * Transitions between clips (206, P2.6): a cut between two touching clips of one picture track can blend one clip into
 * the next. A transition is data on the clip before the cut, naming the clip it leads into (D1); it is centred on the
 * cut and plays the clips' sources past their ends (Q2), so the project's length and every clip's place stay the same.
 * One rule, `tidyTransitions`, keeps transitions valid after any edit (AC-4). Free of DOM and React.
 */
import { isOneOf, isRecord } from './guards';
import { valueAt, type Keyframe } from './keyframes';
import type { Mix } from './stack';
import type { TimedClip } from './timeline';
import { clipLength } from './video';

/** How one clip blends into the next. */
export type TransitionKind = 'dissolve' | 'dip' | 'wipe' | 'slide' | 'zoom';
/** The way a wipe's edge or a slide's pictures move. */
export type Direction = 'left' | 'right' | 'up' | 'down';
/** The colour a dip passes through. */
export type DipColour = 'black' | 'white';

export const TRANSITION_KINDS: readonly TransitionKind[] = ['dissolve', 'dip', 'wipe', 'slide', 'zoom'];
export const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down'];
const DIP_COLOURS: readonly DipColour[] = ['black', 'white'];

/** A transition, as saved on the clip before the cut (its field names are the document's). */
export interface Transition {
  kind: TransitionKind;
  /** Seconds, centred on the cut (Q2): 0.1–3, whole frames (Q3). */
  dur: number;
  /** The clip it leads into: it starts where this clip ends, on the same track (D1). */
  to: string;
  /** Wipe and slide: the way the edge or the pictures move. */
  dir?: Direction;
  /** Dip: the colour between the clips. */
  colour?: DipColour;
}

/** Lengths in seconds (Q3). */
export const TRANSITION_LIMITS = { min: 0.1, max: 3, default: 0.5 } as const;

/** Clips within this many seconds of each other touch (starts are sums of floating-point lengths). */
const TOUCH = 1e-6;

/** Progress is eased with 205's Ease in and out (Q12). */
const EASE: Keyframe[] = [
  { t: 0, v: 0, ease: 'ease-in-out' },
  { t: 1, v: 1, ease: 'ease-in-out' },
];

const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/**
 * A new transition: 0.5 s; wipes and slides go left, dips go to black.
 * @param kind its kind
 * @param to the id of the clip it leads into
 * @returns the transition
 */
export function defaultTransition(kind: TransitionKind, to: string): Transition {
  const transition: Transition = { kind, dur: TRANSITION_LIMITS.default, to };
  if (kind === 'wipe' || kind === 'slide') transition.dir = 'left';
  if (kind === 'dip') transition.colour = 'black';
  return transition;
}

/**
 * Each pair of touching clips on a track, in time order: the cuts a transition can go on.
 * @param clips the project's clips
 * @param track the track's id
 * @returns [the clip before the cut, the clip after it] for each cut
 */
export function cutsOf<C extends TimedClip>(clips: readonly C[], track: string): [C, C][] {
  const ordered = clips.filter((clip) => clip.track === track).sort((left, right) => left.start - right.start);
  const cuts: [C, C][] = [];
  let previous: C | undefined;
  for (const clip of ordered) {
    if (previous && Math.abs(endOf(previous) - clip.start) <= TOUCH) cuts.push([previous, clip]);
    previous = clip;
  }
  return cuts;
}

/** The seconds of a clip given to transitions, as `halves` returns them. */
export interface TransitionHalves {
  /** The half of the transition leading into the clip (from its start on). */
  before: number;
  /** The half of its own transition (up to its end). */
  after: number;
}

/**
 * The seconds of a clip given to transitions.
 * @param clip the clip
 * @param clips the project's clips
 * @returns the halves of the transitions into it and out of it (0 for none)
 */
export function halves(clip: TimedClip, clips: readonly TimedClip[]): TransitionHalves {
  const leading = clips.find((other) => other.transition?.to === clip.id && other.track === clip.track);
  return { before: (leading?.transition?.dur ?? 0) / 2, after: (clip.transition?.dur ?? 0) / 2 };
}

/**
 * How far a transition has got: 0 → 1 over [cut − dur/2, cut + dur/2), eased in and out.
 * @param transition the transition
 * @param cut the cut's time, timeline seconds
 * @param time the time, timeline seconds
 * @returns the eased progress, or null outside the transition
 */
export function progressAt(transition: Transition, cut: number, time: number): number | null {
  const start = cut - transition.dur / 2;
  if (time < start || time >= cut + transition.dur / 2) return null;
  return valueAt(EASE, (time - start) / transition.dur);
}

/**
 * The longest transition that fits on the cut between two clips (AC-3): twice the shorter of what is left of each
 * clip once its other transition has its half, at most 3 s.
 * @param before the clip before the cut
 * @param after the clip after it
 * @param clips the project's clips
 * @returns the longest length, seconds
 */
export function roomFor(before: TimedClip, after: TimedClip, clips: readonly TimedClip[]): number {
  const left = clipLength(before) - halves(before, clips).before;
  const right = clipLength(after) - halves(after, clips).after;
  return Math.min(TRANSITION_LIMITS.max, 2 * Math.max(0, Math.min(left, right)));
}

/* ---------- Drawing (AC-1, plan §3) ---------- */

/** A rectangle of the frame, in frame pixels. */
export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How one clip of a transition is drawn on the track's scratch canvas, in frame pixels: at `alpha` with `composite`,
 * inside `clip` (the part of the frame it may cover), moved by `dx`, `dy` and scaled by `scale` about the frame's centre.
 */
export interface DrawOp {
  alpha: number;
  /** `lighter` adds the two clips (a true mix, whatever their boxes); `source-over` lays one over the other. */
  composite: 'source-over' | 'lighter';
  clip?: FrameRect;
  dx: number;
  dy: number;
  scale: number;
}

/** A colour laid over the clips (a dip's), at an opacity. */
export interface ColourOver {
  css: string;
  alpha: number;
}

/** How a clip of a transition is drawn, as `transitionOps` returns it. */
export interface TransitionDraw {
  op: DrawOp;
  /** A dip's colour, drawn after the incoming clip. */
  colour?: ColourOver;
}

/** Zoom's outgoing clip grows to this scale (D3). */
const ZOOM_TO = 1.3;

/** A clip drawn as it is: opaque, laid over, not moved. */
const PLAIN: DrawOp = { alpha: 1, composite: 'source-over', dx: 0, dy: 0, scale: 1 };

/**
 * Cross-dissolve and Zoom: the two clips added, 1 − progress and progress; Zoom grows the outgoing clip 1× → 1.3× (D3).
 * @param mix the clip's part in the transition
 * @returns how the clip is drawn
 */
function blendDraw(mix: Mix): TransitionDraw {
  const outgoing = mix.role === 'from';
  return {
    op: {
      ...PLAIN,
      alpha: outgoing ? 1 - mix.progress : mix.progress,
      composite: 'lighter',
      scale: mix.kind === 'zoom' && outgoing ? 1 + (ZOOM_TO - 1) * mix.progress : 1,
    },
  };
}

/**
 * Dip: the outgoing clip to the middle and the incoming one after, with the colour over them at 1 − |2p − 1|
 * (returned with the incoming clip, which is drawn last).
 * @param mix the clip's part in the transition
 * @returns how the clip is drawn
 */
function dipDraw(mix: Mix): TransitionDraw {
  const outgoing = mix.role === 'from';
  const showing = outgoing ? mix.progress < 0.5 : mix.progress >= 0.5;
  const op = { ...PLAIN, alpha: showing ? 1 : 0 };
  if (outgoing) return { op };
  return {
    op,
    colour: { css: mix.colour === 'white' ? '#ffffff' : '#000000', alpha: 1 - Math.abs(2 * mix.progress - 1) },
  };
}

/**
 * Wipe: the frame splits at an edge moving the way of `dir`; the incoming clip shows in the part the edge has passed
 * (for `left`, the edge goes from the right side leftwards).
 * @param mix the clip's part in the transition
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @returns how the clip is drawn
 */
function wipeDraw(mix: Mix, frameWidth: number, frameHeight: number): TransitionDraw {
  const direction = mix.dir ?? 'left';
  const across = direction === 'left' || direction === 'right';
  const size = across ? frameWidth : frameHeight;
  const passed = size * mix.progress;
  const ahead = size - passed;
  // Where the passed part starts along the axis: after the part still ahead for left / up, at 0 for right / down.
  const fromFarSide = direction === 'left' || direction === 'up';
  const passedAt = fromFarSide ? ahead : 0;
  const aheadAt = fromFarSide ? 0 : passed;
  const [at, length] = mix.role === 'from' ? [aheadAt, ahead] : [passedAt, passed];
  const clip = across ? { x: at, y: 0, w: length, h: frameHeight } : { x: 0, y: at, w: frameWidth, h: length };
  return { op: { ...PLAIN, clip } };
}

/**
 * Slide: both clips move the way of `dir`, the outgoing clip out by `progress` of the frame, the incoming one in from
 * the far side.
 * @param mix the clip's part in the transition
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @returns how the clip is drawn
 */
function slideDraw(mix: Mix, frameWidth: number, frameHeight: number): TransitionDraw {
  const direction = mix.dir ?? 'left';
  const across = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const size = across ? frameWidth : frameHeight;
  const shift = mix.role === 'from' ? sign * size * mix.progress : -sign * size * (1 - mix.progress);
  return { op: across ? { ...PLAIN, dx: shift } : { ...PLAIN, dy: shift } };
}

/**
 * How a clip of a transition is drawn at its progress (data, so every kind is unit-tested without a canvas): the
 * outgoing clip alone at 0, the incoming one alone at 1.
 * @param mix the clip's part in the transition (its kind, options, eased progress and role)
 * @param frameWidth the frame's width, pixels
 * @param frameHeight the frame's height, pixels
 * @returns how the clip is drawn, and a dip's colour over it
 */
export function transitionOps(mix: Mix, frameWidth: number, frameHeight: number): TransitionDraw {
  switch (mix.kind) {
    case 'dissolve':
    case 'zoom':
      return blendDraw(mix);
    case 'dip':
      return dipDraw(mix);
    case 'wipe':
      return wipeDraw(mix, frameWidth, frameHeight);
    case 'slide':
      return slideDraw(mix, frameWidth, frameHeight);
  }
}

/* ---------- The document gate (AC-5) ---------- */

export const TRANSITION_REASONS = {
  unread: 'Some transitions couldn’t be read and were left out.',
  kind: 'Some transitions were of an unknown kind and are now cross-dissolves.',
  option: 'Some transition options were unknown and were set to the defaults.',
  length: 'Some transition lengths were out of range and were adjusted.',
  cut: 'Some transitions weren’t on a cut between two touching clips and were left out.',
} as const;

/**
 * Adds a reason to the gate's list unless it is there already (each reason once).
 * @param dropped the gate's reasons
 * @param reason the reason
 */
const sayOnce = (dropped: string[], reason: string) => {
  if (!dropped.includes(reason)) dropped.push(reason);
};

/**
 * A document's transition length: the default when it isn't a number, clamped to 0.1–3 s when out of range.
 * @param raw the document's `dur`
 * @param dropped the gate's reasons, each added once
 * @returns the length, seconds
 */
function mergeLength(raw: unknown, dropped: string[]): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    sayOnce(dropped, TRANSITION_REASONS.length);
    return TRANSITION_LIMITS.default;
  }
  if (raw < TRANSITION_LIMITS.min || raw > TRANSITION_LIMITS.max) {
    sayOnce(dropped, TRANSITION_REASONS.length);
    return Math.min(TRANSITION_LIMITS.max, Math.max(TRANSITION_LIMITS.min, raw));
  }
  return raw;
}

/**
 * A document's transition option (a direction or a colour): the default when it is missing, and also (with a
 * reason) when it is unknown.
 * @param options the known values
 * @param raw the document's value
 * @param fallback the default
 * @param dropped the gate's reasons, each added once
 * @returns the option
 */
function mergeOption<T extends string>(options: readonly T[], raw: unknown, fallback: T, dropped: string[]): T {
  if (isOneOf(options, raw)) return raw;
  if (raw !== undefined) sayOnce(dropped, TRANSITION_REASONS.option);
  return fallback;
}

/**
 * A clip's transition as read from a document: only the known fields; an unknown kind becomes a cross-dissolve, an
 * unknown direction or colour the default, a length out of range is clamped (a missing option is the default, without
 * a reason); without a `to` it is left out. Whether it sits on a real cut is `tidyTransitions`' job, once the clips are
 * placed. Never throws.
 * @param raw the document's `transition` field (missing or null: none)
 * @param dropped the gate's reasons, each added once
 * @returns the transition, or undefined when there is none or it can't be read
 */
export function mergeTransition(raw: unknown, dropped: string[]): Transition | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isRecord(raw)) {
    sayOnce(dropped, TRANSITION_REASONS.unread);
    return undefined;
  }
  if (typeof raw.to !== 'string' || !raw.to) {
    sayOnce(dropped, TRANSITION_REASONS.cut);
    return undefined;
  }
  let kind: TransitionKind = 'dissolve';
  if (isOneOf(TRANSITION_KINDS, raw.kind)) kind = raw.kind;
  else sayOnce(dropped, TRANSITION_REASONS.kind);
  const transition: Transition = { kind, dur: mergeLength(raw.dur, dropped), to: raw.to };
  if (kind === 'wipe' || kind === 'slide') transition.dir = mergeOption(DIRECTIONS, raw.dir, 'left', dropped);
  if (kind === 'dip') transition.colour = mergeOption(DIP_COLOURS, raw.colour, 'black', dropped);
  return transition;
}

/**
 * A transition's fields in their document order (no other fields), as `toDocument` writes them.
 * @param transition the transition
 * @returns a copy with only the document's fields
 */
export function transitionFields({ kind, dur, to, dir, colour }: Transition): Transition {
  return { kind, dur, to, ...(dir ? { dir } : {}), ...(colour ? { colour } : {}) };
}

/** What `tidyTransitions` returns. */
export interface TidiedClips<C extends TimedClip> {
  /** The clips: the same array when nothing changed. */
  clips: C[];
  /** The ids of the clips whose transition was dropped. */
  dropped: string[];
}

/**
 * Tidies one track's transitions, in time order (see `tidyTransitions`).
 * @param ordered the track's clips, by start
 * @param fps the project's frame rate
 * @param changed collects each clip's new transition (undefined: dropped)
 * @param dropped collects the ids of the clips whose transition was dropped
 */
function tidyTrack(
  ordered: readonly TimedClip[],
  fps: number,
  changed: Map<string, Transition | undefined>,
  dropped: string[],
): void {
  // The half of the transition leading into each clip, as clamped.
  let before = 0;
  for (const [index, clip] of ordered.entries()) {
    const transition = clip.transition;
    const next = ordered.at(index + 1);
    const into = before;
    before = 0;
    if (!transition) continue;
    const onCut = next?.id === transition.to && Math.abs(endOf(clip) - next.start) <= TOUCH;
    // Off its cut, or under 0.1 s of room: dropped.
    const length = onCut ? tidiedLength(clip, next, into, transition, fps) : 0;
    if (length < TRANSITION_LIMITS.min - 1e-9) {
      changed.set(clip.id, undefined);
      dropped.push(clip.id);
      continue;
    }
    before = length / 2;
    if (length !== transition.dur) changed.set(clip.id, { ...transition, dur: length });
  }
}

/**
 * A transition's length once it fits its cut: within the room both clips leave, at most 3 s, rounded down to whole
 * frames.
 * @param clip the clip before the cut
 * @param next the clip after it
 * @param into the half of the transition leading into `clip`, seconds
 * @param transition `clip`'s transition
 * @param fps the project's frame rate
 * @returns the length, seconds (under 0.1 s: no room)
 */
function tidiedLength(clip: TimedClip, next: TimedClip, into: number, transition: Transition, fps: number): number {
  const room = Math.min(TRANSITION_LIMITS.max, 2 * Math.min(clipLength(clip) - into, clipLength(next)));
  return Math.floor(Math.min(transition.dur, room) * fps + 1e-6) / fps;
}

/**
 * A clip without its transition.
 * @param clip the clip
 * @returns a copy without the `transition` field
 */
function withoutTransition<C extends TimedClip>(clip: C): C {
  const copy = { ...clip };
  delete copy.transition;
  return copy;
}

/**
 * The one rule (AC-4), run after every edit and when a project is read: a transition whose `to` clip doesn't start
 * where its clip ends, on the same track, is dropped; the others are shortened, in time order, so each clip's two halves
 * fit in it, put on whole frames (rounding down) and capped at 3 s; under 0.1 s of room they are dropped too.
 * @param clips the project's clips
 * @param fps the project's frame rate
 * @returns the clips (the same array when nothing changed) and the ids of the clips whose transition was dropped
 */
export function tidyTransitions<C extends TimedClip>(clips: C[], fps: number): TidiedClips<C> {
  const tracks = new Map<string, C[]>();
  for (const clip of clips) {
    const list = tracks.get(clip.track);
    if (list) list.push(clip);
    else tracks.set(clip.track, [clip]);
  }
  const changed = new Map<string, Transition | undefined>();
  const dropped: string[] = [];
  for (const list of tracks.values())
    tidyTrack(
      [...list].sort((left, right) => left.start - right.start),
      fps,
      changed,
      dropped,
    );
  if (!changed.size) return { clips, dropped };
  return {
    clips: clips.map((clip) => {
      if (!changed.has(clip.id)) return clip;
      const transition = changed.get(clip.id);
      return transition ? { ...clip, transition } : withoutTransition(clip);
    }),
    dropped,
  };
}
