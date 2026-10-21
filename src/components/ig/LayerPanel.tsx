import { useEffect, useRef, type ReactNode } from 'react';
import { BRUSHES, SHAPES, STICKERS, TEXT_STYLES, shapeDef, type BrushId } from '../../data/layers';
import {
  addLayerImage,
  newImageLayer,
  newShape,
  newSticker,
  newText,
  type Layer,
} from '../../engine/layers';
import { shapePath } from '../../engine/layerDraw';
import type { LayerKeyProp } from '../../engine/keyframes';
import { logError } from '../../lib/errors';
import { toast } from '../../lib/toast';
import type { LayerTools } from '../../state/instagram';
import { Seg } from '../common';
import { PlusIcon } from '../icons';
import { FoldSection } from '../panel';
import { LpRange, Swatches } from './LayerControls';
import { LayerProperties } from './LayerProperties';

/*
 * The layer controls shared by the photo and video editors: add text, shapes, stickers and images; the selected
 * layer's properties (with its blend mode and mask, shown in the inspector); and the drawing brush. The list is in
 * LayerList.tsx (506). Changes go out through callbacks, so each editor keeps its own state and undo history.
 */

/** The layers, the selection and the editor's handlers, for every part of the layer panel. */
export interface LayerPanelProps {
  layers: Layer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onAdd: (layer: Layer) => void;
  onUpdate: (id: string, patch: Partial<Layer> | ((layer: Layer) => Layer), key?: string) => void;
  onRemove: (id: string) => void;
  onRestack: (id: string, by: 1 | -1) => void;
  /** Moves a layer to a stack index (0 = the back): dragging a row, Alt + ↑/↓ (506). */
  onMove: (id: string, to: number) => void;
  /** Video: the timeline length and playhead, to set when each layer shows. */
  timing?: { duration: number; now: number };
  /** Extra actions under the list (e.g. "Copy layers to every photo"). */
  extra?: ReactNode;
  /** Video (205): a keyframe button for the selected layer's value(s), beside its control; the photo editor has none. */
  keyframes?: (props: LayerKeyProp[], label: string) => ReactNode;
  /** Video (205): previous / next keyframe buttons for the selected layer, in its heading. */
  keyNav?: ReactNode;
}

/** A shape to draw as a button's icon. */
interface ShapeIconProps {
  shape: (typeof SHAPES)[number]['id'];
}

/**
 * A shape's icon, drawn in the text colour on a small canvas.
 * @param props the shape
 */
export function ShapeIcon({ shape }: Readonly<ShapeIconProps>) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current,
      context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const definition = shapeDef(shape),
      scale = Math.min(36 / definition.w, 22 / Math.max(definition.h, 0.06));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    shapePath(context, shape, definition.w * scale, Math.max(definition.h * scale, shape === 'line' ? 3 : 4));
    context.fillStyle = getComputedStyle(canvas).color;
    context.fill();
    context.restore();
  }, [shape]);
  return <canvas ref={ref} width={44} height={28} aria-hidden="true" />;
}

/**
 * New layers on a video start at the playhead (at least half a second before the end).
 * @param props the panel's timing (video), if any
 * @param layer the new layer
 * @returns the layer, placed
 */
const placed = (props: Pick<LayerPanelProps, 'timing'>, layer: Layer): Layer =>
  props.timing ? { ...layer, start: Math.min(props.timing.now, Math.max(0, props.timing.duration - 0.5)) } : layer;

/**
 * Text styles to add with one tap.
 * @param props adding a layer, and the timing (video)
 */
export function AddText(props: Readonly<Pick<LayerPanelProps, 'onAdd' | 'timing'>>) {
  return (
    <div className="ig-group">
      <div className="lp-styles">
        {TEXT_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            className="lp-style"
            style={{
              fontFamily: `"${style.font}", sans-serif`,
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? 'italic' : 'normal',
              color: style.bg ? style.color : undefined,
              background: style.bg || undefined,
            }}
            onClick={() => props.onAdd(placed(props, newText(style)))}
          >
            {style.name}
          </button>
        ))}
      </div>
      <p className="hint">Then type your words in the inspector, or double-click the text on the canvas.</p>
    </div>
  );
}

/** Pictures for image layers are kept at most this many pixels on their longer side. */
const IMAGE_MAX = 2048;

/** A picture kept for image layers, and its size. */
interface LayerImage {
  id: string;
  w: number;
  h: number;
}

/**
 * A picture file as a canvas of at most IMAGE_MAX px, kept for image layers.
 * @param file the picture file
 * @returns the kept picture's id and size
 */
