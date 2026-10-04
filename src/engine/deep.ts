import { pixelsNeutral } from './adjust';
import { colourNodes } from './gpu/colour';
import { detailNodes } from './gpu/detail';
import { closeGpu, gpu, gpuPool, openGpu } from './gpu/device';
import { runNodes, type GraphNode, type NodeInput } from './gpu/graph';
import { maskNodes } from './gpu/mask';
import { drawBackground, photoPlace, renderIg, vignetteAt, type IgEdit } from './instagram';
import { drawLayers, type Layer } from './layers';
import { frameMask, frameToPhoto, maskActive } from './masks';
import { decodeSrgb, encodeSrgb, type RawImage } from './raw';

/*
 * The 16-bit render (P1.9) behind the photo editor's TIFF export. The picture is the one renderIg() draws, worked out
 * in floats: the photo placed on the frame from a linear source (a developed RAW's 16 bits, or an 8-bit photo
 * decoded), then the same colour, detail and mask programs as the preview on the GPU, with every rounding step left out
 * (half-float intermediates, about 11 bits in the highlights and more in the shadows), read back as floats. The
 * background and the vignette follow renderIg()'s own rules (drawBackground(), vignetteAt()). Layers (text, stickers,
 * images) are graphics: they are added as the difference they make to the 8-bit picture, so every blend mode works and
 * the photo under them keeps its precision. The frame is the post's size (1080 px wide), never the whole RAW.
 */

/** A photo in linear light, three floats per pixel, top row first. */
export interface DeepSource {
  w: number;
  h: number;
  rgb: Float32Array;
}

export const deepFromRaw = (img: RawImage): DeepSource => ({
  w: img.width,
  h: img.height,
  rgb: Float32Array.from(img.data, (v) => v / 65535),
});

/** An 8-bit sRGB photo (RGBA) decoded to linear light. */
export function deepFrom8(rgba: Uint8ClampedArray, w: number, h: number): DeepSource {
  const t = new Float32Array(256);
  for (let i = 0; i < 256; i++) t[i] = decodeSrgb(i / 255);
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = t[rgba[i]];
    rgb[j + 1] = t[rgba[i + 1]];
    rgb[j + 2] = t[rgba[i + 2]];
  }
  return { w, h, rgb };
}

/** Averages k × k blocks (in linear light): a photo far bigger than it is drawn is shrunk before it is sampled. */
function shrink(s: DeepSource, k: number): DeepSource {
  const w = Math.max(1, Math.floor(s.w / k)),
    h = Math.max(1, Math.floor(s.h / k)),
    rgb = new Float32Array(w * h * 3),
    n = k * k;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) sum += s.rgb[((y * k + j) * s.w + x * k + i) * 3 + c];
        rgb[(y * w + x) * 3 + c] = sum / n;
      }
  return { w, h, rgb };
}

/**
 * The photo placed on a W × H frame as renderIg() places it (fit, zoom, position, quarter turns, mirror): RGBA floats,
 * colour sRGB-encoded (what the colour programs take), alpha = how much of the pixel the photo covers.
 */
export function placeDeep(src: DeepSource, e: IgEdit, W: number, H: number): Float32Array {
  const place = photoPlace(src.w, src.h, e, W, H);
  // Shrunk by whole blocks until at most twice the size it is drawn at, then sampled bilinearly.
  const k = Math.floor(src.w / Math.max(1, place.w));
  const s = k >= 2 ? shrink(src, k) : src;
  const out = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [u, v] = frameToPhoto(place, x + 0.5, y + 0.5);
      // Coverage at the photo's edge, as antialiasing gives it: a pixel half over the edge is half covered.
      const cu = Math.min(1, Math.max(0, Math.min(u, 1 - u) * place.w + 0.5)),
        cv = Math.min(1, Math.max(0, Math.min(v, 1 - v) * place.h + 0.5)),
        a = cu * cv;
      if (a <= 0) continue;
      const X = Math.min(s.w - 1, Math.max(0, u * s.w - 0.5)),
        Y = Math.min(s.h - 1, Math.max(0, v * s.h - 0.5)),
        i0 = X | 0,
        j0 = Y | 0,
        i1 = Math.min(s.w - 1, i0 + 1),
        j1 = Math.min(s.h - 1, j0 + 1),
        fx = X - i0,
        fy = Y - j0,
        o = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p = (j: number, i: number) => s.rgb[(j * s.w + i) * 3 + c];
        const top = p(j0, i0) + (p(j0, i1) - p(j0, i0)) * fx,
          bot = p(j1, i0) + (p(j1, i1) - p(j1, i0)) * fx;
        out[o + c] = encodeSrgb(top + (bot - top) * fy);
      }
      out[o + 3] = a;
    }
  return out;
}

