import { pixelsNeutral } from './adjust';
import { colourNodes } from './gpu/colour';
import { detailNodes } from './gpu/detail';
import { closeGpu, gpu, gpuPool, openGpu } from './gpu/device';
import { runNodes, type GraphNode, type NodeInput } from './gpu/graph';
import { maskNodes } from './gpu/mask';
import { drawBackground, photoPlace, renderIg, vignetteAt, type IgEdit } from './instagram';
import { drawLayers } from './layerDraw';
import { type Layer } from './layers';
import { frameMask, frameToPhoto } from './maskPlace';
import { maskActive, type Mask } from './masks';
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

/**
 * A developed RAW as a linear source.
 * @param image the developed RAW
 * @returns the source
 */
export const deepFromRaw = (image: RawImage): DeepSource => ({
  w: image.width,
  h: image.height,
  rgb: Float32Array.from(image.data, (value) => value / 65535),
});

/**
 * An 8-bit sRGB photo decoded to linear light.
 * @param rgba the photo, RGBA
 * @param width pixels
 * @param height pixels
 * @returns the source
 */
export function deepFrom8(rgba: Uint8ClampedArray, width: number, height: number): DeepSource {
  const table = new Float32Array(256);
  for (let value = 0; value < 256; value++) table[value] = decodeSrgb(value / 255);
  const rgb = new Float32Array(width * height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3) {
    rgb[target] = table[rgba[source] ?? 0] ?? 0;
    rgb[target + 1] = table[rgba[source + 1] ?? 0] ?? 0;
    rgb[target + 2] = table[rgba[source + 2] ?? 0] ?? 0;
  }
  return { w: width, h: height, rgb };
}

/**
 * Averages blocks in linear light: a photo far bigger than it is drawn is shrunk before it is sampled.
 * @param source the photo
 * @param block the block's side, pixels
 * @returns the smaller photo
 */
function shrink(source: DeepSource, block: number): DeepSource {
  const width = Math.max(1, Math.floor(source.w / block));
  const height = Math.max(1, Math.floor(source.h / block));
  const rgb = new Float32Array(width * height * 3);
  const count = block * block;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 3; channel++) {
        let sum = 0;
        for (let row = 0; row < block; row++) {
          for (let column = 0; column < block; column++) sum += source.rgb[((y * block + row) * source.w + x * block + column) * 3 + channel] ?? 0;
        }
        rgb[(y * width + x) * 3 + channel] = sum / count;
      }
    }
  }
  return { w: width, h: height, rgb };
}

/**
 * The photo's colour at a position (bilinear), sRGB-encoded, written into a frame pixel.
 * @param source the photo
 * @param shareX a share of its width
 * @param shareY a share of its height
 * @param out the frame
 * @param offset the frame pixel's first value
 */
function sampleInto(source: DeepSource, shareX: number, shareY: number, out: Float32Array, offset: number): void {
  const x = Math.min(source.w - 1, Math.max(0, shareX * source.w - 0.5));
  const y = Math.min(source.h - 1, Math.max(0, shareY * source.h - 0.5));
  const left = x | 0;
  const top = y | 0;
  const right = Math.min(source.w - 1, left + 1);
  const bottom = Math.min(source.h - 1, top + 1);
  const fractionX = x - left;
  const fractionY = y - top;
  for (let channel = 0; channel < 3; channel++) {
    const topLeft = valueAt(source, top, left, channel);
    const bottomLeft = valueAt(source, bottom, left, channel);
    const upper = topLeft + (valueAt(source, top, right, channel) - topLeft) * fractionX;
    const lower = bottomLeft + (valueAt(source, bottom, right, channel) - bottomLeft) * fractionX;
    out[offset + channel] = encodeSrgb(upper + (lower - upper) * fractionY);
  }
}

/**
 * One value of the photo.
 * @param source the photo
 * @param row the pixel's row
 * @param column its column
 * @param channel 0 red, 1 green, 2 blue
 * @returns linear light
 */
