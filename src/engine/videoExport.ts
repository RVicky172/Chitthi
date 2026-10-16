import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  canEncodeAudio,
  canEncodeVideo,
  type StreamTargetChunk,
} from 'mediabunny';
import { isDesktop } from '../platform/desktop';
import { DecodePool, lanePlan, poolLimits, type PoolClip } from './decodePool';
import { mediabunnySource } from './frameSource';
import { gainCurve } from './keyframes';
import { loadImage } from './photo';
import { frameStack, type StackItem } from './stack';
import { halves } from './transitions';
import { MAIN_VIDEO } from './tracks';
import { audioPlan, type SoundSource } from './soundPlan';
import { projectLength, type AudioClip, type Project, type TimedClip } from './timeline';
import { limitsFor } from './videoFormats';
import { renderStack, type FrameClip } from './video';

/*
 * Encodes the video editor's project (tracks, engine/timeline.ts) into an MP4: H.264 video and AAC sound at 48 kHz, with the index (`moov`) at the
 * front of the file ("fast start"), which Instagram requires and YouTube processes fastest. Encoding uses the
 * browser's WebCodecs through Mediabunny (MPL-2.0, THIRD_PARTY_NOTICES.md); this module loads only on export.
 *
 * Memory stays flat however long the video is:
 *   - frames are drawn one at a time, each the stack of clips showing then (`frameStack`, as the preview: the main
 *     track, then each visible overlay track) and handed to the encoder; video clips are decoded frame by frame at
 *     exactly the times needed, through the decoder pool (decodePool.ts, as the preview), one lane per video on
 *     screen, which opens the next clips while the current ones encode and releases every frame once replaced; photos
 *     are decoded once per clip and released once it has passed; no clip at a time gives black with the layers on top;
 *   - sound (`audioPlan`: clips' own sound plus music, unless its track is muted) is decoded and mixed in 10-second
 *     windows, interleaved with the frames;
 *   - long videos stream to a file (desktop: through the main process; Chrome and Edge: the File System Access API),
 *     with space reserved at the front for the index; short ones are built in memory so they can be shared.
 */

/** A clip to export: what the drawing and the timeline need, its file and its sound's volume. */
export interface ExportClip extends FrameClip, TimedClip {
  file: Blob;
  /** Video: 0–1. */
  volume: number;
}

/** A sound clip (the music) with its file. */
export interface ExportAudio extends AudioClip {
  file: Blob;
}

/** Where the MP4 goes: built in memory (returned as a Blob), or streamed to a writable file. */
export type ExportSink = { kind: 'memory' } | { kind: 'stream'; writable: WritableStream<StreamTargetChunk> };

/** A clip as the self-tests' trace sees it: its id and the source time asked of a video (null: a photo). */
export interface TracedClip {
  id: string;
  at: number | null;
}

/** The project to encode: its tracks, clips (with their files), sound clips and layers, and the output settings. */
export interface ExportJob extends Project<ExportClip> {
  audio: ExportAudio[];
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  sink: ExportSink;
  onProgress?: (fraction: number, phase: string) => void;
  signal?: AbortSignal;
  /** Self-tests: each frame's clips as drawn, bottom first. */
  trace?: (frame: number, drawn: TracedClip[]) => void;
}

/** An export that can't be made, with a message for the user. */
export class ExportError extends Error {}

const SAMPLE_RATE = 48000;
/** Seconds of sound mixed at a time. */
const AUDIO_WINDOW = 10;
/** AAC frames carry 1024 samples. */
const AAC_FRAME = 1024;
/** The sound's bitrate, bits per second. */
const AUDIO_BITRATE = 128000;

/**
 * Stops the export when it was cancelled.
 * @param signal the job's abort signal
 * @throws {DOMException} an AbortError once the signal has fired
 */
const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
};

/** A file opened for decoding its sound. */
interface OpenSound {
  sink: AudioBufferSink;
  input: Input;
}

/** A sound the mix plays (timeline times, source time, volume and its ramps), opened for decoding. */
interface AudioSource extends SoundSource, OpenSound {}

/**
 * Opens a file's sound for decoding.
 * @param file the file
 * @returns its sound, or null when it has none the browser can decode
 */
