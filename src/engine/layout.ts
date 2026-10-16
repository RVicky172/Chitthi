import type { Box, Design, Layout, LayoutId, Rect, Slot } from '../types';
import { cardMM } from './design';
import type { LayoutBuilder, LayoutContext, SlotIn } from './layoutParts';
import {
  arch,
  band,
  circle,
  collage2,
  collage3,
  collage4,
  diagonal,
  filmstrip,
  fullPhoto,
  glass,
  instax,
  magazine,
  minimal,
  mosaic,
  offset,
  photobooth,
  polaroid,
  roundWindow,
  sandwich,
  scrapbook,
  split,
  stamp,
  textFirst,
  textOnly,
  twinArch,
} from './postcardLayouts';
import { calendar, framePrint, magnetBadge, magnetCaption, magnetDuo, magnetGrid, magnetQuote } from './printLayouts';

/*
 * Print layouts: where each layout puts its photo slots, its words and its decoration (paper, bands, glass, stamps,
 * film, calendar title and grid) inside the card. One builder per layout, chosen from a table by the layout's id.
 */

/**
 * Which photo fills a slot. Calendars move on through the photos month by month.
 * @param slot the slot's index
 * @param photoCount how many photos there are
 * @param page the calendar page, 0-based
 * @param slotsPerPage how many slots each page has
 * @returns an index into the photo list (0 when there are no photos)
 */
export const slotPhotoIndex = (slot: number, photoCount: number, page = 0, slotsPerPage = 1): number =>
  photoCount ? (page * slotsPerPage + slot) % photoCount : 0;

/**
 * How many photo slots a layout has at the design's current size and orientation.
 * @param id the layout
 * @param design the design
 * @returns the number of slots
 */
export function slotCount(id: LayoutId, design: Design): number {
  const { w, h } = cardMM(design);
  return computeLayout(id, { x: 0, y: 0, w, h, e: 0 }, design).slots.length;
}

/** How close to the trim edge counts as touching it, px. */
const EDGE_TOLERANCE = 0.5;

/**
 * Grows a rect that touches the trim edge so it runs into the bleed.
 * @param rect the rect
 * @param box the card, with its bleed
 * @returns the grown rect
 */
function extend(rect: Rect, box: Box): Rect {
  const bleed = box.e;
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;
  if (Math.abs(left - box.x) < EDGE_TOLERANCE) left -= bleed;
  if (Math.abs(top - box.y) < EDGE_TOLERANCE) top -= bleed;
  if (Math.abs(right - (box.x + box.w)) < EDGE_TOLERANCE) right += bleed;
  if (Math.abs(bottom - (box.y + box.h)) < EDGE_TOLERANCE) bottom += bleed;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Each layout's builder. */
const BUILDERS: Record<LayoutId, LayoutBuilder> = {
  full: fullPhoto,
  magazine,
  band,
  textfirst: textFirst,
  split,
  sandwich,
  polaroid,
  instax,
  photobooth,
  arch,
  window: roundWindow,
  circle,
  stamp,
  collage2,
  collage3,
  mosaic,
  collage4,
  text: textOnly,
  offset,
  diagonal,
  scrapbook,
  filmstrip,
  minimal,
  'twin-arch': twinArch,
  glass,
  'frame-single': framePrint,
  'frame-caption': framePrint,
  'frame-duo': framePrint,
  'frame-trio': framePrint,
  'frame-grid': framePrint,
  'frame-feature': framePrint,
  'cal-top': calendar,
  'cal-side': calendar,
  'cal-full': calendar,
  'cal-duo': calendar,
  'cal-plain': calendar,
  'cal-strip': calendar,
  'cal-glass': calendar,
  'cal-bold': calendar,
  'cal-arch': calendar,
  'mag-full': fullPhoto,
  'mag-caption': magnetCaption,
  'mag-polaroid': magnetCaption,
  'mag-duo': magnetDuo,
  'mag-grid': magnetGrid,
  'mag-badge': magnetBadge,
  'mag-quote': magnetQuote,
};

/**
 * A coordinate on the trim edge moved out into the bleed.
 * @param value the coordinate
 * @param start the card's left (or top) edge
 * @param size the card's width (or height)
 * @param bleed the bleed
 * @returns the coordinate, moved out when it is on an edge
 */
function pushToBleed(value: number, start: number, size: number, bleed: number): number {
  if (Math.abs(value - start) < EDGE_TOLERANCE) return value - bleed;
  if (Math.abs(value - start - size) < EDGE_TOLERANCE) return value + bleed;
  return value;
}

/**
 * A slot with its drawn area: grown into the bleed where it should be. Polygon slots: corners on the trim edge move
 * out into the bleed, and the drawn area is their bounding box.
 * @param slot the slot
 * @param box the card, with its bleed
 * @returns the finished slot
 */
function finishSlot(slot: SlotIn, box: Box): Slot {
  if (!slot.pts) return { ...slot, d: slot.bleed ? extend(slot, box) : { x: slot.x, y: slot.y, w: slot.w, h: slot.h } };
  const pts = slot.pts.map(([x, y]): [number, number] => [pushToBleed(x, box.x, box.w, box.e), pushToBleed(y, box.y, box.h, box.e)]);
  const xs = pts.map((point) => point[0]);
  const ys = pts.map((point) => point[1]);
  const drawn = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return { ...slot, pts, d: drawn };
}

/**
 * Computes the photo slots, the text zone and the decoration for a layout inside the card.
 * @param id the layout
 * @param box the card's trim box and bleed (canvas pixels)
 * @param design the design
 * @returns the layout
 */
export function computeLayout(id: LayoutId, box: Box, design: Design): Layout {
  const short = Math.min(box.w, box.h);
  const layout: Layout = {
    slots: [],
    text: null,
    onPhoto: false,
    bg: true,
    band: null,
    overlay: false,
    paper: null,
    stamp: null,
    post: null,
    ink: null,
    frame: false,
    frameLine: 0,
  };
  const context: LayoutContext = { id, box, design, landscape: box.w >= box.h, short, pad: short * 0.075, gap: short * 0.016, unit: short / 100, layout };
  const slots = BUILDERS[id](context);
  layout.slots = slots.map((slot) => finishSlot(slot, box));
  if (layout.band) layout.band = extend(layout.band, box);
  if (layout.scrimArea) layout.scrimArea = extend(layout.scrimArea, box);
  return layout;
}
