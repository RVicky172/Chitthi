import { useEffect, useState } from 'react';
import { slotCount } from '../engine/layout';
import { loadImage, makePhoto, maxPhotos } from '../engine/photo';
import { db } from '../lib/db';
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

/** Adds photos to the store, skipping ones already in it. */
export async function storePhotos(items: { name: string; url: string }[]): Promise<void> {
  try {
    const have = new Set((await db.libAll()).map((p) => p.url));
    let n = 0;
    for (const it of items) {
      if (have.has(it.url)) continue;
      have.add(it.url);
      await db.libPut({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), added: Date.now() + n++, ...it });
    }
    if (n) changed();
  } catch {
    /* store unavailable: the card still has its photos */
  }
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
  const onCard = photos.find((p) => p.url === sp.url);
  if (onCard) {
    placePhoto(onCard.id, active);
    return;
  }
  let ph;
  try {
    ph = makePhoto(await loadImage(sp.url), sp.name, sp.url);
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
        })
        .catch(() => setError(true));
    void load();
    window.addEventListener(EVT, load);
    return () => window.removeEventListener(EVT, load);
  }, []);
  return { list, error };
}
