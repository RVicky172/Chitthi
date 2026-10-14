import type { RenderInput } from '../types';
import { resolveTheme } from './design';
import { envelopeSpec, flapPath, netOf, paperOf, TEMPLATE_FOOTER, TEMPLATE_MARGIN, templateSheet, type EnvelopeSpec, type Net, type TemplateSheet } from './envelope';
import { renderEnvelope } from './envelopeDraw';

/*
 * The fold-your-own envelope template: the flat net on its sheet, printed on one side, with cut and fold lines and
 * how to make it.
 */

/** How far the paper colour runs past every cut, mm. */
const TEMPLATE_BLEED = 2;

/** The flat envelope placed on its sheet, and how to trace its outline (sheet mm). */
interface PlacedNet {
  context: CanvasRenderingContext2D;
  input: RenderInput;
  /** The address front's left and top on the sheet. */
  left: number;
  top: number;
  /** The envelope's width and height. */
  width: number;
  height: number;
  net: Net;
}

/**
 * Traces a side flap's outline, from the top fold to the bottom fold.
 * @param placed the net on its sheet
 * @param direction -1 the left flap, 1 the right
 */
function traceSide({ context, left, top, width, height, net }: PlacedNet, direction: -1 | 1): void {
  const edgeX = direction < 0 ? left : left + width;
  const outward = direction * net.side;
  context.moveTo(edgeX, top);
  context.lineTo(edgeX, top + height * 0.04);
  context.lineTo(edgeX + outward, top + height * 0.2);
  context.lineTo(edgeX + outward, top + height * 0.8);
  context.lineTo(edgeX, top + height * 0.96);
  context.lineTo(edgeX, top + height);
}

/**
 * Traces the bottom flap's outline.
 * @param placed the net on its sheet
 */
function traceBottom({ context, left, top, width, height, net }: PlacedNet): void {
  const inset = width * 0.08;
  context.moveTo(left, top + height);
  context.lineTo(left + inset, top + height + net.bottom * 0.9);
  context.quadraticCurveTo(left + width / 2, top + height + net.bottom * 1.08, left + width - inset, top + height + net.bottom * 0.9);
  context.lineTo(left + width, top + height);
}

/**
 * Traces the closing flap: the back's flap shape, turned 180° about the top fold.
 * @param placed the net on its sheet
 */
function traceTop({ context, input, left, top, width, height }: PlacedNet): void {
  context.save();
  context.translate(left + width, top);
  context.scale(-1, -1);
  flapPath(context, input.d, 0, 0, width, height);
  context.restore();
}

/**
 * Traces the front panel with its side and bottom flaps (the closing flap is separate).
 * @param placed the net on its sheet
 */
function traceOutline(placed: PlacedNet): void {
  const { context, left, top, width, height } = placed;
  context.beginPath();
  context.rect(left, top, width, height);
  traceSide(placed, -1);
  traceSide(placed, 1);
  traceBottom(placed);
  context.closePath();
}

/**
 * Fills the net with the paper colour, with a little bleed past every cut.
 * @param placed the net on its sheet
 * @param paper the paper colour
 */
function fillPaper(placed: PlacedNet, paper: string): void {
  const { context } = placed;
  context.fillStyle = paper;
  context.strokeStyle = paper;
  context.lineWidth = TEMPLATE_BLEED * 2;
  context.lineJoin = 'round';
  traceOutline(placed);
  context.fill();
  context.stroke();
  traceTop(placed);
  context.fill();
  context.stroke();
}

/**
 * Draws something clipped to a traced shape.
 * @param context the canvas
 * @param trace traces the shape
 * @param draw draws inside it
 */
function clipTo(context: CanvasRenderingContext2D, trace: () => void, draw: () => void): void {
  context.save();
  context.beginPath();
  trace();
  context.closePath();
  context.clip();
  draw();
  context.restore();
}

/**
 * Places the envelope's printed faces on the net. Side and bottom flaps carry the back's artwork (including the
 * Chitthi mark): folded behind the front and turned over, a side flap shows the opposite side of the back unchanged,
 * and the bottom flap shows the back turned 180°. The closing flap's outside carries the back's flap and seal, turned
 * 180°; the address front goes in the centre panel.
 * @param placed the net on its sheet
 * @param pxPerMm the faces' resolution
 */
