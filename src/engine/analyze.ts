import type { Theme } from '../types';

/*
 * Photo analysis: reads a photo's properties from a small copy (≤ 96 px), fast enough to run on every photo in the
 * library. The results drive sorting, filtering, search words, "relevant for this slot" and automatic arrangement.
 */

export type Hue = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'neutral';

export interface PhotoTraits {
  /** Pixel size of the original. */
  w: number;
  h: number;
  /** Mean luminance 0–1. */
  brightness: number;
  /** Luminance spread 0–1. */
  contrast: number;
  /** Mean colourfulness 0–1. */
  saturation: number;
  /** −1 cool … +1 warm. */
  warmth: number;
  hue: Hue;
  /** Up to three dominant colours, most common first. */
  palette: string[];
  /** Fine detail 0–1 (edge energy): low means soft or blurry. */
  sharpness: number;
  /** Where the detail and colour concentrate, 0–1 across and down: the subject, roughly. */
  focus: { x: number; y: number };
  /** Plain words for search: bright, dark, colourful, muted, warm, cool, sharp, soft, the hue, sky, night… */
  tags: string[];
  /** Analysis version, to refresh stored results when the method changes. */
  v: number;
}

export const TRAITS_VERSION = 1;
const SIDE = 96;

const HUES: [Hue, number][] = [
  ['red', 15],
  ['orange', 45],
  ['yellow', 70],
  ['green', 160],
  ['teal', 195],
  ['blue', 255],
  ['purple', 290],
  ['pink', 340],
  ['red', 360],
];
function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255];
}
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Reads the traits of a decoded image. */
export function analyzeImage(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number }): PhotoTraits {
  const W0 = (img as HTMLImageElement).naturalWidth || img.width,
    H0 = (img as HTMLImageElement).naturalHeight || img.height,
    k = SIDE / Math.max(W0, H0),
    w = Math.max(8, Math.round(W0 * k)),
    h = Math.max(8, Math.round(H0 * k));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, w, h);
  const px = c.getImageData(0, 0, w, h).data,
    n = w * h,
    lum = new Float32Array(n);
  let sumL = 0,
    sumS = 0,
    sumWarm = 0;
  const hueBins = new Float32Array(9),
    colour = new Map<number, { n: number; r: number; g: number; b: number }>();
  let topBlue = 0,
    topN = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = px[p],
      g = px[p + 1],
      b = px[p + 2],
      l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum[i] = l;
    sumL += l;
    const [hh, s, v] = hsv(r, g, b),
      chroma = s * v;
    sumS += chroma;
    sumWarm += (r - b) / 255;
    if (chroma > 0.15) hueBins[HUES.findIndex(([, max]) => hh < max)] += chroma;
    // Coarse colour boxes (4 levels per channel) for the palette.
    const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6),
      box = colour.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    box.n++;
    box.r += r;
    box.g += g;
    box.b += b;
    colour.set(key, box);
    if (i < n * 0.3) {
      topN++;
      if (b > r && b > g * 0.95 && v > 0.45) topBlue++;
    }
  }
  const brightness = sumL / n;
  let varL = 0;
  for (let i = 0; i < n; i++) varL += (lum[i] - brightness) ** 2;
  const contrast = Math.min(1, Math.sqrt(varL / n) * 3.2),
    saturation = Math.min(1, (sumS / n) * 1.8),
    warmth = Math.max(-1, Math.min(1, (sumWarm / n) * 4));

  // Edge energy (Laplacian) for sharpness, and its weighted centre (with colour) as the focus point.
  let edge = 0,
    fx = 0,
    fy = 0,
    fw = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x,
        lap = Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w]);
      edge += lap;
      const p = i * 4,
        [, s, v] = hsv(px[p], px[p + 1], px[p + 2]),
        // Detail and colour both draw the eye; the middle of the frame gets a slight preference.
        wgt = (lap * 3 + s * v * 0.6) * (1.15 - Math.hypot(x / w - 0.5, y / h - 0.5));
      fx += x * wgt;
      fy += y * wgt;
      fw += wgt;
    }
  const sharpness = Math.min(1, (edge / ((w - 2) * (h - 2))) * 9),
    focus = fw ? { x: fx / fw / w, y: fy / fw / h } : { x: 0.5, y: 0.5 };

  let best = 0;
  for (let i = 1; i < 9; i++) if (hueBins[i] > hueBins[best]) best = i;
  const hue = hueBins[best] > n * 0.04 ? HUES[best][0] : 'neutral';
  const palette = [...colour.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 3)
    .map((b) => hex(b.r / b.n, b.g / b.n, b.b / b.n));

  const tags = [
    hue,
    brightness > 0.62 ? 'bright' : brightness < 0.32 ? 'dark' : 'midtone',
    saturation > 0.45 ? 'colourful' : saturation < 0.18 ? 'muted' : '',
    warmth > 0.18 ? 'warm' : warmth < -0.12 ? 'cool' : '',
    sharpness > 0.4 ? 'sharp' : sharpness < 0.15 ? 'soft' : '',
    contrast > 0.55 ? 'contrasty' : '',
    topN && topBlue / topN > 0.35 ? 'sky' : '',
    brightness < 0.25 && saturation < 0.35 ? 'night' : '',
    saturation < 0.06 ? 'black and white' : '',
    W0 / H0 > 1.15 ? 'wide' : W0 / H0 < 0.87 ? 'tall' : 'square',
  ].filter(Boolean);
  return { w: W0, h: H0, brightness, contrast, saturation, warmth, hue, palette, sharpness, focus, tags, v: TRAITS_VERSION };
}

