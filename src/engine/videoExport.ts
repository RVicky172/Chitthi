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
import { DecodePool, poolLimits, type PoolClip } from './decodePool';
import { mediabunnySource } from './frameSource';
import { loadImage } from './photo';
import { audioPlan, framePlan, projectLength, type AudioClip, type Project, type SoundSource, type TimedClip } from './timeline';
import { NO_PICTURE, renderFrame, type FrameClip } from './video';

/*
 * Encodes the video editor's project (tracks, engine/timeline.ts) into an MP4: H.264 video and AAC sound at 48 kHz, with the index (`moov`) at the
 * front of the file ("fast start"), which Instagram requires and YouTube processes fastest. Encoding uses the
 * browser's WebCodecs through Mediabunny (MPL-2.0, THIRD_PARTY_NOTICES.md); this module loads only on export.
 *
 * Memory stays flat however long the video is:
 *   - frames are drawn one at a time (`framePlan`) and handed to the encoder; video clips are decoded frame by frame at
 *     exactly the times needed, through the decoder pool (decodePool.ts, as the preview), which opens the next video
 *     clip while the current one encodes and releases every frame once replaced; a hidden video track gives black
 *     frames with the layers on top;
 *   - sound (`audioPlan`: clips' own sound plus music, unless its track is muted) is decoded and mixed in 10-second
 *     windows, interleaved with the frames;
 *   - long videos stream to a file (desktop: through the main process; Chrome and Edge: the File System Access API),
 *     with space reserved at the front for the index; short ones are built in memory so they can be shared.
 */

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
}

export class ExportError extends Error {}

const SAMPLE_RATE = 48000;
/** Seconds of sound mixed at a time. */
const AUDIO_WINDOW = 10;
/** AAC frames carry 1024 samples. */
const AAC_FRAME = 1024;

const aborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
};

/** A sound the mix plays (timeline times, source time, volume and its ramps), opened for decoding. */
interface AudioSource extends SoundSource {
  sink: AudioBufferSink;
  input: Input;
}

/** Opens the sounds of `audioPlan` for windowed decoding. Clips without sound are left out; unreadable music fails. */
async function openAudio(job: ExportJob): Promise<AudioSource[]> {
  const out: AudioSource[] = [];
  const open = async (file: Blob) => {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    if (!track || !(await track.canDecode())) {
      input.dispose();
      return null;
    }
    return { input, sink: new AudioBufferSink(track) };
  };
  const clipFiles = new Map(job.clips.map((c) => [c.id, c.file]));
  const audioFiles = new Map(job.audio.map((a) => [a.id, a.file]));
  for (const s of audioPlan(job)) {
    const music = audioFiles.get(s.ref);
    const file = music ?? clipFiles.get(s.ref);
    if (!file) continue;
    const a = await open(file);
    if (!a && music) throw new ExportError('The music file couldn’t be read. Try an MP3, M4A or WAV file.');
    if (a) out.push({ ...s, ...a });
  }
  return out;
}

/** Mixes the sound for timeline seconds [t0, t0 + len) into one stereo 48 kHz buffer. */
async function mixWindow(sources: AudioSource[], t0: number, len: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.round(len * SAMPLE_RATE)), SAMPLE_RATE);
  const t1 = t0 + len;
  for (const s of sources) {
    if (s.end <= t0 || s.start >= t1) continue;
    const a = Math.max(t0, s.start),
      b = Math.min(t1, s.end);
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    // Volume over the window, with its ramps at the source's ends (times relative to the window).
    const at = (t: number) => {
      let v = s.volume;
      if (s.fadeIn > 0 && t < s.start + s.fadeIn) v *= Math.max(0, (t - s.start) / s.fadeIn);
      if (s.fadeOut > 0 && t > s.end - s.fadeOut) v *= Math.max(0, (s.end - t) / s.fadeOut);
      return v;
    };
    gain.gain.setValueAtTime(at(a), a - t0);
    for (const edge of [s.start + s.fadeIn, s.end - s.fadeOut, b]) if (edge > a && edge <= b) gain.gain.linearRampToValueAtTime(at(edge), edge - t0);
    // Source seconds covering [a, b).
    const srcA = s.from + (a - s.start),
      srcB = s.from + (b - s.start);
    for await (const wb of s.sink.buffers(srcA, srcB)) {
      const node = ctx.createBufferSource();
      node.buffer = wb.buffer;
      node.connect(gain);
      // Where this decoded buffer lands on the timeline, trimmed to [a, b).
      const when = s.start + (wb.timestamp - s.from);
      const offset = Math.max(0, a - when),
        startAt = Math.max(a, when) - t0,
        dur = Math.min(wb.duration - offset, b - Math.max(a, when));
      if (dur > 0) node.start(startAt, offset, dur);
    }
  }
  return ctx.startRendering();
}

