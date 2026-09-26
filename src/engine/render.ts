import { fontDef, fontStr } from '../data/fonts';
import type { Box, Design, Layout, Photo, Rect, RenderInput, RenderOpts, Side, Slot, Theme } from '../types';
import { hexA, mix, rng } from './color';
import { cardMM, darkInk, frameInk, paperColour, resolveTheme, sizeOf } from './design';
import { MONTHS } from '../data/products';
import { computeLayout, slotPhotoIndex } from './layout';
import { PAT } from './patterns';

type Ctx = CanvasRenderingContext2D;

export function drawThemeBg(c: Ctx, B: Box, t: Theme, withArt: boolean): void {
  const e = B.e,
    u = Math.min(B.w, B.h) / 100;
  const g = c.createLinearGradient(B.x - e, B.y - e, B.x + B.w + e, B.y + B.h + e);
  g.addColorStop(0, t.bg1);
  g.addColorStop(1, t.bg2);
  c.fillStyle = g;
  c.fillRect(B.x - e, B.y - e, B.w + 2 * e, B.h + 2 * e);
  if (withArt)
    for (const p of t.bgP) {
      c.save();
      PAT[p](c, B, u, t, rng(t.id + p), 'bg');
      c.restore();
    }
}
const artOn = (d: Design) => d.useOccasion && d.artwork;

function slotPath(c: Ctx, s: Pick<Slot, 's' | 'd' | 'pts'>): void {
  const d = s.d;
  c.beginPath();
  if (s.s === 'poly' && s.pts) {
    s.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  } else if (s.s === 'circle') c.arc(d.x + d.w / 2, d.y + d.h / 2, Math.min(d.w, d.h) / 2, 0, Math.PI * 2);
  else if (s.s === 'arch') {
    const r = d.w / 2;
    c.moveTo(d.x, d.y + d.h);
    c.lineTo(d.x, d.y + r);
    c.arc(d.x + r, d.y + r, r, Math.PI, 0);
    c.lineTo(d.x + d.w, d.y + d.h);
    c.closePath();
  } else if (s.s === 'round') c.roundRect(d.x, d.y, d.w, d.h, Math.min(d.w, d.h) * 0.14);
  else c.rect(d.x, d.y, d.w, d.h);
}

/** Canvas units per source pixel when a photo covers rect d. */
export const coverScale = (p: Photo, d: Rect): number => Math.max(d.w / p.sw, d.h / p.sh) * p.zoom;
function drawCover(c: Ctx, p: Photo, d: Rect): void {
  const sc = coverScale(p, d),
    dw = p.sw * sc,
    dh = p.sh * sc;
  c.drawImage(p.src, d.x - ((dw - d.w) * (p.px + 1)) / 2, d.y - ((dh - d.h) * (p.py + 1)) / 2, dw, dh);
}

