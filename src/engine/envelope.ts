import { fontDef, fontStr } from '../data/fonts';
import type { Design, Photo, Rect, RenderInput, Theme } from '../types';
import { hexA, lum, mix, rng } from './color';
import { cardMM, darkInk, resolveTheme } from './design';
import { drawThemeBg } from './render';

/*
 * The envelope that goes with a design. Its size is the smallest standard envelope the piece fits in; its artwork
 * follows the design's occasion, fonts, words and photo. Three outputs:
 *   - the front (address side) and back (flap side), at envelope size, to print on a ready-made envelope;
 *   - a fold-your-own template: the flat net with cut and fold lines on the smallest sheet it fits;
 *   - separate body, flap and liner layers for the 3D view, where the flap opens and the card slides out.
 */

type Ctx = CanvasRenderingContext2D;

/** Standard envelopes, [name, long side, short side] in mm. */
export const STANDARD: [string, number, number][] = [
  ['Coin 2¼×3½ in', 89, 57],
  ['C7', 114, 81],
  ['A2 (4⅜×5¾ in)', 146, 111],
  ['C6', 162, 114],
  ['A6 (4¾×6½ in)', 165, 121],
  ['A7 (5¼×7¼ in)', 184, 133],
  ['DL', 220, 110],
  ['A9 (5¾×8¾ in)', 222, 146],
  ['C5', 229, 162],
  ['Square 4 in', 102, 102],
  ['Square 5½ in', 140, 140],
  ['Square 6½ in', 165, 165],
  ['Square 7½ in', 190, 190],
  ['Square 9 in', 229, 229],
  ['9×12 in', 305, 229],
  ['C4', 324, 229],
  ['10×13 in', 330, 254],
  ['Square 12½ in', 318, 318],
  ['C3', 458, 324],
];
/** Room around the card inside the envelope (each dimension). */
const EASE = 5;

export interface EnvelopeSpec {
  name: string;
  /** Envelope size in mm, always landscape (w ≥ h). */
  w: number;
  h: number;
}

/** The smallest standard envelope the design's piece slides into (square pieces get square envelopes). */
export function envelopeSpec(d: Design): EnvelopeSpec {
  const { w, h } = cardMM(d),
    L = Math.max(w, h) + EASE,
    S = Math.min(w, h) + EASE,
    square = L - S < 3;
  const fit = STANDARD.filter(([, a, b]) => a >= L && b >= S && (!square || a === b)).sort((x, y) => x[1] * x[2] - y[1] * y[2]);
  const pick = fit[0] ?? STANDARD.filter(([, a, b]) => a >= L && b >= S).sort((x, y) => x[1] * x[2] - y[1] * y[2])[0];
  if (pick) return { name: pick[0], w: pick[1], h: pick[2] };
  // Bigger than any standard envelope: a made-to-measure one.
  return { name: `Custom ${Math.round(L + 5)}×${Math.round(S + 5)} mm`, w: Math.round(L + 5), h: Math.round(S + 5) };
}

const PAPER = { cream: '#F6EEDC', white: '#FFFFFF', kraft: '#C8A67C' } as const;
function paperOf(d: Design, t: Theme): string {
  return d.env.paper === 'occasion' ? mix('#FFFDF8', t.bg1, 0.14) : PAPER[d.env.paper];
}

/* ---------- flap geometry (in envelope-back coordinates: top edge y = 0) ---------- */

/** Depth of the closing flap as a share of the envelope height. */
const flapDepth = (d: Design) => ({ pointed: 0.56, straight: 0.3, wallet: 0.38 })[d.env.style];

