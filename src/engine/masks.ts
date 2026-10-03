import { DEFAULT_ADJUST, mergeAdjust, pixelsNeutral, type Adjustments } from './adjust';

/*
 * Masks (P1.6, P1.7): local adjustments. A mask is a shape made of parts (brush strokes, linear and radial gradients,
 * colour and brightness ranges), combined in order with add, subtract or intersect, optionally inverted, with its own
 * colour settings that apply only where the mask is. Masks are data, never pixels: every part is drawn again from its
 * parameters when a picture is rendered, so a mask stays editable and exports match the preview.
 *
 * Masks belong to the photo, not the frame: points are shares of the photo's own width and height (before it is
 * rotated or mirrored), sizes are shares of its width. Moving, zooming, turning or mirroring the photo takes its masks
 * along. The mask is rasterised here, in plain code, so the Canvas 2D and GPU paths get the very same mask. Range parts
 * select by the photo's own colours, before any of its settings, so editing the photo doesn't move them.
 */

export type MaskCombine = 'add' | 'subtract' | 'intersect';
export const MASK_COMBINES: readonly MaskCombine[] = ['add', 'subtract', 'intersect'];

export interface BrushStroke {
  /** Points as [x0, y0, x1, y1, …], shares of the photo's width and height (0–1 inside the photo). */
  pts: number[];
  /** Brush diameter, as a share of the photo's width. */
  size: number;
  /** 0 = a hard edge, 100 = soft all the way from the centre. */
  feather: number;
  /** How much one pass adds (or takes away), 1–100; passes build up. */
  flow: number;
  /** Takes the mask away instead of adding to it. */
  erase: boolean;
}

interface PartBase {
  id: string;
  /** How this part joins the parts before it (the first part is always added). */
  combine: MaskCombine;
  invert: boolean;
}

export interface BrushPart extends PartBase {
  kind: 'brush';
  strokes: BrushStroke[];
}

/** Full on one side, fading to nothing across `width`, along the direction `angle` (degrees, 90 = downwards). */
export interface LinearPart extends PartBase {
  kind: 'linear';
  /** The middle of the fade, shares of the photo's width and height. */
  x: number;
  y: number;
  angle: number;
  /** Length of the fade, as a share of the photo's width. */
  width: number;
}

/** Full inside an ellipse, fading out towards its edge over the outer `feather` per cent. */
export interface RadialPart extends PartBase {
  kind: 'radial';
  x: number;
  y: number;
  /** Radii, both as shares of the photo's width (equal radii make a circle). */
  rx: number;
  ry: number;
  angle: number;
  feather: number;
}

/** The photo's colours near a picked one (0–255 sRGB); `range` 1–100 says how near. */
export interface ColourRangePart extends PartBase {
  kind: 'colour';
  r: number;
  g: number;
  b: number;
  range: number;
}

/** The photo's tones between `lo` and `hi` (0 black – 100 white), with soft edges of `smooth`. */
export interface LumaRangePart extends PartBase {
  kind: 'luma';
  lo: number;
  hi: number;
  smooth: number;
}

export type MaskPart = BrushPart | LinearPart | RadialPart | ColourRangePart | LumaRangePart;
export type PartKind = MaskPart['kind'];

export interface Mask {
  id: string;
  name: string;
  /** Off: kept, but not applied. */
  on: boolean;
  invert: boolean;
  parts: MaskPart[];
  /** The colour settings applied where the mask is, on top of the photo's own. */
  adjust: Adjustments;
}

/** Limits that keep a mask (and an undo history of them) small. */
export const MASK_LIMITS = { masks: 16, parts: 8, strokes: 400, points: 8000, name: 40 } as const;
export const BRUSH_RANGES = { size: [0.002, 0.6], feather: [0, 100], flow: [1, 100] } as const;

let seq = 0;
export const maskId = (prefix = 'm') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const newBrushPart = (combine: MaskCombine = 'add'): BrushPart => ({
  id: maskId('b'),
  kind: 'brush',
  combine,
  invert: false,
  strokes: [],
});

/**
 * A new part of a kind, with settings that show something straight away: a gradient full at the top fading towards
 * the middle (a sky), a circle in the middle, a mid grey (to be picked), the darker half of the tones. Ranges usually narrow a shape down,
 * so as a later part they intersect.
 */
export function newPart(kind: PartKind, first = true): MaskPart {
  const base = { id: maskId(kind[0]), invert: false };
  switch (kind) {
    case 'brush':
      return newBrushPart();
    case 'linear':
      return { ...base, kind, combine: 'add', x: 0.5, y: 0.4, angle: 90, width: 0.4 };
    case 'radial':
      return { ...base, kind, combine: 'add', x: 0.5, y: 0.5, rx: 0.3, ry: 0.3, angle: 0, feather: 50 };
    case 'colour':
      return { ...base, kind, combine: first ? 'add' : 'intersect', r: 128, g: 128, b: 128, range: 30 };
    case 'luma':
      return { ...base, kind, combine: first ? 'add' : 'intersect', lo: 0, hi: 50, smooth: 20 };
  }
}