function drawSlot(
  c: Ctx,
  s: Slot,
  i: number,
  t: Theme,
  B: Box,
  u: number,
  opts: RenderOpts,
  bgShown: boolean,
  inp: RenderInput,
  page = 0,
  count = 1,
): void {
  const ph = inp.photos.length ? inp.photos[slotPhotoIndex(i, inp.photos.length, page, count)] : null;
  // Tilted slots (scrapbook prints) turn around their centre.
  c.save();
  if (s.rot) {
    const cx = s.x + s.w / 2,
      cy = s.y + s.h / 2;
    c.translate(cx, cy);
    c.rotate(s.rot);
    c.translate(-cx, -cy);
  }
  if (s.print) {
    // Instant print: paper border (deeper at the bottom) with a soft shadow.
    const side = s.w * 0.07,
      foot = s.w * 0.24;
    c.save();
    c.shadowColor = 'rgba(0,0,0,.3)';
    c.shadowBlur = u * 2.4;
    c.shadowOffsetY = u * 0.8;
    c.fillStyle = '#FFFDF8';
    c.fillRect(s.x - side, s.y - side, s.w + 2 * side, s.h + side + foot);
    c.restore();
  }
  if (s.s !== 'rect' && s.s !== 'poly') {
    c.save();
    c.shadowColor = 'rgba(0,0,0,.28)';
    c.shadowBlur = u * 2.2;
    c.shadowOffsetY = u * 0.6;
    slotPath(c, s);
    c.fillStyle = t.bg2;
    c.fill();
    c.restore();
  }
  c.save();
  slotPath(c, s);
  c.clip();
  if (ph) {
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    drawCover(c, ph, s.d);
  } else {
    if (!bgShown) drawThemeBg(c, B, t, artOn(inp.d));
    if (opts.hint) {
      const d = s.d;
      c.fillStyle = 'rgba(255,255,255,.3)';
      c.fillRect(d.x, d.y, d.w, d.h);
      c.strokeStyle = 'rgba(0,0,0,.12)';
      c.lineWidth = u * 0.4;
      for (let x = d.x - d.h; x < d.x + d.w; x += u * 3) {
        c.beginPath();
        c.moveTo(x, d.y + d.h);
        c.lineTo(x + d.h, d.y);
        c.stroke();
      }
      if (!opts.thumb) {
        const cx = s.x + s.w / 2,
          cy = s.y + s.h / 2,
          k = Math.min(s.w, s.h) * 0.09;
        c.fillStyle = 'rgba(0,0,0,.45)';
        c.beginPath();
        c.roundRect(cx - k * 1.6, cy - k * 1.5, k * 3.2, k * 2.2, k * 0.4);
        c.fill();
        c.fillRect(cx - k * 0.6, cy - k * 1.9, k * 1.2, k * 0.5);
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(cx, cy - k * 0.4, k * 0.62, 0, 7);
        c.fill();
        c.fillStyle = 'rgba(0,0,0,.62)';
        c.font = `600 ${k * 0.9}px Hind, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'top';
        c.fillText('Add a photo', cx, cy + k * 1.1);
      }
    }
  }
  c.restore();
  if (s.s !== 'rect') {
    c.save();
    c.strokeStyle = t.accent;
    c.lineWidth = u * 0.9;
    slotPath(c, s);
    c.stroke();
    const o = u * 1.7,
      d = s.d;
    c.lineWidth = u * 0.35;
    slotPath(c, { s: s.s, d: { x: d.x - o, y: d.y - o, w: d.w + 2 * o, h: d.h + 2 * o } });
    c.stroke();
    if (s.s === 'arch') {
      c.fillStyle = t.accent;
      c.beginPath();
      c.arc(d.x + d.w / 2, d.y - o - u * 1.6, u * 1.2, 0, 7);
      c.fill();
    }
    c.restore();
  }
  if (s.print) {
    // A strip of translucent tape across the top edge.
    const tw = s.w * 0.42,
      th = s.w * 0.1;
    c.save();
    c.translate(s.x + s.w / 2, s.y - s.w * 0.07);
    c.rotate(-0.06);
    c.fillStyle = 'rgba(245,235,205,.78)';
    c.shadowColor = 'rgba(0,0,0,.12)';
    c.shadowBlur = u * 0.6;
    c.fillRect(-tw / 2, -th / 2, tw, th);
    c.restore();
  }
  c.restore();
}

/** Offset colour blocks, film strips: what sits behind the photos in the modern layouts. */
function drawLayoutArt(c: Ctx, L: Layout, B: Box, t: Theme, u: number): void {
  for (const b of L.blocks ?? []) {
    c.fillStyle = b.c === 'accent' ? t.accent : darkInk(t);
    c.fillRect(b.r.x, b.r.y, b.r.w, b.r.h);
  }
  if (L.film) {
    const { r, vertical } = L.film,
      e = B.e,
      band = vertical ? { x: r.x, y: r.y - e, w: r.w, h: r.h + 2 * e } : { x: r.x - e, y: r.y, w: r.w + 2 * e, h: r.h };
    c.save();
    c.shadowColor = 'rgba(0,0,0,.35)';
    c.shadowBlur = u * 2;
    c.fillStyle = '#171412';
    c.fillRect(band.x, band.y, band.w, band.h);
    c.restore();
    // Sprocket holes along both edges, showing the background through.
    const hs = (vertical ? r.w : r.h) * 0.07,
      step = hs * 2.1;
    c.fillStyle = t.bg1;
    const along = vertical ? band.h : band.w;
    for (let k = step / 2; k < along; k += step)
      for (const edge of [0.035, 0.965]) {
        const hx = vertical ? band.x + band.w * edge - hs / 2 : band.x + k - hs / 2,
          hy = vertical ? band.y + k - hs / 2 : band.y + band.h * edge - hs / 2;
        c.beginPath();
        c.roundRect(hx, hy, hs, hs * 0.8, hs * 0.2);
        c.fill();
      }
  }
}

function drawStamp(c: Ctx, st: Rect, t: Theme, B: Box, u: number, withArt: boolean): void {
  c.save();
  c.shadowColor = 'rgba(0,0,0,.3)';
  c.shadowBlur = u * 2;
  c.shadowOffsetY = u * 0.6;
  c.fillStyle = '#FFFDF6';
  c.fillRect(st.x, st.y, st.w, st.h);
  c.restore();
  // Perforations: redraw the background through little circles along the edges.
  const step = u * 2.6,
    r = u * 0.85;
  c.save();
  c.beginPath();
  for (let x = st.x; x <= st.x + st.w + 0.1; x += st.w / Math.round(st.w / step)) {
    c.moveTo(x + r, st.y);
    c.arc(x, st.y, r, 0, 7);
    c.moveTo(x + r, st.y + st.h);
    c.arc(x, st.y + st.h, r, 0, 7);
  }
  for (let y = st.y; y <= st.y + st.h + 0.1; y += st.h / Math.round(st.h / step)) {
    c.moveTo(st.x + r, y);
    c.arc(st.x, y, r, 0, 7);
    c.moveTo(st.x + st.w + r, y);
    c.arc(st.x + st.w, y, r, 0, 7);
  }
  c.clip();
  drawThemeBg(c, B, t, withArt);
  c.restore();
}
function drawStampText(c: Ctx, st: Rect, t: Theme, u: number): void {
  c.fillStyle = darkInk(t);
  c.textBaseline = 'alphabetic';
  c.font = `600 ${u * 2.6}px "Hind","Baloo 2",sans-serif`;
  c.textAlign = 'left';
  c.fillText('भारत INDIA', st.x + u * 3.2, st.y + st.h - u * 2.6);
  c.textAlign = 'right';
  c.font = `700 ${u * 3}px "Hind",sans-serif`;
  c.fillText('₹5', st.x + st.w - u * 3.2, st.y + st.h - u * 2.5);
}
function drawPostmark(c: Ctx, p: { x: number; y: number; r: number }, t: Theme, u: number): void {
  c.save();
  c.strokeStyle = hexA(t.accent, 0.85);
  c.fillStyle = hexA(t.accent, 0.9);
  c.lineWidth = u * 0.45;
  c.beginPath();
  c.arc(p.x, p.y, p.r, 0, 7);
  c.stroke();
  c.lineWidth = u * 0.25;
  c.beginPath();
  c.arc(p.x, p.y, p.r * 0.74, 0, 7);
  c.stroke();
  for (let k = -1; k <= 2; k++) {
    c.beginPath();
    for (let x = 0; x <= u * 16; x += u * 0.5)
      c.lineTo(p.x + p.r + u * 1.2 + x, p.y + k * u * 1.9 + Math.sin(x / (u * 1.6)) * u * 0.55);
    c.stroke();
  }
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `600 ${u * 1.9}px Hind, sans-serif`;
  c.fillText(
    t.name
      .split(/[ &’']/)[0]
      .toUpperCase()
      .slice(0, 10),
    p.x,
    p.y - u * 1.2,
  );
  c.font = `600 ${u * 2.1}px Hind, sans-serif`;
  c.fillText(String(new Date().getFullYear()), p.x, p.y + u * 1.5);
  c.restore();
}

export function wrapLines(c: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (!line || c.measureText(test).width <= maxW) line = test;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

interface TextItem {
  kind: 'h' | 'q' | 's' | 'o';
  lines: string[];
  font: string;
  px: number;
  lh: number;
  h: number;
}
function layoutText(c: Ctx, Z: Rect, base: number, d: Design) {
  const hf = fontDef(d.headFont),
    qf = fontDef(d.quoteFont),
    items: TextItem[] = [];
  let total = 0,
    maxW = 0;
  const qs = base * 0.44;
  const add = (kind: TextItem['kind'], text: string, font: string, px: number, lh: number) => {
    c.font = font;
    const lines = wrapLines(c, text, Z.w);
    for (const l of lines) maxW = Math.max(maxW, c.measureText(l).width);
    const h = lines.length * px * lh;
    items.push({ kind, lines, font, px, lh, h });
    total += h;
  };
  const hasH = d.showHeading && d.heading.trim(),
    hasQ = d.showQuote && d.quote.trim(),
    hasS = d.showSig && d.sig.trim();
  if (hasH) add('h', d.heading, fontStr(hf.n, hf.hw, base), base, 1.14);
  if (d.ornament && hasH && hasQ) {
    items.push({ kind: 'o', lines: [], font: '', px: qs, lh: 1, h: qs * 1.2 });
    total += qs * 1.2;
  }
  if (hasQ) add('q', d.quote, fontStr(qf.n, qf.bw, qs), qs, 1.38);
  if (hasS) add('s', d.sig, fontStr(qf.n, qf.bw, base * 0.36), base * 0.36, 1.3);
  const gap = qs * 0.55;
  total += gap * Math.max(0, items.length - 1);
  return { items, total, maxW, gap };
}

function drawText(c: Ctx, L: Layout, t: Theme, B: Box, d: Design): void {
  const Z = L.text;
  if (!Z || Z.w <= 4 || Z.h <= 4) return;
  let base = Math.min(Z.w * 0.13, Z.h * (L.textFill ?? 0.32)) * d.textScale;
  let lay = layoutText(c, Z, base, d);
  for (let k = 0; k < 50 && (lay.total > Z.h || lay.maxW > Z.w * 1.001); k++) {
    base *= 0.93;
    lay = layoutText(c, Z, base, d);
  }
  const onPhoto = L.onPhoto;
  const color = d.customColor ? d.color : L.ink === 'frame' ? frameInk(d, t) : onPhoto ? '#FFFFFF' : t.ink;
  if (onPhoto && d.scrim) {
    // The whole card, or just the photo when the card has other things (a calendar's dates) beside it.
    const S = L.scrimArea ?? { x: B.x - B.e, y: B.y - B.e, w: B.w + 2 * B.e, h: B.h + 2 * B.e };
    let g: CanvasGradient | string;
    if (d.vAlign === 'bottom') {
      g = c.createLinearGradient(0, S.y + S.h * 0.3, 0, S.y + S.h);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.62)');
    } else if (d.vAlign === 'top') {
      g = c.createLinearGradient(0, S.y + S.h * 0.7, 0, S.y);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.62)');
    } else g = 'rgba(0,0,0,.3)';
    c.fillStyle = g;
    c.fillRect(S.x, S.y, S.w, S.h);
  }
  const va = L.textCenter ? 'middle' : d.vAlign;
  let y = va === 'top' ? Z.y : va === 'bottom' ? Z.y + Z.h - lay.total : Z.y + (Z.h - lay.total) / 2;
  const ax = d.hAlign === 'left' ? Z.x : d.hAlign === 'right' ? Z.x + Z.w : Z.x + Z.w / 2;
  c.save();
  c.textAlign = d.hAlign;
  c.textBaseline = 'middle';
  if (onPhoto) {
    c.shadowColor = 'rgba(0,0,0,.4)';
    c.shadowBlur = base * 0.08;
  }
  lay.items.forEach((it, idx) => {
    if (it.kind === 'o') {
      const w = Math.min(Z.w * 0.34, it.px * 7),
        cy = y + it.h / 2,
        x0 = d.hAlign === 'left' ? ax : d.hAlign === 'right' ? ax - w : ax - w / 2;
      const col = onPhoto && !d.customColor ? '#FFFFFF' : t.accent;
      c.strokeStyle = col;
      c.fillStyle = col;
      c.lineWidth = Math.max(1, it.px * 0.07);
      c.beginPath();
      c.moveTo(x0, cy);
      c.lineTo(x0 + w * 0.42, cy);
      c.moveTo(x0 + w * 0.58, cy);
      c.lineTo(x0 + w, cy);
      c.stroke();
      const dx = x0 + w / 2,
        s = it.px * 0.24;
      c.beginPath();
      c.moveTo(dx, cy - s);
      c.lineTo(dx + s, cy);
      c.lineTo(dx, cy + s);
      c.lineTo(dx - s, cy);
      c.closePath();
      c.fill();
    } else {
      c.font = it.font;
      c.fillStyle = color;
      it.lines.forEach((ln, i) => c.fillText(ln, ax, y + it.px * it.lh * (i + 0.5)));
    }
    y += it.h + (idx < lay.items.length - 1 ? lay.gap : 0);
  });
  c.restore();
}

function drawFront(c: Ctx, B: Box, inp: RenderInput, opts: RenderOpts): Layout {
  const { d, photos } = inp,
    t = resolveTheme(d),
    u = Math.min(B.w, B.h) / 100,
    e = B.e;
  const L = computeLayout(opts.layout ?? d.layout, B, d);
  if (L.frame) {
    if (d.frame === 'occasion') drawThemeBg(c, B, t, artOn(d));
    else {
      c.fillStyle = paperColour(d);
      c.fillRect(B.x - e, B.y - e, B.w + 2 * e, B.h + 2 * e);
    }
  } else if (L.bg) drawThemeBg(c, B, t, artOn(d));
  if (L.paper) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,.3)';
    c.shadowBlur = u * 2.4;
    c.shadowOffsetY = u * 0.8;
    c.fillStyle = d.frame === 'occasion' ? t.bg1 : paperColour(d);
    c.fillRect(L.paper.x, L.paper.y, L.paper.w, L.paper.h);
    c.restore();
  }
  if (L.stamp) drawStamp(c, L.stamp, t, B, u, artOn(d));
  drawLayoutArt(c, L, B, t, u);
  const page = d.product === 'calendar' ? (opts.page ?? 0) : 0;
  L.slots.forEach((s, i) => drawSlot(c, s, i, t, B, u, opts, L.bg || L.frame, inp, page, L.slots.length));
  if (L.mat) drawMatBevels(c, L, u);
  if (L.stamp && L.post) {
    drawStampText(c, L.stamp, t, u);
    drawPostmark(c, L.post, t, u);
  }
  if (L.band) {
    c.fillStyle = d.product === 'calendar' ? hexA(paperColour(d), 0.93) : hexA(t.bg1, 0.94);
    c.fillRect(L.band.x, L.band.y, L.band.w, L.band.h);
  }
  if (L.overlay && d.useOccasion && d.decor && photos.length && t.over) {
    c.save();
    PAT[t.over](c, B, u, t, rng(t.id + 'o'), 'over');
    c.restore();
  }
  if (L.frameLine) {
    c.save();
    c.strokeStyle = 'rgba(255,255,255,.9)';
    c.lineWidth = u * 0.45;
    const f = L.frameLine;
    c.strokeRect(B.x + f, B.y + f, B.w - 2 * f, B.h - 2 * f);
    c.restore();
  }
  if (L.hairline) {
    c.save();
    c.strokeStyle = hexA(t.accent, 0.55);
    c.lineWidth = Math.max(1, u * 0.18);
    const f = L.hairline;
    c.strokeRect(B.x + f, B.y + f, B.w - 2 * f, B.h - 2 * f);
    c.restore();
  }
  const cm = calMonth(d, page);
  drawText(c, L, t, B, d.product === 'calendar' ? calendarWords(d, cm.month, !!L.calYear, L.onPhoto) : d);
  if (L.calGrid) drawMonth(c, L.calTitle ?? null, L.calGrid, cm.year, cm.month, d, frameInk(d, t), t.accent);
  if (L.calYear) {
    if (L.calTitle) drawYearTitle(c, L.calTitle, d, frameInk(d, t));
    drawYearGrid(c, L.calYear, d, frameInk(d, t), t.accent);
  }
  if (L.arc) drawBadge(c, L, t, d);
  const insta = d.insta.replace(/[@\s]/g, '');
  if (insta && !opts.thumb) drawFrontInsta(c, L, B, u, insta, darkInk(t));
  return L;
}

/**
 * The words on a calendar page. Each month uses its own caption in place of the greeting (an empty caption keeps
 * the greeting). Above the month there is room for one line only; on the photo the quote and signature can follow.
 */
function calendarWords(d: Design, month: number, yearPage: boolean, onPhoto: boolean): Design {
  const cap = yearPage ? '' : (d.cal.captions[month] ?? '').trim(),
    head = cap || (d.showHeading ? d.heading.trim() : '');
  if (onPhoto) return { ...d, heading: head, showHeading: !!head };
  const line = head || (d.showQuote ? d.quote.trim() : '');
  return { ...d, heading: line, showHeading: !!line, showQuote: false, showSig: false, ornament: false };
}

/** Username tag in the bottom-right corner of the lowest, right-most photo (or the card when there is none). */
function drawFrontInsta(c: Ctx, L: Layout, B: Box, u: number, name: string, ink: string): void {
  const slot = L.slots.reduce<Slot | null>((a, s) => (!a || s.x + s.w + s.y + s.h > a.x + a.w + a.y + a.h ? s : a), null);
  let R: Rect = slot ?? B;
  if (slot?.s === 'circle') {
    // A circle's bounding-box corner is off the photo: use the square inscribed in it.
    const k = Math.min(slot.w, slot.h) * 0.707;
    R = { x: slot.x + (slot.w - k) / 2, y: slot.y + (slot.h - k) / 2, w: k, h: k };
  }
  const inset = Math.max(u * 3, Math.min(R.w, R.h) * 0.05);
  // On a photo the tag is white with a soft shadow; on paper it uses the card's dark ink.
  c.save();
  if (slot) {
    c.shadowColor = 'rgba(0,0,0,.55)';
    c.shadowBlur = u * 0.9;
  }
  drawInsta(c, name, Math.min(R.x + R.w, B.x + B.w) - inset, Math.min(R.y + R.h, B.y + B.h) - inset, u, slot ? '#FFFFFF' : ink);
  c.restore();
}

/** Instagram glyph followed by the username (no @), right-aligned to `right`, vertically centred on `cy`. */
function drawInsta(c: Ctx, name: string, right: number, cy: number, u: number, ink: string): void {
  const s = u * 3.4,
    gap = u * 1.1;
  c.save();
  c.font = `600 ${u * 3}px "Hind",sans-serif`;
  c.textAlign = 'right';
  c.textBaseline = 'middle';
  c.fillStyle = ink;
  c.fillText(name, right, cy);
  const x = right - c.measureText(name).width - gap - s,
    y = cy - s / 2;
  c.strokeStyle = ink;
  c.lineWidth = s * 0.1;
  c.beginPath();
  c.roundRect(x, y, s, s, s * 0.28);
  c.stroke();
  c.beginPath();
  c.arc(x + s / 2, y + s / 2, s * 0.22, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(x + s * 0.76, y + s * 0.24, s * 0.055, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawBack(c: Ctx, B: Box, d: Design): void {
  const t = resolveTheme(d),
    u = Math.min(B.w, B.h) / 100,
    land = B.w >= B.h,
    e = B.e,
    bk = d.back,
    deep = darkInk(t),
    pad = u * 7;
  c.fillStyle = bk.tint ? mix('#FFFFFF', t.bg1, 0.09) : '#FFFFFF';
  c.fillRect(B.x - e, B.y - e, B.w + 2 * e, B.h + 2 * e);
  const sh = u * 2.4;
  c.fillStyle = t.bg1;
  c.fillRect(B.x - e, B.y + B.h - sh, B.w + 2 * e, sh + e);
  c.fillStyle = t.accent;
  for (let x = B.x + sh; x < B.x + B.w; x += sh * 2.2) {
    const y = B.y + B.h - sh / 2,
      s = sh * 0.28;
    c.beginPath();
    c.moveTo(x, y - s);
    c.lineTo(x + s, y);
    c.lineTo(x, y + s);
    c.lineTo(x - s, y);
    c.closePath();
    c.fill();
  }
  if (bk.label) {
    c.fillStyle = deep;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = `600 ${u * 4}px "Hind",sans-serif`;
    const y = B.y + pad + u * 1.5;
    c.fillText('POST CARD', B.x + pad, y);
    const w = c.measureText('POST CARD').width;
    c.font = `500 ${u * 3.7}px "Hind","Baloo 2",sans-serif`;
    c.fillText('पोस्ट कार्ड', B.x + pad + w + u * 2.5, y);
  }
  let msg: Rect, adr: Rect;
  c.strokeStyle = hexA(deep, 0.55);
  c.lineWidth = u * 0.3;
  c.beginPath();
  if (land) {
    const dx = B.x + B.w * 0.54;
    c.moveTo(dx, B.y + pad * 1.5);
    c.lineTo(dx, B.y + B.h - pad * 1.1);
    msg = { x: B.x + pad, y: B.y + pad * 2, w: dx - B.x - pad * 1.6, h: B.h - pad * 3.2 };
    adr = { x: dx + pad * 0.7, y: B.y + pad * 0.9, w: B.x + B.w - pad * 0.8 - (dx + pad * 0.7), h: B.h - pad * 2 };
  } else {
    const dy = B.y + B.h * 0.5;
    c.moveTo(B.x + pad, dy);
    c.lineTo(B.x + B.w - pad, dy);
    msg = { x: B.x + pad, y: B.y + pad * 2, w: B.w - 2 * pad, h: dy - B.y - pad * 2.6 };
    adr = { x: B.x + pad, y: dy + pad * 0.6, w: B.w - 2 * pad, h: B.y + B.h - pad * 1.1 - (dy + pad * 0.6) };
  }
  c.stroke();
  const hand = fontDef(bk.font),
    fromH = bk.from.trim() ? u * 5 : 0;
  if (bk.message.trim()) {
    let px = u * 5.2;
    c.font = fontStr(hand.n, hand.bw, px);
    let lines = wrapLines(c, bk.message, msg.w);
    for (let k = 0; k < 40 && lines.length * px * 1.45 > msg.h - fromH; k++) {
      px *= 0.93;
      c.font = fontStr(hand.n, hand.bw, px);
      lines = wrapLines(c, bk.message, msg.w);
    }
    c.fillStyle = deep;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, msg.x, msg.y + px * 1.45 * (i + 0.5)));
  } else {
    c.strokeStyle = hexA(deep, 0.18);
    c.lineWidth = u * 0.2;
    for (let y = msg.y + u * 8; y < msg.y + msg.h - fromH; y += u * 8) {
      c.beginPath();
      c.moveTo(msg.x, y);
      c.lineTo(msg.x + msg.w, y);
      c.stroke();
    }
  }
  if (fromH) {
    c.fillStyle = deep;
    c.textAlign = 'left';
    c.textBaseline = 'alphabetic';
    c.font = fontStr(hand.n, hand.bw, u * 3.8);
    c.fillText('— ' + bk.from.trim(), msg.x, msg.y + msg.h);
  }
  const sw = u * 16,
    sh2 = u * 19,
    sx = adr.x + adr.w - sw,
    sy = adr.y;
  if (bk.stamp) {
    c.save();
    c.setLineDash([u, u * 0.8]);
    c.strokeStyle = hexA(deep, 0.6);
    c.lineWidth = u * 0.3;
    c.strokeRect(sx, sy, sw, sh2);
    c.restore();
    c.fillStyle = hexA(deep, 0.5);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `500 ${u * 2.5}px "Hind",sans-serif`;
    c.fillText('Stamp', sx + sw / 2, sy + sh2 / 2);
  }
  const pinH = u * 5.5,
    top = sy + sh2 + u * 3.5,
    bottom = adr.y + adr.h - pinH - u * 3,
    n = 4,
    gap = (bottom - top) / n;
  c.fillStyle = deep;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.font = `600 ${u * 3}px "Hind",sans-serif`;
  c.fillText('To', adr.x, top - u * 0.5);
  const aLines = [bk.to, ...bk.address.split('\n')]
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, n);
  c.strokeStyle = hexA(deep, 0.45);
  c.lineWidth = u * 0.22;
  for (let i = 0; i < n; i++) {
    const y = top + gap * (i + 1);
    c.beginPath();
    c.moveTo(adr.x, y);
    c.lineTo(adr.x + adr.w, y);
    c.stroke();
    const line = aLines[i];
    if (line) {
      let px = Math.min(gap * 0.6, u * 4.6);
      c.font = fontStr(hand.n, hand.bw, px);
      while (c.measureText(line).width > adr.w && px > u) {
        px *= 0.93;
        c.font = fontStr(hand.n, hand.bw, px);
      }
      c.fillText(line, adr.x + u, y - u * 0.9);
    }
  }
  const by = adr.y + adr.h - pinH;
  c.font = `600 ${u * 2.8}px "Hind",sans-serif`;
  c.fillText('PIN', adr.x, by + pinH * 0.72);
  const lx = adr.x + c.measureText('PIN').width + u * 2,
    bs = pinH,
    pin = bk.pin.replace(/\D/g, '').slice(0, 6);
  c.strokeStyle = hexA(deep, 0.6);
  c.lineWidth = u * 0.25;
  for (let i = 0; i < 6; i++) {
    const x = lx + i * (bs + u * 0.8);
    c.strokeRect(x, by, bs, bs);
    if (pin[i]) {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = fontStr(hand.n, hand.bw, bs * 0.72);
      c.fillText(pin[i], x + bs / 2, by + bs * 0.55);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    }
  }
}

/* ---------- photo frames ---------- */

/** A cut mat has a pale bevel around each window and a faint shadow line where the photo sits under it. */
function drawMatBevels(c: Ctx, L: Layout, u: number): void {
  const b = u * 0.7;
  c.save();
  for (const s of L.slots) {
    c.strokeStyle = 'rgba(0,0,0,.22)';
    c.lineWidth = u * 0.25;
    c.strokeRect(s.x, s.y, s.w, s.h);
    c.strokeStyle = 'rgba(255,255,255,.85)';
    c.lineWidth = b;
    c.strokeRect(s.x - b / 2, s.y - b / 2, s.w + b, s.h + b);
    c.strokeStyle = 'rgba(0,0,0,.1)';
    c.lineWidth = u * 0.2;
    c.strokeRect(s.x - b, s.y - b, s.w + 2 * b, s.h + 2 * b);
  }
  c.restore();
}

/** Back of a frame print: a dedication label with title, message, from and date (ruled lines when empty). */
function drawFrameBack(c: Ctx, B: Box, d: Design): void {
  const t = resolveTheme(d),
    u = Math.min(B.w, B.h) / 100,
    e = B.e,
    bk = d.back,
    deep = darkInk(t),
    hand = fontDef(bk.font);
  c.fillStyle = bk.tint ? mix('#FFFFFF', t.bg1, 0.07) : '#FFFFFF';
  c.fillRect(B.x - e, B.y - e, B.w + 2 * e, B.h + 2 * e);
  const lw = Math.min(B.w * 0.72, u * 82),
    lh = Math.min(B.h * 0.5, lw * 0.72),
    lx = B.x + (B.w - lw) / 2,
    ly = B.y + (B.h - lh) / 2;
  c.strokeStyle = hexA(t.accent, 0.7);
  c.lineWidth = u * 0.35;
  c.strokeRect(lx, ly, lw, lh);
  c.lineWidth = u * 0.15;
  c.strokeRect(lx + u * 1.2, ly + u * 1.2, lw - u * 2.4, lh - u * 2.4);
  const inner: Rect = { x: lx + u * 5, y: ly + u * 5, w: lw - u * 10, h: lh - u * 10 },
    cx = inner.x + inner.w / 2,
    foot = u * 8;
  c.fillStyle = deep;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let y = inner.y;
  const title = d.designName.trim() || (d.showHeading ? d.heading.trim() : '');
  if (title) {
    const hf = fontDef(d.headFont);
    let px = u * 6;
    c.font = fontStr(hf.n, hf.hw, px);
    while (c.measureText(title).width > inner.w && px > u * 2) {
      px *= 0.92;
      c.font = fontStr(hf.n, hf.hw, px);
    }
    c.fillText(title, cx, y + px * 0.55);
    y += px * 1.5;
  }
  if (bk.message.trim()) {
    let px = u * 5;
    c.font = fontStr(hand.n, hand.bw, px);
    let lines = wrapLines(c, bk.message, inner.w);
    for (let k = 0; k < 30 && lines.length * px * 1.4 > inner.y + inner.h - foot - y; k++) {
      px *= 0.92;
      c.font = fontStr(hand.n, hand.bw, px);
      lines = wrapLines(c, bk.message, inner.w);
    }
    lines.forEach((l, i) => c.fillText(l, cx, y + px * 1.4 * (i + 0.5)));
  } else {
    c.strokeStyle = hexA(deep, 0.2);
    c.lineWidth = u * 0.2;
    for (let ry = y + u * 7; ry < inner.y + inner.h - foot; ry += u * 7) {
      c.beginPath();
      c.moveTo(inner.x, ry);
      c.lineTo(inner.x + inner.w, ry);
      c.stroke();
    }
  }
  const by = inner.y + inner.h - u * 2;
  c.textAlign = 'left';
  c.font = fontStr(hand.n, hand.bw, u * 3.8);
  c.fillText(`— ${bk.from.trim()}`, inner.x, by);
  c.textAlign = 'right';
  c.font = `500 ${u * 2.8}px "Hind",sans-serif`;
  c.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), inner.x + inner.w, by);
}

/* ---------- calendars ---------- */

/** Year and month (0–11) shown on calendar page p. */
export function calMonth(d: Design, p: number): { year: number; month: number } {
  const k = d.cal.start + (d.cal.months === 1 ? 0 : p);
  return { year: d.cal.year + Math.floor(k / 12), month: k % 12 };
}

const setSpacing = (c: Ctx, v: string) => {
  // letterSpacing is missing in older canvases; spacing is decoration, so skip it there.
  if ('letterSpacing' in c) c.letterSpacing = v;
};

/** The dates font (weekday names, day numbers, the year): the chosen family, or Hind. Bold uses its heaviest weight. */
function numFace(d: Design, bold = d.cal.numBold): (px: number) => string {
  const n = d.cal.numFont;
  if (!n) return (px) => `${bold ? 600 : 400} ${px}px "Hind",sans-serif`;
  const f = fontDef(n),
    wt = bold ? Math.max(...f.w) : Math.min(...f.w);
  return (px) => fontStr(f.n, wt, px);
}

/** Cap height of the current font: centring on it keeps every title on the same baseline, whatever its letters. */
const capHeight = (c: Ctx) => c.measureText('HJMNS').actualBoundingBoxAscent;

/**
 * Month title ("March" plus the year in the accent colour on the same baseline). Sized to fit the widest month
 * name, so every page of the calendar uses exactly the same size and position.
 */
function drawMonthTitle(
  c: Ctx,
  T: Rect,
  label: string,
  year: string | null,
  d: Design,
  ink: string,
  accent: string,
  inset: number,
): void {
  const f = fontDef(d.cal.font || d.headFont);
  let px = T.h * 0.8;
  const yearW = () => {
    if (!year) return 0;
    c.font = numFace(d, true)(px * 0.36);
    setSpacing(c, `${px * 0.04}px`);
    const w = c.measureText(year).width + px * 0.3;
    setSpacing(c, '0px');
    return w;
  };
  for (let k = 0; k < 40; k++) {
    c.font = fontStr(f.n, f.hw, px);
    const widest = Math.max(...MONTHS.map((m) => c.measureText(m).width));
    if (widest + yearW() <= T.w - inset || px < 4) break;
    px *= 0.93;
  }
  c.font = fontStr(f.n, f.hw, px);
  const nameW = c.measureText(label).width,
    base = T.y + T.h / 2 + capHeight(c) / 2,
    yw = yearW(),
    x0 = d.cal.titleAlign === 'left' ? T.x + inset : T.x + (T.w - nameW - yw) / 2;
  c.font = fontStr(f.n, f.hw, px);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.fillStyle = ink;
  c.fillText(label, x0, base);
  if (year) {
    c.font = numFace(d, true)(px * 0.36);
    setSpacing(c, `${px * 0.04}px`);
    c.fillStyle = accent;
    c.fillText(year, x0 + nameW + px * 0.3, base);
    setSpacing(c, '0px');
  }
}

/**
 * Weekday row and day grid. Month pages always use five rows (a sixth week shares cells, as in "23/30"), so the
 * grid, and every number in it, sits in the same place on all twelve pages. `mini` is the year-page version.
 */
function drawDays(c: Ctx, G: Rect, year: number, month: number, d: Design, ink: string, accent: string, mini: boolean): void {
  const ws = d.cal.weekStart,
    first = (new Date(year, month, 1).getDay() - ws + 7) % 7,
    days = new Date(year, month + 1, 0).getDate(),
    rows = mini ? 6 : 5,
    names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    corner = !mini && d.cal.numbers === 'corner';
  const cw = G.w / 7,
    headH = mini ? Math.min(G.h * 0.15, cw * 0.8) : Math.min(G.h * 0.1, cw * 0.42),
    rh = (G.h - headH) / rows,
    padX = cw * 0.13,
    padY = Math.min(rh, cw) * 0.12,
    top = G.y + headH;
  const sunday = (col: number) => (col + ws) % 7 === 0;
  c.save();
  // weekday names
  const hp = mini ? Math.min(headH * 0.62, cw * 0.5) : Math.min(headH * 0.46, cw * 0.2);
  c.font = numFace(d, true)(hp);
  c.textBaseline = 'middle';
  setSpacing(c, mini ? '0px' : `${hp * 0.12}px`);
  for (let i = 0; i < 7; i++) {
    const dow = (i + ws) % 7;
    c.fillStyle = dow === 0 ? accent : hexA(ink, 0.7);
    c.textAlign = corner ? 'left' : 'center';
    c.fillText(mini ? names[dow][0] : names[dow].toUpperCase(), corner ? G.x + cw * i + padX : G.x + cw * (i + 0.5), G.y + headH / 2);
  }
  setSpacing(c, '0px');
  // rules
  if (!mini && d.cal.grid !== 'none') {
    c.strokeStyle = hexA(ink, d.cal.grid === 'boxes' ? 0.22 : 0.18);
    c.lineWidth = Math.max(1, Math.min(cw, rh) * 0.012);
    c.beginPath();
    for (let r = 0; r <= rows; r++) {
      c.moveTo(G.x, top + r * rh);
      c.lineTo(G.x + G.w, top + r * rh);
    }
    if (d.cal.grid === 'boxes')
      for (let i = 0; i <= 7; i++) {
        c.moveTo(G.x + cw * i, top);
        c.lineTo(G.x + cw * i, top + rows * rh);
      }
    c.stroke();
  }
  // numbers: one size for every month
  const np = mini ? Math.min(cw * 0.5, rh * 0.62) : corner ? Math.min(cw * 0.3, rh * 0.36) : Math.min(cw * 0.36, rh * 0.44);
  const put = (day: number, col: number, row: number, px: number, where: 'tl' | 'br' | 'c') => {
    c.font = numFace(d, mini ? false : d.cal.numBold)(px);
    c.fillStyle = sunday(col) ? accent : ink;
    const x0 = G.x + cw * col,
      y0 = top + rh * row;
    if (where === 'c') {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(String(day), x0 + cw / 2, y0 + rh / 2);
    } else if (where === 'tl') {
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText(String(day), x0 + padX, y0 + padY);
    } else {
      c.textAlign = 'right';
      c.textBaseline = 'bottom';
      c.fillText(String(day), x0 + cw - padX, y0 + rh - padY);
    }
  };
  for (let day = 1; day <= days; day++) {
    const k = first + day - 1,
      col = k % 7,
      row = Math.floor(k / 7);
    if (row < rows) {
      // A cell shared with a sixth-week day gets both numbers, smaller, split by a diagonal.
      const shared = !mini && row === rows - 1 && k + 7 < first + days;
      put(day, col, row, shared ? np * 0.78 : np, shared || corner ? 'tl' : 'c');
      continue;
    }
    const r = rows - 1;
    put(day, col, r, np * 0.78, 'br');
    c.strokeStyle = hexA(ink, 0.25);
    c.lineWidth = Math.max(1, cw * 0.01);
    c.beginPath();
    c.moveTo(G.x + cw * col + cw * 0.28, top + rh * (r + 1) - rh * 0.18);
    c.lineTo(G.x + cw * (col + 1) - cw * 0.28, top + rh * r + rh * 0.18);
    c.stroke();
  }
  c.restore();
}

/** Month page: title and day grid, aligned to each other (a left title lines up with the first column's numbers). */
function drawMonth(c: Ctx, title: Rect | null, G: Rect, year: number, month: number, d: Design, ink: string, accent: string): void {
  c.save();
  if (title) drawMonthTitle(c, title, MONTHS[month], String(year), d, ink, accent, d.cal.numbers === 'corner' ? (G.w / 7) * 0.13 : 0);
  drawDays(c, G, year, month, d, ink, accent, false);
  c.restore();
}

/** Twelve small months in a grid, from the calendar's start month. Used on the year page and the Year strip. */
function drawYearGrid(c: Ctx, R: Rect, d: Design, ink: string, accent: string): void {
  const yearD: Design = { ...d, cal: { ...d.cal, months: 12 } },
    ratio = R.w / R.h,
    cols = ratio > 2.4 ? 6 : ratio > 1.05 ? 4 : 3,
    rows = 12 / cols,
    gx = R.w * (cols === 6 ? 0.03 : 0.05),
    gw = (R.w - (cols - 1) * gx) / cols,
    gy = Math.min(R.h * 0.05, gw * 0.14),
    gh = (R.h - (rows - 1) * gy) / rows,
    f = fontDef(d.cal.font || d.headFont),
    left = d.cal.titleAlign === 'left';
  // Month names share one size (the widest name decides), so the rows line up.
  let px = Math.min(gh * 0.13, gw * 0.15);
  c.font = fontStr(f.n, f.hw, px);
  while (Math.max(...MONTHS.map((m) => c.measureText(m).width)) > gw * 0.92 && px > 3) {
    px *= 0.93;
    c.font = fontStr(f.n, f.hw, px);
  }
  const th = px * 1.6;
  for (let i = 0; i < 12; i++) {
    const { year, month } = calMonth(yearD, i),
      x = R.x + (i % cols) * (gw + gx),
      y = R.y + Math.floor(i / cols) * (gh + gy);
    c.save();
    c.font = fontStr(f.n, f.hw, px);
    c.fillStyle = accent;
    c.textBaseline = 'alphabetic';
    c.textAlign = left ? 'left' : 'center';
    c.fillText(MONTHS[month], left ? x + (gw / 7) * 0.2 : x + gw / 2, y + th / 2 + capHeight(c) / 2);
    c.restore();
    drawDays(c, { x, y: y + th, w: gw, h: gh - th }, year, month, d, ink, accent, true);
  }
}

/** The year title ("2027", or "2027–28" for a year that starts mid-year). */
function yearLabel(d: Design): string {
  const yearD: Design = { ...d, cal: { ...d.cal, months: 12 } },
    y0 = calMonth(yearD, 0).year,
    y1 = calMonth(yearD, 11).year;
  return y0 === y1 ? String(y0) : `${y0}–${String(y1).slice(2)}`;
}

/** Year strip title: the year, in the month font, aligned like the month titles. */
function drawYearTitle(c: Ctx, T: Rect, d: Design, ink: string): void {
  const f = fontDef(d.cal.font || d.headFont),
    label = yearLabel(d);
  let px = T.h * 0.85;
  c.font = fontStr(f.n, f.hw, px);
  while (c.measureText(label).width > T.w && px > 4) {
    px *= 0.93;
    c.font = fontStr(f.n, f.hw, px);
  }
  c.save();
  c.fillStyle = ink;
  c.textBaseline = 'alphabetic';
  const left = d.cal.titleAlign === 'left';
  c.textAlign = left ? 'left' : 'center';
  c.fillText(label, left ? T.x : T.x + T.w / 2, T.y + T.h / 2 + capHeight(c) / 2);
  c.restore();
}

/** Back of a calendar: the whole year at a glance under the greeting (or the year) and an optional subtitle. */
function drawYearBack(c: Ctx, B: Box, d: Design): void {
  const t = resolveTheme(d),
    u = Math.min(B.w, B.h) / 100,
    e = B.e,
    pad = u * 7,
    ink = darkInk(t),
    f = fontDef(d.cal.font || d.headFont),
    left = d.cal.titleAlign === 'left',
    inner = { x: B.x + pad, w: B.w - 2 * pad };
  c.fillStyle = d.back.tint ? mix('#FFFFFF', t.bg1, 0.08) : '#FFFFFF';
  c.fillRect(B.x - e, B.y - e, B.w + 2 * e, B.h + 2 * e);
  c.fillStyle = t.bg1;
  c.fillRect(B.x - e, B.y - e, B.w + 2 * e, u * 2.2 + e);
  c.fillRect(B.x - e, B.y + B.h - u * 2.2, B.w + 2 * e, u * 2.2 + e);
  const title = (d.showHeading && d.heading.trim()) || yearLabel(d),
    sub = d.cal.backQuote ? d.quote.trim() : '';
  c.save();
  c.fillStyle = ink;
  c.textAlign = left ? 'left' : 'center';
  c.textBaseline = 'alphabetic';
  const ax = left ? inner.x : B.x + B.w / 2;
  let px = u * 9;
  c.font = fontStr(f.n, f.hw, px);
  while (c.measureText(title).width > inner.w && px > u * 3) {
    px *= 0.92;
    c.font = fontStr(f.n, f.hw, px);
  }
  let y = B.y + pad + capHeight(c);
  c.fillText(title, ax, y);
  y += px * 0.35;
  if (sub) {
    const qf = fontDef(d.quoteFont);
    let qp = u * 3.6;
    c.font = fontStr(qf.n, qf.bw, qp);
    let lines = wrapLines(c, sub, inner.w);
    while (lines.length > 2 && qp > u * 2) {
      qp *= 0.92;
      c.font = fontStr(qf.n, qf.bw, qp);
      lines = wrapLines(c, sub, inner.w);
    }
    c.fillStyle = hexA(ink, 0.8);
    for (const l of lines.slice(0, 2)) {
      y += qp * 1.35;
      c.fillText(l, ax, y);
    }
  }
  c.restore();
  const top = y + u * 5;
  drawYearGrid(c, { x: inner.x, y: top, w: inner.w, h: B.y + B.h - pad - top }, d, ink, t.accent);
}

/** Back of a fridge magnet: the magnetic sheet it is mounted on. */
function drawMagnetBack(c: Ctx, B: Box): void {
  const e = B.e,
    u = Math.min(B.w, B.h) / 100;
  c.fillStyle = '#2E2C2B';
  c.fillRect(B.x - e, B.y - e, B.w + 2 * e, B.h + 2 * e);
  c.strokeStyle = 'rgba(255,255,255,.035)';
  c.lineWidth = u * 0.6;
  for (let y = B.y - e; y < B.y + B.h + e; y += u * 1.8) {
    c.beginPath();
    c.moveTo(B.x - e, y);
    c.lineTo(B.x + B.w + e, y);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,.28)';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `600 ${u * 5}px "Hind",sans-serif`;
  setSpacing(c, `${u * 0.8}px`);
  c.fillText('MAGNET', B.x + B.w / 2, B.y + B.h / 2);
  setSpacing(c, '0px');
}

/** Letters centred on the top arc of a circle (reading left to right) or on its bottom arc (upright). */
function drawArcText(c: Ctx, text: string, cx: number, cy: number, r: number, top: boolean): void {
  const chars = [...text],
    widths = chars.map((ch) => c.measureText(ch).width),
    span = widths.reduce((a, b) => a + b, 0) / r;
  let a = top ? -Math.PI / 2 - span / 2 : Math.PI / 2 + span / 2;
  chars.forEach((ch, i) => {
    const w = widths[i] / r,
      mid = top ? a + w / 2 : a - w / 2;
    c.save();
    c.translate(cx + r * Math.cos(mid), cy + r * Math.sin(mid));
    c.rotate(top ? mid + Math.PI / 2 : mid - Math.PI / 2);
    c.fillText(ch, 0, 0);
    c.restore();
    a = top ? a + w : a - w;
  });
}

/** Badge magnet: the greeting on the top arc of the ring, the signature (or quote) on the bottom arc. */
function drawBadge(c: Ctx, L: Layout, t: Theme, d: Design): void {
  const A = L.arc;
  if (!A) return;
  const f = fontDef(d.headFont),
    q = fontDef(d.quoteFont),
    mid = A.r - A.band / 2,
    arcLen = mid * Math.PI * 0.86;
  c.save();
  // A soft ring under the lettering keeps it readable over the occasion artwork.
  c.fillStyle = hexA(t.bg1, 0.62);
  c.beginPath();
  c.arc(A.x, A.y, A.r, 0, Math.PI * 2);
  c.arc(A.x, A.y, A.r - A.band * 0.82, 0, Math.PI * 2, true);
  c.fill('evenodd');
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = d.customColor ? d.color : t.ink;
  const fit = (txt: string, fam: string, wt: number, max: number) => {
    let px = A.band * 0.56 * d.textScale;
    c.font = fontStr(fam, wt, px);
    while (c.measureText(txt).width > max && px > 3) {
      px *= 0.93;
      c.font = fontStr(fam, wt, px);
    }
  };
  const head = d.showHeading ? d.heading.trim() : '',
    low = (d.showSig && d.sig.trim()) || (d.showQuote && d.quote.trim()) || '';
  if (head) {
    fit(head, f.n, f.hw, arcLen);
    drawArcText(c, head, A.x, A.y, mid, true);
  }
  if (low) {
    fit(low, q.n, q.bw, arcLen * 0.8);
    drawArcText(c, low, A.x, A.y, mid, false);
  }
  // two dots where the arcs meet
  c.fillStyle = t.accent;
  for (const s of [-1, 1]) {
    c.beginPath();
    c.arc(A.x + s * mid, A.y, A.band * 0.08, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

function drawGuides(c: Ctx, B: Box, pxmm: number, round = false): void {
  c.save();
  c.lineWidth = Math.max(1, pxmm * 0.2);
  c.setLineDash([pxmm * 1.5, pxmm]);
  const s = 4 * pxmm,
    ring = (inset: number) => {
      c.beginPath();
      c.arc(B.x + B.w / 2, B.y + B.h / 2, Math.min(B.w, B.h) / 2 - inset, 0, Math.PI * 2);
      c.stroke();
    };
  c.strokeStyle = '#E11D48';
  if (round) ring(0);
  else c.strokeRect(B.x, B.y, B.w, B.h);
  c.strokeStyle = '#2563EB';
  if (round) ring(s);
  else c.strokeRect(B.x + s, B.y + s, B.w - 2 * s, B.h - 2 * s);
  c.restore();
}

/** Draws one side of the card into a canvas at pxmm pixels per millimetre, with optional bleed. */
export function renderCard(
  cv: HTMLCanvasElement,
  side: Side,
  pxmm: number,
  bleedMM: number,
  inp: RenderInput,
  opts: RenderOpts = {},
): Layout | null {
  const { w, h } = cardMM(inp.d),
    e = bleedMM * pxmm;
  const W = Math.max(1, Math.round((w + 2 * bleedMM) * pxmm)),
    H = Math.max(1, Math.round((h + 2 * bleedMM) * pxmm));
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, W, H);
  const B: Box = { x: e, y: e, w: W - 2 * e, h: H - 2 * e, e };
  let L: Layout | null = null;
  if (side === 'front') L = drawFront(c, B, inp, opts);
  else if (inp.d.product === 'calendar') drawYearBack(c, B, inp.d);
  else if (inp.d.product === 'frame') drawFrameBack(c, B, inp.d);
  else if (inp.d.product === 'magnet') drawMagnetBack(c, B);
  else drawBack(c, B, inp.d);
  const round = sizeOf(inp.d).shape === 'circle';
  if (round) {
    // Button magnets are cut round: paper white outside the trim circle plus its bleed ring.
    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.arc(B.x + B.w / 2, B.y + B.h / 2, Math.min(B.w, B.h) / 2 + e, 0, Math.PI * 2, true);
    c.fillStyle = '#FFFFFF';
    c.fill('evenodd');
    c.restore();
  }
  if (opts.guides) drawGuides(c, B, pxmm, round);
  return L;
}

/** Theme swatch used in the occasion picker. */
export function renderThemeTile(cv: HTMLCanvasElement, t: Theme): void {
  const c = cv.getContext('2d');
  if (!c) return;
  drawThemeBg(c, { x: 0, y: 0, w: cv.width, h: cv.height, e: 0 }, t, true);
  const f = fontDef(t.hf);
  c.fillStyle = t.ink;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = fontStr(f.n, f.hw, cv.height * 0.16);
  c.fillText(t.heads[0].split(',')[0].slice(0, 16), cv.width / 2, cv.height / 2);
}

/** Effective print resolution of each photo in the current front layout (dpi), or null if unused. */
export function photoDpi(inp: RenderInput): (number | null)[] {
  const { w, h } = cardMM(inp.d);
  const L = computeLayout(inp.d.layout, { x: 0, y: 0, w, h, e: 0 }, inp.d);
  const n = inp.photos.length;
  return inp.photos.map((p, i) => {
    let min = Infinity;
    L.slots.forEach((s, k) => {
      if (k % n === i) min = Math.min(min, 25.4 / coverScale(p, s.d));
    });
    return Number.isFinite(min) ? Math.round(min) : null;
  });
}
export const isInstax = (d: Design) => !!sizeOf(d).instax;
