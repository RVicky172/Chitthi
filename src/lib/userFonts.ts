import { useEffect, useState } from 'react';
import { FONT_MAP, USER_FONT_INDEX, USER_FONTS, userFontDef } from '../data/fonts';
import type { FontDef } from '../types';

/*
 * Fonts the user uploads (TTF, OTF, WOFF, WOFF2). Kept on this device in their own IndexedDB database (in the browser
 * and in the desktop app alike) and registered with the FontFace API, so they work in previews and print files like
 * any built-in family. The family name comes from the file name.
 */

interface UserFont {
  family: string;
  file: string;
  data: ArrayBuffer;
  added: number;
}

const DB = 'chitthi-fonts',
  STORE = 'fonts',
  EVT = 'chitthi:userfonts',
  MAX_MB = 10;
const faces = new Map<string, FontFace>();
let loading: Promise<void> | null = null;

function open(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    if (!('indexedDB' in window)) return fail(new Error('IndexedDB unavailable'));
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'family' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((ok, fail) => {
    const t = db.transaction(STORE, mode),
      req = fn(t.objectStore(STORE));
    t.oncomplete = () => ok(req.result);
    t.onerror = t.onabort = () => fail(t.error);
  });
}

function saveIndex(): void {
  try {
    localStorage.setItem(USER_FONT_INDEX, JSON.stringify([...USER_FONTS.keys()]));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(EVT));
}

async function register(f: UserFont): Promise<void> {
  if (faces.has(f.family)) return;
  const face = new FontFace(f.family, f.data);
  await face.load();
  document.fonts.add(face);
  faces.set(f.family, face);
  USER_FONTS.set(f.family, userFontDef(f.family));
}

/** Reads every stored font once and makes it available to the page and the canvas. */
export function loadUserFonts(): Promise<void> {
  loading ??= tx<UserFont[]>('readonly', (s) => s.getAll())
    .then(async (list) => {
      const names = new Set(list.map((f) => f.family));
      // Drop names whose file is gone (for example after the browser cleared site data).
      for (const n of [...USER_FONTS.keys()]) if (!names.has(n)) USER_FONTS.delete(n);
      await Promise.all(list.map((f) => register(f).catch(() => undefined)));
      saveIndex();
    })
    .catch(() => undefined);
  return loading;
}

/** "my-font_Bold.ttf" → "My Font Bold"; built-in names get a suffix so both stay usable. */
function familyFrom(file: string): string {
  let n = file
    .replace(/\.(ttf|otf|woff2?|)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 40) || 'My font';
  if (FONT_MAP[n]) n = `${n} (mine)`;
  return n;
}

/** Validates, stores and registers an uploaded font file; returns its family name. */
export async function addUserFont(file: File): Promise<string> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error(`${file.name}: use a TTF, OTF, WOFF or WOFF2 font file.`);
  if (file.size > MAX_MB * 1048576) throw new Error(`${file.name} is larger than ${MAX_MB} MB.`);
  const data = await file.arrayBuffer(),
    family = familyFrom(file.name);
  try {
    // Loading first proves the file is a font the browser can use.
    const test = new FontFace(`chitthi-test-${Date.now()}`, data.slice(0));
    await test.load();
  } catch {
    throw new Error(`${file.name} isn’t a font this browser can read.`);
  }
  faces.delete(family);
  const rec: UserFont = { family, file: file.name, data, added: Date.now() };
  await tx('readwrite', (s) => s.put(rec));
  await register(rec);
  saveIndex();
  return family;
}

export async function removeUserFont(family: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(family));
  const face = faces.get(family);
  if (face) document.fonts.delete(face);
  faces.delete(family);
  USER_FONTS.delete(family);
  saveIndex();
}

/** The uploaded fonts, refreshed when one is added or removed. */
export function useUserFonts(): FontDef[] {
  const [list, setList] = useState(() => [...USER_FONTS.values()]);
  useEffect(() => {
    const sync = () => setList([...USER_FONTS.values()]);
    void loadUserFonts().then(sync);
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  return list;
}
