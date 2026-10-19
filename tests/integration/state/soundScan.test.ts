import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { peakDb, scanSamples, type SampleChunk } from '@/engine/soundScan';
import { MAIN_VIDEO } from '@/engine/tracks';
import { clearScans, dropScan, scanIO, scanMedia, scanOf, scanSnapshot, subscribeScans } from '@/state/soundScan';
import { addMedia, mediaIO } from '@/state/videoMedia';
import { loadVideoProject, type VClip } from '@/state/videoStore';
import { defined } from '../../support/defined';

/* 208 T033 (D5): each file's sound scanned once in the background, one file at a time, dropped with its media. */

const RATE = 1000;

/** A fake file: its sound is steady levels, one per second, handed over in chunks of 250 ms. */
interface FakeSound {
  levels: number[];
  /** Resolves to let the decoder go on after its first chunk (to catch a scan while it runs). */
  hold?: Promise<void>;
}

const sounds = new Map<Blob, FakeSound>();
const fileOf = (sound: FakeSound): Blob => {
  const file = new Blob([String(sounds.size)]);
  sounds.set(file, sound);
  return file;
};

/** Scans running now, the most at once, and the files in the order they started. */
let running = 0;
let mostAtOnce = 0;
let started: Blob[] = [];
let signals: AbortSignal[] = [];

/**
 * The fake decoder's chunks for a file.
 * @param sound the file's levels and hold
 * @yields 250 ms chunks in order
 */
async function* chunks(sound: FakeSound): AsyncGenerator<SampleChunk> {
  for (const [second, level] of sound.levels.entries())
    for (let quarter = 0; quarter < 4; quarter++) {
      if (second + quarter > 0 && sound.hold) await sound.hold;
      yield { channels: [new Float32Array(RATE / 4).fill(level)], sampleRate: RATE, end: second + (quarter + 1) / 4 };
    }
}

/**
 * A gate the test opens.
 * @returns the promise and its opener
 */
function gate(): { hold: Promise<void>; open: () => void } {
  let open: () => void = () => undefined;
  const hold = new Promise<void>((resolve) => (open = resolve));
  return { hold, open };
}

/**
 * Waits until the queue has nothing running or waiting.
 * @returns when idle
 */
const idle = () => vi.waitFor(() => expect(scanSnapshot().busy).toBe(false));

beforeEach(() => {
  clearScans();
  running = 0;
  mostAtOnce = 0;
  started = [];
  signals = [];
  vi.spyOn(scanIO, 'scan').mockImplementation(async (file, signal, progress) => {
    started.push(file);
    signals.push(signal);
    running++;
    mostAtOnce = Math.max(mostAtOnce, running);
    try {
      const sound = defined(sounds.get(file));
      return await scanSamples(chunks(sound), { dur: sound.levels.length, signal, progress });
    } finally {
      running--;
    }
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  clearScans();
});

describe('the background scanner (208 T033, D5)', () => {
  it('folds a file’s chunks in order into its scan, kept by media id', async () => {
    scanMedia('m1', fileOf({ levels: [0.5, 0.1] }));
    await idle();
    const scan = defined(scanOf('m1'));
    expect(scan.dur).toBe(2);
    expect(peakDb(defined(scan.peaks[50]))).toBeCloseTo(20 * Math.log10(0.5), 0);
    expect(peakDb(defined(scan.peaks[150]))).toBeCloseTo(20 * Math.log10(0.1), 0);
  });

  it('scans one file at a time, in the order they came, and each only once', async () => {
    const files = [fileOf({ levels: [0.2] }), fileOf({ levels: [0.3, 0.3] }), fileOf({ levels: [0.4] })];
    files.forEach((file, index) => scanMedia(`m${index}`, file));
    scanMedia('m0', defined(files[0]));
    await idle();
    expect(mostAtOnce).toBe(1);
    expect(started).toEqual(files);
    expect(['m0', 'm1', 'm2'].every((media) => scanOf(media))).toBe(true);
    scanMedia('m1', defined(files[1]));
    await idle();
    expect(started).toHaveLength(3);
  });

  it('reports progress while scanning, and tells listeners', async () => {
    const { hold, open } = gate();
    const heard = vi.fn();
    const stop = subscribeScans(heard);
    scanMedia('m1', fileOf({ levels: [0.5, 0.5], hold }));
    await vi.waitFor(() => expect(scanSnapshot().progress?.media).toBe('m1'));
    expect(defined(scanSnapshot().progress).share).toBeGreaterThan(0);
    expect(defined(scanSnapshot().progress).share).toBeLessThan(1);
    open();
    await idle();
    expect(scanSnapshot().progress).toBeNull();
    expect(heard).toHaveBeenCalled();
    stop();
  });

  it('dropping media stops its scan (and its place in the queue); the next file goes on', async () => {
    const { hold, open } = gate();
    scanMedia('m1', fileOf({ levels: [0.5, 0.5], hold }));
    scanMedia('m2', fileOf({ levels: [0.2] }));
    scanMedia('m3', fileOf({ levels: [0.3] }));
    await vi.waitFor(() => expect(started).toHaveLength(1));
    dropScan('m1');
    dropScan('m3');
    expect(defined(signals[0]).aborted).toBe(true);
    open();
    await idle();
    expect(scanOf('m1')).toBeUndefined();
    expect(scanOf('m3')).toBeUndefined();
    expect(scanOf('m2')).toBeDefined();
    expect(started).toHaveLength(2);
  });

  it('a scanned file’s scan is dropped with its media', async () => {
    scanMedia('m1', fileOf({ levels: [0.5] }));
    await idle();
    dropScan('m1');
    expect(scanOf('m1')).toBeUndefined();
  });

  it('a file without sound leaves no scan and stops nothing after it', async () => {
    scanMedia('silent', fileOf({ levels: [] }));
    scanMedia('m2', fileOf({ levels: [0.2] }));
    await idle();
    expect(scanOf('silent')).toBeUndefined();
    expect(scanOf('m2')).toBeDefined();
  });
});

describe('importing starts the scan without waiting for it (208 AC-4)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'VideoDecoder',
      class VideoDecoderStub {
        readonly stub = true;
      },
    );
    vi.spyOn(mediaIO, 'strip').mockResolvedValue(undefined);
    loadVideoProject({ clips: [] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('a video added to the timeline is scanned by its media (its object URL) after addMedia returns', async () => {
    const { hold, open } = gate();
    const file = fileOf({ levels: [0.5, 0.5], hold });
    const added: VClip = {
      id: 'v1', kind: 'video', track: MAIN_VIDEO, start: 0, name: 'clip.mp4', file, url: 'blob:v1', w: 10, h: 10,
      srcDur: 2, dur: 0, in: 0, out: 2, edit: { ...DEFAULT_EDIT }, motion: 'none', fade: false, volume: 1, thumb: '',
      strip: [], still: null,
    };
    vi.spyOn(mediaIO, 'video').mockResolvedValue(added);
    await addMedia([{ name: 'clip.mp4', blob: file, type: 'video/mp4' }]);
    expect(scanOf('blob:v1')).toBeUndefined();
    open();
    await idle();
    expect(started).toEqual([file]);
    expect(scanOf('blob:v1')).toBeDefined();
  });
});
