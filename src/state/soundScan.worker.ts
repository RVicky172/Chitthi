/*
 * The sound scanner's worker (208 D5): streams a file's sound through Mediabunny's AudioSampleSink (as the export
 * decodes, so a 3-hour file is never decoded whole; AudioBuffer doesn't exist in a worker, AudioData does) and folds it
 * with engine/soundScan.ts. One file at a time; a `cancel` message stops it between chunks.
 */
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, type AudioSample } from 'mediabunny';
import { scanSamples, type SampleChunk } from '../engine/soundScan';

/** A request: scan a file, or stop scanning one. */
interface ScanRequest {
  id: number;
  file?: Blob;
  cancel?: true;
}

const running = new Map<number, AbortController>();

/**
 * A decoded sample's channels as float arrays.
 * @param sample the sample (closed by the caller)
 * @returns the chunk
 */
function chunkOf(sample: AudioSample): SampleChunk {
  const channels: Float32Array[] = [];
  for (let planeIndex = 0; planeIndex < sample.numberOfChannels; planeIndex++) {
    const channel = new Float32Array(sample.numberOfFrames);
    sample.copyTo(channel, { planeIndex, format: 'f32-planar' });
    channels.push(channel);
  }
  return { channels, sampleRate: sample.sampleRate, end: sample.timestamp + sample.duration };
}

/**
 * The file's sound, sample by sample, each closed once read.
 * @param sink the decoder
 * @yields its chunks
 */
async function* chunks(sink: AudioSampleSink): AsyncGenerator<SampleChunk> {
  for await (const sample of sink.samples()) {
    try {
      yield chunkOf(sample);
    } finally {
      sample.close();
    }
  }
}

/**
 * Scans one file and replies with its scan (null without decodable sound), its progress, or the error.
 * @param id the request's id
 * @param file the file
 */
async function scan(id: number, file: Blob): Promise<void> {
  const controller = new AbortController();
  running.set(id, controller);
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack().catch(() => null);
    if (!track || !(await track.canDecode())) {
      postMessage({ id, scan: null });
      return;
    }
    const dur = (await input.getDurationFromMetadata().catch(() => null)) ?? 0;
    let reported = 0;
    const result = await scanSamples(chunks(new AudioSampleSink(track)), {
      dur,
      signal: controller.signal,
      progress: (share) => {
        // A message per 1 %, not per chunk.
        if (share - reported < 0.01) return;
        reported = share;
        postMessage({ id, share });
      },
    });
    const transfer = result ? [result.peaks.buffer, result.rms.buffer] : [];
    postMessage({ id, scan: result }, { transfer });
  } catch (error) {
    if (!controller.signal.aborted) postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  } finally {
    running.delete(id);
    input.dispose();
  }
}

self.onmessage = (event: MessageEvent<ScanRequest>) => {
  const { id, file, cancel } = event.data;
  if (cancel) running.get(id)?.abort();
  else if (file) void scan(id, file);
};
