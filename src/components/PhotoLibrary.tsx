import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutName } from '../data/layouts';
import { productOf } from '../data/products';
import { relevance, type Hue } from '../engine/analyze';
import { resolveTheme } from '../engine/design';
import { isOneOf } from '../engine/guards';
import { photoKey } from '../lib/photoKey';
import { addToLibrary } from '../state/actions';
import { putOnCard, removeStored, useLibrary } from '../state/library';
import { dimsOf, SHAPE_LABEL, slotInfo, useDimsTick } from '../state/photoFit';
import { placePhoto, usePhotoSlots } from '../state/photoSlots';
import { getState, setPhotos, setUI, useApp } from '../state/store';
import { analyzeLibrary, autoArrange, smartFill, traitsForPhoto, traitsOf, useTraitsTick } from '../state/traits';
import type { StoredPhoto } from '../types';
import { Seg } from './common';
import { AddPhotoIcon, CloseIcon } from './icons';
import { AiArtworkEntry } from './ai/AiEntry';
import { PexelsSearch } from './PexelsSearch';
import {
  compareItems,
  cropLossIn,
  FILTERS,
  libraryItems,
  matchesSearch,
  passesFilter,
  passesRefine,
  type Filter,
  type Item,
  type Refine,
  type Sort,
} from './photoLibraryItems';
import { LibraryCard, RefineBar, SlotChips } from './PhotoLibraryParts';

const SORTS: Sort[] = ['rel', 'new', 'old', 'name', 'fit', 'size'];

/**
 * The selected slot's name in sentences.
 * @param count photo slots in the layout
 * @param active the selected slot
 * @returns "slot 2", "the photo slot", or '' without slots
 */
function slotName(count: number, active: number): string {
  if (count > 1) return `slot ${active + 1}`;
  return count ? 'the photo slot' : '';
}

/** Where the library's sources show: your photos, Pexels, or AI pictures. */
type Tab = 'mine' | 'pexels' | 'ai';

/** The empty state's choices. */
interface EmptyLibraryProps {
  hasItems: boolean;
  filter: Filter;
  onShowAll: () => void;
}

/**
 * Nothing to show: an empty library, or a filter that matches nothing (with Show all photos).
 * @param props whether the library has photos, the filter and showing all
 */
function EmptyLibrary({ hasItems, filter, onShowAll }: Readonly<EmptyLibraryProps>) {
  return (
    <div className="empty lib-empty">
      <AddPhotoIcon />
      <p>
        {hasItems
          ? 'No photos match this filter. Try “All”, or crop a photo to fit.'
          : 'Your library is empty. Upload photos, or drop them here. They stay on this device, ready for any design.'}
      </p>
      {hasItems && filter !== 'all' && (
        <button type="button" className="btn" onClick={onShowAll}>
          Show all photos
        </button>
      )}
    </div>
  );
}

/** The filter bar's state and setters. */
interface LibraryFiltersProps {
  count: number;
  active: number;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  query: string;
  onQuery: (query: string) => void;
  sort: Sort;
  onSort: (sort: Sort) => void;
  /** Whether a slot is selected (offers "Best fit for the slot"). */
  hasSlot: boolean;
}

/**
 * The filter chips, the search and the sort.
 * @param props the filter, search and sort with their setters, and the slots
 */
