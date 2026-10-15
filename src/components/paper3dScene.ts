// Paper sizes in 3D: the pieces (every printed size, envelopes, print sheets, reference objects), their faces (real
// Chitthi renders, cached) and the three arrangements on the mat, all in millimetres (z in screen pixels).
import { productOf, sizesFor } from '../data/products';
import { cardMM, productDesign } from '../engine/design';
import { envelopeSpec } from '../engine/envelope';
import { renderEnvelope } from '../engine/envelopeDraw';
import { nup, SHEETS } from '../engine/printPages';
import { renderCard } from '../engine/render';
import { samplePhoto } from '../engine/sample';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { getState } from '../state/store';
import type { Design, Orient, Photo, ProductId, SizeDef } from '../types';

/** A kind of piece on the mat. */
export type GroupId = ProductId | 'envelope' | 'sheet' | 'ref';
/** How the pieces are arranged. */
export type Mode = 'side' | 'stack' | 'sheet';
/** Which way the pieces lie. */
export type OrientPick = 'natural' | 'portrait' | 'landscape';
/** A print sheet. */
export type SheetId = Design['exp']['sheet'];

/** A group's name and colour. */
interface GroupInfo {
  name: string;
  colour: string;
}

const GROUP_INFO: Record<GroupId, GroupInfo> = {
  postcard: { name: 'Postcards', colour: '#E8833A' },
  calendar: { name: 'Calendars', colour: '#3B82F6' },
  frame: { name: 'Frame prints', colour: '#8B5CF6' },
  magnet: { name: 'Magnets', colour: '#EC4899' },
  envelope: { name: 'Envelopes', colour: '#B08D5B' },
  sheet: { name: 'Print sheets', colour: '#94A3B8' },
  ref: { name: 'Reference', colour: '#10B981' },
};
const GROUP_ORDER: GroupId[] = ['postcard', 'calendar', 'frame', 'magnet', 'envelope', 'sheet', 'ref'];

/** The groups in order: id, name and colour. */
export const GROUPS: [GroupId, string, string][] = GROUP_ORDER.map((group) => [
  group,
  GROUP_INFO[group].name,
  GROUP_INFO[group].colour,
]);

/**
 * A group's name and colour.
 * @param group the group
 * @returns its name and colour
 */
export const groupOf = (group: GroupId): GroupInfo => GROUP_INFO[group];

/** Something lying on the mat. */
export interface Piece {
  id: string;
  name: string;
  group: GroupId;
  /** Size in mm as it lies on the mat. */
  w: number;
  h: number;
  circle?: boolean;
  corner: number;
  tag?: string;
  /** Product pieces: the size and the design drawn on the face. */
  size?: SizeDef;
  design?: Design;
  /** Envelopes: the sizes that go in it. */
  fits?: string[];
  note?: string;
}

/** CSS pixels per millimetre: "actual size" on a correctly calibrated screen. */
export const MM_PX = 96 / 25.4;
/** The bleed shown in the numbers, mm. */
export const BLEED = 3;

/**
 * Rounded to one decimal.
 * @param value the number
 * @returns the rounded number
 */
export const r1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Whether the user asked for less motion.
 * @returns true when reduced motion is on
 */
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The orientation a size lies in.
 * @param size the size
 * @param product its product
 * @param pick the orientation chosen for every piece
 * @returns portrait or landscape
 */
function orientFor(size: SizeDef, product: ProductId, pick: OrientPick): Orient {
  if (size.L === size.S) return 'portrait';
  if (pick !== 'natural') return pick;
  return size.native ?? (product === 'calendar' || product === 'frame' ? 'portrait' : 'landscape');
}

/**
 * The current design moved to a product and size, with bleed and marks.
 * @param product the product
 * @param size the size
 * @param orient the orientation
 * @returns the design
 */
function designFor(product: ProductId, size: SizeDef, orient: Orient): Design {
  const design = productDesign(product, getState().design);
  return {
    ...design,
    sizeId: size.id,
    orient,
    layout: size.instax ? 'instax' : design.layout,
    exp: { ...design.exp, bleed: String(BLEED), marks: true },
  };
}

/**
 * A size's name on the mat: "A5 calendar", but postcards and names that already say the product stay as they are.
 * @param product the product
 * @param size the size
 * @returns the name
 */
function pieceName(product: ProductId, size: SizeDef): string {
  const short = productOf(product).short;
  if (product === 'postcard' || size.name.includes(short)) return size.name;
  return `${size.name} ${short.toLowerCase()}`;
}

/**
 * Notes that a size goes in its envelope, adding the envelope the first time it is seen.
 * @param envelopes the envelopes so far, by name
 * @param design the size's design
 * @param label the size's name in the envelope's "Holds" list
 * @param pick the orientation chosen for every piece
 */
