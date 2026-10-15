import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { addTrack as withNewTrack, type Track } from '../../engine/tracks';
import { isDesktop } from '../../platform/desktop';
import type { TrackHeight } from '../../state/videoStore';
import { addTrack, deleteTrack, moveTrack, renameTrack, setTrack, setTrackHeight } from '../../state/videoTracks';
import { HeightIcon, HideIcon, LockIcon, MusicIcon, MuteIcon, PlusIcon } from '../icons';
import { tell } from './timelineActions';
import { TRACK_PX } from './timelineDrag';

/* The timeline's track headers: add an overlay track, and each track's name, switches and menu. */

/** The track heights and their names. */
const HEIGHTS: [TrackHeight, string][] = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];

/** The add-track button. */
interface AddTrackButtonProps {
  tracks: Track[];
}

/**
 * Adds an overlay track at the top of the picture tracks (203 Q12). At the track limit it is disabled and its title
 * says why.
 * @param props the tracks
 */
export function AddTrackButton({ tracks }: Readonly<AddTrackButtonProps>) {
  const result = withNewTrack(tracks, isDesktop);
  const refusal = 'error' in result ? result.error : null;
  return (
    <button
      type="button"
      className="tl-tbtn tl-add-track"
      aria-label="Add an overlay track"
      title={refusal ?? 'Add an overlay track above the others, for picture-in-picture and B-roll'}
      aria-disabled={!!refusal}
      onClick={() => tell(refusal ?? addTrack())}
    >
      <PlusIcon />
    </button>
  );
}

/** A track's header. */
interface TrackHeadProps {
  track: Track;
  height: TrackHeight;
  /** How many clips it holds (asked about before deleting it). */
  clipCount?: number;
}

/** A switch in a track's header. */
interface TrackSwitchProps {
  isOn: boolean;
  label: string;
  title: string;
  onToggle: () => void;
  children: ReactNode;
}

/**
 * A pressed / not pressed button in a track's header (Hide, Mute, Lock).
 * @param props its state, label, title, action and icon
 */
function TrackSwitch({ isOn, label, title, onToggle, children }: Readonly<TrackSwitchProps>) {
  return (
    <button type="button" className="tl-tbtn" aria-pressed={isOn} aria-label={label} title={title} onClick={onToggle}>
      {children}
    </button>
  );
}

/** A track's name, or the field renaming it. */
interface TrackNameProps {
  track: Track;
  isRenaming: boolean;
  setRenaming: (isRenaming: boolean) => void;
}

/**
 * A track's name: an overlay track's name is a button that becomes a text field (Enter keeps, Escape cancels).
 * @param props the track and whether it is being renamed
 */
function TrackName({ track, isRenaming, setRenaming }: Readonly<TrackNameProps>) {
  // Keeps a new name (or says why it can't be used) and leaves the text field.
  const finishRename = (name: string) => {
    tell(renameTrack(track.id, name));
    setRenaming(false);
  };
  if (isRenaming)
    return (
      <input
        className="tl-h-rename"
        aria-label={`Rename ${track.name}`}
        defaultValue={track.name}
        maxLength={40}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Enter') finishRename(event.currentTarget.value);
          else if (event.key === 'Escape') setRenaming(false);
        }}
        onBlur={(event) => finishRename(event.currentTarget.value)}
      />
    );
  if (track.kind === 'overlay')
    return (
      <button type="button" className="tl-h-name tl-h-name-button" aria-label={`Rename ${track.name}`} title="Rename this track" onClick={() => setRenaming(true)}>
        {track.name}
      </button>
    );
  return (
    <span className="tl-h-name" aria-hidden="true">
      {track.kind === 'audio' && <MusicIcon />} {track.name}
    </span>
  );
}

/**
 * A track's header: its name, Hide (picture tracks) and Mute (overlay and sound tracks), Lock and its height. An
 * overlay track's header also renames it, and its menu (the height button) moves it up or down among the overlays and
 * deletes it (asking first when it holds clips).
 * @param props the track, its height and how many clips it holds
 */
