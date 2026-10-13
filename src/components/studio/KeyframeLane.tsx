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
import { EASES, type Ease, type Keyframes } from '../../engine/keyframes';
import { toast } from '../../lib/toast';
import { deleteKeys, getVideo, moveKeys, setKeyEase, type KeyProp, type KeyTarget } from '../../state/video';
import { easeName, easeShape, keyPropName, keyTimes, type KeyTime } from './timelineRows';

/** The item whose keyframes the lane shows: where it starts and how long it is on the timeline, and its keys. */
export interface LaneItem {
  start: number;
  length: number;
  keys?: Keyframes<string>;
}

/** The values with keys, in the item's order. */
export const animatedProps = (item: LaneItem): string[] =>
  Object.entries(item.keys ?? {}).flatMap(([prop, list]) => (list?.length ? [prop] : []));

/** A diamond's row: every value ('all') or one. */
type RowProp = KeyProp | 'all';

/** Shows a refusal (a locked track) instead of dropping it. */
const tell = (refusal: string | null) => refusal && toast(refusal);

/**
 * The lane's rows.
 * @param target the selected clip or layer, for the store's actions
 * @param item its place on the timeline and its keys
 * @param on whether it is a clip or a layer (for the values' names)
 * @param name its name in labels and announcements ("Clip 1", a layer's name)
 * @param zoom the timeline's pixels per second
 * @param expanded one row per value as well
 * @param snapAt snaps a timeline time as the timeline's drags do (Alt held: to the frame)
 * @param drag the timeline's horizontal drag (it ends the undo step on release)
 */
export function KeyframeLane({
  target,
  item,
  on,
  name,
  zoom,
  expanded,
  snapAt,
  drag,
}: {
  target: KeyTarget;
  item: LaneItem;
  on: 'clip' | 'layer';
  name: string;
  zoom: number;
  expanded: boolean;
  snapAt: (t: number, ev: { altKey: boolean }) => number;
  drag: (
    e: ReactPointerEvent,
    move: (dx: number, ev: PointerEvent) => void,
    up?: (moved: boolean, ev: PointerEvent) => void,
  ) => void;
}) {
  const [selected, setSelected] = useState<{ prop: RowProp; t: number } | null>(null);
  // A diamond being dragged: where it goes (item seconds), drawn there until the release moves it.
  const [dragging, setDragging] = useState<{ prop: RowProp; from: number; to: number } | null>(null);
  const [menu, setMenu] = useState<{
    prop: RowProp;
    time: KeyTime;
    left: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const lane = useRef<HTMLDivElement>(null);
  const fps = getVideo().fps;

  // After a keyboard move the selected diamond may be another button: keep the focus on it.
  useLayoutEffect(() => {
    if (lane.current?.contains(document.activeElement))
      lane.current.querySelector<HTMLButtonElement>('.tl-key.on')?.focus();
  }, [selected]);

  const rows: { prop: RowProp; label: string; times: KeyTime[] }[] = [
    { prop: 'all', label: `Keyframes of ${name}`, times: keyTimes(item, fps) },
  ];
  if (expanded)
    for (const prop of animatedProps(item))
      rows.push({
        prop: prop as KeyProp,
        label: `${keyPropName(prop, on)} keyframes of ${name}`,
        times: keyTimes({ keys: { [prop]: item.keys![prop] } }, fps),
      });

  /** A diamond's time limited to the item (item seconds). */
  const within = (t: number) => Math.max(0, Math.min(item.length, t));

  const press = (e: ReactPointerEvent<HTMLButtonElement>, prop: RowProp, time: KeyTime) => {
    if (e.button === 2) return;
    setSelected({ prop, t: time.t });
    const button = e.currentTarget;
    let to = time.t;
    drag(
      e,
      (dx, ev) => {
        to = within(snapAt(item.start + time.t + dx / zoom, ev) - item.start);
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
    const r = button.getBoundingClientRect();
    const height = 40 + (EASES.length + 1) * 32;
    setSelected({ prop, t: time.t });
    setMenu(
      r.bottom + height > window.innerHeight
        ? { prop, time, left: r.left, bottom: window.innerHeight - r.top + 2 }
        : { prop, time, left: r.left, top: r.bottom + 2 },
    );
  };

  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>, prop: RowProp, time: KeyTime) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      // Moves the diamond (not the playhead): a frame, Shift a second; repeats are one undo step.
      e.preventDefault();
      e.stopPropagation();
      const to = within(
        Math.round((time.t + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / fps)) * fps) / fps,
      );
      if (to === time.t) return;
      tell(moveKeys(target, prop, time.t, to, `key-nudge:${JSON.stringify(target)}:${prop}`));
      setSelected({ prop, t: to });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      tell(deleteKeys(target, prop, time.t));
      setSelected(null);
    } else if (e.key === 'Enter' || e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      openMenu(e.currentTarget, prop, time);
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
                key={index}
                type="button"
                className={`tl-key tl-key-${easeShape(time.ease)}${isSelected ? ' on' : ''}${shownAt !== time.t ? ' dragging' : ''}`}
                style={{ left: (item.start + shownAt) * zoom }}
                aria-label={label}
                aria-pressed={isSelected}
                aria-haspopup="menu"
                title={`${label}. Drag to move, Delete removes, Enter or a right click: interpolation`}
                onPointerDown={(e) => press(e, row.prop, time)}
                onKeyDown={(e) => onKey(e, row.prop, time)}
                onFocus={() => setSelected({ prop: row.prop, t: time.t })}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(e.currentTarget, row.prop, time);
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
          onClose={(focus) => {
            setMenu(null);
            if (focus)
              requestAnimationFrame(() => lane.current?.querySelector<HTMLButtonElement>('.tl-key.on')?.focus());
          }}
        />
      )}
    </div>
  );
}

/**
 * The lane's header cells, beside its rows in the timeline's header column: Keyframes with the expand button, then the
 * values' names when expanded.
 */
export function KeyframeLaneHeads({
  item,
  on,
  expanded,
  onExpand,
}: {
  item: LaneItem;
  on: 'clip' | 'layer';
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
}) {
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

/** A diamond's menu (a fixed menu in a portal, as the track height menu): the interpolations, then Delete keyframe. */
function EaseMenu({
  at,
  ease,
  label,
  onEase,
  onDelete,
  onClose,
}: {
  at: { left: number; top?: number; bottom?: number };
  ease: Ease | 'mixed';
  label: string;
  onEase: (ease: Ease) => void;
  onDelete: () => void;
  onClose: (focus: boolean) => void;
}) {
  const list = useRef<HTMLUListElement>(null),
    id = useId();
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!list.current?.contains(e.target as Node)) close.current(false);
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
  const onListKey = (e: ReactKeyboardEvent) => {
    // React events bubble out of a portal to the timeline, whose keys mustn't act here.
    e.stopPropagation();
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = {
      ArrowDown: Math.min(items.length - 1, i + 1),
      ArrowUp: Math.max(0, i - 1),
      Home: 0,
      End: items.length - 1,
    }[e.key];
    if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      onClose(true);
    } else if (next !== undefined) {
      e.preventDefault();
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
