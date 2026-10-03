import { TexturePool } from './graph';
import type { GpuBackend, GpuDevice } from './types';

/*
 * Picks and keeps the GPU device for the editors (docs/planning/EDITOR-IMPLEMENTATION.md, P0.2): WebGPU where the
 * browser has it, else WebGL2, else none, in which case the editors keep drawing with Canvas 2D. Opening is async
 * (WebGPU needs it), so the editors call openGpu() when they start and gpu() from then on, synchronously, while drawing.
 * A lost device (driver reset, too many contexts) is dropped; the next openGpu() opens a fresh one.
 */

export type GpuPreference = GpuBackend | 'auto';

let current: GpuDevice | null = null;
let opening: Promise<GpuDevice | null> | null = null;
let openedWith: GpuPreference | null = null;
let pool: TexturePool | null = null;

async function open(prefer: GpuPreference): Promise<GpuDevice | null> {
  if (prefer !== 'webgl2') {
    const { openWebGPU } = await import('./webgpu');
    const d = await openWebGPU().catch(() => null);
    if (d || prefer === 'webgpu') return d;
  }
  const { openWebGL2 } = await import('./webgl2');
  try {
    return openWebGL2();
  } catch {
    return null;
  }
}

/** Opens (or reuses) the device. Resolves to null when this browser has no usable GPU path. */
export function openGpu(prefer: GpuPreference = 'auto'): Promise<GpuDevice | null> {
  if (current && !current.lost && openedWith === prefer) return Promise.resolve(current);
  if (opening && openedWith === prefer) return opening;
  if (current) closeGpu();
  openedWith = prefer;
  opening = open(prefer).then((d) => {
    current = d;
    opening = null;
    return d;
  });
  return opening;
}

/** The open device, or null (not opened yet, none available, or lost since). Safe to call while drawing. */
export function gpu(): GpuDevice | null {
  if (current?.lost) {
    current = null;
    pool = null;
  }
  return current;
}

/** The texture pool of the open device, made on first use. */
export function gpuPool(dev: GpuDevice): TexturePool {
  if (!pool || dev !== current) pool = new TexturePool(dev);
  return pool;
}

export function closeGpu(): void {
  pool?.clear();
  pool = null;
  current?.destroy();
  current = null;
  opening = null;
  openedWith = null;
}

/** Which GPU paths this browser offers, without opening a device. For settings and error reports. */
export function gpuSupport(): { webgpu: boolean; webgl2: boolean } {
  const webgpu = typeof navigator !== 'undefined' && !!navigator.gpu;
  let webgl2 = false;
  if (typeof WebGL2RenderingContext !== 'undefined' && typeof document !== 'undefined') {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return { webgpu, webgl2 };
}
