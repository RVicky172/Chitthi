import { colourNeutral, DEFAULT_ADJUST, mergeAdjust, type Adjustments } from './adjust';
import { gpuColour } from './gpu/apply';
import { gpu } from './gpu/device';
import { lightNeutral, lookLightPixels } from './light';
import { lookPixels } from './photo';

/*
 * The Instagram studio's picture engine, free of UI code: where a photo sits in the frame, applying its colour settings
 * (engine/adjust.ts), and drawing one finished post at any scale. The preview and the exported files go through the same renderIg(), so what
 * the user sees is what they post.
 */

export type IgRotation = 0 | 90 | 180 | 270;

export interface IgEdit {
  /** fill: cover the frame (edges cropped); fit: the whole photo, with a background around it. */
  fit: 'fill' | 'fit';
  /** Background for "fit": a #rrggbb colour, or 'blur' for a blurred copy of the photo. */
  bg: string;
  /** 1 = the photo just fills (or fits) the frame; up to 4. */
  zoom: number;
  /** Position from -1 to 1: how far the photo is moved within the room it has (0 = centred). */
  px: number;
  py: number;
  rot: IgRotation;
  flip: boolean;
  /** Colour: look, sliders and vignette. */
  adjust: Adjustments;
}

export const DEFAULT_EDIT: IgEdit = {
  fit: 'fill',
  bg: '#ffffff',
  zoom: 1,
  px: 0,
  py: 0,
  rot: 0,
  flip: false,
  adjust: { ...DEFAULT_ADJUST },
};

/** The edits that "Apply to all" copies: the look of a photo, not where it is placed. */
export const LOOK_KEYS = ['fit', 'bg', 'adjust'] as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const ROTATIONS: readonly IgRotation[] = [0, 90, 180, 270];

/**
 * The single gate for photo and clip edits from outside the running app (presets, project files, agent tools): returns
 * a complete, valid IgEdit. Reads 2.x edits, whose colour settings sat directly in the edit (see mergeAdjust).
 */
export function mergeEdit(raw: unknown): IgEdit {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d);
  return {
    fit: o.fit === 'fit' ? 'fit' : 'fill',
    bg: o.bg === 'blur' || (typeof o.bg === 'string' && /^#[0-9a-f]{6}$/i.test(o.bg)) ? (o.bg as string) : DEFAULT_EDIT.bg,
    zoom: n(o.zoom, 1, 4, 1),
    px: n(o.px, -1, 1, 0),
    py: n(o.py, -1, 1, 0),
    rot: ROTATIONS.includes(o.rot as IgRotation) ? (o.rot as IgRotation) : 0,
    flip: o.flip === true,
    adjust: mergeAdjust(o.adjust ?? o),
  };
}

/**
 * Where the photo is drawn in a W×H frame: its centre and its size once rotated. sw × sh is the photo's own size.
 */
export function placement(sw: number, sh: number, e: Pick<IgEdit, 'fit' | 'zoom' | 'px' | 'py' | 'rot'>, W: number, H: number) {
  const turned = e.rot % 180 !== 0,
    ew = turned ? sh : sw,
    eh = turned ? sw : sh;
  const base = e.fit === 'fill' ? Math.max(W / ew, H / eh) : Math.min(W / ew, H / eh);
  const k = base * clamp(e.zoom, 1, 4),
    dw = ew * k,
    dh = eh * k;
  return {
    cx: W / 2 + clamp(e.px, -1, 1) * (Math.abs(dw - W) / 2),
    cy: H / 2 + clamp(e.py, -1, 1) * (Math.abs(dh - H) / 2),
    dw,
    dh,
  };
}

/** True when the photo leaves part of the frame empty, so the background shows. */
export function showsBackground(sw: number, sh: number, e: IgEdit, W: number, H: number): boolean {
  const p = placement(sw, sh, e, W, H);
  return p.cx - p.dw / 2 > 0.5 || p.cy - p.dh / 2 > 0.5 || p.cx + p.dw / 2 < W - 0.5 || p.cy + p.dh / 2 < H - 0.5;
}

/**
 * The look, then light and white balance (engine/light.ts), then brightness, contrast, saturation and warmth, on raw
 * RGBA pixels, rounding to 8 bits after the look (or after look and light together) and at the end. Transparent pixels are skipped. The GPU path (gpu/colour.ts) mirrors it.
 */
