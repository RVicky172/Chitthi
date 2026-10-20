import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react';
import { MONTHS } from '../data/products';
import { calPages } from '../engine/design';
import { calMonth } from '../engine/calendarDraw';
import {
  fetchPexels,
  onPexelsKey,
  pexelsHidden,
  PexelsKeyError,
  pexelsSuggestions,
  searchPexels,
  slotOrientation,
  type PexelsOrientation,
  type PexelsPhoto,
} from '../lib/pexels';
import { toast } from '../lib/toast';
import { putOnCard, storePhotos } from '../state/library';
import { usePhotoSlots } from '../state/photoSlots';
import { setUI, useApp } from '../state/store';
import type { Design } from '../types';
import { Seg } from './common';
import { FoldSection } from './panel';
import { ExpandIcon, SearchIcon } from './icons';
import { logError } from '../lib/errors';

type Shape = 'fit' | 'any' | PexelsOrientation;
type Status =
  | { kind: 'idle' | 'loading' }
  | { kind: 'ready'; photos: PexelsPhoto[]; more: boolean; page: number; total: number }
  | { kind: 'error'; msg: string }
  | { kind: 'key'; refused: boolean };

const SHAPE_NAMES: Record<PexelsOrientation, string> = { landscape: 'wide', portrait: 'tall', square: 'square' };
const ASPECT: Record<PexelsOrientation, string> = { landscape: '4 / 3', portrait: '3 / 4', square: '1 / 1' };

/**
 * The results so far with a further page added after them, leaving out photos already shown.
 * @param shown the results so far
 * @param page the next page's photos
 * @returns the combined list
 */
function withNewPhotos(shown: PexelsPhoto[], page: PexelsPhoto[]): PexelsPhoto[] {
  const shownIds = new Set(shown.map((photo) => photo.id));
  return [...shown, ...page.filter((photo) => !shownIds.has(photo.id))];
}

/**
 * The orientation to search for.
 * @param shape the shape chosen
 * @param fit the selected slot's orientation, if any
 * @returns the orientation, or null for any
 */
function orientationFor(shape: Shape, fit: PexelsOrientation | null): PexelsOrientation | null {
  if (shape === 'fit') return fit;
  return shape === 'any' ? null : shape;
}

/**
 * Where a photo goes, in words: a calendar month's slot, a slot, or the card.
 * @param design the design
 * @param count photo slots in the layout
 * @param active the selected slot
 * @param page the calendar page shown
 * @returns the place
 */
function targetName(design: Design, count: number, active: number, page: number): string {
  const slot = count > 1 ? `slot ${active + 1}` : '';
  if (design.product === 'calendar' && design.layout !== 'cal-strip') {
    const month = MONTHS.at(calMonth(design, page).month) ?? '';
    return slot ? `${slot} of ${month}` : month;
  }
  return slot || 'the card';
}

/**
 * The line above the results: how to use them, nothing found, or searching.
 * @param status the search's status
 * @param where where a photo goes
 * @param searchFor the words searched
 * @param orientation the shape searched, if any
 * @returns the line
 */
function statusLine(status: Status, where: string, searchFor: string, orientation: PexelsOrientation | null): string {
  if (status.kind !== 'ready') return `Searching Pexels for “${searchFor}”…`;
  if (!status.photos.length) return `Nothing found for “${searchFor}”. Try other words, or a different shape.`;
  const shapeNote = orientation ? `, ${SHAPE_NAMES[orientation]} photos` : '';
  return `Tap a photo to put it in ${where}. “${searchFor}”${shapeNote}.`;
}

/** A result and its state. */
interface PexelsTileProps {
  photo: PexelsPhoto;
  wide: boolean;
  loaded: boolean;
  /** The photo being added, if any (every tile is disabled meanwhile). */
  busy: number | null;
  onAdd: (photo: PexelsPhoto) => void;
  onLoaded: (id: number) => void;
}

/**
 * A result: the photo (tap to add it) and its linked credit, as Pexels asks.
 * @param props the photo, its state and the actions
 */
function PexelsTile({ photo, wide, loaded, busy, onAdd, onLoaded }: Readonly<PexelsTileProps>) {
  return (
    <li>
      <button
        type="button"
        className="px-ph"
        style={{ background: photo.avg_color }}
        disabled={busy !== null}
        aria-busy={busy === photo.id}
        title={`${photo.alt || 'Photo'} by ${photo.photographer}`}
        onClick={() => onAdd(photo)}
      >
        <img
          src={wide ? photo.src.large : photo.src.medium}
          alt={photo.alt || `Photo by ${photo.photographer}`}
          loading="lazy"
          decoding="async"
          className={loaded ? 'loaded' : undefined}
          onLoad={() => onLoaded(photo.id)}
        />
        {!loaded && <span className="px-shimmer" aria-hidden="true" />}
        {busy === photo.id && (
          <span className="px-busy">
            <span className="spinner" aria-hidden="true" />
            Adding…
          </span>
        )}
      </button>
      {/* Pexels asks for a linked credit: "Photo by … on Pexels". */}
      <p className="px-by">
        Photo by{' '}
        <a href={photo.photographer_url} target="_blank" rel="noopener noreferrer">
          {photo.photographer}
        </a>{' '}
        on{' '}
        <a href={photo.url} target="_blank" rel="noopener noreferrer">
          Pexels
        </a>
      </p>
    </li>
  );
}

