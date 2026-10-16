import { useEffect, useState } from 'react';
import { FONT_MAP, USER_FONT_INDEX, USER_FONTS, userFontDef } from '../data/fonts';
import { isObjectLike } from '../engine/guards';
import type { FontDef } from '../types';
import { openDatabase, runRequest } from './idb';

/*
 * Fonts the user uploads (TTF, OTF, WOFF, WOFF2). Kept on this device in their own IndexedDB database (in the browser
 * and in the desktop app alike) and registered with the FontFace API, so they work in previews and print files like
 * any built-in family. The family name comes from the file name.
 */

/** An uploaded font as stored. */
interface UserFont {
  /** The family name (the store's key). */
  family: string;
  /** The uploaded file's name. */
  file: string;
  data: ArrayBuffer;
  /** When it was uploaded, ms since 1970. */
  added: number;
}

/** The fonts' own database and its store. */
const DATABASE = 'chitthi-fonts';
const STORE = 'fonts';
/** The event sent when a font is added or removed. */
const CHANGE_EVENT = 'chitthi:userfonts';
/** The largest font file accepted, in MB. */
const MAX_MB = 10;
const faces = new Map<string, FontFace>();
let loading: Promise<void> | null = null;

/**
 * Runs one request on the fonts store.
 * @param mode read only or read-write
 * @param makeRequest makes the request on the store
 * @returns the request's result (unchecked)
 */
async function run(mode: IDBTransactionMode, makeRequest: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const database = await openDatabase(DATABASE, 1, (request) => request.result.createObjectStore(STORE, { keyPath: 'family' }));
  return runRequest(database, STORE, mode, makeRequest);
}

/**
 * Whether a stored record is a usable font.
 * @param value a record from the fonts store
 * @returns true when it has a family name and the file's bytes
 */
function isUserFont(value: unknown): value is UserFont {
  return isObjectLike(value) && typeof value.family === 'string' && value.data instanceof ArrayBuffer;
}

/** Remembers the uploaded families' names (data/fonts.ts reads them at start-up) and tells the app. */
function saveIndex(): void {
  try {
    localStorage.setItem(USER_FONT_INDEX, JSON.stringify([...USER_FONTS.keys()]));
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Registers a font with the page (once), so previews and print files can draw with it.
 * @param font the stored font
 */
async function register(font: UserFont): Promise<void> {
  if (faces.has(font.family)) return;
  const face = new FontFace(font.family, font.data);
  await face.load();
  document.fonts.add(face);
  faces.set(font.family, face);
  USER_FONTS.set(font.family, userFontDef(font.family));
}

/**
 * Reads every stored font once and makes it available to the page and the canvas.
 * @returns resolves once they are registered (or storage failed)
 */
export function loadUserFonts(): Promise<void> {
  loading ??= run('readonly', (store) => store.getAll())
    .then(async (stored) => {
      const fonts = Array.isArray(stored) ? stored.filter(isUserFont) : [];
      const families = new Set(fonts.map((font) => font.family));
      // Drop names whose file is gone (for example after the browser cleared site data).
      for (const family of [...USER_FONTS.keys()]) if (!families.has(family)) USER_FONTS.delete(family);
      await Promise.all(fonts.map((font) => register(font).catch(() => undefined)));
      saveIndex();
    })
    .catch(() => undefined);
  return loading;
}

/**
 * The family name for an uploaded file: "my-font_Bold.ttf" → "My Font Bold"; built-in names get a suffix so both stay
 * usable.
 * @param file the file name
 * @returns the family name (up to 40 characters; "My font" when nothing is left)
 */
function familyFrom(file: string): string {
  const family =
    file
      .replace(/\.(ttf|otf|woff2?|)$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .slice(0, 40) || 'My font';
  return FONT_MAP[family] ? `${family} (mine)` : family;
}

/**
 * Validates, stores and registers an uploaded font file.
 * @param file the uploaded file
 * @returns its family name
 * @throws when the file isn't a font this browser can read, or is too large
 */
export async function addUserFont(file: File): Promise<string> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error(`${file.name}: use a TTF, OTF, WOFF or WOFF2 font file.`);
  if (file.size > MAX_MB * 1048576) throw new Error(`${file.name} is larger than ${MAX_MB} MB.`);
  const data = await file.arrayBuffer();
  const family = familyFrom(file.name);
  try {
    // Loading first proves the file is a font the browser can use.
    const test = new FontFace(`chitthi-test-${Date.now()}`, data.slice(0));
    await test.load();
  } catch {
    throw new Error(`${file.name} isn’t a font this browser can read.`);
  }
  faces.delete(family);
  const font: UserFont = { family, file: file.name, data, added: Date.now() };
  await run('readwrite', (store) => store.put(font));
  await register(font);
  saveIndex();
  return family;
}

/**
 * Removes an uploaded font from storage and from the page.
 * @param family its family name
 */
export async function removeUserFont(family: string): Promise<void> {
  await run('readwrite', (store) => store.delete(family));
  const face = faces.get(family);
  if (face) document.fonts.delete(face);
  faces.delete(family);
  USER_FONTS.delete(family);
  saveIndex();
}

/**
 * The uploaded fonts, refreshed when one is added or removed.
 * @returns their definitions
 */
export function useUserFonts(): FontDef[] {
  const [list, setList] = useState(() => [...USER_FONTS.values()]);
  useEffect(() => {
    const sync = () => setList([...USER_FONTS.values()]);
    void loadUserFonts().then(sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);
  return list;
}
