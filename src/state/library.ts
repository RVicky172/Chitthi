import { useEffect, useState } from 'react';
import { slotCount } from '../engine/layout';
import { analyzeImage } from '../engine/analyze';
import { loadImage, makePhoto, maxPhotos } from '../engine/photo';
import { db } from '../lib/db';
import { photoKey } from '../lib/photoKey';
import { toast } from '../lib/toast';
import type { StoredPhoto } from '../types';
import { placePhoto, selectSlot } from './photoSlots';
import { getState, setPhotos } from './store';

/*
 * Photo store: every photo the user uploads is kept in this browser (IndexedDB), across cards and reloads.
 * Tapping a stored photo puts it straight onto the current card.
 */

const EVT = 'chitthi:library';
const changed = () => window.dispatchEvent(new Event(EVT));

const THUMB = 320;

/** A small JPEG of an image for lists (≤ 320 px on the long side). */
function thumbOf(img: HTMLImageElement): string {
  const w = img.naturalWidth,
    h = img.naturalHeight,
    k = Math.min(1, THUMB / Math.max(w, h)),
    cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * k));
  cv.height = Math.max(1, Math.round(h * k));
  const c = cv.getContext('2d')!;
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.82);
}

/**
 * Everything a list needs about a photo, worked out once while the image is decoded anyway: thumbnail, pixel size,
 * analysis and fingerprint.
 */
function details(img: HTMLImageElement, url: string): Pick<StoredPhoto, 'key' | 'thumb' | 'w' | 'h' | 'traits'> {
  return { key: photoKey(url), thumb: thumbOf(img), w: img.naturalWidth, h: img.naturalHeight, traits: analyzeImage(img) };
}

/**
 * Adds photos to the store, skipping ones already in it (matched by fingerprint). Pass the decoded image when there
 * is one, to save decoding it again.
 */
export async function storePhotos(items: { name: string; url: string; img?: HTMLImageElement }[]): Promise<void> {
  try {
    const have = new Set((await db.libAll()).map((p) => p.key).filter(Boolean));
    let n = 0;
    for (const it of items) {
      const key = photoKey(it.url);
      if (have.has(key)) continue;
      have.add(key);
      const img = it.img ?? (await loadImage(it.url).catch(() => null));
      if (!img) continue;
      await db.libPut({
        id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        added: Date.now() + n++,
        name: it.name,
        url: it.url,
        ...details(img, it.url),
      });
    }
    if (n) changed();
  } catch {
    /* store unavailable: the card still has its photos */
  }
}

/** The full image of a stored photo (lists only carry the thumbnail). */
export async function fullUrl(sp: StoredPhoto): Promise<string> {
  return sp.url || (await db.libUrl(sp.id));
}

/* Photos stored before thumbnails existed: add them in the background, one at a time, while the app is idle. */
let upgrading = false;
async function upgrade(list: StoredPhoto[]): Promise<void> {
  if (upgrading) return;
  const todo = list.filter((p) => !p.thumb || !p.key);
  if (!todo.length) return;
  upgrading = true;
  for (const sp of todo) {
    await new Promise<void>((r) => ('requestIdleCallback' in window ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 80)));
    try {
      const url = await fullUrl(sp),
        img = await loadImage(url);
      await db.libPut({ ...sp, url: '', ...details(img, url) });
    } catch {
      /* unreadable: leave it */
    }
  }
  upgrading = false;
  changed();
}

export async function removeStored(id: string): Promise<void> {
  await db.libDel(id);
  changed();
}

/**
 * Puts a stored photo on the card:
 * already on the card → move it into the selected slot;
 * layout has an empty slot → fill it;
 * room for another photo → add it and swap it into the selected slot;
 * card full → it replaces the photo in the selected slot.
 */
export async function putOnCard(sp: StoredPhoto): Promise<void> {
  const { photos, design, ui } = getState(),
    count = Math.max(1, slotCount(design.layout, design)),
    active = Math.min(ui.slot, count - 1);
  const key = sp.key || photoKey(sp.url);
  const onCard = photos.find((p) => photoKey(p.url) === key);
  if (onCard) {
    placePhoto(onCard.id, active);
    return;
  }
  let ph;
  try {
    const url = await fullUrl(sp);
    ph = makePhoto(await loadImage(url), sp.name, url);
  } catch {
    toast(`${sp.name} couldn’t be opened.`);
    return;
  }
  const list = getState().photos;
  if (list.length < count) {
    setPhotos([...list, ph]);
    selectSlot(list.length);
  } else if (list.length < maxPhotos(design.product)) {
    setPhotos([...list, ph]);
    placePhoto(ph.id, active);
  } else {
    const at = active % list.length;
    setPhotos(list.map((p, i) => (i === at ? ph : p)));
  }
}

/** Stored photos, newest first; refreshes whenever the store changes. */
export function useLibrary(): { list: StoredPhoto[] | null; error: boolean } {
  const [list, setList] = useState<StoredPhoto[] | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const load = () =>
      db
        .libAll()
        .then((l) => {
          setList(l.sort((a, b) => b.added - a.added));
          setError(false);
          void upgrade(l);
        })
        .catch(() => setError(true));
    void load();
    window.addEventListener(EVT, load);
    return () => window.removeEventListener(EVT, load);
  }, []);
  return { list, error };
}