/** Renders and encodes the whole timeline. Resolves with the MP4 when built in memory, or null once streamed. */
export async function encodeVideo(job: ExportJob): Promise<Blob | null> {
  const { width: W, height: H, fps } = job;
  const total = projectLength(job);
  if (!job.clips.length || total <= 0) throw new ExportError('Add photos or videos first.');
  if (!(await canEncodeVideo('avc', { width: W, height: H, bitrate: job.bitrate })))
    throw new ExportError(`This ${typeof window !== 'undefined' && 'chitthiDesktop' in window ? 'computer' : 'browser'} can’t make H.264 video at ${W}×${H}. Choose a smaller size, or use Chrome, Edge or the Chitthi Studio desktop app.`);
  const withSound = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 128000 });

  job.onProgress?.(0, 'Opening the sound…');
  const sources = withSound ? await openAudio(job) : [];
  aborted(job.signal);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('Canvas unavailable.');

  const frames = Math.max(1, Math.round(total * fps));
  // Video clips decode through a pool: the clip being encoded and the next one (look-ahead), frames no wider than
  // needed for this frame size at up to 1.8× zoom (D5).
  const desktop = typeof window !== 'undefined' && 'chitthiDesktop' in window;
  const pool = new DecodePool(mediabunnySource, poolLimits(1, desktop), { maxWidth: Math.round(Math.max(W, H) * 1.8) });
  const lane = (c: ExportClip): PoolClip => ({ id: c.id, file: c.file, in: c.in, out: c.out, start: c.start, track: c.track });
  const memory = job.sink.kind === 'memory';
  const target = job.sink.kind === 'memory' ? new BufferTarget() : new StreamTarget(job.sink.writable, { chunked: true });
  // Streamed files reserve space at the front for the index, so they get fast start without holding the video in memory.
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: memory ? 'in-memory' : 'reserve' }), target });
  const video = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: job.bitrate }), keyFrameInterval: 2 });
  output.addVideoTrack(video, { frameRate: fps, maximumPacketCount: frames + 8 });
  const sound = sources.length ? new AudioBufferSource({ codec: 'aac', quality: new Quality({ bitrate: 128000 }) }) : null;
  if (sound) output.addAudioTrack(sound, { maximumPacketCount: Math.ceil((total * SAMPLE_RATE) / AAC_FRAME) + 64 });
  await output.start();

  try {
    // Sound is added a window ahead of the frames, so the two tracks interleave in the file.
    let soundUntil = 0;
    const feedSound = async (t: number) => {
      while (sound && soundUntil < total && soundUntil <= t + 1) {
        const len = Math.min(AUDIO_WINDOW, total - soundUntil);
        await sound.add(await mixWindow(sources, soundUntil, len));
        soundUntil += len;
      }
    };
    let done = 0;
    const step = async (t: number) => {
      await feedSound(t);
      await video.add(t, 1 / fps);
      done++;
      if (done % 10 === 0) job.onProgress?.(done / frames, `Encoding frame ${done.toLocaleString()} of ${frames.toLocaleString()}…`);
      aborted(job.signal);
    };
    const plan = framePlan(job, fps);
    for (const [k, { clip: c, f0, f1: last, start }] of plan.entries()) {
      if (!c) {
        // The video track is hidden: black frames, the layers still on top.
        for (let i = f0; i < last; i++) {
          const t = i / fps;
          renderFrame(ctx, W, H, NO_PICTURE, null, 0, 0, t - start, job.layers, t, total, job.fadeOut);
          await step(t);
        }
      } else if (c.kind === 'photo') {
        const url = URL.createObjectURL(c.file);
        try {
          const img = await loadImage(url);
          for (let i = f0; i < last; i++) {
            const t = i / fps;
            renderFrame(ctx, W, H, c, img, img.naturalWidth, img.naturalHeight, t - start, job.layers, t, total, job.fadeOut);
            await step(t);
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        const now = lane(c);
        const next = plan.slice(k + 1).find((p) => p.clip?.kind === 'video')?.clip;
        pool.want(next ? [c.id, next.id] : [c.id]);
        if (next) pool.prepare(lane(next));
        // Past the end of a source shorter than its trim the pool gives its last frame (held, as before).
        let prev: CanvasImageSource | null = null,
          pw = 0,
          ph = 0;
        for (let i = f0; i < last; i++) {
          const t = i / fps;
          const f = await pool.frame(now, c.in + t - start).catch((e: unknown) => {
            throw new ExportError(e instanceof Error ? e.message : String(e));
          });
          if (f) {
            prev = f.image;
            pw = f.width;
            ph = f.height;
          }
          renderFrame(ctx, W, H, c, prev, pw, ph, t - start, job.layers, t, total, job.fadeOut);
          await step(t);
        }
        pool.forget(c.id);
      }
    }
    await feedSound(total);
    video.close();
    sound?.close();
    job.onProgress?.(1, 'Finishing the file…');
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => undefined);
    throw e;
  } finally {
    pool.dispose();
    for (const s of sources) s.input.dispose();
    canvas.width = canvas.height = 1;
  }
  if (target instanceof BufferTarget) {
    if (!target.buffer) throw new ExportError('The video couldn’t be finished.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  }
  return null;
}
