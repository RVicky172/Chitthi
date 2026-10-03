import { useSyncExternalStore } from 'react';
import { addLut, LUT_MAX_BYTES, lutById, LutError, parseCube, removeLut, type Lut } from '../engine/lut';

/*
 * LUTs the user imports (.cube files, P1.4), kept on this device in their own IndexedDB database, in the browser and in
 * the desktop app alike (as uploaded fonts are, lib/userFonts.ts). The list of names loads when an editor opens; a
 * table's numbers load only when it is chosen, then stay in memory (engine/lut.ts) for the renderers. Without
 * IndexedDB (a private window that blocks it) imports still work until the page closes.
 */

export interface LutMeta {
  id: string;
  title: string;
  size: number;
  added: number;
}

interface LutRecord {
  id: string;
  data: Float32Array;
  min: [number, number, number];
  max: [number, number, number];
}

const DB = 'chitthi-luts';
let list: LutMeta[] = [];
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const publish = (next: LutMeta[]) => {
  list = next;
  subs.forEach((f) => f());
};

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    if (!('indexedDB' in window)) return fail(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('meta', { keyPath: 'id' });
      r.result.createObjectStore('data', { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function tx<T>(
  store: 'meta' | 'data',
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((ok, fail) => {
    const t = db.transaction(store, mode),
      req = fn(t.objectStore(store));
    t.oncomplete = () => ok(req.result);
    t.onerror = t.onabort = () => fail(t.error);
  });
}

const sorted = (l: LutMeta[]) => [...l].sort((a, b) => a.title.localeCompare(b.title));

/** Reads the names of the stored LUTs, once. */
export function loadLutLibrary(): Promise<void> {
  loading ??= tx<LutMeta[]>('meta', 'readonly', (s) => s.getAll())
    .then((stored) => publish(sorted([...stored, ...list.filter((m) => !stored.some((x) => x.id === m.id))])))
    .catch(() => undefined);
  return loading;
}

/** The stored LUTs, by name; re-renders when one is added or removed. */
export function useLutLibrary(): LutMeta[] {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => list,
  );
}

/**
 * Reads a .cube file, keeps it in the library and loads it for the renderers. Throws a LutError (with a message for
 * the user) when the file isn't a usable 3D LUT. Importing the same table again returns the one already there.
 */
export async function importCube(file: File): Promise<Lut> {
  if (file.size > LUT_MAX_BYTES)
    throw new LutError(`That file is over ${LUT_MAX_BYTES / 1048576} MB; a 65³ LUT is about 9 MB.`);
  const lut = parseCube(await file.text(), file.name);
  await keepLut(lut);
  return lut;
}

/** Loads a LUT for the renderers and keeps it in the library (from a .cube file, or a preset file's LUTs). */
export async function keepLut(lut: Lut): Promise<void> {
  addLut(lut);
  if (!list.some((m) => m.id === lut.id)) {
    const meta: LutMeta = { id: lut.id, title: lut.title, size: lut.size, added: Date.now() };
    publish(sorted([...list, meta]));
    const rec: LutRecord = { id: lut.id, data: lut.data, min: lut.min, max: lut.max };
    // Stored best-effort: without storage the LUT still works until the page closes.
    await tx('data', 'readwrite', (s) => s.put(rec))
      .then(() => tx('meta', 'readwrite', (s) => s.put(meta)))
      .catch(() => undefined);
  }
}

/** Makes sure a stored LUT's table is loaded; resolves to it, or undefined when it is no longer stored. */
export async function ensureLut(id: string): Promise<Lut | undefined> {
  const hit = lutById(id);
  if (hit) return hit;
  const meta = list.find((m) => m.id === id);
  const rec = await tx<LutRecord | undefined>('data', 'readonly', (s) => s.get(id)).catch(() => undefined);
  if (!meta || !rec) return undefined;
  const lut: Lut = { id, title: meta.title, size: meta.size, data: rec.data, min: rec.min, max: rec.max };
  addLut(lut);
  return lut;
}

/** Removes a LUT from the library. Photos and clips that use it show without it from then on. */
export async function forgetLut(id: string): Promise<void> {
  publish(list.filter((m) => m.id !== id));
  removeLut(id);
  await tx('data', 'readwrite', (s) => s.delete(id))
    .then(() => tx('meta', 'readwrite', (s) => s.delete(id)))
    .catch(() => undefined);
}
