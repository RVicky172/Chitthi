import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalise } from './index';
import { SEG_MODELS, modelRow } from './models';

describe('segmentation maps', () => {
  it('are stretched to 0–1, as the models’ reference code does', () => {
    expect([...normalise(new Float32Array([0.01, 0.045, 0.08]))].map((v) => +v.toFixed(3))).toEqual([0, 0.5, 1]);
  });
  it('stay empty when the model found nothing (a flat map)', () => {
    expect([...normalise(new Float32Array([0.2, 0.205, 0.2]))]).toEqual([0, 0, 0]);
  });
});

describe('segmentation models', () => {
  it('pin their files by size and SHA-256; only the small one ships', () => {
    for (const m of Object.values(SEG_MODELS)) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes).toBeGreaterThan(1e6);
      expect(['MIT', 'Apache-2.0']).toContain(m.licence);
    }
    expect(SEG_MODELS.subject.bundled).toBe(true);
    expect(SEG_MODELS.sky.bundled).toBe(false);
    expect(SEG_MODELS.sky.url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\//);
  });
});

describe('models on this device (401)', () => {
  it('each state has its words, and only a downloaded model can be deleted', () => {
    expect(modelRow('bundled')).toEqual({ status: 'Part of the app', canDelete: false });
    expect(modelRow('stored')).toEqual({ status: 'On this device', canDelete: true });
    expect(modelRow('session')).toEqual({ status: 'Kept for this session only', canDelete: true });
    expect(modelRow('none')).toEqual({ status: 'Not downloaded', canDelete: false });
  });
});

/*
 * The segmenter with the browser stubbed (Vitest runs in Node): the private file system as a map of file sizes, a
 * canvas that reads black pixels, a worker that answers with a map, and fetch for the bundled model.
 */
describe('deleting a model (401)', () => {
  const files = new Map<string, number>();
  let terminated = 0;
  let hold: Promise<void> | null = null;

  async function load(opfs = true) {
    vi.resetModules();
    files.clear();
    terminated = 0;
    hold = null;
    const dir = {
      getFileHandle: async (name: string, o?: { create?: boolean }) => {
        if (!files.has(name) && !o?.create) throw new DOMException('missing', 'NotFoundError');
        return { getFile: async () => ({ size: files.get(name) ?? 0, arrayBuffer: async () => new ArrayBuffer(8) }) };
      },
      removeEntry: async (name: string) => {
        if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError');
      },
    };
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: async () => {
          if (!opfs) throw new Error('no OPFS');
          return { getDirectoryHandle: async () => dir };
        },
      },
    });
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(320 * 320 * 4) }) }),
      }),
    });
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: ((e: { data: unknown }) => void) | null = null;
        postMessage(m: { id: number }) {
          void Promise.resolve(hold).then(() => this.onmessage?.({ data: { id: m.id, map: new Float32Array(4) } }));
        }
        terminate() {
          terminated++;
        }
      },
    );
    vi.stubGlobal('fetch', async () => new Response(new ArrayBuffer(8)));
    return import('./index');
  }
  /** A stand-in photo: the stubbed canvas never looks at it. */
  const photo = () => ({}) as CanvasImageSource;
  afterEach(() => vi.unstubAllGlobals());

  it('a stored model is deleted from the device and from the worker that loaded it', async () => {
    const seg = await load();
    files.set('skyseg.onnx', SEG_MODELS.sky.bytes);
    expect(await seg.modelState('sky')).toBe('stored');
    expect(await seg.modelState('subject')).toBe('bundled');
    await seg.segmentPhoto(photo(), 'sky');
    expect(await seg.deleteModel('sky')).toBeNull();
    expect(files.has('skyseg.onnx')).toBe(false);
    expect(await seg.modelState('sky')).toBe('none');
    expect(await seg.modelOnDevice('sky')).toBe(false);
    expect(terminated).toBe(1);
    // The next search asks again before downloading.
    await expect(seg.segmentPhoto(photo(), 'sky')).rejects.toBeInstanceOf(seg.NeedsDownload);
  });
  it('a file of the wrong size isn’t the model; deleting a model that isn’t there is fine', async () => {
    const seg = await load();
    files.set('skyseg.onnx', 1000);
    expect(await seg.modelState('sky')).toBe('none');
    expect(await seg.deleteModel('sky')).toBeNull();
    expect(files.has('skyseg.onnx')).toBe(false);
    expect(terminated).toBe(0);
  });
  it('a bundled model can’t be deleted', async () => {
    const seg = await load();
    expect(await seg.deleteModel('subject')).toMatch(/part of the app/i);
  });
  it('is refused while a search is running, and works once it has finished', async () => {
    const seg = await load();
    files.set('skyseg.onnx', SEG_MODELS.sky.bytes);
    let done!: () => void;
    hold = new Promise<void>((r) => (done = r));
    const running = seg.segmentPhoto(photo(), 'subject');
    await new Promise((r) => setTimeout(r, 0));
    expect(await seg.deleteModel('sky')).toMatch(/running/);
    expect(files.has('skyseg.onnx')).toBe(true);
    done();
    await running;
    expect(await seg.deleteModel('sky')).toBeNull();
  });
  it('without a private file system the state is read safely as not downloaded', async () => {
    const seg = await load(false);
    expect(await seg.modelState('sky')).toBe('none');
    expect(await seg.deleteModel('sky')).toBeNull();
  });
});
