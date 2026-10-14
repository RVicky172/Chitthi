import type { Theme } from '../types';

/*
 * Photo analysis: reads a photo's properties from a small copy (≤ 96 px), fast enough to run on every photo in the
 * library. The results drive sorting, filtering, search words, "relevant for this slot" and automatic arrangement.
 */

/** A photo's main hue. */
export type Hue = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'neutral';

/** What analysis finds in a photo. */
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

/** The analysis's version. */
export const TRAITS_VERSION = 1;

/** The small copy's longer side, pixels. */
const SIDE = 96;

/** Each hue with the hue angle (degrees) it reaches up to. */
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

/**
 * A colour as hue, saturation and value.
 * @param red 0–255
 * @param green 0–255
 * @param blue 0–255
 * @returns [hue (degrees), saturation (0–1), value (0–1)]
 */
function hsv(red: number, green: number, blue: number): [number, number, number] {
  const highest = Math.max(red, green, blue);
  const lowest = Math.min(red, green, blue);
  const range = highest - lowest;
  let hue = 0;
  if (range) {
    if (highest === red) hue = ((green - blue) / range) % 6;
    else if (highest === green) hue = (blue - red) / range + 2;
    else hue = (red - green) / range + 4;
  }
  return [(hue * 60 + 360) % 360, highest ? range / highest : 0, highest / 255];
}

/**
 * A colour as hex.
 * @param red 0–255
 * @param green 0–255
 * @param blue 0–255
 * @returns "#rrggbb"
 */
const hex = (red: number, green: number, blue: number): string =>
  '#' + [red, green, blue].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('');

/** A decodable picture with its size. */
type Picture = CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width: number; height: number };

/** The small copy's pixels. */
interface Sample {
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Draws a picture small.
 * @param picture the picture
 * @param width the copy's width, pixels
 * @param height its height, pixels
 * @returns its pixels
 * @throws {Error} when no 2D context can be made
 */
function sampleOf(picture: Picture, width: number, height: number): Sample {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.drawImage(picture, 0, 0, width, height);
  return { pixels: ctx.getImageData(0, 0, width, height).data, width, height };
}

/** A box of similar colours: how many pixels, and their summed channels. */
interface ColourBox {
  count: number;
  red: number;
  green: number;
  blue: number;
}

/** The colour statistics of a sample. */
interface ColourStats {
  /** Each pixel's luminance, 0–1. */
  luma: Float32Array;
  brightness: number;
  saturation: number;
  warmth: number;
  /** Colourfulness summed per hue (HUES' order). */
  hueBins: Float32Array;
  /** Coarse colour boxes (4 levels per channel) for the palette. */
  boxes: Map<number, ColourBox>;
  /** Of the top 30 % of pixels, how many are sky blue. */
  skyShare: number;
}

/**
 * Adds a pixel to its coarse colour box.
 * @param boxes the boxes
 * @param red 0–255
 * @param green 0–255
 * @param blue 0–255
 */
function addToBox(boxes: Map<number, ColourBox>, red: number, green: number, blue: number): void {
  const key = ((red >> 6) << 4) | ((green >> 6) << 2) | (blue >> 6);
  const box = boxes.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
  box.count++;
  box.red += red;
  box.green += green;
  box.blue += blue;
  boxes.set(key, box);
}

/**
 * Brightness, colourfulness, warmth, hues, colour boxes and the sky in a sample.
 * @param sample the small copy
 * @returns the statistics
 */
function colourStats(sample: Sample): ColourStats {
  const { pixels } = sample;
  const count = sample.width * sample.height;
  const luma = new Float32Array(count);
  const hueBins = new Float32Array(9);
  const boxes = new Map<number, ColourBox>();
  let lumaSum = 0;
  let saturationSum = 0;
  let warmthSum = 0;
  let topCount = 0;
  let topBlue = 0;
  for (let index = 0, offset = 0; index < count; index++, offset += 4) {
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const lightness = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    luma[index] = lightness;
    lumaSum += lightness;
    const [hue, saturation, value] = hsv(red, green, blue);
    const chroma = saturation * value;
    saturationSum += chroma;
    warmthSum += (red - blue) / 255;
    const bin = HUES.findIndex(([, upTo]) => hue < upTo);
    if (chroma > 0.15 && bin >= 0) hueBins[bin] = (hueBins[bin] ?? 0) + chroma;
    addToBox(boxes, red, green, blue);
    if (index < count * 0.3) {
      topCount++;
      if (blue > red && blue > green * 0.95 && value > 0.45) topBlue++;
    }
  }
  return {
    luma,
    brightness: lumaSum / count,
    saturation: Math.min(1, (saturationSum / count) * 1.8),
    warmth: Math.max(-1, Math.min(1, (warmthSum / count) * 4)),
    hueBins,
    boxes,
    skyShare: topCount ? topBlue / topCount : 0,
  };
}

/**
 * Edge energy (Laplacian) for sharpness, and its weighted centre (with colour) as the focus point: detail and colour
 * both draw the eye; the middle of the frame gets a slight preference.
 * @param sample the small copy
 * @param luma each pixel's luminance
 * @returns the sharpness (0–1) and the focus point
 */
function edgesAndFocus(sample: Sample, luma: Float32Array): { sharpness: number; focus: { x: number; y: number } } {
  const { pixels, width, height } = sample;
  const at = (index: number) => luma[index] ?? 0;
  let edge = 0;
  let sumX = 0;
  let sumY = 0;
  let weights = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian = Math.abs(4 * at(index) - at(index - 1) - at(index + 1) - at(index - width) - at(index + width));
      edge += laplacian;
      const offset = index * 4;
      const [, saturation, value] = hsv(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
      const weight = (laplacian * 3 + saturation * value * 0.6) * (1.15 - Math.hypot(x / width - 0.5, y / height - 0.5));
      sumX += x * weight;
      sumY += y * weight;
      weights += weight;
    }
  }
  return {
    sharpness: Math.min(1, (edge / ((width - 2) * (height - 2))) * 9),
    focus: weights ? { x: sumX / weights / width, y: sumY / weights / height } : { x: 0.5, y: 0.5 },
  };
}

