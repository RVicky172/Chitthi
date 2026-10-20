import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Tool } from '../../engine/edits';
import { adjacentKey, isClipKeyProp, isLayerKeyProp } from '../../engine/keyframes';
import { layerName, type Layer } from '../../engine/layers';
import { soundLength } from '../../engine/soundClips';
import { clipLength } from '../../engine/timeline';
import type { Track } from '../../engine/tracks';
import { toast } from '../../lib/toast';
import { deleteGap, nudgeClip, removeClip, rippleDeleteClip, rippleTrimToPlayhead, splitAtPlayheadWhy } from '../../state/videoClips';
import { freezeFrameAtPlayhead, type SpeedOutcome } from '../../state/videoSpeed';
import { deleteKeys, toggleKey, type KeyProp, type KeyTarget } from '../../state/videoKeys';
import { removeVLayer } from '../../state/videoLayers';
import { moveSoundTo, removeSound, rollSoundBy, slideSoundBy, slipMusic, slipSoundBy, songOf, splitSoundAt } from '../../state/videoSound';
import { clipLocked, getVideo, setPlayhead, setPlaying, setTool, setZoom, type VClip, type VSound } from '../../state/videoStore';
import { typingIn } from '../ig/LayerPanel';
import { animatedProps, type LaneItem } from './KeyframeLane';
import { clipLabel, keyTimes } from './timelineRows';

/*
 * The timeline's actions that aren't drawing: saying why an edit was refused, the selection as the keyframe lane sees
 * it, K and Alt + [ / ], and the timeline's keyboard.
 */

/** Fired on the document to scroll a time and a sound track's row into view (505 §3); the detail is a `Reveal`. */
export const REVEAL_ON_TIMELINE = 'chitthi:reveal-on-timeline';

/** What to scroll into view: a time, s, and the track whose row shows it. */
export interface Reveal {
  time: number;
  track: string;
}

/**
 * Scrolls the timeline to a time and a track's row (the Recordings list revealing a take's clip, 505 AC-1); the
 * timeline otherwise follows the playhead only while playing.
 * @param time the time, s
 * @param track the track's id
 */
export function revealOnTimeline(time: number, track: string): void {
  if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent<Reveal>(REVEAL_ON_TIMELINE, { detail: { time, track } }));
}

/**
 * Shows a refusal's reason, if any.
 * @param why the reason, or null when the edit went through
 */
export function tell(why: string | null): void {
  if (why) toast(why);
}

/**
 * A clip as it is now (a drag edits from the store's current state, step by step).
 * @param id the clip
 * @returns the clip, or undefined when it is gone
 */
export const clipNow = (id: string): VClip | undefined => getVideo().clips.find((clip) => clip.id === id);

/**
 * Says a drag's refusal once (the same reason would repeat on every pointer move).
 * @returns a function that shows each new reason
 */
export function sayOnce(): (why: string | null) => void {
  let said = '';
  return (why) => {
    if (why && why !== said) toast(why);
    said = why ?? said;
  };
}

/**
 * Whether a clip is on a locked track (and says why in a toast).
 * @param id the clip
 * @returns true when it can't be changed
 */
export function refuseLocked(id: string): boolean {
  const why = clipLocked(id);
  if (why) toast(why);
  return !!why;
}

/** Splits the selected sound clip (208), else the clip under the playhead (S, the Split button), or says why not (locked, outside a clip, or over the videos-at-once limit). */
export function splitAtPlayhead(): void {
  const { soundSel } = getVideo();
  tell(soundSel ? splitSoundAt(soundSel) : splitAtPlayheadWhy());
}

/**
 * Nudges the selected sound clip with the edit tool (208, Q5): Select moves it, Slip plays another part of its file,
 * Slide moves it between its neighbours, Roll moves the cut at its end.
 * @param id the sound clip
 * @param by seconds (positive: later)
 * @returns null, or why not
 */
function nudgeSound(id: string, by: number): string | null {
  const state = getVideo();
  const clip = state.sounds.find((sound) => sound.id === id);
  if (!clip) return null;
  if (state.tool === 'slip') return slipSoundBy(id, by);
  if (state.tool === 'slide') return slideSoundBy(id, by);
  if (state.tool === 'roll') return rollSoundBy(id, by);
  return moveSoundTo(id, Math.max(0, clip.start + by));
}

/**
 * Says what a speed action did (207): its refusal, or its note (a ramp dropped for reverse, a transition shortened).
 * @param outcome the store's answer
 * @returns whether it went through
 */
export function tellSpeed(outcome: SpeedOutcome): boolean {
  if ('error' in outcome) {
    toast(outcome.error);
    return false;
  }
  if (outcome.note) toast(outcome.note);
  return true;
}

