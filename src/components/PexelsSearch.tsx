import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MONTHS } from '../data/products';
import { calPages } from '../engine/design';
import { calMonth } from '../engine/render';
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
  const d = useApp((s) => s.design),
    calPage = useApp((s) => s.ui.calPage);
  const { count, active } = usePhotoSlots();
  const page = Math.min(calPage, calPages(d) - 1);
  const fit = slotOrientation(d, active);
  // Only the parts of the design that change the suggestions (not every keystroke in the greeting).
  const ideas = useMemo(
    () => pexelsSuggestions(d, page),
    [d.product, d.themeId, d.useOccasion, d.layout, d.cal.start, d.cal.months, page],
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

  const q = query ?? ideas[0] ?? 'nature';
  const orientation = shape === 'fit' ? fit : shape === 'any' ? null : shape;

  useEffect(() => onPexelsKey(() => setKeyTick((k) => k + 1)), []);

  const search = async (pageNo: number) => {
    const id = ++run.current;
    if (pageNo === 1) setStatus({ kind: 'loading' });
    else setMore(true);
    try {
      const r = await searchPexels(q, orientation, pageNo);
      if (id !== run.current) return;
      setStatus((cur) => ({
        kind: 'ready',
        photos: pageNo > 1 && cur.kind === 'ready' ? [...cur.photos, ...r.photos.filter((p) => !cur.photos.some((x) => x.id === p.id))] : r.photos,
        more: !!r.next_page,
        page: pageNo,
        total: r.total_results,
      }));
    } catch (e) {
      if (id !== run.current) return;
      if (e instanceof PexelsKeyError) setStatus({ kind: 'key', refused: e.refused });
      else setStatus({ kind: 'error', msg: e instanceof Error ? e.message : 'The search didn’t work.' });
    } finally {
      if (id === run.current) setMore(false);
    }
  };

  const hidden = pexelsHidden();
  // Search whenever the words, the slot shape or the key change.
  useEffect(() => {
    if (!hidden) void search(1);
  }, [q, orientation, keyTick, hidden]);

  const add = async (p: PexelsPhoto) => {
    setBusy(p.id);
    // The preview shows a loader too: the full-size photo can take a few seconds.
    setUI({ loading: `Downloading ${p.photographer}’s photo from Pexels…` });
    try {
      const ph = await fetchPexels(p);
      await storePhotos([ph]);
      await putOnCard({ id: '', added: Date.now(), ...ph });
      toast(`Added to ${where}. Photo by ${p.photographer} on Pexels.`);
    } catch {
      toast('That photo couldn’t be downloaded from Pexels. Try another one.');
    } finally {
      setBusy(null);
      setUI({ loading: null });
    }
  };

  const where =
    d.product === 'calendar' && d.layout !== 'cal-strip'
      ? `${count > 1 ? `slot ${active + 1} of ` : ''}${MONTHS[calMonth(d, page).month]}`
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
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          setQuery(t || null);
        }}
      >
        <input type="search" aria-label="Search Pexels photos" placeholder={`Search free photos, e.g. ${ideas[0] ?? 'sunset'}`} value={text} onChange={(e) => setText(e.target.value)} />
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
            aria-pressed={q === x}
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
                ? `Tap a photo to put it in ${where}. “${q}”${orientation ? `, ${SHAPE_NAMES[orientation]} photos` : ''}.`
                : `Nothing found for “${q}”. Try other words, or a different shape.`
              : `Searching Pexels for “${q}”…`}
          </p>
          <ul className="px-grid" aria-busy={status.kind === 'loading'} style={{ '--px-aspect': ASPECT[tileShape] } as CSSProperties}>
            {status.kind === 'ready'
              ? status.photos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="px-ph"
                      style={{ background: p.avg_color }}
                      disabled={busy !== null}
                      aria-busy={busy === p.id}
                      title={`${p.alt || 'Photo'} by ${p.photographer}`}
                      onClick={() => void add(p)}
                    >
                      <img
                        src={wide ? p.src.large : p.src.medium}
                        alt={p.alt || `Photo by ${p.photographer}`}
                        loading="lazy"
                        decoding="async"
                        className={loaded.has(p.id) ? 'loaded' : undefined}
                        onLoad={() => setLoaded((s) => new Set(s).add(p.id))}
                      />
                      {!loaded.has(p.id) && <span className="px-shimmer" aria-hidden="true" />}
                      {busy === p.id && (
                        <span className="px-busy">
                          <span className="spinner" aria-hidden="true" />
                          Adding…
                        </span>
                      )}
                      <small>{p.photographer}</small>
                    </button>
                  </li>
                ))
              : Array.from({ length: wide ? 12 : 6 }, (_, i) => (
                  <li key={i}>
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
