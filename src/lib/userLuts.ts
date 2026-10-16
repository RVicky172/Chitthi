import { useSyncExternalStore } from 'react';
import { isObjectLike } from '../engine/guards';
import { addLut, LUT_MAX_BYTES, lutById, LutError, parseCube, removeLut, type Lut } from '../engine/lut';
import { openDatabase, runRequest } from './idb';

/*
 * LUTs the user imports (.cube files, P1.4), kept on this device in their own IndexedDB database, in the browser and in
 * the desktop app alike (as uploaded fonts are, lib/userFonts.ts). The list of names loads when an editor opens; a
 * table's numbers load only when it is chosen, then stay in memory (engine/lut.ts) for the renderers. Without
 * IndexedDB (a private window that blocks it) imports still work until the page closes.
 */

/** A stored LUT's name and size (the list loads these; the table loads when chosen). */
export interface LutMeta {
  id: string;
  title: string;
  /** Points per side of the cube. */
  size: number;
  /** When it was imported, ms since 1970. */
  added: number;
}

/** A stored LUT's table. */
interface LutRecord {
  id: string;
  data: Float32Array;
  min: [number, number, number];
  max: [number, number, number];
}

/** The LUTs' own database: `meta` holds the names, `data` the tables. */
const DATABASE = 'chitthi-luts';
let list: LutMeta[] = [];
let loading: Promise<void> | null = null;
const subscribers = new Set<() => void>();

/**
 * Replaces the library's list and tells the subscribers.
 * @param next the new list
 */
function publish(next: LutMeta[]): void {
  list = next;
  subscribers.forEach((notify) => notify());
}

/**
 * Creates the two stores of a new database.
 * @param request the open request
 */
function createStores(request: IDBOpenDBRequest): void {
  request.result.createObjectStore('meta', { keyPath: 'id' });
  request.result.createObjectStore('data', { keyPath: 'id' });
}

/**
 * Runs one request on a store of the LUT database.
 * @param storeName names or tables
 * @param mode read only or read-write
 * @param makeRequest makes the request on the store
 * @returns the request's result (unchecked)
 */
async function run(storeName: 'meta' | 'data', mode: IDBTransactionMode, makeRequest: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return runRequest(await openDatabase(DATABASE, 1, createStores), storeName, mode, makeRequest);
}

/**
 * Whether a stored record is a LUT's name and size.
 * @param value a record from the meta store
 * @returns true when it has an id, a title and a size
 */
function isLutMeta(value: unknown): value is LutMeta {
  return isObjectLike(value) && typeof value.id === 'string' && typeof value.title === 'string' && typeof value.size === 'number';
}

/**
 * Whether a stored record is a LUT's table.
 * @param value a record from the data store
 * @returns true when it has its numbers and its range
 */
function isLutRecord(value: unknown): value is LutRecord {
  return isObjectLike(value) && value.data instanceof Float32Array && Array.isArray(value.min) && Array.isArray(value.max);
}

/**
 * The list in title order.
 * @param metas the LUTs
 * @returns a sorted copy
 */
const sorted = (metas: LutMeta[]): LutMeta[] => metas.toSorted((first, second) => first.title.localeCompare(second.title));

/**
 * Reads the names of the stored LUTs, once.
 * @returns resolves once the list is published (or storage failed)
 */
export function loadLutLibrary(): Promise<void> {
  loading ??= run('meta', 'readonly', (store) => store.getAll())
    .then((records) => {
      const stored = Array.isArray(records) ? records.filter(isLutMeta) : [];
      publish(sorted([...stored, ...list.filter((meta) => !stored.some((storedMeta) => storedMeta.id === meta.id))]));
    })
    .catch(() => undefined);
  return loading;
}

/**
 * The stored LUTs, by name (once loadLutLibrary() has read them).
 * @returns the list
 */
export const getLutLibrary = (): LutMeta[] => list;

/**
 * Subscribes to the library.
 * @param notify called when a LUT is added or removed
 * @returns the unsubscribe function
 */
function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

/**
 * The stored LUTs, by name; re-renders when one is added or removed.
 * @returns the list
 */
export function useLutLibrary(): LutMeta[] {
  return useSyncExternalStore(subscribe, getLutLibrary);
}

/**
 * Reads a .cube file, keeps it in the library and loads it for the renderers. Importing the same table again returns
 * the one already there.
 * @param file the .cube file
 * @returns the LUT
 * @throws LutError (with a message for the user) when the file isn't a usable 3D LUT
 */
export async function importCube(file: File): Promise<Lut> {
  if (file.size > LUT_MAX_BYTES) throw new LutError(`That file is over ${LUT_MAX_BYTES / 1048576} MB; a 65³ LUT is about 9 MB.`);
  const lut = parseCube(await file.text(), file.name);
  await keepLut(lut);
  return lut;
}

/**
 * Loads a LUT for the renderers and keeps it in the library (from a .cube file, or a preset file's LUTs).
 * @param lut the LUT
 */
export async function keepLut(lut: Lut): Promise<void> {
  addLut(lut);
  if (list.some((meta) => meta.id === lut.id)) return;
  const meta: LutMeta = { id: lut.id, title: lut.title, size: lut.size, added: Date.now() };
  publish(sorted([...list, meta]));
  const record: LutRecord = { id: lut.id, data: lut.data, min: lut.min, max: lut.max };
  // Stored best-effort: without storage the LUT still works until the page closes.
  await run('data', 'readwrite', (store) => store.put(record))
    .then(() => run('meta', 'readwrite', (store) => store.put(meta)))
    .catch(() => undefined);
}

/**
 * Makes sure a stored LUT's table is loaded.
 * @param id the LUT
 * @returns the LUT, or undefined when it is no longer stored
 */
export async function ensureLut(id: string): Promise<Lut | undefined> {
  const hit = lutById(id);
  if (hit) return hit;
  const meta = list.find((listed) => listed.id === id);
  const record = await run('data', 'readonly', (store) => store.get(id)).catch(() => undefined);
  if (!meta || !isLutRecord(record)) return undefined;
  const lut: Lut = { id, title: meta.title, size: meta.size, data: record.data, min: record.min, max: record.max };
  addLut(lut);
  return lut;
}

/**
 * Removes a LUT from the library. Photos and clips that use it show without it from then on.
 * @param id the LUT
 */
export async function forgetLut(id: string): Promise<void> {
  publish(list.filter((meta) => meta.id !== id));
  removeLut(id);
  await run('data', 'readwrite', (store) => store.delete(id))
    .then(() => run('meta', 'readwrite', (store) => store.delete(id)))
    .catch(() => undefined);
}
