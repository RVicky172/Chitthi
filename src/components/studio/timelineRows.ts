// The timeline's picture rows (203 §10), free of React and the DOM so they can be unit-tested: which rows show and in
// what order, which row a pointer is over while dragging, how a clip is named, and what to announce after a change;
// and the keyframe lane's diamonds, names and announcements (205 §9).
import { describeTransform } from '../../engine/clipBox';
import type { Ease, Keyframe, Keyframes } from '../../engine/keyframes';
import { IDENTITY, MAIN_VIDEO, lockedReason, type TimedClip, type Track } from '../../engine/timeline';
import { TRANSITION_LIMITS, cutsOf, type Transition, type TransitionKind } from '../../engine/transitions';
import { V_FPS, clipLength } from '../../engine/video';

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

/* ---------- The keyframe lane (205 §9) ---------- */

/** A diamond of the collapsed lane: a time with a key of one or more values, and their ease ('mixed' when they differ). */
export interface KeyTime {
  /** Seconds from the item's start (the first key's time when several are within half a frame). */
  t: number;
  /** The values with a key there, in the item's order. */
  props: string[];
  ease: Ease | 'mixed';
}

/**
 * The collapsed lane's diamonds: the union of every animated value's key times, sorted; keys within half a frame of a
 * diamond's first key are one diamond.
 * @param item a clip or layer
 * @param fps the project's frame rate
 */
export function keyTimes(item: { keys?: Keyframes<string> }, fps: number = V_FPS): KeyTime[] {
  const all: { t: number; prop: string; ease: Ease }[] = [];
  for (const [prop, list] of Object.entries(item.keys ?? {}))
    for (const key of list ?? []) all.push({ t: key.t, prop, ease: key.ease });
  all.sort((a, b) => a.t - b.t);
  const out: KeyTime[] = [];
  for (const key of all) {
    const last = out.at(-1);
    if (last && key.t - last.t < 0.5 / fps) {
      if (!last.props.includes(key.prop)) last.props.push(key.prop);
      if (last.ease !== key.ease) last.ease = 'mixed';
    } else out.push({ t: key.t, props: [key.prop], ease: key.ease });
  }
  return out;
}

/** A diamond's shape (D3): rounded for an ease (or mixed), square for hold, pointed for linear. */
export function easeShape(ease: Ease | 'mixed'): 'round' | 'square' | 'pointed' {
  return ease === 'hold' ? 'square' : ease === 'linear' ? 'pointed' : 'round';
}

const EASE_NAMES: Record<Ease | 'mixed', string> = {
  linear: 'Linear',
  'ease-in': 'Ease in',
  'ease-out': 'Ease out',
  'ease-in-out': 'Ease in and out',
  hold: 'Hold',
  mixed: 'Mixed',
};
/** An interpolation's name, as the lane's menu shows it. */
export const easeName = (ease: Ease | 'mixed'): string => EASE_NAMES[ease];

/** An animated value's name, as the inspector's field shows it (a clip's turn is "Rotation", a layer's "Turn"). */
export function keyPropName(prop: string, on: 'clip' | 'layer'): string {
  const names: Record<string, string> = {
    x: 'X',
    y: 'Y',
    w: 'Size',
    rot: on === 'clip' ? 'Rotation' : 'Turn',
    opacity: 'Opacity',
    radius: 'Corners',
    volume: 'Clip sound',
  };
  return names[prop] ?? prop;
}

/**
 * What to announce after a change to an item's keyframes (the timeline's live region).
 * @param before the item's keys before the change
 * @param after its keys after it
 * @param name the item's name ("Clip 1", a layer's name)
 * @param offset the item's start, so times are said in timeline seconds
 * @param fps the project's frame rate
 * @returns a move, an add, a removal, a new interpolation or a changed value; '' when nothing changed
 */
export function describeKeyChange(
  before: Keyframes<string> | undefined,
  after: Keyframes<string> | undefined,
  name: string,
  offset: number,
  fps: number = V_FPS,
): string {
  if (before === after || JSON.stringify(before ?? {}) === JSON.stringify(after ?? {})) return '';
  const at = (t: number) => `${(offset + t).toFixed(2)} s`;
  const was = keyTimes({ keys: before }, fps),
    now = keyTimes({ keys: after }, fps);
  if (!now.length) return was.length ? `${name}: animation removed` : '';
  if (!was.length) return `${name}: animated, keyframe at ${at(now[0].t)}`;
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5 / fps;
  const added = now.filter((time) => !was.some((old) => near(old.t, time.t))),
    removed = was.filter((time) => !now.some((time2) => near(time2.t, time.t)));
  if (added.length === 1 && removed.length === 1)
    return `${name}: keyframe moved from ${at(removed[0].t)} to ${at(added[0].t)}`;
  if (added.length && !removed.length) return `${name}: keyframe added at ${at(added[0].t)}`;
  if (removed.length && !added.length) return `${name}: keyframe at ${at(removed[0].t)} removed`;
  // The same times: a value's key added or removed at one of them, or a key's interpolation or value changed.
  for (const prop of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const old: Keyframe[] = before?.[prop] ?? [],
      next: Keyframe[] = after?.[prop] ?? [];
    for (const key of next) {
      const match = old.find((candidate) => near(candidate.t, key.t));
      if (!match) return `${name}: keyframe added at ${at(key.t)}`;
      if (match.ease !== key.ease) return `${name}: keyframe at ${at(key.t)}, ${easeName(key.ease)}`;
      if (match.v !== key.v) return `${name}: keyframe at ${at(key.t)} changed`;
    }
    const gone = old.find((key) => !next.some((candidate) => near(candidate.t, key.t)));
    if (gone) return `${name}: keyframe at ${at(gone.t)} removed`;
  }
  return `${name}: keyframes changed`;
}