export function newMask(name: string, kind: PartKind = 'brush'): Mask {
  return { id: maskId(), name, on: true, invert: false, parts: [newPart(kind)], adjust: { ...DEFAULT_ADJUST } };
}

/** True when the mask changes the picture: switched on, with parts, and settings that do something. */
export const maskActive = (m: Mask): boolean => m.on && m.parts.length > 0 && !pixelsNeutral(m.adjust);

/** True when a part selects by the photo's colours, so rasterising it needs the photo. */
export const usesPhoto = (p: MaskPart): boolean => p.kind === 'colour' || p.kind === 'luma';

/* ---------- validation ---------- */

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const clamp = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

function mergeStroke(raw: unknown): BrushStroke | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o || !Array.isArray(o.pts)) return null;
  const pts = o.pts.slice(0, MASK_LIMITS.points - (MASK_LIMITS.points % 2));
  if (pts.length < 2 || pts.length % 2 || !pts.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return {
    // A stroke may start a little outside the photo (painting its edge); far outside means nothing.
    pts: (pts as number[]).map((v) => Math.min(1.5, Math.max(-0.5, v))),
    size: clamp(o.size, ...BRUSH_RANGES.size, 0.05),
    feather: clamp(o.feather, ...BRUSH_RANGES.feather, 50),
    flow: clamp(o.flow, ...BRUSH_RANGES.flow, 100),
    erase: o.erase === true,
  };
}

/** Ranges of the gradient and range settings: one table for validation and the panel's sliders. */
export const PART_RANGES = {
  x: [-0.5, 1.5],
  y: [-0.5, 1.5],
  angle: [-180, 180],
  width: [0.01, 2],
  rx: [0.01, 2],
  ry: [0.01, 2],
  feather: [0, 100],
  range: [1, 100],
  lo: [0, 100],
  hi: [0, 100],
  smooth: [0, 100],
} as const;

function mergePart(raw: unknown): MaskPart | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const kind = o?.kind;
  if (!o || (kind !== 'brush' && kind !== 'linear' && kind !== 'radial' && kind !== 'colour' && kind !== 'luma'))
    return null;
  const d = newPart(kind) as unknown as Record<string, number>;
  const n = (k: keyof typeof PART_RANGES) => clamp(o[k], PART_RANGES[k][0], PART_RANGES[k][1], d[k]);
  const base = {
    id: typeof o.id === 'string' && ID.test(o.id) ? o.id : maskId(kind[0]),
    combine: MASK_COMBINES.includes(o.combine as MaskCombine) ? (o.combine as MaskCombine) : 'add',
    invert: o.invert === true,
  };
  switch (kind) {
    case 'brush':
      return {
        ...base,
        kind,
        strokes: (Array.isArray(o.strokes) ? o.strokes.slice(0, MASK_LIMITS.strokes) : [])
          .map(mergeStroke)
          .filter((s): s is BrushStroke => !!s),
      };
    case 'linear':
      return { ...base, kind, x: n('x'), y: n('y'), angle: n('angle'), width: n('width') };
    case 'radial':
      return {
        ...base,
        kind,
        x: n('x'),
        y: n('y'),
        rx: n('rx'),
        ry: n('ry'),
        angle: n('angle'),
        feather: n('feather'),
      };
    case 'colour': {
      const c = (k: string) => Math.round(clamp(o[k], 0, 255, 128));
      return { ...base, kind, r: c('r'), g: c('g'), b: c('b'), range: n('range') };
    }
    case 'luma': {
      const lo = n('lo'),
        hi = n('hi');
      return { ...base, kind, lo: Math.min(lo, hi), hi: Math.max(lo, hi), smooth: n('smooth') };
    }
  }
}

/** The single gate for masks from outside the running app (project files, agent tools): valid masks, or none. */
export function mergeMasks(raw: unknown): Mask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.slice(0, MASK_LIMITS.masks).flatMap((m): Mask[] => {
    const o = m && typeof m === 'object' ? (m as Record<string, unknown>) : null;
    if (!o) return [];
    let id = typeof o.id === 'string' && ID.test(o.id) ? o.id : maskId();
    if (seen.has(id)) id = maskId();
    seen.add(id);
    const name = typeof o.name === 'string' ? o.name.replace(/\s+/g, ' ').trim().slice(0, MASK_LIMITS.name) : '';
    return [
      {
        id,
        name: name || 'Mask',
        on: o.on !== false,
        invert: o.invert === true,
        parts: (Array.isArray(o.parts) ? o.parts.slice(0, MASK_LIMITS.parts) : [])
          .map(mergePart)
          .filter((p): p is MaskPart => !!p),
        adjust: mergeAdjust(o.adjust),
      },
    ];
  });
}

