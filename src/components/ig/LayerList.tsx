import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import { lum } from '../../engine/color';
import { layerImage, layerName, type ImageLayer, type Layer } from '../../engine/layers';
import { BrushIcon, HideIcon, NextIcon, PrevIcon, TrashIcon } from '../icons';
import { ListRow } from '../panel';
import { formatClock } from './LayerControls';
import { DRAG_START_PX, dropRow, layerListKey, movedRow, stackIndex } from './layerListMoves';
import { ShapeIcon, type LayerPanelProps } from './LayerPanel';

/*
 * The Layers panel's list (506): every layer, front first, as a ListRow — a thumbnail of its kind, its whole name
 * (shortened on screen; the accessible name and tooltip keep it all), its times on a video, then Show / Hide, Bring
 * forward, Send back and Delete, which never wrap. The selected layer's properties are in the inspector.
 */

/** What the layer list needs from the panel's props. */
export type LayerListProps = Pick<
  LayerPanelProps,
  'layers' | 'selected' | 'onSelect' | 'onUpdate' | 'onRestack' | 'onRemove' | 'onMove' | 'timing' | 'extra'
>;

/**
 * An image layer's picture, drawn small.
 * @param props the image layer
 */
function ImageThumb({ layer }: Readonly<{ layer: ImageLayer }>) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      context = canvas?.getContext('2d'),
      picture = layerImage(layer.image);
    if (!canvas || !context || !picture) return;
    const scale = Math.min(canvas.width / picture.width, canvas.height / picture.height),
      width = picture.width * scale,
      height = picture.height * scale;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(picture, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  }, [layer.image]);
  return <canvas ref={ref} width={64} height={64} />;
}

/**
 * A layer's thumbnail: a picture of its kind, not the layer drawn (D1): a sticker's emoji, an image's picture, a
 * shape's outline, "Aa" in a text's font and colour, a brush for a drawing.
 * @param props the layer
 */
function LayerThumb({ layer }: Readonly<{ layer: Layer }>) {
  const kind = (() => {
    switch (layer.kind) {
      case 'sticker':
        return <span className="lp-thumb-emoji">{layer.emoji}</span>;
      case 'image':
        return <ImageThumb layer={layer} />;
      case 'shape':
        return <ShapeIcon shape={layer.shape} />;
      case 'text':
        return (
          <span
            className="lp-thumb-words"
            style={{
              fontFamily: `"${layer.font}", sans-serif`,
              fontStyle: layer.italic ? 'italic' : 'normal',
              color: layer.color,
              // Its own background, else one it shows on: white words on the light panel would vanish.
              background: layer.bg || (lum(layer.color) > 0.6 ? '#1f1f1f' : '#f4f4f4'),
            }}
          >
            Aa
          </span>
        );
      case 'draw':
        return <BrushIcon />;
    }
  })();
  return (
    <span className={`lp-thumb lp-thumb-${layer.kind}`} aria-hidden="true">
      {kind}
    </span>
  );
}

/**
 * A layer's detail line: when it shows on a video, and whether it is hidden.
 * @param layer the layer
 * @param timing the video's timing, if any
 * @returns such as "0:02.0–0:04.5 · Hidden", or undefined when there is nothing to say
 */
function layerDetail(layer: Layer, timing: LayerListProps['timing']): string | undefined {
  const parts = timing ? [`${formatClock(layer.start ?? 0)}–${formatClock(Math.min(layer.end ?? timing.duration, timing.duration))}`] : [];
  if (layer.hidden) parts.push('Hidden');
  return parts.length ? parts.join(' · ') : undefined;
}

/** One layer's row. */
interface LayerRowProps extends Pick<LayerListProps, 'onSelect' | 'onUpdate' | 'onRestack' | 'onRemove' | 'timing'> {
  layer: Layer;
  selected: boolean;
  /** It is the front layer (it can't come forward) or the back one (it can't go back). */
  isFront: boolean;
  isBack: boolean;
  /** Drag marks: where a dragged row lands, the dragged row. */
  className?: string;
}

/**
 * One layer's row: select it, show or hide it, bring it forward, send it back, delete it.
 * @param props the layer, its place and the handlers
 */
