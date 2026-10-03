import { closeGpu, openGpu } from '../engine/gpu/device';

/*
 * The "use the graphics card for photo and video effects" setting (docs/planning/EDITOR-IMPLEMENTATION.md, P0.5).
 * Off by default until the GPU path has matched the Canvas 2D output on real photos (P0.6); then it becomes the default.
 * Kept on this device only. The engine never reads it: the media studio opens the GPU device when it is on, and
 * renderIg() uses whatever device is open.
 */

const KEY = 'chitthi-gpu-effects';

export function gpuEffectsOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setGpuEffects(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the choice lasts for this visit only */
  }
  if (on) void openGpu();
  else closeGpu();
}

/** Opens the GPU device if the setting is on. Called when the media studio opens. */
export function startGpuEffects(): void {
  if (gpuEffectsOn()) void openGpu();
}
