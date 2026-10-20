import { useMemo, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react';
import { isMissing } from '../../engine/mediaFile';
import { scanSnapshot, subscribeScans } from '../../state/soundScan';
import { poolKey, poolOf, useVideo, type PoolItem } from '../../state/videoStore';
import { MusicIcon, PlusIcon, TrashIcon } from '../icons';
import { EmptyState, ListRow } from '../panel';
import { addToTimeline, removeAsking } from './poolActions';
import { POOL_DRAG, POOL_FILTERS, filterPool, firstSoundKinds, poolDetail, usageCounts, type PoolFilter } from './poolList';
import { FindFileButton } from './ProjectStatus';

/*
 * The media pool's list in the Media panel (504 §5–§7): filter chips, a name search, and a row for each file of the
 * project with its thumbnail, length, kind and use count. Double-click or Enter on a row, or its add button, puts the
 * file at the playhead (D1); its remove button takes it out of the project, asking first when it is used (D4).
 */

/** Bars in a sound's little waveform. */
const WAVE_BARS = 16;

/**
 * A sound file's thumbnail: a few bars of its scanned waveform, or a note while it is being scanned.
 * @param props the file's URL
 * @param props.url the URL its scan is kept under
 */
function PoolWave({ url }: Readonly<{ url: string }>) {
  const { scans } = useSyncExternalStore(subscribeScans, scanSnapshot);
  const scan = scans.get(url);
  if (!scan?.peaks.length) return <MusicIcon />;
  const { peaks } = scan;
  const step = peaks.length / WAVE_BARS;
  const bars = Array.from({ length: WAVE_BARS }, (_, bar) => {
    let loudest = 0;
    for (let index = Math.floor(bar * step); index < Math.floor((bar + 1) * step); index++) loudest = Math.max(loudest, peaks[index] ?? 0);
    return loudest / 255;
  });
  return (
    <svg className="mst-pool-wave" viewBox={`0 0 ${WAVE_BARS * 3} 24`} aria-hidden="true">
      {bars.map((height, bar) => {
        const size = Math.max(1, height * 22);
        // A bar per slice, centred on the line.
        return <rect key={bar} x={bar * 3} y={12 - size / 2} width={2} height={size} rx={1} />;
      })}
    </svg>
  );
}

/**
 * A row's thumbnail: the picture, or the sound's waveform.
 * @param props the item
 * @param props.item the pool item
 */
function PoolThumb({ item }: Readonly<{ item: PoolItem }>) {
  if (item.kind === 'audio') return <PoolWave url={item.url} />;
  return item.thumb ? <img className="mst-pool-thumb" src={item.thumb} alt="" /> : <span className="mst-pool-thumb" />;
}

/**
 * The row whose main button an event came from.
 * @param event a click or key on the list
 * @returns the row's pool key, or null
 */
const rowKey = (event: MouseEvent | KeyboardEvent): string | null =>
  event.target instanceof Element ? (event.target.closest<HTMLElement>('.list-row-main')?.dataset.id ?? null) : null;

/** The media pool's list (see the file's comment). */
export function MediaPool() {
  const items = useVideo(poolOf);
  const clips = useVideo((state) => state.clips);
  const sounds = useVideo((state) => state.sounds);
  const tracks = useVideo((state) => state.tracks);
  const counts = useMemo(() => usageCounts({ clips, sounds }), [clips, sounds]);
  const kinds = useMemo(() => firstSoundKinds({ tracks, sounds }), [tracks, sounds]);
  const [filter, setFilter] = useState<PoolFilter>('all');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const shown = filterPool(items, filter, query);
  if (!items.length)
    return (
      <EmptyState tone="panel" icon={<MusicIcon />} title="No media yet">
        Videos, photos and sound you add above wait here until you put them on the timeline.
      </EmptyState>
    );
  return (
    <div className="mst-pool">
      <div className="chips mst-pool-filters" role="group" aria-label="Show">
        {POOL_FILTERS.map(([value, label]) => (
          <button key={value} type="button" className="chip" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      <input type="search" className="mst-pool-search" placeholder="Search by name" aria-label="Search the media by name" value={query} onChange={(event) => setQuery(event.target.value)} />
      {shown.length === 0 ? (
        <p className="hint">Nothing here matches. Try another filter or name.</p>
      ) : (
        <ul
          className="mst-pool-list"
          aria-label="The project’s media"
          onDoubleClick={(event) => {
            const key = rowKey(event);
            if (key !== null) addToTimeline(key);
          }}
          onKeyDown={(event) => {
            const key = rowKey(event);
            if (event.key !== 'Enter' || key === null) return;
            // Enter adds; Space still just chooses the row.
            event.preventDefault();
            addToTimeline(key);
          }}
        >
          {shown.map((item) => {
            const key = poolKey(item);
            const missing = isMissing(item.file);
            return (
              <ListRow
                key={key}
                rowId={key}
                lead={<PoolThumb item={item} />}
                name={item.name}
                detail={`${poolDetail(item, counts.get(key) ?? 0, kinds.get(key))}${missing ? ' · Missing' : ''}`}
                selected={chosen === key}
                onSelect={() => setChosen(key)}
                draggable
                onDragStart={(event) => {
                  // Dropped on a timeline row, it goes there (504 §6); Enter is the keyboard's way.
                  event.dataTransfer.setData(POOL_DRAG, key);
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                className={missing ? 'mst-pool-missing' : undefined}
                controls={
                  <>
                    {missing && !(item.file instanceof Blob) && <FindFileButton file={item.file} />}
                    <button type="button" className="pbtn" aria-label={`Add ${item.name} at the playhead`} title="Add at the playhead (or double-click, Enter)" onClick={() => addToTimeline(key)}>
                      <PlusIcon />
                    </button>
                    <button type="button" className="pbtn" aria-label={`Remove ${item.name} from the project`} title="Remove from the project" onClick={() => removeAsking(item)}>
                      <TrashIcon />
                    </button>
                  </>
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
