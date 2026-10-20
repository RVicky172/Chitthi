// The video stage's sound (204 §4, D1; 208 §6): audio-only <audio> elements on the clip's file, for every clip sounding
// under the playhead (the main track's and each unmuted overlay track's, 203 §7) and every sound clip on the audio
// tracks heard (208: unmuted, and only the soloed ones while any is, Q2), the next ones within 2 s and the clips of
// muted overlay tracks on screen, released after, so elements don't grow with the clip count and the pool alone
// decodes pictures. Kept within a frame of the picture by nudging playbackRate (AC-8, Q5). With Web Audio (208 D3)
// every element plays through its own gain node, set each tick to the export's gain chain, into one master gain (the
// loudness gain), then the output limiter (limiter.worklet.ts, as the export's), so sound goes past 100 % and follows
// ducking and loudness as the export does.
import { lanePlan } from '../../engine/lanePlan';
import { edgeGain, volumeAt, type ClipKeyProp, type Keyframes } from '../../engine/keyframes';
import { playLength, soundRate, sourceAt, type SpeedFields } from '../../engine/speed';
import { frameStack } from '../../engine/stack';
import { soundLength } from '../../engine/soundClips';
import { soundEdges, type SoundEdges } from '../../engine/soundPlan';
import { projectLength, type AudioClip, type Project, type TimedClip } from '../../engine/timeline';
import { logError } from '../../lib/errors';

/** A clip sounding at the playhead: seconds into it, and its transition edges (206) when one plays. */
export interface SoundingClip<C> {
  clip: C;
  local: number;
  edges?: SoundEdges;
  /** Source seconds per timeline second (207): the clip's speed, 0.5–2×; missing = 1. */
  rate?: number;
}

/** A sound clip heard at the playhead (208): seconds into it, and how long it is heard (cut at the video's end). */
export interface SoundingSound<A> {
  clip: A;
  local: number;
  length: number;
}

/** Whose sound plays at a time, what to load next and what to keep loaded but silent. */
export interface SoundPlan<C, A = never> {
  current: SoundingClip<C>[];
  next: C[];
  held: C[];
  /** The sound clips heard (208), and those starting within 2 s. */
  sounds?: SoundingSound<A>[];
  nextSounds?: A[];
}

/**
 * The sound clips heard at a time (208): on audio tracks that aren't muted, only the soloed ones while any is (Q2, the
 * preview's only), within their length (cut at the video's end, Q6); and those starting within `ahead` seconds.
 * @param project the tracks and sound clips
 * @param time the playhead
 * @param ahead how far ahead to look, seconds
 * @returns the sound clips heard and coming
 */