function placeFaces(placed: PlacedNet, pxPerMm: number): void {
  const { context, input, left, top, width, height } = placed;
  const body = document.createElement('canvas');
  renderEnvelope(body, 'body', pxPerMm, input);
  clipTo(
    context,
    () => traceSide(placed, -1),
    () => context.drawImage(body, left - width, top, width, height),
  );
  clipTo(
    context,
    () => traceSide(placed, 1),
    () => context.drawImage(body, left + width, top, width, height),
  );
  clipTo(
    context,
    () => traceBottom(placed),
    () => {
      context.translate(left + width, top + 2 * height);
      context.scale(-1, -1);
      context.drawImage(body, 0, 0, width, height);
    },
  );
  context.save();
  context.translate(left + width, top);
  context.scale(-1, -1);
  const flap = document.createElement('canvas');
  renderEnvelope(flap, 'flap', pxPerMm, input);
  context.drawImage(flap, 0, 0, width, height);
  context.restore();
  const front = document.createElement('canvas');
  renderEnvelope(front, 'front', pxPerMm, input);
  context.drawImage(front, left, top, width, height);
}

/**
 * Draws the cut lines (solid) and fold lines (dashed).
 * @param placed the net on its sheet
 */
function cutAndFoldLines(placed: PlacedNet): void {
  const { context, left, top, width, height } = placed;
  context.lineWidth = 0.2;
  context.strokeStyle = '#8A8178';
  context.setLineDash([]);
  context.beginPath();
  traceSide(placed, -1);
  traceSide(placed, 1);
  traceBottom(placed);
  context.stroke();
  traceTop(placed);
  context.stroke();
  context.setLineDash([1.6, 1.2]);
  context.strokeStyle = '#B3A897';
  context.strokeRect(left, top, width, height);
  context.setLineDash([]);
}

/**
 * Writes how to make it, at the foot of the sheet.
 * @param context the canvas
 * @param sheet the sheet
 * @param spec the envelope
 */
function instructions(context: CanvasRenderingContext2D, sheet: TemplateSheet, spec: EnvelopeSpec): void {
  context.fillStyle = '#6A5E52';
  context.font = '600 3.2px Hind, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  const baseline = sheet.h - TEMPLATE_MARGIN;
  context.fillText(`Chitthi envelope · ${spec.name} · ${spec.w} × ${spec.h} mm · print at 100%`, sheet.w / 2, baseline - 4.6);
  context.font = '500 2.8px Hind, sans-serif';
  context.fillText(
    'Cut on the solid line. Fold on the dashed lines, behind the printed front: side flaps first, then glue the bottom flap onto them. Slide the card in and seal the top flap.',
    sheet.w / 2,
    baseline,
    sheet.w - 2 * TEMPLATE_MARGIN,
  );
}

/**
 * Draws the flat envelope on its sheet, printed on one side: the address front in the middle; side, bottom and
 * closing flaps around it. Flaps fold behind the front, so the closing flap's artwork is drawn turned 180° and ends up
 * the right way round on the back. Solid lines are cuts, dashed lines are folds.
 * @param canvas the canvas, sized here
 * @param pxPerMm the resolution, px per mm
 * @param input the design and its photos
 * @returns the sheet, or null when the envelope is too big for any template sheet
 */
export function renderEnvelopeTemplate(canvas: HTMLCanvasElement, pxPerMm: number, input: RenderInput): TemplateSheet | null {
  const design = input.d;
  const sheet = templateSheet(design);
  if (!sheet) return null;
  const spec = envelopeSpec(design);
  const net = netOf(design, spec);
  const paper = paperOf(design, resolveTheme(design));
  canvas.width = Math.round(sheet.w * pxPerMm);
  canvas.height = Math.round(sheet.h * pxPerMm);
  const context = canvas.getContext('2d');
  if (!context) return sheet;
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(pxPerMm, pxPerMm);
  const placed: PlacedNet = {
    context,
    input,
    left: (sheet.w - net.w) / 2 + net.side,
    top: (sheet.h - TEMPLATE_FOOTER - net.h) / 2 + net.top,
    width: spec.w,
    height: spec.h,
    net,
  };
  fillPaper(placed, paper);
  placeFaces(placed, Math.min(pxPerMm, 12));
  cutAndFoldLines(placed);
  instructions(context, sheet, spec);
  return sheet;
}