/* ---------- rasterising ---------- */

/**
 * Raster sizes, by the photo's longer side: a mask is drawn at the smallest that is at least two thirds of the size the
 * photo is shown at (thumbnails, the stage, an export), up to the largest. Masks are soft, so 1.5× enlargement doesn't
 * show. Few sizes mean few cached rasters.
 */
export const MASK_SIZES = [256, 512, 1024, 2048] as const;

export const rasterSize = (shown: number) =>
  MASK_SIZES.find((s) => s * 1.5 >= shown) ?? MASK_SIZES[MASK_SIZES.length - 1];

/** A pixel size rw × rh with the photo's proportions and `long` px on its longer side. */
export function rasterDims(sw: number, sh: number, long: number): [number, number] {
  const k = long / Math.max(sw, sh, 1);
  return [Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k))];
}

/** A pixel rectangle, inclusive; x0 > x1 when empty. */
type Box = [number, number, number, number];
const EMPTY: Box = [Infinity, Infinity, -Infinity, -Infinity];
const union = (a: Box, b: Box): Box => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

/**
 * A stroke's shape on one raster, built as it is drawn: the brush swept along its points. Points are thinned to at
 * most one per fifth of the radius (the shape is the same, the work far less); which points are kept depends only on
 * the points before, so a longer stroke keeps the same ones and only the new part is painted. The segment from the
 * last kept point to the newest point (the tail) is drawn separately, as it changes with every move.
 */
interface StrokeShape {
  stroke: BrushStroke;
  r: number;
  edge: number;
  gap: number;
  /** Kept points, raster pixels. */
  kept: number[];
  /** Raw numbers (x and y) of stroke.pts consumed so far. */
  used: number;
  /** Coverage of the kept segments, 0–1, rw × rh; nonzero only inside box. */
  cov: Float32Array;
  box: Box;
}

const strokeGeometry = (s: BrushStroke, rw: number) => {
  const r = Math.max(0.5, (s.size * rw) / 2);
  return { r, edge: Math.max(1, (r * s.feather) / 100), gap: Math.max(0.5, r * 0.2) };
};

/** Coverage of the segment a → b (a disk when they are the same point), as the largest of what is there, into cov. */
function sweep(
  cov: Float32Array,
  rw: number,
  rh: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: number,
  edge: number,
): Box {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)),
    x1 = Math.min(rw - 1, Math.ceil(Math.max(ax, bx) + r)),
    y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)),
    y1 = Math.min(rh - 1, Math.ceil(Math.max(ay, by) + r));
  if (x0 > x1 || y0 > y1) return EMPTY;
  const dx = bx - ax,
    dy = by - ay,
    len2 = dx * dx + dy * dy,
    r2 = r * r;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      // Distance from the pixel's centre to the segment.
      const px = x + 0.5 - ax,
        py = y + 0.5 - ay,
        t = len2 > 0 ? Math.min(1, Math.max(0, (px * dx + py * dy) / len2)) : 0,
        qx = px - t * dx,
        qy = py - t * dy,
        d2 = qx * qx + qy * qy;
      if (d2 >= r2) continue;
      let c = (r - Math.sqrt(d2)) / edge;
      c = c >= 1 ? 1 : c * c * (3 - 2 * c);
      const j = y * rw + x;
      if (c > cov[j]) cov[j] = c;
    }
  return [x0, y0, x1, y1];
}

function newShape(s: BrushStroke, rw: number, rh: number): StrokeShape {
  return { stroke: s, ...strokeGeometry(s, rw), kept: [], used: 0, cov: new Float32Array(rw * rh), box: EMPTY };
}

/** Takes in the stroke's points not yet used, painting a segment for each point kept. */
function extendShape(sh: StrokeShape, s: BrushStroke, rw: number, rh: number): void {
  sh.stroke = s;
  const K = sh.kept;
  for (let i = sh.used; i + 1 < s.pts.length; i += 2) {
    const x = s.pts[i] * rw,
      y = s.pts[i + 1] * rh,
      n = K.length;
    if (n && Math.hypot(x - K[n - 2], y - K[n - 1]) < sh.gap) continue;
    const ax = n ? K[n - 2] : x,
      ay = n ? K[n - 1] : y;
    K.push(x, y);
    sh.box = union(sh.box, sweep(sh.cov, rw, rh, ax, ay, x, y, sh.r, sh.edge));
  }
  sh.used = s.pts.length;
}

