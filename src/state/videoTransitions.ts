import { NOT_FOUND } from '../engine/edits';
import { TRANSITION_LIMITS, cutsOf, defaultTransition, roomFor, type Transition, type TransitionKind } from '../engine/transitions';
import { lockedReason } from '../engine/tracks';
import { change, clipLocked, commit, getVideo, type VClip } from './videoStore';

/*
 * Transition actions (206 plan §5): add or change a transition on a cut, remove it, or put one on every cut of a
 * track. Each is one undo step, returning why it was refused.
 */

const NO_CUT = 'A transition goes on a cut between two clips that touch: this clip has no clip right after it on its track.';
const NO_ROOM = 'These clips are too short for a transition (it needs at least 0.1 s, half on each side).';

/**
 * The clip right after a clip on its track, touching it: the other side of its cut.
 * @param clip the clip
 * @returns the next clip, or undefined when no clip touches it
 */
const nextOnTrack = (clip: VClip): VClip | undefined => cutsOf(getVideo().clips, clip.track).find(([before]) => before.id === clip.id)?.[1];

/**
 * The transition a patch makes on a cut: a new kind brings that kind's options (a wipe goes left, a dip to black)
 * unless given, keeping the length; the length is held to 0.1 s and to the room the two clips leave.
 * @param current the transition there now, if any
 * @param patch what to set
 * @param to the clip after the cut
 * @param room the room the two clips leave, seconds
 * @returns the transition
 */
function transitionFor(current: Transition | undefined, patch: Partial<Omit<Transition, 'to'>>, to: string, room: number): Transition {
  const kind: TransitionKind = patch.kind ?? current?.kind ?? 'dissolve';
  const base: Transition = current?.kind === kind ? current : { ...defaultTransition(kind, to), ...(current ? { dur: current.dur } : {}) };
  // The patch's own kind (if any) is the `kind` above, set after it.
  const wanted: Transition = { ...base, ...patch, kind, to };
  return { ...wanted, dur: Math.min(room, Math.max(TRANSITION_LIMITS.min, wanted.dur)) };
}

/**
 * Adds a transition on the cut at the end of a clip (a 0.5 s cross-dissolve unless `patch` says otherwise), or changes
 * the one there (`transitionFor`). Refused, recording nothing, with no clip touching it after it, too little room, on
 * a locked track, or when it would show more videos at once than this app allows (Q7).
 * @param id the outgoing clip
 * @param patch what to set: kind, length, direction, colour
 * @param key groups a drag's changes into one undo step
 * @returns null, or why not
 */
export function setTransition(id: string, patch: Partial<Omit<Transition, 'to'>>, key = ''): string | null {
  const { clips } = getVideo();
  const clip = clips.find((candidate) => candidate.id === id);
  if (!clip) return NOT_FOUND;
  const locked = clipLocked(id);
  if (locked) return locked;
  const next = nextOnTrack(clip);
  if (!next) return NO_CUT;
  const room = roomFor(clip, next, clips);
  if (room < TRANSITION_LIMITS.min - 1e-9) return NO_ROOM;
  const current = clip.transition?.to === next.id ? clip.transition : undefined;
  const transition = transitionFor(current, patch, next.id, room);
  return commit(key, { clips: clips.map((candidate) => (candidate.id === id ? { ...candidate, transition } : candidate)) });
}

/**
 * Removes the transition at the end of a clip (a hard cut again); nothing to undo when there is none.
 * @param id the clip
 * @returns null, or why not
 */
export function removeTransition(id: string): string | null {
  const { clips } = getVideo();
  const clip = clips.find((candidate) => candidate.id === id);
  if (!clip) return NOT_FOUND;
  if (!clip.transition) return null;
  const locked = clipLocked(id);
  if (locked) return locked;
  const hardCut: VClip = { ...clip };
  delete hardCut.transition;
  change('', { clips: clips.map((candidate) => (candidate.id === id ? hardCut : candidate)) });
  return null;
}

/**
 * **Apply to every cut** (the Transitions panel): a 0.5 s transition of a kind on every cut of the track, replacing
 * the ones there; where the clips leave less room it is shortened, and where there is none it is left out. One step.
 * @param track the track
 * @param kind the transition
 * @returns null, or why not
 */
export function transitionEveryCut(track: string, kind: TransitionKind): string | null {
  const video = getVideo();
  const locked = lockedReason(video.tracks, track);
  if (locked) return locked;
  const cuts = cutsOf(video.clips, track);
  if (!cuts.length) return 'This track has no cuts between touching clips to put a transition on.';
  const into = new Map(cuts.map(([before, after]) => [before.id, after.id]));
  return commit('', {
    clips: video.clips.map((clip) => {
      const to = into.get(clip.id);
      return to === undefined ? clip : { ...clip, transition: defaultTransition(kind, to) };
    }),
  });
}