function LibraryFilters({
  count,
  active,
  filter,
  onFilter,
  query,
  onQuery,
  sort,
  onSort,
  hasSlot,
}: Readonly<LibraryFiltersProps>) {
  return (
    <div className="lib-filters">
      <div className="chips" aria-label="Show">
        {FILTERS.filter(([filterId]) => filterId !== 'fit' || count > 0).map(([filterId, label]) => (
          <button
            key={filterId}
            type="button"
            className="chip"
            aria-pressed={filter === filterId}
            onClick={() => onFilter(filterId)}
          >
            {filterId === 'fit' && count > 1 ? `Fits slot ${active + 1}` : label}
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="Search photos"
        placeholder="Search: name, blue, bright, warm, sky…"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
      />
      <select
        aria-label="Sort"
        value={sort}
        onChange={(event) => {
          const value = event.target.value;
          if (isOneOf(SORTS, value)) onSort(value);
        }}
      >
        <option value="rel">Most relevant</option>
        <option value="new">Newest first</option>
        <option value="old">Oldest first</option>
        {hasSlot && <option value="fit">Best fit for the slot</option>}
        <option value="size">Most pixels</option>
        <option value="name">Name</option>
      </select>
    </div>
  );
}

/** The stored photos and whether the design has photos. */
interface ArrangeActionsProps {
  list: StoredPhoto[] | null;
  hasPhotos: boolean;
}

/**
 * Auto-arrange the design's photos, or fill empty slots with the best matches from the library.
 * @param props the stored photos and whether the design has photos
 */
function ArrangeActions({ list, hasPhotos }: Readonly<ArrangeActionsProps>) {
  return (
    <div className="lib-actions">
      <button type="button" className="btn" onClick={autoArrange} disabled={!hasPhotos}>
        Auto-arrange photos in the layout
      </button>
      <button
        type="button"
        className="btn"
        onClick={() => {
          if (list) void smartFill(list);
        }}
        disabled={!list?.length}
      >
        Fill empty slots with the best matches
      </button>
      <span className="hint">
        Photos are analysed for shape, colour, brightness and sharpness, and each crop is centred on its subject.
      </span>
    </div>
  );
}

/**
 * Photo library (header → Photos): every photo on this device in one place. Upload, crop, put in a slot, take off
 * the design or delete. Photos are measured against the selected slot of the current layout, so "Fits this slot"
 * shows only photos whose shape suits it, with how sharp each one will print there.
 */
export function PhotoLibrary() {
  const open = useApp((state) => state.ui.library),
    design = useApp((state) => state.design),
    photos = useApp((state) => state.photos);
  const { list } = useLibrary();
  const { count, active, filled } = usePhotoSlots();
  useDimsTick();
  const dlg = useRef<HTMLDialogElement>(null);
  const tab = useApp((state) => state.ui.libraryTab),
    setTab = (libraryTab: Tab) => setUI({ libraryTab });
  const [filter, setFilter] = useState<Filter>('fit');
  const [sort, setSort] = useState<Sort>('rel');
  const [refine, setRefine] = useState<Refine>({});
  const [relevantOnly, setRelevantOnly] = useState(false);
  useTraitsTick();
  const [query, setQuery] = useState('');
  const [msgs, setMsgs] = useState<['err' | 'warn', string][]>([]);
  const [over, setOver] = useState(false);
  const [sure, setSure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Opening starts without messages, on the photos that fit when the card has slots (during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMsgs([]);
      setFilter(count ? 'fit' : 'all');
    }
  }

  useEffect(() => {
    const dialog = dlg.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (!sure) return;
    const timer = setTimeout(() => setSure(null), 3000);
    return () => {
      clearTimeout(timer);
    };
  }, [sure]);

  const slot = useMemo(() => slotInfo(design, active), [design, active]);
  const items = useMemo(() => libraryItems(list, photos), [list, photos]);

  // Analyse everything once: library photos in the background, card photos straight away.
  useEffect(() => {
    if (open && list) analyzeLibrary(list);
    if (open) photos.forEach(traitsForPhoto);
  }, [open, list, photos]);
  const theme = resolveTheme(design);
  const score = (item: Item) => {
    const traits = traitsOf(item.key);
    return traits ? relevance(traits, slot, theme) : 0;
  };
  const refineContext = { refine, relevantOnly, slot, theme };
  const searched = items.filter((item) => matchesSearch(item, query) && passesRefine(item, refineContext));
  const hues = [...new Set(items.map((item) => traitsOf(item.key)?.hue).filter((hue): hue is Hue => !!hue))];
  const shown = searched
    .filter((item) => passesFilter(item, filter, slot))
    .sort((left, right) => compareItems(left, right, sort, slot, score));
  // With "Fits this slot", the other photos are still offered below, dimmed: they need more cropping.
  const fitSlot = filter === 'fit' ? slot : null;
  const rest = fitSlot
    ? searched
        .filter((item) => !!dimsOf(item.key) && !passesFilter(item, 'fit', fitSlot))
        .toSorted((left, right) => cropLossIn(left, fitSlot) - cropLossIn(right, fitSlot))
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
  const placeItem = async (item: Item) => {
    if (item.sp) await putOnCard(item.sp);
    else {
      const photo = getState().photos.find((candidate) => photoKey(candidate.url) === item.key);
      if (photo) placePhoto(photo.id, active);
    }
  };
  const crop = async (item: Item) => {
    if (item.card < 0) await placeItem(item);
    const photo = getState().photos.find((candidate) => photoKey(candidate.url) === item.key);
    if (photo) setUI({ cropId: photo.id });
  };
  const takeOff = (item: Item) => setPhotos(getState().photos.filter((photo) => photoKey(photo.url) !== item.key));

  const where = slotName(count, active);
  const cardProps = {
    count,
    active,
    slot,
    filled,
    where,
    sure,
    setSure,
    onPlace: (item: Item) => void placeItem(item),
    onCrop: (item: Item) => void crop(item),
    onTakeOff: takeOff,
    onDelete: (id: string) => void removeStored(id),
  };
  return (
    <dialog
      ref={dlg}
      className="galdlg libdlg"
      aria-labelledby="libTitle"
      onClose={() => setUI({ library: false, libraryTab: 'mine' })}
    >
      <div className="galbar">
        <h2 id="libTitle">Photos</h2>
        <span className="hint">
          {items.length} in your library{photos.length ? `, ${photos.length} on this design` : ''}
        </span>
        <div className="lib-tabs">
          <Seg<Tab>
            label="Source"
            value={tab}
            options={[
              ['mine', 'Your photos'],
              ['pexels', 'Find on Pexels'],
              ['ai', 'Create with AI'],
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
            onChange={(event) => {
              void upload(event.target.files);
              event.target.value = '';
            }}
          />
          <AddPhotoIcon />
          {busy ? 'Adding…' : 'Upload'}
        </label>
        <button
          type="button"
          className="btn icon ghost galx"
          aria-label="Close photos"
          onClick={() => dlg.current?.close()}
        >
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
                · {where} is <b>{SHAPE_LABEL[slot.shape].toLowerCase()}</b>, {Math.round(slot.wmm)} ×{' '}
                {Math.round(slot.hmm)} mm
              </>
            )}
          </span>
          {count > 1 && <SlotChips design={design} filled={filled} active={active} />}
        </div>
      )}

      {tab === 'pexels' && (
        <div className="galbody lib-pexels">
          <PexelsSearch wide />
        </div>
      )}
      {tab === 'ai' && (
        <div className="galbody lib-pexels">
          <AiArtworkEntry wide />
        </div>
      )}
      {tab === 'mine' && (
        <div
          className={`galbody lib-body${over ? ' over' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setOver(false);
            void upload(event.dataTransfer.files);
          }}
        >
          <LibraryFilters
            count={count}
            active={active}
            filter={filter}
            onFilter={setFilter}
            query={query}
            onQuery={setQuery}
            sort={sort}
            onSort={setSort}
            hasSlot={!!slot}
          />
          <RefineBar
            hues={hues}
            refine={refine}
            setRefine={setRefine}
            relevantOnly={relevantOnly}
            onRelevantOnly={setRelevantOnly}
          />
          {count > 0 && <ArrangeActions list={list} hasPhotos={photos.length > 0} />}
          {msgs.length > 0 && (
            <ul className="msgs" role="alert">
              {msgs.map(([key, message], index) => (
                <li key={index} className={key}>
                  {message}
                </li>
              ))}
            </ul>
          )}
          {fitSlot && (
            <p className="hint">
              Showing photos whose shape suits {where}: the automatic crop keeps at least 80% of each. Any photo can
              still be cropped by hand.
            </p>
          )}
          {shown.length > 0 && (
            <ul className="lib-grid">
              {shown.map((item) => (
                <LibraryCard key={item.key} item={item} score={score(item)} {...cardProps} />
              ))}
            </ul>
          )}
          {!shown.length && rest.length > 0 && (
            <p className="hint">
              No photo has the right shape for {where} yet: the closest are below. Crop one to fit exactly.
            </p>
          )}
          {!shown.length && !rest.length && (
            <EmptyLibrary hasItems={items.length > 0} filter={filter} onShowAll={() => setFilter('all')} />
          )}
          {rest.length > 0 && (
            <>
              <h3 className="lib-h3">Other shapes: cropped more to fill {where}</h3>
              <ul className="lib-grid">
                {rest.map((item) => (
                  <LibraryCard key={item.key} item={item} dim score={score(item)} {...cardProps} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </dialog>
  );
}