function LayerRow({ layer, selected, isFront, isBack, className, timing, ...on }: Readonly<LayerRowProps>) {
  const name = layerName(layer);
  return (
    <ListRow
      rowId={layer.id}
      className={className}
      lead={<LayerThumb layer={layer} />}
      name={name}
      detail={layerDetail(layer, timing)}
      selected={selected}
      onSelect={() => on.onSelect(selected ? null : layer.id)}
      controls={
        <>
          <button
            type="button"
            className="pbtn"
            aria-label={`${layer.hidden ? 'Show' : 'Hide'} ${name}`}
            aria-pressed={!layer.hidden}
            onClick={() => on.onUpdate(layer.id, { hidden: !layer.hidden }, '')}
          >
            <HideIcon on={!!layer.hidden} />
          </button>
          <button type="button" className="pbtn lp-up" aria-label={`Bring ${name} forward`} disabled={isFront} onClick={() => on.onRestack(layer.id, 1)}>
            <PrevIcon />
          </button>
          <button type="button" className="pbtn lp-down" aria-label={`Send ${name} back`} disabled={isBack} onClick={() => on.onRestack(layer.id, -1)}>
            <NextIcon />
          </button>
          <button type="button" className="pbtn" aria-label={`Delete ${name}`} onClick={() => on.onRemove(layer.id)}>
            <TrashIcon />
          </button>
        </>
      }
    />
  );
}

/** A row being pressed or dragged. */
interface RowDrag {
  id: string;
  /** Its row, front first. */
  from: number;
  pointerId: number;
  startY: number;
  /** Past DRAG_START_PX: a drag, no longer a click. */
  dragging: boolean;
}

/**
 * The layer row a pointer or key event is on.
 * @param target the event's target
 * @returns its main button, or null
 */
const rowButton = (target: EventTarget): HTMLButtonElement | null =>
  target instanceof Element ? target.closest<HTMLButtonElement>('.list-row-main') : null;

/**
 * Dragging rows to a new place (D3): a mouse or pen from anywhere on a row but its controls, a finger from its
 * thumbnail only. A press becomes a drag past DRAG_START_PX; a line shows the gap it lands in; release moves the layer
 * once and swallows the click; Esc or a cancelled pointer puts it back.
 * @param count how many layers there are
 * @param onMove moves a layer to a stack index
 * @returns the gap shown (null when not dragging), the dragged layer's id, and the list's handlers
 */
function useRowDrag(count: number, onMove: LayerListProps['onMove']) {
  const drag = useRef<RowDrag | null>(null);
  const justDropped = useRef(false);
  const [gap, setGap] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const stop = () => {
    drag.current = null;
    setGap(null);
    setDraggedId(null);
  };
  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLOListElement>) => {
      // A drop the browser sent no click for must not swallow this press's click.
      justDropped.current = false;
      const button = rowButton(event.target);
      const id = button?.dataset.id;
      const isTouch = event.pointerType === 'touch';
      if (!button || !id || event.button !== 0 || (isTouch && !(event.target as Element).closest('.lp-thumb'))) return;
      const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.list-row-main')];
      drag.current = { id, from: rows.indexOf(button), pointerId: event.pointerId, startY: event.clientY, dragging: false };
    },
    onPointerMove: (event: PointerEvent<HTMLOListElement>) => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      if (!current.dragging) {
        if (Math.abs(event.clientY - current.startY) < DRAG_START_PX) return;
        current.dragging = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        setDraggedId(current.id);
      }
      const rows = [...event.currentTarget.children].map((row) => row.getBoundingClientRect());
      setGap(dropRow(event.clientY, [...rows.map((row) => row.top), rows.at(-1)?.bottom ?? 0]));
    },
    onPointerUp: (event: PointerEvent<HTMLOListElement>) => {
      const current = drag.current;
      if (current?.pointerId !== event.pointerId) return;
      if (current.dragging && gap !== null) {
        justDropped.current = true;
        onMove(current.id, stackIndex(movedRow(current.from, gap), count));
      }
      stop();
    },
    onPointerCancel: stop,
    // The click that ends a drag doesn't select the row.
    onClickCapture: (event: MouseEvent<HTMLOListElement>) => {
      if (!justDropped.current) return;
      justDropped.current = false;
      event.stopPropagation();
    },
  };
  /**
   * Cancels a drag (Esc).
   * @returns true when a drag was cancelled
   */
  const cancel = (): boolean => {
    if (!drag.current?.dragging) return false;
    stop();
    return true;
  };
  return { gap, draggedId, handlers, cancel };
}

