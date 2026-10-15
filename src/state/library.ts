import { useEffect, useState } from 'react';
import { slotCount } from '../engine/layout';
import { analyzeImage } from '../engine/analyze';
import { loadImage, makePhoto, maxPhotos } from '../engine/photo';
import { db } from '../lib/db';
import { newRecordId } from '../lib/ids';
import { photoKey } from '../lib/photoKey';
import { logError } from '../lib/errors';
import { toast } from '../lib/toast';
import type { Photo, StoredPhoto } from '../types';
import { placePhoto, selectSlot } from './photoSlots';
import { getState, setPhotos } from './store';

/*
 * Photo store: every photo the user uploads is kept in this browser (IndexedDB), across cards and reloads.
 * Tapping a stored photo puts it straight onto the current card.
 */

const LIBRARY_EVENT = 'chitthi:library';
const changed = () => window.dispatchEvent(new Event(LIBRARY_EVENT));

const THUMB = 320;

/**
 * A small JPEG of an image for lists (≤ 320 px on the long side).
 * @param img the decoded image
 * @returns the JPEG as a data URL
 */
function thumbOf(img: HTMLImageElement): string {
  const width = img.naturalWidth,
    height = img.naturalHeight,
    scale = Math.min(1, THUMB / Math.max(width, height)),
    canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas unavailable.');
  context.imageSmoothingQuality = 'high';
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

/**
 * Everything a list needs about a photo, worked out once while the image is decoded anyway: thumbnail, pixel size,
 * analysis and fingerprint.
 * @param img the decoded image
 * @param url its data URL
 * @returns the stored record's fields
 */
function details(img: HTMLImageElement, url: string): Pick<StoredPhoto, 'key' | 'thumb' | 'w' | 'h' | 'traits'> {
  return { key: photoKey(url), thumb: thumbOf(img), w: img.naturalWidth, h: img.naturalHeight, traits: analyzeImage(img) };
}

/** A photo to keep in the store. */
export interface PhotoToStore {
  name: string;
  /** The image as a data URL. */
  url: string;
  /** The decoded image, when there is one (saves decoding it again). */
  img?: HTMLImageElement;
}

/**
 * Adds photos to the store, skipping ones already in it (matched by fingerprint).
 * @param items the photos
 */
export async function storePhotos(items: PhotoToStore[]): Promise<void> {
  try {
    const have = new Set((await db.libAll()).map((stored) => stored.key).filter(Boolean));
    let addedCount = 0;
    for (const item of items) {
      const key = photoKey(item.url);
      if (have.has(key)) continue;
      have.add(key);
      const img = item.img ?? (await loadImage(item.url).catch(() => null));
      if (!img) continue;
      await db.libPut({
        id: newRecordId('s'),
        added: Date.now() + addedCount++,
        name: item.name,
        url: item.url,
        ...details(img, item.url),
      });
    }
    if (addedCount) changed();
  } catch {
    /* store unavailable: the card still has its photos */
  }
}

/**
 * The full image of a stored photo (lists only carry the thumbnail).
 * @param stored the stored photo
 * @returns its data URL
 */
export async function fullUrl(stored: StoredPhoto): Promise<string> {
  return stored.url || (await db.libUrl(stored.id));
}

/**
 * Wait until the browser is idle (or 80 ms where it can't say).
 * @returns when it is
 */
const whenIdle = () =>
  new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 2000 });
    else setTimeout(resolve, 80);
  });

/* Photos stored before thumbnails existed: add them in the background, one at a time, while the app is idle. */
let upgrading = false;

/**
 * Give stored photos without a thumbnail or fingerprint their details.
 * @param list the stored photos (those already complete are skipped)
 */
async function upgrade(list: StoredPhoto[]): Promise<void> {
  if (upgrading) return;
  const todo = list.filter((stored) => !stored.thumb || !stored.key);
  if (!todo.length) return;
  upgrading = true;
  for (const stored of todo) {
    await whenIdle();
    try {
      const url = await fullUrl(stored),
        img = await loadImage(url);
      await db.libPut({ ...stored, url: '', ...details(img, url) });
    } catch {
      /* unreadable: leave it */
    }
  }
  upgrading = false;
  changed();
}

/**
 * Delete a photo from the store.
 * @param id the stored photo
 */
export async function removeStored(id: string): Promise<void> {
  await db.libDel(id);
  changed();
}

/**
 * Add a new photo to the card: into an empty slot, else swapped into the selected slot, else replacing the photo in it.
 * @param photo the new photo
 * @param slotsInLayout photo slots in the layout
 * @param active the selected slot
 */
function addToCard(photo: Photo, slotsInLayout: number, active: number): void {
  const { photos: list, design } = getState();
  if (list.length < slotsInLayout) {
    setPhotos([...list, photo]);
    selectSlot(list.length);
  } else if (list.length < maxPhotos(design.product)) {
    setPhotos([...list, photo]);
    placePhoto(photo.id, active);
  } else {
    const replaced = active % list.length;
    setPhotos(list.map((onCard, index) => (index === replaced ? photo : onCard)));
  }
}

/**
 * A stored photo's fingerprint (lib/photoKey.ts): the stored one, or worked out from its URL for older records.
 * @param stored the stored photo
 * @returns the fingerprint
 */
export const keyOfStored = (stored: StoredPhoto) => (stored.key?.length ? stored.key : photoKey(stored.url));

/**
 * Puts a stored photo on the card:
 * already on the card → move it into the selected slot;
 * layout has an empty slot → fill it;
 * room for another photo → add it and swap it into the selected slot;
 * card full → it replaces the photo in the selected slot.
 * @param stored the stored photo
 */
export async function putOnCard(stored: StoredPhoto): Promise<void> {
  const { photos, design, ui } = getState(),
    count = Math.max(1, slotCount(design.layout, design)),
    active = Math.min(ui.slot, count - 1);
  const key = keyOfStored(stored);
  const onCard = photos.find((photo) => photoKey(photo.url) === key);
  if (onCard) {
    placePhoto(onCard.id, active);
    return;
  }
  let photo;
  try {
    const url = await fullUrl(stored);
    photo = makePhoto(await loadImage(url), stored.name, url);
  } catch (error) {
    logError('handled', error);
    toast(`${stored.name} couldn’t be opened.`);
    return;
  }
  addToCard(photo, count, active);
}

/** The photo store as a list shows it. */
export interface LibraryList {
  /** Stored photos, newest first; null while loading. */
  list: StoredPhoto[] | null;
  /** The store couldn't be read. */
  error: boolean;
}

/**
 * Stored photos, newest first; refreshes whenever the store changes.
 * @returns the list and whether reading it failed
 */
export function useLibrary(): LibraryList {
  const [list, setList] = useState<StoredPhoto[] | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const load = () => {
      db.libAll()
        .then((stored) => {
          setList(stored.toSorted((first, second) => second.added - first.added));
          setError(false);
          void upgrade(stored);
        })
        .catch(() => {
          setError(true);
        });
    };
    load();
    window.addEventListener(LIBRARY_EVENT, load);
    return () => {
      window.removeEventListener(LIBRARY_EVENT, load);
    };
  }, []);
  return { list, error };
}
