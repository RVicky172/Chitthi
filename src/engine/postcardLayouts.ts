import type { Rect } from '../types';
import { sizeOf } from './design';
import { below, bleedSlot, grid2x2, plainSlot, rect, rightOf, wholeCard, type LayoutContext, type SlotIn } from './layoutParts';

/*
 * The postcard layouts: one builder per layout, each placing the photo slots, the words and any decoration.
 */

/* ---------- full-photo layouts ---------- */

/**
 * The photo edge to edge, words over it ('full', 'mag-full').
 * @param context the card
 * @returns the slots
 */
export function fullPhoto({ box, pad, layout }: LayoutContext): SlotIn[] {
  layout.bg = false;
  layout.text = rect(box.x + pad, box.y + pad, box.w - 2 * pad, box.h - 2 * pad);
  layout.onPhoto = true;
  layout.overlay = true;
  return wholeCard(box);
}

/**
 * A magazine cover: the photo edge to edge, a frame line, words in a column.
 * @param context the card
 * @returns the slots
 */
export function magazine({ box, pad, landscape, layout }: LayoutContext): SlotIn[] {
  layout.bg = false;
  layout.onPhoto = true;
  layout.overlay = true;
  layout.frameLine = pad * 0.5;
  layout.text = landscape
    ? rect(box.x + pad * 1.3, box.y + pad * 1.2, box.w * 0.55, box.h - pad * 2.4)
    : rect(box.x + pad * 1.3, box.y + pad * 1.3, box.w - pad * 2.6, box.h * 0.42);
  return wholeCard(box);
}

/**
 * The photo edge to edge, words on a solid band across one side.
 * @param context the card
 * @returns the slots
 */
export function band({ box, pad, landscape, layout }: LayoutContext): SlotIn[] {
  layout.bg = false;
  layout.overlay = true;
  const area = landscape ? rect(box.x + box.w * 0.6, box.y, box.w * 0.4, box.h) : rect(box.x, box.y + box.h * 0.66, box.w, box.h * 0.34);
  layout.band = area;
  layout.text = rect(area.x + pad * 0.8, area.y + pad * 0.8, area.w - pad * 1.6, area.h - pad * 1.6);
  return wholeCard(box);
}

/**
 * The photo edge to edge, words on a frosted-glass panel over it.
 * @param context the card
 * @returns the slots
 */
export function glass({ box, pad, landscape, layout }: LayoutContext): SlotIn[] {
  layout.bg = false;
  layout.overlay = true;
  layout.ink = 'dark';
  const panel = landscape
    ? rect(box.x + box.w * 0.56, box.y + box.h * 0.2, box.w * 0.44 - pad * 0.9, box.h * 0.8 - pad * 0.9)
    : rect(box.x + pad * 0.9, box.y + box.h * 0.6, box.w - pad * 1.8, box.h * 0.4 - pad * 0.9);
  layout.glass = panel;
  const inset = Math.min(panel.w, panel.h) * 0.12;
  layout.text = rect(panel.x + inset, panel.y + inset, panel.w - 2 * inset, panel.h - 2 * inset);
  return wholeCard(box);
}

/* ---------- a photo beside or above the words ---------- */

/**
 * Words first, then the photo.
 * @param context the card
 * @returns the slots
 */
export function textFirst({ box, pad, landscape, layout }: LayoutContext): SlotIn[] {
  if (landscape) {
    layout.text = rect(box.x + pad, box.y + pad, box.w * 0.42 - pad * 1.8, box.h - 2 * pad);
    return [bleedSlot(box.x + box.w * 0.42, box.y, box.w * 0.58, box.h)];
  }
  layout.text = rect(box.x + pad, box.y + pad, box.w - 2 * pad, box.h * 0.34 - pad * 1.5);
  return [bleedSlot(box.x, box.y + box.h * 0.34, box.w, box.h * 0.66)];
}

/**
 * The photo on one half, words on the other.
 * @param context the card
 * @returns the slots
 */
export function split(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  if (landscape) {
    const photoWidth = box.w * 0.52;
    layout.text = rightOf(context, box.x + photoWidth + pad);
    return [bleedSlot(box.x, box.y, photoWidth, box.h)];
  }
  const photoHeight = box.h * 0.56;
  layout.text = below(context, box.y + photoHeight + pad * 0.8);
  return [bleedSlot(box.x, box.y, box.w, photoHeight)];
}

