import { useMemo } from 'react';
import { calPages } from '../engine/design';
import { slotCount, slotPhotoIndex } from '../engine/layout';
import type { AppState } from './store';
import type { Photo } from '../types';
import { getState, setPhotos, setUI, useApp } from './store';

/*
 * Photo ↔ slot handling in one place.
 * The renderer fills slot i with photos[slotPhotoIndex(i, …)] (photos[i] for cards; calendars move on through the
 * list month by month), so the order of the photo list *is* the assignment. Moving a photo into a slot is a swap of
 * two list positions, which keeps undo/redo and autosave working unchanged.
 */

/**
 * Calendar month being edited (always 0 for other products).
 * @param state the store's state
 * @returns the page index
 */
const pageOf = (state: AppState) => (state.design.product === 'calendar' ? Math.min(state.ui.calPage, calPages(state.design) - 1) : 0);

/**
 * Put a photo into a slot (on the current calendar month) by swapping it with whichever photo is there now.
 * @param id the photo
 * @param slot the slot (0-based)
 */
export function placePhoto(id: string, slot: number): void {
  const state = getState(),
    list = state.photos;
  if (!list.length) return;
  const to = slotPhotoIndex(slot, list.length, pageOf(state), slotCount(state.design.layout, state.design)),
    from = list.findIndex((photo) => photo.id === id);
  if (from < 0 || from === to) return;
  const moving = list.at(from),
    displaced = list.at(to);
  if (!moving || !displaced) return;
  const next = [...list];
  next[from] = displaced;
  next[to] = moving;
  setPhotos(next);
}

/**
 * Choose the slot the next tapped photo goes into.
 * @param slot the slot (0-based)
 */
export const selectSlot = (slot: number) => {
  setUI({ slot });
};

/** The current layout's photo slots and what fills them. */
export interface PhotoSlots {
  /** Photo slots in the current layout. */
  count: number;
  /** The slot the next tapped photo goes into. */
  active: number;
  /** What each slot shows (null while there are no photos). */
  filled: (Photo | null)[];
  /** Slot number (0-based) a photo sits in on the current page, or -1 if it's not shown. */
  slotOf: (id: string) => number;
  photos: Photo[];
}

/**
 * The current layout's photo slots and what fills them, for the photo tray and the stage.
 * @returns the slots; stable until the design, photos, slot or page change
 */
export function usePhotoSlots(): PhotoSlots {
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos),
    active = useApp((state) => state.ui.slot),
    page = useApp(pageOf);
  const count = useMemo(() => slotCount(design.layout, design), [design]);
  return useMemo(() => {
    const photoCount = photos.length;
    const filled = Array.from({ length: count }, (_, slot) => (photoCount ? (photos.at(slotPhotoIndex(slot, photoCount, page, count)) ?? null) : null));
    const slotById = new Map<string, number>();
    filled.forEach((photo, slot) => {
      if (photo && !slotById.has(photo.id)) slotById.set(photo.id, slot);
    });
    return { count, active: Math.min(active, Math.max(0, count - 1)), filled, slotOf: (id) => slotById.get(id) ?? -1, photos };
  }, [count, active, photos, page]);
}
