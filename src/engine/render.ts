import { fontDef, fontStr } from '../data/fonts';
import type { Box, Design, Layout, Photo, Rect, RenderInput, RenderOpts, Side, Slot, Theme } from '../types';
import { hexA, mix, rng } from './color';
import { cardMM, darkInk, frameInk, paperColour, resolveTheme, sizeOf } from './design';
import { computeLayout } from './layout';
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

function slotPath(c: Ctx, s: Pick<Slot, 's' | 'd'>): void {
  const d = s.d;
  c.beginPath();
  if (s.s === 'circle') c.arc(d.x + d.w / 2, d.y + d.h / 2, Math.min(d.w, d.h) / 2, 0, Math.PI * 2);
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
): void {
  const ph = inp.photos.length ? inp.photos[i % inp.photos.length] : null;
  if (s.s !== 'rect') {
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
  let base = Math.min(Z.w * 0.13, Z.h * 0.32) * d.textScale;
  let lay = layoutText(c, Z, base, d);
  for (let k = 0; k < 50 && (lay.total > Z.h || lay.maxW > Z.w * 1.001); k++) {
    base *= 0.93;
    lay = layoutText(c, Z, base, d);
  }
  const onPhoto = L.onPhoto;
  const color = d.customColor ? d.color : L.ink === 'frame' ? frameInk(d, t) : onPhoto ? '#FFFFFF' : t.ink;
  if (onPhoto && d.scrim) {
    const e = B.e;
    let g: CanvasGradient | string;
    if (d.vAlign === 'bottom') {
      g = c.createLinearGradient(0, B.y + B.h * 0.3, 0, B.y + B.h + e);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.62)');
    } else if (d.vAlign === 'top') {
      g = c.createLinearGradient(0, B.y + B.h * 0.7, 0, B.y - e);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.62)');
    } else g = 'rgba(0,0,0,.3)';
    c.fillStyle = g;
    c.fillRect(B.x - e, B.y - e, B.w + 2 * e, B.h + 2 * e);
  }
  let y = d.vAlign === 'top' ? Z.y : d.vAlign === 'bottom' ? Z.y + Z.h - lay.total : Z.y + (Z.h - lay.total) / 2;
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
  L.slots.forEach((s, i) => drawSlot(c, s, i, t, B, u, opts, L.bg || L.frame, inp));
  if (L.stamp && L.post) {
    drawStampText(c, L.stamp, t, u);
    drawPostmark(c, L.post, t, u);
  }
  if (L.band) {
    c.fillStyle = hexA(t.bg1, 0.94);
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
  drawText(c, L, t, B, d);
  return L;
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

function drawGuides(c: Ctx, B: Box, pxmm: number): void {
  c.save();
  c.lineWidth = Math.max(1, pxmm * 0.2);
  c.setLineDash([pxmm * 1.5, pxmm]);
  c.strokeStyle = '#E11D48';
  c.strokeRect(B.x, B.y, B.w, B.h);
  const s = 4 * pxmm;
  c.strokeStyle = '#2563EB';
  c.strokeRect(B.x + s, B.y + s, B.w - 2 * s, B.h - 2 * s);
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
  const L = side === 'front' ? drawFront(c, B, inp, opts) : (drawBack(c, B, inp.d), null);
  if (opts.guides) drawGuides(c, B, pxmm);
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
