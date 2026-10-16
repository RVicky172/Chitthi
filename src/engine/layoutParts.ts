import type { Box, Design, Layout, LayoutId, Rect, Slot } from '../types';

/*
 * What the print layouts are built from: the context each layout's builder gets (the card and its measures) and the
 * small helpers for rects, slots and the words' areas. The builders are in postcardLayouts.ts and printLayouts.ts.
 */

/** A slot before its drawn area (`d`) is known. */
export type SlotIn = Omit<Slot, 'd'>;

/** What every layout builder works from: the card and its measures, and the layout it fills in. */
export interface LayoutContext {
  id: LayoutId;
  box: Box;
  design: Design;
  landscape: boolean;
  /** The card's shorter side. */
  short: number;
  /** The margin around words and framed photos. */
  pad: number;
  /** The gap between photos. */
  gap: number;
  /** A hundredth of the shorter side. */
  unit: number;
  /** The layout being built; builders set its words and decoration. */
  layout: Layout;
}

/** Builds one layout: fills in the context's layout and returns its photo slots. */
export type LayoutBuilder = (context: LayoutContext) => SlotIn[];

/**
 * A rect.
 * @param x left
 * @param y top
 * @param width width
 * @param height height
 * @returns the rect
 */
export const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, w: width, h: height });

/**
 * A rectangular photo slot that runs into the bleed where it touches the trim edge.
 * @param x left
 * @param y top
 * @param width width
 * @param height height
 * @returns the slot
 */
export const bleedSlot = (x: number, y: number, width: number, height: number): SlotIn => ({ s: 'rect', x, y, w: width, h: height, bleed: true });

/**
 * A photo slot that stays inside its rect.
 * @param area the slot's rect
 * @param shape its shape
 * @returns the slot
 */
export const plainSlot = (area: Rect, shape: Slot['s'] = 'rect'): SlotIn => ({ s: shape, ...area });

/**
 * The words' area right of something.
 * @param context the card
 * @param x where the words start
 * @returns the area, to the card's right margin
 */
export const rightOf = ({ box, pad }: LayoutContext, x: number): Rect => rect(x, box.y + pad, box.x + box.w - x - pad, box.h - pad * 2);

/**
 * The words' area below something. Words under a photo stop well above the bottom edge, clear of the border artwork
 * many occasions draw there.
 * @param context the card
 * @param y where the words start
 * @returns the area
 */
export const below = ({ box, pad }: LayoutContext, y: number): Rect => rect(box.x + pad, y, box.w - pad * 2, box.y + box.h - y - pad * 1.75);

/**
 * The card's whole area as one photo slot.
 * @param box the card
 * @returns the slots
 */
export const wholeCard = (box: Box): SlotIn[] => [bleedSlot(box.x, box.y, box.w, box.h)];

/**
 * Four slots in two rows of two.
 * @param x left
 * @param y top
 * @param cellWidth each slot's width
 * @param cellHeight each slot's height
 * @param gap between slots
 * @returns the slots
 */
export const grid2x2 = (x: number, y: number, cellWidth: number, cellHeight: number, gap: number): SlotIn[] => [
  bleedSlot(x, y, cellWidth, cellHeight),
  bleedSlot(x + cellWidth + gap, y, cellWidth, cellHeight),
  bleedSlot(x, y + cellHeight + gap, cellWidth, cellHeight),
  bleedSlot(x + cellWidth + gap, y + cellHeight + gap, cellWidth, cellHeight),
];

