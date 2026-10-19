import type { Layer } from './layers';
import { soundLength } from './soundClips';
import { clipLength, type AudioClip, type TimedClip } from './timeline';

/*
 * Snapping on the timeline (202): the times a dragged clip, layer or edge snaps to, and the nearest one to a time.
 * Free of DOM and React; the timeline converts its 8 px tolerance to seconds at its zoom.
 */

const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/** The clip, layer or sound clip (208) being dragged, whose own edges aren't snap targets. */
export interface SnapSkip {
  clip?: string;
  layer?: string;
  sound?: string;
}

/**
 * The times a drag snaps to: 0, the end, the playhead, every clip's edges (so a gap's too), every layer's showing
 * edges (an untimed layer shows from 0 to the end) and every sound clip's edges (208), without the edges of the item
 * being dragged.
 * @param clips the picture clips
 * @param layers the layers
 * @param playhead the playhead, seconds
 * @param total the video's length, seconds
 * @param skip the clip, layer or sound clip being dragged
 * @param audio the sound clips
 * @returns the times, seconds
 */
export function snapTargets(
  clips: TimedClip[],
  layers: Layer[],
  playhead: number,
  total: number,
  skip: SnapSkip = {},
  audio: readonly AudioClip[] = [],
): number[] {
  const targets = [0, total, playhead];
  for (const clip of clips) if (clip.id !== skip.clip) targets.push(clip.start, endOf(clip));
  for (const layer of layers)
    if (layer.id !== skip.layer) targets.push(layer.start ?? 0, Math.min(layer.end ?? total, total));
  for (const sound of audio) if (sound.id !== skip.sound) targets.push(sound.start, sound.start + soundLength(sound, total, audio));
  return targets;
}

/**
 * The nearest target to a time.
 * @param time seconds
 * @param targets the times to snap to
 * @param tolerance how near a target must be, seconds (the timeline uses 8 px at its zoom)
 * @returns the nearest target within `tolerance`, else `time` itself
 */
export function snapTime(time: number, targets: readonly number[], tolerance: number): number {
  let best = time;
  let distance = tolerance;
  for (const target of targets)
    if (Math.abs(target - time) < distance) {
      distance = Math.abs(target - time);
      best = target;
    }
  return best;
}
