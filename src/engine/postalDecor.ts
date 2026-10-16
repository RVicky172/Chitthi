import { fontDef, fontStr } from '../data/fonts';
import type { Box, Design, Layout, Rect, Slot, Theme } from '../types';
import { hexA } from './color';
import { darkInk } from './design';
import { labelFace, shrinkFont } from './printText';
import { drawThemeBg } from './themeBackground';

/*
 * The postal and badge decorations of a card's front: the stamp (perforated, the occasion inside) with its text, the
 * postmark, the badge magnet's arc lettering, and the Instagram tag.
 */

/** A postmark's centre and radius. */
export type Postmark = NonNullable<Layout['post']>;

/**
 * Makes the stamp's perforated outline the current path: little circles along its edges.
 * @param ctx the card's context
 * @param stamp the stamp
 * @param unit the card's drawing unit
 */
function perforationPath(ctx: CanvasRenderingContext2D, stamp: Rect, unit: number): void {
  const step = unit * 2.6;
  const radius = unit * 0.85;
  ctx.beginPath();
  for (let x = stamp.x; x <= stamp.x + stamp.w + 0.1; x += stamp.w / Math.round(stamp.w / step)) {
    ctx.moveTo(x + radius, stamp.y);
    ctx.arc(x, stamp.y, radius, 0, 7);
    ctx.moveTo(x + radius, stamp.y + stamp.h);
    ctx.arc(x, stamp.y + stamp.h, radius, 0, 7);
  }
  for (let y = stamp.y; y <= stamp.y + stamp.h + 0.1; y += stamp.h / Math.round(stamp.h / step)) {
    ctx.moveTo(stamp.x + radius, y);
    ctx.arc(stamp.x, y, radius, 0, 7);
    ctx.moveTo(stamp.x + stamp.w + radius, y);
    ctx.arc(stamp.x + stamp.w, y, radius, 0, 7);
  }
}

/**
 * A stamp: white paper with a shadow, the background redrawn through little circles along its edges (perforations).
 * @param ctx the card's context
 * @param stamp the stamp
 * @param theme the occasion's theme
 * @param box the card
 * @param unit the card's drawing unit
 * @param withArt whether the background shows the occasion's artwork
 */
export function drawStamp(ctx: CanvasRenderingContext2D, stamp: Rect, theme: Theme, box: Box, unit: number, withArt: boolean): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.3)';
  ctx.shadowBlur = unit * 2;
  ctx.shadowOffsetY = unit * 0.6;
  ctx.fillStyle = '#FFFDF6';
  ctx.fillRect(stamp.x, stamp.y, stamp.w, stamp.h);
  ctx.restore();
  ctx.save();
  perforationPath(ctx, stamp, unit);
  ctx.clip();
  drawThemeBg(ctx, box, theme, withArt);
  ctx.restore();
}

/**
 * The stamp's country and value.
 * @param ctx the card's context
 * @param stamp the stamp
 * @param theme the occasion's theme
 * @param unit the card's drawing unit
 */