function soundsAt<A extends AudioClip>(project: Project & { audio: readonly A[] }, time: number, ahead: number): Required<Pick<SoundPlan<never, A>, 'sounds' | 'nextSounds'>> {
  const total = projectLength(project);
  const open = project.tracks.filter((track) => track.kind === 'audio' && !track.muted);
  const soloed = open.filter((track) => track.solo);
  const heard = new Set((soloed.length > 0 ? soloed : open).map((track) => track.id));
  const sounds: SoundingSound<A>[] = [];
  const nextSounds: A[] = [];
  for (const clip of project.audio) {
    if (!heard.has(clip.track)) continue;
    // Not heard past the video's end (Q6).
    const length = Math.min(soundLength(clip, total, project.audio), total - clip.start);
    const local = time - clip.start;
    if (local >= 0 && local < length) sounds.push({ clip, local, length });
    else if (local < 0 && -local <= ahead && clip.start < total) nextSounds.push(clip);
  }
  return { sounds, nextSounds };
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
export function soundPlan<C extends TimedClip, A extends AudioClip = AudioClip>(
  project: Project<C> & { audio: readonly A[] },
  time: number,
  ahead = 2,
): Required<SoundPlan<C, A>> {
  const shown = { ...project, tracks: project.tracks.map((track) => (track.hidden ? { ...track, hidden: false } : track)) };
  const muted = new Set(project.tracks.filter((track) => track.kind === 'overlay' && track.muted).map((track) => track.id));
  const current: SoundingClip<C>[] = [];
  const held: C[] = [];
  for (const stackItem of frameStack(shown, time)) {
    // A silent clip (207: reversed, ramped, frozen or outside 0.5–2×) needs no element at all.
    const rate = stackItem.clip.kind === 'video' ? soundRate(stackItem.clip) : null;
    if (rate === null) continue;
    const at = { clip: stackItem.clip, local: stackItem.local, ...(rate === 1 ? {} : { rate }) };
    if (muted.has(stackItem.track)) held.push(stackItem.clip);
    // During a transition (206) the clip plays into its handles with the transition's edges, as the export mixes it.
    else if (stackItem.mix) current.push({ ...at, edges: soundEdges(stackItem.clip, project.clips) });
    else current.push(at);
  }
  const loaded = new Set([...current.map((sounding) => sounding.clip.id), ...held.map((clip) => clip.id)]);
  const sounding = { ...shown, tracks: shown.tracks.filter((track) => !muted.has(track.id)) };
  const next = lanePlan(sounding, time, ahead).next.filter((clip) => !loaded.has(clip.id) && soundRate(clip) !== null);
  return { current, next, held, ...soundsAt(project, time, ahead) };
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
export interface SoundClip extends SpeedFields {
  id: string;
  /** The clip's file. */
  url: string;
  in: number;
  out: number;
  volume: number;
  /** Keyframes (205): volume keys set the element's volume at each tick. */
  keys?: Keyframes<ClipKeyProp>;
}

/** What the sound player needs of a sound clip (208): its file, its in point and its volume. */
export interface SoundFile {
  id: string;
  url: string;
  in: number;
  volume: number;
}

/** The gains of a tick (208): the export's chain for each sound at the playhead, and the loudness gain. */
export interface PreviewMix {
  /** The playhead, timeline seconds. */
  time: number;
  /** The loudness gain, linear. */
  master: number;
  /** The limiter acts (Loudness on); missing = off, the sound passes through as the export's does with Loudness Off. */
  limit?: boolean;
  /** A sound's gain from the chain at the playhead (by its clip's id), or null when the plan has none. */
  gainOf: (ref: string) => number | null;
}

/** A voice take being recorded (209 §7): the track it goes onto, and whether the preview's mix is heard. */
export interface Recording {
  track: string;
  hear: boolean;
}

/**
 * The project as the preview plays it while a voice is recorded (209 AC-5): the track being recorded onto is silent.
 * @param project the project
 * @param recording the take being recorded, or null
 * @returns the project (the same one when not recording)
 */
export function withoutRecorded<P extends Pick<Project, 'tracks'>>(project: P, recording: Recording | null): P {
  if (!recording) return project;
  return { ...project, tracks: project.tracks.map((track) => (track.id === recording.track ? { ...track, muted: true } : track)) };
}

/**
 * The tick's gains while a voice is recorded (209 AC-5, Q3): silent, so the speakers aren't recorded into the take,
 * unless Hear the video (headphones) is on. Each sound's gain goes to 0 as well, for a preview without Web Audio.
 * @param mix the tick's gains
 * @param recording the take being recorded, or null
 * @returns the gains (the same ones when heard)
 */
export const recordingMix = (mix: PreviewMix, recording: Recording | null): PreviewMix =>
  recording && !recording.hear ? { ...mix, master: 0, gainOf: () => 0 } : mix;

/** The live graph: its context, the master gain every element plays into, and the limiter after it once loaded. */
interface Graph {
  context: AudioContext;
  master: GainNode;
  limiter?: AudioWorkletNode | DynamicsCompressorNode;
}

/** The preview's limiter: loading, the worklet (as the export's), the browser's compressor in its place, or none. */
export type LimiterKind = 'loading' | 'worklet' | 'compressor' | 'none';

/**
 * The limiter worklet's URL, from its own module (loaded with the stage's first sound).
 * @returns the URL
 */
const workletUrl = (): Promise<string> => import('./limiterWorkletUrl').then((module) => module.limiterUrl);

/**
 * The browser's AudioContext, made on first use.
 * @returns it, or null where there is no Web Audio
 */
const browserContext = (): AudioContext | null => (typeof AudioContext === 'undefined' ? null : new AudioContext());

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
  /** Each element's gain node, with the graph (208 D3). */
  private readonly gains = new Map<HTMLAudioElement, GainNode>();
  /** The last value scheduled on each gain, so an unchanged gain isn't scheduled again. */
  private readonly scheduled = new WeakMap<AudioParam, number>();
  /** The graph: undefined until first needed, null without Web Audio (then elements' volume, capped at 100 %). */
  private graph: Graph | null | undefined;
  /** Which limiter the graph has (the Audio panel notes the compressor standing in). */
  limiter: LimiterKind = 'none';
  /** Whether the limiter acts now (Loudness on). */
  private limiting = false;

  /**
   * Registers the stage's sound, so self-tests can reach it.
   * @param makeContext makes the AudioContext (tests pass a stand-in; null: no Web Audio)
   * @param loadWorklet gives the limiter worklet's URL (tests pass their own)
   */
  constructor(
    private readonly makeContext: () => AudioContext | null = browserContext,
    private readonly loadWorklet: () => Promise<string> = workletUrl,
  ) {
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
   * @param mix the tick's gains: the export's chain and the loudness gain (208); without, each clip's own volume
   */
  update(plan: SoundPlan<SoundClip, SoundFile>, isPlaying: boolean, fps: number, mix?: PreviewMix): void {
    const { current, next, held, sounds = [], nextSounds = [] } = plan;
    const playing = new Set([...current.map((sounding) => sounding.clip.id), ...sounds.map((sounding) => sounding.clip.id)]);
    const keep = new Set([...playing, ...next.map((clip) => clip.id), ...held.map((clip) => clip.id), ...nextSounds.map((clip) => clip.id)]);
    for (const [id, element] of this.elements)
      if (!keep.has(id)) {
        release(element);
        this.elements.delete(id);
      }
    for (const clip of [...next, ...nextSounds]) {
      if (playing.has(clip.id)) continue;
      const element = this.elementFor(clip, clip.volume, fps);
      halt(element);
      if (Math.abs(element.currentTime - clip.in) > SETTLED) element.currentTime = clip.in;
    }
    for (const clip of held)
      if (!playing.has(clip.id)) {
        // A muted track's clip: loaded and silent (muted, not only paused), so an Unmute plays at once.
        const element = this.elementFor(clip, clip.volume, fps);
        halt(element);
        element.muted = true;
      }
    for (const sounding of current) this.follow(sounding, isPlaying, fps, mix);
    for (const sounding of sounds) this.followSound(sounding, isPlaying, fps, mix);
    this.mixOut(fps, mix);
  }

  /**
   * The mix's way out: the master gain at the loudness gain, the limiter on with Loudness.
   * @param fps the project's frame rate
   * @param mix the tick's gains
   */
  private mixOut(fps: number, mix?: PreviewMix): void {
    const graph = this.liveGraph();
    if (!graph) return;
    if (mix) this.schedule(graph, graph.master.gain, mix.master, fps);
    this.setLimiting(graph, mix?.limit === true);
  }

  /**
   * Loads the limiter after the master gain: the worklet, or, when it can't load, the browser's compressor set as a
   * hard limiter in its place (said in `limiter`).
   * @param graph the graph
   */
  private async attachLimiter(graph: Graph): Promise<void> {
    this.limiter = 'loading';
    try {
      await graph.context.audioWorklet.addModule(await this.loadWorklet());
      graph.limiter = new AudioWorkletNode(graph.context, 'chitthi-limiter', { outputChannelCount: [2] });
      this.limiter = 'worklet';
    } catch (error) {
      logError('handled', error);
      const compressor = graph.context.createDynamicsCompressor();
      compressor.threshold.value = -1;
      compressor.knee.value = 0;
      compressor.ratio.value = 20;
      compressor.attack.value = 0.001;
      compressor.release.value = 0.1;
      graph.limiter = compressor;
      this.limiter = 'compressor';
    }
    graph.limiter.connect(graph.context.destination);
    this.route(graph);
  }

  /**
   * Turns the limiter on or off with Loudness (the export limits only with a target).
   * @param graph the graph
   * @param on limit
   */
  private setLimiting(graph: Graph, on: boolean): void {
    if (on === this.limiting) return;
    this.limiting = on;
    this.route(graph);
  }

  /**
   * Connects the master gain to the speakers: through the worklet (told whether to limit), or the compressor only
   * while limiting.
   * @param graph the graph
   */
  private route(graph: Graph): void {
    const { limiter, master, context } = graph;
    if (!limiter) return;
    master.disconnect();
    if ('port' in limiter) {
      limiter.port.postMessage({ limit: this.limiting });
      master.connect(limiter);
    } else master.connect(this.limiting ? limiter : context.destination);
  }

  /**
   * Resumes the graph (call on Play: browsers start an AudioContext only after a user gesture).
   * @returns when it runs
   */
  async resume(): Promise<void> {
    await this.liveGraph()?.context.resume();
  }

  /** Releases every element and unregisters the sound. */
  dispose(): void {
    liveSounds.delete(this);
    for (const element of this.elements.values()) release(element);
    this.elements.clear();
  }

  /**
   * The graph, made the first time it is needed: the master gain to the speakers.
   * @returns it, or null without Web Audio
   */
  private liveGraph(): Graph | null {
    if (this.graph !== undefined) return this.graph;
    const context = this.makeContext();
    if (!context) {
      this.graph = null;
      return null;
    }
    const master = context.createGain();
    master.connect(context.destination);
    this.graph = { context, master };
    // Until the limiter has loaded the master plays straight to the speakers.
    void this.attachLimiter(this.graph);
    return this.graph;
  }

  /**
   * Moves a gain to a value over at most a frame (no step is heard), unless it is there already.
   * @param graph the graph
   * @param param the gain
   * @param value the new gain
   * @param fps the project's frame rate
   */
  private schedule(graph: Graph, param: AudioParam, value: number, fps: number): void {
    if (this.scheduled.get(param) === value) return;
    this.scheduled.set(param, value);
    const now = graph.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + 1 / fps);
  }

  /**
   * A clip's element (made on first use, at the clip's `in`), at a gain: through its gain node with the graph, else
   * as the element's volume (0–1, muted at 0).
   * @param clip the clip or sound clip
   * @param volume the gain
   * @param fps the project's frame rate
   * @returns the element
   */
  private elementFor(clip: Pick<SoundFile, 'id' | 'url' | 'in'>, volume: number, fps: number): HTMLAudioElement {
    let element = this.elements.get(clip.id);
    if (!element) {
      const made = document.createElement('audio');
      made.preload = 'auto';
      made.dataset.clip = clip.id;
      made.src = clip.url;
      made.currentTime = clip.in;
      // A clip at a speed keeps its pitch (207 AC-6, D5: the browser's own stretching).
      made.preservesPitch = true;
      made.addEventListener('playing', () => this.started.add(made));
      made.addEventListener('pause', () => this.started.delete(made));
      made.addEventListener('waiting', () => this.started.delete(made));
      this.elements.set(clip.id, made);
      const graph = this.liveGraph();
      if (graph) {
        const gain = graph.context.createGain();
        graph.context.createMediaElementSource(made).connect(gain);
        gain.connect(graph.master);
        this.gains.set(made, gain);
      }
      element = made;
    }
    const gain = this.gains.get(element);
    const graph = this.liveGraph();
    if (gain && graph) {
      element.volume = 1;
      element.muted = false;
      this.schedule(graph, gain.gain, Math.max(0, volume), fps);
    } else {
      element.volume = Math.max(0, Math.min(1, volume));
      element.muted = volume <= 0;
    }
    return element;
  }

  /**
   * One current clip's element at `local` seconds into the clip: playing and kept in step, or waiting there. During a
   * transition (`edges`, 206) it plays into its handles, before its start and past its end, at the edges' gain.
   * @param sounding the clip, its local time and its edges
   * @param isPlaying whether the video plays
   * @param fps the project's frame rate
   * @param mix the tick's gains (the export's chain), when there are
   */
  private follow({ clip, local, edges = {}, rate = 1 }: SoundingClip<SoundClip>, isPlaying: boolean, fps: number, mix?: PreviewMix): void {
    // Volume keyframes and transition edges are followed on every tick (within a frame of the picture, 205 AC-10).
    const timing = { ...clip, kind: 'video' as const, dur: 0 };
    const length = playLength(timing);
    const gain = mix?.gainOf(clip.id) ?? volumeAt(clip, local) * edgeGain({ start: 0, end: length, ...edges }, local);
    const element = this.elementFor(clip, gain, fps);
    const wanted = sourceAt(timing, local);
    if (local < -(edges.lead ?? 0) || wanted < 0 || local >= length + (edges.trail ?? 0) - 1e-3) {
      halt(element);
      return;
    }
    this.keepInStep(element, wanted, isPlaying, fps, rate);
  }

  /**
   * A sound clip's element at `local` seconds into it (208): its file from its in point, at the chain's gain; stopped
   * past its length.
   * @param sounding the sound clip, its local time and its length heard
   * @param isPlaying whether the video plays
   * @param fps the project's frame rate
   * @param mix the tick's gains
   */
  private followSound({ clip, local, length }: SoundingSound<SoundFile>, isPlaying: boolean, fps: number, mix?: PreviewMix): void {
    const element = this.elementFor(clip, mix?.gainOf(clip.id) ?? clip.volume, fps);
    if (local < 0 || local >= length - 1e-3) {
      halt(element);
      return;
    }
    this.keepInStep(element, clip.in + local, isPlaying, fps, 1);
  }

  /**
   * Keeps an element on its source time: playing and drift-corrected, or waiting there.
   * @param element the element
   * @param wanted the source time now, seconds
   * @param isPlaying whether the video plays
   * @param fps the project's frame rate
   * @param rate the clip's speed (207), 1 for sound clips
   */
  private keepInStep(element: HTMLAudioElement, wanted: number, isPlaying: boolean, fps: number, rate: number): void {
    if (!isPlaying) {
      halt(element);
      if (Math.abs(element.currentTime - wanted) > SETTLED) element.currentTime = wanted;
      return;
    }
    if (element.paused) {
      // A pre-seeked element starts at once on the cut's tick (a frame late at most); a seek would delay it.
      if (Math.abs(element.currentTime - wanted) > (1 / fps) * rate) element.currentTime = wanted;
      element.playbackRate = rate;
      void element.play().catch(() => undefined);
      return;
    }
    if (!this.started.has(element)) return;
    // The drift in timeline seconds, and the nudge on top of the clip's speed (207: playbackRate = speed × nudge).
    const fix = soundFix((element.currentTime - wanted) / rate, fps, element.playbackRate / rate);
    if (fix.seek) {
      element.currentTime = wanted;
      element.playbackRate = rate;
    } else if (fix.rate * rate !== element.playbackRate) element.playbackRate = fix.rate * rate;
  }
}

/**
 * A stage's sound player.
 * @param makeContext makes its AudioContext (tests pass a stand-in; null: no Web Audio)
 * @param loadWorklet gives the limiter worklet's URL (tests pass their own)
 * @returns a new player (registered in liveSounds until disposed)
 */
export function previewSound(makeContext?: () => AudioContext | null, loadWorklet?: () => Promise<string>): PreviewSound {
  return new PreviewSound(makeContext, loadWorklet);
}

/** The stage sounds alive now (the editor's), so self-tests can reach a clip's <audio> element. */
export const liveSounds = new Set<PreviewSound>();
