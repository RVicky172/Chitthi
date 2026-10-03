import { mergeAdjust, type Adjustments } from './adjust';
import { lutFromJson, lutToJson, type Lut } from './lut';

/*
 * Saved presets (P1.5): a name and a full set of colour settings, saved from a photo or clip and applied to others.
 * Stored on the device (state/presets.ts: IndexedDB in the browser, the data folder in the desktop app) and moved
 * between devices as a preset file: JSON holding the presets and the LUTs they use, so a preset with a LUT works on
 * a device that never imported it. Everything read from storage or a file goes through mergePreset() / readPresetFile(),
 * whose colour settings go through mergeAdjust() (the gate mergeEdit() uses for colour).
 */

export interface SavedPreset {
  /** The storage key; same pattern as the desktop app's file names. */
  id: string;
  name: string;
  adjust: Adjustments;
  created: number;
}

export const PRESET_NAME_MAX = 60;
/** At most this many presets in one file, and files of at most this size (a 65³ LUT is about 4.4 MB in one). */
export const PRESET_FILE_MAX = 500;
export const PRESET_FILE_BYTES = 64 * 1024 * 1024;
export const PRESET_FORMAT = 'chitthi-presets';

const ID = /^[A-Za-z0-9_-]{1,100}$/;

export class PresetError extends Error {}

/** A name fit to show and store: spaces collapsed, trimmed, at most PRESET_NAME_MAX characters; '' if nothing is left. */
export const cleanName = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX).trim() : '';

/** A new storage id. */
export const presetId = (): string => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** The single gate for a stored preset: a complete, valid SavedPreset, or null when it can't be one. */
export function mergePreset(raw: unknown): SavedPreset | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o || typeof o.id !== 'string' || !ID.test(o.id)) return null;
  const name = cleanName(o.name);
  if (!name) return null;
  return {
    id: o.id,
    name,
    adjust: mergeAdjust(o.adjust),
    created: typeof o.created === 'number' && Number.isFinite(o.created) ? o.created : 0,
  };
}

/** name, or "name (2)", "name (3)" … : the first one no preset in taken has. */
export function uniqueName(name: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((n) => n.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 2; ; i++) {
    const suffix = ` (${i})`,
      n = `${name.slice(0, PRESET_NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!lower.has(n.toLowerCase())) return n;
  }
}

/** True when two presets would make the same picture. */
export const sameSettings = (a: Adjustments, b: Adjustments): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The preset file: the presets (without their storage ids) and the LUTs they use. */
export function presetFile(presets: readonly SavedPreset[], luts: readonly Lut[]): string {
  return JSON.stringify({
    format: PRESET_FORMAT,
    version: 1,
    presets: presets.map((p) => ({ name: p.name, adjust: p.adjust })),
    luts: luts.map(lutToJson),
  });
}

/**
 * Reads a preset file. Throws a PresetError (message fit for the user) when it isn't one; LUTs that are damaged are
 * left out, and presets using them still load (they show the LUT as missing).
 */
export function readPresetFile(text: string): { presets: { name: string; adjust: Adjustments }[]; luts: Lut[] } {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new PresetError('This isn’t a preset file (it isn’t JSON).');
  }
  const f = o && typeof o === 'object' ? (o as Record<string, unknown>) : {};
  if (f.format !== PRESET_FORMAT || !Array.isArray(f.presets))
    throw new PresetError('This isn’t a Chitthi Studio preset file.');
  if (typeof f.version === 'number' && f.version > 1)
    throw new PresetError('This preset file is from a newer version of Chitthi Studio.');
  if (f.presets.length > PRESET_FILE_MAX)
    throw new PresetError(
      `The file holds ${f.presets.length} presets; at most ${PRESET_FILE_MAX} can be imported at once.`,
    );
  const presets = f.presets.flatMap((p: unknown) => {
    const r = p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
    const name = cleanName(r.name);
    return name ? [{ name, adjust: mergeAdjust(r.adjust) }] : [];
  });
  const luts = (Array.isArray(f.luts) ? f.luts.slice(0, PRESET_FILE_MAX) : []).flatMap((l: unknown) => {
    try {
      return [lutFromJson(l)];
    } catch {
      return [];
    }
  });
  return { presets, luts };
}