/** The closing flap, hanging from the top edge (y = 0) down over the back. */
function flapPath(c: Ctx, d: Design, x: number, y: number, W: number, H: number): void {
  const fh = H * flapDepth(d),
    r = Math.min(W, H) * 0.04;
  c.beginPath();
  if (d.env.style === 'pointed') {
    c.moveTo(x, y);
    c.lineTo(x + W, y);
    c.lineTo(x + W / 2 + r, y + fh - r * 0.6);
    c.quadraticCurveTo(x + W / 2, y + fh, x + W / 2 - r, y + fh - r * 0.6);
    c.closePath();
  } else if (d.env.style === 'straight') {
    c.moveTo(x, y);
    c.lineTo(x + W, y);
    c.lineTo(x + W, y + fh - r);
    c.quadraticCurveTo(x + W, y + fh, x + W - r, y + fh);
    c.lineTo(x + r, y + fh);
    c.quadraticCurveTo(x, y + fh, x, y + fh - r);
    c.closePath();
  } else {
    c.moveTo(x, y);
    c.lineTo(x + W, y);
    c.lineTo(x + W, y + fh * 0.72);
    c.quadraticCurveTo(x + W / 2, y + fh * 1.28, x, y + fh * 0.72);
    c.closePath();
  }
}
/** Where the seal sits: the tip of the flap. */
function sealAt(d: Design, W: number, H: number): { x: number; y: number; r: number } {
  const fh = H * flapDepth(d),
    r = Math.min(W, H) * 0.085;
  return { x: W / 2, y: d.env.style === 'pointed' ? fh - r * 0.95 : d.env.style === 'wallet' ? fh * 0.98 : fh, r };
}

function cover(c: Ctx, p: Photo, R: Rect): void {
  const sc = Math.max(R.w / p.sw, R.h / p.sh) * p.zoom,
    dw = p.sw * sc,
    dh = p.sh * sc;
  c.drawImage(p.src, R.x - ((dw - R.w) * (p.px + 1)) / 2, R.y - ((dh - R.h) * (p.py + 1)) / 2, dw, dh);
}

/** Wax-seal style disc: scalloped accent edge, then the card's photo or a monogram. */
function drawSeal(c: Ctx, inp: RenderInput, t: Theme, x: number, y: number, r: number): void {
  const d = inp.d;
  c.save();
  c.shadowColor = 'rgba(0,0,0,.28)';
  c.shadowBlur = r * 0.25;
  c.shadowOffsetY = r * 0.06;
  c.fillStyle = t.accent;
  c.beginPath();
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2,
      rr = r * (i % 2 ? 0.94 : 1);
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.fill();
  c.restore();
  const inner = r * 0.78,
    ph = d.env.photo ? inp.photos[0] : undefined;
  c.save();
  c.beginPath();
  c.arc(x, y, inner, 0, Math.PI * 2);
  if (ph) {
    c.clip();
    cover(c, ph, { x: x - inner, y: y - inner, w: inner * 2, h: inner * 2 });
    c.restore();
    c.save();
    c.strokeStyle = mix('#FFFFFF', t.accent, 0.35);
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.arc(x, y, inner, 0, Math.PI * 2);
    c.stroke();
  } else {
    c.strokeStyle = hexA('#FFFFFF', 0.55);
    c.lineWidth = r * 0.04;
    c.stroke();
    const who = (d.back.from.trim() || d.heading.trim() || 'C')[0].toUpperCase(),
      f = fontDef(d.headFont);
    c.fillStyle = '#FFFFFF';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = fontStr(f.n, f.hw, inner * 1.1);
    c.fillText(who, x, y + inner * 0.06);
  }
  c.restore();
}

/* ---------- shared geometry (mm) ---------- */

interface Geo {
  /** Side flap width and bottom flap depth. */
  side: number;
  bottom: number;
}
function geoOf(spec: EnvelopeSpec): Geo {
  // Narrow side flaps (still wide enough to glue) keep C6 and A6 envelopes on an A4 sheet.
  return { side: Math.max(12, Math.min(spec.h * 0.16, spec.w * 0.12)), bottom: spec.h * 0.62 };
}
/** Side flap as seen on the back (it folds in from the edge x = 0 or x = W). */
function sidePath(c: Ctx, W: number, H: number, side: number, right: boolean): void {
  const ex = right ? W : 0,
    o = right ? -side : side;
  c.beginPath();
  c.moveTo(ex, H * 0.04);
  c.lineTo(ex + o, H * 0.2);
  c.lineTo(ex + o, H * 0.8);
  c.lineTo(ex, H * 0.96);
  c.closePath();
}
/** Bottom flap as seen on the back (it folds up from the bottom edge). */
function bottomPath(c: Ctx, W: number, H: number, b: number): void {
  const in1 = W * 0.08;
  c.beginPath();
  c.moveTo(0, H);
  c.lineTo(in1, H - b * 0.9);
  c.quadraticCurveTo(W / 2, H - b * 1.08, W - in1, H - b * 0.9);
  c.lineTo(W, H);
  c.closePath();
}