export interface DeepFrame {
  /** The photo in linear light (from the RAW, or decoded from the 8-bit file). */
  src: DeepSource;
  /** The photo as the editor shows it (the 8-bit preview): masks are laid on the frame from it, as on the stage. */
  sample: HTMLCanvasElement;
  e: IgEdit;
  W: number;
  H: number;
  /** The frame with only its background, 8-bit RGBA (white where nothing is drawn, as JPEG and TIFF have no alpha). */
  background: Uint8ClampedArray;
  /** The 8-bit picture without and with its layers, when it has any: their difference is added. */
  layers?: { without: Uint8ClampedArray; with: Uint8ClampedArray };
}

/**
 * A whole post in 16 bits, as the TIFF export writes it: img (w × h, the full-size photo as the 8-bit export draws it)
 * gives the background and the layers' difference; `deep` is the same photo in linear light (a developed RAW, or img
 * decoded when omitted). Uses a W × H 2D canvas of its own.
 */
export async function renderDeepPost(p: {
  img: CanvasImageSource;
  w: number;
  h: number;
  deep?: DeepSource;
  sample: HTMLCanvasElement;
  e: IgEdit;
  layers: readonly Layer[];
  W: number;
  H: number;
}): Promise<Uint16Array> {
  const { img, w, h, e, W, H } = p;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  const grab = () => ctx.getImageData(0, 0, W, H).data;
  const white = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  };
  try {
    white();
    drawBackground(ctx, img, w, h, e, W, H);
    const background = grab();
    let layers: DeepFrame['layers'];
    if (p.layers.length) {
      white();
      renderIg(ctx, img, w, h, e, W, H);
      const without = grab();
      drawLayers(ctx, [...p.layers], W, H);
      layers = { without, with: grab() };
    }
    let src = p.deep;
    if (!src) {
      cv.width = w;
      cv.height = h;
      ctx.drawImage(img, 0, 0);
      src = deepFrom8(ctx.getImageData(0, 0, w, h).data, w, h);
    }
    return await renderDeep({ src, sample: p.sample, e, W, H, background, layers });
  } finally {
    cv.width = cv.height = 1;
  }
}

/** True when this browser can make a 16-bit render: a GPU path whose targets hold floats. Opens no device. */
export function deepSupported(): boolean {
  if (typeof navigator !== 'undefined' && navigator.gpu) return true;
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  const ok = !!gl?.getExtension('EXT_color_buffer_float');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return ok;
}

/** The finished post as 16-bit sRGB-encoded RGB, three values per pixel, top row first. Throws without a GPU path. */
export async function renderDeep(f: DeepFrame): Promise<Uint16Array> {
  const { W, H, e } = f;
  let photo = placeDeep(f.src, e, W, H);
  const masks = (e.masks ?? []).filter(maskActive);
  if (!pixelsNeutral(e.adjust) || masks.length) {
    const opened = !gpu();
    const dev = gpu() ?? (await openGpu());
    if (!dev || !dev.floatTargets) throw new Error('A 16-bit TIFF needs graphics-card effects (Settings → Photo & video effects).');
    if (W > dev.maxSize || H > dev.maxSize) throw new Error('This frame is too big for the graphics card.');
    const pool = gpuPool(dev);
    const input = dev.uploadData(photo, W, H);
    try {
      const colour = colourNodes(e.adjust, true),
        nodes: GraphNode[] = [...colour, ...detailNodes(e.adjust, W, H, colour.length, true)];
      let pic: NodeInput = nodes.length ? nodes.length - 1 : 'source';
      const sw = f.sample.width,
        sh = f.sample.height,
        place = photoPlace(sw, sh, e, W, H);
      for (const m of masks) pic = maskNodes(nodes, pic, m.adjust, frameMask(m, sw, sh, place, W, H, f.sample), W, H, true);
      const out = runNodes(dev, pool, input, nodes);
      photo = await dev.readFloat(out);
      pool.give(out);
    } finally {
      dev.release(input);
      if (opened) closeGpu();
    }
  }
  const out = new Uint16Array(W * H * 3),
    bg = f.background,
    vig = e.adjust.vignette;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = y * W + x,
        a = Math.min(1, Math.max(0, photo[p * 4 + 3])),
        dark = 1 - vignetteAt(x + 0.5, y + 0.5, W, H, vig);
      for (let c = 0; c < 3; c++) {
        let v = (photo[p * 4 + c] * a + (bg[p * 4 + c] / 255) * (1 - a)) * dark;
        if (f.layers) v += (f.layers.with[p * 4 + c] - f.layers.without[p * 4 + c]) / 255;
        out[p * 3 + c] = Math.round(Math.min(1, Math.max(0, v)) * 65535);
      }
    }
  return out;
}
