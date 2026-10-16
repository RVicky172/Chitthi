import type { Design, Theme } from '../types';
import { mix } from './color';
import { cardMM } from './design';

/*
 * The envelope that goes with a design: its size (the smallest standard envelope the piece fits in), its paper, the
 * shapes of its flaps, and the sheet its fold-your-own template fits on. Drawing the faces is envelopeDraw.ts; the
 * template is envelopeTemplate.ts.
 */

/** Standard envelopes, [name, long side, short side] in mm. */
export const STANDARD: [string, number, number][] = [
  ['Coin 2¼×3½ in', 89, 57],
  ['C7', 114, 81],
  ['A2 (4⅜×5¾ in)', 146, 111],
  ['C6', 162, 114],
  ['A6 (4¾×6½ in)', 165, 121],
  ['A7 (5¼×7¼ in)', 184, 133],
  ['DL', 220, 110],
  ['A9 (5¾×8¾ in)', 222, 146],
  ['C5', 229, 162],
  ['Square 4 in', 102, 102],
  ['Square 5½ in', 140, 140],
  ['Square 6½ in', 165, 165],
  ['Square 7½ in', 190, 190],
  ['Square 9 in', 229, 229],
  ['9×12 in', 305, 229],
  ['C4', 324, 229],
  ['10×13 in', 330, 254],
  ['Square 12½ in', 318, 318],
  ['C3', 458, 324],
];
/** Room around the card inside the envelope (each dimension). */
const EASE = 5;

/** An envelope's name and size. */
export interface EnvelopeSpec {
  name: string;
  /** Envelope size in mm, always landscape (w ≥ h). */
  w: number;
  h: number;
}

/**
 * Standard envelopes at least a size, smallest first.
 * @param long the long side needed, mm
 * @param short the short side needed, mm
 * @param squareOnly only square envelopes
 * @returns the envelopes
 */
function envelopesFitting(long: number, short: number, squareOnly: boolean): [string, number, number][] {
  return STANDARD.filter(([, envelopeLong, envelopeShort]) => envelopeLong >= long && envelopeShort >= short && (!squareOnly || envelopeLong === envelopeShort)).sort(
    (first, second) => first[1] * first[2] - second[1] * second[2],
  );
}

/**
 * The smallest standard envelope the design's piece slides into (square pieces get square envelopes).
 * @param design the design
 * @returns the envelope, or a made-to-measure one when the piece is bigger than any standard envelope
 */
export function envelopeSpec(design: Design): EnvelopeSpec {
  const { w, h } = cardMM(design);
  const long = Math.max(w, h) + EASE;
  const short = Math.min(w, h) + EASE;
  const square = long - short < 3;
  const pick = envelopesFitting(long, short, square).at(0) ?? envelopesFitting(long, short, false).at(0);
  if (pick) return { name: pick[0], w: pick[1], h: pick[2] };
  // Bigger than any standard envelope: a made-to-measure one.
  return { name: `Custom ${Math.round(long + 5)}×${Math.round(short + 5)} mm`, w: Math.round(long + 5), h: Math.round(short + 5) };
}

/** The envelope papers' colours. */
const PAPER = { cream: '#F6EEDC', white: '#FFFFFF', kraft: '#C8A67C' } as const;

/**
 * The envelope's paper colour.
 * @param design the design
 * @param theme its theme
 * @returns the chosen paper, or a warm white tinted by the occasion
 */
export function paperOf(design: Design, theme: Theme): string {
  return design.env.paper === 'occasion' ? mix('#FFFDF8', theme.bg1, 0.14) : PAPER[design.env.paper];
}

/* ---------- flap geometry (in envelope-back coordinates: top edge y = 0) ---------- */

/**
 * Depth of the closing flap.
 * @param design the design
 * @returns a share of the envelope's height
 */
export const flapDepth = (design: Design): number => ({ pointed: 0.56, straight: 0.3, wallet: 0.38 })[design.env.style];

/**
 * Traces the closing flap, hanging from the top edge down over the back.
 * @param context the canvas
 * @param design the design (its flap style)
 * @param x the envelope's left
 * @param y the envelope's top
 * @param width the envelope's width
 * @param height the envelope's height
 */
export function flapPath(context: CanvasRenderingContext2D, design: Design, x: number, y: number, width: number, height: number): void {
  const depth = height * flapDepth(design);
  const radius = Math.min(width, height) * 0.04;
  context.beginPath();
  if (design.env.style === 'pointed') {
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width / 2 + radius, y + depth - radius * 0.6);
    context.quadraticCurveTo(x + width / 2, y + depth, x + width / 2 - radius, y + depth - radius * 0.6);
    context.closePath();
  } else if (design.env.style === 'straight') {
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + depth - radius);
    context.quadraticCurveTo(x + width, y + depth, x + width - radius, y + depth);
    context.lineTo(x + radius, y + depth);
    context.quadraticCurveTo(x, y + depth, x, y + depth - radius);
    context.closePath();
  } else {
    context.moveTo(x, y);
    context.lineTo(x + width, y);
    context.lineTo(x + width, y + depth * 0.72);
    context.quadraticCurveTo(x + width / 2, y + depth * 1.28, x, y + depth * 0.72);
    context.closePath();
  }
}

/** Where a seal sits and how big it is. */
export interface SealPlace {
  x: number;
  y: number;
  /** Radius. */
  r: number;
}

