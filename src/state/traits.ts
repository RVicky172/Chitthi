import { useEffect, useState } from 'react';
import { analyzeImage, assign, focusPosition, relevance, TRAITS_VERSION, type PhotoTraits } from '../engine/analyze';
import { calPages, resolveTheme } from '../engine/design';
import { slotCount } from '../engine/layout';
import { loadImage, updatePhoto } from '../engine/photo';
import { photoKey } from '../lib/photoKey';
import { toast } from '../lib/toast';
import type { Design, Photo, StoredPhoto } from '../types';
import { keyOfStored, putOnCard } from './library';
import { rememberDims, slotInfo, type SlotInfo } from './photoFit';
import { getState, setPhotos, useApp } from './store';

/*
 * Photo traits for every photo on this device: analysed once (in the background, one at a time, while the app is
 * idle), kept in memory by photo URL and stored with library photos so they are never analysed twice.
 */

const cache = new Map<string, PhotoTraits>();
const TRAITS_EVENT = 'chitthi:traits';
let pendingFrame = 0;

/** Tell the listeners, once per frame, that traits arrived. */
const changed = () => {
  if (!pendingFrame)
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      window.dispatchEvent(new Event(TRAITS_EVENT));
    });
};

/**
 * Keep a photo's traits (and its pixel size). Traits are kept by photo fingerprint (lib/photoKey.ts), so a photo on a
 * design and in the library share them.
 * @param key the photo's fingerprint
 * @param traits its traits
 */
const remember = (key: string, traits: PhotoTraits) => {
  cache.set(key, traits);
  rememberDims(key, traits.w, traits.h);
  changed();
};

/**
 * Traits of a stored photo or of an image URL.
 * @param key the photo's fingerprint
 * @returns its traits, or undefined while not analysed
 */
export const traitsOf = (key: string): PhotoTraits | undefined => cache.get(key);

/**
 * Re-renders when new traits arrive.
 * @returns a number that changes with each arrival
 */
export function useTraitsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onTraits = () => {
      setTick((previous) => previous + 1);
    };
    window.addEventListener(TRAITS_EVENT, onTraits);
    return () => {
      window.removeEventListener(TRAITS_EVENT, onTraits);
    };
  }, []);
  return tick;
}

/**
 * Traits of a photo already on the card (decoded, so analysis is immediate).
 * @param photo the photo
 * @returns its traits
 */
export function traitsForPhoto(photo: Photo): PhotoTraits {
  const key = photoKey(photo.url);
  let traits = cache.get(key);
  if (!traits) {
    traits = analyzeImage(photo.orig);
    remember(key, traits);
  }
  return traits;
}

/* ---------- background queue for the library ---------- */

const queue: StoredPhoto[] = [];
let running = false;

/**
 * Wait until the browser is idle (or 60 ms where it can't say).
 * @returns when it is
 */
const whenIdle = () =>
  new Promise<void>((resolve) => {
    if ('requestIdleCallback' in window) requestIdleCallback(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 60);
  });

/** Analyse the queued library photos, one at a time while the app is idle. */
async function work(): Promise<void> {
  if (running) return;
  running = true;
  for (let stored = queue.shift(); stored; stored = queue.shift()) {
    const key = keyOfStored(stored);
    if (cache.has(key)) continue;
    await whenIdle();
    try {
      // The analysis reads a 96 px copy, so the thumbnail is enough; the pixel size comes from the record.
      const traits = analyzeImage(await loadImage(stored.thumb?.length ? stored.thumb : stored.url));
      remember(key, stored.w && stored.h ? { ...traits, w: stored.w, h: stored.h } : traits);
    } catch {
      /* unreadable: skip */
    }
  }
  running = false;
}

/**
 * Makes sure every listed library photo has traits: stored ones are used, missing ones are queued.
 * @param list the stored photos
 */
export function analyzeLibrary(list: StoredPhoto[]): void {
  for (const stored of list) {
    const key = keyOfStored(stored);
    if (!key || cache.has(key)) continue;
    if (stored.traits?.v === TRAITS_VERSION) remember(key, stored.traits);
    else if ((stored.thumb || stored.url) && !queue.some((queued) => queued.id === stored.id)) queue.push(stored);
  }
  void work();
}

/** A library photo with its relevance for a slot. */
export interface RankedPhoto {
  photo: StoredPhoto;
  /** 0–1; 0.3 while its traits aren't known. */
  score: number;
}

