// The video stage's clip sound (204 §4, D1): audio-only <audio> elements on the clip's file, for every clip sounding
// under the playhead (the main track's and each unmuted overlay track's, 203 §7), the next ones within 2 s and the
// clips of muted overlay tracks on screen, released after, so elements don't grow with the clip count and the pool
// alone decodes pictures. Kept within a frame of the picture by nudging playbackRate (AC-8, Q5). The music keeps its
// own element in VideoStage.
import { lanePlan } from '../../engine/decodePool';
import { edgeGain, volumeAt, type ClipKeyProp, type Keyframes } from '../../engine/keyframes';
import { frameStack } from '../../engine/stack';
import { soundEdges, type SoundEdges } from '../../engine/soundPlan';
import { type Project, type TimedClip } from '../../engine/timeline';

/** A clip sounding at the playhead: seconds into it, and its transition edges (206) when one plays. */
export interface SoundingClip<C> {
  clip: C;
  local: number;
  edges?: SoundEdges;
}

/** Whose sound plays at a time, what to load next and what to keep loaded but silent. */
export interface SoundPlan<C> {
  current: SoundingClip<C>[];
  next: C[];
  held: C[];
}

/**
 * Whose sound plays at playhead `t`: every video clip under it, bottom track first: the main track's and each overlay
 * track's that isn't muted (a photo has none); the video clips starting within `ahead` seconds on those tracks, to load
 * and pre-seek; and the video clips under it on muted overlay tracks, kept loaded and silent so an Unmute plays at
 * once. Hide is about pictures: a hidden track still plays its clips' sound (201 D2, 203 Q7), so the clips are found
 * as if every track were shown. "Under the playhead" is frameStack's (its EDGE_EPS edges), so the sound starts on the
 * frame the picture does. Every clip in `current` and `held` is under the playhead at once (on screen or on a hidden
 * track), so together they stay within `mostVideosAt`, the videos-at-once limit (203 AC-9).
 * @param project the clips and tracks
 * @param time the playhead
 * @param ahead how far ahead to look for clips to load, seconds
 * @returns the plan
 */
export function soundPlan<C extends TimedClip>(project: Project<C>, time: number, ahead = 2): SoundPlan<C> {
  const shown = { ...project, tracks: project.tracks.map((track) => (track.hidden ? { ...track, hidden: false } : track)) };
  const muted = new Set(project.tracks.filter((track) => track.kind === 'overlay' && track.muted).map((track) => track.id));
  const current: SoundingClip<C>[] = [];
  const held: C[] = [];
  for (const stackItem of frameStack(shown, time)) {
    if (stackItem.clip.kind !== 'video') continue;
    if (muted.has(stackItem.track)) held.push(stackItem.clip);
    // During a transition (206) the clip plays into its handles with the transition's edges, as the export mixes it.
    else if (stackItem.mix) current.push({ clip: stackItem.clip, local: stackItem.local, edges: soundEdges(stackItem.clip, project.clips) });
    else current.push({ clip: stackItem.clip, local: stackItem.local });
  }
  const loaded = new Set([...current.map((sounding) => sounding.clip.id), ...held.map((clip) => clip.id)]);
  const sounding = { ...shown, tracks: shown.tracks.filter((track) => !muted.has(track.id)) };
  return { current, next: lanePlan(sounding, time, ahead).next.filter((clip) => !loaded.has(clip.id)), held };
}

/** Over this drift (seconds) the element seeks instead of catching up. */
export const SEEK_DRIFT = 0.25;
/** The most playbackRate moves away from 1 to catch up (±3 %). */
export const MAX_NUDGE = 0.03;
/** A nudge stops once the drift is within this (seconds). */
export const SETTLED = 0.01;

/**
 * How to correct a playing element whose sound is `drift` seconds ahead (positive) or behind (negative) the picture,
 * given its playbackRate now: seek over SEEK_DRIFT; over one frame (or still nudging and over SETTLED) a rate up to
 * ±MAX_NUDGE toward catching up (twice the gap per second); otherwise 1.
 * @param drift the sound's lead over the picture, seconds
 * @param fps the project's frame rate
 * @param rate the element's playbackRate now
 * @returns a seek, or the rate to play at
 */
export function soundFix(drift: number, fps: number, rate: number): { seek: true } | { seek: false; rate: number } {
  const size = Math.abs(drift);
  if (size > SEEK_DRIFT) return { seek: true };
  // In steps of 0.5 %, so the element's rate is written only when the step changes, not on every tick.
  if (size > 1 / fps || (rate !== 1 && size > SETTLED)) return { seek: false, rate: Math.round((1 - Math.sign(drift) * Math.min(MAX_NUDGE, size * 2)) * 200) / 200 };
  return { seek: false, rate: 1 };
}

/** What the sound player needs of a clip. */
export interface SoundClip {
  id: string;
  /** The clip's file. */
  url: string;
  in: number;
  out: number;
  volume: number;
  /** Keyframes (205): volume keys set the element's volume at each tick. */
  keys?: Keyframes<ClipKeyProp>;
}

/**
 * Lets an element go: paused, with no source left to buffer.
 * @param element the element
 */
function release(element: HTMLAudioElement): void {
  element.pause();
  element.removeAttribute('src');
  element.load();
}

/**
 * Stops an element where it is, at normal speed.
 * @param element the element
 */
function halt(element: HTMLAudioElement): void {
  if (!element.paused) element.pause();
  if (element.playbackRate !== 1) element.playbackRate = 1;
}

