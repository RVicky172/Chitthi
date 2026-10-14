import type { Box } from '../types';

/*
 * Colour helpers and the small drawing pieces the occasion artwork is made of (engine/patterns.ts): hex colours, a
 * seeded random generator (the same artwork in the preview and in print), stars, glows, marigolds and leaves.
 */

/**
 * A colour as six-digit hex.
 * @param hex "#rrggbb" or "#rgb"
 * @returns "#rrggbb", or mid grey for anything else
 */
export function toHex(hex: string): string {
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return (
      '#' +
      hex
        .slice(1)
        .split('')
        .map((digit) => digit + digit)
        .join('')
    );
  }
  return '#888888';
}

/**
 * A hex colour with an opacity.
 * @param hex the colour
 * @param alpha 0–1
 * @returns a CSS rgba() colour
 */
export function hexA(hex: string, alpha: number): string {
  const value = parseInt(toHex(hex).slice(1), 16);
  return `rgba(${String((value >> 16) & 255)},${String((value >> 8) & 255)},${String(value & 255)},${String(alpha)})`;
}

/**
 * A colour between two.
 * @param from the first colour
 * @param to the second
 * @param amount 0 (the first) – 1 (the second)
 * @returns "#rrggbb"
 */
export function mix(from: string, to: string, amount: number): string {
  const first = parseInt(toHex(from).slice(1), 16);
  const second = parseInt(toHex(to).slice(1), 16);
  const channel = (shift: number) => Math.round(((first >> shift) & 255) * (1 - amount) + ((second >> shift) & 255) * amount);
  return '#' + [channel(16), channel(8), channel(0)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * A colour's lightness (Rec. 601 weights).
 * @param hex the colour
 * @returns 0 (black) – 1 (white)
 */
export function lum(hex: string): number {
  const value = parseInt(toHex(hex).slice(1), 16);
  return (((value >> 16) & 255) * 0.299 + ((value >> 8) & 255) * 0.587 + (value & 255) * 0.114) / 255;
}

/**
 * A deterministic random generator (mulberry32), so artwork looks identical in preview and print.
 * @param seed any text
 * @returns a function giving numbers in [0, 1)
 */
export function rng(seed: string): () => number {
  let state = 0;
  for (const letter of seed) state = (state * 31 + letter.charCodeAt(0)) | 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fills a star.
 * @param ctx the context, its fill set
 * @param x the centre, pixels
 * @param y the centre, pixels
 * @param radius the points' radius, pixels
 * @param points how many points
 * @param inner the inner corners' radius, a share of `radius`
 */
export function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, points = 5, inner = 0.45): void {
  ctx.beginPath();
  for (let corner = 0; corner < points * 2; corner++) {
    const reach = corner % 2 ? radius * inner : radius;
    const angle = -Math.PI / 2 + (corner * Math.PI) / points;
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Fills a soft glow: a colour fading out from the centre.
 * @param ctx the context
 * @param x the centre, pixels
 * @param y the centre, pixels
 * @param radius pixels
 * @param hex the colour
 * @param alpha its opacity at the centre
 */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, hex: string, alpha: number): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, hexA(hex, alpha));
  gradient.addColorStop(1, hexA(hex, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * A random point on the card and its bleed, optionally only in a band near the card's edges.
 * @param box the card
 * @param random the random generator
 * @param band the band's depth, a share of the card's shorter side (1 or more: anywhere)
 * @returns the point, pixels (the corner after 40 misses)
 */
export function pt(box: Box, random: () => number, band: number): [number, number] {
  const left = box.x - box.e;
  const top = box.y - box.e;
  const width = box.w + 2 * box.e;
  const height = box.h + 2 * box.e;
  const shorter = Math.min(box.w, box.h);
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = left + random() * width;
    const y = top + random() * height;
    if (band >= 1) return [x, y];
    const fromEdge = Math.min(x - box.x, box.x + box.w - x, y - box.y, box.y + box.h - y);
    if (fromEdge < band * shorter) return [x, y];
  }
  return [left, top];
}

/**
 * A marigold: a disc with petal shading and a highlight.
 * @param ctx the context
 * @param x the centre, pixels
 * @param y the centre, pixels
 * @param radius pixels
 * @param colour the flower's colour
 */
export function marigold(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,50,0,.22)';
  for (let petal = 0; petal < 8; petal++) {
    const angle = petal * 0.785;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * radius * 0.62, y + Math.sin(angle) * radius * 0.62, radius * 0.3, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.beginPath();
  ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.32, 0, 7);
  ctx.fill();
}

/**
 * A leaf with its midrib.
 * @param ctx the context
 * @param x the stem's end, pixels
 * @param y the stem's end, pixels
 * @param length pixels
 * @param angle radians
 * @param colour the leaf's colour
 */
export function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number, colour: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(length * 0.5, -length * 0.3, length, 0);
  ctx.quadraticCurveTo(length * 0.5, length * 0.3, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.2)';
  ctx.lineWidth = length * 0.035;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length * 0.95, 0);
  ctx.stroke();
  ctx.restore();
}

/**
 * A point on a quadratic curve.
 * @param x0 the start
 * @param y0 the start
 * @param cx the control point
 * @param cy the control point
 * @param x1 the end
 * @param y1 the end
 * @param along 0 (start) – 1 (end)
 * @returns the point
 */
export function qpt(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, along: number): [number, number] {
  const rest = 1 - along;
  return [rest * rest * x0 + 2 * rest * along * cx + along * along * x1, rest * rest * y0 + 2 * rest * along * cy + along * along * y1];
}