/**
 * The main hue: the most colourful bin, when it holds enough.
 * @param hueBins colourfulness per hue
 * @param count the sample's pixels
 * @returns the hue, or neutral
 */
function mainHue(hueBins: Float32Array, count: number): Hue {
  let best = 0;
  for (let index = 1; index < 9; index++) if ((hueBins[index] ?? 0) > (hueBins[best] ?? 0)) best = index;
  const entry = HUES.at(best);
  return entry && (hueBins[best] ?? 0) > count * 0.04 ? entry[0] : 'neutral';
}

/**
 * One word of three for a value: above a high mark, below a low mark, or between.
 * @param value the value
 * @param high the high mark
 * @param above the word above it
 * @param low the low mark
 * @param below the word below it
 * @param between the word between
 * @returns the word
 */
function band(value: number, high: number, above: string, low: number, below: string, between = ''): string {
  if (value > high) return above;
  return value < low ? below : between;
}

/**
 * The search words for traits.
 * @param traits the traits (all but the tags)
 * @param skyShare how much of the top is sky blue
 * @returns the words
 */
function tagsOf(traits: Omit<PhotoTraits, 'tags' | 'v' | 'palette' | 'focus'>, skyShare: number): string[] {
  const { brightness, saturation, warmth, sharpness, contrast } = traits;
  return [
    traits.hue,
    band(brightness, 0.62, 'bright', 0.32, 'dark', 'midtone'),
    band(saturation, 0.45, 'colourful', 0.18, 'muted'),
    band(warmth, 0.18, 'warm', -0.12, 'cool'),
    band(sharpness, 0.4, 'sharp', 0.15, 'soft'),
    contrast > 0.55 ? 'contrasty' : '',
    skyShare > 0.35 ? 'sky' : '',
    brightness < 0.25 && saturation < 0.35 ? 'night' : '',
    saturation < 0.06 ? 'black and white' : '',
    band(traits.w / traits.h, 1.15, 'wide', 0.87, 'tall', 'square'),
  ].filter(Boolean);
}

