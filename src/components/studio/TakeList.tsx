import { useEffect, useRef, useState } from 'react';
import { isMissing } from '../../engine/mediaFile';
import { getVideo, selectSound, setPlaying, subscribeVideo, useVideo } from '../../state/videoStore';
import { renameTake, takesOf, type TakeRow } from '../../state/videoTakes';
import { EditIcon, MusicIcon, PlayIcon, PlusIcon, StopIcon, TrashIcon } from '../icons';
import { EmptyState, ListRow } from '../panel';
import { KindChip } from './KindChip';
import { addToTimeline, removeAsking } from './poolActions';
import { takeDetail, takePlaceText } from './takeListText';
import { revealOnTimeline, tell } from './timelineActions';

/*
 * The Audio panel's Recordings section (505 §3, AC-1): every voice take of the project, newest first, with its length,
 * when and with which microphone it was recorded, and where it is used. Choosing a row selects its first clip and
 * scrolls the timeline to it; Play previews the whole file alone (one take at a time, never over the video); Rename,
 * Add at the playhead and Delete (asking when it is used) are the row's controls.
 */

/** One take's row. */
interface TakeItemProps {
  row: TakeRow;
  selected: boolean;
  playing: boolean;
  renaming: boolean;
  onPlay: () => void;
  onStartRename: () => void;
  onRename: (name: string | null) => void;
}

/**
 * A take's row (see the file's comment).
 * @param props the take, its state and what its controls do
 */
function TakeItem({ row, selected, playing, renaming, onPlay, onStartRename, onRename }: Readonly<TakeItemProps>) {
  const { item, place } = row;
  const missing = isMissing(item.file);
  return (
    <ListRow
      rowId={row.key}
      name={item.name}
      detail={
        <>
          <span className="mst-take-line">
            <KindChip kind="voice" /> {takeDetail(item)}
          </span>
          <span className="mst-take-line">{missing ? 'Missing' : takePlaceText(row)}</span>
        </>
      }
      selected={selected}
      onSelect={() => {
        if (!place) return;
        selectSound(place.sound);
        revealOnTimeline(place.start, place.trackId);
      }}
      editor={
        renaming ? (
          <input
            className="mst-take-name"
            aria-label={`New name for ${item.name}`}
            defaultValue={item.name}
            maxLength={200}
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') onRename(event.currentTarget.value);
              if (event.key === 'Escape') {
                event.preventDefault();
                onRename(null);
              }
            }}
            onBlur={(event) => onRename(event.currentTarget.value)}
          />
        ) : undefined
      }
      className={missing ? 'mst-pool-missing' : undefined}
      controls={
        <>
          <button type="button" className="pbtn" aria-label={`${playing ? 'Stop' : 'Play'} ${item.name}`} aria-pressed={playing} title={playing ? 'Stop' : 'Play this take alone'} disabled={missing} onClick={onPlay}>
            {playing ? <StopIcon /> : <PlayIcon />}
          </button>
          <button type="button" className="pbtn" aria-label={`Rename ${item.name}`} title="Rename" onClick={onStartRename}>
            <EditIcon />
          </button>
          <button type="button" className="pbtn" aria-label={`Add ${item.name} at the playhead`} title="Add at the playhead" disabled={missing} onClick={() => addToTimeline(row.key)}>
            <PlusIcon />
          </button>
          <button type="button" className="pbtn" aria-label={`Delete ${item.name}`} title="Delete from the project" onClick={() => removeAsking(item)}>
            <TrashIcon />
          </button>
        </>
      }
    />
  );
}

/**
 * Points the preview at a take, from its start.
 * @param element the preview's element
 * @param url the take's file
 */
function playTake(element: HTMLAudioElement, url: string): void {
  element.src = url;
  element.currentTime = 0;
}

/**
 * The preview of one take at a time, through one `<audio>` element: it stops when the video starts playing and when
 * the list leaves the screen.
 * @returns the take playing (its pool key), and Play / Stop for a take
 */
function useTakePreview(): { playingKey: string | null; toggle: (row: TakeRow) => void } {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  useEffect(() => {
    const element = new Audio();
    audio.current = element;
    const ended = () => setPlayingKey(null);
    element.addEventListener('ended', ended);
    // The video starting stops the preview.
    const unsubscribe = subscribeVideo(() => {
      if (getVideo().playing && !element.paused) {
        element.pause();
        setPlayingKey(null);
      }
    });
    return () => {
      unsubscribe();
      element.removeEventListener('ended', ended);
      element.pause();
    };
  }, []);
  const toggle = (row: TakeRow) => {
    const element = audio.current;
    if (!element) return;
    if (playingKey === row.key) {
      element.pause();
      setPlayingKey(null);
      return;
    }
    // Never two sounds at once: the video pauses first.
    setPlaying(false);
    playTake(element, row.item.url);
    setPlayingKey(row.key);
    element.play().catch(() => setPlayingKey(null));
  };
  return { playingKey, toggle };
}

/** The Recordings section's list (see the file's comment). */
export function TakeList() {
  const rows = useVideo(takesOf);
  const soundSel = useVideo((state) => state.soundSel);
  const [renaming, setRenaming] = useState<string | null>(null);
  const { playingKey, toggle } = useTakePreview();
  if (!rows.length)
    return (
      <EmptyState tone="panel" icon={<MusicIcon />} title="No recordings yet">
        Takes you record under Record voice are listed here, newest first.
      </EmptyState>
    );
  return (
    <ul className="mst-takes" aria-label="Voice recordings">
      {rows.map((row) => (
        <TakeItem
          key={row.key}
          row={row}
          selected={row.uses.some((use) => use.id === soundSel)}
          playing={playingKey === row.key}
          renaming={renaming === row.key}
          onPlay={() => toggle(row)}
          onStartRename={() => setRenaming(row.key)}
          onRename={(name) => {
            if (renaming !== row.key) return;
            setRenaming(null);
            if (name !== null && name.trim() !== row.item.name) tell(renameTake(row.key, name));
          }}
        />
      ))}
    </ul>
  );
}