const valueAt = (source: DeepSource, row: number, column: number, channel: number): number => source.rgb[(row * source.w + column) * 3 + channel] ?? 0;

/**
 * The photo placed on a frame as renderIg() places it (fit, zoom, position, quarter turns, mirror).
 * @param source the photo, linear light
 * @param edit its framing
 * @param frameWidth the frame's width, pixels
 * @param frameHeight its height, pixels
 * @returns RGBA floats, colour sRGB-encoded (what the colour programs take), alpha = how much of the pixel the photo covers
 */
export function placeDeep(source: DeepSource, edit: IgEdit, frameWidth: number, frameHeight: number): Float32Array {
  const place = photoPlace(source.w, source.h, edit, frameWidth, frameHeight);
  // Shrunk by whole blocks until at most twice the size it is drawn at, then sampled bilinearly.
  const block = Math.floor(source.w / Math.max(1, place.w));
  const sampled = block >= 2 ? shrink(source, block) : source;
  const out = new Float32Array(frameWidth * frameHeight * 4);
  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      const [shareX, shareY] = frameToPhoto(place, x + 0.5, y + 0.5);
      // Coverage at the photo's edge, as antialiasing gives it: a pixel half over the edge is half covered.
      const coverU = Math.min(1, Math.max(0, Math.min(shareX, 1 - shareX) * place.w + 0.5));
      const coverV = Math.min(1, Math.max(0, Math.min(shareY, 1 - shareY) * place.h + 0.5));
      const alpha = coverU * coverV;
      if (alpha <= 0) continue;
      const offset = (y * frameWidth + x) * 4;
      sampleInto(sampled, shareX, shareY, out, offset);
      out[offset + 3] = alpha;
    }
  }
  return out;
}

/** A frame to render in 16 bits. */
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

/** A post to render in 16 bits. */
export interface DeepPost {
  /** The full-size photo as the 8-bit export draws it: it gives the background and the layers' difference. */
  img: CanvasImageSource;
  w: number;
  h: number;
  /** The same photo in linear light (a developed RAW); `img` decoded when omitted. */
  deep?: DeepSource;
  sample: HTMLCanvasElement;
  e: IgEdit;
  layers: readonly Layer[];
  W: number;
  H: number;
}

/**
 * The 8-bit parts of a post: its background, and the picture without and with its layers.
 * @param ctx a frame-size 2D context
 * @param post the post
 * @returns the background and the layers' pictures
 */
function eightBitParts(ctx: CanvasRenderingContext2D, post: DeepPost): Pick<DeepFrame, 'background' | 'layers'> {
  const { img, w, h, e, W, H } = post;
  const grab = () => ctx.getImageData(0, 0, W, H).data;
  const white = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
  };
  white();
  drawBackground(ctx, img, w, h, e, W, H);
  const background = grab();
  if (!post.layers.length) return { background };
  white();
  renderIg(ctx, img, w, h, e, W, H);
  const without = grab();
  drawLayers(ctx, [...post.layers], W, H);
  return { background, layers: { without, with: grab() } };
}

/**
 * A whole post in 16 bits, as the TIFF export writes it. Uses a W × H 2D canvas of its own.
 * @param post the post
 * @returns 16-bit sRGB-encoded RGB, three values per pixel, top row first
 * @throws {Error} without a canvas or a GPU path
 */