export function TrackHead({ track, height, clipCount = 0 }: Readonly<TrackHeadProps>) {
  const isPicture = track.kind !== 'audio';
  const isOverlay = track.kind === 'overlay';
  const [isRenaming, setRenaming] = useState(false);
  /** Deletes the track, asking first when it holds clips. */
  const confirmDelete = () => {
    const holding = clipCount === 1 ? 'clip' : String(clipCount) + ' clips';
    if (clipCount === 0 || confirm(`Delete ${track.name} and its ${holding}? Undo brings them back.`)) tell(deleteTrack(track.id));
  };
  const overlayActions = [
    { label: 'Move up (drawn over the track above)', onSelect: () => tell(moveTrack(track.id, 1)) },
    { label: 'Move down', onSelect: () => tell(moveTrack(track.id, -1)) },
    { label: `Delete ${track.name}`, onSelect: confirmDelete },
  ];
  return (
    <div className={`tl-h tl-h-track tl-h-${height}${isOverlay ? ' tl-h-overlay' : ''}`} style={{ height: TRACK_PX[height] }} role="group" aria-label={`${track.name} track`}>
      <TrackName track={track} isRenaming={isRenaming} setRenaming={setRenaming} />
      <span className="tl-h-tools">
        {isPicture && (
          <TrackSwitch
            isOn={track.hidden}
            label={`Hide ${track.name}`}
            title={track.hidden ? 'Hidden: not drawn in the preview or the export (its sound still plays)' : 'Hide this track in the preview and the export'}
            onToggle={() => setTrack(track.id, { hidden: !track.hidden })}
          >
            <HideIcon on={track.hidden} />
          </TrackSwitch>
        )}
        {/* The main video track has no Mute: its clips' sound is set per clip (201 D2). */}
        {(isOverlay || !isPicture) && (
          <TrackSwitch
            isOn={track.muted}
            label={`Mute ${track.name}`}
            title={track.muted ? 'Muted: silent in the preview and the export' : 'Mute this track in the preview and the export'}
            onToggle={() => setTrack(track.id, { muted: !track.muted })}
          >
            <MuteIcon on={track.muted} />
          </TrackSwitch>
        )}
        <TrackSwitch
          isOn={track.locked}
          label={`Lock ${track.name}`}
          title={track.locked ? 'Locked: its clips can’t be changed' : 'Lock this track so its clips can’t be changed'}
          onToggle={() => setTrack(track.id, { locked: !track.locked })}
        >
          <LockIcon on={track.locked} />
        </TrackSwitch>
        <HeightMenu track={track} height={height} actions={isOverlay ? overlayActions : []} />
      </span>
    </div>
  );
}

/** An extra row in a track's menu (an overlay track's Move up, Move down, Delete). */
interface TrackMenuAction {
  label: string;
  onSelect: () => void;
}

/** The track height button and its menu. */
interface HeightMenuProps {
  track: Track;
  height: TrackHeight;
  actions?: TrackMenuAction[];
}

/** Where the menu opens, fixed in the window. */
interface MenuPlace {
  left: number;
  top?: number;
  bottom?: number;
}

/**
 * Where the menu opens: below its button, or above it near the bottom of the window.
 * @param button the menu's button
 * @param actionCount how many extra rows the menu has
 * @returns its fixed position
 */
function menuPlace(button: HTMLButtonElement, actionCount: number): MenuPlace {
  const rect = button.getBoundingClientRect();
  const menuHeight = 120 + actionCount * 32;
  return rect.bottom + menuHeight > window.innerHeight ? { left: rect.left, bottom: window.innerHeight - rect.top + 2 } : { left: rect.left, top: rect.bottom + 2 };
}

/**
 * The track height button and its menu (Small / Medium / Large, then any `actions`): arrows, Home / End, Enter,
 * Escape. An overlay track's menu also moves it up or down and deletes it (203 §10), so its header stays one row.
 * @param props the track, its height and the extra rows
 */
function HeightMenu({ track, height, actions = [] }: Readonly<HeightMenuProps>) {
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();
  const label = actions.length ? `${track.name} track: height and more` : `${track.name} track height`;
  const close = (isFocusing: boolean) => {
    setPlace(null);
    if (isFocusing) buttonRef.current?.focus();
  };
  useEffect(() => {
    if (!place) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!listRef.current?.contains(target) && !buttonRef.current?.contains(target)) setPlace(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [place]);
  // Land on the size in use as soon as the menu is there, so the very next key goes to it.
  useLayoutEffect(() => {
    if (place) listRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }, [place]);
  const onListKey = (event: ReactKeyboardEvent) => {
    // React events bubble out of a portal to the timeline, whose keys (Space, S, Delete, arrows) mustn't act here.
    event.stopPropagation();
    const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = items.findIndex((item) => item === document.activeElement);
    const next = { ArrowDown: Math.min(items.length - 1, index + 1), ArrowUp: Math.max(0, index - 1), Home: 0, End: items.length - 1 }[event.key];
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close(true);
    } else if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  };
  const heightName = HEIGHTS.find(([size]) => size === height)?.[1] ?? '';
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="tl-tbtn"
        aria-label={label}
        title={`Track height: ${heightName}${actions.length ? '; move or delete the track' : ''}`}
        aria-haspopup="menu"
        aria-expanded={!!place}
        aria-controls={place ? id : undefined}
        onClick={() => {
          if (place) close(false);
          else if (buttonRef.current) setPlace(menuPlace(buttonRef.current, actions.length));
        }}
      >
        <HeightIcon />
      </button>
      {place &&
        // A fixed menu in a portal: inside the timeline it would be clipped by its scrolling and painted under the clips.
        createPortal(
          <ul ref={listRef} id={id} className="tl-hmenu" role="menu" aria-label={label} style={{ position: 'fixed', ...place }} onKeyDown={onListKey}>
            {HEIGHTS.map(([size, name]) => (
              <li key={size} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={size === height}
                  onClick={() => {
                    setTrackHeight(track.id, size);
                    close(true);
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
            {actions.length > 0 && <li role="separator" className="tl-hmenu-sep" />}
            {actions.map((action) => (
              <li key={action.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    close(true);
                    action.onSelect();
                  }}
                >
                  {action.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
