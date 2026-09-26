import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutName } from '../data/layouts';
import { productOf } from '../data/products';
import { addToLibrary } from '../state/actions';
import { putOnCard, removeStored, useLibrary } from '../state/library';
import {
  cropLoss,
  dimsOf,
  fitsSlot,
  rememberDims,
  shapeOf,
  SHAPE_LABEL,
  sharpness,
  slotDpi,
  slotInfo,
  useDimsTick,
  type PhotoShape,
} from '../state/photoFit';
import { placePhoto, selectSlot, usePhotoSlots } from '../state/photoSlots';
import { photoKey } from '../lib/photoKey';
import { analyzeLibrary, autoArrange, keyOfStored, smartFill, traitsForPhoto, traitsOf, useTraitsTick } from '../state/traits';
import { relevance, type Hue } from '../engine/analyze';
import { resolveTheme } from '../engine/design';
import { getState, setPhotos, setUI, useApp } from '../state/store';
import type { StoredPhoto } from '../types';
import { Seg } from './common';
import { AddPhotoIcon, CloseIcon, CropIcon, TrashIcon } from './icons';
import { PexelsSearch } from './PexelsSearch';

type Filter = 'fit' | 'all' | 'card' | 'unused' | 'uploads' | 'pexels' | PhotoShape;
type Sort = 'rel' | 'new' | 'old' | 'name' | 'fit' | 'size';
type Refine = { hue?: Hue; light?: 'bright' | 'dark'; mood?: 'colourful' | 'muted' | 'warm' | 'cool'; quality?: 'print' | 'sharp' };
const HUE_SWATCH: Record<Hue, string> = {
  red: '#d63a3a',
  orange: '#ef8a2e',
  yellow: '#f2cc38',
  green: '#4aa55a',
  teal: '#2fa6a0',
  blue: '#3a78d6',
  purple: '#8a5ad0',
  pink: '#e06aa8',
  neutral: '#9a948c',
};

interface Item {
  /** Fingerprint (lib/photoKey.ts): identifies the photo. */
  key: string;
  /** What the grid shows: the thumbnail, or the full image for a photo that is only on the design. */
  view: string;
  /** The stored photo, for placing it (its full image loads then). */
  sp?: StoredPhoto;
  /** Pixel size. */
  w?: number;
  h?: number;
  name: string;
  /** Photo store id (absent for a photo that is only on the card). */
  id?: string;
  added: number;
  /** Index in the card's photo list, or -1. */
  card: number;
}

const FILTERS: [Filter, string][] = [
  ['fit', 'Fits this slot'],
  ['all', 'All'],
  ['card', 'On this design'],
  ['unused', 'Not used'],
  ['wide', 'Wide'],
  ['tall', 'Tall'],
  ['square', 'Square'],
  ['uploads', 'Uploaded'],
  ['pexels', 'From Pexels'],
];

/**
 * Photo library (header → Photos): every photo on this device in one place. Upload, crop, put in a slot, take off
 * the design or delete. Photos are measured against the selected slot of the current layout, so "Fits this slot"
 * shows only photos whose shape suits it, with how sharp each one will print there.
 */