/**
 * A size, or a fallback when it is missing or not above 0.
 * @param value the size
 * @param fallback the other size
 * @returns the size to use
 */
const positiveOr = (value: number | undefined, fallback: number): number => (value !== undefined && value > 0 ? value : fallback);

/**
 * Reads the traits of a decoded image.
 * @param picture the image
 * @returns its traits
 */
export function analyzeImage(picture: Picture): PhotoTraits {
  // An image not decoded yet reports a natural size of 0: use its element size then.
  const width = positiveOr(picture.naturalWidth, picture.width);
  const height = positiveOr(picture.naturalHeight, picture.height);
  const scale = SIDE / Math.max(width, height);
  const sample = sampleOf(picture, Math.max(8, Math.round(width * scale)), Math.max(8, Math.round(height * scale)));
  const count = sample.width * sample.height;
  const stats = colourStats(sample);
  let spread = 0;
  for (const value of stats.luma) spread += (value - stats.brightness) ** 2;
  const contrast = Math.min(1, Math.sqrt(spread / count) * 3.2);
  const { sharpness, focus } = edgesAndFocus(sample, stats.luma);
  const hue = mainHue(stats.hueBins, count);
  const palette = [...stats.boxes.values()]
    .sort((first, second) => second.count - first.count)
    .slice(0, 3)
    .map((box) => hex(box.red / box.count, box.green / box.count, box.blue / box.count));
  const { brightness, saturation, warmth } = stats;
  const tags = tagsOf({ w: width, h: height, brightness, contrast, saturation, warmth, hue, sharpness }, stats.skyShare);
  return { w: width, h: height, brightness, contrast, saturation, warmth, hue, palette, sharpness, focus, tags, v: TRAITS_VERSION };
}

/* ---------- scoring and arrangement ---------- */

/**
 * The share of a photo a cover crop cuts away in a slot.
 * @param width the photo's width
 * @param height its height
 * @param aspect the slot's width over its height
 * @returns 0–1
 */
export const cropLoss = (width: number, height: number, aspect: number): number => {
  const ratio = width / height / aspect;
  return 1 - Math.min(ratio, 1 / ratio);
};

/**
 * A hex colour's channels.
 * @param colour "#rrggbb"
 * @returns [red, green, blue], 0–255
 */
const rgb = (colour: string): [number, number, number] => [parseInt(colour.slice(1, 3), 16), parseInt(colour.slice(3, 5), 16), parseInt(colour.slice(5, 7), 16)];

/**
 * How close a photo's palette sits to the occasion's colours.
 * @param traits the photo's traits
 * @param theme the occasion's theme
 * @returns 0–1
 */