function addToEnvelope(envelopes: Map<string, Piece>, design: Design, label: string, pick: OrientPick): void {
  const envelope = envelopeSpec(design),
    key = envelope.name;
  const known = envelopes.get(key);
  if (known) {
    known.fits?.push(label);
    return;
  }
  envelopes.set(key, {
    id: `env:${key}`,
    name: `${key} envelope`,
    group: 'envelope',
    w: pick === 'portrait' ? envelope.h : envelope.w,
    h: pick === 'portrait' ? envelope.w : envelope.h,
    corner: 0,
    design: { ...design, env: { ...design.env, on: true } },
    fits: [label],
  });
}

const PRODUCTS: ProductId[] = ['postcard', 'calendar', 'frame', 'magnet'];

/** A bank card and a coin, to judge sizes against. */
const REFERENCES: Piece[] = [
  {
    id: 'ref:card',
    name: 'Bank card',
    group: 'ref',
    w: 85.6,
    h: 53.98,
    corner: 3.2,
    note: 'A debit or credit card (85.6 × 54 mm), to judge sizes against something in your wallet.',
  },
  {
    id: 'ref:coin',
    name: '₹10 coin',
    group: 'ref',
    w: 27,
    h: 27,
    circle: true,
    corner: 0,
    note: 'A ₹10 coin is 27 mm across.',
  },
];

/**
 * The print sheets, in the chosen orientation.
 * @param pick the orientation chosen for every piece
 * @returns the sheet pieces
 */
function sheetPieces(pick: OrientPick): Piece[] {
  const land = pick === 'landscape';
  return (Object.entries(SHEETS) as [SheetId, [number, number, string]][]).map(([id, [width, height, name]]) => ({
    id: `sheet:${id}`,
    name: `${name} sheet`,
    group: 'sheet',
    w: land ? height : width,
    h: land ? width : height,
    corner: 0,
    note: 'A sheet the print shop prints on. Sheet PDFs place as many pieces on it as fit, with crop marks.',
  }));
}

/**
 * Every piece the page can show, in the chosen orientation: the products' sizes, their envelopes, the print sheets
 * and the reference objects.
 * @param pick the orientation chosen for every piece
 * @returns the pieces
 */
export function allPieces(pick: OrientPick): Piece[] {
  const out: Piece[] = [];
  const envelopes = new Map<string, Piece>();
  for (const product of PRODUCTS) {
    for (const size of sizesFor(product).filter((candidate) => candidate.id !== 'custom')) {
      const design = designFor(product, size, orientFor(size, product, pick)),
        { w, h } = cardMM(design);
      out.push({
        id: `${product}:${size.id}`,
        name: pieceName(product, size),
        group: product,
        w,
        h,
        circle: size.shape === 'circle',
        corner: size.corner ?? (size.instax ? 3 : 0),
        tag: size.tag,
        size,
        design,
      });
      addToEnvelope(envelopes, design, `${size.name} ${productOf(product).short.toLowerCase()}`, pick);
    }
  }
  out.push(...envelopes.values(), ...sheetPieces(pick), ...REFERENCES);
  return out;
}

/* ---------- faces: real Chitthi renders, drawn once and cached ---------- */

const faces = new Map<string, string>();
let samples: Photo[] | null = null;

/**
 * The cache key of a piece's face (its id and size).
 * @param piece the piece
 * @returns the key
 */
const faceKey = (piece: Piece) => `${piece.id}:${piece.w}x${piece.h}`;

/**
 * A piece's face when it has been drawn.
 * @param piece the piece
 * @returns the face as a JPEG data URL, or undefined
 */
export const drawnFace = (piece: Piece): string | undefined => faces.get(faceKey(piece));

/**
 * Draws a piece's face (its design with sample photos) once, then serves it from the cache.
 * @param piece the piece
 * @returns the face as a JPEG data URL, or null for a piece without a design
 */
export async function faceOf(piece: Piece): Promise<string | null> {
  if (!piece.design) return null;
  const key = faceKey(piece);
  const hit = faces.get(key);
  if (hit) return hit;
  samples ??= [0, 1, 2, 3].map((index) => samplePhoto(index, 480, 340));
  await ensureFonts(fontsFor(piece.design));
  const canvas = document.createElement('canvas'),
    scale = Math.min(3, 420 / Math.max(piece.w, piece.h));
  if (piece.group === 'envelope') renderEnvelope(canvas, 'front', scale, { d: piece.design, photos: samples });
  else renderCard(canvas, 'front', scale, 0, { d: piece.design, photos: samples }, { thumb: true });
  const url = canvas.toDataURL('image/jpeg', 0.82);
  faces.set(key, url);
  return url;
}

/* ---------- arrangements (all in mm; z in screen pixels) ---------- */

/** A piece placed on the mat: its centre, height above the mat and size. */
export interface Placed {
  pc: Piece;
  x: number;
  y: number;
  z: number;
  /** Turned 90° (a piece imposed sideways on a sheet). */
  rot?: boolean;
  w: number;
  h: number;
}

/** An arrangement: the placed pieces and the area they cover. */
export interface Scene {
  placed: Placed[];
  w: number;
  h: number;
  /** On a sheet: how many pieces fit. */
  count?: number;
}

/** Room under each piece for its label (side by side), and between pieces, mm. */
export const LABEL = 16,
  GAP = 18;

