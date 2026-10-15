import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MONTHS } from '../data/products';
import { calPages } from '../engine/design';
import { slotPhotoIndex } from '../engine/layout';
import { calMonth } from '../engine/calendarDraw';
import { toast } from '../lib/toast';
import { addFiles } from '../state/actions';
import { putOnCard, useLibrary } from '../state/library';
import { placePhoto, selectSlot, usePhotoSlots } from '../state/photoSlots';
import { autoArrange, useRankedLibrary } from '../state/traits';
import { getState, setPhotos, setUI, useApp } from '../state/store';
import type { Photo, StoredPhoto } from '../types';
import { PhotoThumb } from './canvases';
import { ArrangeIcon, CloseIcon, CropIcon, PhotosIcon, PlusIcon, SuggestIcon } from './icons';

/*
 * Photo dock under the preview.
 *   Slots:       the photo windows of the layout (this month for calendars). Tap one to select it; drag one onto
 *                another to swap them. The selected slot has crop and remove buttons.
 *   Suggestions: photos for the selected slot, most relevant first (the design's unused photos, then the library),
 *                never repeating what is already in a slot. Tap one, or drag it onto any slot.
 *   Tools:       add, auto-arrange and the full photo library, always in view.
 */

const SUGGEST = 10;
type Drag =
  | { kind: 'slot'; slot: number }
  | { kind: 'month'; page: number }
  | { kind: 'card'; id: string }
  | { kind: 'lib'; sp: StoredPhoto };
let dragging: Drag | null = null;

/**
 * Adds photo files to the design and the library, telling the user about the first problem, if any.
 * @param files the chosen or dropped files
 */
async function addPhotoFiles(files: FileList | null): Promise<void> {
  if (!files?.length) return;
  const first = (await addFiles([...files])).at(0);
  if (first) toast(first[1]);
}

/**
 * Drag handlers for a photo that can be dragged onto a slot or month.
 * @param dragged what is dragged
 * @param onEnd called when the drag ends (clears the drop highlight)
 * @returns the props to spread on the element
 */
function dragSource(dragged: Drag, onEnd: () => void) {
  return {
    draggable: true,
    onDragStart: (event: DragEvent) => {
      dragging = dragged;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', 'chitthi-photo');
    },
    onDragEnd: () => {
      dragging = null;
      onEnd();
    },
  };
}

/**
 * Swaps two items of a list in place (nothing when either index is out of range).
 * @param list the list
 * @param first one index
 * @param second the other
 */
function swapIn(list: Photo[], first: number, second: number): void {
  if (first < 0 || second < 0) return;
  const firstItem = list.at(first),
    secondItem = list.at(second);
  if (firstItem === undefined || secondItem === undefined) return;
  list[first] = secondItem;
  list[second] = firstItem;
}

/** The dock under the stage: the design's photo slots (or a calendar's months), suggestions and adding photos. */
export function PhotoTray() {
  const design = useApp((state) => state.design);
  // A calendar of several months gets one row of month tiles instead of slots plus a separate month strip.
  if (design.product === 'calendar' && calPages(design) > 1) return <CalendarDock />;
  return <CardDock />;
}