async function openSound(file: Blob): Promise<OpenSound | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryAudioTrack().catch(() => null);
  if (!track || !(await track.canDecode())) {
    input.dispose();
    return null;
  }
  return { input, sink: new AudioBufferSink(track) };
}

/**
 * Opens the sounds of `audioPlan` for windowed decoding.
 * @param job the export
 * @returns the sources; clips without sound are left out
 * @throws {ExportError} when the music can't be read
 */
async function openAudio(job: ExportJob): Promise<AudioSource[]> {
  const sources: AudioSource[] = [];
  const clipFiles = new Map(job.clips.map((clip) => [clip.id, clip.file]));
  const musicFiles = new Map(job.audio.map((audioClip) => [audioClip.id, audioClip.file]));
  for (const planned of audioPlan(job)) {
    const music = musicFiles.get(planned.ref);
    const file = music ?? clipFiles.get(planned.ref);
    if (!file) continue;
    const sound = await openSound(file);
    if (!sound && music) throw new ExportError('The music file couldn’t be read. Try an MP3, M4A or WAV file.');
    if (sound) sources.push({ ...planned, ...sound });
  }
  return sources;
}

/**
 * A source's volume at a time, with its fade-in and fade-out ramps.
 * @param source the sound source
 * @param time timeline seconds
 * @returns the gain
 */
function rampedVolume(source: SoundSource, time: number): number {
  let volume = source.volume;
  if (source.fadeIn > 0 && time < source.start + source.fadeIn) volume *= Math.max(0, (time - source.start) / source.fadeIn);
  if (source.fadeOut > 0 && time > source.end - source.fadeOut) volume *= Math.max(0, (source.end - time) / source.fadeOut);
  return volume;
}

/** A stretch of the timeline, seconds. */
interface Stretch {
  from: number;
  to: number;
}

/**
 * Schedules a source's volume over the part of a window it plays: volume keyframes (205) or transition edges (206) as
 * one curve, the only automation on this gain node, so events never overlap; else its volume with its ramps.
 * @param gain the source's gain parameter
 * @param source the sound source
 * @param playing the part of the window it plays, timeline seconds
 * @param windowStart the window's start, timeline seconds (the context's time 0)
 */
function scheduleGain(gain: AudioParam, source: SoundSource, playing: Stretch, windowStart: number): void {
  const { from, to } = playing;
  if (source.gain || source.lead || source.trail) {
    gain.setValueCurveAtTime(gainCurve(source, from, to - from), from - windowStart, to - from);
    return;
  }
  gain.setValueAtTime(rampedVolume(source, from), from - windowStart);
  for (const edge of [source.start + source.fadeIn, source.end - source.fadeOut, to]) {
    if (edge > from && edge <= to) gain.linearRampToValueAtTime(rampedVolume(source, edge), edge - windowStart);
  }
}

/**
 * Decodes a source's sound for the part of a window it plays and schedules each buffer at its place.
 * @param mix the window's audio context
 * @param gain the source's gain node
 * @param source the sound source
 * @param playing the part of the window it plays, timeline seconds
 * @param windowStart the window's start, timeline seconds (the context's time 0)
 */
async function scheduleBuffers(
  mix: OfflineAudioContext,
  gain: GainNode,
  source: AudioSource,
  playing: Stretch,
  windowStart: number,
): Promise<void> {
  const { from, to } = playing;
  // Source seconds covering the stretch. Before the source's own start (an incoming handle past the file's start)
  // there is nothing to play.
  const sourceFrom = Math.max(0, source.from + (from - source.start));
  const sourceTo = source.from + (to - source.start);
  for await (const decoded of source.sink.buffers(sourceFrom, sourceTo)) {
    const node = mix.createBufferSource();
    node.buffer = decoded.buffer;
    node.connect(gain);
    // Where this decoded buffer lands on the timeline, trimmed to the stretch.
    const lands = source.start + (decoded.timestamp - source.from);
    const offset = Math.max(0, from - lands);
    const duration = Math.min(decoded.duration - offset, to - Math.max(from, lands));
    if (duration > 0) node.start(Math.max(from, lands) - windowStart, offset, duration);
  }
}

/**
 * Mixes the sound of a window of the timeline into one stereo 48 kHz buffer.
 * @param sources the opened sound sources
 * @param windowStart the window's start, timeline seconds
 * @param windowLength its length, seconds
 * @returns the mixed sound
 */
