import type { LayoutId, Rect } from '../types';
import { bleedSlot, grid2x2, plainSlot, rect, wholeCard, type LayoutContext, type SlotIn } from './layoutParts';

/*
 * The frame-print, calendar and fridge-magnet layouts: one builder per family, each placing the photo slots, the words
 * and the decoration (mat, month title and day grid, caption strip, badge ring).
 */

/* ---------- photo frame prints: photo windows cut into a mat ---------- */

/**
 * Equal rects along a row or a column.
 * @param area the rect to divide
 * @param count how many
 * @param gap between them
 * @param horizontal along a row (else a column)
 * @returns the rects
 */
function along(area: Rect, count: number, gap: number, horizontal: boolean): Rect[] {
  return Array.from({ length: count }, (_, index) =>
    horizontal
      ? rect(area.x + index * ((area.w - gap * (count - 1)) / count + gap), area.y, (area.w - gap * (count - 1)) / count, area.h)
      : rect(area.x, area.y + index * ((area.h - gap * (count - 1)) / count + gap), area.w, (area.h - gap * (count - 1)) / count),
  );
}

/**
 * The windows of a frame print's layout.
 * @param id the layout
 * @param area the area inside the mat
 * @param gap between windows
 * @param landscape the card's orientation
 * @returns the windows' rects
 */
function frameWindows(id: LayoutId, area: Rect, gap: number, landscape: boolean): Rect[] {
  if (id === 'frame-single' || id === 'frame-caption') return [area];
  if (id === 'frame-duo') return along(area, 2, gap, landscape);
  if (id === 'frame-trio') return along(area, 3, gap, landscape);
  if (id === 'frame-grid') return along(area, 2, gap, false).flatMap((row) => along(row, 2, gap, true));
  const big = landscape ? rect(area.x, area.y, area.w * 0.62, area.h) : rect(area.x, area.y, area.w, area.h * 0.62);
  const rest = landscape ? rect(area.x + big.w + gap, area.y, area.w - big.w - gap, area.h) : rect(area.x, area.y + big.h + gap, area.w, area.h - big.h - gap);
  return [big, ...along(rest, 2, gap, !landscape)];
}

/**
 * The strip under the photos: a caption's own strip, or the slightly deeper bottom of a traditional mat.
 * @param id the layout
 * @param short the card's shorter side
 * @param matWidth the mat's width
 * @returns its height
 */
function frameBottom(id: LayoutId, short: number, matWidth: number): number {
  if (id === 'frame-caption') return Math.max(short * 0.13, matWidth);
  return matWidth ? matWidth * 0.18 : 0;
}

/**
 * A frame print: one or more photo windows cut into a mat (or edge to edge without one).
 * @param context the card
 * @returns the slots
 */
export function framePrint({ id, box, design, short, gap, landscape, layout }: LayoutContext): SlotIn[] {
  layout.bg = false;
  layout.frame = true;
  layout.ink = 'frame';
  const matWidth = short * { none: 0, thin: 0.045, classic: 0.1, wide: 0.16 }[design.mat];
  const windowGap = matWidth ? Math.max(matWidth * 0.45, short * 0.025) : gap;
  const toSlot = (window: Rect): SlotIn => (matWidth ? plainSlot(window) : bleedSlot(window.x, window.y, window.w, window.h));
  layout.mat = matWidth > 0;
  // Traditional mats are a little deeper at the bottom; a caption needs its own strip.
  const bottom = frameBottom(id, short, matWidth);
  const area = rect(box.x + matWidth, box.y + matWidth, box.w - 2 * matWidth, box.h - 2 * matWidth - bottom);
  if (id === 'frame-caption') layout.text = rect(area.x, area.y + area.h + bottom * 0.12, area.w, bottom * (matWidth ? 0.8 : 0.85));
  return frameWindows(id, area, windowGap, landscape).map(toSlot);
}

/* ---------- calendars: photo area plus a month title and day grid ---------- */

/** A calendar's photo slots, the area for its words, title and grid, and the visible photo (for words placed on it). */
interface CalendarParts {
  slots: SlotIn[];
  area: Rect;
  photo: Rect | null;
}

/**
 * The photo above the month ('cal-top', 'cal-duo', and the Year strip in portrait).
 * @param context the card
 * @returns the parts
 */
