import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MONTHS } from '../data/products';
import { calPages } from '../engine/design';
import { slotPhotoIndex } from '../engine/layout';
import { calMonth } from '../engine/render';
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
type Drag = { kind: 'slot'; slot: number } | { kind: 'month'; page: number } | { kind: 'card'; id: string } | { kind: 'lib'; sp: StoredPhoto };
let dragging: Drag | null = null;

export function PhotoTray() {
  const design = useApp((s) => s.design);
  // A calendar of several months gets one row of month tiles instead of slots plus a separate month strip.
  if (design.product === 'calendar' && calPages(design) > 1) return <CalendarDock />;
  return <CardDock />;
}

function CardDock() {
  const { count, active, filled, photos } = usePhotoSlots();
  const product = useApp((s) => s.design.product);
  const { list } = useLibrary();
  const ranked = useRankedLibrary(list);
  const [over, setOver] = useState<number | null>(null);
  if (!count) return null;

  const target = count > 1 ? active : 0,
    current = filled[target];
  const inSlots = new Set(filled.map((p) => p?.id));
  // The design's photos that aren't in a slot on this page come first: they're already chosen.
  const spare = photos.filter((p) => !inSlots.has(p.id));
  const libPicks = ranked.slice(0, Math.max(0, SUGGEST - spare.length)).map((r) => r.photo);
  const total = spare.length + ranked.length;

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const msgs = await addFiles([...files]);
    if (msgs.length) toast(msgs[0][1]);
  };
  const intoSlot = async (d: Drag, slot: number) => {
    if (d.kind === 'slot') {
      // Swap the two slots' photos.
      const a = filled[d.slot],
        b = filled[slot];
      if (a && b && a.id !== b.id) {
        const list = [...getState().photos],
          ia = list.findIndex((p) => p.id === a.id),
          ib = list.findIndex((p) => p.id === b.id);
        [list[ia], list[ib]] = [list[ib], list[ia]];
        setPhotos(list);
      }
    } else if (d.kind === 'card') placePhoto(d.id, slot);
    else if (d.kind === 'lib') {
      selectSlot(slot);
      await putOnCard(d.sp);
    }
    selectSlot(slot);
  };
  const dropProps = (slot: number) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOver(slot);
    },
    onDragLeave: () => setOver((o) => (o === slot ? null : o)),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      if (dragging) void intoSlot(dragging, slot);
      dragging = null;
    },
  });
  const dragFrom = (d: Drag) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dragging = d;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'chitthi-photo');
    },
    onDragEnd: () => {
      dragging = null;
      setOver(null);
    },
  });
  const remove = (p: Photo) => setPhotos(getState().photos.filter((x) => x.id !== p.id));

  return (
    <div className="dock" role="group" aria-label="Photos on the design">
      <div className="dock-slots" role="radiogroup" aria-label={product === 'calendar' ? 'Photo slots on this month' : 'Photo slots'}>
        {filled.map((p, i) => (
          <div key={i} className={`dock-slot${i === target ? ' on' : ''}${over === i ? ' over' : ''}`} {...dropProps(i)}>
            <button
              type="button"
              role="radio"
              aria-checked={i === target}
              aria-label={`Slot ${i + 1}${p ? `: ${p.name}` : ', empty'}`}
              title={p ? `Slot ${i + 1}: ${p.name}. Drag onto another slot to swap.` : `Slot ${i + 1} is empty`}
              onClick={() => selectSlot(i)}
              {...(p ? dragFrom({ kind: 'slot', slot: i }) : {})}
            >
              {p ? <PhotoThumb photo={p} /> : <PlusIcon />}
            </button>
            {count > 1 && <b className="dock-num">{i + 1}</b>}
          </div>
        ))}
        {current && (
          <div className="dock-acts" aria-label={`Selected slot ${target + 1}`}>
            <button type="button" title="Crop this photo" aria-label="Crop the photo in the selected slot" onClick={() => setUI({ cropId: current.id })}>
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
        <ul aria-label={`Tap a photo to put it in slot ${target + 1}, or drag it onto any slot`}>
          {spare.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="dock-ph mine"
                title={`${p.name} (on this design)`}
                onClick={() => placePhoto(p.id, target)}
                {...dragFrom({ kind: 'card', id: p.id })}
              >
                <PhotoThumb photo={p} />
              </button>
            </li>
          ))}
          {libPicks.map((s) => (
            <li key={s.id}>
              <button type="button" className="dock-ph" title={s.name} onClick={() => void putOnCard(s)} {...dragFrom({ kind: 'lib', sp: s })}>
                <img src={s.thumb || s.url} alt="" loading="lazy" decoding="async" draggable={false} />
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
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = '';
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
        <button type="button" className="dock-tool wide" title="See and choose from all your photos" onClick={() => setUI({ library: true, libraryTab: 'mine' })}>
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
  const design = useApp((s) => s.design),
    photos = useApp((s) => s.photos),
    calPage = useApp((s) => s.ui.calPage);
  const { count, active, filled } = usePhotoSlots();
  const { list } = useLibrary();
  const ranked = useRankedLibrary(list);
  const [over, setOver] = useState<number | null>(null);
  const [suggest, setSuggest] = useState(false);
  const box = useRef<HTMLDivElement>(null),
    row = useRef<HTMLUListElement>(null);
  const pages = calPages(design),
    page = Math.min(calPage, pages - 1),
    n = photos.length,
    slotsPer = Math.max(1, count),
    target = slotsPer > 1 ? active : 0,
    current = filled[target],
    monthName = MONTHS[calMonth(design, page).month];
  const photoAt = (p: number, slot = 0) => (n ? photos[slotPhotoIndex(slot, n, p, slotsPer)] : null);
  // Photos not shown in any month (a list longer than the months need), then the library's best matches.
  const used = new Set(Array.from({ length: pages * slotsPer }, (_, i) => photoAt(Math.floor(i / slotsPer), i % slotsPer)?.id));
  const spare = photos.filter((p) => !used.has(p.id)),
    libPicks = ranked.slice(0, Math.max(0, SUGGEST - spare.length)).map((r) => r.photo);

  // Keep the shown month in view as it changes (arrows, keyboard, clicks elsewhere).
  useEffect(() => {
    const el = row.current?.children[page] as HTMLElement | undefined,
      ul = row.current;
    if (el && ul) ul.scrollTo({ left: el.offsetLeft - (ul.clientWidth - el.offsetWidth) / 2, behavior: 'smooth' });
  }, [page]);
  // Close the suggestions on an outside click or Esc.
  useEffect(() => {
    if (!suggest) return;
    const off = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setSuggest(false);
    };
    document.addEventListener('pointerdown', off);
    document.addEventListener('keydown', off);
    return () => {
      document.removeEventListener('pointerdown', off);
      document.removeEventListener('keydown', off);
    };
  }, [suggest]);

  const show = (p: number) => setUI({ calPage: p, side: 'front' });
  /** Puts a photo into the selected slot of month p, or swaps two months. */
  const intoMonth = async (d: Drag, p: number) => {
    show(p);
    if (d.kind === 'month') {
      if (d.page === p || !n) return;
      const list = [...getState().photos];
      for (let s = 0; s < slotsPer; s++) {
        const a = slotPhotoIndex(s, n, d.page, slotsPer),
          b = slotPhotoIndex(s, n, p, slotsPer);
        if (a !== b) [list[a], list[b]] = [list[b], list[a]];
      }
      setPhotos(list);
    } else if (d.kind === 'card') placePhoto(d.id, target);
    else if (d.kind === 'lib') await putOnCard(d.sp);
  };
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const msgs = await addFiles([...files]);
    if (msgs.length) toast(msgs[0][1]);
  };
  const dragFrom = (d: Drag) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dragging = d;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'chitthi-photo');
    },
    onDragEnd: () => {
      dragging = null;
      setOver(null);
    },
  });

  return (
    <div className="dock cal" role="group" aria-label="Calendar photos" ref={box}>
      <ul className="dock-months" ref={row} role="tablist" aria-label="Months">
        {Array.from({ length: pages }, (_, p) => {
          const ph = photoAt(p),
            { month, year } = calMonth(design, p);
          return (
            <li
              key={p}
              className={`dock-month${p === page ? ' on' : ''}${over === p ? ' over' : ''}`}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                setOver(p);
              }}
              onDragLeave={() => setOver((o) => (o === p ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) void intoMonth(dragging, p);
                dragging = null;
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={p === page}
                aria-label={`${MONTHS[month]} ${year}${ph ? `: ${ph.name}` : ', no photo'}`}
                title={`${MONTHS[month]} ${year}${ph ? '. Drag onto another month to swap photos.' : ''}`}
                onClick={() => show(p)}
                {...(ph ? dragFrom({ kind: 'month', page: p }) : {})}
              >
                {ph ? <PhotoThumb photo={ph} /> : <PlusIcon />}
              </button>
              <span>{MONTHS[month].slice(0, 3)}</span>
            </li>
          );
        })}
      </ul>

      <div className="dock-acts cal-acts" aria-label={monthName}>
        {slotsPer > 1 && (
          <span className="dock-slotpick" role="radiogroup" aria-label="Photo slot">
            {filled.map((_, i) => (
              <button key={i} type="button" role="radio" aria-checked={i === target} title={`Slot ${i + 1}`} onClick={() => selectSlot(i)}>
                {i + 1}
              </button>
            ))}
          </span>
        )}
        <button type="button" title={`Crop ${monthName}'s photo`} aria-label="Crop this month's photo" disabled={!current} onClick={() => current && setUI({ cropId: current.id })}>
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
            onChange={(e) => {
              void add(e.target.files);
              e.target.value = '';
            }}
          />
          <PlusIcon />
          <span className="vh">Add photos</span>
        </label>
        <button type="button" className="dock-tool" disabled={!photos.length} title="Auto-arrange: crop every month around its subject" aria-label="Auto-arrange photos" onClick={autoArrange}>
          <ArrangeIcon />
        </button>
        <button type="button" className="dock-tool" aria-expanded={suggest} title={`Photos that suit ${monthName}`} aria-label="Suggested photos" onClick={() => setSuggest((v) => !v)}>
          <SuggestIcon />
        </button>
        <button type="button" className="dock-tool wide" title="See and choose from all your photos" onClick={() => setUI({ library: true, libraryTab: 'mine' })}>
          <PhotosIcon />
          <span>All photos</span>
        </button>
      </div>

      {suggest && (
        <div className="dock-pop" role="dialog" aria-label="Suggested photos">
          <span className="dock-label">Suggested for {monthName} · tap to use, or drag onto any month</span>
          <ul>
            {spare.map((p) => (
              <li key={p.id}>
                <button type="button" className="dock-ph mine" title={`${p.name} (on this calendar)`} onClick={() => placePhoto(p.id, target)} {...dragFrom({ kind: 'card', id: p.id })}>
                  <PhotoThumb photo={p} />
                </button>
              </li>
            ))}
            {libPicks.map((sp) => (
              <li key={sp.id}>
                <button type="button" className="dock-ph" title={sp.name} onClick={() => void putOnCard(sp)} {...dragFrom({ kind: 'lib', sp })}>
                  <img src={sp.thumb || sp.url} alt="" loading="lazy" decoding="async" draggable={false} />
                </button>
              </li>
            ))}
            {!spare.length && !libPicks.length && <li className="dock-empty">No more photos in your library. Add some, or search Pexels.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
