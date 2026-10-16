import { fontDef, fontStr } from '../data/fonts';
import type { Design, Photo, Rect, RenderInput, Theme } from '../types';
import { hexA, lum, mix, rng } from './color';
import { darkInk, postmarkYear, resolveTheme } from './design';
import { bottomPath, envelopeSpec, flapPath, geoOf, paperOf, sealAt, sidePath, type EnvelopeSpec, type Geo } from './envelope';
import { drawThemeBg } from './themeBackground';

/*
 * Drawing the envelope's faces: the front (address side) and back (flap side) at envelope size, to print on a
 * ready-made envelope, and the separate body, flap and liner layers for the 3D view, where the flap opens and the card
 * slides out. Artwork follows the design's occasion, fonts, words and photo.
 */

/** A face of the envelope: the two printed sides, or a layer for the 3D view. */
export type EnvelopeFace = 'front' | 'back' | 'body' | 'flap' | 'liner';

/** What drawing a face needs: the canvas, its size, the design and the inks. */
interface FaceStyle {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  input: RenderInput;
  design: Design;
  theme: Theme;
  /** A hundredth of the envelope's height. */
  unit: number;
  ink: string;
}

/**
 * Draws a photo to cover a rect, at its zoom and position.
 * @param context the canvas
 * @param photo the photo
 * @param area the rect
 */
function cover(context: CanvasRenderingContext2D, photo: Photo, area: Rect): void {
  const scale = Math.max(area.w / photo.sw, area.h / photo.sh) * photo.zoom;
  const drawWidth = photo.sw * scale;
  const drawHeight = photo.sh * scale;
  context.drawImage(photo.src, area.x - ((drawWidth - area.w) * (photo.px + 1)) / 2, area.y - ((drawHeight - area.h) * (photo.py + 1)) / 2, drawWidth, drawHeight);
}

/**
 * Sets the canvas font to a size at which a text fits, shrinking it step by step.
 * @param context the canvas
 * @param text the text
 * @param start the size to start at, px
 * @param maxWidth the width it must fit in, px
 * @param minSize the size below which it stops shrinking, px
 * @param font the font at a size
 */
function shrinkToFit(context: CanvasRenderingContext2D, text: string, start: number, maxWidth: number, minSize: number, font: (size: number) => string): void {
  let size = start;
  context.font = font(size);
  while (context.measureText(text).width > maxWidth && size > minSize) {
    size *= 0.93;
    context.font = font(size);
  }
}

/**
 * Draws a wax-seal style disc: a scalloped accent edge, then the card's photo or a monogram.
 * @param style the face
 * @param seal where and how big
 * @param seal.x the centre's x
 * @param seal.y the centre's y
 * @param seal.r the radius
 */