/** The clip sound of one stage: one element per current clip, the next ones' (pre-seeked to their `in`) and the held. */
export class PreviewSound {
  private readonly elements = new Map<string, HTMLAudioElement>();
  /** Elements whose sound is coming out (after 'playing'): only those are drift-corrected. */
  private readonly started = new WeakSet<HTMLAudioElement>();

  /** Registers the stage's sound, so self-tests can reach it. */
  constructor() {
    liveSounds.add(this);
  }

  /**
   * How many elements are open (bounded: the clips under the playhead and the next ones).
   * @returns the count
   */
  get size(): number {
    return this.elements.size;
  }

  /**
   * The element playing a clip's sound now, if any (self-tests capture it: AC-8).
   * @param id the clip
   * @returns its element, or undefined
   */
  element(id: string): HTMLAudioElement | undefined {
    return this.elements.get(id);
  }

  /**
   * One tick (a soundPlan): `current` are the clips whose sound plays at the playhead (each with its local time),
   * `next` the clips to start within 2 s (pre-seeked to their `in`), `held` the silent clips on screen (kept loaded);
   * every other element is released. Playing, each current element plays (seeked first if it was paused elsewhere)
   * and is kept in step on its own; paused, each waits at its clip's time.
   * @param plan the clips sounding, coming and held
   * @param isPlaying whether the video plays
   * @param fps the project's frame rate
   */
  update({ current, next, held }: SoundPlan<SoundClip>, isPlaying: boolean, fps: number): void {
    const playing = new Set(current.map((sounding) => sounding.clip.id));
    const keep = new Set([...playing, ...next.map((clip) => clip.id), ...held.map((clip) => clip.id)]);
    for (const [id, element] of this.elements)
      if (!keep.has(id)) {
        release(element);
        this.elements.delete(id);
      }
    for (const clip of next) {
      if (playing.has(clip.id)) continue;
      const element = this.elementFor(clip);
      halt(element);
      if (Math.abs(element.currentTime - clip.in) > SETTLED) element.currentTime = clip.in;
    }
    for (const clip of held)
      if (!playing.has(clip.id)) {
        // A muted track's clip: loaded and silent (muted, not only paused), so an Unmute plays at once.
        const element = this.elementFor(clip);
        halt(element);
        element.muted = true;
      }
    for (const sounding of current) this.follow(sounding, isPlaying, fps);
  }

  /** Releases every element and unregisters the sound. */
  dispose(): void {
    liveSounds.delete(this);
    for (const element of this.elements.values()) release(element);
    this.elements.clear();
  }

  /**
   * A clip's element (made on first use, at the clip's `in`), at a volume.
   * @param clip the clip
   * @param volume 0–1 (muted at 0)
   * @returns the element
   */
  private elementFor(clip: SoundClip, volume = clip.volume): HTMLAudioElement {
    let element = this.elements.get(clip.id);
    if (!element) {
      const made = document.createElement('audio');
      made.preload = 'auto';
      made.dataset.clip = clip.id;
      made.src = clip.url;
      made.currentTime = clip.in;
      made.addEventListener('playing', () => this.started.add(made));
      made.addEventListener('pause', () => this.started.delete(made));
      made.addEventListener('waiting', () => this.started.delete(made));
      this.elements.set(clip.id, made);
      element = made;
    }
    element.volume = Math.max(0, Math.min(1, volume));
    element.muted = volume <= 0;
    return element;
  }

  /**
   * One current clip's element at `local` seconds into the clip: playing and kept in step, or waiting there. During a
   * transition (`edges`, 206) it plays into its handles, before its start and past its end, at the edges' gain.
   * @param sounding the clip, its local time and its edges
   * @param isPlaying whether the video plays
   * @param fps the project's frame rate
   */
  private follow({ clip, local, edges = {} }: SoundingClip<SoundClip>, isPlaying: boolean, fps: number): void {
    // Volume keyframes and transition edges are followed on every tick (within a frame of the picture, 205 AC-10).
    const length = clip.out - clip.in;
    const element = this.elementFor(clip, volumeAt(clip, local) * edgeGain({ start: 0, end: length, ...edges }, local));
    const wanted = clip.in + local;
    if (local < -(edges.lead ?? 0) || wanted < 0 || wanted >= clip.out + (edges.trail ?? 0) - 1e-3) {
      halt(element);
      return;
    }
    if (!isPlaying) {
      halt(element);
      if (Math.abs(element.currentTime - wanted) > SETTLED) element.currentTime = wanted;
      return;
    }
    if (element.paused) {
      // A pre-seeked element starts at once on the cut's tick (a frame late at most); a seek would delay it.
      if (Math.abs(element.currentTime - wanted) > 1 / fps) element.currentTime = wanted;
      element.playbackRate = 1;
      void element.play().catch(() => undefined);
      return;
    }
    if (!this.started.has(element)) return;
    const fix = soundFix(element.currentTime - wanted, fps, element.playbackRate);
    if (fix.seek) {
      element.currentTime = wanted;
      element.playbackRate = 1;
    } else if (fix.rate !== element.playbackRate) element.playbackRate = fix.rate;
  }
}

/**
 * A stage's clip sound player.
 * @returns a new player (registered in liveSounds until disposed)
 */
export function previewSound(): PreviewSound {
  return new PreviewSound();
}

/** The stage sounds alive now (the editor's), so self-tests can reach a clip's <audio> element. */
export const liveSounds = new Set<PreviewSound>();