/**
 * Keys on the list (layerListKey): Alt + ↑/↓ move the focused layer and keep the focus on it, ↑/↓ move the focus; Esc
 * cancels a drag.
 * @param props the layers and moving one
 * @param cancelDrag cancels a drag, true when there was one
 * @returns the list's key handler
 */
function useListKeys(props: Pick<LayerListProps, 'layers' | 'onMove'>, cancelDrag: () => boolean) {
  const refocus = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // A moved row's button can lose the focus as React reorders the list: give it back.
  useLayoutEffect(() => {
    const id = refocus.current;
    refocus.current = null;
    if (id) listRef.current?.querySelector<HTMLButtonElement>(`.list-row-main[data-id="${CSS.escape(id)}"]`)?.focus();
  }, [props.layers]);
  const onKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    if (event.key === 'Escape' && cancelDrag()) {
      event.preventDefault();
      return;
    }
    const button = rowButton(event.target);
    const action = button ? layerListKey(event) : null;
    if (!button || !action) return;
    event.preventDefault();
    const rows = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.list-row-main')];
    const row = rows.indexOf(button);
    if (action === 'previous' || action === 'next') {
      rows[Math.max(0, Math.min(rows.length - 1, row + (action === 'next' ? 1 : -1)))]?.focus();
      return;
    }
    const id = button.dataset.id;
    if (!id) return;
    refocus.current = id;
    props.onMove(id, stackIndex(row, rows.length) + (action === 'forward' ? 1 : -1));
  };
  return { listRef, onKeyDown };
}

/**
 * The class that marks where a dragged row lands, on the row after the gap (or after the last row).
 * @param gap the gap shown, or null
 * @param row this row, front first
 * @param count how many rows
 * @returns the class, or ''
 */
function dropClass(gap: number | null, row: number, count: number): string {
  if (gap === row) return 'lp-drop-before';
  return gap === count && row === count - 1 ? 'lp-drop-after' : '';
}

/**
 * Every layer, front first: select, show or hide, restack (buttons, Alt + ↑/↓, dragging), delete.
 * @param props the layers, the selection, the handlers, the timing (video) and extra actions
 */
export function LayerList(props: Readonly<LayerListProps>) {
  const { layers, selected, timing } = props;
  const { gap, draggedId, handlers, cancel } = useRowDrag(layers.length, props.onMove);
  const { listRef, onKeyDown } = useListKeys(props, cancel);
  const keysId = useId();
  return (
    <div className="ig-group">
      {layers.length === 0 ? (
        <p className="hint">Nothing added yet. Text, shapes, stickers and drawings appear here, the top one first.</p>
      ) : (
        <ol ref={listRef} className="lp-list" aria-label="Layers, front first" aria-describedby={layers.length > 1 ? keysId : undefined} onKeyDown={onKeyDown} {...handlers}>
          {[...layers].reverse().map((layer, fromFront) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              selected={layer.id === selected}
              isFront={fromFront === 0}
              isBack={fromFront === layers.length - 1}
              className={[dropClass(gap, fromFront, layers.length), layer.id === draggedId ? 'lp-dragging' : ''].filter(Boolean).join(' ')}
              timing={timing}
              onSelect={props.onSelect}
              onUpdate={props.onUpdate}
              onRestack={props.onRestack}
              onRemove={props.onRemove}
            />
          ))}
        </ol>
      )}
      {layers.length > 1 && (
        <p id={keysId} className="hint">
          Drag a layer to move it in front of or behind the others, or press Alt + ↑ / ↓ on it.
        </p>
      )}
      {props.extra}
    </div>
  );
}