async function mixWindow(sources: AudioSource[], windowStart: number, windowLength: number): Promise<AudioBuffer> {
  const mix = new OfflineAudioContext(2, Math.max(1, Math.round(windowLength * SAMPLE_RATE)), SAMPLE_RATE);
  const windowEnd = windowStart + windowLength;
  for (const source of sources) {
    // A source plays into its transitions' handles (206): from half the one leading in, to half its own.
    const first = source.start - (source.lead ?? 0);
    const last = source.end + (source.trail ?? 0);
    if (last <= windowStart || first >= windowEnd) continue;
    const playing = { from: Math.max(windowStart, first), to: Math.min(windowEnd, last) };
    const gain = mix.createGain();
    gain.connect(mix.destination);
    scheduleGain(gain.gain, source, playing, windowStart);
    await scheduleBuffers(mix, gain, source, playing, windowStart);
  }
  return mix.startRendering();
}

/** Adds the mixed sound a window ahead of the frames, so the two tracks interleave in the file. */
class SoundFeed {
  /** Timeline seconds of sound added so far. */
  private until = 0;

  /**
   * @param track the sound track, or null for a video without sound
   * @param sources the opened sound sources
   * @param total the project's length, seconds
   */
  constructor(
    private readonly track: AudioBufferSource | null,
    private readonly sources: AudioSource[],
    private readonly total: number,
  ) {}

  /**
   * Adds sound windows until they reach a second past a time (or the end).
   * @param time timeline seconds
   */
  async feedUntil(time: number): Promise<void> {
    while (this.track && this.until < this.total && this.until <= time + 1) {
      const length = Math.min(AUDIO_WINDOW, this.total - this.until);
      await this.track.add(await mixWindow(this.sources, this.until, length));
      this.until += length;
    }
  }
}

/** A clip's picture: a photo's decoded image (with its object URL) or a video's latest frame. */
interface Picture {
  image: CanvasImageSource;
  width: number;
  height: number;
  objectUrl?: string;
}

/**
 * Each clip's picture while it shows: a photo's image (decoded once, with its object URL), a video's last frame (held
 * past the end of a source shorter than its trim, as before). Released once the clip has left the stack: a clip shows
 * in one stretch of frames, so it has passed.
 */
class FramePictures {
  private readonly pictures = new Map<string, Picture>();

  /**
   * @param pool the decoder pool
   * @param laneOf a video clip's lane in the pool
   */
  constructor(
    private readonly pool: DecodePool,
    private readonly laneOf: (clip: ExportClip) => PoolClip,
  ) {}

  /**
   * Gives back a clip's picture (and a photo's object URL) and its decoder lane.
   * @param clipId the clip's id
   */
  release(clipId: string): void {
    const objectUrl = this.pictures.get(clipId)?.objectUrl;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    this.pictures.delete(clipId);
    this.pool.forget(clipId);
  }

  /** Gives back every picture held. */
  releaseAll(): void {
    for (const clipId of [...this.pictures.keys()]) this.release(clipId);
  }

  /**
   * A clip's picture for this frame: a photo's image (loaded on its first frame), or the video frame at `local`
   * seconds into the clip from the pool (the last one it gave, when it has no newer frame).
   * @param clip the clip
   * @param local seconds into the clip
   * @returns the picture, or null when there is none yet
   * @throws {ExportError} when the video can't be decoded
   */
  async pictureFor(clip: ExportClip, local: number): Promise<Picture | null> {
    if (clip.kind === 'photo') {
      if (!this.pictures.has(clip.id)) this.pictures.set(clip.id, await loadPhoto(clip.file));
    } else {
      const poolFrame = await this.pool.frame(this.laneOf(clip), clip.in + local).catch((error: unknown) => {
        throw new ExportError(error instanceof Error ? error.message : String(error));
      });
      if (poolFrame) this.pictures.set(clip.id, { image: poolFrame.image, width: poolFrame.width, height: poolFrame.height });
    }
    return this.pictures.get(clip.id) ?? null;
  }
}

/**
 * Decodes a photo through an object URL, revoked again if it fails.
 * @param file the photo's file
 * @returns its picture, holding the object URL
 */
