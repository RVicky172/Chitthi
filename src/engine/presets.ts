import { IG_FILTERS } from '../data/instagram';
import { mergeAdjust, type Adjustments } from './adjust';
import { isObjectLike, keysOf } from './guards';
import { lutFromJson, lutToJson, type Lut } from './lut';

/*
 * Saved presets (P1.5): a name and a full set of colour settings, saved from a photo or clip and applied to others.
 * Stored on the device (state/presets.ts: IndexedDB in the browser, the data folder in the desktop app) and moved
 * between devices as a preset file: JSON holding the presets and the LUTs they use, so a preset with a LUT works on
 * a device that never imported it. Everything read from storage or a file goes through mergePreset() / readPresetFile(),
 * whose colour settings go through mergeAdjust() (the gate mergeEdit() uses for colour).
 */

/** A preset as stored on the device. */
export interface SavedPreset {
  /** The storage key; same pattern as the desktop app's file names. */
  id: string;
  name: string;
  adjust: Adjustments;
  /** When it was saved, ms since 1970 (0 when unknown). */
  created: number;
}

/** A preset read from a preset file: it has no storage id yet. */
export interface FilePreset {
  name: string;
  adjust: Adjustments;
}

/** What a preset file holds. */
export interface PresetFileContents {
  presets: FilePreset[];
  luts: Lut[];
}

/** A preset name's longest length, characters. */
export const PRESET_NAME_MAX = 60;
/** At most this many presets in one file, and files of at most this size (a 65³ LUT is about 4.4 MB in one). */
export const PRESET_FILE_MAX = 500;
/** A preset file's largest size, bytes. */
export const PRESET_FILE_BYTES = 64 * 1024 * 1024;
/** The `format` field of a preset file. */
export const PRESET_FORMAT = 'chitthi-presets';

/** A valid storage id. */
const ID = /^[A-Za-z0-9_-]{1,100}$/;

/** A preset file that can't be read; its message is fit for the user. */
export class PresetError extends Error {}

/**
 * A name fit to show and store.
 * @param value a typed or saved name
 * @returns spaces collapsed, trimmed, at most PRESET_NAME_MAX characters; '' if nothing is left
 */
export const cleanName = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, PRESET_NAME_MAX).trim() : '';

/**
 * A new storage id.
 * @returns "p", the time and six random letters or digits
 */
export const presetId = (): string => {
  const random = crypto.getRandomValues(new Uint32Array(1)).at(0) ?? 0;
  return `p${Date.now().toString(36)}${random.toString(36).padStart(6, '0').slice(-6)}`;
};

/**
 * The single gate for a stored preset.
 * @param raw anything read from storage
 * @returns a complete, valid preset, or null when it can't be one
 */
export function mergePreset(raw: unknown): SavedPreset | null {
  if (!isObjectLike(raw) || typeof raw.id !== 'string' || !ID.test(raw.id)) return null;
  const name = cleanName(raw.name);
  if (!name) return null;
  return {
    id: raw.id,
    name,
    adjust: mergeAdjust(raw.adjust),
    created: typeof raw.created === 'number' && Number.isFinite(raw.created) ? raw.created : 0,
  };
}

/**
 * A name no other preset has.
 * @param name the wanted name
 * @param taken the other presets' names
 * @returns the name, or "name (2)", "name (3)" …: the first one not taken (case aside)
 */
export function uniqueName(name: string, taken: readonly string[]): string {
  const lower = new Set(taken.map((takenName) => takenName.toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let number = 2; ; number++) {
    const suffix = ` (${number})`;
    const candidate = `${name.slice(0, PRESET_NAME_MAX - suffix.length).trim()}${suffix}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Whether two presets would make the same picture.
 * @param first one preset's settings
 * @param second the other's
 * @returns true when every setting is the same
 */
export const sameSettings = (first: Adjustments, second: Adjustments): boolean => JSON.stringify(first) === JSON.stringify(second);

/**
 * The preset file.
 * @param presets the presets to share
 * @param luts the LUTs they use
 * @returns JSON: the presets (without their storage ids) and the LUTs
 */
export function presetFile(presets: readonly SavedPreset[], luts: readonly Lut[]): string {
  return JSON.stringify({
    format: PRESET_FORMAT,
    version: 1,
    presets: presets.map((preset) => ({ name: preset.name, adjust: preset.adjust })),
    luts: luts.map(lutToJson),
  });
}

/**
 * A preset file's presets: those with a name, their colour settings through the gate.
 * @param entries the file's `presets` array
 * @returns the presets
 */
function filePresets(entries: readonly unknown[]): FilePreset[] {
  return entries.flatMap((entry) => {
    const fields = isObjectLike(entry) ? entry : {};
    const name = cleanName(fields.name);
    return name ? [{ name, adjust: mergeAdjust(fields.adjust) }] : [];
  });
}

/**
 * A preset file's LUTs; damaged ones are left out.
 * @param entries the file's `luts` field
 * @returns the LUTs that could be read, at most PRESET_FILE_MAX
 */
function fileLuts(entries: unknown): Lut[] {
  return (Array.isArray(entries) ? entries.slice(0, PRESET_FILE_MAX) : []).flatMap((entry: unknown) => {
    try {
      return [lutFromJson(entry)];
    } catch {
      return [];
    }
  });
}

/**
 * Reads a preset file. LUTs that are damaged are left out, and presets using them still load (they show the LUT as
 * missing).
 * @param text the file's text
 * @returns its presets and LUTs
 * @throws PresetError, with a message fit for the user, when it isn't a preset file this version can read
 */
export function readPresetFile(text: string): PresetFileContents {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new PresetError('This isn’t a preset file (it isn’t JSON).');
  }
  const file = isObjectLike(parsed) ? parsed : {};
  if (file.format !== PRESET_FORMAT || !Array.isArray(file.presets)) throw new PresetError('This isn’t a Chitthi Studio preset file.');
  if (typeof file.version === 'number' && file.version > 1) throw new PresetError('This preset file is from a newer version of Chitthi Studio.');
  if (file.presets.length > PRESET_FILE_MAX)
    throw new PresetError(`The file holds ${file.presets.length} presets; at most ${PRESET_FILE_MAX} can be imported at once.`);
  return { presets: filePresets(file.presets), luts: fileLuts(file.luts) };
}

/** A named set of colour settings: only the settings it holds are applied, the rest are kept (as in Lightroom). */
export interface ColourPreset {
  /** `look:<look id>` for the built-in presets. */
  id: string;
  /** The name shown in the look picker. */
  name: string;
  /** The settings it sets; a built-in preset holds just a look, so it keeps every slider. */
  adjust: Partial<Adjustments>;
}

/** The ready-made looks, as presets (P1.4). */
export const BUILT_IN_PRESETS: readonly ColourPreset[] = IG_FILTERS.map(([look, name]) => ({
  id: `look:${look}`,
  name,
  adjust: { look },
}));

/**
 * Whether a photo's settings already hold everything a preset sets.
 * @param adjust the photo's or clip's colour settings
 * @param preset the preset
 * @returns true when applying the preset would change nothing
 */
export const presetApplied = (adjust: Adjustments, preset: ColourPreset): boolean =>
  keysOf(preset.adjust).every((key) => JSON.stringify(adjust[key]) === JSON.stringify(preset.adjust[key]));
