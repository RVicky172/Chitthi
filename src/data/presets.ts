import type { Adjustments } from '../engine/adjust';
import { IG_FILTERS } from './instagram';

/*
 * Presets (P1.4): a named set of colour settings. Applying one sets only the settings it holds and leaves the rest, as
 * in Lightroom; so the built-in presets, which hold just a look, change the look and keep every slider. Saved presets
 * (P1.5) join this list.
 */

export interface Preset {
  id: string;
  name: string;
  adjust: Partial<Adjustments>;
}

/** The ready-made looks, as presets. */
export const BUILT_IN_PRESETS: readonly Preset[] = IG_FILTERS.map(([look, name]) => ({
  id: `look:${look}`,
  name,
  adjust: { look },
}));

/** True when the settings already hold everything the preset sets. */
export const presetApplied = (a: Adjustments, p: Preset): boolean =>
  Object.entries(p.adjust).every(([k, v]) => JSON.stringify(a[k as keyof Adjustments]) === JSON.stringify(v));