/* ---------- Chitthi mark ---------- */

/** The Chitthi logo as a postmark-style stamp: two rings, the name around them and चिट्ठी in the middle. */
export function drawChitthiMark(c: Ctx, x: number, y: number, r: number, color: string): void {
  c.save();
  c.strokeStyle = color;
  c.fillStyle = color;
  c.lineWidth = r * 0.07;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = r * 0.035;
  c.beginPath();
  c.arc(x, y, r * 0.6, 0, Math.PI * 2);
  c.stroke();
  // Name around the ring, spread evenly over the whole circle.
  const text = 'CHITTHI ✦ PRINT STUDIO ✦ ',
    chars = [...text];
  c.font = `600 ${r * 0.19}px "Hind",sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const widths = chars.map((ch) => c.measureText(ch).width),
    total = widths.reduce((a, b) => a + b, 0);
  let acc = 0;
  chars.forEach((ch, i) => {
    const a = -Math.PI / 2 + ((acc + widths[i] / 2) / total) * Math.PI * 2;
    acc += widths[i];
    c.save();
    c.translate(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
    c.rotate(a + Math.PI / 2);
    c.fillText(ch, 0, 0);
    c.restore();
  });
  c.font = fontStr('Rozha One', 400, r * 0.34);
  c.fillText('चिट्ठी', x, y + r * 0.04);
  c.restore();
}

/* ---------- faces ---------- */

export type EnvelopeFace = 'front' | 'back' | 'body' | 'flap' | 'liner';

/** Draws one face of the envelope at px per mm (no bleed: ready-made envelopes print to a margin). */
export function renderEnvelope(cv: HTMLCanvasElement, face: EnvelopeFace, pxmm: number, inp: RenderInput): EnvelopeSpec {
  const spec = envelopeSpec(inp.d),
    W = Math.round(spec.w * pxmm),
    H = Math.round(spec.h * pxmm);
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return spec;
  c.clearRect(0, 0, W, H);
  const t = resolveTheme(inp.d);
  if (face === 'front') drawFront(c, W, H, inp, t);
  else drawBackFace(c, W, H, inp, t, face, geoOf(spec), pxmm);
  return spec;
}

/** A faint paper grain so flat colour reads as stationery. */
function grain(c: Ctx, W: number, H: number, ink: string, seed: string): void {
  const r = rng(seed),
    n = Math.round((W * H) / 900);
  c.fillStyle = hexA(ink, 0.035);
  for (let i = 0; i < n; i++) c.fillRect(r() * W, r() * H, 1 + r(), 1 + r());
}

/** The accent, darkened towards the ink when it is too light to read on paper. */
const accentInk = (t: Theme, ink: string) => (lum(t.accent) > 0.3 ? mix(t.accent, ink, 0.45) : t.accent);
/** A short postmark word for the occasion. */
function postmarkWord(t: Theme): string {
  if (t.g === 'Birthdays') return 'BIRTHDAY';
  if (!t.g) return 'CHITTHI';
  return t.name.split(/[ &’']/)[0].toUpperCase().slice(0, 9);
}

function drawFront(c: Ctx, W: number, H: number, inp: RenderInput, t: Theme): void {
  const d = inp.d,
    bk = d.back,
    u = H / 100,
    m = u * 8,
    ink = darkInk(t),
    hand = fontDef(bk.font),
    head = fontDef(d.headFont),
    accent = accentInk(t, ink);
  c.fillStyle = paperOf(d, t);
  c.fillRect(0, 0, W, H);
  grain(c, W, H, ink, 'front' + d.themeId);

  // Ornamental border along the bottom edge, under a double rule.
  const bh = u * 9;
  c.save();
  c.beginPath();
  c.rect(0, H - bh, W, bh);
  c.clip();
  if (d.env.art) drawThemeBg(c, { x: 0, y: H - bh, w: W, h: bh, e: 0 }, t, true);
  else {
    c.fillStyle = t.accent;
    c.fillRect(0, H - bh, W, bh);
  }
  c.restore();
  c.fillStyle = t.accent;
  c.fillRect(0, H - bh - u * 1.4, W, u * 0.5);
  c.fillRect(0, H - bh - u * 0.5, W, u * 0.25);

  // Sender, top left.
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = hexA(ink, 0.6);
  c.font = `600 ${u * 3}px "Hind",sans-serif`;
  if ('letterSpacing' in c) c.letterSpacing = `${u * 0.5}px`;
  c.fillText('FROM', m, m + u * 2);
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  c.fillStyle = ink;
  const from = [bk.from, ...d.env.sender.split('\n')].map((s) => s.trim()).filter(Boolean).slice(0, 4);
  from.forEach((l, i) => {
    c.font = fontStr(hand.n, hand.bw, i ? u * 4.4 : u * 5.4);
    c.fillText(l, m, m + u * 9 + i * u * 5.8, W * 0.36);
  });

  // Stamp frame with perforations, and a decorative postmark beside it.
  const sw = Math.min(W * 0.15, u * 24),
    sh = sw * 1.22,
    sx = W - m - sw,
    sy = m;
  c.fillStyle = hexA(ink, 0.035);
  c.fillRect(sx, sy, sw, sh);
  c.save();
  c.strokeStyle = hexA(ink, 0.4);
  c.lineWidth = u * 0.5;
  c.lineCap = 'round';
  c.setLineDash([0.01, u * 1.5]);
  c.strokeRect(sx, sy, sw, sh);
  c.restore();
  c.fillStyle = hexA(ink, 0.45);
  c.textAlign = 'center';
  c.font = `600 ${u * 2.4}px "Hind",sans-serif`;
  if ('letterSpacing' in c) c.letterSpacing = `${u * 0.35}px`;
  ['PLACE', 'STAMP', 'HERE'].forEach((w, i) => c.fillText(w, sx + sw / 2, sy + sh / 2 + (i - 1) * u * 3.4 + u));
  if ('letterSpacing' in c) c.letterSpacing = '0px';
  const pr = sh * 0.36,
    px = sx - pr * 0.55,
    py = sy + sh * 0.62;
  c.save();
  c.strokeStyle = hexA(accent, 0.6);
  c.fillStyle = hexA(accent, 0.7);
  c.lineWidth = u * 0.4;
  c.beginPath();
  c.arc(px, py, pr, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = u * 0.22;
  c.beginPath();
  c.arc(px, py, pr * 0.78, 0, Math.PI * 2);
  c.stroke();
  for (let k = -1; k <= 1; k++) {
    c.beginPath();
    for (let x = 0; x <= pr * 2.2; x += u * 0.5) c.lineTo(px - pr - u - x, py + k * pr * 0.34 + Math.sin(x / (u * 1.8)) * u * 0.7);
    c.stroke();
  }
  c.font = `600 ${pr * 0.24}px "Hind",sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(postmarkWord(t), px, py - pr * 0.18);
  c.fillText(String(new Date().getFullYear()), px, py + pr * 0.2);
  c.restore();

  // Recipient: "To" in the greeting font, then lines to write on and PIN boxes.
  const ax = W * 0.42,
    aw = W - m - ax,
    lines = [bk.to, ...bk.address.split('\n')].map((s) => s.trim()).filter(Boolean).slice(0, 4),
    rows = 4,
    pinH = u * 6.6,
    top = H * 0.4,
    bottomY = H - bh - u * 5,
    gap = (bottomY - pinH - u * 3 - top) / rows;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillStyle = accent;
  c.font = fontStr(head.n, head.hw, u * 7);
  c.fillText('To', ax, top);
  c.strokeStyle = hexA(ink, 0.28);
  c.lineWidth = u * 0.22;
  c.fillStyle = ink;
  for (let i = 0; i < rows; i++) {
    const y = top + gap * (i + 1);
    c.beginPath();
    c.moveTo(ax, y);
    c.lineTo(ax + aw, y);
    c.stroke();
    const l = lines[i];
    if (l) {
      let px2 = Math.min(gap * 0.66, u * 6.4);
      c.font = fontStr(hand.n, hand.bw, px2);
      while (c.measureText(l).width > aw - u && px2 > u) {
        px2 *= 0.93;
        c.font = fontStr(hand.n, hand.bw, px2);
      }
      c.fillText(l, ax + u, y - u * 1.1);
    }
  }
  const py2 = bottomY - pinH,
    pin = bk.pin.replace(/\D/g, '').slice(0, 6);
  c.fillStyle = hexA(ink, 0.6);
  c.font = `600 ${u * 2.8}px "Hind",sans-serif`;
  c.fillText('PIN', ax, py2 + pinH * 0.68);
  const bx = ax + c.measureText('PIN').width + u * 2.5;
  c.strokeStyle = hexA(ink, 0.45);
  c.lineWidth = u * 0.25;
  c.fillStyle = ink;
  for (let i = 0; i < 6; i++) {
    const x = bx + i * (pinH + u * 0.8);
    c.strokeRect(x, py2, pinH, pinH);
    if (pin[i]) {
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = fontStr(hand.n, hand.bw, pinH * 0.72);
      c.fillText(pin[i], x + pinH / 2, py2 + pinH * 0.55);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
    }
  }

  // The design's greeting, bottom left above the border: ties the envelope to the card inside.
  const greet = d.showHeading ? d.heading.trim() : '';
  if (greet) {
    const maxW = ax - m - u * 6;
    let px3 = u * 8;
    c.font = fontStr(head.n, head.hw, px3);
    while (c.measureText(greet).width > maxW && px3 > u * 2) {
      px3 *= 0.93;
      c.font = fontStr(head.n, head.hw, px3);
    }
    c.fillStyle = accent;
    c.textAlign = 'left';
    c.fillText(greet, m, H - bh - u * 5.5);
  }
}

