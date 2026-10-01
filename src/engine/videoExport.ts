import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
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
import type { Layer } from './layers';
import { loadImage } from './photo';
import { frameRange, renderFrame, timeline, totalLength, type FrameClip } from './video';

/*
 * Encodes the video editor's timeline into an MP4: H.264 video and AAC sound at 48 kHz, with the index (`moov`) at the
 * front of the file ("fast start"), which Instagram requires and YouTube processes fastest. Encoding uses the
 * browser's WebCodecs through Mediabunny (MPL-2.0, THIRD_PARTY_NOTICES.md); this module loads only on export.
 *
 * Memory stays flat however long the video is:
 *   - frames are drawn one at a time and handed to the encoder; video clips are decoded frame by frame at exactly the
 *     times needed;
 *   - sound is decoded and mixed in 10-second windows (clips' own sound plus music), interleaved with the frames;
 *   - long videos stream to a file (desktop: through the main process; Chrome and Edge: the File System Access API),
 *     with space reserved at the front for the index; short ones are built in memory so they can be shared.
 */

export interface ExportClip extends FrameClip {
  file: Blob;
  /** Video: 0–1. */
  volume: number;
}

/** Where the MP4 goes: built in memory (returned as a Blob), or streamed to a writable file. */
export type ExportSink = { kind: 'memory' } | { kind: 'stream'; writable: WritableStream<StreamTargetChunk> };

export interface ExportJob {
  clips: ExportClip[];
  layers: Layer[];
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  fadeOut: boolean;
  music: { file: Blob; volume: number; offset: number } | null;
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
const nameOf = (b: Blob) => (b instanceof File ? b.name : 'A clip');

interface AudioSource {
  /** Timeline seconds where it starts and ends. */
  start: number;
  end: number;
  /** Source seconds at `start`. */
  from: number;
  volume: number;
  sink: AudioBufferSink;
  input: Input;
  /** Ramp the volume at its ends (clips: short ramps at cuts; music: a fade out). */
  fadeIn: number;
  fadeOut: number;
}

/** Opens the sound of every clip and the music, for windowed decoding. Sources without sound are left out. */
async function openAudio(job: ExportJob, total: number): Promise<AudioSource[]> {
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
  for (const p of timeline(job.clips)) {
    const c = p.clip;
    if (c.kind !== 'video' || c.volume <= 0) continue;
    const a = await open(c.file);
    if (a) out.push({ ...a, start: p.start, end: p.end, from: c.in, volume: c.volume, fadeIn: 0.03, fadeOut: 0.03 });
  }
  if (job.music && job.music.volume > 0) {
    const a = await open(job.music.file);
    if (!a) throw new ExportError('The music file couldn’t be read. Try an MP3, M4A or WAV file.');
    out.push({ ...a, start: 0, end: total, from: Math.max(0, job.music.offset), volume: job.music.volume, fadeIn: 0, fadeOut: Math.min(1.5, total / 3) });
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
  const total = totalLength(job.clips);
  if (!job.clips.length || total <= 0) throw new ExportError('Add photos or videos first.');
  if (!(await canEncodeVideo('avc', { width: W, height: H, bitrate: job.bitrate })))
    throw new ExportError(`This ${typeof window !== 'undefined' && 'chitthiDesktop' in window ? 'computer' : 'browser'} can’t make H.264 video at ${W}×${H}. Choose a smaller size, or use Chrome, Edge or the Chitthi Studio desktop app.`);
  const withSound = await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: SAMPLE_RATE, bitrate: 128000 });

  job.onProgress?.(0, 'Opening the sound…');
  const sources = withSound ? await openAudio(job, total) : [];
  aborted(job.signal);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('Canvas unavailable.');

  const frames = Math.max(1, Math.round(total * fps));
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
    for (const p of timeline(job.clips)) {
      const c = p.clip;
      const [f0, f1] = frameRange(p.start, p.end, fps);
      const last = Math.min(f1, frames);
      if (f0 >= last) continue;
      if (c.kind === 'photo') {
        const url = URL.createObjectURL(c.file);
        try {
          const img = await loadImage(url);
          for (let i = f0; i < last; i++) {
            const t = i / fps;
            renderFrame(ctx, W, H, c, img, img.naturalWidth, img.naturalHeight, t - p.start, job.layers, t, total, job.fadeOut);
            await step(t);
          }
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        const input = new Input({ source: new BlobSource(c.file), formats: ALL_FORMATS });
        try {
          const track = await input.getPrimaryVideoTrack();
          if (!track) throw new ExportError(`${nameOf(c.file)} has no video track.`);
          if (!(await track.canDecode())) throw new ExportError(`${nameOf(c.file)} uses a video format this ${'chitthiDesktop' in window ? 'computer' : 'browser'} can’t decode (often HEVC from an iPhone).`);
          // Decode no wider than needed for this frame size at up to 1.8× zoom.
          const sink = new CanvasSink(track, { width: Math.min(track.displayWidth, Math.round(Math.max(W, H) * 1.8)), poolSize: 2 });
          const times = Array.from({ length: last - f0 }, (_, k) => c.in + (f0 + k) / fps - p.start);
          let i = f0;
          let prev: CanvasImageSource | null = null,
            pw = 0,
            ph = 0;
          for await (const wc of sink.canvasesAtTimestamps(times)) {
            if (wc) {
              prev = wc.canvas;
              pw = wc.canvas.width;
              ph = wc.canvas.height;
            }
            const t = i / fps;
            renderFrame(ctx, W, H, c, prev, pw, ph, t - p.start, job.layers, t, total, job.fadeOut);
            await step(t);
            if (++i >= last) break;
          }
          // A source shorter than its trim: hold the last frame.
          for (; i < last; i++) {
            const t = i / fps;
            renderFrame(ctx, W, H, c, prev, pw, ph, t - p.start, job.layers, t, total, job.fadeOut);
            await step(t);
          }
        } finally {
          input.dispose();
        }
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
    for (const s of sources) s.input.dispose();
    canvas.width = canvas.height = 1;
  }
  if (target instanceof BufferTarget) {
    if (!target.buffer) throw new ExportError('The video couldn’t be finished.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  }
  return null;
}