/**
 * Words between two photos.
 * @param context the card
 * @returns the slots
 */
export function sandwich({ box, pad, landscape, layout }: LayoutContext): SlotIn[] {
  if (landscape) {
    layout.text = rect(box.x + box.w * 0.33 + pad * 0.7, box.y + pad, box.w * 0.34 - pad * 1.4, box.h - 2 * pad);
    return [bleedSlot(box.x, box.y, box.w * 0.33, box.h), bleedSlot(box.x + box.w * 0.67, box.y, box.w * 0.33, box.h)];
  }
  layout.text = rect(box.x + pad, box.y + box.h * 0.36 + pad * 0.5, box.w - 2 * pad, box.h * 0.28 - pad);
  return [bleedSlot(box.x, box.y, box.w, box.h * 0.36), bleedSlot(box.x, box.y + box.h * 0.64, box.w, box.h * 0.36)];
}

/**
 * An instant print on the occasion background; in portrait the words are on the print.
 * @param context the card
 * @returns the slots
 */
export function polaroid(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  if (landscape) {
    const paperHeight = box.h - pad * 2;
    const paperWidth = Math.min(paperHeight * 0.84, box.w * 0.5);
    const margin = paperWidth * 0.065;
    const paper = rect(box.x + pad * 1.2, box.y + pad, paperWidth, paperHeight);
    layout.paper = paper;
    const side = Math.min(paperWidth - 2 * margin, paperHeight * 0.78);
    layout.text = rightOf(context, paper.x + paperWidth + pad);
    return [plainSlot(rect(paper.x + (paperWidth - side) / 2, paper.y + margin, side, side))];
  }
  const paperWidth = box.w - pad * 2.2;
  const paperHeight = box.h - pad * 2;
  const margin = paperWidth * 0.065;
  const paper = rect(box.x + pad * 1.1, box.y + pad, paperWidth, paperHeight);
  layout.paper = paper;
  const side = Math.min(paperWidth - 2 * margin, paperHeight * 0.68);
  const textTop = paper.y + margin + side + margin;
  layout.text = rect(paper.x + margin * 1.5, textTop, paperWidth - margin * 3, paper.y + paperHeight - textTop - margin);
  layout.ink = 'frame';
  return [plainSlot(rect(paper.x + (paperWidth - side) / 2, paper.y + margin, side, side))];
}

/**
 * An Instax print's photo window: the film's own proportions on Instax sizes, else a generic white border.
 * @param context the card
 * @returns the window, and whether it is turned from the film's natural orientation
 */
function instaxWindow({ box, design, short }: LayoutContext): { window: Rect; turned: boolean } {
  const size = sizeOf(design);
  const film = size.instax;
  if (!film) {
    const border = short * 0.07;
    return { window: rect(box.x + border, box.y + border, box.w - 2 * border, box.h - border - box.h * 0.22), turned: false };
  }
  const natural = size.native ?? 'portrait';
  const naturalWidth = natural === 'portrait' ? size.S : size.L;
  const naturalHeight = natural === 'portrait' ? size.L : size.S;
  const turned = design.orient !== natural;
  const window = turned
    ? rect(box.x + (box.w * film.top) / naturalHeight, box.y + (box.h * film.side) / naturalWidth, (box.w * film.h) / naturalHeight, (box.h * film.w) / naturalWidth)
    : rect(box.x + (box.w * film.side) / naturalWidth, box.y + (box.h * film.top) / naturalHeight, (box.w * film.w) / naturalWidth, (box.h * film.h) / naturalHeight);
  return { window, turned };
}

/**
 * An Instax print: the photo window and words on the film's wide border.
 * @param context the card
 * @returns the slots
 */
export function instax(context: LayoutContext): SlotIn[] {
  const { box, unit, layout } = context;
  layout.bg = false;
  layout.frame = true;
  layout.ink = 'frame';
  const { window, turned } = instaxWindow(context);
  layout.text = turned
    ? rect(window.x + window.w + unit * 3, window.y, box.x + box.w - (window.x + window.w) - unit * 6, window.h)
    : rect(window.x + unit, window.y + window.h + unit * 2, window.w - unit * 2, box.y + box.h - (window.y + window.h) - unit * 4);
  return [plainSlot(window)];
}

/**
 * A photo-booth strip of three.
 * @param context the card
 * @returns the slots
 */
