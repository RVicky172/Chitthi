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
const subs = new Set<() => void>();
const publish = (next: SavedPreset[]) => {
  list = [...next].sort((a, b) => a.name.localeCompare(b.name));
  subs.forEach((f) => f());
};
const store = (p: SavedPreset) => db.presetPut(p).catch(() => undefined);

/** Reads the saved presets, once. */
export function loadPresets(): Promise<void> {
  loading ??= db
    .presetAll()
    .then((stored) => {
      const ok = stored.map(mergePreset).filter((p): p is SavedPreset => !!p);
      publish([...ok, ...list.filter((p) => !ok.some((x) => x.id === p.id))]);
    })
    .catch(() => undefined);
  return loading;
}

export const getPresets = () => list;

/** The saved presets, by name. */
export function usePresets(): SavedPreset[] {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => list,
  );
}

/** Saves these colour settings under a name (made unique). Returns the preset, or null for an empty name. */
export async function savePreset(name: string, adjust: Adjustments): Promise<SavedPreset | null> {
  const n = cleanName(name);
  if (!n) return null;
  const p: SavedPreset = {
    id: presetId(),
    name: uniqueName(
      n,
      list.map((x) => x.name),
    ),
    adjust: { ...adjust },
    created: Date.now(),
  };
  publish([...list, p]);
  await store(p);
  return p;
}

/** Renames a preset; an empty name leaves it as it was. Returns the name it ends up with. */
export async function renamePreset(id: string, name: string): Promise<string> {
  const p = list.find((x) => x.id === id);
  const n = cleanName(name);
  if (!p) return '';
  if (!n || n === p.name) return p.name;
  const next = {
    ...p,
    name: uniqueName(
      n,
      list.filter((x) => x.id !== id).map((x) => x.name),
    ),
  };
  publish(list.map((x) => (x.id === id ? next : x)));
  await store(next);
  return next.name;
}

export async function deletePreset(id: string): Promise<void> {
  publish(list.filter((x) => x.id !== id));
  await db.presetDel(id).catch(() => undefined);
}

/** The preset file for these presets (all saved ones by default), with the LUTs they use that are on this device. */
export async function exportPresets(presets: readonly SavedPreset[] = list): Promise<string> {
  const ids = [...new Set(presets.map((p) => p.adjust.lut).filter(Boolean))];
  const luts = (await Promise.all(ids.map((id) => ensureLut(id).catch(() => undefined)))).filter((l): l is Lut => !!l);
  return presetFile(presets, luts);
}

/**
 * Adds the presets of a preset file and keeps its LUTs. A preset whose name and settings match one already saved is
 * skipped; one whose name alone is taken gets a number. Throws a PresetError when the file isn't a preset file.
 */
export async function importPresets(file: File): Promise<{ added: number; skipped: number; luts: number }> {
  if (file.size > PRESET_FILE_BYTES) throw new PresetError(`That file is over ${PRESET_FILE_BYTES / 1048576} MB.`);
  const { presets, luts } = readPresetFile(await file.text());
  if (!presets.length) throw new PresetError('The file holds no presets.');
  await loadPresets();
  for (const l of luts) await keepLut(l);
  let added = 0,
    skipped = 0;
  const next = [...list];
  for (const p of presets) {
    if (next.some((x) => x.name.toLowerCase() === p.name.toLowerCase() && sameSettings(x.adjust, p.adjust))) {
      skipped++;
      continue;
    }
    const saved: SavedPreset = {
      id: presetId(),
      name: uniqueName(
        p.name,
        next.map((x) => x.name),
      ),
      adjust: p.adjust,
      created: Date.now(),
    };
    next.push(saved);
    added++;
    await store(saved);
  }
  publish(next);
  return { added, skipped, luts: luts.length };
}