/** A row of pieces side by side. */
interface Row {
  items: Piece[];
  w: number;
  h: number;
}

/**
 * Pieces in rows, largest first, filling a roughly 1.7 : 1 area; pieces in a row share a baseline.
 * @param pieces the pieces
 * @returns the arrangement
 */
export function sideBySide(pieces: Piece[]): Scene {
  if (!pieces.length) return { placed: [], w: 300, h: 200 };
  const items = [...pieces].sort((left, right) => right.w * right.h - left.w * left.h);
  const area = items.reduce((sum, piece) => sum + (piece.w + GAP) * (piece.h + GAP + LABEL), 0),
    maxW = Math.max(...items.map((piece) => piece.w), Math.sqrt(area * 1.7));
  const rows: Row[] = [];
  let row: Row = { items: [], w: 0, h: 0 };
  for (const piece of items) {
    if (row.items.length && row.w + GAP + piece.w > maxW) {
      rows.push(row);
      row = { items: [], w: 0, h: 0 };
    }
    row.w += (row.items.length ? GAP : 0) + piece.w;
    row.h = Math.max(row.h, piece.h);
    row.items.push(piece);
  }
  rows.push(row);
  const total = rows.reduce((sum, line) => sum + line.h + LABEL, 0) + GAP * (rows.length - 1),
    width = Math.max(...rows.map((line) => line.w));
  const placed: Placed[] = [];
  let y = -total / 2;
  for (const line of rows) {
    let x = -line.w / 2;
    for (const piece of line.items) {
      // Pieces in a row share a baseline, so their labels line up.
      placed.push({ pc: piece, x: x + piece.w / 2, y: y + line.h - piece.h / 2, z: 0, w: piece.w, h: piece.h });
      x += piece.w + GAP;
    }
    y += line.h + LABEL + GAP;
  }
  return { placed, w: width, h: total };
}

/**
 * Pieces stacked on one centre, largest at the bottom.
 * @param pieces the pieces
 * @returns the arrangement
 */
export function stacked(pieces: Piece[]): Scene {
  const items = [...pieces].sort((left, right) => right.w * right.h - left.w * left.h);
  const step = Math.min(12, 150 / Math.max(1, items.length));
  return {
    placed: items.map((piece, index) => ({ pc: piece, x: 0, y: 0, z: index * step, w: piece.w, h: piece.h })),
    w: Math.max(100, ...items.map((piece) => piece.w)),
    h: Math.max(100, ...items.map((piece) => piece.h)),
  };
}

/**
 * One size imposed on a print sheet exactly as the sheet PDF does it, the pieces lifted above the sheet.
 * @param piece the size (nothing is imposed without a design)
 * @param sheet the sheet
 * @param lift how high the pieces float, pixels
 * @returns the arrangement, with how many fit
 */
export function onSheet(piece: Piece | undefined, sheet: SheetId, lift: number): Scene {
  const [sheetW, sheetH, name] = SHEETS[sheet];
  const sheetPiece: Piece = {
    id: `sheet:${sheet}`,
    name: `${name} sheet`,
    group: 'sheet',
    w: sheetW,
    h: sheetH,
    corner: 0,
  };
  const placed: Placed[] = [{ pc: sheetPiece, x: 0, y: 0, z: 0, w: sheetW, h: sheetH }];
  if (!piece?.design) return { placed, w: sheetW, h: sheetH, count: 0 };
  const layout = nup({ ...piece.design, exp: { ...piece.design.exp, sheet } }),
    gridW = layout.cols * layout.cw + (layout.cols - 1) * layout.gap,
    gridH = layout.rows * layout.ch + (layout.rows - 1) * layout.gap,
    x0 = (sheetW - gridW) / 2,
    y0 = (sheetH - gridH) / 2;
  for (let row = 0; row < layout.rows; row++)
    for (let column = 0; column < layout.cols; column++)
      placed.push({
        pc: piece,
        x: x0 + column * (layout.cw + layout.gap) + layout.cw / 2 - sheetW / 2,
        y: y0 + row * (layout.ch + layout.gap) + layout.ch / 2 - sheetH / 2,
        z: 2 + lift * (1 + (row * layout.cols + column) * 0.04),
        w: layout.w,
        h: layout.h,
        rot: layout.rot,
      });
  return { placed, w: sheetW, h: sheetH, count: layout.cols * layout.rows };
}

/**
 * How big a piece is against an A4 sheet.
 * @param piece the piece
 * @returns the comparison
 */
export function area(piece: Piece): string {
  const areaMM = piece.circle ? Math.PI * (piece.w / 2) ** 2 : piece.w * piece.h,
    ofA4 = areaMM / (210 * 297);
  if (ofA4 > 0.94 && ofA4 < 1.06) return 'about the size of an A4 sheet';
  if (ofA4 > 1) return `${r1(ofA4)} × the area of an A4 sheet`;
  const fraction = Math.round(1 / ofA4);
  return fraction <= 1 ? 'a little smaller than A4' : `about 1/${fraction} of an A4 sheet`;
}