/* ---------- The Transitions panel (206 §6) ---------- */

/**
 * The cut the Transitions panel acts on (AC-8): the selected cut (its outgoing clip's id), else the cut at the selected
 * clip's end, or at its start when nothing touches its end; or why there is none (no selection, a clip touching no
 * other, a locked track).
 * @returns the cut's outgoing clip and its track, or the reason
 */
export function panelCut(state: {
  clips: TimedClip[];
  tracks: Track[];
  selected: string | null;
  transitionSel: string | null;
}): { clip: string; track: string } | { why: string } {
  const byId = (id: string | null) => state.clips.find((clip) => clip.id === id);
  const cut = (clip: TimedClip | undefined) => (clip ? cutsOf(state.clips, clip.track).find(([before]) => before.id === clip.id) : undefined);
  const chosen = cut(byId(state.transitionSel));
  const selected = byId(state.selected);
  const atEnd = chosen ?? cut(selected);
  const atStart = !atEnd && selected ? cutsOf(state.clips, selected.track).find(([, after]) => after.id === selected.id) : undefined;
  const found = atEnd ?? atStart;
  if (!found) {
    if (!selected) return { why: 'Select a clip, or a cut between two clips on the timeline.' };
    return { why: 'This clip doesn’t touch another clip on its track: a transition goes between two clips that touch.' };
  }
  const [outgoing] = found;
  const locked = lockedReason(state.tracks, outgoing.track);
  return locked ? { why: locked } : { clip: outgoing.id, track: outgoing.track };
}

/* ---------- Transitions on the timeline (206 §7) ---------- */

/** A transition kind's name (the panel, the inspector, the timeline and its announcements). */
export const TRANSITION_NAMES: Record<TransitionKind, string> = {
  dissolve: 'Cross-dissolve',
  dip: 'Dip to colour',
  wipe: 'Wipe',
  slide: 'Slide',
  zoom: 'Zoom',
};

/** A transition's name with its option: "Wipe up", "Dip to white", "Cross-dissolve". */
export function transitionName(transition: Transition): string {
  if (transition.kind === 'dip') return `Dip to ${transition.colour ?? 'black'}`;
  if (transition.kind === 'wipe' || transition.kind === 'slide') return `${TRANSITION_NAMES[transition.kind]} ${transition.dir ?? 'left'}`;
  return TRANSITION_NAMES[transition.kind];
}

/** A transition's block on its row: centred on the cut (seconds), as wide as the transition, in pixels at `zoom`. */
export function transitionBlock(cut: number, dur: number, zoom: number): { left: number; width: number } {
  return { left: (cut - dur / 2) * zoom, width: dur * zoom };
}

/**
 * A transition's length after dragging one of its block's edges `dx` pixels: it changes on both sides of the cut (the
 * end edge right or the start edge left lengthens it), to the nearest frame, from 0.1 s up to `room`.
 */
export function draggedLength(dur: number, dx: number, side: 'start' | 'end', zoom: number, fps: number, room: number): number {
  const wanted = dur + ((side === 'end' ? 2 : -2) * dx) / zoom;
  const onFrames = Math.round(wanted * fps) / fps;
  return Math.min(room, Math.max(TRANSITION_LIMITS.min, onFrames));
}

/**
 * What to announce after a change to the picture tracks' transitions (the timeline's live region): the first one
 * added, changed or removed, with its cut's clips and its length; '' when none changed. A transition gone with its
 * clip isn't announced here (the clip change is).
 */
export function describeTransitionChange(before: TimedClip[], after: TimedClip[], tracks: Track[]): string {
  const previous = new Map(before.map((clip) => [clip.id, clip]));
  const name = (clips: TimedClip[], id: string) => {
    const clip = clips.find((candidate) => candidate.id === id);
    const track = clip && tracks.find((candidate) => candidate.id === clip.track);
    return clip && track ? clipLabel(track, clips.filter((candidate) => candidate.track === clip.track).indexOf(clip) + 1, true) : 'a clip';
  };
  for (const clip of after) {
    const old = previous.get(clip.id)?.transition,
      now = clip.transition;
    if (now && JSON.stringify(old) !== JSON.stringify(now)) {
      const between = `between ${name(after, clip.id)} and ${name(after, now.to)}, ${now.dur.toFixed(2)} s`;
      return old ? `${transitionName(now)} ${between}` : `${transitionName(now)} added ${between}`;
    }
    if (old && !now) {
      const next = after.find((candidate) => candidate.id === old.to);
      return next ? `Transition removed between ${name(after, clip.id)} and ${name(after, old.to)}` : `Transition removed after ${name(after, clip.id)}`;
    }
  }
  return '';
}