/** The search's results and what they can do. */
interface PexelsResultsProps {
  status: Status;
  wide: boolean;
  line: string;
  tileShape: PexelsOrientation;
  loaded: Set<number>;
  busy: number | null;
  more: boolean;
  onAdd: (photo: PexelsPhoto) => void;
  onLoaded: (id: number) => void;
  onSearch: (page: number) => void;
}

/**
 * The results: the key form, an error with Try again, or the grid (placeholders while searching) and More photos.
 * @param props the status, the layout and the actions
 */
function PexelsResults(props: Readonly<PexelsResultsProps>) {
  const { status, wide, loaded, busy, more } = props;
  if (status.kind === 'key') return <KeyForm refused={status.refused} />;
  if (status.kind === 'error')
    return (
      <p className="hint" role="alert">
        {status.msg}{' '}
        <button type="button" className="linkbtn" onClick={() => props.onSearch(1)}>
          Try again
        </button>
      </p>
    );
  return (
    <>
      <p className="hint" aria-live="polite">
        {props.line}
      </p>
      <ul
        className="px-grid"
        aria-busy={status.kind === 'loading'}
        style={{ '--px-aspect': ASPECT[props.tileShape] } as CSSProperties}
      >
        {status.kind === 'ready'
          ? status.photos.map((photo) => (
              <PexelsTile
                key={photo.id}
                photo={photo}
                wide={wide}
                loaded={loaded.has(photo.id)}
                busy={busy}
                onAdd={props.onAdd}
                onLoaded={props.onLoaded}
              />
            ))
          : Array.from({ length: wide ? 12 : 6 }, (_, index) => (
              <li key={index}>
                <span className="skel px-skel" />
              </li>
            ))}
      </ul>
      {status.kind === 'ready' && status.more && (
        <button type="button" className="btn" disabled={more} onClick={() => props.onSearch(status.page + 1)}>
          {more && <span className="spinner" aria-hidden="true" />}
          {more ? 'Loading…' : 'More photos'}
        </button>
      )}
    </>
  );
}

/**
 * Search Pexels from inside the Photos step. Suggestions come from the design (month, occasion, product) and results
 * are filtered to the shape of the selected photo slot, so they drop into the layout without heavy cropping.
 * @param props whether it fills the photo library (wide) instead of a section of the Photos step
 */