function drawBackFace(c: Ctx, W: number, H: number, inp: RenderInput, t: Theme, face: Exclude<EnvelopeFace, 'front'>, geo: Geo, pxmm: number): void {
  const d = inp.d,
    u = H / 100,
    ink = darkInk(t),
    paper = paperOf(d, t),
    side = geo.side * pxmm,
    bot = geo.bottom * pxmm;
  const flapArt = () => {
    c.save();
    flapPath(c, d, 0, 0, W, H);
    c.clip();
    if (d.env.art || d.env.paper === 'occasion') drawThemeBg(c, { x: 0, y: 0, w: W, h: H, e: 0 }, t, d.env.art);
    else {
      c.fillStyle = mix(paper, '#000000', 0.06);
      c.fillRect(0, 0, W, H);
    }
    // A fine accent line just inside the edge.
    c.strokeStyle = hexA(t.accent, 0.75);
    c.lineWidth = u * 1.2;
    flapPath(c, d, 0, 0, W, H);
    c.stroke();
    c.restore();
  };
  if (face === 'liner') {
    // Inside of the flap: the occasion pattern, seen when the flap opens.
    c.save();
    flapPath(c, d, 0, 0, W, H);
    c.clip();
    drawThemeBg(c, { x: 0, y: 0, w: W, h: H, e: 0 }, t, true);
    c.fillStyle = hexA('#FFFFFF', 0.18);
    c.fillRect(0, 0, W, H);
    c.restore();
    return;
  }
  if (face !== 'flap') {
    // Inside of the front panel, seen between the flaps.
    c.fillStyle = mix(paper, '#000000', 0.05);
    c.fillRect(0, 0, W, H);
    // Side flaps, then the bottom flap over them, each with a soft shadow and a crisp edge.
    const panel = (draw: () => void, shadowY: number) => {
      c.save();
      c.shadowColor = 'rgba(0,0,0,.16)';
      c.shadowBlur = u * 2.2;
      c.shadowOffsetY = shadowY;
      draw();
      c.fillStyle = paper;
      c.fill();
      c.restore();
      draw();
      c.strokeStyle = hexA(ink, 0.12);
      c.lineWidth = u * 0.3;
      c.stroke();
    };
    panel(() => sidePath(c, W, H, side, false), 0);
    panel(() => sidePath(c, W, H, side, true), 0);
    c.save();
    bottomPath(c, W, H, bot);
    c.clip();
    grain(c, W, H, ink, 'back' + d.themeId);
    c.restore();
    panel(() => bottomPath(c, W, H, bot), -u * 0.6);
    c.save();
    bottomPath(c, W, H, bot);
    c.clip();
    grain(c, W, H, ink, 'back' + d.themeId);
    // The Chitthi mark: the product stamp, bottom centre of every envelope.
    const mr = H * 0.075;
    drawChitthiMark(c, W / 2, H - H * 0.19, mr, hexA(ink, 0.5));
    c.fillStyle = hexA(ink, 0.45);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.font = `600 ${u * 2.2}px "Hind",sans-serif`;
    if ('letterSpacing' in c) c.letterSpacing = `${u * 0.4}px`;
    c.fillText('MADE WITH CHITTHI', W / 2, H - H * 0.19 + mr + u * 4);
    if ('letterSpacing' in c) c.letterSpacing = '0px';
    c.restore();
  }
  if (face === 'body') return;
  // The closing flap, with a soft shadow on the back, and the seal at its tip.
  c.save();
  c.shadowColor = 'rgba(0,0,0,.22)';
  c.shadowBlur = u * 2.4;
  c.shadowOffsetY = u * 0.8;
  flapPath(c, d, 0, 0, W, H);
  c.fillStyle = paper;
  c.fill();
  c.restore();
  flapArt();
  const s = sealAt(d, W, H);
  drawSeal(c, inp, t, s.x, s.y, s.r);
}