async function loadPhoto(file: Blob): Promise<Picture> {
  const objectUrl = URL.createObjectURL(file);
  const image = await loadImage(objectUrl).catch((error: unknown) => {
    URL.revokeObjectURL(objectUrl);
    throw error;
  });
  return { image, width: image.naturalWidth, height: image.naturalHeight, objectUrl };
}

/** An export in progress: what drawing and encoding its frames needs. */
interface ExportRun {
  job: ExportJob;
  ctx: CanvasRenderingContext2D;
  total: number;
  frameCount: number;
  video: CanvasSource;
  soundFeed: SoundFeed;
  pool: DecodePool;
  pictures: FramePictures;
  laneOf: (clip: ExportClip) => PoolClip;
}

/**
 * Tells the pool which lanes to keep: the videos on screen and the next on each track within 2 s (Q10).
 * @param run the export
 * @param time the project time, seconds
 */
function planLanes(run: ExportRun, time: number): void {
  const lanes = lanePlan(run.job, time, 2);
  run.pool.want([...lanes.visible, ...lanes.next].map((clip) => clip.id));
  for (const clip of lanes.next) run.pool.prepare(run.laneOf(clip));
}

/**
 * Draws one frame: every picture of the stack awaited together, so the videos on screen decode side by side.
 * @param run the export
 * @param frameIndex the frame's number
 * @param stack the clips showing, bottom first
 * @param time the project time, seconds
 */
async function drawFrame(run: ExportRun, frameIndex: number, stack: StackItem<ExportClip>[], time: number): Promise<void> {
  const { job, ctx } = run;
  const framePictures = await Promise.all(stack.map((stackItem) => run.pictures.pictureFor(stackItem.clip, stackItem.local)));
  job.trace?.(
    frameIndex,
    stack.map(({ clip, local }) => ({ id: clip.id, at: clip.kind === 'video' ? clip.in + local : null })),
  );
  const items = stack.map((stackItem, index) => {
    const picture = framePictures.at(index);
    return {
      clip: { ...stackItem.clip, overlay: stackItem.track !== MAIN_VIDEO },
      src: picture?.image ?? null,
      sw: picture?.width ?? 0,
      sh: picture?.height ?? 0,
      local: stackItem.local,
      mix: stackItem.mix,
    };
  });
  renderStack(ctx, job.width, job.height, items, job.layers, time, run.total, job.fadeOut);
}

/**
 * Draws and encodes every frame, with the sound fed alongside; every picture is released at the end, even on failure.
 * @param run the export
 */
async function encodeFrames(run: ExportRun): Promise<void> {
  const { job, frameCount } = run;
  let previousIds: string[] = [];
  try {
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const time = frameIndex / job.fps;
      const stack = frameStack(job, time);
      const stackIds = stack.map((stackItem) => stackItem.clip.id);
      for (const clipId of previousIds) if (!stackIds.includes(clipId)) run.pictures.release(clipId);
      // The lanes are checked when the stack changes and each second.
      if (frameIndex % job.fps === 0 || stackIds.join() !== previousIds.join()) planLanes(run, time);
      previousIds = stackIds;
      await drawFrame(run, frameIndex, stack, time);
      await run.soundFeed.feedUntil(time);
      await run.video.add(time, 1 / job.fps);
      const encoded = frameIndex + 1;
      if (encoded % 10 === 0) {
        job.onProgress?.(encoded / frameCount, `Encoding frame ${encoded.toLocaleString()} of ${frameCount.toLocaleString()}…`);
      }
      throwIfAborted(job.signal);
    }
  } finally {
    run.pictures.releaseAll();
  }
}

/**
 * Checks the export can be made at all: something to export, and an H.264 encoder for its size.
 * @param job the export
 * @param total the project's length, seconds
 * @throws {ExportError} when it can't
 */
async function checkCanExport(job: ExportJob, total: number): Promise<void> {
  if (!job.clips.length || total <= 0) throw new ExportError('Add photos or videos first.');
  const { width, height } = job;
  if (!(await canEncodeVideo('avc', { width, height, bitrate: job.bitrate }))) {
    throw new ExportError(
      `This ${isDesktop ? 'computer' : 'browser'} can’t make H.264 video at ${String(width)}×${String(height)}. Choose a smaller size, or use Chrome, Edge or the Chitthi Studio desktop app.`,
    );
  }
}