/**
 * Where the seal sits: the tip of the flap.
 * @param design the design (its flap style)
 * @param width the envelope's width
 * @param height the envelope's height
 * @returns the seal's centre and radius
 */
export function sealAt(design: Design, width: number, height: number): SealPlace {
  const depth = height * flapDepth(design);
  const radius = Math.min(width, height) * 0.085;
  let y = depth;
  if (design.env.style === 'pointed') y = depth - radius * 0.95;
  else if (design.env.style === 'wallet') y = depth * 0.98;
  return { x: width / 2, y, r: radius };
}

/* ---------- shared geometry (mm) ---------- */

/** The envelope's side and bottom flaps. */
export interface Geo {
  /** Side flap width and bottom flap depth. */
  side: number;
  bottom: number;
}

/**
 * The side and bottom flaps of an envelope.
 * @param spec the envelope
 * @returns their sizes, mm
 */
export function geoOf(spec: EnvelopeSpec): Geo {
  // Narrow side flaps (still wide enough to glue) keep C6 and A6 envelopes on an A4 sheet.
  return { side: Math.max(12, Math.min(spec.h * 0.16, spec.w * 0.12)), bottom: spec.h * 0.62 };
}

/**
 * Traces a side flap as seen on the back (it folds in from the edge x = 0 or x = width).
 * @param context the canvas
 * @param width the envelope's width
 * @param height the envelope's height
 * @param side the flap's width
 * @param right the right-hand flap (else the left)
 */
export function sidePath(context: CanvasRenderingContext2D, width: number, height: number, side: number, right: boolean): void {
  const edgeX = right ? width : 0;
  const inward = right ? -side : side;
  context.beginPath();
  context.moveTo(edgeX, height * 0.04);
  context.lineTo(edgeX + inward, height * 0.2);
  context.lineTo(edgeX + inward, height * 0.8);
  context.lineTo(edgeX, height * 0.96);
  context.closePath();
}

/**
 * Traces the bottom flap as seen on the back (it folds up from the bottom edge).
 * @param context the canvas
 * @param width the envelope's width
 * @param height the envelope's height
 * @param bottom the flap's depth
 */
export function bottomPath(context: CanvasRenderingContext2D, width: number, height: number, bottom: number): void {
  const inset = width * 0.08;
  context.beginPath();
  context.moveTo(0, height);
  context.lineTo(inset, height - bottom * 0.9);
  context.quadraticCurveTo(width / 2, height - bottom * 1.08, width - inset, height - bottom * 0.9);
  context.lineTo(width, height);
  context.closePath();
}

/* ---------- fold-your-own template ---------- */

/** Sheets for the fold-your-own template, smallest first: id, width and height (mm), name. */
export const TEMPLATE_SHEETS: [id: string, w: number, h: number, name: string][] = [
  ['a4', 210, 297, 'A4'],
  ['letter', 215.9, 279.4, 'US Letter'],
  ['a3', 297, 420, 'A3'],
  ['1319', 330.2, 482.6, '13×19 in'],
];
/** The template's margin around the net, mm. */
export const TEMPLATE_MARGIN = 5;
/** The template's footer (how to make it), mm. */
export const TEMPLATE_FOOTER = 12;

/** The flat envelope: its flaps and overall size, mm. */
export interface Net {
  /** Side flap width, bottom flap depth (mm). */
  side: number;
  bottom: number;
  /** Closing flap depth. */
  top: number;
  w: number;
  h: number;
}

/**
 * The flat envelope.
 * @param design the design (its flap style)
 * @param spec the envelope
 * @returns its flaps and overall size, mm
 */
export function netOf(design: Design, spec: EnvelopeSpec): Net {
  const { side, bottom } = geoOf(spec);
  const top = spec.h * (flapDepth(design) + (design.env.style === 'wallet' ? 0.1 : 0));
  return { side, bottom, top, w: spec.w + 2 * side, h: spec.h + top + bottom };
}

/** The sheet a template is printed on. */
export interface TemplateSheet {
  id: string;
  name: string;
  /** Page size in mm, in the orientation used. */
  w: number;
  h: number;
}

/**
 * The smallest sheet the flat envelope fits on (either way round).
 * @param design the design
 * @returns the sheet, or null when it's too big for 13×19 in
 */
export function templateSheet(design: Design): TemplateSheet | null {
  const net = netOf(design, envelopeSpec(design));
  for (const [id, sheetWidth, sheetHeight, name] of TEMPLATE_SHEETS)
    for (const [width, height] of [
      [sheetWidth, sheetHeight],
      [sheetHeight, sheetWidth],
    ] as const)
      if (net.w + 2 * TEMPLATE_MARGIN <= width && net.h + 2 * TEMPLATE_MARGIN + TEMPLATE_FOOTER <= height) return { id, name, w: width, h: height };
  return null;
}

/**
 * The envelope summary for the print spec and the Print step.
 * @param design the design
 * @returns the envelope, its size, and the template's sheet or why there is none
 */
export function envelopeSummary(design: Design): string {
  const spec = envelopeSpec(design);
  const sheet = templateSheet(design);
  const template = sheet ? `; fold-your-own template on ${sheet.name}` : '; too big for a printable template, so print on a ready-made envelope';
  return `${spec.name}, ${spec.w} × ${spec.h} mm${template}`;
}