/**
 * Library photos not on the card, ranked by relevance for a slot.
 * @param list the stored photos
 * @param design the design (its theme)
 * @param photos the photos on the card
 * @param slot the slot, or null
 * @returns the photos, most relevant first
 */
function rankLibrary(list: StoredPhoto[], design: Design, photos: Photo[], slot: SlotInfo | null): RankedPhoto[] {
  const theme = resolveTheme(design),
    onCard = new Set(photos.map((photo) => photoKey(photo.url)));
  return list
    .filter((stored) => !onCard.has(keyOfStored(stored)))
    .map((photo) => {
      const traits = cache.get(keyOfStored(photo));
      return { photo, score: traits ? relevance(traits, slot, theme) : 0.3 };
    })
    .sort((first, second) => second.score - first.score);
}

/**
 * Library photos (not on the card) ranked by relevance for the selected slot.
 * @param list the stored photos, or null while loading
 * @returns the photos, most relevant first
 */
export function useRankedLibrary(list: StoredPhoto[] | null): RankedPhoto[] {
  const design = useApp((state) => state.design),
    slot = useApp((state) => state.ui.slot),
    photos = useApp((state) => state.photos);
  useTraitsTick();
  useEffect(() => {
    if (list) analyzeLibrary(list);
  }, [list]);
  if (!list) return [];
  return rankLibrary(list, design, photos, slotInfo(design, slot));
}

/* ---------- actions ---------- */

/**
 * The toast after auto-arrange.
 * @param design the design
 * @param arranged photos arranged
 * @param slotTotal slots in the layout
 * @returns the message
 */
function arrangedMessage(design: Design, arranged: number, slotTotal: number): string {
  const photoPlural = arranged > 1 ? 's' : '';
  if (design.product !== 'calendar')
    return `Arranged ${Math.min(arranged, slotTotal)} photo${photoPlural}: each in the slot that suits it, cropped around its subject.`;
  const pages = calPages(design);
  return `Cropped ${arranged} photo${photoPlural} around their subjects across ${pages} page${pages > 1 ? 's' : ''}.`;
}

/**
 * Auto-arrange: each photo on the card goes to the slot whose shape suits it best (the best overall assignment), and
 * each crop is positioned on the photo's subject. Calendars keep their month order and only get the crop positions.
 */
export function autoArrange(): void {
  const { photos, design } = getState();
  if (!photos.length) {
    toast('Add some photos first.');
    return;
  }
  const traits = photos.map(traitsForPhoto),
    count = Math.max(1, slotCount(design.layout, design)),
    slots = Array.from({ length: count }, (_, slot) => slotInfo(design, slot)).filter((slot): slot is SlotInfo => !!slot);
  let order = photos.map((_, index) => index);
  if (design.product !== 'calendar' && slots.length) {
    const picked = assign(traits, slots, resolveTheme(design));
    order = [...picked, ...order.filter((index) => !picked.includes(index))];
  }
  const next = order.flatMap((photoIndex, position) => {
    const photo = photos.at(photoIndex),
      photoTraits = traits.at(photoIndex);
    if (!photo || !photoTraits) return [];
    // Calendars: the slot a photo lands in on its month page.
    const slot = slots.at(position % Math.max(1, slots.length));
    return [slot ? updatePhoto(photo, { ...focusPosition(photoTraits, slot.aspect), zoom: 1 }) : photo];
  });
  setPhotos(next);
  toast(arrangedMessage(design, next.length, slots.length));
}

/**
 * Fills the layout's empty slots with the most relevant photos from the library.
 * @param list the stored photos
 */
export async function smartFill(list: StoredPhoto[]): Promise<void> {
  const { design, photos } = getState(),
    count = Math.max(1, slotCount(design.layout, design)) * (design.product === 'calendar' ? calPages(design) : 1),
    need = count - photos.length;
  if (need <= 0) {
    toast('Every slot already has a photo. Use Auto-arrange to reshuffle them.');
    return;
  }
  analyzeLibrary(list);
  const ranked = rankLibrary(list, design, photos, slotInfo(design, 0)).slice(0, need);
  if (!ranked.length) {
    toast('Your library has no more photos to add. Upload some, or search Pexels.');
    return;
  }
  for (const { photo } of ranked) await putOnCard(photo);
  autoArrange();
}
