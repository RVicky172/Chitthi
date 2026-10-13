/*
 * Transitions between clips (206, P2.6): a cut between two touching clips of one picture track can blend one clip into
 * the next. A transition is data on the clip before the cut, naming the clip it leads into (D1); it is centred on the
 * cut and plays the clips' sources past their ends (Q2), so the project's length and every clip's place stay the same.
 * One rule, `tidyTransitions`, keeps transitions valid after any edit (AC-4). Free of DOM and React.
 */
import { valueAt, type Keyframe } from './keyframes';
import type { TimedClip } from './timeline';
import { clipLength } from './video';

export type TransitionKind = 'dissolve' | 'dip' | 'wipe' | 'slide' | 'zoom';
export type Direction = 'left' | 'right' | 'up' | 'down';
export type DipColour = 'black' | 'white';

export const TRANSITION_KINDS: readonly TransitionKind[] = ['dissolve', 'dip', 'wipe', 'slide', 'zoom'];
export const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down'];

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

/** A new transition of `kind` into clip `to`: 0.5 s; wipes and slides go left, dips go to black. */
export function defaultTransition(kind: TransitionKind, to: string): Transition {
  const transition: Transition = { kind, dur: TRANSITION_LIMITS.default, to };
  if (kind === 'wipe' || kind === 'slide') transition.dir = 'left';
  if (kind === 'dip') transition.colour = 'black';
  return transition;
}

/** Each pair of touching clips on `track`, in time order: the cuts a transition can go on. */
export function cutsOf<C extends TimedClip>(clips: readonly C[], track: string): [C, C][] {
  const ordered = clips.filter((clip) => clip.track === track).sort((a, b) => a.start - b.start);
  const cuts: [C, C][] = [];
  for (let index = 1; index < ordered.length; index++)
    if (Math.abs(endOf(ordered[index - 1]) - ordered[index].start) <= TOUCH) cuts.push([ordered[index - 1], ordered[index]]);
  return cuts;
}

/**
 * The seconds of a clip given to transitions: `before`, the half of the transition leading into it (from its start
 * on), and `after`, the half of its own (up to its end).
 */
export function halves(clip: TimedClip, clips: readonly TimedClip[]): { before: number; after: number } {
  const leading = clips.find((other) => other.transition?.to === clip.id && other.track === clip.track);
  return { before: (leading?.transition?.dur ?? 0) / 2, after: (clip.transition?.dur ?? 0) / 2 };
}

/**
 * How far a transition on the cut at `cut` (timeline seconds) has got at time `t`: 0 → 1 over [cut − d/2, cut + d/2),
 * eased in and out; null outside it.
 */
export function progressAt(transition: Transition, cut: number, t: number): number | null {
  const start = cut - transition.dur / 2;
  if (t < start || t >= cut + transition.dur / 2) return null;
  return valueAt(EASE, (t - start) / transition.dur);
}

/**
 * The longest transition that fits on the cut between `a` and `b` (AC-3): twice the shorter of what is left of each
 * clip once its other transition has its half, at most 3 s.
 */
export function roomFor(a: TimedClip, b: TimedClip, clips: readonly TimedClip[]): number {
  const left = clipLength(a) - halves(a, clips).before,
    right = clipLength(b) - halves(b, clips).after;
  return Math.min(TRANSITION_LIMITS.max, 2 * Math.max(0, Math.min(left, right)));
}

/* ---------- The document gate (AC-5) ---------- */

export const TRANSITION_REASONS = {
  unread: 'Some transitions couldn’t be read and were left out.',
  kind: 'Some transitions were of an unknown kind and are now cross-dissolves.',
  option: 'Some transition options were unknown and were set to the defaults.',
  length: 'Some transition lengths were out of range and were adjusted.',
  cut: 'Some transitions weren’t on a cut between two touching clips and were left out.',
} as const;

/** Adds `reason` to `dropped` unless it is there already (each reason once). */
const sayOnce = (dropped: string[], reason: string) => {
  if (!dropped.includes(reason)) dropped.push(reason);
};

/**
 * A clip's transition as read from a document: only the known fields; an unknown kind becomes a cross-dissolve, an
 * unknown direction or colour the default, a length out of range is clamped (a missing option is the default, without
 * a reason); without a `to` it is left out. Whether it sits on a real cut is `tidyTransitions`' job, once the clips are
 * placed. Never throws.
 * @param raw the document's `transition` field (missing or null: none)
 * @param dropped the gate's reasons, each added once
 */