export function drawStampText(ctx: CanvasRenderingContext2D, stamp: Rect, theme: Theme, unit: number): void {
  ctx.fillStyle = darkInk(theme);
  ctx.textBaseline = 'alphabetic';
  ctx.font = `600 ${String(unit * 2.6)}px "Hind","Baloo 2",sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('भारत INDIA', stamp.x + unit * 3.2, stamp.y + stamp.h - unit * 2.6);
  ctx.textAlign = 'right';
  ctx.font = `700 ${String(unit * 3)}px "Hind",sans-serif`;
  ctx.fillText('₹5', stamp.x + stamp.w - unit * 3.2, stamp.y + stamp.h - unit * 2.5);
}

/**
 * A postmark: two rings, the cancellation's wavy lines, the occasion's first word and the year.
 * @param ctx the card's context
 * @param postmark its centre and radius
 * @param theme the occasion's theme
 * @param unit the card's drawing unit
 * @param year the year shown
 */
export function drawPostmark(ctx: CanvasRenderingContext2D, postmark: Postmark, theme: Theme, unit: number, year: number): void {
  ctx.save();
  ctx.strokeStyle = hexA(theme.accent, 0.85);
  ctx.fillStyle = hexA(theme.accent, 0.9);
  ctx.lineWidth = unit * 0.45;
  ctx.beginPath();
  ctx.arc(postmark.x, postmark.y, postmark.r, 0, 7);
  ctx.stroke();
  ctx.lineWidth = unit * 0.25;
  ctx.beginPath();
  ctx.arc(postmark.x, postmark.y, postmark.r * 0.74, 0, 7);
  ctx.stroke();
  for (let wave = -1; wave <= 2; wave++) {
    ctx.beginPath();
    for (let x = 0; x <= unit * 16; x += unit * 0.5) {
      ctx.lineTo(postmark.x + postmark.r + unit * 1.2 + x, postmark.y + wave * unit * 1.9 + Math.sin(x / (unit * 1.6)) * unit * 0.55);
    }
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${String(unit * 1.9)}px Hind, sans-serif`;
  const firstWord = theme.name.split(/[ &’']/).at(0) ?? '';
  ctx.fillText(firstWord.toUpperCase().slice(0, 10), postmark.x, postmark.y - unit * 1.2);
  ctx.font = `600 ${String(unit * 2.1)}px Hind, sans-serif`;
  ctx.fillText(String(year), postmark.x, postmark.y + unit * 1.5);
  ctx.restore();
}

/**
 * The lowest, right-most photo slot.
 * @param slots the layout's slots
 * @returns the slot, or null when there is none
 */
function lastSlot(slots: Slot[]): Slot | null {
  return slots.reduce<Slot | null>((last, slot) => (!last || slot.x + slot.w + slot.y + slot.h > last.x + last.w + last.y + last.h ? slot : last), null);
}

/**
 * The username tag in the bottom-right corner of the lowest, right-most photo (or the card when there is none).
 * @param ctx the card's context
 * @param layout the front's layout
 * @param box the card
 * @param unit the card's drawing unit
 * @param name the username, without @
 * @param ink the card's dark ink (on paper)
 * @param font the tag's family (empty: Hind)
 */
export function drawFrontInsta(ctx: CanvasRenderingContext2D, layout: Layout, box: Box, unit: number, name: string, ink: string, font: string): void {
  const slot = lastSlot(layout.slots);
  let area: Rect = slot ?? box;
  if (slot?.s === 'circle') {
    // A circle's bounding-box corner is off the photo: use the square inscribed in it.
    const side = Math.min(slot.w, slot.h) * 0.707;
    area = { x: slot.x + (slot.w - side) / 2, y: slot.y + (slot.h - side) / 2, w: side, h: side };
  }
  const inset = Math.max(unit * 3, Math.min(area.w, area.h) * 0.05);
  // On a photo the tag is white with a soft shadow; on paper it uses the card's dark ink.
  ctx.save();
  if (slot) {
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = unit * 0.9;
  }
  const right = Math.min(area.x + area.w, box.x + box.w) - inset;
  const middle = Math.min(area.y + area.h, box.y + box.h) - inset;
  drawInsta(ctx, { name, right, middle, unit, ink: slot ? '#FFFFFF' : ink, font });
  ctx.restore();
}

/** An Instagram tag to draw. */
interface InstaTag {
  /** The username, without @. */
  name: string;
  /** Its right edge, pixels. */
  right: number;
  /** Its vertical centre, pixels. */
  middle: number;
  /** The card's drawing unit. */
  unit: number;
  ink: string;
  /** The family (empty: Hind). */
  font: string;
}

/**
 * The Instagram glyph followed by the username, right-aligned, vertically centred.
 * @param ctx the card's context
 * @param tag the tag
 */
function drawInsta(ctx: CanvasRenderingContext2D, tag: InstaTag): void {
  const { name, right, middle, unit, ink } = tag;
  const glyph = unit * 3.4;
  const gap = unit * 1.1;
  ctx.save();
  ctx.font = labelFace(tag.font, 600)(unit * 3);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.fillText(name, right, middle);
  const x = right - ctx.measureText(name).width - gap - glyph;
  const y = middle - glyph / 2;
  ctx.strokeStyle = ink;
  ctx.lineWidth = glyph * 0.1;
  ctx.beginPath();
  ctx.roundRect(x, y, glyph, glyph, glyph * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + glyph / 2, y + glyph / 2, glyph * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + glyph * 0.76, y + glyph * 0.24, glyph * 0.055, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A circle text runs along. */
interface ArcPath {
  x: number;
  y: number;
  radius: number;
  /** The top arc (reading left to right), else the bottom arc (upright). */
  top: boolean;
}

/**
 * Letters centred on the top arc of a circle (reading left to right) or on its bottom arc (upright).
 * @param ctx the card's context, its font set
 * @param text the text
 * @param arc the circle and which arc
 */
function drawArcText(ctx: CanvasRenderingContext2D, text: string, arc: ArcPath): void {
  const { x: centreX, y: centreY, radius, top } = arc;
  const letters = Array.from(text);
  const widths = letters.map((letter) => ctx.measureText(letter).width);
  const span = widths.reduce((sum, width) => sum + width, 0) / radius;
  let angle = top ? -Math.PI / 2 - span / 2 : Math.PI / 2 + span / 2;
  letters.forEach((letter, index) => {
    const turn = (widths.at(index) ?? 0) / radius;
    const mid = top ? angle + turn / 2 : angle - turn / 2;
    ctx.save();
    ctx.translate(centreX + radius * Math.cos(mid), centreY + radius * Math.sin(mid));
    ctx.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2);
    ctx.fillText(letter, 0, 0);
    ctx.restore();
    angle = top ? angle + turn : angle - turn;
  });
}

/**
 * Badge magnet: the greeting on the top arc of the ring, the signature (or quote) on the bottom arc.
 * @param ctx the card's context
 * @param layout the front's layout (its `arc`)
 * @param theme the occasion's theme
 * @param design the design
 */
export function drawBadge(ctx: CanvasRenderingContext2D, layout: Layout, theme: Theme, design: Design): void {
  const ring = layout.arc;
  if (!ring) return;
  const headFamily = fontDef(design.headFont);
  const quoteFamily = fontDef(design.quoteFont);
  const mid = ring.r - ring.band / 2;
  const arcLength = mid * Math.PI * 0.86;
  ctx.save();
  // A soft ring under the lettering keeps it readable over the occasion artwork.
  ctx.fillStyle = hexA(theme.bg1, 0.62);
  ctx.beginPath();
  ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
  ctx.arc(ring.x, ring.y, ring.r - ring.band * 0.82, 0, Math.PI * 2, true);
  ctx.fill('evenodd');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = design.customColor ? design.color : theme.ink;
  const fit = (text: string, family: string, weight: number, maxWidth: number) =>
    shrinkFont(ctx, (px) => fontStr(family, weight, px), ring.band * 0.56 * design.textScale, () => ctx.measureText(text).width <= maxWidth, {
      factor: 0.93,
      minPx: 3,
    });
  const head = design.showHeading ? design.heading.trim() : '';
  const low = (design.showSig && design.sig.trim()) || (design.showQuote && design.quote.trim()) || '';
  if (head) {
    fit(head, headFamily.n, headFamily.hw, arcLength);
    drawArcText(ctx, head, { x: ring.x, y: ring.y, radius: mid, top: true });
  }
  if (low) {
    fit(low, quoteFamily.n, quoteFamily.bw, arcLength * 0.8);
    drawArcText(ctx, low, { x: ring.x, y: ring.y, radius: mid, top: false });
  }
  // two dots where the arcs meet
  ctx.fillStyle = theme.accent;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(ring.x + side * mid, ring.y, ring.band * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