function calendarPhotoAbove({ id, box, pad, gap, landscape }: LayoutContext): CalendarParts {
  let share = 0.56;
  if (id === 'cal-strip' || landscape) share = 0.5;
  const photoHeight = box.h * share;
  const slots = id === 'cal-duo' ? [bleedSlot(box.x, box.y, (box.w - gap) / 2, photoHeight), bleedSlot(box.x + (box.w + gap) / 2, box.y, (box.w - gap) / 2, photoHeight)] : [bleedSlot(box.x, box.y, box.w, photoHeight)];
  return { slots, photo: rect(box.x, box.y, box.w, photoHeight), area: rect(box.x + pad, box.y + photoHeight + pad * 0.55, box.w - 2 * pad, box.h - photoHeight - pad * 1.3) };
}

/**
 * The photo beside the month in landscape, framed above it in portrait ('cal-side', the Year strip in landscape).
 * @param context the card
 * @returns the parts
 */
function calendarPhotoBeside({ id, box, pad, landscape }: LayoutContext): CalendarParts {
  if (landscape) {
    const photoWidth = box.w * (id === 'cal-strip' ? 0.42 : 0.5);
    return {
      slots: [bleedSlot(box.x, box.y, photoWidth, box.h)],
      photo: rect(box.x, box.y, photoWidth, box.h),
      area: rect(box.x + photoWidth + pad * 0.9, box.y + pad, box.w - photoWidth - pad * 1.9, box.h - 2 * pad),
    };
  }
  const photoHeight = box.h * 0.48;
  const photo = rect(box.x + pad, box.y + pad, box.w - 2 * pad, photoHeight);
  return { slots: [plainSlot(photo)], photo, area: rect(box.x + pad, box.y + pad + photoHeight + pad * 0.55, box.w - 2 * pad, box.h - photoHeight - pad * 2.55) };
}

/**
 * Full photo, the month on a frosted-glass panel.
 * @param context the card
 * @returns the parts
 */
function calendarGlass({ box, pad, landscape, layout }: LayoutContext): CalendarParts {
  layout.frame = false;
  layout.ink = 'dark';
  const panel = landscape
    ? rect(box.x + box.w * 0.5, box.y + pad * 0.8, box.w * 0.5 - pad * 0.8, box.h - pad * 1.6)
    : rect(box.x + pad * 0.8, box.y + box.h * 0.5, box.w - pad * 1.6, box.h * 0.5 - pad * 0.8);
  layout.glass = panel;
  const inset = pad * 0.6;
  return {
    slots: wholeCard(box),
    photo: landscape ? rect(box.x, box.y, box.w * 0.5, box.h) : rect(box.x, box.y, box.w, box.h * 0.5),
    area: rect(panel.x + inset, panel.y + inset, panel.w - 2 * inset, panel.h - 2 * inset),
  };
}

/**
 * Editorial: a rounded photo, then a big month number beside the month name, then the dates.
 * @param context the card
 * @returns the parts
 */
function calendarBold({ box, pad, landscape }: LayoutContext): CalendarParts {
  const photo = landscape ? rect(box.x + pad * 0.8, box.y + pad * 0.8, box.w * 0.48, box.h - pad * 1.6) : rect(box.x + pad * 0.8, box.y + pad * 0.8, box.w - pad * 1.6, box.h * 0.48);
  const area = landscape
    ? rect(photo.x + photo.w + pad * 0.9, box.y + pad, box.x + box.w - (photo.x + photo.w) - pad * 1.9, box.h - 2 * pad)
    : rect(box.x + pad, photo.y + photo.h + pad * 0.6, box.w - 2 * pad, box.y + box.h - (photo.y + photo.h) - pad * 1.4);
  return { slots: [{ ...plainSlot(photo, 'round'), bare: true }], photo, area };
}

/**
 * A jharokha-arch window of photo above (or beside) the month.
 * @param context the card
 * @returns the parts
 */
function calendarArch({ box, pad, landscape }: LayoutContext): CalendarParts {
  if (landscape) {
    const height = box.h - pad * 2;
    const width = Math.min(height * 0.74, box.w * 0.42);
    const window = rect(box.x + pad * 1.1, box.y + pad, width, height);
    return { slots: [plainSlot(window, 'arch')], photo: window, area: rect(window.x + width + pad, box.y + pad, box.x + box.w - (window.x + width) - pad * 2, box.h - 2 * pad) };
  }
  const width = box.w * 0.66;
  const height = Math.min(width * 1.18, box.h * 0.5);
  const window = rect(box.x + (box.w - width) / 2, box.y + pad * 1.1, width, height);
  return { slots: [plainSlot(window, 'arch')], photo: window, area: rect(box.x + pad, window.y + height + pad * 0.6, box.w - 2 * pad, box.y + box.h - (window.y + height) - pad * 1.5) };
}