export function PhotoLibrary() {
  const open = useApp((s) => s.ui.library),
    design = useApp((s) => s.design),
    photos = useApp((s) => s.photos);
  const { list } = useLibrary();
  const { count, active, filled } = usePhotoSlots();
  useDimsTick();
  const dlg = useRef<HTMLDialogElement>(null);
  const tab = useApp((s) => s.ui.libraryTab),
    setTab = (libraryTab: 'mine' | 'pexels') => setUI({ libraryTab });
  const [filter, setFilter] = useState<Filter>('fit');
  const [sort, setSort] = useState<Sort>('rel');
  const [refine, setRefine] = useState<Refine>({});
  const [relevantOnly, setRelevantOnly] = useState(false);
  useTraitsTick();
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<['err' | 'warn', string][]>([]);
  const [over, setOver] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      setMsgs([]);
      setFilter(count ? 'fit' : 'all');
    } else if (!open && el.open) el.close();
  }, [open, count]);
  useEffect(() => {
    if (!sure) return;
    const t = setTimeout(() => setSure(null), 3000);
    return () => clearTimeout(t);
  }, [sure]);

  const slot = useMemo(() => slotInfo(design, active), [design, active]);
  const items = useMemo<Item[]>(() => {
    const byKey = new Map<string, Item>();
    (list ?? []).forEach((sp) => {
      const key = keyOfStored(sp);
      byKey.set(key, { key, view: sp.thumb || sp.url, sp, name: sp.name, id: sp.id, added: sp.added, card: -1, w: sp.w, h: sp.h });
      if (sp.w && sp.h) rememberDims(key, sp.w, sp.h);
    });
    photos.forEach((p, i) => {
      const key = photoKey(p.url),
        it = byKey.get(key);
      if (it) it.card = i;
      else byKey.set(key, { key, view: p.url, name: p.name, added: 0, card: i });
      rememberDims(key, p.orig.naturalWidth, p.orig.naturalHeight);
    });
    return [...byKey.values()];
  }, [list, photos]);

  // Analyse everything once: library photos in the background, card photos straight away.
  useEffect(() => {
    if (open && list) analyzeLibrary(list);
    if (open) photos.forEach(traitsForPhoto);
  }, [open, list, photos]);
  const theme = resolveTheme(design);
  const score = (it: Item) => {
    const t = traitsOf(it.key);
    return t ? relevance(t, slot, theme) : 0;
  };
  // Search matches the name and the words the analysis found (bright, blue, warm, sky, sharp…).
  const byName = (it: Item) => {
    if (!q.trim()) return true;
    const hay = `${it.name} ${traitsOf(it.key)?.tags.join(' ') ?? ''}`.toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((w) => hay.includes(w));
  };
  const refined = (it: Item) => {
    const t = traitsOf(it.key);
    if (!refine.hue && !refine.light && !refine.mood && !refine.quality && !relevantOnly) return true;
    if (!t) return false;
    if (refine.hue && t.hue !== refine.hue) return false;
    if (refine.light && !t.tags.includes(refine.light)) return false;
    if (refine.mood && !t.tags.includes(refine.mood)) return false;
    if (refine.quality === 'sharp' && t.sharpness < 0.3) return false;
    if (refine.quality === 'print' && slot && 25.4 / Math.max(slot.wmm / t.w, slot.hmm / t.h) < 250) return false;
    if (relevantOnly && relevance(t, slot, theme) < 0.62) return false;
    return true;
  };
  const hues = [...new Set(items.map((it) => traitsOf(it.key)?.hue).filter((h): h is Hue => !!h))];
  const shown = items
    .filter((it) => {
      const dm = dimsOf(it.key),
        pex = /\(Pexels \//.test(it.name);
      if (!byName(it) || !refined(it)) return false;
      switch (filter) {
        case 'fit':
          return !slot || !dm || fitsSlot(dm.w, dm.h, slot.aspect);
        case 'card':
          return it.card >= 0;
        case 'unused':
          return it.card < 0;
        case 'uploads':
          return !pex;
        case 'pexels':
          return pex;
        case 'wide':
        case 'tall':
        case 'square':
          return !!dm && shapeOf(dm.w, dm.h) === filter;
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const da = dimsOf(a.key),
        db = dimsOf(b.key);
      if (sort === 'rel') return score(b) - score(a);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'old') return a.added - b.added;
      if (sort === 'size') return (db ? db.w * db.h : 0) - (da ? da.w * da.h : 0);
      if (sort === 'fit' && slot) return (da ? cropLoss(da.w, da.h, slot.aspect) : 1) - (db ? cropLoss(db.w, db.h, slot.aspect) : 1);
      return b.added - a.added;
    });

  // With "Fits this slot", the other photos are still offered below, dimmed: they need more cropping.
  const rest =
    filter === 'fit' && slot
      ? items.filter((it) => {
          const dm = dimsOf(it.key);
          return byName(it) && refined(it) && !!dm && !fitsSlot(dm.w, dm.h, slot.aspect);
        })
      : [];

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      setMsgs(await addToLibrary([...files]));
    } finally {
      setBusy(false);
    }
  };
  const use = async (it: Item) => {
    if (it.sp) await putOnCard(it.sp);
    else {
      const p = getState().photos.find((x) => photoKey(x.url) === it.key);
      if (p) placePhoto(p.id, active);
    }
  };
  const crop = async (it: Item) => {
    if (it.card < 0) await use(it);
    const ph = getState().photos.find((p) => photoKey(p.url) === it.key);
    if (ph) setUI({ cropId: ph.id });
  };
  const takeOff = (it: Item) => setPhotos(getState().photos.filter((p) => photoKey(p.url) !== it.key));

  const card = (it: Item, dim = false) => {
                const dm = dimsOf(it.key),
                  dpi = dm && slot ? slotDpi(dm.w, dm.h, slot) : null,
                  sh = dpi ? sharpness(dpi) : null,
                  inSlot = filled.findIndex((p) => !!p && photoKey(p.url) === it.key);
                return (
                  <li key={it.key} className={`lib-item${dim ? ' dim' : ''}`}>
                    <button type="button" className="lib-ph" title={count ? `Put in ${where}` : it.name} onClick={() => void use(it)} disabled={!count}>
                      <img
                        src={it.view}
                        alt={it.name}
                        loading="lazy"
                        decoding="async"
                      />
                      {inSlot >= 0 && <b className="lib-badge">{count > 1 ? `Slot ${inSlot + 1}` : 'On design'}</b>}
                      {inSlot < 0 && it.card >= 0 && <b className="lib-badge muted">On design</b>}
                    </button>
                    <div className="lib-meta">
                      <span className="lib-name">{it.name}</span>
                      <span className="lib-facts">
                        {dm ? `${dm.w.toLocaleString()} × ${dm.h.toLocaleString()} · ${SHAPE_LABEL[shapeOf(dm.w, dm.h)]}` : '…'}
                        {sh && <em className={`q ${sh === 'sharp' ? 'good' : sh === 'fine' ? 'ok' : 'low'}`}>{`${sh} (${dpi} dpi)`}</em>}
                      </span>
                      {traitsOf(it.key) && (
                        <span className="lib-tags">
                          <b title="How well this photo suits the selected slot: shape, print sharpness, focus and colours">
                            {Math.round(score(it) * 100)}% match
                          </b>
                          {traitsOf(it.key)!.tags.slice(0, 4).join(' · ')}
                        </span>
                      )}
                    </div>
                    <div className="lib-acts">
                      {count > 0 && (
                        <button type="button" className="sbtn accent" onClick={() => void use(it)}>
                          {count > 1 ? `Use in slot ${active + 1}` : 'Use'}
                        </button>
                      )}
                      {count > 0 && (
                        <button type="button" className="sbtn" aria-label={`Crop ${it.name}`} onClick={() => void crop(it)}>
                          <CropIcon />
                          Crop
                        </button>
                      )}
                      {it.card >= 0 && (
                        <button type="button" className="sbtn" onClick={() => takeOff(it)}>
                          Take off
                        </button>
                      )}
                      {it.id && (
                        <button
                          type="button"
                          className={`sbtn danger${sure === it.id ? ' sure' : ''}`}
                          aria-label={sure === it.id ? `Tap again to delete ${it.name}` : `Delete ${it.name} from the library`}
                          onClick={() => {
                            if (sure !== it.id) setSure(it.id ?? null);
                            else {
                              setSure(null);
                              void removeStored(it.id!);
                            }
                          }}
                        >
                          <TrashIcon />
                          {sure === it.id ? 'Sure?' : ''}
                        </button>
                      )}
                    </div>
                  </li>
                );
  };

  const where = count > 1 ? `slot ${active + 1}` : count ? 'the photo slot' : '';
  return (
    <dialog ref={dlg} className="galdlg libdlg" aria-labelledby="libTitle" onClose={() => setUI({ library: false, libraryTab: 'mine' })}>
      <div className="galbar">
        <h2 id="libTitle">Photos</h2>
        <span className="hint">
          {items.length} in your library{photos.length ? `, ${photos.length} on this design` : ''}
        </span>
        <div className="lib-tabs">
          <Seg<'mine' | 'pexels'>
            label="Source"
            value={tab}
            options={[
              ['mine', 'Your photos'],
              ['pexels', 'Find on Pexels'],
            ]}
            onChange={setTab}
          />
        </div>
        <label className="btn primary">
          <input
            type="file"
            multiple
            hidden
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(e) => {
              void upload(e.target.files);
              e.target.value = '';
            }}
          />
          <AddPhotoIcon />
          {busy ? 'Adding…' : 'Upload'}
        </label>
        <button type="button" className="btn icon ghost galx" aria-label="Close photos" onClick={() => dlg.current?.close()}>
          <CloseIcon />
        </button>
      </div>

      {count > 0 && (
        <div className="lib-context">
          <span>
            <b>{productOf(design.product).name}</b>, {layoutName(design.layout)}
            {slot && (
              <>
                {' '}
                · {where} is <b>{SHAPE_LABEL[slot.shape].toLowerCase()}</b>, {Math.round(slot.wmm)} × {Math.round(slot.hmm)} mm
              </>
            )}
          </span>
          {count > 1 && (
            <div className="chips" role="radiogroup" aria-label="Slot to fill">
              {filled.map((_, i) => {
                const si = slotInfo(design, i);
                return (
                  <button key={i} type="button" role="radio" className="chip" aria-checked={i === active} aria-pressed={i === active} onClick={() => selectSlot(i)}>
                    Slot {i + 1}
                    {si ? ` · ${SHAPE_LABEL[si.shape]}` : ''}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'pexels' ? (
        <div className="galbody lib-pexels">
          <PexelsSearch wide />
        </div>
      ) : (
        <div
          className={`galbody lib-body${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files);
          }}
        >
          <div className="lib-filters">
            <div className="chips" aria-label="Show">
              {FILTERS.filter(([f]) => f !== 'fit' || count > 0).map(([f, l]) => (
                <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {f === 'fit' && count > 1 ? `Fits slot ${active + 1}` : l}
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Search photos"
              placeholder="Search: name, blue, bright, warm, sky…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="rel">Most relevant</option>
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
              {slot && <option value="fit">Best fit for the slot</option>}
              <option value="size">Most pixels</option>
              <option value="name">Name</option>
            </select>
          </div>
          <div className="lib-refine" role="group" aria-label="Refine by what's in the photos">
            <span className="lib-refine-l">Colour</span>
            {hues.map((h) => (
              <button
                key={h}
                type="button"
                className="swatch"
                title={h}
                aria-label={`${h} photos`}
                aria-pressed={refine.hue === h}
                style={{ background: HUE_SWATCH[h] }}
                onClick={() => setRefine((r) => ({ ...r, hue: r.hue === h ? undefined : h }))}
              />
            ))}
            <span className="lib-refine-l">Light</span>
            {(['bright', 'dark'] as const).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={refine.light === k} onClick={() => setRefine((r) => ({ ...r, light: r.light === k ? undefined : k }))}>
                {k}
              </button>
            ))}
            <span className="lib-refine-l">Mood</span>
            {(['colourful', 'muted', 'warm', 'cool'] as const).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={refine.mood === k} onClick={() => setRefine((r) => ({ ...r, mood: r.mood === k ? undefined : k }))}>
                {k}
              </button>
            ))}
            <span className="lib-refine-l">Quality</span>
            {(
              [
                ['print', 'Print-sharp here'],
                ['sharp', 'In focus'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={refine.quality === k} onClick={() => setRefine((r) => ({ ...r, quality: r.quality === k ? undefined : k }))}>
                {l}
              </button>
            ))}
            <label className="check">
              <input type="checkbox" checked={relevantOnly} onChange={(e) => setRelevantOnly(e.target.checked)} /> Relevant only
            </label>
          </div>
          {count > 0 && (
            <div className="lib-actions">
              <button type="button" className="btn" onClick={autoArrange} disabled={!photos.length}>
                Auto-arrange photos in the layout
              </button>
              <button type="button" className="btn" onClick={() => list && void smartFill(list)} disabled={!list?.length}>
                Fill empty slots with the best matches
              </button>
              <span className="hint">
                Photos are analysed for shape, colour, brightness and sharpness, and each crop is centred on its subject.
              </span>
            </div>
          )}
          {msgs.length > 0 && (
            <ul className="msgs" role="alert">
              {msgs.map(([k, m], i) => (
                <li key={i} className={k}>
                  {m}
                </li>
              ))}
            </ul>
          )}
          {filter === 'fit' && slot && (
            <p className="hint">
              Showing photos whose shape suits {where}: the automatic crop keeps at least 80% of each. Any photo can still be
              cropped by hand.
            </p>
          )}
          {shown.length ? (
            <ul className="lib-grid">
              {shown.map((it) => card(it))}
            </ul>
          ) : rest.length ? (
            <p className="hint">No photo has the right shape for {where} yet: the closest are below. Crop one to fit exactly.</p>
          ) : (
            <div className="empty lib-empty">
              <AddPhotoIcon />
              <p>
                {items.length
                  ? 'No photos match this filter. Try “All”, or crop a photo to fit.'
                  : 'Your library is empty. Upload photos, or drop them here. They stay on this device, ready for any design.'}
              </p>
              {items.length > 0 && filter !== 'all' && (
                <button type="button" className="btn" onClick={() => setFilter('all')}>
                  Show all photos
                </button>
              )}
            </div>
          )}
          {rest.length > 0 && (
            <>
              <h3 className="lib-h3">Other shapes: cropped more to fill {where}</h3>
              <ul className="lib-grid">
                {rest
                  .sort((a, b) => {
                    const da = dimsOf(a.key)!,
                      db = dimsOf(b.key)!;
                    return cropLoss(da.w, da.h, slot!.aspect) - cropLoss(db.w, db.h, slot!.aspect);
                  })
                  .map((it) => card(it, true))}
              </ul>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