/** Freeze frame at the playhead (207 AC-4, Q10: the Transport's button and Shift + F), saying why when refused. */
export function freezeAtPlayhead(): void {
  tellSpeed(freezeFrameAtPlayhead());
}

/** The edit tools (202, Q5): what dragging a clip or its edge does, and its key. */
export const EDIT_TOOLS: [tool: Tool, name: string, key: string, what: string][] = [
  ['select', 'Select', 'V', 'drag a clip to move it, its edges to trim (Shift: ripple)'],
  ['roll', 'Roll', 'R', 'drag a cut to move it between two clips; the length stays'],
  ['slip', 'Slip', 'Y', 'drag a video clip to play another part of it, in the same place'],
  ['slide', 'Slide', 'U', 'drag a clip between its neighbours; they give and take the time'],
];

/** The selected clip or layer as the keyframe lane sees it (205 §9). */
export interface SelectedItem {
  target: KeyTarget;
  item: LaneItem;
  /** Its name in labels and announcements. */
  name: string;
  /** The row the lane goes under: the clip's track or the layer. */
  row: string;
}

/** What the timeline shows, for finding the selection. */
export interface SelectionContext {
  pictureTracks: Track[];
  pictureClips: VClip[];
  layers: Layer[];
  /** The selected clip, or null. */
  selected: string | null;
  /** The selected layer, or null (it wins over a selected clip). */
  layerSel: string | null;
  /** The sound tracks and their clips, and the selected sound clip (208: it wins over a selected clip). */
  soundTracks?: Track[];
  sounds?: readonly VSound[];
  soundSel?: string | null;
  /** The video's length in seconds. */
  total: number;
}

/**
 * The selected sound clip (208), else the selected layer, else the selected picture clip.
 * @param context the tracks, clips, layers and selection
 * @returns it as the keyframe lane sees it, or null
 */
export function selectedItem({ pictureTracks, pictureClips, layers, selected, layerSel, total, soundTracks = [], sounds = [], soundSel = null }: SelectionContext): SelectedItem | null {
  const sound = soundSel ? sounds.find((candidate) => candidate.id === soundSel) : undefined;
  const soundTrack = sound && soundTracks.find((candidate) => candidate.id === sound.track);
  if (sound && soundTrack)
    return { target: { sound: sound.id }, item: { start: sound.start, length: soundLength(sound, total, sounds), keys: sound.keys }, name: `${soundTrack.name}: ${sound.name ?? 'Sound'}`, row: soundTrack.id };
  if (layerSel) {
    const layer = layers.find((candidate) => candidate.id === layerSel);
    if (!layer) return null;
    const start = layer.start ?? 0;
    const length = Math.max(0, Math.min(layer.end ?? total, total) - start);
    return { target: { layer: layer.id }, item: { start, length, keys: layer.keys }, name: layerName(layer), row: layer.id };
  }
  const clip = pictureClips.find((candidate) => candidate.id === selected);
  const track = clip && pictureTracks.find((candidate) => candidate.id === clip.track);
  if (!clip || !track) return null;
  const numberOnTrack = pictureClips.filter((candidate) => candidate.track === clip.track).indexOf(clip) + 1;
  return { target: { clip: clip.id }, item: { start: clip.start, length: clipLength(clip), keys: clip.keys }, name: clipLabel(track, numberOnTrack), row: track.id };
}

/**
 * K (205 D2): keyframes at the playhead for every animated value of the selection, or, when it has keyframes there,
 * removes them.
 * @param keyed the selection
 * @param time the playhead
 * @param fps the project's frame rate
 */
export function keyAtPlayhead(keyed: SelectedItem | null, time: number, fps: number): void {
  if (!keyed) {
    toast('Select a clip or a layer first.');
    return;
  }
  const props = animatedProps(keyed.item);
  if (!props.length) {
    toast('Nothing is animated yet: start with a keyframe button in the inspector.');
    return;
  }
  const local = time - keyed.item.start;
  const isAtKey = keyTimes(keyed.item, fps).some((key) => Math.abs(key.t - local) < 0.5 / fps);
  const keyProps = props.filter((prop): prop is KeyProp => isClipKeyProp(prop) || isLayerKeyProp(prop));
  tell(isAtKey ? deleteKeys(keyed.target, 'all', local) : toggleKey(keyed.target, keyProps));
}

/**
 * Whether a key press holds Alt without Ctrl or ⌘.
 * @param event the key press
 * @returns true for Alt alone (Shift allowed)
 */
const altOnly = (event: ReactKeyboardEvent): boolean => event.altKey && !event.ctrlKey && !event.metaKey;