function CardDock() {
  const { count, active, filled, photos } = usePhotoSlots();
  const product = useApp((state) => state.design.product);
  const { list } = useLibrary();
  const ranked = useRankedLibrary(list);
  const [over, setOver] = useState<number | null>(null);
  if (!count) return null;

  const target = count > 1 ? active : 0,
    current = filled[target];
  const inSlots = new Set(filled.map((photo) => photo?.id));
  // The design's photos that aren't in a slot on this page come first: they're already chosen.
  const spare = photos.filter((photo) => !inSlots.has(photo.id));
  const libPicks = ranked.slice(0, Math.max(0, SUGGEST - spare.length)).map((pick) => pick.photo);
  const total = spare.length + ranked.length;

  const intoSlot = async (dragged: Drag, slot: number) => {
    if (dragged.kind === 'slot') {
      // Swap the two slots' photos.
      const from = filled.at(dragged.slot),
        to = filled.at(slot);
      if (from && to && from.id !== to.id) {
        const list = [...getState().photos],
          ia = list.findIndex((photo) => photo.id === from.id),
          ib = list.findIndex((photo) => photo.id === to.id);
        swapIn(list, ia, ib);
        setPhotos(list);
      }
    } else if (dragged.kind === 'card') placePhoto(dragged.id, slot);
    else if (dragged.kind === 'lib') {
      selectSlot(slot);
      await putOnCard(dragged.sp);
    }
    selectSlot(slot);
  };
  const dropProps = (slot: number) => ({
    onDragOver: (event: DragEvent) => {
      if (!dragging) return;
      event.preventDefault();
      setOver(slot);
    },
    onDragLeave: () => setOver((overSlot) => (overSlot === slot ? null : overSlot)),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setOver(null);
      if (dragging) void intoSlot(dragging, slot);
      dragging = null;
    },
  });
  const dragFrom = (dragged: Drag) => dragSource(dragged, () => setOver(null));
  const remove = (photo: Photo) => setPhotos(getState().photos.filter((x) => x.id !== photo.id));

  return (
    <div className="dock" role="group" aria-label="Photos on the design">
      <div
        className="dock-slots"
        role="radiogroup"
        aria-label={product === 'calendar' ? 'Photo slots on this month' : 'Photo slots'}
      >
        {filled.map((photo, slot) => (
          <div
            key={slot}
            className={`dock-slot${slot === target ? ' on' : ''}${over === slot ? ' over' : ''}`}
            {...dropProps(slot)}
          >
            <button
              type="button"
              role="radio"
              aria-checked={slot === target}
              aria-label={`Slot ${slot + 1}${photo ? ': ' + photo.name : ', empty'}`}
              title={
                photo ? `Slot ${slot + 1}: ${photo.name}. Drag onto another slot to swap.` : `Slot ${slot + 1} is empty`
              }
              onClick={() => selectSlot(slot)}
              {...(photo ? dragFrom({ kind: 'slot', slot: slot }) : {})}
            >
              {photo ? <PhotoThumb photo={photo} /> : <PlusIcon />}
            </button>
            {count > 1 && <b className="dock-num">{slot + 1}</b>}
          </div>
        ))}
        {current && (
          <div className="dock-acts" aria-label={`Selected slot ${target + 1}`}>
            <button
              type="button"
              title="Crop this photo"
              aria-label="Crop the photo in the selected slot"
              onClick={() => setUI({ cropId: current.id })}
            >
              <CropIcon />
            </button>
            <button
              type="button"
              title="Take this photo off the design (it stays in your library)"
              aria-label="Remove the photo in the selected slot"
              onClick={() => remove(current)}
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>

      <div className="dock-suggest">
        <span className="dock-label">{count > 1 ? `Suggested for slot ${target + 1}` : 'Suggested photos'}</span>
        <ul tabIndex={0} aria-label={`Tap a photo to put it in slot ${target + 1}, or drag it onto any slot`}>
          {spare.map((photo) => (
            <li key={photo.id}>
              <button
                type="button"
                className="dock-ph mine"
                title={`${photo.name} (on this design)`}
                onClick={() => placePhoto(photo.id, target)}
                {...dragFrom({ kind: 'card', id: photo.id })}
              >
                <PhotoThumb photo={photo} />
              </button>
            </li>
          ))}
          {libPicks.map((pick) => (
            <li key={pick.id}>
              <button
                type="button"
                className="dock-ph"
                title={pick.name}
                onClick={() => void putOnCard(pick)}
                {...dragFrom({ kind: 'lib', sp: pick })}
              >
                <img src={pick.thumb ?? pick.url} alt="" loading="lazy" decoding="async" draggable={false} />
              </button>
            </li>
          ))}
          {!spare.length && !libPicks.length && <li className="dock-empty">Add photos to see suggestions here</li>}
        </ul>
      </div>

      <div className="dock-tools">
        <label className="dock-tool" title="Add photos from this device">
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              void addPhotoFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <PlusIcon />
          <span className="vh">Add photos</span>
        </label>
        <button
          type="button"
          className="dock-tool"
          disabled={!photos.length}
          title="Auto-arrange: best photo for each slot, cropped around its subject"
          aria-label="Auto-arrange photos"
          onClick={autoArrange}
        >
          <ArrangeIcon />
        </button>
        <button
          type="button"
          className="dock-tool wide"
          title="See and choose from all your photos"
          onClick={() => setUI({ library: true, libraryTab: 'mine' })}
        >
          <PhotosIcon />
          <span>All photos{total > libPicks.length + spare.length ? ` (${total})` : ''}</span>
        </button>
      </div>
    </div>
  );
}

/*
 * Calendar dock: every month as a tile showing that month's photo. Tap a tile to show the month (the preview and
 * the month arrows follow); drag a tile onto another to swap their photos; drop a suggestion onto any month.
 * Suggestions open on demand above the dock, so the row stays one line high.
 */
function CalendarDock() {
  const design = useApp((state) => state.design),
    photos = useApp((state) => state.photos),
    calPage = useApp((state) => state.ui.calPage);
  const { count, active, filled } = usePhotoSlots();
  const { list } = useLibrary();
  const ranked = useRankedLibrary(list);
  const [over, setOver] = useState<number | null>(null);
  const [suggest, setSuggest] = useState(false);
  const box = useRef<HTMLDivElement>(null),
    row = useRef<HTMLUListElement>(null);
  const pages = calPages(design),
    page = Math.min(calPage, pages - 1),
    photoCount = photos.length,
    slotsPer = Math.max(1, count),
    target = slotsPer > 1 ? active : 0,
    current = filled[target],
    monthName = MONTHS.at(calMonth(design, page).month) ?? '';
  const photoAt = (pageIndex: number, slot = 0) =>
    photoCount ? (photos.at(slotPhotoIndex(slot, photoCount, pageIndex, slotsPer)) ?? null) : null;
  // Photos not shown in any month (a list longer than the months need), then the library's best matches.
  const used = new Set(
    Array.from({ length: pages * slotsPer }, (_, index) => photoAt(Math.floor(index / slotsPer), index % slotsPer)?.id),
  );
  const spare = photos.filter((photo) => !used.has(photo.id)),
    libPicks = ranked.slice(0, Math.max(0, SUGGEST - spare.length)).map((pick) => pick.photo);

  // Keep the shown month in view as it changes (arrows, keyboard, clicks elsewhere).
  useEffect(() => {
    const el = row.current?.children.item(page),
      ul = row.current;
    if (el instanceof HTMLElement && ul)
      ul.scrollTo({ left: el.offsetLeft - (ul.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [page]);
  // Close the suggestions on an outside click or Esc.
  useEffect(() => {
    if (!suggest) return;
    const off = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node))
        setSuggest(false);
    };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', off);
    return () => {
      document.removeEventListener('pointerdown', off);
      document.removeEventListener('keydown', off);
    };
  }, [suggest]);

  const show = (pageIndex: number) => setUI({ calPage: pageIndex, side: 'front' });
  /**
   * Puts a photo into the selected slot of a month, or swaps two months.
   * @param dragged what was dropped
   * @param pageIndex the month's page
   */
  const intoMonth = async (dragged: Drag, pageIndex: number) => {
    show(pageIndex);
    if (dragged.kind === 'month') {
      if (dragged.page === pageIndex || !photoCount) return;
      const list = [...getState().photos];
      for (let slot = 0; slot < slotsPer; slot++) {
        const from = slotPhotoIndex(slot, photoCount, dragged.page, slotsPer),
          to = slotPhotoIndex(slot, photoCount, pageIndex, slotsPer);
        if (from !== to) swapIn(list, from, to);
      }
      setPhotos(list);
    } else if (dragged.kind === 'card') placePhoto(dragged.id, target);
    else if (dragged.kind === 'lib') await putOnCard(dragged.sp);
  };
  const dragFrom = (dragged: Drag) => dragSource(dragged, () => setOver(null));

  return (
    <div className="dock cal" role="group" aria-label="Calendar photos" ref={box}>
      <ul className="dock-months" ref={row} role="tablist" aria-label="Months">
        {Array.from({ length: pages }, (_, pageIndex) => {
          const ph = photoAt(pageIndex),
            { month, year } = calMonth(design, pageIndex),
            monthLabel = MONTHS.at(month) ?? '',
            photoNote = ph ? `: ${ph.name}` : ', no photo';
          return (
            <li
              key={pageIndex}
              className={`dock-month${pageIndex === page ? ' on' : ''}${over === pageIndex ? ' over' : ''}`}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setOver(pageIndex);
              }}
              onDragLeave={() => setOver((overPage) => (overPage === pageIndex ? null : overPage))}
              onDrop={(event) => {
                event.preventDefault();
                setOver(null);
                if (dragging) void intoMonth(dragging, pageIndex);
                dragging = null;
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={pageIndex === page}
                aria-label={`${monthLabel} ${year}${photoNote}`}
                title={`${monthLabel} ${year}${ph ? '. Drag onto another month to swap photos.' : ''}`}
                onClick={() => show(pageIndex)}
                {...(ph ? dragFrom({ kind: 'month', page: pageIndex }) : {})}
              >
                {ph ? <PhotoThumb photo={ph} /> : <PlusIcon />}
              </button>
              <span>{monthLabel.slice(0, 3)}</span>
            </li>
          );
        })}
      </ul>

      <div className="dock-acts cal-acts" aria-label={monthName}>
        {slotsPer > 1 && (
          <span className="dock-slotpick" role="radiogroup" aria-label="Photo slot">
            {filled.map((_, slot) => (
              <button
                key={slot}
                type="button"
                role="radio"
                aria-checked={slot === target}
                title={`Slot ${slot + 1}`}
                onClick={() => selectSlot(slot)}
              >
                {slot + 1}
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          title={`Crop ${monthName}'s photo`}
          aria-label="Crop this month's photo"
          disabled={!current}
          onClick={() => current && setUI({ cropId: current.id })}
        >
          <CropIcon />
        </button>
        <button
          type="button"
          title="Take this photo off the calendar (it stays in your library)"
          aria-label="Remove this month's photo"
          disabled={!current}
          onClick={() => current && setPhotos(getState().photos.filter((x) => x.id !== current.id))}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="dock-tools">
        <label className="dock-tool" title="Add photos (one per month)">
          <input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              void addPhotoFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <PlusIcon />
          <span className="vh">Add photos</span>
        </label>
        <button
          type="button"
          className="dock-tool"
          disabled={!photos.length}
          title="Auto-arrange: crop every month around its subject"
          aria-label="Auto-arrange photos"
          onClick={autoArrange}
        >
          <ArrangeIcon />
        </button>
        <button
          type="button"
          className="dock-tool"
          aria-expanded={suggest}
          title={`Photos that suit ${monthName}`}
          aria-label="Suggested photos"
          onClick={() => setSuggest((shown) => !shown)}
        >
          <SuggestIcon />
        </button>
        <button
          type="button"
          className="dock-tool wide"
          title="See and choose from all your photos"
          onClick={() => setUI({ library: true, libraryTab: 'mine' })}
        >
          <PhotosIcon />
          <span>All photos</span>
        </button>
      </div>

      {suggest && (
        <div className="dock-pop" role="dialog" aria-label="Suggested photos">
          <span className="dock-label">Suggested for {monthName} · tap to use, or drag onto any month</span>
          <ul>
            {spare.map((photo) => (
              <li key={photo.id}>
                <button
                  type="button"
                  className="dock-ph mine"
                  title={`${photo.name} (on this calendar)`}
                  onClick={() => placePhoto(photo.id, target)}
                  {...dragFrom({ kind: 'card', id: photo.id })}
                >
                  <PhotoThumb photo={photo} />
                </button>
              </li>
            ))}
            {libPicks.map((sp) => (
              <li key={sp.id}>
                <button
                  type="button"
                  className="dock-ph"
                  title={sp.name}
                  onClick={() => void putOnCard(sp)}
                  {...dragFrom({ kind: 'lib', sp })}
                >
                  <img src={sp.thumb ?? sp.url} alt="" loading="lazy" decoding="async" draggable={false} />
                </button>
              </li>
            ))}
            {!spare.length && !libPicks.length && (
              <li className="dock-empty">No more photos in your library. Add some, or search Pexels.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