export function photobooth(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  if (!landscape) {
    const stripWidth = box.w * 0.46;
    const strip = rect(box.x + pad * 0.9, box.y + pad * 0.8, stripWidth, box.h - pad * 1.6);
    const margin = stripWidth * 0.07;
    const frameHeight = (strip.h - margin * 4) / 3;
    layout.paper = strip;
    layout.text = rightOf(context, strip.x + stripWidth + pad * 0.9);
    return [0, 1, 2].map((frame) => plainSlot(rect(strip.x + margin, strip.y + margin + frame * (frameHeight + margin), stripWidth - 2 * margin, frameHeight)));
  }
  const stripHeight = box.h * 0.54;
  const strip = rect(box.x + pad * 0.8, box.y + pad * 0.8, box.w - pad * 1.6, stripHeight);
  const margin = stripHeight * 0.07;
  const frameWidth = (strip.w - margin * 4) / 3;
  layout.paper = strip;
  layout.text = below(context, strip.y + stripHeight + pad * 0.7);
  return [0, 1, 2].map((frame) => plainSlot(rect(strip.x + margin + frame * (frameWidth + margin), strip.y + margin, frameWidth, stripHeight - 2 * margin)));
}

/**
 * A jharokha arch.
 * @param context the card
 * @returns the slots
 */
export function arch(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  if (landscape) {
    const height = box.h - pad * 2.2;
    const width = Math.min(height * 0.66, box.w * 0.44);
    const window = rect(box.x + pad * 1.3, box.y + (box.h - height) / 2, width, height);
    layout.text = rightOf(context, window.x + width + pad);
    return [plainSlot(window, 'arch')];
  }
  const width = box.w * 0.64;
  const height = Math.min(width * 1.32, box.h * 0.58);
  const window = rect(box.x + (box.w - width) / 2, box.y + pad * 1.2, width, height);
  layout.text = below(context, window.y + height + pad * 0.7);
  return [plainSlot(window, 'arch')];
}

/**
 * A window with rounded corners.
 * @param context the card
 * @returns the slots
 */
export function roundWindow(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  if (landscape) {
    const height = box.h - pad * 2.4;
    const width = Math.min(box.w * 0.48, height * 0.82);
    const window = rect(box.x + pad * 1.3, box.y + (box.h - height) / 2, width, height);
    layout.text = rightOf(context, window.x + width + pad);
    return [plainSlot(window, 'round')];
  }
  const width = box.w * 0.8;
  const height = Math.min(box.h * 0.6, width * 1.3);
  const window = rect(box.x + (box.w - width) / 2, box.y + pad * 1.2, width, height);
  layout.text = below(context, window.y + height + pad * 0.7);
  return [plainSlot(window, 'round')];
}

/**
 * A round photo.
 * @param context the card
 * @returns the slots
 */
export function circle(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  if (landscape) {
    const diameter = Math.min(box.h - pad * 2.2, box.w * 0.46);
    const window = rect(box.x + pad * 1.3, box.y + (box.h - diameter) / 2, diameter, diameter);
    layout.text = rightOf(context, window.x + diameter + pad);
    return [plainSlot(window, 'circle')];
  }
  const diameter = Math.min(box.w * 0.7, box.h * 0.5);
  const window = rect(box.x + (box.w - diameter) / 2, box.y + pad * 1.2, diameter, diameter);
  layout.text = below(context, window.y + diameter + pad * 0.7);
  return [plainSlot(window, 'circle')];
}

/**
 * The photo as a postage stamp, with a postmark.
 * @param context the card
 * @returns the slots
 */
export function stamp(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, unit, layout } = context;
  let area: Rect;
  if (landscape) {
    const height = box.h - pad * 2.6;
    const width = Math.min(height * 0.8, box.w * 0.42);
    area = rect(box.x + pad * 1.3, box.y + (box.h - height) / 2, width, height);
  } else {
    const width = box.w * 0.6;
    const height = Math.min(width * 1.22, box.h * 0.56);
    area = rect(box.x + (box.w - width) / 2, box.y + pad * 1.3, width, height);
  }
  layout.stamp = area;
  const inset = unit * 3.2;
  layout.post = { x: area.x + area.w - unit, y: area.y + unit * 5, r: unit * 8.5 };
  layout.text = landscape ? rightOf(context, area.x + area.w + pad + unit * 6) : below(context, area.y + area.h + pad * 0.8);
  return [plainSlot(rect(area.x + inset, area.y + inset, area.w - 2 * inset, area.h - 2 * inset - unit * 5))];
}

