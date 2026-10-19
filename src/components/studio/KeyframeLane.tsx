// The timeline's keyframe lane (205 §9, AC-7, AC-13): under the selected clip's or layer's row, one row of diamonds
// (every animated value's keyframe times, D1) or, expanded, one row per value too. A diamond is a button: a click
// selects it, a drag moves it in time (snapping as the timeline does; Alt: to frames), ← / → move it a frame (Shift: a
// second), Delete removes it, and its menu (Enter, the context-menu key or a right click) sets its interpolation, which
// its shape shows (D3).
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { EASES, isClipKeyProp, isLayerKeyProp, type Ease, type Keyframes } from '../../engine/keyframes';
import { deleteKeys, type KeyProp, type KeyTarget, moveKeys, setKeyEase } from '../../state/videoKeys';
import { getVideo } from '../../state/videoStore';
import { tell } from './timelineActions';
import type { DragEnd, DragMove } from './timelineDrag';
import { easeName, easeShape, keyPropName, keyTimes, type KeyOwner, type KeyTime } from './timelineRows';

/** The item whose keyframes the lane shows: where it starts and how long it is on the timeline, and its keys. */
export interface LaneItem {
  start: number;
  length: number;
  keys?: Keyframes<string>;
}

/**
 * The values with keys, in the item's order.
 * @param item the clip or layer
 * @returns the names of its values that have keyframes
 */
export const animatedProps = (item: LaneItem): string[] =>
  Object.entries(item.keys ?? {}).flatMap(([prop, list]) => (list?.length ? [prop] : []));

/** A diamond's row: every value ('all') or one. */
type RowProp = KeyProp | 'all';

/** One row of diamonds. */
interface LaneRow {
  prop: RowProp;
  label: string;
  times: KeyTime[];
}

/** Where a fixed menu opens, beside its button. */
interface MenuPlace {
  left: number;
  top?: number;
  bottom?: number;
}

/** The keyframe lane. */
interface KeyframeLaneProps {
  /** The selected clip or layer, for the store's actions. */
  target: KeyTarget;
  /** Its place on the timeline and its keys. */
  item: LaneItem;
  /** Whether it is a clip or a layer (for the values' names). */
  on: KeyOwner;
  /** Its name in labels and announcements ("Clip 1", a layer's name). */
  name: string;
  /** The timeline's pixels per second. */
  zoom: number;
  /** One row per value as well. */
  expanded: boolean;
  /** Snaps a timeline time as the timeline's drags do (Alt held: to the frame). */
  snapAt: (time: number, event: { altKey: boolean }) => number;
  /** The timeline's horizontal drag (it ends the undo step on release). */
  drag: (event: ReactPointerEvent, onMove: DragMove, onEnd?: DragEnd) => void;
}

/**
 * The lane's rows: all keyframe times, and one row per value when expanded.
 * @param item the clip or layer
 * @param props whose names label the rows
 * @param props.name the item's name
 * @param props.on whether it is a clip or a layer
 * @param props.expanded one row per value as well
 * @param fps the project's frame rate
 * @returns the rows
 */
function laneRows(item: LaneItem, { name, on, expanded }: { name: string; on: KeyOwner; expanded: boolean }, fps: number): LaneRow[] {
  const rows: LaneRow[] = [{ prop: 'all', label: `Keyframes of ${name}`, times: keyTimes(item, fps) }];
  if (!expanded) return rows;
  for (const prop of animatedProps(item)) {
    if (!isClipKeyProp(prop) && !isLayerKeyProp(prop)) continue;
    rows.push({ prop, label: `${keyPropName(prop, on)} keyframes of ${name}`, times: keyTimes({ keys: { [prop]: item.keys?.[prop] } }, fps) });
  }
  return rows;
}

/**
 * The lane's rows (see the file's comment).
 * @param props the item, its target, naming, zoom, expansion, snapping and the timeline's drag
 */