/** The tail: last kept point to the newest point, when that point wasn't kept. Null when there is none. */
function tail(sh: StrokeShape, rw: number, rh: number): { cov: Float32Array; box: Box } | null {
  const p = sh.stroke.pts,
    K = sh.kept,
    n = K.length,
    x = p[p.length - 2] * rw,
    y = p[p.length - 1] * rh;
  if (!n || (K[n - 2] === x && K[n - 1] === y)) return null;
  const cov = TAIL.get(rw * rh);
  cov.fill(0);
  return { cov, box: sweep(cov, rw, rh, K[n - 2], K[n - 1], x, y, sh.r, sh.edge) };
}
/** One reusable tail buffer per raster size (a tail is drawn and used straight away). */
const TAIL = {
  bufs: new Map<number, Float32Array>(),
  get(n: number): Float32Array {
    let b = this.bufs.get(n);
    if (!b) {
      if (this.bufs.size > 4) this.bufs.clear();
      b = new Float32Array(n);
      this.bufs.set(n, b);
    }
    return b;
  },
};

/**
 * One pass of the stroke onto the mask: m = base + c(1 − base) where it paints, base(1 − c) where it erases, with c its
 * coverage times its flow. Only the stroke's box is touched; m and base may be the same array.
 */
function applyShape(
  m: Float32Array,
  base: Float32Array,
  rw: number,
  sh: StrokeShape,
  t: { cov: Float32Array; box: Box } | null,
): void {
  const box = t ? union(sh.box, t.box) : sh.box,
    flow = sh.stroke.flow / 100,
    erase = sh.stroke.erase;
  for (let y = box[1]; y <= box[3]; y++)
    for (let x = box[0]; x <= box[2]; x++) {
      const i = y * rw + x,
        c = (t && t.cov[i] > sh.cov[i] ? t.cov[i] : sh.cov[i]) * flow;
      if (!c) continue;
      m[i] = erase ? base[i] * (1 - c) : base[i] + c * (1 - base[i]);
    }
}

/**
 * Paints one stroke into m (rw × rh coverage, 0–1): its shape is the brush swept along the points, with a feathered
 * edge; flow says how much of that shape one pass adds (m + c(1 − m)) or, erasing, takes away (m(1 − c)). One pass is
 * one pass: where a stroke crosses itself it doesn't build up.
 */
export function paintStroke(m: Float32Array, rw: number, rh: number, s: BrushStroke): void {
  const sh = newShape(s, rw, rh);
  extendShape(sh, s, rw, rh);
  applyShape(m, m, rw, sh, tail(sh, rw, rh));
}

/* ---------- gradients and ranges ---------- */

/** The photo at raster size, RGBA, for range parts; `token` tells samples apart in cache keys. */
export interface PhotoSample {
  data: Uint8ClampedArray;
  token: number;
}

const ss = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** sRGB 8-bit to linear, once. */
let LIN: Float32Array | null = null;
const lin = () => {
  if (!LIN) {
    LIN = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const c = i / 255;
      LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }
  }
  return LIN;
};

/** OKLab (L, a, b) of an 8-bit sRGB colour: a space where distance follows how different colours look. */
export function oklab(r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const t = lin(),
    R = t[r],
    G = t[g],
    B = t[b];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B),
    m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B),
    s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return out;
}

/** OKLab of every pixel of a photo sample, worked out once per sample. */
const labCache = new WeakMap<Uint8ClampedArray, Float32Array>();
function labOf(px: Uint8ClampedArray): Float32Array {
  let lab = labCache.get(px);
  if (!lab) {
    lab = new Float32Array((px.length / 4) * 3);
    const o = [0, 0, 0];
    for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
      oklab(px[i], px[i + 1], px[i + 2], o);
      lab[j] = o[0];
      lab[j + 1] = o[1];
      lab[j + 2] = o[2];
    }
    labCache.set(px, lab);
  }
  return lab;
}

/**
 * A gradient or range part at rw × rh, 0–1. Gradients are worked out at each pixel's centre; ranges need the photo at
 * the same size (without it, a range covers everything).
 */