/* ---------- collages ---------- */

/**
 * Two photos.
 * @param context the card
 * @returns the slots
 */
export function collage2(context: LayoutContext): SlotIn[] {
  const { box, pad, gap, landscape, layout } = context;
  if (landscape) {
    const width = box.w * 0.6;
    layout.text = rightOf(context, box.x + width + pad);
    return [bleedSlot(box.x, box.y, width, (box.h - gap) / 2), bleedSlot(box.x, box.y + (box.h + gap) / 2, width, (box.h - gap) / 2)];
  }
  const height = box.h * 0.58;
  layout.text = below(context, box.y + height + pad * 0.8);
  return [bleedSlot(box.x, box.y, (box.w - gap) / 2, height), bleedSlot(box.x + (box.w + gap) / 2, box.y, (box.w - gap) / 2, height)];
}

/**
 * One large photo and two small ones.
 * @param context the card
 * @returns the slots
 */
export function collage3(context: LayoutContext): SlotIn[] {
  const { box, pad, gap, landscape, layout } = context;
  if (landscape) {
    const largeWidth = box.w * 0.38;
    const smallWidth = box.w * 0.24;
    layout.text = rightOf(context, box.x + largeWidth + gap + smallWidth + pad);
    return [
      bleedSlot(box.x, box.y, largeWidth, box.h),
      bleedSlot(box.x + largeWidth + gap, box.y, smallWidth, (box.h - gap) / 2),
      bleedSlot(box.x + largeWidth + gap, box.y + (box.h + gap) / 2, smallWidth, (box.h - gap) / 2),
    ];
  }
  const largeHeight = box.h * 0.36;
  const smallHeight = box.h * 0.22;
  layout.text = below(context, box.y + largeHeight + gap + smallHeight + pad * 0.8);
  return [
    bleedSlot(box.x, box.y, box.w, largeHeight),
    bleedSlot(box.x, box.y + largeHeight + gap, (box.w - gap) / 2, smallHeight),
    bleedSlot(box.x + (box.w + gap) / 2, box.y + largeHeight + gap, (box.w - gap) / 2, smallHeight),
  ];
}

/**
 * One large photo and three small ones in a row.
 * @param context the card
 * @returns the slots
 */
export function mosaic(context: LayoutContext): SlotIn[] {
  const { box, pad, gap, landscape, layout } = context;
  if (landscape) {
    const largeWidth = box.w * 0.42;
    const smallWidth = box.w * 0.18;
    const smallHeight = (box.h - 2 * gap) / 3;
    layout.text = rightOf(context, box.x + largeWidth + gap + smallWidth + pad);
    return [bleedSlot(box.x, box.y, largeWidth, box.h), ...[0, 1, 2].map((row) => bleedSlot(box.x + largeWidth + gap, box.y + row * (smallHeight + gap), smallWidth, smallHeight))];
  }
  const largeHeight = box.h * 0.46;
  const smallHeight = box.h * 0.2;
  const smallWidth = (box.w - 2 * gap) / 3;
  layout.text = below(context, box.y + largeHeight + gap + smallHeight + pad * 0.7);
  return [bleedSlot(box.x, box.y, box.w, largeHeight), ...[0, 1, 2].map((column) => bleedSlot(box.x + column * (smallWidth + gap), box.y + largeHeight + gap, smallWidth, smallHeight))];
}

/**
 * Four photos in a grid beside or above the words.
 * @param context the card
 * @returns the slots
 */
export function collage4(context: LayoutContext): SlotIn[] {
  const { box, pad, gap, landscape, layout } = context;
  if (landscape) {
    const width = box.w * 0.62;
    layout.text = rightOf(context, box.x + width + pad);
    return grid2x2(box.x, box.y, (width - gap) / 2, (box.h - gap) / 2, gap);
  }
  const height = box.h * 0.62;
  layout.text = below(context, box.y + height + pad * 0.8);
  return grid2x2(box.x, box.y, (box.w - gap) / 2, (height - gap) / 2, gap);
}

/**
 * Words only.
 * @param context the card
 * @returns no slots
 */