/**
 * Alt + [ / ] (205 D2): the playhead to the selection's previous / next keyframe (by key position, any layout).
 * @param keyed the selection
 * @param back true for the previous keyframe
 */
function jumpToKey(keyed: SelectedItem | null, back: boolean): void {
  if (!keyed) {
    toast('Select a clip or a layer first.');
    return;
  }
  const { t: time, fps } = getVideo();
  const next = adjacentKey(keyed.item, time - keyed.item.start, back ? -1 : 1, fps);
  if (next === null) toast(animatedProps(keyed.item).length ? 'No more keyframes that way.' : 'Nothing is animated yet.');
  else setPlayhead(keyed.item.start + next);
}

/**
 * Alt + ← / → (Q5): nudges the selected clip with the tool, a frame (Shift: a second); kept from the browser's Back.
 * @param back true for ←
 * @param bySecond true with Shift
 */
function nudgeSelection(back: boolean, bySecond: boolean): void {
  const state = getVideo();
  const frames = (back ? -1 : 1) * (bySecond ? state.fps : 1);
  if (state.soundSel) tell(nudgeSound(state.soundSel, frames / state.fps));
  else if (state.selected) tell(nudgeClip(state.selected, frames));
  else if (state.tool === 'slip' && songOf(state.sounds)) tell(slipMusic(frames / state.fps));
  else toast('Select a clip first.');
}

/**
 * Delete: a focused gap closes; a layer or a sound clip goes; a clip goes (Magnetic off: leaves a gap; Shift: ripples).
 * @param gap the focused gap's element, if any
 * @param ripple true with Shift
 */
function deleteSelection(gap: HTMLElement | null, ripple: boolean): void {
  const state = getVideo();
  if (gap) tell(deleteGap(Number(gap.dataset.at)));
  else if (state.layerSel) removeVLayer(state.layerSel);
  else if (state.soundSel) tell(removeSound(state.soundSel));
  else if (state.selected && !refuseLocked(state.selected)) {
    if (ripple) tell(rippleDeleteClip(state.selected));
    else removeClip(state.selected);
  }
}

/**
 * The plain keys' actions (no Ctrl, ⌘ or Alt).
 * @param event the key press
 * @param keyed the selection
 * @param total the video's length
 * @returns each key's action
 */
function plainKeys(event: ReactKeyboardEvent, keyed: SelectedItem | null, total: number): Partial<Record<string, () => void>> {
  const state = getVideo();
  const gap = event.target instanceof Element ? event.target.closest<HTMLElement>('.tl-gap') : null;
  const remove = () => deleteSelection(gap, event.shiftKey);
  const step = event.shiftKey ? 1 : 1 / 30;
  return {
    ' ': () => setPlaying(!state.playing),
    s: splitAtPlayhead,
    // Shift + F (Q10): F alone (Caps Lock too) stays free.
    ...(event.shiftKey ? { F: freezeAtPlayhead } : {}),
    k: () => keyAtPlayhead(keyed, state.t, state.fps),
    q: () => tell(rippleTrimToPlayhead('start')),
    w: () => tell(rippleTrimToPlayhead('end')),
    Delete: remove,
    Backspace: remove,
    ArrowLeft: () => setPlayhead(state.t - step),
    ArrowRight: () => setPlayhead(state.t + step),
    Home: () => setPlayhead(0),
    End: () => setPlayhead(total),
    '+': () => setZoom(state.zoom * 1.25),
    '=': () => setZoom(state.zoom * 1.25),
    '-': () => setZoom(state.zoom / 1.25),
    ...Object.fromEntries(EDIT_TOOLS.map(([tool, , key]) => [key.toLowerCase(), () => setTool(tool)])),
  };
}

/**
 * The timeline's keyboard (with the timeline focused; the track headers' buttons and menus handle their own keys).
 * @param event the key press
 * @param keyed the selection
 * @param total the video's length
 */
export function onTimelineKey(event: ReactKeyboardEvent, keyed: SelectedItem | null, total: number): void {
  if (typingIn(event.target) || (event.target instanceof Element && event.target.closest('.tl-heads'))) return;
  if (altOnly(event) && (event.code === 'BracketLeft' || event.code === 'BracketRight')) {
    event.preventDefault();
    jumpToKey(keyed, event.code === 'BracketLeft');
    return;
  }
  if (altOnly(event) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    nudgeSelection(event.key === 'ArrowLeft', event.shiftKey);
    return;
  }
  const actions = plainKeys(event, keyed, total);
  const action = actions[event.key] ?? actions[event.key.toLowerCase()];
  if (action && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    action();
  }
}