export function rasterShape(
  part: Exclude<MaskPart, BrushPart>,
  rw: number,
  rh: number,
  photo?: PhotoSample,
): Float32Array {
  const m = new Float32Array(rw * rh);
  if (part.kind === 'linear') {
    const a = (part.angle * Math.PI) / 180,
      c = Math.cos(a),
      sn = Math.sin(a),
      w = Math.max(1, part.width * rw),
      cx = part.x * rw,
      cy = part.y * rh;
    // Along a row t changes by c / w per pixel: full where t ≤ 0, empty where t ≥ 1, worked out only in between.
    for (let y = 0; y < rh; y++) {
      const row = y * rw,
        t0 = ((0.5 - cx) * c + (y + 0.5 - cy) * sn) / w + 0.5,
        dt = c / w;
      let x0 = 0,
        x1 = rw;
      if (Math.abs(dt) > 1e-12) {
        // Pixels whose t lies strictly between 0 and 1, plus one either side for safety.
        const xa = -t0 / dt,
          xb = (1 - t0) / dt;
        x0 = Math.min(rw, Math.max(0, Math.floor(Math.min(xa, xb)) - 1));
        x1 = Math.min(rw, Math.max(x0, Math.ceil(Math.max(xa, xb)) + 1));
        // Before x0 and after x1 the row is all full or all empty; which, by the side of the band.
        const before = t0 + dt * (x0 - 1) <= 0 ? 1 : 0,
          after = t0 + dt * x1 <= 0 ? 1 : 0;
        if (before && x0 > 0) m.fill(1, row, row + x0);
        if (after) m.fill(1, row + x1, row + rw);
      }
      for (let x = x0; x < x1; x++) m[row + x] = 1 - ss(t0 + dt * x);
    }
  } else if (part.kind === 'radial') {
    const a = (part.angle * Math.PI) / 180,
      c = Math.cos(a),
      sn = Math.sin(a),
      Rx = Math.max(1, part.rx * rw),
      Ry = Math.max(1, part.ry * rw),
      cx = part.x * rw,
      cy = part.y * rh,
      // A feather of 0 still gets a pixel and a half of softening, so the edge isn't jagged.
      band = Math.min(1, Math.max(part.feather / 100, 1.5 / Math.min(Rx, Ry))),
      inner = 1 - band,
      inner2 = inner * inner;
    // Outside the ellipse's bounding box everything is 0 (as the array starts); inside its core, 1 without a root.
    const ex = Math.hypot(Rx * c, Ry * sn),
      ey = Math.hypot(Rx * sn, Ry * c),
      y0 = Math.max(0, Math.floor(cy - ey)),
      y1 = Math.min(rh - 1, Math.ceil(cy + ey)),
      bx0 = Math.max(0, Math.floor(cx - ex)),
      bx1 = Math.min(rw - 1, Math.ceil(cx + ex));
    for (let y = y0; y <= y1; y++)
      for (let x = bx0; x <= bx1; x++) {
        const dx = x + 0.5 - cx,
          dy = y + 0.5 - cy,
          lx = (dx * c + dy * sn) / Rx,
          ly = (dy * c - dx * sn) / Ry,
          d2 = lx * lx + ly * ly;
        if (d2 >= 1) continue;
        m[y * rw + x] = d2 <= inner2 ? 1 : 1 - ss((Math.sqrt(d2) - inner) / band);
      }
  } else if (!photo || photo.data.length !== rw * rh * 4) m.fill(1);
  else if (part.kind === 'luma') {
    const px = photo.data,
      lo = part.lo / 100,
      hi = part.hi / 100,
      s = Math.max(0.01, (part.smooth / 100) * 0.5);
    for (let i = 0; i < m.length; i++) {
      const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
      m[i] = ss((l - lo + s) / s) * (1 - ss((l - hi) / s));
    }
  } else {
    // Colour: near the picked colour in OKLab, lightness counting half as much as hue and saturation, so a colour in
    // light and in shade is still picked.
    const lab = labOf(photo.data),
      t = oklab(part.r, part.g, part.b),
      tol = 0.02 + (part.range / 100) * 0.25,
      half = tol / 2;
    for (let i = 0, j = 0; i < m.length; i++, j += 3) {
      const dl = (lab[j] - t[0]) * 0.5,
        da = lab[j + 1] - t[1],
        db = lab[j + 2] - t[2];
      m[i] = 1 - ss((Math.sqrt(dl * dl + da * da + db * db) - half) / half);
    }
  }
  return m;
}

interface PartRaster {
  strokes: BrushStroke[];
  /** After every stroke but the last (null when unknown). */
  upto: Float32Array | null;
  full: Float32Array;
  /** The last stroke's shape, kept so that the same stroke drawn further paints only its new part. */
  live: StrokeShape | null;
}
const partCache = new WeakMap<MaskPart, Map<string, PartRaster>>();
/** The most recent raster per part id and size: a part changed by one stroke starts from it. */
const lastById = new Map<string, PartRaster>();

/** True when b is the stroke a drawn further: the same brush, and a's points followed by more. */
function extends_(a: BrushStroke, b: BrushStroke): boolean {
  if (
    a.size !== b.size ||
    a.feather !== b.feather ||
    a.flow !== b.flow ||
    a.erase !== b.erase ||
    b.pts.length < a.pts.length
  )
    return false;
  for (let i = 0; i < a.pts.length; i++) if (a.pts[i] !== b.pts[i]) return false;
  return true;
}