export function textOnly({ box, pad, layout }: LayoutContext): SlotIn[] {
  layout.text = rect(box.x + pad * 1.3, box.y + pad * 1.3, box.w - pad * 2.6, box.h - pad * 2.6);
  return [];
}

/* ---------- modern postcard layouts ---------- */

/**
 * A photo with a solid accent block offset behind it, on plain paper.
 * @param context the card
 * @returns the slots
 */
export function offset(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, unit, layout } = context;
  layout.frame = true;
  layout.bg = false;
  layout.ink = 'frame';
  const shift = unit * 3.2;
  const photo = landscape ? rect(box.x + pad, box.y + pad, box.w * 0.5, box.h - 2 * pad - shift) : rect(box.x + pad, box.y + pad, box.w - 2 * pad - shift, box.h * 0.55);
  layout.blocks = [{ r: rect(photo.x + shift, photo.y + shift, photo.w, photo.h), c: 'accent' }];
  layout.text = landscape ? rightOf(context, photo.x + photo.w + shift + pad) : below(context, photo.y + photo.h + shift + pad * 0.7);
  return [plainSlot(photo)];
}

/**
 * Two photos split on a slant.
 * @param context the card
 * @returns the slots
 */
function diagonalSlots({ box, gap, landscape }: LayoutContext): SlotIn[] {
  const seam = gap * 0.6;
  if (landscape) {
    const topX = box.x + box.w * 0.6;
    const bottomX = box.x + box.w * 0.42;
    return [
      { s: 'poly', ...rect(box.x, box.y, topX - box.x, box.h), bleed: true, pts: [[box.x, box.y], [topX - seam, box.y], [bottomX - seam, box.y + box.h], [box.x, box.y + box.h]] },
      { s: 'poly', ...rect(bottomX, box.y, box.x + box.w - bottomX, box.h), bleed: true, pts: [[topX + seam, box.y], [box.x + box.w, box.y], [box.x + box.w, box.y + box.h], [bottomX + seam, box.y + box.h]] },
    ];
  }
  const rightY = box.y + box.h * 0.42;
  const leftY = box.y + box.h * 0.6;
  return [
    { s: 'poly', ...rect(box.x, box.y, box.w, leftY - box.y), bleed: true, pts: [[box.x, box.y], [box.x + box.w, box.y], [box.x + box.w, rightY - seam], [box.x, leftY - seam]] },
    { s: 'poly', ...rect(box.x, rightY, box.w, box.y + box.h - rightY), bleed: true, pts: [[box.x, leftY + seam], [box.x + box.w, rightY + seam], [box.x + box.w, box.y + box.h], [box.x, box.y + box.h]] },
  ];
}

/**
 * Two photos split on a slant, words over the lower part.
 * @param context the card
 * @returns the slots
 */
export function diagonal(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  layout.frame = true;
  layout.bg = false;
  layout.overlay = true;
  const slots = diagonalSlots(context);
  // Words sit on one photo, clear of the slanted seam.
  if (landscape) {
    layout.text = rect(box.x + box.w * 0.6, box.y + box.h * 0.36, box.w * 0.4 - pad, box.h * 0.64 - pad);
    layout.scrimArea = rect(box.x + box.w * 0.42, box.y, box.w * 0.58, box.h);
  } else {
    layout.text = rect(box.x + pad, box.y + box.h * 0.63, box.w - 2 * pad, box.h * 0.37 - pad);
    layout.scrimArea = rect(box.x, box.y + box.h * 0.42, box.w, box.h * 0.58);
  }
  layout.onPhoto = true;
  return slots;
}

/**
 * Three instant prints, tilted and overlapping, taped onto the occasion background.
 * @param context the card
 * @returns the slots
 */
export function scrapbook(context: LayoutContext): SlotIn[] {
  const { box, landscape, layout } = context;
  const side = landscape ? Math.min(box.h * 0.46, box.w * 0.23) : Math.min(box.w * 0.36, box.h * 0.24);
  const print = (centreX: number, centreY: number, rot: number): SlotIn => ({ s: 'rect', ...rect(centreX - side / 2, centreY - side / 2, side, side), rot, print: true });
  if (landscape) {
    layout.text = rightOf(context, box.x + box.w * 0.6);
    return [print(box.x + box.w * 0.16, box.y + box.h * 0.34, -0.1), print(box.x + box.w * 0.43, box.y + box.h * 0.3, 0.07), print(box.x + box.w * 0.29, box.y + box.h * 0.66, -0.03)];
  }
  layout.text = below(context, box.y + box.h * 0.62);
  return [print(box.x + box.w * 0.3, box.y + box.h * 0.17, -0.09), print(box.x + box.w * 0.7, box.y + box.h * 0.2, 0.08), print(box.x + box.w * 0.47, box.y + box.h * 0.42, -0.02)];
}

