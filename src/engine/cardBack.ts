import { fontDef, fontStr } from '../data/fonts';
import { aiCreditOf, creditOf } from '../lib/credits';
import type { BackDesign, Box, Design, Rect, Theme } from '../types';
import { hexA, mix } from './color';
import { darkInk, resolveTheme } from './design';
import { labelFace, setLetterSpacing, shrinkFont, wrapLines } from './printText';
import { cardUnit, fillWithBleed } from './themeBackground';

/*
 * The backs of postcards (message, address, stamp box, PIN), of frame prints (a dedication label) and of fridge
 * magnets (the magnetic sheet), with the photo credit line. Calendars' backs are calendarDraw.ts's.
 */

/** Where a credit line goes. */
interface CreditPlace {
  /** The anchor, pixels. */
  x: number;
  /** The baseline, pixels. */
  y: number;
  maxWidth: number;
  align: CanvasTextAlign;
}

/**
 * The credit line's words: Pexels photographers and AI-generated pictures among the photos.
 * @param names the photos' file names
 * @returns the words, or '' when no photo needs a credit
 */
function creditText(names: string[]): string {
  const photographers = [...new Set(names.map((name) => creditOf(name)?.photographer).filter((name): name is string => !!name))];
  const generated = names.some((name) => !!aiCreditOf(name));
  const parts: string[] = [];
  if (photographers.length) parts.push(`Photo${photographers.length > 1 ? 's' : ''}: ${photographers.join(', ')} / Pexels`);
  if (generated) parts.push('AI-generated picture');
  return parts.join(' · ');
}

/**
 * The small photo credit line ("Photo: Name / Pexels"), when the back asks for it.
 * @param ctx the card's context
 * @param design the design
 * @param names the photos' file names
 * @param place where it goes
 * @param unit the card's drawing unit
 * @param ink the back's ink
 */
function drawCreditLine(ctx: CanvasRenderingContext2D, design: Design, names: string[], place: CreditPlace, unit: number, ink: string): void {
  if (!design.back.credit) return;
  const text = creditText(names);
  if (!text) return;
  ctx.save();
  ctx.fillStyle = hexA(ink, 0.6);
  ctx.textAlign = place.align;
  ctx.textBaseline = 'alphabetic';
  const face = labelFace(design.back.labelFont, 500);
  shrinkFont(ctx, face, unit * 2.2, () => ctx.measureText(text).width <= place.maxWidth, { factor: 0.92, minPx: unit });
  ctx.fillText(text, place.x, place.y);
  ctx.restore();
}

/** A postcard back's measures: its card, unit, padding, ink and the strip along the bottom. */
interface BackScene {
  box: Box;
  unit: number;
  pad: number;
  /** The back's dark ink. */
  deep: string;
  back: BackDesign;
}

/**
 * The airmail strip along the bottom: the theme's colour with accent diamonds.
 * @param ctx the card's context
 * @param scene the back
 * @param theme the occasion's theme
 * @param stripHeight the strip's height, pixels
 */