/* ---------- fold-your-own template ---------- */

export const TEMPLATE_SHEETS: [id: string, w: number, h: number, name: string][] = [
  ['a4', 210, 297, 'A4'],
  ['letter', 215.9, 279.4, 'US Letter'],
  ['a3', 297, 420, 'A3'],
  ['1319', 330.2, 482.6, '13×19 in'],
];
const TMARGIN = 5,
  TFOOT = 12,
  TBLEED = 2;

interface Net {
  /** Side flap width, bottom flap depth (mm). */
  side: number;
  bottom: number;
  top: number;
  w: number;
  h: number;
}
function netOf(d: Design, spec: EnvelopeSpec): Net {
  const { side, bottom } = geoOf(spec),
    top = spec.h * (flapDepth(d) + (d.env.style === 'wallet' ? 0.1 : 0));
  return { side, bottom, top, w: spec.w + 2 * side, h: spec.h + top + bottom };
}

export interface TemplateSheet {
  id: string;
  name: string;
  /** Page size in mm, in the orientation used. */
  w: number;
  h: number;
}
/** The smallest sheet the flat envelope fits on (either way round), or null when it's too big for 13×19 in. */
export function templateSheet(d: Design): TemplateSheet | null {
  const spec = envelopeSpec(d),
    n = netOf(d, spec);
  for (const [id, a, b, name] of TEMPLATE_SHEETS)
    for (const [w, h] of [
      [a, b],
      [b, a],
    ])
      if (n.w + 2 * TMARGIN <= w && n.h + 2 * TMARGIN + TFOOT <= h) return { id, name, w, h };
  return null;
}