async function loadLayerImage(file: File): Promise<LayerImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_MAX / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D canvas');
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { id: addLayerImage(canvas), w: canvas.width, h: canvas.height };
}

/**
 * Shapes (which can hold words), emoji stickers and images.
 * @param props adding a layer, and the timing (video)
 */
export function AddElements(props: Readonly<Pick<LayerPanelProps, 'onAdd' | 'timing'>>) {
  const addImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { id, w, h } = await loadLayerImage(file);
      props.onAdd(placed(props, newImageLayer(id, w, h, file.name.replace(/\.[a-z0-9]+$/i, ''))));
    } catch (error) {
      logError('handled', error);
      toast('That picture couldn’t be opened. Try a PNG, JPEG or WebP file.');
    }
  };
  return (
    // Shapes open first: the image section is not the default (503).
    <>
      <FoldSection id="elements.image" title="Image" defaultOpen={false}>
        <p className="hint">
          A logo, a frame or a texture over the photo. PNGs keep their transparency; try a blend mode for textures.
        </p>
        <label className="sbtn mst-file">
          Add an image
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) =>
              void addImage(event.target.files?.[0]).then(() => {
                event.target.value = '';
              })
            }
          />
        </label>
      </FoldSection>
      <FoldSection id="elements.shapes" title="Shapes">
        <p className="hint">
          Boxes, labels, bubbles, bursts and ribbons hold words. Draw over any of them with the Draw tool.
        </p>
        <div className="lp-shapes">
          {SHAPES.map((shape) => (
            <button
              key={shape.id}
              type="button"
              className="lp-shape"
              title={shape.name}
              aria-label={`Add ${shape.name.toLowerCase()}`}
              onClick={() => props.onAdd(placed(props, newShape(shape.id)))}
            >
              <ShapeIcon shape={shape.id} />
              <span>{shape.name}</span>
            </button>
          ))}
        </div>
      </FoldSection>
      <FoldSection id="elements.stickers" title="Stickers">
        <div className="lp-stickers">
          {STICKERS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              aria-label={`Add sticker ${emoji}`}
              onClick={() => props.onAdd(placed(props, newSticker(emoji)))}
            >
              {emoji}
            </button>
          ))}
        </div>
      </FoldSection>
    </>
  );
}

/**
 * The selected layer's properties (and its timing on a video); nothing when no layer is selected.
 * @param props the panel's props
 */
export function LayerProps(props: Readonly<LayerPanelProps>) {
  const layer = props.layers.find((candidate) => candidate.id === props.selected);
  return layer ? <LayerProperties {...props} layer={layer} /> : null;
}

/** The drawing tool's settings and actions. */
interface DrawPanelProps {
  tools: LayerTools;
  onTools: (tools: Partial<LayerTools>) => void;
  onNewDrawing: () => void;
}

/**
 * The drawing tool's settings: brush, size and colour, and starting a new drawing.
 * @param props the tools, their change handler and starting a new drawing
 */
export function DrawPanel({ tools, onTools, onNewDrawing }: Readonly<DrawPanelProps>) {
  return (
    <div className="lp">
      <div className="ig-group">
        <h3>Brush</h3>
        <Seg<BrushId>
          label="Brush"
          value={tools.brush}
          options={BRUSHES.map((brush) => [brush.id, brush.name])}
          onChange={(brush) => onTools({ brush })}
        />
        <LpRange
          id="lp-bs"
          label="Brush size"
          value={tools.brushScale}
          min={0.5}
          max={4}
          step={0.1}
          show={`${tools.brushScale.toFixed(1)}×`}
          onChange={(brushScale) => onTools({ brushScale })}
        />
        <span className="lp-label">Colour</span>
        <Swatches label="Brush colour" value={tools.brushColor} onChange={(brushColor) => onTools({ brushColor })} />
      </div>
      <div className="ig-group">
        <p className="hint">
          Draw on the preview with a finger, pen or mouse. Strokes go into the selected drawing, so it moves and resizes
          as one; undo removes the last stroke. Draw over shapes and photos alike.
        </p>
        <button type="button" className="sbtn" onClick={onNewDrawing}>
          <PlusIcon />
          Start a new drawing
        </button>
      </div>
    </div>
  );
}

/**
 * Whether an element is a text field (keyboard shortcuts leave typing alone).
 * @param element the event's target
 * @returns true for inputs, text areas, selects and editable content
 */
export const typingIn = (element: EventTarget | null) =>
  element instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName) || element.isContentEditable);