function drawAirmailStrip(ctx: CanvasRenderingContext2D, scene: BackScene, theme: Theme, stripHeight: number): void {
  const { box } = scene;
  ctx.fillStyle = theme.bg1;
  ctx.fillRect(box.x - box.e, box.y + box.h - stripHeight, box.w + 2 * box.e, stripHeight + box.e);
  ctx.fillStyle = theme.accent;
  for (let x = box.x + stripHeight; x < box.x + box.w; x += stripHeight * 2.2) {
    const y = box.y + box.h - stripHeight / 2;
    const half = stripHeight * 0.28;
    ctx.beginPath();
    ctx.moveTo(x, y - half);
    ctx.lineTo(x + half, y);
    ctx.lineTo(x, y + half);
    ctx.lineTo(x - half, y);
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * "POST CARD" in English and Hindi at the top left.
 * @param ctx the card's context
 * @param scene the back
 */
function drawPostCardLabel(ctx: CanvasRenderingContext2D, scene: BackScene): void {
  const { box, unit, pad, back } = scene;
  ctx.fillStyle = scene.deep;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = labelFace(back.labelFont, 600)(unit * 4);
  const y = box.y + pad + unit * 1.5;
  ctx.fillText('POST CARD', box.x + pad, y);
  const width = ctx.measureText('POST CARD').width;
  ctx.font = labelFace(back.labelFont, 500)(unit * 3.7);
  ctx.fillText('पोस्ट कार्ड', box.x + pad + width + unit * 2.5, y);
}

/**
 * Divides the back into the message and the address: side by side on a landscape card, one above the other on a
 * portrait one; draws the dividing line.
 * @param ctx the card's context
 * @param scene the back
 * @returns the message's and the address's areas
 */
function divideBack(ctx: CanvasRenderingContext2D, scene: BackScene): { message: Rect; address: Rect } {
  const { box, unit, pad } = scene;
  let message: Rect;
  let address: Rect;
  ctx.strokeStyle = hexA(scene.deep, 0.55);
  ctx.lineWidth = unit * 0.3;
  ctx.beginPath();
  if (box.w >= box.h) {
    const divider = box.x + box.w * 0.54;
    ctx.moveTo(divider, box.y + pad * 1.5);
    ctx.lineTo(divider, box.y + box.h - pad * 1.1);
    message = { x: box.x + pad, y: box.y + pad * 2, w: divider - box.x - pad * 1.6, h: box.h - pad * 3.2 };
    address = { x: divider + pad * 0.7, y: box.y + pad * 0.9, w: box.x + box.w - pad * 0.8 - (divider + pad * 0.7), h: box.h - pad * 2 };
  } else {
    const divider = box.y + box.h * 0.5;
    ctx.moveTo(box.x + pad, divider);
    ctx.lineTo(box.x + box.w - pad, divider);
    message = { x: box.x + pad, y: box.y + pad * 2, w: box.w - 2 * pad, h: divider - box.y - pad * 2.6 };
    address = { x: box.x + pad, y: divider + pad * 0.6, w: box.w - 2 * pad, h: box.y + box.h - pad * 1.1 - (divider + pad * 0.6) };
  }
  ctx.stroke();
  return { message, address };
}

/**
 * The message in the handwriting font, shrunk to fit above the "From" line; ruled lines when there is none.
 * @param ctx the card's context
 * @param scene the back
 * @param area the message's area
 * @param fromHeight the room the "From" line takes, pixels
 */
function drawMessage(ctx: CanvasRenderingContext2D, scene: BackScene, area: Rect, fromHeight: number): void {
  const { back, unit, deep } = scene;
  if (!back.message.trim()) {
    ctx.strokeStyle = hexA(deep, 0.18);
    ctx.lineWidth = unit * 0.2;
    for (let y = area.y + unit * 8; y < area.y + area.h - fromHeight; y += unit * 8) {
      ctx.beginPath();
      ctx.moveTo(area.x, y);
      ctx.lineTo(area.x + area.w, y);
      ctx.stroke();
    }
    return;
  }
  const hand = fontDef(back.font);
  let lines: string[] = [];
  const fits = (px: number) => {
    lines = wrapLines(ctx, back.message, area.w);
    return lines.length * px * 1.45 <= area.h - fromHeight;
  };
  const px = shrinkFont(ctx, (size) => fontStr(hand.n, hand.bw, size), unit * 5.2, fits, { factor: 0.93, maxSteps: 40 });
  ctx.fillStyle = deep;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((line, index) => {
    ctx.fillText(line, area.x, area.y + px * 1.45 * (index + 0.5));
  });
}

/**
 * The dashed box where the stamp goes.
 * @param ctx the card's context
 * @param scene the back
 * @param stampBox the box
 */
function drawStampBox(ctx: CanvasRenderingContext2D, scene: BackScene, stampBox: Rect): void {
  const { unit, deep } = scene;
  ctx.save();
  ctx.setLineDash([unit, unit * 0.8]);
  ctx.strokeStyle = hexA(deep, 0.6);
  ctx.lineWidth = unit * 0.3;
  ctx.strokeRect(stampBox.x, stampBox.y, stampBox.w, stampBox.h);
  ctx.restore();
  ctx.fillStyle = hexA(deep, 0.5);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = labelFace(scene.back.labelFont, 500)(unit * 2.5);
  ctx.fillText('Stamp', stampBox.x + stampBox.w / 2, stampBox.y + stampBox.h / 2);
}

/** Address lines on a postcard's back. */
const ADDRESS_LINES = 4;

/**
 * "To", then the ruled address lines with the name and address written on them (each shrunk to fit its line).
 * @param ctx the card's context
 * @param scene the back
 * @param address the address's area
 * @param range the first line's top and the last line's bottom, pixels
 */
function drawAddress(ctx: CanvasRenderingContext2D, scene: BackScene, address: Rect, range: { top: number; bottom: number }): void {
  const { back, unit } = scene;
  const addressFamily = fontDef(back.addrFont || back.font);
  const gap = (range.bottom - range.top) / ADDRESS_LINES;
  ctx.fillStyle = scene.deep;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = labelFace(back.labelFont, 600)(unit * 3);
  ctx.fillText('To', address.x, range.top - unit * 0.5);
  const written = [back.to, ...back.address.split('\n')]
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, ADDRESS_LINES);
  ctx.strokeStyle = hexA(scene.deep, 0.45);
  ctx.lineWidth = unit * 0.22;
  for (let index = 0; index < ADDRESS_LINES; index++) {
    const y = range.top + gap * (index + 1);
    ctx.beginPath();
    ctx.moveTo(address.x, y);
    ctx.lineTo(address.x + address.w, y);
    ctx.stroke();
    const line = written.at(index);
    if (line) {
      const face = (px: number) => fontStr(addressFamily.n, addressFamily.bw, px);
      shrinkFont(ctx, face, Math.min(gap * 0.6, unit * 4.6), () => ctx.measureText(line).width <= address.w, { factor: 0.93, minPx: unit });
      ctx.fillText(line, address.x + unit, y - unit * 0.9);
    }
  }
}

/**
 * "PIN" and six boxes with the PIN code's digits.
 * @param ctx the card's context
 * @param scene the back
 * @param left the label's left edge, pixels
 * @param top the boxes' top, pixels
 * @param boxSize the boxes' size, pixels
 */
function drawPinBoxes(ctx: CanvasRenderingContext2D, scene: BackScene, left: number, top: number, boxSize: number): void {
  const { back, unit } = scene;
  const addressFamily = fontDef(back.addrFont || back.font);
  ctx.font = labelFace(back.labelFont, 600)(unit * 2.8);
  ctx.fillText('PIN', left, top + boxSize * 0.72);
  const boxesLeft = left + ctx.measureText('PIN').width + unit * 2;
  const digits = back.pin.replace(/\D/g, '').slice(0, 6);
  ctx.strokeStyle = hexA(scene.deep, 0.6);
  ctx.lineWidth = unit * 0.25;
  for (let index = 0; index < 6; index++) {
    const x = boxesLeft + index * (boxSize + unit * 0.8);
    ctx.strokeRect(x, top, boxSize, boxSize);
    const digit = digits.charAt(index);
    if (digit) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = fontStr(addressFamily.n, addressFamily.bw, boxSize * 0.72);
      ctx.fillText(digit, x + boxSize / 2, top + boxSize * 0.55);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
}

/**
 * The back of a postcard: the airmail strip, "POST CARD", the message and "From" on one side, the stamp box, the
 * address and the PIN on the other, and the photo credit.
 * @param ctx the card's context
 * @param box the card
 * @param design the design
 * @param names the photos' file names (for the credit line)
 */
export function drawBack(ctx: CanvasRenderingContext2D, box: Box, design: Design, names: string[] = []): void {
  const theme = resolveTheme(design);
  const unit = cardUnit(box);
  const back = design.back;
  const scene: BackScene = { box, unit, pad: unit * 7, deep: darkInk(theme), back };
  ctx.fillStyle = back.tint ? mix('#FFFFFF', theme.bg1, 0.09) : '#FFFFFF';
  fillWithBleed(ctx, box);
  const stripHeight = unit * 2.4;
  drawAirmailStrip(ctx, scene, theme, stripHeight);
  if (back.label) drawPostCardLabel(ctx, scene);
  const { message, address } = divideBack(ctx, scene);
  const fromHeight = back.from.trim() ? unit * 5 : 0;
  drawMessage(ctx, scene, message, fromHeight);
  if (fromHeight) {
    const fromFamily = fontDef(back.fromFont || back.font);
    ctx.fillStyle = scene.deep;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = fontStr(fromFamily.n, fromFamily.bw, unit * 3.8);
    ctx.fillText('— ' + back.from.trim(), message.x, message.y + message.h);
  }
  const stampBox = { x: address.x + address.w - unit * 16, y: address.y, w: unit * 16, h: unit * 19 };
  if (back.stamp) drawStampBox(ctx, scene, stampBox);
  const pinHeight = unit * 5.5;
  const top = stampBox.y + stampBox.h + unit * 3.5;
  drawAddress(ctx, scene, address, { top, bottom: address.y + address.h - pinHeight - unit * 3 });
  const credit = { x: box.x + box.w - scene.pad, y: box.y + box.h - stripHeight - unit * 1.6, maxWidth: box.w * 0.5, align: 'right' as const };
  drawCreditLine(ctx, design, names, credit, unit, scene.deep);
  drawPinBoxes(ctx, scene, address.x, address.y + address.h - pinHeight, pinHeight);
}

/**
 * The frame back's dedication: the title, the message (ruled lines when empty) and the "From" line and date.
 * @param ctx the card's context
 * @param design the design
 * @param inner the label's inner area
 * @param unit the card's drawing unit
 * @param deep the back's ink
 */
function drawDedication(ctx: CanvasRenderingContext2D, design: Design, inner: Rect, unit: number, deep: string): void {
  const back = design.back;
  const centreX = inner.x + inner.w / 2;
  const foot = unit * 8;
  ctx.fillStyle = deep;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = inner.y;
  const title = design.designName.trim() || (design.showHeading ? design.heading.trim() : '');
  if (title) {
    const headFamily = fontDef(design.headFont);
    const face = (px: number) => fontStr(headFamily.n, headFamily.hw, px);
    const px = shrinkFont(ctx, face, unit * 6, () => ctx.measureText(title).width <= inner.w, { factor: 0.92, minPx: unit * 2 });
    ctx.fillText(title, centreX, y + px * 0.55);
    y += px * 1.5;
  }
  if (back.message.trim()) {
    const hand = fontDef(back.font);
    const room = inner.y + inner.h - foot - y;
    let lines: string[] = [];
    const fits = (px: number) => {
      lines = wrapLines(ctx, back.message, inner.w);
      return lines.length * px * 1.4 <= room;
    };
    const px = shrinkFont(ctx, (size) => fontStr(hand.n, hand.bw, size), unit * 5, fits, { factor: 0.92, maxSteps: 30 });
    lines.forEach((line, index) => {
      ctx.fillText(line, centreX, y + px * 1.4 * (index + 0.5));
    });
  } else {
    ctx.strokeStyle = hexA(deep, 0.2);
    ctx.lineWidth = unit * 0.2;
    for (let ruleY = y + unit * 7; ruleY < inner.y + inner.h - foot; ruleY += unit * 7) {
      ctx.beginPath();
      ctx.moveTo(inner.x, ruleY);
      ctx.lineTo(inner.x + inner.w, ruleY);
      ctx.stroke();
    }
  }
  const baseline = inner.y + inner.h - unit * 2;
  const fromFamily = fontDef(back.fromFont || back.font);
  ctx.textAlign = 'left';
  ctx.font = fontStr(fromFamily.n, fromFamily.bw, unit * 3.8);
  ctx.fillText(`— ${back.from.trim()}`, inner.x, baseline);
  ctx.textAlign = 'right';
  ctx.font = labelFace(back.labelFont, 500)(unit * 2.8);
  const date = back.date.trim() || new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(date, inner.x + inner.w, baseline);
}

/**
 * The back of a frame print: a dedication label with title, message, from and date (ruled lines when empty).
 * @param ctx the card's context
 * @param box the card
 * @param design the design
 * @param names the photos' file names (for the credit line)
 */
export function drawFrameBack(ctx: CanvasRenderingContext2D, box: Box, design: Design, names: string[] = []): void {
  const theme = resolveTheme(design);
  const unit = cardUnit(box);
  const deep = darkInk(theme);
  ctx.fillStyle = design.back.tint ? mix('#FFFFFF', theme.bg1, 0.07) : '#FFFFFF';
  fillWithBleed(ctx, box);
  const labelWidth = Math.min(box.w * 0.72, unit * 82);
  const labelHeight = Math.min(box.h * 0.5, labelWidth * 0.72);
  const labelX = box.x + (box.w - labelWidth) / 2;
  const labelY = box.y + (box.h - labelHeight) / 2;
  ctx.strokeStyle = hexA(theme.accent, 0.7);
  ctx.lineWidth = unit * 0.35;
  ctx.strokeRect(labelX, labelY, labelWidth, labelHeight);
  ctx.lineWidth = unit * 0.15;
  ctx.strokeRect(labelX + unit * 1.2, labelY + unit * 1.2, labelWidth - unit * 2.4, labelHeight - unit * 2.4);
  const inner: Rect = { x: labelX + unit * 5, y: labelY + unit * 5, w: labelWidth - unit * 10, h: labelHeight - unit * 10 };
  drawDedication(ctx, design, inner, unit, deep);
  const credit = { x: labelX + labelWidth / 2, y: labelY + labelHeight + unit * 4, maxWidth: labelWidth, align: 'center' as const };
  drawCreditLine(ctx, design, names, credit, unit, deep);
}

/**
 * The back of a fridge magnet: the magnetic sheet it is mounted on.
 * @param ctx the card's context
 * @param box the card
 */
export function drawMagnetBack(ctx: CanvasRenderingContext2D, box: Box): void {
  const bleed = box.e;
  const unit = cardUnit(box);
  ctx.fillStyle = '#2E2C2B';
  fillWithBleed(ctx, box);
  ctx.strokeStyle = 'rgba(255,255,255,.035)';
  ctx.lineWidth = unit * 0.6;
  for (let y = box.y - bleed; y < box.y + box.h + bleed; y += unit * 1.8) {
    ctx.beginPath();
    ctx.moveTo(box.x - bleed, y);
    ctx.lineTo(box.x + box.w + bleed, y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${String(unit * 5)}px "Hind",sans-serif`;
  setLetterSpacing(ctx, `${String(unit * 0.8)}px`);
  ctx.fillText('MAGNET', box.x + box.w / 2, box.y + box.h / 2);
  setLetterSpacing(ctx, '0px');
}