/**
 * A brush part's coverage at rw × rh, before its own invert. Cached per part and size. A part that differs from the
 * last one drawn only by strokes added at the end, or by its last stroke drawn further (painting), paints only that.
 */
export function rasterPart(part: MaskPart, rw: number, rh: number, photo?: PhotoSample): Float32Array {
  const key = `${rw}x${rh}${usesPhoto(part) ? `:${photo?.token ?? 0}` : ''}`,
    id = `${part.id}:${key}`;
  const hit = partCache.get(part)?.get(key);
  if (hit) return hit.full;
  if (part.kind !== 'brush') {
    const full = rasterShape(part, rw, rh, photo),
      sizes = partCache.get(part) ?? new Map<string, PartRaster>();
    if (sizes.size > 3) sizes.clear();
    sizes.set(key, { strokes: [], upto: null, full, live: null });
    partCache.set(part, sizes);
    return full;
  }
  const s = part.strokes,
    prev = lastById.get(id),
    n = prev?.strokes.length ?? 0;
  let same = 0;
  if (prev) while (same < s.length && same < n && s[same] === prev.strokes[same]) same++;
  let r: PartRaster;
  if (
    prev &&
    n > 0 &&
    same === n - 1 &&
    s.length === n &&
    prev.upto &&
    prev.live &&
    extends_(prev.strokes[n - 1], s[n - 1])
  ) {
    // The stroke being drawn, drawn further: add its new points to its shape, then lay it on the raster before it.
    const sh = prev.live;
    prev.live = null;
    extendShape(sh, s[n - 1], rw, rh);
    const full = prev.upto.slice();
    applyShape(full, prev.upto, rw, sh, tail(sh, rw, rh));
    r = { strokes: s, upto: prev.upto, full, live: sh };
  } else {
    let start = 0,
      base: Float32Array | null = null;
    if (prev && n > 0 && same === n) {
      start = n;
      base = prev.full;
    } else if (prev && n > 1 && same === n - 1 && s.length >= n && prev.upto) {
      start = n - 1;
      base = prev.upto;
    }
    const full = base ? base.slice() : new Float32Array(rw * rh);
    let upto: Float32Array | null =
        start === s.length ? (base === prev?.full && start > 0 ? prev!.upto : s.length ? null : full) : null,
      live: StrokeShape | null = start === s.length && base === prev?.full ? (prev?.live ?? null) : null;
    for (let i = start; i < s.length; i++) {
      const sh = newShape(s[i], rw, rh);
      extendShape(sh, s[i], rw, rh);
      if (i === s.length - 1) {
        upto = full.slice();
        live = sh;
      }
      applyShape(full, full, rw, sh, tail(sh, rw, rh));
    }
    r = { strokes: s, upto, full, live };
    if (prev && r.live === prev.live) prev.live = null;
  }
  const sizes = partCache.get(part) ?? new Map<string, PartRaster>();
  sizes.set(key, r);
  partCache.set(part, sizes);
  lastById.delete(id);
  lastById.set(id, r);
  // Rasters of parts that no longer exist would otherwise stay; a few dozen is plenty for any batch.
  if (lastById.size > 48) lastById.delete(lastById.keys().next().value!);
  return r.full;
}

/** Combined masks, by their parts (not the mask: its settings changing doesn't change its shape). */
const maskCache = new WeakMap<MaskPart[], Map<string, Float32Array>>();

/** The whole mask at rw × rh, 0–1: its parts combined in order, then its own invert. Cached; don't change the result. */
export function rasterMask(
  mask: Pick<Mask, 'parts' | 'invert'>,
  rw: number,
  rh: number,
  photo?: PhotoSample,
): Float32Array {
  const key = `${mask.invert}:${rw}x${rh}${mask.parts.some(usesPhoto) ? `:${photo?.token ?? 0}` : ''}`;
  const hit = maskCache.get(mask.parts)?.get(key);
  if (hit) return hit;
  let out: Float32Array;
  const only = mask.parts.length === 1 ? mask.parts[0] : null;
  if (only && !only.invert && !mask.invert) out = rasterPart(only, rw, rh, photo);
  else {
    out = new Float32Array(rw * rh);
    mask.parts.forEach((p, k) => {
      const c = rasterPart(p, rw, rh, photo),
        inv = p.invert,
        mode = k === 0 ? 'add' : p.combine;
      for (let i = 0; i < out.length; i++) {
        const v = inv ? 1 - c[i] : c[i];
        out[i] = mode === 'add' ? Math.max(out[i], v) : mode === 'subtract' ? out[i] * (1 - v) : out[i] * v;
      }
    });
    if (mask.invert) for (let i = 0; i < out.length; i++) out[i] = 1 - out[i];
  }
  const sizes = maskCache.get(mask.parts) ?? new Map<string, Float32Array>();
  if (sizes.size > 3) sizes.clear();
  sizes.set(key, out);
  maskCache.set(mask.parts, sizes);
  return out;
}