export function KeyframeLane({ target, item, on, name, zoom, expanded, snapAt, drag }: Readonly<KeyframeLaneProps>) {
  const [selected, setSelected] = useState<{ prop: RowProp; t: number } | null>(null);
  // A diamond being dragged: where it goes (item seconds), drawn there until the release moves it.
  const [dragging, setDragging] = useState<{ prop: RowProp; from: number; to: number } | null>(null);
  const [menu, setMenu] = useState<(MenuPlace & { prop: RowProp; time: KeyTime }) | null>(null);
  const lane = useRef<HTMLDivElement>(null);
  const fps = getVideo().fps;

  // After a keyboard move the selected diamond may be another button: keep the focus on it.
  useLayoutEffect(() => {
    if (lane.current?.contains(document.activeElement))
      lane.current.querySelector<HTMLButtonElement>('.tl-key.on')?.focus();
  }, [selected]);

  const rows = laneRows(item, { name, on, expanded }, fps);

  // A diamond's time limited to the item (item seconds).
  const within = (time: number) => Math.max(0, Math.min(item.length, time));

  const press = (event: ReactPointerEvent<HTMLButtonElement>, prop: RowProp, time: KeyTime) => {
    if (event.button === 2) return;
    setSelected({ prop, t: time.t });
    const button = event.currentTarget;
    let to = time.t;
    drag(
      event,
      (dx, moveEvent) => {
        to = within(snapAt(item.start + time.t + dx / zoom, moveEvent) - item.start);
        setDragging({ prop, from: time.t, to });
      },
      (moved) => {
        setDragging(null);
        if (moved && to !== time.t) {
          tell(moveKeys(target, prop, time.t, to));
          setSelected({ prop, t: to });
        }
        button.focus();
      },
    );
  };

  const openMenu = (button: HTMLElement, prop: RowProp, time: KeyTime) => {
    const rect = button.getBoundingClientRect();
    const height = 40 + (EASES.length + 1) * 32;
    setSelected({ prop, t: time.t });
    setMenu(
      rect.bottom + height > window.innerHeight
        ? { prop, time, left: rect.left, bottom: window.innerHeight - rect.top + 2 }
        : { prop, time, left: rect.left, top: rect.bottom + 2 },
    );
  };

  const onKey = (event: ReactKeyboardEvent<HTMLButtonElement>, prop: RowProp, time: KeyTime) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      // Moves the diamond (not the playhead): a frame, Shift a second; repeats are one undo step.
      event.preventDefault();
      event.stopPropagation();
      const step = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 1 : 1 / fps);
      const to = within(Math.round((time.t + step) * fps) / fps);
      if (to === time.t) return;
      tell(moveKeys(target, prop, time.t, to, `key-nudge:${JSON.stringify(target)}:${prop}`));
      setSelected({ prop, t: to });
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      tell(deleteKeys(target, prop, time.t));
      setSelected(null);
    } else if (event.key === 'Enter' || event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      openMenu(event.currentTarget, prop, time);
    }
  };

  return (
    <div ref={lane}>
      {rows.map((row) => (
        <div
          key={row.prop}
          className={`tl-row tl-keys${row.prop === 'all' ? '' : ' tl-keys-value'}`}
          role="group"
          aria-label={row.label}
        >
          {row.times.map((time, index) => {
            const isSelected = selected?.prop === row.prop && Math.abs(selected.t - time.t) < 0.5 / fps;
            const shownAt = dragging?.prop === row.prop && dragging.from === time.t ? dragging.to : time.t;
            const values = row.prop === 'all' ? `, ${time.props.map((prop) => keyPropName(prop, on)).join(', ')}` : '';
            const label = `Keyframe at ${(item.start + shownAt).toFixed(2)} s${values}, ${easeName(time.ease)}`;
            return (
              <button
                // Diamonds are positions on the row (two keys can share a time while a drag passes).
                key={index}
                type="button"
                className={`tl-key tl-key-${easeShape(time.ease)}${isSelected ? ' on' : ''}${shownAt !== time.t ? ' dragging' : ''}`}
                style={{ left: (item.start + shownAt) * zoom }}
                aria-label={label}
                aria-pressed={isSelected}
                aria-haspopup="menu"
                title={`${label}. Drag to move, Delete removes, Enter or a right click: interpolation`}
                onPointerDown={(event) => press(event, row.prop, time)}
                onKeyDown={(event) => onKey(event, row.prop, time)}
                onFocus={() => setSelected({ prop: row.prop, t: time.t })}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openMenu(event.currentTarget, row.prop, time);
                }}
              />
            );
          })}
        </div>
      ))}
      {menu && (
        <EaseMenu
          at={menu}
          ease={menu.time.ease}
          label={`Keyframe at ${(item.start + menu.time.t).toFixed(2)} s`}
          onEase={(ease) => tell(setKeyEase(target, menu.prop, menu.time.t, ease))}
          onDelete={() => {
            tell(deleteKeys(target, menu.prop, menu.time.t));
            setSelected(null);
          }}
          onClose={(isFocusing) => {
            setMenu(null);
            if (isFocusing)
              requestAnimationFrame(() => lane.current?.querySelector<HTMLButtonElement>('.tl-key.on')?.focus());
          }}
        />
      )}
    </div>
  );
}

