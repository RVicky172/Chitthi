import { useEffect, type RefObject } from 'react';
import { igFormat, type IgFormatId } from '../../data/instagram';
import { photoPlace, renderIg } from '../../engine/instagram';
import { drawLayers, layerBox } from '../../engine/layerDraw';
import { drawSelection } from '../../engine/layerPick';
import type { Mask, MaskPart } from '../../engine/masks';
import { frameMask, partHandles, type PhotoPlace } from '../../engine/maskPlace';
import type { IgItem } from '../../state/instagram';
import { useSegmentsTick } from '../ig/useAiMask';
import { handleRadius, useFontsTick } from '../ig/useLayerPointer';

/*
 * Drawing a photo of the batch on a canvas (the stage and the strip's thumbnails): the photo with its settings, its
 * layers, and on the stage the selected layer's handles, the selected mask in red and its gradient's guides.
 */

/**
 * A data: URL as a Blob, without fetch() (the web CSP doesn't allow fetching data: URLs).
 * @param url the data URL
 * @returns its bytes, typed as the URL says (JPEG when it doesn't)
 */
export function dataUrlToBlob(url: string): Blob {
  const [head = '', body = ''] = url.split(',');
  const type = /data:([^;,]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

/**
 * The selected mask as a red tint over the photo (the stage only, never exports).
 * @param context the stage's canvas
 * @param item the photo
 * @param mask the mask
 * @param width the canvas's width in pixels
 * @param height its height
 */
function drawMaskOverlay(context: CanvasRenderingContext2D, item: IgItem, mask: Mask, width: number, height: number): void {
  const { preview } = item;
  const coverage = frameMask(mask, preview.width, preview.height, photoPlace(preview.width, preview.height, item.edit, width, height), width, height, preview);
  const tint = document.createElement('canvas');
  tint.width = coverage.width;
  tint.height = coverage.height;
  const tintContext = tint.getContext('2d');
  if (!tintContext) return;
  const image = tintContext.createImageData(coverage.width, coverage.height);
  const pixels = new Uint32Array(image.data.buffer);
  // Red at half strength where the mask is full (little-endian RGBA: alpha in the top byte).
  for (let index = 0; index < coverage.data.length; index++) {
    const value = coverage.data[index] ?? 0;
    if (value) pixels[index] = ((value >> 1) << 24) | 0x4024e8;
  }
  tintContext.putImageData(image, 0, 0);
  context.drawImage(tint, 0, 0, width, height);
}

/**
 * Strokes a guide twice, dark then light, so it shows on any photo.
 * @param context the canvas
 * @param radius the handle radius (line widths follow it)
 * @param trace adds the guide's path
 * @param isDashed true for a dashed guide
 */
function strokeGuide(context: CanvasRenderingContext2D, radius: number, trace: () => void, isDashed = false): void {
  for (const [colour, lineWidth] of [
    ['rgba(0,0,0,0.55)', radius * 0.45],
    ['#ffffff', radius * 0.22],
  ] as const) {
    context.setLineDash(isDashed ? [radius, radius * 0.8] : []);
    context.strokeStyle = colour;
    context.lineWidth = Math.max(1, lineWidth);
    context.beginPath();
    trace();
    context.stroke();
  }
}

/**
 * A gradient's guides on the stage: a linear one's full and empty lines (and its middle, dashed), a radial one's edge
 * (and where its feather starts, dashed), with their handles. Drawn on the photo, turned and mirrored with it.
 * @param context the stage's canvas
 * @param part the selected mask part
 * @param place the photo's place on the canvas
 * @param radius the handle radius
 */
function drawPartGuide(context: CanvasRenderingContext2D, part: MaskPart, place: PhotoPlace, radius: number): void {
  if (part.kind !== 'linear' && part.kind !== 'radial') return;
  context.save();
  context.translate(place.cx, place.cy);
  context.rotate((place.rot * Math.PI) / 180);
  if (place.flip) context.scale(-1, 1);
  context.translate((part.x - 0.5) * place.w, (part.y - 0.5) * place.h);
  context.rotate((part.angle * Math.PI) / 180);
  if (part.kind === 'linear') {
    const halfWidth = (part.width * place.w) / 2;
    const length = Math.hypot(place.w, place.h);
    for (const at of [-halfWidth, 0, halfWidth])
      strokeGuide(
        context,
        radius,
        () => {
          context.moveTo(at, -length);
          context.lineTo(at, length);
        },
        at === 0,
      );
  } else {
    const radiusX = part.rx * place.w;
    const radiusY = part.ry * place.w;
    const inner = 1 - part.feather / 100;
    strokeGuide(context, radius, () => context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2));
    if (inner > 0.02) strokeGuide(context, radius, () => context.ellipse(0, 0, radiusX * inner, radiusY * inner, 0, 0, Math.PI * 2), true);
  }
  context.restore();
  for (const handle of partHandles(part, place)) {
    context.beginPath();
    context.arc(handle.x, handle.y, handle.id === 'move' ? radius * 0.9 : radius * 0.7, 0, Math.PI * 2);
    context.fillStyle = handle.id === 'move' ? '#ffffff' : '#e82440';
    context.fill();
    context.lineWidth = Math.max(1, radius * 0.2);
    context.strokeStyle = 'rgba(0,0,0,0.6)';
    context.stroke();
  }
}

/** What the stage shows of the masks while the Masks tool is open: the selected mask in red, its gradient's guides. */
export interface MaskView {
  mask: Mask;
  part: MaskPart | null;
  /** Whether the mask shows in red. */
  overlay: boolean;
}

/** What to draw on the stage on top of the photo. */
interface StageMarks {
  /** The selected layer, whose handles show. */
  selection?: string | null;
  view?: MaskView | null;
}

/**
 * Draws one photo, its layers and (for the stage) the selected layer's handles and the selected mask's overlay, at
 * `width` CSS px, again whenever any of them, the fonts or the AI segmentations change.
 * @param canvasRef the canvas
 * @param item the photo (nothing is drawn without one)
 * @param formatId the post format
 * @param width the canvas's width in CSS pixels
 * @param marks the selected layer and the mask view (stage only)
 */
export function usePhotoRender(canvasRef: RefObject<HTMLCanvasElement | null>, item: IgItem | undefined, formatId: IgFormatId, width: number, marks: StageMarks = {}): void {
  const fontsTick = useFontsTick(item?.layers ?? []);
  const segmentsTick = useSegmentsTick();
  const { selection = null, view = null } = marks;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !item || width <= 0) return;
    const format = igFormat(formatId);
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round((width * pixelRatio * format.h) / format.w);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pixelWidth, pixelHeight);
    const { preview } = item;
    renderIg(context, preview, preview.width, preview.height, item.edit, pixelWidth, pixelHeight);
    drawLayers(context, item.layers, pixelWidth, pixelHeight);
    const selected = selection && item.layers.find((layer) => layer.id === selection && !layer.hidden);
    if (selected) drawSelection(context, layerBox(context, selected, pixelWidth, pixelHeight), handleRadius(canvas));
    if (view?.overlay) drawMaskOverlay(context, item, view.mask, pixelWidth, pixelHeight);
    if (view?.part) drawPartGuide(context, view.part, photoPlace(preview.width, preview.height, item.edit, pixelWidth, pixelHeight), handleRadius(canvas));
  }, [canvasRef, item, formatId, width, selection, fontsTick, segmentsTick, view]);
}