/* ---------- on the frame ---------- */

/** Where the photo is drawn on the frame, as renderIg() draws it. */
export interface PhotoPlace {
  cx: number;
  cy: number;
  /** The photo's own width and height as drawn (before turning). */
  w: number;
  h: number;
  rot: number;
  flip: boolean;
}

/** A frame point (pixels) as a point on the photo (shares of its own width and height). */
export function frameToPhoto(p: PhotoPlace, x: number, y: number): [number, number] {
  const a = (-p.rot * Math.PI) / 180,
    dx = x - p.cx,
    dy = y - p.cy;
  let lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (p.flip) lx = -lx;
  return [lx / p.w + 0.5, ly / p.h + 0.5];
}

/** A point on the photo (shares of its own width and height) as frame pixels: frameToPhoto() the other way. */
export function photoToFrame(p: PhotoPlace, u: number, v: number): [number, number] {
  let lx = (u - 0.5) * p.w;
  const ly = (v - 0.5) * p.h;
  if (p.flip) lx = -lx;
  const a = (p.rot * Math.PI) / 180;
  return [p.cx + lx * Math.cos(a) - ly * Math.sin(a), p.cy + lx * Math.sin(a) + ly * Math.cos(a)];
}

/* ---------- gradient handles ---------- */

export type HandleId = 'move' | 'end' | 'rx' | 'ry';
export interface Handle {
  id: HandleId;
  /** Frame pixels. */
  x: number;
  y: number;
}

/** A step of `len` display pixels along `deg` degrees on the photo, in shares of its width and height. */
const step = (p: PhotoPlace, deg: number, len: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [(Math.cos(a) * len) / p.w, (Math.sin(a) * len) / p.h];
};

/** The handles of a gradient on the frame: its centre (move), and its end (linear) or its two radii (radial). */
export function partHandles(part: MaskPart, p: PhotoPlace): Handle[] {
  if (part.kind !== 'linear' && part.kind !== 'radial') return [];
  const at = (id: HandleId, du = 0, dv = 0): Handle => {
    const [x, y] = photoToFrame(p, part.x + du, part.y + dv);
    return { id, x, y };
  };
  if (part.kind === 'linear') return [at('move'), at('end', ...step(p, part.angle, (part.width * p.w) / 2))];
  return [
    at('move'),
    at('rx', ...step(p, part.angle, part.rx * p.w)),
    at('ry', ...step(p, part.angle + 90, part.ry * p.w)),
  ];
}

const lim = (k: keyof typeof PART_RANGES, v: number) => Math.min(PART_RANGES[k][1], Math.max(PART_RANGES[k][0], v));

/**
 * A gradient dragged on the frame: from `from` to `to` (both shares of the photo), by a handle, or 'draw' for a drag
 * that wasn't on a handle (a linear gradient from the press to the pointer, or a circle around the press). `orig` is
 * the part as it was when the drag began.
 */
export function dragPart<P extends LinearPart | RadialPart>(
  orig: P,
  handle: HandleId | 'draw',
  from: [number, number],
  to: [number, number],
  p: PhotoPlace,
): P {
  // Vectors in display pixels, where angles and lengths are true on the photo.
  const vec = (a: [number, number], b: [number, number]) => [(b[0] - a[0]) * p.w, (b[1] - a[1]) * p.h] as const;
  const deg = (v: readonly [number, number]) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
  const len = (v: readonly [number, number]) => Math.hypot(v[0], v[1]) / p.w;
  if (handle === 'move')
    return { ...orig, x: lim('x', orig.x + to[0] - from[0]), y: lim('y', orig.y + to[1] - from[1]) };
  const fromCentre = vec([orig.x, orig.y], to);
  if (orig.kind === 'linear') {
    if (handle === 'end') return { ...orig, angle: deg(fromCentre), width: lim('width', 2 * len(fromCentre)) };
    const v = vec(from, to);
    return {
      ...orig,
      x: lim('x', (from[0] + to[0]) / 2),
      y: lim('y', (from[1] + to[1]) / 2),
      angle: deg(v),
      width: lim('width', len(v)),
    };
  }
  if (handle === 'rx') return { ...orig, angle: deg(fromCentre), rx: lim('rx', len(fromCentre)) };
  if (handle === 'ry') return { ...orig, ry: lim('ry', len(fromCentre)) };
  const r = lim('rx', len(vec(from, to)));
  return { ...orig, x: lim('x', from[0]), y: lim('y', from[1]), rx: r, ry: r, angle: 0 };
}