export function harmony(traits: PhotoTraits, theme: Theme): number {
  const themeColours = [theme.bg1, theme.bg2, theme.accent, ...theme.pal].filter((colour) => /^#[0-9a-f]{6}$/i.test(colour)).map(rgb);
  if (!themeColours.length || !traits.palette.length) return 0.5;
  const nearest = traits.palette.map(rgb).map((colour) => Math.min(...themeColours.map((other) => Math.hypot(colour[0] - other[0], colour[1] - other[1], colour[2] - other[2]))));
  return Math.max(0, 1 - Math.min(...nearest) / 220);
}

/** A slot's shape and print size. */
export interface SlotShape {
  aspect: number;
  wmm: number;
  hmm: number;
}

/**
 * How relevant a photo is for a slot: shape fit (the crop keeps most of it), print resolution at that size,
 * sharpness, and colour harmony with the occasion.
 * @param traits the photo's traits
 * @param slot the slot, or null for any
 * @param theme the occasion's theme
 * @returns 0–1
 */
export function relevance(traits: PhotoTraits, slot: SlotShape | null, theme?: Theme): number {
  const fit = slot ? Math.max(0, 1 - cropLoss(traits.w, traits.h, slot.aspect) * 2.2) : 0.7;
  const dpi = slot ? 25.4 / Math.max(slot.wmm / traits.w, slot.hmm / traits.h) : 300;
  const resolution = Math.min(1, dpi / 300);
  return fit * 0.45 + resolution * 0.25 + traits.sharpness * 0.12 + (theme ? harmony(traits, theme) : 0.5) * 0.18;
}

/**
 * The crop position that keeps the focus point in view when a photo covers a slot.
 * @param traits the photo's traits
 * @param aspect the slot's width over its height
 * @returns the px / py the renderer uses (−1 … 1, 0 = centred)
 */
export function focusPosition(traits: PhotoTraits, aspect: number): { px: number; py: number } {
  const photoAspect = traits.w / traits.h;
  let px = 0;
  let py = 0;
  if (photoAspect > aspect) {
    const visible = aspect / photoAspect; // visible share of the width
    px = visible < 1 ? ((traits.focus.x - visible / 2) / (1 - visible)) * 2 - 1 : 0;
  } else {
    const visible = photoAspect / aspect;
    py = visible < 1 ? ((traits.focus.y - visible / 2) / (1 - visible)) * 2 - 1 : 0;
  }
  const clamp = (value: number) => Math.round(Math.max(-1, Math.min(1, value)) * 100) / 100;
  return { px: clamp(px), py: clamp(py) };
}

/**
 * The exact best assignment: every ordering of photos into slots tried.
 * @param photoCount how many photos
 * @param slotCount how many slots
 * @param score a photo's score in a slot
 * @returns each slot's photo
 */
function bestAssignment(photoCount: number, slotCount: number, score: (photo: number, slot: number) => number): number[] {
  let best: number[] = [];
  let bestScore = -1;
  const used = new Array<boolean>(photoCount).fill(false);
  const current: number[] = [];
  const walk = (slot: number, sum: number) => {
    if (slot === slotCount || current.length === photoCount) {
      if (sum > bestScore) {
        bestScore = sum;
        best = [...current];
      }
      return;
    }
    for (let photo = 0; photo < photoCount; photo++) {
      if (used[photo]) continue;
      used[photo] = true;
      current.push(photo);
      walk(slot + 1, sum + score(photo, slot));
      current.pop();
      used[photo] = false;
    }
  };
  walk(0, 0);
  return best;
}

/**
 * A greedy assignment: the best photo–slot pairs first.
 * @param photoCount how many photos
 * @param slotCount how many slots
 * @param score a photo's score in a slot
 * @returns the slots' photos, in slot order, without the slots left empty
 */
function greedyAssignment(photoCount: number, slotCount: number, score: (photo: number, slot: number) => number): number[] {
  const chosen = new Array<number>(slotCount).fill(-1);
  const taken = new Set<number>();
  const pairs: [number, number, number][] = [];
  for (let slot = 0; slot < slotCount; slot++) for (let photo = 0; photo < photoCount; photo++) pairs.push([score(photo, slot), photo, slot]);
  pairs.sort((first, second) => second[0] - first[0]);
  for (const [, photo, slot] of pairs) {
    if ((chosen[slot] ?? 0) < 0 && !taken.has(photo)) {
      chosen[slot] = photo;
      taken.add(photo);
    }
  }
  return chosen.filter((photo) => photo >= 0);
}

/**
 * The best assignment of photos to slots (maximum total fit): exact for up to 6 slots and 8 photos, greedy by best
 * pair beyond that.
 * @param photos the photos' traits
 * @param slots the slots
 * @param theme the occasion's theme
 * @returns for each slot, the index of the photo to use
 */
export function assign(photos: PhotoTraits[], slots: SlotShape[], theme?: Theme): number[] {
  if (!photos.length) return [];
  const score = (photo: number, slot: number) => {
    const traits = photos.at(photo);
    return traits ? relevance(traits, slots.at(slot) ?? null, theme) : 0;
  };
  if (slots.length <= 6 && photos.length <= 8) return bestAssignment(photos.length, slots.length, score);
  return greedyAssignment(photos.length, slots.length, score);
}
