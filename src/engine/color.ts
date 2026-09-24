import type { Box } from '../types';

export function toHex(h: string): string {
  if (/^#[0-9a-f]{6}$/i.test(h)) return h;
  if (/^#[0-9a-f]{3}$/i.test(h))
    return (
      '#' +
      h
        .slice(1)
        .split('')
        .map((x) => x + x)
        .join('')
    );
  return '#888888';
}
export function hexA(h: string, a: number): string {
  const n = parseInt(toHex(h).slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function mix(a: string, b: string, t: number): string {
  const A = parseInt(toHex(a).slice(1), 16),
    B = parseInt(toHex(b).slice(1), 16);
  const c = (s: number) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return '#' + [c(16), c(8), c(0)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export function lum(h: string): number {
  const n = parseInt(toHex(h).slice(1), 16);
  return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
}
/** Deterministic PRNG so artwork looks identical in preview and print. */
export function rng(seed: string): () => number {
  let a = 0;
  for (const ch of seed) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, n = 5, inner = 0.45): void {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const rr = i % 2 ? r * inner : r,
      a = -Math.PI / 2 + (i * Math.PI) / n;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}
export function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, hex: string, a: number): void {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, hexA(hex, a));
  g.addColorStop(1, hexA(hex, 0));
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
/** Random point, optionally restricted to a band near the card edges (band < 1). */
export function pt(b: Box, r: () => number, band: number): [number, number] {
  const X = b.x - b.e,
    Y = b.y - b.e,
    W = b.w + 2 * b.e,
    H = b.h + 2 * b.e,
    m = Math.min(b.w, b.h);
  for (let k = 0; k < 40; k++) {
    const x = X + r() * W,
      y = Y + r() * H;
    if (band >= 1) return [x, y];
    const d = Math.min(x - b.x, b.x + b.w - x, y - b.y, b.y + b.h - y);
    if (d < band * m) return [x, y];
  }
  return [X, Y];
}
export function marigold(c: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, 7);
  c.fill();
  c.fillStyle = 'rgba(140,50,0,.22)';
  for (let i = 0; i < 8; i++) {
    const a = i * 0.785;
    c.beginPath();
    c.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.3, 0, 7);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,.28)';
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.3, r * 0.32, 0, 7);
  c.fill();
}
export function leaf(c: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(len * 0.5, -len * 0.3, len, 0);
  c.quadraticCurveTo(len * 0.5, len * 0.3, 0, 0);
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,.2)';
  c.lineWidth = len * 0.035;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(len * 0.95, 0);
  c.stroke();
  c.restore();
}
export function qpt(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, t: number): [number, number] {
  const m = 1 - t;
  return [m * m * x0 + 2 * m * t * cx + t * t * x1, m * m * y0 + 2 * m * t * cy + t * t * y1];
}
