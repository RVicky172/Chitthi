import { closeGpu, openGpu } from '../engine/gpu/device';

/*
 * The "use the graphics card for photo and video effects" setting (specs/vision/editor-implementation.md, P0.5, P0.9).
 * On by default since the GPU path matched the Canvas 2D output on real photos (P0.6); turning it off is remembered.
 * Without a usable GPU the editors draw with Canvas 2D either way. Kept on this device only. The engine never reads it: the media studio opens the GPU device when it is on, and
 * renderIg() uses whatever device is open.
 */

const KEY = 'chitthi-gpu-effects';

/**
 * Whether photo and video effects use the graphics card.
 * @returns true unless the user turned it off on this device
 */
export function gpuEffectsOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

/**
 * Turns graphics-card effects on or off, remembers it and opens or closes the GPU device.
 * @param on true to use the graphics card
 */
export function setGpuEffects(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '0');
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