/** Frames on the film strip. */
const FILM_FRAMES = 3;

/**
 * Frames on a dark film strip with sprocket holes.
 * @param context the card
 * @returns the slots
 */
export function filmstrip(context: LayoutContext): SlotIn[] {
  const { box, pad, gap, landscape, layout } = context;
  if (landscape) {
    const stripHeight = box.h * 0.5;
    const strip = rect(box.x, box.y + pad * 0.9, box.w, stripHeight);
    const hole = stripHeight * 0.13;
    const frameWidth = (box.w - pad * 2 - gap * (FILM_FRAMES - 1)) / FILM_FRAMES;
    layout.film = { r: strip, vertical: false };
    layout.text = below(context, strip.y + stripHeight + pad * 0.6);
    return Array.from({ length: FILM_FRAMES }, (_, frame) => plainSlot(rect(box.x + pad + frame * (frameWidth + gap), strip.y + hole * 1.6, frameWidth, stripHeight - hole * 3.2)));
  }
  const stripWidth = box.w * 0.46;
  const strip = rect(box.x + pad * 0.8, box.y, stripWidth, box.h);
  const hole = stripWidth * 0.13;
  const frameHeight = (box.h - pad * 2 - gap * (FILM_FRAMES - 1)) / FILM_FRAMES;
  layout.film = { r: strip, vertical: true };
  layout.text = rightOf(context, strip.x + stripWidth + pad * 0.8);
  return Array.from({ length: FILM_FRAMES }, (_, frame) => plainSlot(rect(strip.x + hole * 1.6, box.y + pad + frame * (frameHeight + gap), stripWidth - hole * 3.2, frameHeight)));
}

/**
 * A small photo, generous white space and a fine hairline.
 * @param context the card
 * @returns the slots
 */
export function minimal({ box, pad, landscape, layout }: LayoutContext): SlotIn[] {
  layout.frame = true;
  layout.bg = false;
  layout.ink = 'frame';
  layout.hairline = pad * 0.45;
  layout.textFill = 0.22;
  if (landscape) {
    layout.text = rect(box.x + box.w * 0.52, box.y + box.h * 0.2, box.w * 0.36, box.h * 0.6);
    return [plainSlot(rect(box.x + box.w * 0.12, box.y + box.h * 0.2, box.w * 0.32, box.h * 0.6))];
  }
  const photoWidth = box.w * 0.56;
  const photo = rect(box.x + (box.w - photoWidth) / 2, box.y + box.h * 0.13, photoWidth, photoWidth * 1.22);
  layout.text = rect(box.x + box.w * 0.16, photo.y + photo.h + box.h * 0.05, box.w * 0.68, box.y + box.h * 0.88 - (photo.y + photo.h + box.h * 0.05));
  return [plainSlot(photo)];
}

/**
 * Two jharokha arches side by side.
 * @param context the card
 * @returns the slots
 */
export function twinArch(context: LayoutContext): SlotIn[] {
  const { box, pad, landscape, layout } = context;
  if (landscape) {
    const height = box.h - pad * 2.4;
    const width = Math.min(height * 0.6, box.w * 0.27);
    const top = box.y + (box.h - height) / 2;
    layout.text = rightOf(context, box.x + pad * 1.1 + width * 2 + pad * 1.4);
    return [plainSlot(rect(box.x + pad * 1.1, top, width, height), 'arch'), plainSlot(rect(box.x + pad * 1.1 + width + pad * 0.6, top, width, height), 'arch')];
  }
  const width = (box.w - pad * 2.4 - pad * 0.6) / 2;
  const height = Math.min(width * 1.55, box.h * 0.56);
  layout.text = below(context, box.y + pad * 1.3 + height + pad * 0.7);
  return [plainSlot(rect(box.x + pad * 1.2, box.y + pad * 1.3, width, height), 'arch'), plainSlot(rect(box.x + pad * 1.8 + width, box.y + pad * 1.3, width, height), 'arch')];
}