export function mergeTransition(raw: unknown, dropped: string[]): Transition | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    sayOnce(dropped, TRANSITION_REASONS.unread);
    return undefined;
  }
  const fields = raw as Record<string, unknown>;
  if (typeof fields.to !== 'string' || !fields.to) {
    sayOnce(dropped, TRANSITION_REASONS.cut);
    return undefined;
  }
  let kind = fields.kind as TransitionKind;
  if (!TRANSITION_KINDS.includes(kind)) {
    sayOnce(dropped, TRANSITION_REASONS.kind);
    kind = 'dissolve';
  }
  let dur = fields.dur;
  if (typeof dur !== 'number' || !Number.isFinite(dur)) {
    sayOnce(dropped, TRANSITION_REASONS.length);
    dur = TRANSITION_LIMITS.default;
  } else if (dur < TRANSITION_LIMITS.min || dur > TRANSITION_LIMITS.max) {
    sayOnce(dropped, TRANSITION_REASONS.length);
    dur = Math.min(TRANSITION_LIMITS.max, Math.max(TRANSITION_LIMITS.min, dur));
  }
  const transition: Transition = { kind, dur: dur as number, to: fields.to };
  if (kind === 'wipe' || kind === 'slide') {
    const dir = fields.dir as Direction;
    if (dir !== undefined && !DIRECTIONS.includes(dir)) sayOnce(dropped, TRANSITION_REASONS.option);
    transition.dir = DIRECTIONS.includes(dir) ? dir : 'left';
  }
  if (kind === 'dip') {
    const colour = fields.colour;
    if (colour !== undefined && colour !== 'black' && colour !== 'white') sayOnce(dropped, TRANSITION_REASONS.option);
    transition.colour = colour === 'white' ? 'white' : 'black';
  }
  return transition;
}

/** A transition's fields in their document order (no other fields), as `toDocument` writes them. */
export function transitionFields({ kind, dur, to, dir, colour }: Transition): Transition {
  return { kind, dur, to, ...(dir ? { dir } : {}), ...(colour ? { colour } : {}) };
}

/**
 * The one rule (AC-4), run after every edit and when a project is read: a transition whose `to` clip doesn't start
 * where its clip ends, on the same track, is dropped; the others are shortened, in time order, so each clip's two halves
 * fit in it, put on whole frames (rounding down) and capped at 3 s; under 0.1 s of room they are dropped too.
 * @returns the clips (the same array when nothing changed) and the ids of the clips whose transition was dropped
 */
export function tidyTransitions<C extends TimedClip>(clips: C[], fps: number): { clips: C[]; dropped: string[] } {
  const tracks = new Map<string, C[]>();
  for (const clip of clips) {
    const list = tracks.get(clip.track);
    if (list) list.push(clip);
    else tracks.set(clip.track, [clip]);
  }
  const changed = new Map<string, Transition | undefined>();
  const dropped: string[] = [];
  for (const list of tracks.values()) {
    const ordered = [...list].sort((a, b) => a.start - b.start);
    // The half of the transition leading into each clip, as clamped.
    let before = 0;
    for (let index = 0; index < ordered.length; index++) {
      const clip = ordered[index],
        transition = clip.transition,
        next = ordered[index + 1];
      const into = before;
      before = 0;
      if (!transition) continue;
      if (!next || next.id !== transition.to || Math.abs(endOf(clip) - next.start) > TOUCH) {
        changed.set(clip.id, undefined);
        dropped.push(clip.id);
        continue;
      }
      const room = Math.min(TRANSITION_LIMITS.max, 2 * Math.min(clipLength(clip) - into, clipLength(next)));
      const dur = Math.floor(Math.min(transition.dur, room) * fps + 1e-6) / fps;
      if (dur < TRANSITION_LIMITS.min - 1e-9) {
        changed.set(clip.id, undefined);
        dropped.push(clip.id);
        continue;
      }
      before = dur / 2;
      if (dur !== transition.dur) changed.set(clip.id, { ...transition, dur });
    }
  }
  if (!changed.size) return { clips, dropped };
  return {
    clips: clips.map((clip) => {
      if (!changed.has(clip.id)) return clip;
      const transition = changed.get(clip.id);
      if (transition) return { ...clip, transition };
      const { transition: _gone, ...rest } = clip;
      return rest as C;
    }),
    dropped,
  };
}