export function PexelsSearch({ wide = false }: Readonly<{ wide?: boolean }>) {
  const design = useApp((state) => state.design),
    calPage = useApp((state) => state.ui.calPage);
  const { count, active } = usePhotoSlots();
  const page = Math.min(calPage, calPages(design) - 1);
  const fit = slotOrientation(design, active);
  // A few table lookups: cheap enough to work out on each render (the search follows only the first word).
  const ideas = pexelsSuggestions(design, page);
  const [text, setText] = useState('');
  const [query, setQuery] = useState<string | null>(null); // null: follow the suggestions
  const [shape, setShape] = useState<Shape>('fit');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [busy, setBusy] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [more, setMore] = useState(false);
  const [keyTick, setKeyTick] = useState(0);
  const run = useRef(0);

  const searchFor = query ?? ideas.at(0) ?? 'nature';
  const orientation = orientationFor(shape, fit);

  useEffect(() => onPexelsKey(() => setKeyTick((tick) => tick + 1)), []);

  /**
   * Fetches one page of results into the status (the caller shows that it is loading).
   * A promise chain rather than `await`: React's lint reads state set after an `await` as set synchronously in the
   * effect that starts the search.
   * @param pageNo the page, from 1
   * @returns when the page is in (or the search failed, or a newer one replaced it)
   */
  const fetchPage = (pageNo: number): Promise<void> => {
    const id = ++run.current;
    const isLatest = () => id === run.current;
    return searchPexels(searchFor, orientation, pageNo)
      .then(
        (result) => {
          if (!isLatest()) return;
          setStatus((cur) => ({
            kind: 'ready',
            photos: pageNo > 1 && cur.kind === 'ready' ? withNewPhotos(cur.photos, result.photos) : result.photos,
            more: !!result.next_page,
            page: pageNo,
            total: result.total_results,
          }));
        },
        (error: unknown) => {
          if (!isLatest()) return;
          // A missing or refused key is a state the panel explains (add a key), not a failure to report.
          if (error instanceof PexelsKeyError) setStatus({ kind: 'key', refused: error.refused });
          else {
            logError('handled', error);
            setStatus({ kind: 'error', msg: error instanceof Error ? error.message : 'The search didn’t work.' });
          }
        },
      )
      .finally(() => {
        if (isLatest()) setMore(false);
      });
  };

  /**
   * Shows the loading state, then fetches a page (the first page replaces the results, later ones add to them).
   * @param pageNo the page, from 1
   * @returns when the page is in
   */
  const search = (pageNo: number) => {
    if (pageNo === 1) setStatus({ kind: 'loading' });
    else setMore(true);
    return fetchPage(pageNo);
  };

  const hidden = pexelsHidden();
  // Search whenever the words, the slot shape or the key change: loading shows from this render, the fetch starts
  // in the effect.
  const searchKey = hidden ? null : `${searchFor}\n${orientation ?? ''}\n${String(keyTick)}`;
  const [searchedKey, setSearchedKey] = useState<string | null>(null);
  if (searchKey !== searchedKey) {
    setSearchedKey(searchKey);
    if (searchKey !== null) setStatus({ kind: 'loading' });
  }
  const searchFirstPage = useEffectEvent(() => void fetchPage(1));
  useEffect(() => {
    if (searchKey !== null) searchFirstPage();
  }, [searchKey]);

  const where = targetName(design, count, active, page);
  const add = async (photo: PexelsPhoto) => {
    setBusy(photo.id);
    // The preview shows a loader too: the full-size photo can take a few seconds.
    setUI({ loading: `Downloading ${photo.photographer}’s photo from Pexels…` });
    try {
      const fetched = await fetchPexels(photo);
      await storePhotos([fetched]);
      await putOnCard({ id: '', added: Date.now(), ...fetched });
      toast(`Added to ${where}. Photo by ${photo.photographer} on Pexels.`);
    } catch (error) {
      logError('handled', error);
      toast('That photo couldn’t be downloaded from Pexels. Try another one.');
    } finally {
      setBusy(null);
      setUI({ loading: null });
    }
  };

  if (hidden) return null;
  const body = (
    <div className={`px${wide ? ' wide' : ''}`}>
      {!wide && (
        <button type="button" className="btn px-expand" onClick={() => setUI({ library: true, libraryTab: 'pexels' })}>
          <ExpandIcon />
          Expand to full screen
        </button>
      )}
      <form
        className="px-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = text.trim();
          setQuery(trimmed || null);
        }}
      >
        <input
          type="search"
          aria-label="Search Pexels photos"
          placeholder={`Search free photos, e.g. ${ideas.at(0) ?? 'sunset'}`}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="btn icon" aria-label="Search">
          <SearchIcon />
        </button>
      </form>
      <div className="chips" aria-label="Suggested searches">
        {ideas.map((x) => (
          <button
            key={x}
            type="button"
            className="chip"
            aria-pressed={searchFor === x}
            onClick={() => {
              setText('');
              setQuery(x);
            }}
          >
            {x}
          </button>
        ))}
      </div>
      <Seg<Shape>
        label="Photo shape"
        value={shape}
        options={[
          ['fit', fit ? `Fits slot (${SHAPE_NAMES[fit]})` : 'Fits slot'],
          ['landscape', 'Wide'],
          ['portrait', 'Tall'],
          ['square', 'Square'],
          ['any', 'Any'],
        ]}
        onChange={setShape}
      />
      <PexelsResults
        status={status}
        wide={wide}
        line={statusLine(status, where, searchFor, orientation)}
        tileShape={orientation ?? 'square'}
        loaded={loaded}
        busy={busy}
        more={more}
        onAdd={(photo) => void add(photo)}
        onLoaded={(id) => setLoaded((loadedIds) => new Set(loadedIds).add(id))}
        onSearch={(pageNo) => void search(pageNo)}
      />
      <p className="hint px-credit">
        Photos provided by{' '}
        <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">
          Pexels
        </a>
        , free to use under the{' '}
        <a href="https://www.pexels.com/license/" target="_blank" rel="noopener noreferrer">
          Pexels license
        </a>
        . Each photo keeps its photographer’s name.{' '}
        <button type="button" className="linkbtn" onClick={() => setUI({ settings: true })}>
          Search settings
        </button>
      </p>
    </div>
  );
  return wide ? (
    body
  ) : (
    <FoldSection id="photos.pexels" title="Free photos from Pexels">
      {body}
    </FoldSection>
  );
}

/**
 * No key on this device and no server proxy: point to Settings, the one place the key is entered.
 * @param props whether Pexels refused the saved key
 */
function KeyForm({ refused }: Readonly<{ refused: boolean }>) {
  return (
    <div className="px-key">
      <p className="hint">
        {refused
          ? 'Pexels didn’t accept the saved API key. Enter it again in Settings.'
          : 'Photo search needs a free Pexels API key. Add yours in Settings; it’s kept on this device only.'}
      </p>
      <button type="button" className="btn primary" onClick={() => setUI({ settings: true })}>
        Open settings
      </button>
    </div>
  );
}