/**
 * A canvas of the video's size to draw the frames on.
 * @param job the export
 * @returns the canvas and its context
 * @throws {ExportError} when no 2D context can be made
 */
function frameCanvas(job: ExportJob): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = job.width;
  canvas.height = job.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('Canvas unavailable.');
  return { canvas, ctx };
}

/** The MP4 being written: its output, where it goes, and its tracks. */
interface Mp4Output {
  output: Output;
  target: BufferTarget | StreamTarget;
  video: CanvasSource;
  sound: AudioBufferSource | null;
}

/**
 * Sets up the MP4: in memory or streamed (streamed files reserve space at the front for the index, so they get fast
 * start without holding the video in memory), its H.264 track and, with sound, its AAC track.
 * @param job the export
 * @param canvas the canvas the frames are drawn on
 * @param total the project's length, seconds
 * @param frameCount the number of frames
 * @param withSound whether there is sound to add
 * @returns the output, not started
 */
function mp4Output(job: ExportJob, canvas: HTMLCanvasElement, total: number, frameCount: number, withSound: boolean): Mp4Output {
  const memory = job.sink.kind === 'memory';
  const target = job.sink.kind === 'memory' ? new BufferTarget() : new StreamTarget(job.sink.writable, { chunked: true });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: memory ? 'in-memory' : 'reserve' }), target });
  const video = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: job.bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: job.fps, maximumPacketCount: frameCount + 8 });
  const sound = withSound ? new AudioBufferSource({ codec: 'aac', quality: new Quality({ bitrate: AUDIO_BITRATE }) }) : null;
  if (sound) output.addAudioTrack(sound, { maximumPacketCount: Math.ceil((total * SAMPLE_RATE) / AAC_FRAME) + 64 });
  return { output, target, video, sound };
}

/**
 * The decoder pool for the export: the videos on screen and the next ones (look-ahead), frames no wider than needed
 * for this frame size at up to 1.8× zoom (D5).
 * @param job the export
 * @returns the pool
 */
function exportPool(job: ExportJob): DecodePool {
  return new DecodePool(mediabunnySource, poolLimits(limitsFor('reel', isDesktop).videosAtOnce, isDesktop), {
    maxWidth: Math.round(Math.max(job.width, job.height) * 1.8),
  });
}

/**
 * Renders and encodes the whole timeline.
 * @param job the export
 * @returns the MP4 when built in memory, or null once streamed
 * @throws {ExportError} when it can't be made; an AbortError when cancelled
 */
export async function encodeVideo(job: ExportJob): Promise<Blob | null> {
  const total = projectLength(job);
  await checkCanExport(job, total);
  const withSound = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: AUDIO_BITRATE });

  job.onProgress?.(0, 'Opening the sound…');
  const sources = withSound ? await openAudio(job) : [];
  throwIfAborted(job.signal);

  const { canvas, ctx } = frameCanvas(job);
  const pool = exportPool(job);
  // A clip's lane starts at the first frame its picture shows: half its incoming transition before its in point (206).
  const laneOf = (clip: ExportClip): PoolClip => ({
    id: clip.id,
    file: clip.file,
    in: Math.max(0, clip.in - halves(clip, job.clips).before),
    out: clip.out,
    start: clip.start,
    track: clip.track,
  });
  const frameCount = Math.max(1, Math.round(total * job.fps));
  const { output, target, video, sound } = mp4Output(job, canvas, total, frameCount, sources.length > 0);
  await output.start();

  try {
    const soundFeed = new SoundFeed(sound, sources, total);
    const pictures = new FramePictures(pool, laneOf);
    await encodeFrames({ job, ctx, total, frameCount, video, soundFeed, pool, pictures, laneOf });
    await soundFeed.feedUntil(total);
    video.close();
    sound?.close();
    job.onProgress?.(1, 'Finishing the file…');
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    pool.dispose();
    for (const source of sources) source.input.dispose();
    canvas.width = canvas.height = 1;
  }
  if (target instanceof BufferTarget) {
    if (!target.buffer) throw new ExportError('The video couldn’t be finished.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  }
  return null;
}
