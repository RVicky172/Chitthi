import { useEffect, useState } from 'react';
import { analyzeImage, assign, focusPosition, relevance, TRAITS_VERSION, type PhotoTraits } from '../engine/analyze';
import { calPages, resolveTheme } from '../engine/design';
import { slotCount } from '../engine/layout';
import { loadImage, updatePhoto } from '../engine/photo';
import { db } from '../lib/db';
import { toast } from '../lib/toast';
import type { Photo, StoredPhoto } from '../types';
import { putOnCard } from './library';
import { rememberDims, slotInfo } from './photoFit';
import { getState, setPhotos, useApp } from './store';

/*
 * Photo traits for every photo on this device: analysed once (in the background, one at a time, while the app is
 * idle), kept in memory by photo URL and stored with library photos so they are never analysed twice.
 */

const cache = new Map<string, PhotoTraits>();
const EVT = 'chitthi:traits';
let pending = 0;
const changed = () => {
  if (!pending)
    pending = requestAnimationFrame(() => {
      pending = 0;
      window.dispatchEvent(new Event(EVT));
    });
};
const remember = (url: string, t: PhotoTraits) => {
  cache.set(url, t);
  rememberDims(url, t.w, t.h);
  changed();
};

export const traitsOf = (url: string): PhotoTraits | undefined => cache.get(url);

/** Re-renders when new traits arrive. */
export function useTraitsTick(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const on = () => setT((x) => x + 1);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return t;
}

/** Traits of a photo already on the card (decoded, so analysis is immediate). */
export function traitsForPhoto(p: Photo): PhotoTraits {
  let t = cache.get(p.url);
  if (!t) {
    t = analyzeImage(p.orig);
    remember(p.url, t);
  }
  return t;
}

/* ---------- background queue for the library ---------- */

const queue: StoredPhoto[] = [];
let running = false;
const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(() => fn(), { timeout: 1500 }) : setTimeout(fn, 60));

async function work(): Promise<void> {
  if (running) return;
  running = true;
  while (queue.length) {
    const sp = queue.shift()!;
    if (cache.has(sp.url)) continue;
    await new Promise<void>((r) => idle(r));
    try {
      const t = analyzeImage(await loadImage(sp.url));
      remember(sp.url, t);
      // Keep it with the stored photo so it is never analysed again.
      if (sp.id) await db.libPut({ ...sp, traits: t }).catch(() => undefined);
    } catch {
      /* unreadable: skip */
    }
  }
  running = false;
}

/** Makes sure every listed library photo has traits: stored ones are used, missing ones are queued. */
export function analyzeLibrary(list: StoredPhoto[]): void {
  for (const sp of list) {
    if (cache.has(sp.url)) continue;
    if (sp.traits && sp.traits.v === TRAITS_VERSION) remember(sp.url, sp.traits);
    else if (!queue.some((q) => q.url === sp.url)) queue.push(sp);
  }
  void work();
}

/** Library photos (not on the card) ranked by relevance for the selected slot. */
export function useRankedLibrary(list: StoredPhoto[] | null): { photo: StoredPhoto; score: number }[] {
  const design = useApp((s) => s.design),
    slot = useApp((s) => s.ui.slot),
    photos = useApp((s) => s.photos);
  useTraitsTick();
  useEffect(() => {
    if (list) analyzeLibrary(list);
  }, [list]);
  if (!list) return [];
  const info = slotInfo(design, slot),
    theme = resolveTheme(design),
    onCard = new Set(photos.map((p) => p.url));
  return list
    .filter((s) => !onCard.has(s.url))
    .map((photo) => {
      const t = cache.get(photo.url);
      return { photo, score: t ? relevance(t, info, theme) : 0.3 };
    })
    .sort((a, b) => b.score - a.score);
}

/* ---------- actions ---------- */

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
    slots = Array.from({ length: count }, (_, i) => slotInfo(design, i)).filter((s): s is NonNullable<typeof s> => !!s);
  let order = photos.map((_, i) => i);
  if (design.product !== 'calendar' && slots.length) {
    const picked = assign(traits, slots, resolveTheme(design));
    order = [...picked, ...order.filter((i) => !picked.includes(i))];
  }
  const next = order.map((i, k) => {
    // Calendars: the slot a photo lands in on its month page.
    const s = slots[k % Math.max(1, slots.length)];
    return s ? updatePhoto(photos[i], { ...focusPosition(traits[i], s.aspect), zoom: 1 }) : photos[i];
  });
  setPhotos(next);
  const pages = calPages(design);
  toast(
    design.product === 'calendar'
      ? `Cropped ${next.length} photo${next.length > 1 ? 's' : ''} around their subjects across ${pages} page${pages > 1 ? 's' : ''}.`
      : `Arranged ${Math.min(next.length, slots.length)} photo${next.length > 1 ? 's' : ''}: each in the slot that suits it, cropped around its subject.`,
  );
}

/** Fills the layout's empty slots with the most relevant photos from the library. */
export async function smartFill(list: StoredPhoto[]): Promise<void> {
  const { design, photos } = getState(),
    count = Math.max(1, slotCount(design.layout, design)) * (design.product === 'calendar' ? calPages(design) : 1),
    need = count - photos.length;
  if (need <= 0) {
    toast('Every slot already has a photo. Use Auto-arrange to reshuffle them.');
    return;
  }
  const theme = resolveTheme(design),
    onCard = new Set(photos.map((p) => p.url)),
    info = slotInfo(design, 0);
  analyzeLibrary(list);
  const ranked = list
    .filter((s) => !onCard.has(s.url))
    .map((s) => ({ s, score: cache.get(s.url) ? relevance(cache.get(s.url)!, info, theme) : 0.3 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, need);
  if (!ranked.length) {
    toast('Your library has no more photos to add. Upload some, or search Pexels.');
    return;
  }
  for (const r of ranked) await putOnCard(r.s);
  autoArrange();
}
