/*
 * The export's sound plan (P2.1; transitions 206): every sound the export mixes, with its timing, volume and ramps,
 * and how a clip's sound meets its transitions (shared with the preview's sound, so they blend alike).
 */
import type { Keyframe } from './keyframes';
import { clipLength, projectLength, type Project, type TimedClip } from './timeline';
import { soundRate } from './speed';
import { MAIN_VIDEO } from './tracks';
import type { Transition } from './transitions';

const endOf = (clip: TimedClip) => clip.start + clipLength(clip);

/** One sound the export mixes: a video clip's own sound or an audio clip. */
export interface SoundSource {
  /** The clip's id, or the audio clip's id ('music'). */
  ref: string;
  /** Timeline seconds. */
  start: number;
  end: number;
  /** Source seconds at `start`. */
  from: number;
  /** Source seconds per timeline second (207): a clip at 0.5–2× plays its part at its speed, same pitch; missing = 1. */
  rate?: number;
  volume: number;
  /** Volume keyframes (205), seconds from `start`: when present they set the volume instead of `volume`. */
  gain?: Keyframe[];
  /** Volume ramps at its ends, seconds. */
  fadeIn: number;
  fadeOut: number;
  /** Transitions (206): seconds it plays before `start` (half the transition leading into it) and after `end` (half
   * its own), and how its sound goes there: an equal-power cross-fade (`power`) or a dip through silence (`dip`). */
  lead?: number;
  trail?: number;
  edgeIn?: 'power' | 'dip';
  edgeOut?: 'power' | 'dip';
}

/** How a clip's sound meets its transitions (206): the `SoundSource` fields of `lead`, `trail` and their edges. */
export type SoundEdges = Pick<SoundSource, 'lead' | 'trail' | 'edgeIn' | 'edgeOut'>;

/**
 * A clip's sound edges from its transitions (206 AC-6): half the transition leading into it (`lead`) and half its own
 * (`trail`), each an equal-power cross-fade or, for a dip, a dip through silence. Shared by the export's sound plan and
 * the preview's sound, so they blend alike.
 * @param clip the clip
 * @param clips the project's clips
 * @returns its edges; empty without transitions
 */
export function soundEdges(clip: TimedClip, clips: readonly TimedClip[]): SoundEdges {
  const leading = clips.find((other) => other.track === clip.track && other.transition?.to === clip.id)?.transition;
  const own = clip.transition;
  const edge = (transition: Transition) => (transition.kind === 'dip' ? 'dip' : 'power');
  return {
    ...(leading ? { lead: leading.dur / 2, edgeIn: edge(leading) } : {}),
    ...(own ? { trail: own.dur / 2, edgeOut: edge(own) } : {}),
  };
}

/**
 * A clip's own volume: a saved clip's `volume`, 0 for a clip without one.
 * @param clip the clip
 * @returns 0–1
 */
const volumeOf = (clip: TimedClip): number => ('volume' in clip && typeof clip.volume === 'number' ? clip.volume : 0);

/**
 * A video clip's own sound, with short ramps at its cuts (or its transitions' edges), at its speed (207).
 * @param clip the video clip
 * @param clips the project's clips
 * @returns the sound, or null when it is silent (no volume, or `soundMuted`)
 */
function clipSound(clip: TimedClip, clips: readonly TimedClip[]): SoundSource | null {
  const volume = volumeOf(clip);
  // Volume keyframes (205) replace the stored volume: the clip sounds if any of them is above 0.
  const gain = clip.keys?.volume?.length ? clip.keys.volume : undefined;
  if (gain ? !gain.some((key) => key.v > 0) : volume <= 0) return null;
  // Reversed, ramped, frozen or outside 0.5–2× (207 AC-6): silent.
  const rate = soundRate(clip);
  if (rate === null) return null;
  // A transition at a cut (206) replaces the 0.03 s ramp there: the sound plays into the handle with its edge.
  const edges = soundEdges(clip, clips);
  return {
    ref: clip.id,
    start: clip.start,
    end: endOf(clip),
    from: clip.in,
    ...(rate === 1 ? {} : { rate }),
    volume,
    ...(gain ? { gain } : {}),
    fadeIn: edges.lead ? 0 : 0.03,
    fadeOut: edges.trail ? 0 : 0.03,
    ...edges,
  };
}

/**
 * The video clips' own sounds on one track (`clipSound`): a silent one is left out.
 * @param project the project
 * @param track the track's id
 * @returns the sounds, in the track's order
 */
function clipSounds(project: Project, track: string): SoundSource[] {
  const sounds: SoundSource[] = [];
  for (const clip of project.clips) {
    if (clip.track !== track || clip.kind !== 'video') continue;
    const sound = clipSound(clip, project.clips);
    if (sound) sounds.push(sound);
  }
  return sounds;
}

/**
 * The sounds the export mixes: each video clip's own sound on the main track (hiding the track keeps it: hiding is
 * about pictures) with short ramps at the cuts, then each video clip's on the overlay tracks that aren't muted (hidden
 * ones too, 203 Q7), bottom track first, then the audio clips of tracks that aren't muted; a `toEnd` clip plays to the
 * end of the video and fades out over min(1.5 s, a third of the video), as 2.x's music did. The main track's entries
 * come first in their own order, so a project without overlay clips mixes exactly 202's sources (203 AC-10).
 * @param project the project
 * @returns the sounds, in mixing order
 */
export function audioPlan(project: Project): SoundSource[] {
  const total = projectLength(project);
  const sounds = clipSounds(project, MAIN_VIDEO);
  for (const track of project.tracks)
    if (track.kind === 'overlay' && !track.muted) sounds.push(...clipSounds(project, track.id));
  const muted = new Set(
    project.tracks.filter((track) => track.kind === 'audio' && track.muted).map((track) => track.id),
  );
  for (const audio of project.audio) {
    if (muted.has(audio.track) || audio.volume <= 0) continue;
    const end = audio.toEnd ? total : audio.start + Math.max(0, audio.srcDur - audio.in);
    sounds.push({
      ref: audio.id,
      start: audio.start,
      end,
      from: Math.max(0, audio.in),
      volume: audio.volume,
      fadeIn: 0,
      fadeOut: Math.min(1.5, total / 3),
    });
  }
  return sounds;
}
