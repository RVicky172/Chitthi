import { useEffect, useState } from 'react';
import { cardMM } from '../engine/design';
import { computeLayout } from '../engine/layout';
import type { Design } from '../types';

/*
 * How well a photo suits a photo slot: its shape against the slot's shape (how much a cover crop cuts away) and the
 * print resolution it reaches there. Shared by the photo library, the tray and the photo store.
 */

export type PhotoShape = 'wide' | 'tall' | 'square';
export const shapeOf = (w: number, h: number): PhotoShape => (w / h > 1.15 ? 'wide' : w / h < 0.87 ? 'tall' : 'square');
export const SHAPE_LABEL: Record<PhotoShape, string> = { wide: 'Wide', tall: 'Tall', square: 'Square' };

export interface SlotInfo {
  /** Width ÷ height of the slot. */
  aspect: number;
  /** Slot size in mm at the design's trim size. */
  wmm: number;
  hmm: number;
  shape: PhotoShape;
}

/** The photo slot `slot` of the current layout, measured at the real print size. */
export function slotInfo(d: Design, slot: number): SlotInfo | null {
  const { w, h } = cardMM(d),
    L = computeLayout(d.layout, { x: 0, y: 0, w, h, e: 0 }, d),
    s = L.slots[Math.min(slot, L.slots.length - 1)];
  if (!s) return null;
  return { aspect: s.w / s.h, wmm: s.w, hmm: s.h, shape: shapeOf(s.w, s.h) };
}

/** Share of the photo a cover crop cuts away in a slot of this aspect (0 = perfect fit). */
export const cropLoss = (w: number, h: number, aspect: number): number => {
  const r = w / h / aspect;
  return 1 - Math.min(r, 1 / r);
};
/** A photo fits when the automatic crop keeps at least 80% of it. */
export const fitsSlot = (w: number, h: number, aspect: number) => cropLoss(w, h, aspect) <= 0.2;

/** Print resolution of a photo covering the slot (before any manual crop). */
export const slotDpi = (w: number, h: number, s: SlotInfo) => Math.round(25.4 / Math.max(s.wmm / w, s.hmm / h));
export type Sharpness = 'sharp' | 'fine' | 'soft';
export const sharpness = (dpi: number): Sharpness => (dpi >= 250 ? 'sharp' : dpi >= 150 ? 'fine' : 'soft');

/* ---------- pixel sizes of stored photos, learned when their thumbnails load ---------- */

const dims = new Map<string, { w: number; h: number }>();
const EVT = 'chitthi:dims';
let pending = 0;

/** Remember a photo's pixel size (called from <img onLoad>). Listeners are told once per frame. */
export function rememberDims(url: string, w: number, h: number): void {
  if (!w || !h || dims.get(url)?.w === w) return;
  dims.set(url, { w, h });
  if (!pending) pending = requestAnimationFrame(() => {
    pending = 0;
    window.dispatchEvent(new Event(EVT));
  });
}
export const dimsOf = (url: string) => dims.get(url);

/** Re-renders when newly learned pixel sizes arrive. */
export function useDimsTick(): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    const on = () => setT((x) => x + 1);
    window.addEventListener(EVT, on);
    return () => window.removeEventListener(EVT, on);
  }, []);
  return t;
}