export async function renderDeepPost(post: DeepPost): Promise<Uint16Array> {
  const { img, w, h, e, W, H } = post;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  try {
    const { background, layers } = eightBitParts(ctx, post);
    let src = post.deep;
    if (!src) {
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0);
      src = deepFrom8(ctx.getImageData(0, 0, w, h).data, w, h);
    }
    return await renderDeep({ src, sample: post.sample, e, W, H, background, layers });
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

/**
 * Whether this browser can make a 16-bit render: a GPU path whose targets hold floats. Opens no device.
 * @returns true with WebGPU, or WebGL2 with float render targets
 */
export function deepSupported(): boolean {
  // Read without its type: browsers without WebGPU have no navigator.gpu, whatever the DOM types say.
  const webGpu: unknown = typeof navigator === 'undefined' ? undefined : Reflect.get(navigator, 'gpu');
  if (webGpu) return true;
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  const supported = !!gl?.getExtension('EXT_color_buffer_float');
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return supported;
}

/**
 * The colour, detail and mask programs over the placed photo on the GPU, in floats.
 * @param frame the frame
 * @param photo the placed photo (placeDeep)
 * @param masks the masks that change something
 * @returns the processed photo, RGBA floats
 * @throws {Error} without a GPU path whose targets hold floats, or for a frame too big for it
 */
async function gpuPass(frame: DeepFrame, photo: Float32Array, masks: Mask[]): Promise<Float32Array> {
  const { W, H, e } = frame;
  const opened = !gpu();
  const device = gpu() ?? (await openGpu());
  if (!device?.floatTargets) throw new Error('A 16-bit TIFF needs graphics-card effects (Settings → Photo & video effects).');
  if (W > device.maxSize || H > device.maxSize) throw new Error('This frame is too big for the graphics card.');
  const pool = gpuPool(device);
  const input = device.uploadData(photo, W, H);
  try {
    const colour = colourNodes(e.adjust, true);
    const nodes: GraphNode[] = [...colour, ...detailNodes(e.adjust, W, H, colour.length, true)];
    let picture: NodeInput = nodes.length ? nodes.length - 1 : 'source';
    const sampleWidth = frame.sample.width;
    const sampleHeight = frame.sample.height;
    const place = photoPlace(sampleWidth, sampleHeight, e, W, H);
    for (const mask of masks) {
      picture = maskNodes(nodes, picture, mask.adjust, frameMask(mask, sampleWidth, sampleHeight, place, W, H, frame.sample), W, H, true);
    }
    const out = runNodes(device, pool, input, nodes);
    const processed = await device.readFloat(out);
    pool.give(out);
    return processed;
  } finally {
    device.release(input);
    if (opened) closeGpu();
  }
}

/**
 * The photo over its background, vignetted, with the layers' difference added, as 16 bits.
 * @param frame the frame
 * @param photo the processed photo, RGBA floats
 * @returns 16-bit sRGB-encoded RGB
 */
function composite(frame: DeepFrame, photo: Float32Array): Uint16Array {
  const { W, H, background, layers } = frame;
  const out = new Uint16Array(W * H * 3);
  const vignette = frame.e.adjust.vignette;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const pixel = y * W + x;
      const alpha = Math.min(1, Math.max(0, photo[pixel * 4 + 3] ?? 0));
      const dark = 1 - vignetteAt(x + 0.5, y + 0.5, W, H, vignette);
      for (let channel = 0; channel < 3; channel++) {
        const at = pixel * 4 + channel;
        let value = ((photo[at] ?? 0) * alpha + ((background[at] ?? 0) / 255) * (1 - alpha)) * dark;
        if (layers) value += ((layers.with[at] ?? 0) - (layers.without[at] ?? 0)) / 255;
        out[pixel * 3 + channel] = Math.round(Math.min(1, Math.max(0, value)) * 65535);
      }
    }
  }
  return out;
}

/**
 * The finished post in 16 bits.
 * @param frame the frame
 * @returns 16-bit sRGB-encoded RGB, three values per pixel, top row first
 * @throws {Error} without a GPU path, when the photo has settings or masks
 */
export async function renderDeep(frame: DeepFrame): Promise<Uint16Array> {
  const { W, H, e } = frame;
  let photo = placeDeep(frame.src, e, W, H);
  const masks = e.masks.filter(maskActive);
  if (!pixelsNeutral(e.adjust) || masks.length) photo = await gpuPass(frame, photo, masks);
  return composite(frame, photo);
}