function drawSeal({ context, input, design, theme }: FaceStyle, { x, y, r: radius }: { x: number; y: number; r: number }): void {
  context.save();
  context.shadowColor = 'rgba(0,0,0,.28)';
  context.shadowBlur = radius * 0.25;
  context.shadowOffsetY = radius * 0.06;
  context.fillStyle = theme.accent;
  context.beginPath();
  for (let step = 0; step <= 48; step++) {
    const angle = (step / 48) * Math.PI * 2;
    const scallop = radius * (step % 2 ? 0.94 : 1);
    context.lineTo(x + Math.cos(angle) * scallop, y + Math.sin(angle) * scallop);
  }
  context.fill();
  context.restore();
  const inner = radius * 0.78;
  const photo = design.env.photo ? input.photos.at(0) : undefined;
  context.save();
  context.beginPath();
  context.arc(x, y, inner, 0, Math.PI * 2);
  if (photo) {
    context.clip();
    cover(context, photo, { x: x - inner, y: y - inner, w: inner * 2, h: inner * 2 });
    context.restore();
    context.save();
    context.strokeStyle = mix('#FFFFFF', theme.accent, 0.35);
    context.lineWidth = radius * 0.06;
    context.beginPath();
    context.arc(x, y, inner, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.strokeStyle = hexA('#FFFFFF', 0.55);
    context.lineWidth = radius * 0.04;
    context.stroke();
    const initial = (design.back.from.trim() || design.heading.trim() || 'C').charAt(0).toUpperCase();
    const font = fontDef(design.headFont);
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = fontStr(font.n, font.hw, inner * 1.1);
    context.fillText(initial, x, y + inner * 0.06);
  }
  context.restore();
}

/* ---------- Chitthi mark ---------- */

/**
 * Draws the Chitthi logo as a postmark-style stamp: two rings, the name around them and चिट्ठी in the middle.
 * @param context the canvas
 * @param x the centre's x
 * @param y the centre's y
 * @param radius the outer ring's radius
 * @param color the ink
 */
export function drawChitthiMark(context: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = radius * 0.07;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = radius * 0.035;
  context.beginPath();
  context.arc(x, y, radius * 0.6, 0, Math.PI * 2);
  context.stroke();
  // Name around the ring, spread evenly over the whole circle.
  context.font = `600 ${radius * 0.19}px "Hind",sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const glyphs = Array.from('CHITTHI ✦ PRINT STUDIO ✦ ', (glyph) => ({ glyph, width: context.measureText(glyph).width }));
  const total = glyphs.reduce((sum, { width }) => sum + width, 0);
  let before = 0;
  for (const { glyph, width } of glyphs) {
    const angle = -Math.PI / 2 + ((before + width / 2) / total) * Math.PI * 2;
    before += width;
    context.save();
    context.translate(x + Math.cos(angle) * radius * 0.8, y + Math.sin(angle) * radius * 0.8);
    context.rotate(angle + Math.PI / 2);
    context.fillText(glyph, 0, 0);
    context.restore();
  }
  context.font = fontStr('Rozha One', 400, radius * 0.34);
  context.fillText('चिट्ठी', x, y + radius * 0.04);
  context.restore();
}

/* ---------- faces ---------- */

/**
 * Draws one face of the envelope (no bleed: ready-made envelopes print to a margin).
 * @param canvas the canvas, sized here
 * @param face the face
 * @param pxPerMm the resolution, px per mm
 * @param input the design and its photos
 * @returns the envelope
 */
export function renderEnvelope(canvas: HTMLCanvasElement, face: EnvelopeFace, pxPerMm: number, input: RenderInput): EnvelopeSpec {
  const spec = envelopeSpec(input.d);
  const width = Math.round(spec.w * pxPerMm);
  const height = Math.round(spec.h * pxPerMm);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return spec;
  context.clearRect(0, 0, width, height);
  const theme = resolveTheme(input.d);
  const style: FaceStyle = { context, width, height, input, design: input.d, theme, unit: height / 100, ink: darkInk(theme) };
  if (face === 'front') drawFront(style);
  else drawBackFace(style, face, geoOf(spec), pxPerMm);
  return spec;
}

/**
 * Draws a faint paper grain so flat colour reads as stationery.
 * @param style the face
 * @param seed the grain's random seed
 */
function grain({ context, width, height, ink }: FaceStyle, seed: string): void {
  const random = rng(seed);
  const count = Math.round((width * height) / 900);
  context.fillStyle = hexA(ink, 0.035);
  for (let speck = 0; speck < count; speck++) context.fillRect(random() * width, random() * height, 1 + random(), 1 + random());
}

/**
 * The accent, darkened towards the ink when it is too light to read on paper.
 * @param theme the theme
 * @param ink the ink
 * @returns a colour
 */
const accentInk = (theme: Theme, ink: string): string => (lum(theme.accent) > 0.3 ? mix(theme.accent, ink, 0.45) : theme.accent);

/**
 * A short postmark word for the occasion.
 * @param theme the theme
 * @returns e.g. "DIWALI", "BIRTHDAY", "CHITTHI"
 */
function postmarkWord(theme: Theme): string {
  if (theme.g === 'Birthdays') return 'BIRTHDAY';
  if (!theme.g) return 'CHITTHI';
  return (theme.name.split(/[ &’']/).at(0) ?? '').toUpperCase().slice(0, 9);
}

/**
 * Sets the canvas's letter spacing, where the browser has it.
 * @param context the canvas
 * @param spacing e.g. "2px"
 */
function letterSpacing(context: CanvasRenderingContext2D, spacing: string): void {
  if ('letterSpacing' in context) context.letterSpacing = spacing;
}

/**
 * The front's ornamental border along the bottom edge, under a double rule.
 * @param style the face
 * @param borderHeight the border's height, px
 */
function frontBorder({ context, width, height, design, theme, unit }: FaceStyle, borderHeight: number): void {
  context.save();
  context.beginPath();
  context.rect(0, height - borderHeight, width, borderHeight);
  context.clip();
  if (design.env.art) drawThemeBg(context, { x: 0, y: height - borderHeight, w: width, h: borderHeight, e: 0 }, theme, true);
  else {
    context.fillStyle = theme.accent;
    context.fillRect(0, height - borderHeight, width, borderHeight);
  }
  context.restore();
  context.fillStyle = theme.accent;
  context.fillRect(0, height - borderHeight - unit * 1.4, width, unit * 0.5);
  context.fillRect(0, height - borderHeight - unit * 0.5, width, unit * 0.25);
}

/**
 * The sender, top left.
 * @param style the face
 * @param margin the front's margin, px
 */
function frontSender({ context, width, design, unit, ink }: FaceStyle, margin: number): void {
  const hand = fontDef(design.back.font);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = hexA(ink, 0.6);
  context.font = `600 ${unit * 3}px "Hind",sans-serif`;
  letterSpacing(context, `${unit * 0.5}px`);
  context.fillText('FROM', margin, margin + unit * 2);
  letterSpacing(context, '0px');
  context.fillStyle = ink;
  const lines = [design.back.from, ...design.env.sender.split('\n')]
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  lines.forEach((line, index) => {
    context.font = fontStr(hand.n, hand.bw, index ? unit * 4.4 : unit * 5.4);
    context.fillText(line, margin, margin + unit * 9 + index * unit * 5.8, width * 0.36);
  });
}

/**
 * The stamp frame with perforations, top right.
 * @param style the face
 * @param stamp where it goes
 */
function frontStamp({ context, unit, ink }: FaceStyle, stamp: Rect): void {
  context.fillStyle = hexA(ink, 0.035);
  context.fillRect(stamp.x, stamp.y, stamp.w, stamp.h);
  context.save();
  context.strokeStyle = hexA(ink, 0.4);
  context.lineWidth = unit * 0.5;
  context.lineCap = 'round';
  context.setLineDash([0.01, unit * 1.5]);
  context.strokeRect(stamp.x, stamp.y, stamp.w, stamp.h);
  context.restore();
  context.fillStyle = hexA(ink, 0.45);
  context.textAlign = 'center';
  context.font = `600 ${unit * 2.4}px "Hind",sans-serif`;
  letterSpacing(context, `${unit * 0.35}px`);
  ['PLACE', 'STAMP', 'HERE'].forEach((word, index) => {
    context.fillText(word, stamp.x + stamp.w / 2, stamp.y + stamp.h / 2 + (index - 1) * unit * 3.4 + unit);
  });
  letterSpacing(context, '0px');
}

/**
 * A decorative postmark beside the stamp: two rings, wavy cancellation lines, the occasion and the year.
 * @param style the face
 * @param stamp the stamp's frame
 * @param accent the accent ink
 */
function frontPostmark({ context, input, theme, unit }: FaceStyle, stamp: Rect, accent: string): void {
  const radius = stamp.h * 0.36;
  const centreX = stamp.x - radius * 0.55;
  const centreY = stamp.y + stamp.h * 0.62;
  context.save();
  context.strokeStyle = hexA(accent, 0.6);
  context.fillStyle = hexA(accent, 0.7);
  context.lineWidth = unit * 0.4;
  context.beginPath();
  context.arc(centreX, centreY, radius, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = unit * 0.22;
  context.beginPath();
  context.arc(centreX, centreY, radius * 0.78, 0, Math.PI * 2);
  context.stroke();
  for (let line = -1; line <= 1; line++) {
    context.beginPath();
    for (let x = 0; x <= radius * 2.2; x += unit * 0.5) context.lineTo(centreX - radius - unit - x, centreY + line * radius * 0.34 + Math.sin(x / (unit * 1.8)) * unit * 0.7);
    context.stroke();
  }
  context.font = `600 ${radius * 0.24}px "Hind",sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(postmarkWord(theme), centreX, centreY - radius * 0.18);
  context.fillText(String(postmarkYear(input.d)), centreX, centreY + radius * 0.2);
  context.restore();
}

/** Where the recipient's address goes on the front, px. */
interface AddressArea {
  x: number;
  width: number;
  /** The "To" line's baseline. */
  top: number;
  /** The space between ruled lines. */
  lineGap: number;
  pinTop: number;
  pinSize: number;
}

/** Ruled lines for the address. */
const ADDRESS_ROWS = 4;

/**
 * The recipient: "To" in the greeting font, then ruled lines with the address written on them.
 * @param style the face
 * @param area where the address goes
 * @param accent the accent ink
 */
function frontAddress({ context, design, unit, ink }: FaceStyle, area: AddressArea, accent: string): void {
  const head = fontDef(design.headFont);
  const hand = fontDef(design.back.font);
  const lines = [design.back.to, ...design.back.address.split('\n')]
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillStyle = accent;
  context.font = fontStr(head.n, head.hw, unit * 7);
  context.fillText('To', area.x, area.top);
  context.strokeStyle = hexA(ink, 0.28);
  context.lineWidth = unit * 0.22;
  context.fillStyle = ink;
  for (let row = 0; row < ADDRESS_ROWS; row++) {
    const y = area.top + area.lineGap * (row + 1);
    context.beginPath();
    context.moveTo(area.x, y);
    context.lineTo(area.x + area.width, y);
    context.stroke();
    const line = lines.at(row);
    if (line) {
      shrinkToFit(context, line, Math.min(area.lineGap * 0.66, unit * 6.4), area.width - unit, unit, (size) => fontStr(hand.n, hand.bw, size));
      context.fillText(line, area.x + unit, y - unit * 1.1);
    }
  }
}

/**
 * The PIN code: a label and six boxes, filled with the design's digits.
 * @param style the face
 * @param area where the address goes
 */
function frontPin({ context, design, unit, ink }: FaceStyle, area: AddressArea): void {
  const hand = fontDef(design.back.font);
  const pin = design.back.pin.replace(/\D/g, '').slice(0, 6);
  const size = area.pinSize;
  context.fillStyle = hexA(ink, 0.6);
  context.font = `600 ${unit * 2.8}px "Hind",sans-serif`;
  context.fillText('PIN', area.x, area.pinTop + size * 0.68);
  const boxesX = area.x + context.measureText('PIN').width + unit * 2.5;
  context.strokeStyle = hexA(ink, 0.45);
  context.lineWidth = unit * 0.25;
  context.fillStyle = ink;
  for (let box = 0; box < 6; box++) {
    const x = boxesX + box * (size + unit * 0.8);
    context.strokeRect(x, area.pinTop, size, size);
    const digit = pin.charAt(box);
    if (digit) {
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = fontStr(hand.n, hand.bw, size * 0.72);
      context.fillText(digit, x + size / 2, area.pinTop + size * 0.55);
      context.textAlign = 'left';
      context.textBaseline = 'alphabetic';
    }
  }
}

/**
 * The design's greeting, bottom left above the border: ties the envelope to the card inside.
 * @param style the face
 * @param maxWidth the room it has, px
 * @param baseline its baseline, px
 * @param accent the accent ink
 */
function frontGreeting({ context, design, unit }: FaceStyle, maxWidth: number, baseline: number, accent: string): void {
  const greeting = design.showHeading ? design.heading.trim() : '';
  if (!greeting) return;
  const head = fontDef(design.headFont);
  shrinkToFit(context, greeting, unit * 8, maxWidth, unit * 2, (size) => fontStr(head.n, head.hw, size));
  context.fillStyle = accent;
  context.textAlign = 'left';
  context.fillText(greeting, unit * 8, baseline);
}

/**
 * Draws the envelope's front: paper, border, sender, stamp and postmark, the address and the greeting.
 * @param style the face
 */
function drawFront(style: FaceStyle): void {
  const { context, width, height, design, theme, unit, ink } = style;
  const margin = unit * 8;
  const accent = accentInk(theme, ink);
  context.fillStyle = paperOf(design, theme);
  context.fillRect(0, 0, width, height);
  grain(style, `front${design.themeId}`);
  const borderHeight = unit * 9;
  frontBorder(style, borderHeight);
  frontSender(style, margin);
  const stampWidth = Math.min(width * 0.15, unit * 24);
  const stamp = { x: width - margin - stampWidth, y: margin, w: stampWidth, h: stampWidth * 1.22 };
  frontStamp(style, stamp);
  frontPostmark(style, stamp, accent);
  const addressX = width * 0.42;
  const pinSize = unit * 6.6;
  const top = height * 0.4;
  const bottomY = height - borderHeight - unit * 5;
  const area: AddressArea = { x: addressX, width: width - margin - addressX, top, lineGap: (bottomY - pinSize - unit * 3 - top) / ADDRESS_ROWS, pinTop: bottomY - pinSize, pinSize };
  frontAddress(style, area, accent);
  frontPin(style, area);
  frontGreeting(style, addressX - margin - unit * 6, height - borderHeight - unit * 5.5, accent);
}

/**
 * The inside of the flap: the occasion pattern, seen when the flap opens.
 * @param style the face
 */
function drawLiner({ context, width, height, design, theme }: FaceStyle): void {
  context.save();
  flapPath(context, design, 0, 0, width, height);
  context.clip();
  drawThemeBg(context, { x: 0, y: 0, w: width, h: height, e: 0 }, theme, true);
  context.fillStyle = hexA('#FFFFFF', 0.18);
  context.fillRect(0, 0, width, height);
  context.restore();
}

/**
 * Draws a flap: filled with a soft shadow, then outlined with a crisp edge.
 * @param style the face
 * @param trace traces the flap's path
 * @param shadowY the shadow's offset, px
 * @param paper the paper colour
 */
function flapPanel({ context, unit, ink }: FaceStyle, trace: () => void, shadowY: number, paper: string): void {
  context.save();
  context.shadowColor = 'rgba(0,0,0,.16)';
  context.shadowBlur = unit * 2.2;
  context.shadowOffsetY = shadowY;
  trace();
  context.fillStyle = paper;
  context.fill();
  context.restore();
  trace();
  context.strokeStyle = hexA(ink, 0.12);
  context.lineWidth = unit * 0.3;
  context.stroke();
}

/**
 * The Chitthi mark, the product stamp, bottom centre of every envelope, with "Made with Chitthi" under it.
 * @param style the face
 */
function bodyMark({ context, width, height, unit, ink }: FaceStyle): void {
  const radius = height * 0.075;
  drawChitthiMark(context, width / 2, height - height * 0.19, radius, hexA(ink, 0.5));
  context.fillStyle = hexA(ink, 0.45);
  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  context.font = `600 ${unit * 2.2}px "Hind",sans-serif`;
  letterSpacing(context, `${unit * 0.4}px`);
  context.fillText('MADE WITH CHITTHI', width / 2, height - height * 0.19 + radius + unit * 4);
  letterSpacing(context, '0px');
}

/**
 * The back's body: the inside of the front panel seen between the flaps, the side flaps, then the bottom flap over
 * them with the Chitthi mark.
 * @param style the face
 * @param side the side flaps' width, px
 * @param bottom the bottom flap's depth, px
 * @param paper the paper colour
 */
function drawBody(style: FaceStyle, side: number, bottom: number, paper: string): void {
  const { context, width, height, design, unit } = style;
  context.fillStyle = mix(paper, '#000000', 0.05);
  context.fillRect(0, 0, width, height);
  flapPanel(style, () => sidePath(context, width, height, side, false), 0, paper);
  flapPanel(style, () => sidePath(context, width, height, side, true), 0, paper);
  context.save();
  bottomPath(context, width, height, bottom);
  context.clip();
  grain(style, `back${design.themeId}`);
  context.restore();
  flapPanel(style, () => bottomPath(context, width, height, bottom), -unit * 0.6, paper);
  context.save();
  bottomPath(context, width, height, bottom);
  context.clip();
  grain(style, `back${design.themeId}`);
  bodyMark(style);
  context.restore();
}

/**
 * The closing flap, with a soft shadow on the back, its artwork and a fine accent line, and the seal at its tip.
 * @param style the face
 * @param paper the paper colour
 */
function drawClosingFlap(style: FaceStyle, paper: string): void {
  const { context, width, height, design, theme, unit } = style;
  context.save();
  context.shadowColor = 'rgba(0,0,0,.22)';
  context.shadowBlur = unit * 2.4;
  context.shadowOffsetY = unit * 0.8;
  flapPath(context, design, 0, 0, width, height);
  context.fillStyle = paper;
  context.fill();
  context.restore();
  context.save();
  flapPath(context, design, 0, 0, width, height);
  context.clip();
  if (design.env.art || design.env.paper === 'occasion') drawThemeBg(context, { x: 0, y: 0, w: width, h: height, e: 0 }, theme, design.env.art);
  else {
    context.fillStyle = mix(paper, '#000000', 0.06);
    context.fillRect(0, 0, width, height);
  }
  // A fine accent line just inside the edge.
  context.strokeStyle = hexA(theme.accent, 0.75);
  context.lineWidth = unit * 1.2;
  flapPath(context, design, 0, 0, width, height);
  context.stroke();
  context.restore();
  drawSeal(style, sealAt(design, width, height));
}

/**
 * Draws the back or one of its 3D layers: the liner alone; the body (no closing flap); the flap alone; or the whole
 * back (body and flap).
 * @param style the face
 * @param face which
 * @param geo the side and bottom flaps, mm
 * @param pxPerMm the resolution
 */
function drawBackFace(style: FaceStyle, face: Exclude<EnvelopeFace, 'front'>, geo: Geo, pxPerMm: number): void {
  if (face === 'liner') {
    drawLiner(style);
    return;
  }
  const paper = paperOf(style.design, style.theme);
  if (face !== 'flap') drawBody(style, geo.side * pxPerMm, geo.bottom * pxPerMm, paper);
  if (face === 'body') return;
  drawClosingFlap(style, paper);
}
