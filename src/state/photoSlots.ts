import { useMemo } from 'react';
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

/** Calendar month being edited (always 0 for other products). */
const pageOf = (s: AppState) => (s.design.product === 'calendar' ? s.ui.calPage : 0);

/** Put a photo into a slot (on the current calendar month) by swapping it with whichever photo is there now. */
export function placePhoto(id: string, slot: number): void {
  const s = getState(),
    list = s.photos;
  if (!list.length) return;
  const to = slotPhotoIndex(slot, list.length, pageOf(s), slotCount(s.design.layout, s.design)),
    from = list.findIndex((p) => p.id === id);
  if (from < 0 || from === to) return;
  const next = [...list];
  [next[from], next[to]] = [next[to], next[from]];
  setPhotos(next);
}

export const selectSlot = (slot: number) => setUI({ slot });

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

export function usePhotoSlots(): PhotoSlots {
  const d = useApp((s) => s.design),
    photos = useApp((s) => s.photos),
    active = useApp((s) => s.ui.slot),
    page = useApp(pageOf);
  const count = useMemo(() => slotCount(d.layout, d), [d]);
  return useMemo(() => {
    const n = photos.length;
    const filled = Array.from({ length: count }, (_, i) => (n ? photos[slotPhotoIndex(i, n, page, count)] : null));
    const pos = new Map<string, number>();
    filled.forEach((p, i) => p && !pos.has(p.id) && pos.set(p.id, i));
    return { count, active: Math.min(active, Math.max(0, count - 1)), filled, slotOf: (id) => pos.get(id) ?? -1, photos };
  }, [count, active, photos, page]);
}