/**
 * The photo edge to edge, the month on a solid band.
 * @param context the card
 * @returns the parts
 */
function calendarFull({ box, pad, landscape, layout }: LayoutContext): CalendarParts {
  const area = landscape ? rect(box.x + box.w * 0.56, box.y, box.w * 0.44, box.h) : rect(box.x, box.y + box.h * 0.6, box.w, box.h * 0.4);
  layout.band = area;
  return {
    slots: wholeCard(box),
    photo: landscape ? rect(box.x, box.y, box.w * 0.56, box.h) : rect(box.x, box.y, box.w, box.h * 0.6),
    area: rect(area.x + pad * 0.7, area.y + pad * 0.6, area.w - pad * 1.4, area.h - pad * 1.2),
  };
}

/**
 * Dates only: occasion artwork around a paper card that holds the month.
 * @param context the card
 * @returns the parts
 */
function calendarPlain({ box, pad, layout }: LayoutContext): CalendarParts {
  layout.frame = false;
  layout.bg = true;
  const paper = rect(box.x + pad, box.y + pad * 1.4, box.w - 2 * pad, box.h - pad * 2.4);
  layout.paper = paper;
  return { slots: [], photo: null, area: rect(paper.x + pad * 0.8, paper.y + pad * 0.8, paper.w - pad * 1.6, paper.h - pad * 1.6) };
}

/**
 * A calendar layout's photo and the area for its month.
 * @param context the card
 * @returns the parts
 */
function calendarParts(context: LayoutContext): CalendarParts {
  const { id, landscape } = context;
  if (id === 'cal-top' || id === 'cal-duo' || (id === 'cal-strip' && !landscape)) return calendarPhotoAbove(context);
  if (id === 'cal-side' || id === 'cal-strip') return calendarPhotoBeside(context);
  if (id === 'cal-glass') return calendarGlass(context);
  if (id === 'cal-bold') return calendarBold(context);
  if (id === 'cal-arch') return calendarArch(context);
  if (id === 'cal-full') return calendarFull(context);
  return calendarPlain(context);
}

/**
 * A size setting kept to a sensible range.
 * @param scale the setting (missing or 0 means 1)
 * @returns 0.5–1.8
 */
const clampScale = (scale: number | undefined): number => Math.min(1.8, Math.max(0.5, (scale ?? 0) || 1));

/**
 * Shares a calendar's area between the caption line, the month title and the day grid (or the Year strip's year),
 * with real gaps between them. The grid keeps at least 60% of the height; the caption and title shrink together when
 * space is short (landscape desk calendars).
 * @param context the card
 * @param area the area for the month
 * @param hasCaption whether a caption line goes above the title
 */
function shareCalendarArea({ id, design, unit, layout }: LayoutContext, area: Rect, hasCaption: boolean): void {
  const isStrip = id === 'cal-strip';
  const gap = Math.max(unit * 1.8, area.h * 0.03);
  // Text size scales the caption line, and the title size scales the month title, before they share the room.
  let captionHeight = hasCaption ? Math.min(area.h * 0.1, area.w * 0.075) * clampScale(design.textScale) : 0;
  let titleHeight = (isStrip ? Math.min(area.h * 0.14, area.w * 0.1) : Math.min(area.h * 0.17, area.w * 0.12)) * clampScale(design.cal.titleScale);
  const gaps = gap * (hasCaption ? 2 : 1);
  const room = area.h * 0.46 - gaps;
  if (captionHeight + titleHeight > room) {
    const shrink = Math.max(0.5, room / (captionHeight + titleHeight));
    captionHeight *= shrink;
    titleHeight *= shrink;
  }
  let y = area.y;
  if (hasCaption) {
    // One line above the month title, a step smaller than it.
    layout.text = rect(area.x, y, area.w, captionHeight);
    layout.textFill = 0.72;
    layout.textScaled = true;
    y += captionHeight + gap;
  }
  if (id === 'cal-bold') {
    // The number is as tall as two title lines; the month name sits beside it on the number's baseline band.
    const numberHeight = Math.min(titleHeight * 1.7, area.h * 0.2);
    const numberWidth = numberHeight * 1.5;
    const nameHeight = numberHeight * 0.5;
    layout.calNum = rect(area.x, y, numberWidth, numberHeight);
    // Sized so the month name's baseline meets the number's baseline.
    layout.calTitle = rect(area.x + numberWidth + gap * 0.6, y + numberHeight - nameHeight * 0.78, area.w - numberWidth - gap * 0.6, nameHeight);
    titleHeight = numberHeight;
  } else layout.calTitle = rect(area.x, y, area.w, titleHeight);
  y += titleHeight + gap;
  if (isStrip) layout.calYear = rect(area.x, y, area.w, area.y + area.h - y);
  else layout.calGrid = rect(area.x, y, area.w, area.y + area.h - y);
}