/* ---------- scoring and arrangement ---------- */

/** Share of the photo a cover crop cuts away in a slot of this aspect. */
export const cropLoss = (w: number, h: number, aspect: number) => {
  const r = w / h / aspect;
  return 1 - Math.min(r, 1 / r);
};

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
/** 0–1: how close the photo's palette sits to the occasion's colours. */
export function harmony(t: PhotoTraits, theme: Theme): number {
  const tc = [theme.bg1, theme.bg2, theme.accent, ...theme.pal].filter((x) => /^#[0-9a-f]{6}$/i.test(x)).map(rgb);
  if (!tc.length || !t.palette.length) return 0.5;
  const best = t.palette.map(rgb).map((p) => Math.min(...tc.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]))));
  return Math.max(0, 1 - Math.min(...best) / 220);
}

export interface SlotShape {
  aspect: number;
  wmm: number;
  hmm: number;
}

/**
 * How relevant a photo is for a slot, 0–1: shape fit (the crop keeps most of it), print resolution at that size,
 * sharpness, and colour harmony with the occasion.
 */
export function relevance(t: PhotoTraits, slot: SlotShape | null, theme?: Theme): number {
  const fit = slot ? Math.max(0, 1 - cropLoss(t.w, t.h, slot.aspect) * 2.2) : 0.7;
  const dpi = slot ? 25.4 / Math.max(slot.wmm / t.w, slot.hmm / t.h) : 300;
  const res = Math.min(1, dpi / 300);
  return fit * 0.45 + res * 0.25 + t.sharpness * 0.12 + (theme ? harmony(t, theme) : 0.5) * 0.18;
}

/**
 * Crop position that keeps the focus point in view when a photo covers a slot: the px / py the renderer uses
 * (−1 … 1, 0 = centred).
 */
export function focusPosition(t: PhotoTraits, aspect: number): { px: number; py: number } {
  const pa = t.w / t.h;
  let px = 0,
    py = 0;
  if (pa > aspect) {
    const f = aspect / pa; // visible share of the width
    px = f < 1 ? ((t.focus.x - f / 2) / (1 - f)) * 2 - 1 : 0;
  } else {
    const f = pa / aspect;
    py = f < 1 ? ((t.focus.y - f / 2) / (1 - f)) * 2 - 1 : 0;
  }
  const clamp = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100;
  return { px: clamp(px), py: clamp(py) };
}

/**
 * Best assignment of photos to slots (maximum total fit): exact for up to 6 slots, greedy by best pair beyond that.
 * Returns, for each slot, the index of the photo to use.
 */
export function assign(photos: PhotoTraits[], slots: SlotShape[], theme?: Theme): number[] {
  const score = (p: number, s: number) => relevance(photos[p], slots[s], theme);
  const n = slots.length;
  if (!photos.length) return [];
  if (n <= 6 && photos.length <= 8) {
    let best: number[] = [],
      bestScore = -1;
    const used = new Array<boolean>(photos.length).fill(false),
      cur: number[] = [];
    const walk = (s: number, sum: number) => {
      if (s === n || cur.length === photos.length) {
        if (sum > bestScore) {
          bestScore = sum;
          best = [...cur];
        }
        return;
      }
      for (let p = 0; p < photos.length; p++) {
        if (used[p]) continue;
        used[p] = true;
        cur.push(p);
        walk(s + 1, sum + score(p, s));
        cur.pop();
        used[p] = false;
      }
    };
    walk(0, 0);
    return best;
  }
  const out = new Array<number>(n).fill(-1),
    taken = new Set<number>(),
    pairs: [number, number, number][] = [];
  for (let s = 0; s < n; s++) for (let p = 0; p < photos.length; p++) pairs.push([score(p, s), p, s]);
  pairs.sort((a, b) => b[0] - a[0]);
  for (const [, p, s] of pairs) if (out[s] < 0 && !taken.has(p)) (out[s] = p), taken.add(p);
  return out.filter((p) => p >= 0);
}