/** The lane's header cells. */
interface KeyframeLaneHeadsProps {
  item: LaneItem;
  on: KeyOwner;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
}

/**
 * The lane's header cells, beside its rows in the timeline's header column: Keyframes with the expand button, then the
 * values' names when expanded.
 * @param props the item, clip or layer, and the expansion
 */
export function KeyframeLaneHeads({ item, on, expanded, onExpand }: Readonly<KeyframeLaneHeadsProps>) {
  return (
    <>
      <div className="tl-h tl-h-keys">
        <button
          type="button"
          className="tl-keys-toggle"
          aria-expanded={expanded}
          title={expanded ? 'Show one row of keyframes' : 'Show a row for each animated value'}
          onClick={() => onExpand(!expanded)}
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span> Keys
        </button>
      </div>
      {expanded &&
        animatedProps(item).map((prop) => (
          <div key={prop} className="tl-h tl-h-keys tl-h-keys-value" aria-hidden="true">
            {keyPropName(prop, on)}
          </div>
        ))}
    </>
  );
}

/** A diamond's menu. */
interface EaseMenuProps {
  at: MenuPlace;
  ease: Ease | 'mixed';
  label: string;
  onEase: (ease: Ease) => void;
  onDelete: () => void;
  onClose: (isFocusing: boolean) => void;
}

/**
 * A diamond's menu (a fixed menu in a portal, as the track height menu): the interpolations, then Delete keyframe.
 * @param props where it opens, the diamond's ease and name, and the actions
 */
function EaseMenu({ at, ease, label, onEase, onDelete, onClose }: Readonly<EaseMenuProps>) {
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  // The latest close handler, for the outside-press listener added once.
  const close = useRef(onClose);
  useLayoutEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (!list.current?.contains(target)) close.current(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);
  useLayoutEffect(() => {
    (
      list.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ??
      list.current?.querySelector<HTMLButtonElement>('button')
    )?.focus();
  }, []);
  const onListKey = (event: ReactKeyboardEvent) => {
    // React events bubble out of a portal to the timeline, whose keys mustn't act here.
    event.stopPropagation();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = items.findIndex((item) => item === document.activeElement);
    const next = {
      ArrowDown: Math.min(items.length - 1, index + 1),
      ArrowUp: Math.max(0, index - 1),
      Home: 0,
      End: items.length - 1,
    }[event.key];
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
    } else if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
  };
  return createPortal(
    <ul
      ref={list}
      id={id}
      className="tl-hmenu"
      role="menu"
      aria-label={`${label}: interpolation`}
      style={{ position: 'fixed', ...at }}
      onKeyDown={onListKey}
    >
      {EASES.map((option) => (
        <li key={option} role="none">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={option === ease}
            onClick={() => {
              onEase(option);
              onClose(true);
            }}
          >
            <span className={`tl-key-icon tl-key-${easeShape(option)}`} aria-hidden="true" />
            <span>{easeName(option)}</span>
          </button>
        </li>
      ))}
      <li role="separator" className="tl-hmenu-sep" />
      <li role="none">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onDelete();
            onClose(true);
          }}
        >
          Delete keyframe
        </button>
      </li>
    </ul>,
    document.body,
  );
}