/**
 * A calendar page: photo, words (a caption line above the month, or laid over the photo), month title and day grid.
 * @param context the card
 * @returns the slots
 */
export function calendar(context: LayoutContext): SlotIn[] {
  const { design, layout } = context;
  layout.frame = true;
  layout.bg = false;
  layout.ink = 'frame';
  const { slots, area, photo } = calendarParts(context);
  const place = design.cal.text;
  if (place === 'photo' && photo) {
    const inset = Math.min(photo.w, photo.h) * 0.08;
    layout.text = rect(photo.x + inset, photo.y + inset, photo.w - 2 * inset, photo.h - 2 * inset);
    layout.onPhoto = true;
    layout.ink = null; // white on the photo, not the paper's ink
    layout.scrimArea = photo;
  }
  shareCalendarArea(context, area, place === 'caption' || (place === 'photo' && !photo));
  return slots;
}

/* ---------- fridge magnets: small pieces, one idea each ---------- */

/**
 * The bottom strip of a captioned or Polaroid magnet.
 * @param isPolaroid a Polaroid magnet (a deeper strip)
 * @param landscape the card's orientation
 * @returns its share of the card's height
 */
function magnetCaptionShare(isPolaroid: boolean, landscape: boolean): number {
  if (isPolaroid) return landscape ? 0.25 : 0.22;
  return landscape ? 0.22 : 0.18;
}

/**
 * A magnet with the photo above a caption strip ('mag-caption', 'mag-polaroid').
 * @param context the card
 * @returns the slots
 */
export function magnetCaption({ id, box, short, unit, landscape, layout }: LayoutContext): SlotIn[] {
  layout.frame = true;
  layout.bg = false;
  layout.ink = 'frame';
  const isPolaroid = id === 'mag-polaroid';
  const side = short * (isPolaroid ? 0.075 : 0.05);
  const caption = box.h * magnetCaptionShare(isPolaroid, landscape);
  const photo = rect(box.x + side, box.y + side, box.w - 2 * side, box.h - side - caption);
  layout.text = rect(photo.x + unit * 1.5, photo.y + photo.h + caption * 0.14, photo.w - unit * 3, caption * 0.72);
  layout.textCenter = true;
  return [plainSlot(photo)];
}

/**
 * Two photos, no words.
 * @param context the card
 * @returns the slots
 */
export function magnetDuo({ box, gap, landscape, layout }: LayoutContext): SlotIn[] {
  layout.bg = false;
  layout.frame = true;
  return landscape
    ? [bleedSlot(box.x, box.y, (box.w - gap) / 2, box.h), bleedSlot(box.x + (box.w + gap) / 2, box.y, (box.w - gap) / 2, box.h)]
    : [bleedSlot(box.x, box.y, box.w, (box.h - gap) / 2), bleedSlot(box.x, box.y + (box.h + gap) / 2, box.w, (box.h - gap) / 2)];
}

/**
 * Four photos, no words.
 * @param context the card
 * @returns the slots
 */
export function magnetGrid({ box, gap, layout }: LayoutContext): SlotIn[] {
  layout.bg = false;
  layout.frame = true;
  return grid2x2(box.x, box.y, (box.w - gap) / 2, (box.h - gap) / 2, gap);
}

/**
 * A round photo inside a lettered ring: greeting on the top arc, signature on the bottom one.
 * @param context the card
 * @returns the slots
 */
export function magnetBadge({ box, short, layout }: LayoutContext): SlotIn[] {
  const radius = short / 2 - short * 0.035;
  const ring = short * 0.13;
  const centreX = box.x + box.w / 2;
  const centreY = box.y + box.h / 2;
  const photoRadius = radius - ring;
  layout.arc = { x: centreX, y: centreY, r: radius, band: ring };
  return [plainSlot(rect(centreX - photoRadius, centreY - photoRadius, photoRadius * 2, photoRadius * 2), 'circle')];
}

/**
 * A quote magnet: words only.
 * @param context the card
 * @returns no slots
 */
export function magnetQuote({ box, pad, layout }: LayoutContext): SlotIn[] {
  layout.text = rect(box.x + pad * 1.2, box.y + pad * 1.2, box.w - pad * 2.4, box.h - pad * 2.4);
  return [];
}

