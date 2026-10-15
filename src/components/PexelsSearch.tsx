import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { Section, Seg } from './common';
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
 * Search Pexels from inside the Photos step. Suggestions come from the design (month, occasion, product) and results
 * are filtered to the shape of the selected photo slot, so they drop into the layout without heavy cropping.
 */
export function PexelsSearch({ wide = false }: { wide?: boolean }) {
  const design = useApp((state) => state.design),
    calPage = useApp((state) => state.ui.calPage);
  const { count, active } = usePhotoSlots();
  const page = Math.min(calPage, calPages(design) - 1);
  const fit = slotOrientation(design, active);
  // Only the parts of the design that change the suggestions (not every keystroke in the greeting).
  const ideas = useMemo(
    () => pexelsSuggestions(design, page),
    [design.product, design.themeId, design.useOccasion, design.layout, design.cal.start, design.cal.months, page],
  );
  const [text, setText] = useState('');
  const [query, setQuery] = useState<string | null>(null); // null: follow the suggestions
  const [shape, setShape] = useState<Shape>('fit');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [busy, setBusy] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set());
  const [more, setMore] = useState(false);
  const [keyTick, setKeyTick] = useState(0);
  const run = useRef(0);

  const searchFor = query ?? ideas[0] ?? 'nature';
  const orientation = shape === 'fit' ? fit : shape === 'any' ? null : shape;

  useEffect(() => onPexelsKey(() => setKeyTick((tick) => tick + 1)), []);

  const search = async (pageNo: number) => {
    const id = ++run.current;
    if (pageNo === 1) setStatus({ kind: 'loading' });
    else setMore(true);
    try {
      const result = await searchPexels(searchFor, orientation, pageNo);
      if (id !== run.current) return;
      setStatus((cur) => ({
        kind: 'ready',
        photos:
          pageNo > 1 && cur.kind === 'ready'
            ? [...cur.photos, ...result.photos.filter((photo) => !cur.photos.some((x) => x.id === photo.id))]
            : result.photos,
        more: !!result.next_page,
        page: pageNo,
        total: result.total_results,
      }));
    } catch (error) {
      if (id !== run.current) return;
      // A missing or refused key is a state the panel explains (add a key), not a failure to report.
      if (error instanceof PexelsKeyError) setStatus({ kind: 'key', refused: error.refused });
      else {
        logError('handled', error);
        setStatus({ kind: 'error', msg: error instanceof Error ? error.message : 'The search didn’t work.' });
      }
    } finally {
      if (id === run.current) setMore(false);
    }
  };

  const hidden = pexelsHidden();
  // Search whenever the words, the slot shape or the key change.
  useEffect(() => {
    if (!hidden) void search(1);
  }, [searchFor, orientation, keyTick, hidden]);

  const add = async (photo: PexelsPhoto) => {
    setBusy(photo.id);
    // The preview shows a loader too: the full-size photo can take a few seconds.
    setUI({ loading: `Downloading ${photo.photographer}’s photo from Pexels…` });
    try {
      const ph = await fetchPexels(photo);
      await storePhotos([ph]);
      await putOnCard({ id: '', added: Date.now(), ...ph });
      toast(`Added to ${where}. Photo by ${photo.photographer} on Pexels.`);
    } catch (error) {
      logError('handled', error);
      toast('That photo couldn’t be downloaded from Pexels. Try another one.');
    } finally {
      setBusy(null);
      setUI({ loading: null });
    }
  };

  const where =
    design.product === 'calendar' && design.layout !== 'cal-strip'
      ? `${count > 1 ? `slot ${active + 1} of ` : ''}${MONTHS[calMonth(design, page).month]}`
      : count > 1
        ? `slot ${active + 1}`
        : 'the card';
  const tileShape = orientation ?? 'square';

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
          placeholder={`Search free photos, e.g. ${ideas[0] ?? 'sunset'}`}
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
      {status.kind === 'key' ? (
        <KeyForm refused={status.refused} />
      ) : status.kind === 'error' ? (
        <p className="hint" role="alert">
          {status.msg}{' '}
          <button type="button" className="linkbtn" onClick={() => void search(1)}>
            Try again
          </button>
        </p>
      ) : (
        <>
          <p className="hint" aria-live="polite">
            {status.kind === 'ready'
              ? status.photos.length
                ? `Tap a photo to put it in ${where}. “${searchFor}”${orientation ? `, ${SHAPE_NAMES[orientation]} photos` : ''}.`
                : `Nothing found for “${searchFor}”. Try other words, or a different shape.`
              : `Searching Pexels for “${searchFor}”…`}
          </p>
          <ul
            className="px-grid"
            aria-busy={status.kind === 'loading'}
            style={{ '--px-aspect': ASPECT[tileShape] } as CSSProperties}
          >
            {status.kind === 'ready'
              ? status.photos.map((photo) => (
                  <li key={photo.id}>
                    <button
                      type="button"
                      className="px-ph"
                      style={{ background: photo.avg_color }}
                      disabled={busy !== null}
                      aria-busy={busy === photo.id}
                      title={`${photo.alt || 'Photo'} by ${photo.photographer}`}
                      onClick={() => void add(photo)}
                    >
                      <img
                        src={wide ? photo.src.large : photo.src.medium}
                        alt={photo.alt || `Photo by ${photo.photographer}`}
                        loading="lazy"
                        decoding="async"
                        className={loaded.has(photo.id) ? 'loaded' : undefined}
                        onLoad={() => setLoaded((loadedIds) => new Set(loadedIds).add(photo.id))}
                      />
                      {!loaded.has(photo.id) && <span className="px-shimmer" aria-hidden="true" />}
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
                ))
              : Array.from({ length: wide ? 12 : 6 }, (_, index) => (
                  <li key={index}>
                    <span className="skel px-skel" />
                  </li>
                ))}
          </ul>
          {status.kind === 'ready' && status.more && (
            <button type="button" className="btn" disabled={more} onClick={() => void search(status.page + 1)}>
              {more && <span className="spinner" aria-hidden="true" />}
              {more ? 'Loading…' : 'More photos'}
            </button>
          )}
        </>
      )}
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
    <Section id="photos.pexels" title="Free photos from Pexels">
      {body}
    </Section>
  );
}

/** No key on this device and no server proxy: point to Settings, the one place the key is entered. */
function KeyForm({ refused }: { refused: boolean }) {
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
