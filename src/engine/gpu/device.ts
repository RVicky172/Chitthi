import { TexturePool } from './graph';
import type { GpuBackend, GpuDevice } from './types';

/*
 * Picks and keeps the GPU device for the editors (specs/vision/editor-implementation.md, P0.2): WebGPU where the
 * browser has it, else WebGL2, else none, in which case the editors keep drawing with Canvas 2D. Opening is async
 * (WebGPU needs it), so the editors call openGpu() when they start and gpu() from then on, synchronously, while drawing.
 * A lost device (driver reset, too many contexts) is dropped; the next openGpu() opens a fresh one.
 */

/** Which backend to open: one of them, or the best available. */
export type GpuPreference = GpuBackend | 'auto';

let current: GpuDevice | null = null;
let opening: Promise<GpuDevice | null> | null = null;
let openedWith: GpuPreference | null = null;
let pool: TexturePool | null = null;

/**
 * Opens a device: WebGPU unless WebGL2 is asked for, else WebGL2 (unless only WebGPU is asked for).
 * @param prefer which backend
 * @returns the device, or null when none could be opened
 */
async function open(prefer: GpuPreference): Promise<GpuDevice | null> {
  if (prefer !== 'webgl2') {
    const { openWebGPU } = await import('./webgpu');
    const device = await openWebGPU().catch(() => null);
    if (device || prefer === 'webgpu') return device;
  }
  const { openWebGL2 } = await import('./webgl2');
  try {
    return openWebGL2();
  } catch {
    return null;
  }
}

/**
 * Opens (or reuses) the device.
 * @param prefer which backend
 * @returns the device, or null when this browser has no usable GPU path
 */
export function openGpu(prefer: GpuPreference = 'auto'): Promise<GpuDevice | null> {
  if (current && !current.lost && openedWith === prefer) return Promise.resolve(current);
  if (opening && openedWith === prefer) return opening;
  if (current) closeGpu();
  openedWith = prefer;
  opening = open(prefer).then((device) => {
    current = device;
    opening = null;
    return device;
  });
  return opening;
}

/**
 * The open device. Safe to call while drawing.
 * @returns the device, or null (not opened yet, none available, or lost since)
 */
export function gpu(): GpuDevice | null {
  if (current?.lost) {
    current = null;
    pool = null;
  }
  return current;
}

/**
 * The texture pool of the open device, made on first use.
 * @param device the open device
 * @returns its pool
 */
export function gpuPool(device: GpuDevice): TexturePool {
  if (!pool || device !== current) pool = new TexturePool(device);
  return pool;
}

/** Closes the device and its pool; the next openGpu() opens a fresh one. */
export function closeGpu(): void {
  pool?.clear();
  pool = null;
  current?.destroy();
  current = null;
  opening = null;
  openedWith = null;
}

/**
 * Which GPU paths this browser offers, without opening a device. For settings and error reports.
 * @returns whether WebGPU and WebGL2 are there
 */
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
