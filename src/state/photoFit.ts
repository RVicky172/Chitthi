import { useEffect, useState } from 'react';
import { cardMM } from '../engine/design';
import { computeLayout } from '../engine/layout';
import type { Design } from '../types';

/*
 * How well a photo suits a photo slot: its shape against the slot's shape (how much a cover crop cuts away) and the
 * print resolution it reaches there. Shared by the photo library, the tray and the photo store.
 */

/** A photo's or slot's shape, by its width ÷ height. */
export type PhotoShape = 'wide' | 'tall' | 'square';

/**
 * The shape of a width and height: wide above 1.15, tall below 0.87, square between.
 * @param width the width (any unit)
 * @param height the height, in the same unit
 * @returns the shape
 */
export function shapeOf(width: number, height: number): PhotoShape {
  const aspect = width / height;
  if (aspect > 1.15) return 'wide';
  return aspect < 0.87 ? 'tall' : 'square';
}

/** Each shape's label. */
export const SHAPE_LABEL: Record<PhotoShape, string> = { wide: 'Wide', tall: 'Tall', square: 'Square' };

/** A photo slot of the current layout, measured at the real print size. */
export interface SlotInfo {
  /** Width ÷ height of the slot. */
  aspect: number;
  /** Slot width in mm at the design's trim size. */
  wmm: number;
  /** Slot height in mm at the design's trim size. */
  hmm: number;
  shape: PhotoShape;
}

/**
 * The photo slot `slot` of the current layout, measured at the real print size.
 * @param design the design
 * @param slot the slot (past the last = the last)
 * @returns the slot, or null when the layout has none
 */
export function slotInfo(design: Design, slot: number): SlotInfo | null {
  const { w: width, h: height } = cardMM(design),
    layout = computeLayout(design.layout, { x: 0, y: 0, w: width, h: height, e: 0 }, design),
    box = layout.slots.at(Math.min(slot, layout.slots.length - 1));
  if (!box) return null;
  return { aspect: box.w / box.h, wmm: box.w, hmm: box.h, shape: shapeOf(box.w, box.h) };
}

/**
 * Share of the photo a cover crop cuts away in a slot of this aspect (0 = perfect fit).
 * @param width the photo's width in pixels
 * @param height its height in pixels
 * @param aspect the slot's width ÷ height
 * @returns the share cut away (0–1)
 */
export const cropLoss = (width: number, height: number, aspect: number): number => {
  const ratio = width / height / aspect;
  return 1 - Math.min(ratio, 1 / ratio);
};

/**
 * A photo fits when the automatic crop keeps at least 80% of it.
 * @param width the photo's width in pixels
 * @param height its height in pixels
 * @param aspect the slot's width ÷ height
 * @returns true when it fits
 */
export const fitsSlot = (width: number, height: number, aspect: number) => cropLoss(width, height, aspect) <= 0.2;

/**
 * Print resolution of a photo covering the slot (before any manual crop).
 * @param width the photo's width in pixels
 * @param height its height in pixels
 * @param slot the slot
 * @returns dots per inch, rounded
 */
export const slotDpi = (width: number, height: number, slot: SlotInfo) => Math.round(25.4 / Math.max(slot.wmm / width, slot.hmm / height));

/** How sharp a print will look at its resolution. */
export type Sharpness = 'sharp' | 'fine' | 'soft';

/**
 * How sharp a print looks at a resolution: sharp from 250 dpi, fine from 150, soft below.
 * @param dpi the print resolution
 * @returns the grade
 */
export function sharpness(dpi: number): Sharpness {
  if (dpi >= 250) return 'sharp';
  return dpi >= 150 ? 'fine' : 'soft';
}

/* ---------- pixel sizes of stored photos, learned when their thumbnails load ---------- */

/** A photo's size in pixels. */
interface PixelSize {
  w: number;
  h: number;
}

const sizes = new Map<string, PixelSize>();
const SIZES_EVENT = 'chitthi:dims';
let pendingFrame = 0;

/**
 * Remember a photo's pixel size (called from <img onLoad>). Listeners are told once per frame.
 * @param url the photo's URL or fingerprint
 * @param width its width in pixels (0 = unknown, ignored)
 * @param height its height in pixels (0 = unknown, ignored)
 */
export function rememberDims(url: string, width: number, height: number): void {
  if (!width || !height || sizes.get(url)?.w === width) return;
  sizes.set(url, { w: width, h: height });
  if (!pendingFrame)
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      window.dispatchEvent(new Event(SIZES_EVENT));
    });
}

/**
 * A remembered pixel size.
 * @param url the photo's URL or fingerprint
 * @returns its size, or undefined when not learned yet
 */
export const dimsOf = (url: string): PixelSize | undefined => sizes.get(url);

/**
 * Re-renders when newly learned pixel sizes arrive.
 * @returns a number that changes with each arrival
 */
export function useDimsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onSizes = () => {
      setTick((previous) => previous + 1);
    };
    window.addEventListener(SIZES_EVENT, onSizes);
    return () => {
      window.removeEventListener(SIZES_EVENT, onSizes);
    };
  }, []);
  return tick;
}