export function adjustPixels(a: Uint8ClampedArray, e: Adjustments): void {
  if (lightNeutral(e)) lookPixels(a, e.look);
  else lookLightPixels(a, e);
  if (!e.brightness && !e.contrast && !e.saturation && !e.warmth) return;
  const br = (clamp(e.brightness, -100, 100) / 100) * 64,
    ct = 1 + clamp(e.contrast, -100, 100) / 125,
    sa = 1 + clamp(e.saturation, -100, 100) / 100,
    wa = (clamp(e.warmth, -100, 100) / 100) * 24;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0) continue;
    let r = a[i] + br,
      g = a[i + 1] + br,
      b = a[i + 2] + br;
    r = (r - 128) * ct + 128;
    g = (g - 128) * ct + 128;
    b = (b - 128) * ct + 128;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l + (r - l) * sa + wa;
    g = l + (g - l) * sa + wa * 0.15;
    b = l + (b - l) * sa - wa;
    a[i] = r;
    a[i + 1] = g;
    a[i + 2] = b;
  }
}

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
};

/**
 * Draws a finished post into ctx (W×H): background, the photo placed, rotated and mirrored, its colour adjusted, and
 * the vignette. src is the photo (sw × sh); a smaller copy works for previews.
 */
export function renderIg(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, e: IgEdit, W: number, H: number): void {
  const p = placement(sw, sh, e, W, H);
  const turned = e.rot % 180 !== 0;
  const drawPhoto = (x: CanvasRenderingContext2D, cx: number, cy: number, dw: number, dh: number) => {
    x.save();
    x.translate(cx, cy);
    x.rotate((e.rot * Math.PI) / 180);
    if (e.flip) x.scale(-1, 1);
    const w = turned ? dh : dw,
      h = turned ? dw : dh;
    x.drawImage(src, -w / 2, -h / 2, w, h);
    x.restore();
  };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Background: only when the photo leaves part of the frame empty.
  if (showsBackground(sw, sh, e, W, H)) {
    if (e.bg === 'blur') {
      // A blurred copy: the photo covering the frame at 1/32 size, scaled back up (works in every browser).
      const small = canvas(Math.max(8, W / 32), Math.max(8, H / 32)),
        sx = small.getContext('2d');
      if (sx) {
        const cover = placement(sw, sh, { ...e, fit: 'fill', zoom: 1, px: 0, py: 0 }, small.width, small.height);
        sx.imageSmoothingQuality = 'high';
        sx.save();
        drawPhoto(sx, cover.cx, cover.cy, cover.dw, cover.dh);
        sx.restore();
        ctx.drawImage(small, 0, 0, W, H);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, 0, W, H);
      }
    } else {
      ctx.fillStyle = /^#[0-9a-f]{6}$/i.test(e.bg) ? e.bg : '#ffffff';
      ctx.fillRect(0, 0, W, H);
    }
  }

  // The photo, on its own layer so the colour adjustments leave the background alone. The colour runs on the GPU when
  // the media studio has opened a device (gpu/apply.ts), else on the CPU here; both give the same pixels.
  if (colourNeutral(e.adjust)) drawPhoto(ctx, p.cx, p.cy, p.dw, p.dh);
  else {
    // The same canvas mode on both paths: an accelerated canvas draws the photo's fractional edges differently from a
    // read-back one, which would make the two paths disagree along the edge of the photo.
    const onGpu = !!gpu(),
      layer = canvas(W, H),
      lx = layer.getContext('2d', { willReadFrequently: true });
    if (lx) {
      lx.imageSmoothingQuality = 'high';
      drawPhoto(lx, p.cx, p.cy, p.dw, p.dh);
      if (!onGpu || !gpuColour(ctx, layer, e.adjust, W, H)) {
        const d = lx.getImageData(0, 0, layer.width, layer.height);
        adjustPixels(d.data, e.adjust);
        lx.putImageData(d, 0, 0);
        ctx.drawImage(layer, 0, 0, W, H);
      }
    }
  }

  const vignette = e.adjust.vignette;
  if (vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(clamp(vignette, 0, 100) / 100) * 0.6})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
