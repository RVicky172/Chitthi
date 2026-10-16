import { useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { igFormat } from '../../data/instagram';
import { placement, type IgEdit } from '../../engine/instagram';
import type { MaskPart } from '../../engine/masks';
import { editPhoto, endStep, selectLayer, selectPhoto, setPicking, useIg, type IgItem } from '../../state/instagram';
import { removeLayer, setLayers, updateLayer } from '../../state/instagramLayers';
import { useLayerPointer } from '../ig/useLayerPointer';
import { NextIcon, PrevIcon, TrashIcon } from '../icons';
import { pickNeutral, useMaskTool } from './photoMaskTool';
import { usePhotoRender, type MaskView } from './photoRender';
import { useFit } from './Shell';

/*
 * The photo editor's stage: the selected photo as it will be posted, with its layers to drag, the photo to move (drag
 * or arrow keys; plus and minus zoom), the Masks tool, the Draw tool and the white-balance eyedropper.
 */

/**
 * Keeps a position within -1 to 1.
 * @param value a position
 * @returns it clamped
 */
const clampPosition = (value: number): number => Math.max(-1, Math.min(1, value));

/**
 * The framing change a key asks for: arrow keys move the photo (Shift: further), plus and minus zoom.
 * @param key the key
 * @param edit the photo's framing
 * @param isLarge true with Shift
 * @returns the change, or undefined for any other key
 */
function framingForKey(key: string, edit: IgEdit, isLarge: boolean): Partial<IgEdit> | undefined {
  const step = isLarge ? 0.2 : 0.05;
  const changes: Partial<Record<string, Partial<IgEdit>>> = {
    ArrowLeft: { px: clampPosition(edit.px - step) },
    ArrowRight: { px: clampPosition(edit.px + step) },
    ArrowUp: { py: clampPosition(edit.py - step) },
    ArrowDown: { py: clampPosition(edit.py + step) },
    '+': { zoom: Math.min(4, edit.zoom + 0.1) },
    '=': { zoom: Math.min(4, edit.zoom + 0.1) },
    '-': { zoom: Math.max(1, edit.zoom - 0.1) },
  };
  return changes[key];
}

/**
 * The line under the stage: what a drag does now.
 * @param mode the eyedropper, the Masks tool (with its selected part and Erase) or the Draw tool
 * @returns the hint
 */
function stageHint(mode: { isPicking: boolean; isMasking: boolean; part: MaskPart | null; isErasing: boolean; isDrawing: boolean }): string {
  if (mode.isPicking) return 'Click something that should be grey or white; Escape cancels';
  if (mode.isMasking) {
    const byKind: Partial<Record<MaskPart['kind'], string>> = {
      linear: 'Masks: drag to draw the gradient, or move its handles',
      radial: 'Masks: drag to draw a circle, or move its handles',
      colour: 'Masks: click the photo to pick the colour',
      luma: 'Masks: click the photo to pick the brightness',
    };
    const forPart = mode.part ? byKind[mode.part.kind] : undefined;
    if (forPart) return forPart;
    return mode.isErasing ? 'Masks: drag on the photo to erase from the selected mask' : 'Masks: drag on the photo to paint the selected mask';
  }
  return mode.isDrawing ? 'Drawing: drag on the photo' : 'Drag a layer to move it, or the photo to reposition it';
}

/**
 * The id of the photo at a place in the batch.
 * @param items the batch
 * @param position the place, from 0
 * @returns its id, or null before the first or after the last
 */
const photoIdAt = (items: IgItem[], position: number): string | null => (position >= 0 ? (items.at(position)?.id ?? null) : null);

/** The stage. */
interface PhotoStageProps {
  item: IgItem;
}

/**
 * The photo editor's stage (see the file's comment).
 * @param props the selected photo
 */
export function PhotoStage({ item }: Readonly<PhotoStageProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const formatId = useIg((state) => state.format);
  const items = useIg((state) => state.items);
  const layerSel = useIg((state) => state.layerSel);
  const tools = useIg((state) => state.tools);
  const maskSel = useIg((state) => state.maskSel);
  const partSel = useIg((state) => state.partSel);
  const brush = useIg((state) => state.maskBrush);
  const isPicking = useIg((state) => state.picking);
  const format = igFormat(formatId);
  const { width, height } = useFit(box, format.w, format.h, 72);
  const isMasking = tools.tool === 'mask';
  const selectedMask = isMasking ? (item.edit.masks.find((mask) => mask.id === maskSel) ?? null) : null;
  const selectedPart = selectedMask?.parts.find((part) => part.id === partSel) ?? null;
  const view = useMemo<MaskView | null>(
    () => (selectedMask ? { mask: selectedMask, part: selectedPart, overlay: brush.overlay } : null),
    [selectedMask, selectedPart, brush.overlay],
  );
  const isBrushing = isMasking && (!selectedPart || selectedPart.kind === 'brush');
  usePhotoRender(canvasRef, item, formatId, width, { selection: layerSel, view });
  const index = items.findIndex((candidate) => candidate.id === item.id);
  const onMask = useMaskTool(item, canvasRef);

  // How far the photo can move each way, in CSS pixels.
  const room = () => {
    const place = placement(item.preview.width, item.preview.height, item.edit, width, height);
    return { x: Math.abs(place.dw - width) / 2, y: Math.abs(place.dh - height) / 2 };
  };
  const panKey = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const change = framingForKey(event.key, item.edit, event.shiftKey);
    if (!change) return false;
    event.preventDefault();
    editPhoto(item.id, change);
    return true;
  };
  const moveCursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const brushCursor = cursor.current;
    if (!brushCursor) return;
    const diameter = brush.size * event.currentTarget.getBoundingClientRect().width;
    brushCursor.style.width = brushCursor.style.height = `${diameter}px`;
    brushCursor.style.transform = `translate(${event.clientX - diameter / 2}px, ${event.clientY - diameter / 2}px)`;
    brushCursor.hidden = false;
  };

  const handlers = useLayerPointer({
    canvas: canvasRef,
    layers: item.layers,
    onMask,
    selected: layerSel,
    tools,
    onSelect: selectLayer,
    onUpdate: (id, layer, key) => updateLayer(item.id, id, layer, key),
    onSetLayers: (layers, key, drawingId) => setLayers(item.id, layers, key, drawingId),
    onRemove: (id) => removeLayer(item.id, id),
    onEndStep: endStep,
    onBackground: {
      down: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        pan.current = { x: event.clientX, y: event.clientY, px: item.edit.px, py: item.edit.py };
      },
      move: (event: ReactPointerEvent<HTMLCanvasElement>) => {
        const start = pan.current;
        if (!start) return;
        const space = room();
        editPhoto(item.id, {
          px: space.x > 0.5 ? clampPosition(start.px + (event.clientX - start.x) / space.x) : 0,
          py: space.y > 0.5 ? clampPosition(start.py + (event.clientY - start.y) / space.y) : 0,
        });
      },
      up: () => {
        pan.current = null;
      },
      key: panKey,
    },
  });
  const layerCount = `${item.layers.length} layer${item.layers.length === 1 ? '' : 's'}`;
  return (
    <div className="mst-surface" ref={box}>
      <div className="mst-stagebar">
        <button type="button" className="pbtn" aria-label="Previous photo" disabled={index <= 0} onClick={() => selectPhoto(photoIdAt(items, index - 1))}>
          <PrevIcon />
        </button>
        <span>
          Photo {index + 1} of {items.length}
          {index === 0 && items.length > 1 ? ' · cover' : ''}
        </span>
        <button type="button" className="pbtn" aria-label="Next photo" disabled={index >= items.length - 1} onClick={() => selectPhoto(photoIdAt(items, index + 1))}>
          <NextIcon />
        </button>
        {layerSel && (
          <button type="button" className="pbtn" aria-label="Delete the selected layer" title="Delete the selected layer (Delete)" onClick={() => removeLayer(item.id, layerSel)}>
            <TrashIcon />
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        tabIndex={0}
        className={`mst-canvas${tools.tool === 'draw' || isMasking ? ' drawing' : ''}${isPicking ? ' picking' : ''}`}
        style={{ width, height }}
        aria-label={`Photo ${index + 1} of ${items.length} as a ${format.ratio} Instagram post, with ${layerCount}. Drag a layer to move it, its corner handle to resize, its top handle to turn it. Drag elsewhere, or use the arrow keys, to move the photo; plus and minus zoom. Delete removes the selected layer.`}
        onDoubleClick={() => document.getElementById('layer-text')?.focus()}
        {...handlers}
        onPointerDown={isPicking ? (event) => pickNeutral(event, item) : handlers.onPointerDown}
        onPointerMove={(event) => {
          if (isBrushing) moveCursor(event);
          handlers.onPointerMove(event);
        }}
        onPointerLeave={() => {
          if (cursor.current) cursor.current.hidden = true;
        }}
        onKeyDown={(event) => {
          if (isPicking && event.key === 'Escape') setPicking(false);
          else handlers.onKeyDown(event);
        }}
      />
      {isBrushing && <div className="mst-brush" ref={cursor} hidden aria-hidden="true" />}
      <p className="mst-hint">{stageHint({ isPicking, isMasking, part: selectedPart, isErasing: brush.erase, isDrawing: tools.tool === 'draw' })}</p>
    </div>
  );
}