/**
 * The flat envelope on its sheet, printed on one side: the address front in the middle; side, bottom and closing
 * flaps around it. Flaps fold behind the front, so the closing flap's artwork is drawn turned 180° and ends up the
 * right way round on the back. Solid lines are cuts, dashed lines are folds.
 */
export function renderEnvelopeTemplate(cv: HTMLCanvasElement, pxmm: number, inp: RenderInput): TemplateSheet | null {
  const d = inp.d,
    sheet = templateSheet(d);
  if (!sheet) return null;
  const spec = envelopeSpec(d),
    n = netOf(d, spec),
    t = resolveTheme(d),
    paper = paperOf(d, t);
  cv.width = Math.round(sheet.w * pxmm);
  cv.height = Math.round(sheet.h * pxmm);
  const c = cv.getContext('2d');
  if (!c) return sheet;
  c.fillStyle = '#FFFFFF';
  c.fillRect(0, 0, cv.width, cv.height);
  c.scale(pxmm, pxmm);
  const x0 = (sheet.w - n.w) / 2 + n.side,
    y0 = (sheet.h - TFOOT - n.h) / 2 + n.top,
    W = spec.w,
    H = spec.h;

  // Outline of each flap, in sheet mm.
  const sides = (dir: -1 | 1) => {
    const ex = dir < 0 ? x0 : x0 + W,
      o = dir * n.side;
    c.moveTo(ex, y0);
    c.lineTo(ex, y0 + H * 0.04);
    c.lineTo(ex + o, y0 + H * 0.2);
    c.lineTo(ex + o, y0 + H * 0.8);
    c.lineTo(ex, y0 + H * 0.96);
    c.lineTo(ex, y0 + H);
  };
  const bottom = () => {
    const in1 = W * 0.08;
    c.moveTo(x0, y0 + H);
    c.lineTo(x0 + in1, y0 + H + n.bottom * 0.9);
    c.quadraticCurveTo(x0 + W / 2, y0 + H + n.bottom * 1.08, x0 + W - in1, y0 + H + n.bottom * 0.9);
    c.lineTo(x0 + W, y0 + H);
  };
  const top = () => {
    // The back's flap shape, turned 180° about the top fold.
    c.save();
    c.translate(x0 + W, y0);
    c.scale(-1, -1);
    flapPath(c, d, 0, 0, W, H);
    c.restore();
  };
  const outline = () => {
    c.beginPath();
    c.rect(x0, y0, W, H);
    sides(-1);
    sides(1);
    bottom();
    c.closePath();
  };

  // Paper colour with a little bleed past every cut.
  c.fillStyle = paper;
  c.strokeStyle = paper;
  c.lineWidth = TBLEED * 2;
  c.lineJoin = 'round';
  outline();
  c.fill();
  c.stroke();
  top();
  c.fill();
  c.stroke();

  const k = Math.min(pxmm, 12);
  // Side and bottom flaps carry the back's artwork (including the Chitthi mark). Folded behind the front and turned
  // over, a side flap shows the opposite side of the back unchanged, and the bottom flap shows the back turned 180°.
  const body = document.createElement('canvas');
  renderEnvelope(body, 'body', k, inp);
  const clipTo = (path: () => void, place: () => void) => {
    c.save();
    c.beginPath();
    path();
    c.closePath();
    c.clip();
    place();
    c.restore();
  };
  clipTo(
    () => sides(-1),
    () => c.drawImage(body, x0 - W, y0, W, H),
  );
  clipTo(
    () => sides(1),
    () => c.drawImage(body, x0 + W, y0, W, H),
  );
  clipTo(bottom, () => {
    c.translate(x0 + W, y0 + 2 * H);
    c.scale(-1, -1);
    c.drawImage(body, 0, 0, W, H);
  });

  // Closing flap outside: the same artwork and seal as the back, turned 180°.
  c.save();
  c.translate(x0 + W, y0);
  c.scale(-1, -1);
  const fcv = document.createElement('canvas');
  renderEnvelope(fcv, 'flap', k, inp);
  c.drawImage(fcv, 0, 0, W, H);
  c.restore();

  // Address front in the centre panel.
  const front = document.createElement('canvas');
  renderEnvelope(front, 'front', k, inp);
  c.drawImage(front, x0, y0, W, H);

  // Cut lines (solid) and fold lines (dashed).
  c.lineWidth = 0.2;
  c.strokeStyle = '#8A8178';
  c.setLineDash([]);
  c.beginPath();
  sides(-1);
  sides(1);
  bottom();
  c.stroke();
  top();
  c.stroke();
  c.setLineDash([1.6, 1.2]);
  c.strokeStyle = '#B3A897';
  c.strokeRect(x0, y0, W, H);
  c.setLineDash([]);

  // How to make it.
  c.fillStyle = '#6A5E52';
  c.font = '600 3.2px Hind, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'alphabetic';
  const fy = sheet.h - TMARGIN;
  c.fillText(`Chitthi envelope · ${spec.name} · ${W} × ${H} mm · print at 100%`, sheet.w / 2, fy - 4.6);
  c.font = '500 2.8px Hind, sans-serif';
  c.fillText('Cut on the solid line. Fold on the dashed lines, behind the printed front: side flaps first, then glue the bottom flap onto them. Slide the card in and seal the top flap.', sheet.w / 2, fy, sheet.w - 2 * TMARGIN);
  return sheet;
}

/** Envelope summary for the print spec and the Print step. */
export function envelopeSummary(d: Design): string {
  const s = envelopeSpec(d),
    sh = templateSheet(d);
  return `${s.name}, ${s.w} × ${s.h} mm${sh ? `; fold-your-own template on ${sh.name}` : '; too big for a printable template, so print on a ready-made envelope'}`;
}
