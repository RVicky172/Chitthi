import { useSyncExternalStore } from 'react';
import type { Adjustments } from '../engine/adjust';
import type { Lut } from '../engine/lut';
import {
  cleanName,
  mergePreset,
  PRESET_FILE_BYTES,
  PresetError,
  presetFile,
  presetId,
  readPresetFile,
  sameSettings,
  uniqueName,
  type SavedPreset,
} from '../engine/presets';
import { db } from '../lib/db';
import { ensureLut, keepLut } from '../lib/userLuts';

/*
 * Saved presets (P1.5), shared by the photo and video editors: the list in memory, kept in step with storage
 * (lib/db.ts: IndexedDB in the browser, library/presets/ in the desktop app's data folder). Everything read back goes
 * through mergePreset(). Without storage (a private window that blocks it) presets still work until the page closes.
 */

let list: SavedPreset[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/**
 * Replace the list (kept sorted by name) and tell the listeners.
 * @param next the presets
 */
const publish = (next: SavedPreset[]) => {
  list = [...next].sort((first, second) => first.name.localeCompare(second.name));
  listeners.forEach((listener) => {
    listener();
  });
};

/**
 * Save a preset to storage; without storage it lasts until the page closes.
 * @param preset the preset
 * @returns when it is written (never rejects)
 */
const store = (preset: SavedPreset) => db.presetPut(preset).catch(() => undefined);

/**
 * Reads the saved presets, once.
 * @returns when they are in the list (never rejects: without storage the list stays as it is)
 */
export function loadPresets(): Promise<void> {
  loading ??= db
    .presetAll()
    .then((stored) => {
      const valid = stored.map(mergePreset).filter((preset): preset is SavedPreset => !!preset);
      publish([...valid, ...list.filter((preset) => !valid.some((saved) => saved.id === preset.id))]);
    })
    .catch(() => undefined);
  return loading;
}

/**
 * The saved presets now, by name (components use `usePresets`).
 * @returns the list
 */
export const getPresets = () => list;

/**
 * The saved presets, by name.
 * @returns the list; the component re-renders when it changes
 */
export function usePresets(): SavedPreset[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => list,
  );
}

/**
 * The names of presets, for making a name unique.
 * @param presets the presets
 * @returns their names
 */
const namesOf = (presets: readonly SavedPreset[]) => presets.map((preset) => preset.name);

/**
 * Saves these colour settings under a name (made unique).
 * @param name the name typed
 * @param adjust the colour settings
 * @returns the preset, or null for an empty name
 */
export async function savePreset(name: string, adjust: Adjustments): Promise<SavedPreset | null> {
  const cleaned = cleanName(name);
  if (!cleaned) return null;
  const preset: SavedPreset = { id: presetId(), name: uniqueName(cleaned, namesOf(list)), adjust: { ...adjust }, created: Date.now() };
  publish([...list, preset]);
  await store(preset);
  return preset;
}

/**
 * Renames a preset; an empty name leaves it as it was.
 * @param id the preset
 * @param name the new name typed
 * @returns the name it ends up with ('' when there is no such preset)
 */
export async function renamePreset(id: string, name: string): Promise<string> {
  const preset = list.find((saved) => saved.id === id);
  const cleaned = cleanName(name);
  if (!preset) return '';
  if (!cleaned || cleaned === preset.name) return preset.name;
  const next = { ...preset, name: uniqueName(cleaned, namesOf(list.filter((saved) => saved.id !== id))) };
  publish(list.map((saved) => (saved.id === id ? next : saved)));
  await store(next);
  return next.name;
}

/**
 * Delete a preset.
 * @param id the preset
 */
export async function deletePreset(id: string): Promise<void> {
  publish(list.filter((saved) => saved.id !== id));
  await db.presetDel(id).catch(() => undefined);
}

/**
 * The preset file for these presets, with the LUTs they use that are on this device.
 * @param presets the presets (all saved ones by default)
 * @returns the file's text
 */
export async function exportPresets(presets: readonly SavedPreset[] = list): Promise<string> {
  const ids = [...new Set(presets.map((preset) => preset.adjust.lut).filter(Boolean))];
  const luts = (await Promise.all(ids.map((id) => ensureLut(id).catch(() => undefined)))).filter((lut): lut is Lut => !!lut);
  return presetFile(presets, luts);
}

/** What importing a preset file did. */
export interface PresetImport {
  added: number;
  /** Presets left out because one with the same name and settings is saved. */
  skipped: number;
  /** LUTs the file brought. */
  luts: number;
}

/**
 * Adds the presets of a preset file and keeps its LUTs. A preset whose name and settings match one already saved is
 * skipped; one whose name alone is taken gets a number.
 * @param file the chosen file
 * @returns how many were added and skipped, and the LUTs kept
 * @throws {PresetError} when the file is too big or isn't a preset file
 */
export async function importPresets(file: File): Promise<PresetImport> {
  if (file.size > PRESET_FILE_BYTES) throw new PresetError(`That file is over ${PRESET_FILE_BYTES / 1048576} MB.`);
  const { presets, luts } = readPresetFile(await file.text());
  if (!presets.length) throw new PresetError('The file holds no presets.');
  await loadPresets();
  for (const lut of luts) await keepLut(lut);
  let added = 0,
    skipped = 0;
  const next = [...list];
  for (const preset of presets) {
    const lowerName = preset.name.toLowerCase();
    if (next.some((saved) => saved.name.toLowerCase() === lowerName && sameSettings(saved.adjust, preset.adjust))) {
      skipped++;
      continue;
    }
    const saved: SavedPreset = { id: presetId(), name: uniqueName(preset.name, namesOf(next)), adjust: preset.adjust, created: Date.now() };
    next.push(saved);
    added++;
    await store(saved);
  }
  publish(next);
  return { added, skipped, luts: luts.length };
}