export interface FrameMask {
  /** The mask on the frame, one byte per pixel (0–255), row by row; 0 outside the photo. */
  data: Uint8Array;
  width: number;
  height: number;
  /** Unique per contents: the GPU keeps the uploaded texture under it. */
  key: string;
}

let frameSeq = 0;
/** Per shape, the last few placements (the stage and the strip's thumbnails draw the same photo at different sizes). */
const frameCache = new WeakMap<MaskPart[], Map<string, FrameMask>>();

/**
 * The mask laid on a W × H frame exactly where the photo is drawn, turned and mirrored with it: each frame pixel's
 * centre is taken back to the photo and the raster read there (bilinear). Cached by the mask's shape and the placement,
 * so changing a mask's settings costs nothing here.
 */
export function frameMask(
  mask: Pick<Mask, 'parts' | 'invert'>,
  sw: number,
  sh: number,
  p: PhotoPlace,
  W: number,
  H: number,
  src?: CanvasImageSource,
): FrameMask {
  const long = rasterSize(Math.max(p.w, p.h)),
    [rw, rh] = rasterDims(sw, sh, long),
    fw = Math.max(1, Math.round(W)),
    fh = Math.max(1, Math.round(H)),
    photo = src && mask.parts.some(usesPhoto) ? photoSample(src, rw, rh) : undefined,
    key = `${mask.invert}:${fw}x${fh}:${p.cx},${p.cy},${p.w},${p.h},${p.rot},${p.flip}:${rw}x${rh}:${photo?.token ?? 0}`;
  const hit = frameCache.get(mask.parts)?.get(key);
  if (hit) return hit;
  const m = rasterMask(mask, rw, rh, photo),
    data = new Uint8Array(fw * fh);
  // Raster position X = u·rw − ½ for photo share u; u and v are linear in the frame pixel, so step them along rows.
  const [u0, v0] = frameToPhoto(p, 0.5, 0.5),
    [u1, v1] = frameToPhoto(p, 1.5, 0.5),
    [u2, v2] = frameToPhoto(p, 0.5, 1.5);
  const dXx = (u1 - u0) * rw,
    dYx = (v1 - v0) * rh,
    dXy = (u2 - u0) * rw,
    dYy = (v2 - v0) * rh;
  for (let y = 0; y < fh; y++) {
    let X = u0 * rw - 0.5 + y * dXy,
      Y = v0 * rh - 0.5 + y * dYy;
    for (let x = 0; x < fw; x++, X += dXx, Y += dYx) {
      // Outside the photo (its edge is half a raster pixel beyond the outer centres): nothing.
      if (X < -0.5 || Y < -0.5 || X > rw - 0.5 || Y > rh - 0.5) continue;
      const xa = X < 0 ? 0 : X > rw - 1 ? rw - 1 : X,
        ya = Y < 0 ? 0 : Y > rh - 1 ? rh - 1 : Y,
        i0 = xa | 0,
        j0 = ya | 0,
        i1 = i0 + 1 < rw ? i0 + 1 : i0,
        j1 = j0 + 1 < rh ? j0 + 1 : j0,
        fx = xa - i0,
        fy = ya - j0,
        top = m[j0 * rw + i0] + (m[j0 * rw + i1] - m[j0 * rw + i0]) * fx,
        bot = m[j1 * rw + i0] + (m[j1 * rw + i1] - m[j1 * rw + i0]) * fx;
      data[y * fw + x] = Math.round((top + (bot - top) * fy) * 255);
    }
  }
  const out = { data, width: fw, height: fh, key: `mask:${++frameSeq}` };
  const placed = frameCache.get(mask.parts) ?? new Map<string, FrameMask>();
  if (placed.size >= 3) placed.delete(placed.keys().next().value!);
  placed.set(key, out);
  frameCache.set(mask.parts, placed);
  return out;
}

/* ---------- the photo, for range parts (needs a DOM) ---------- */

let sampleSeq = 0;
const samples = new WeakMap<object, Map<string, PhotoSample>>();

/** The photo drawn at rw × rh (as it is, not turned or adjusted), cached per photo and size. */
export function photoSample(src: CanvasImageSource, rw: number, rh: number): PhotoSample | undefined {
  const key = `${rw}x${rh}`,
    hit = samples.get(src)?.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = rw;
  c.height = rh;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (!x) return undefined;
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = 'high';
  x.drawImage(src, 0, 0, rw, rh);
  const out = { data: x.getImageData(0, 0, rw, rh).data, token: ++sampleSeq };
  const sizes = samples.get(src) ?? new Map<string, PhotoSample>();
  if (sizes.size > 3) sizes.clear();
  sizes.set(key, out);
  samples.set(src, sizes);
  return out;
}
