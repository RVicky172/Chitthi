import type { Box, Design, Layout, LayoutId, Rect, Slot } from '../types';
import { sizeOf } from './design';

/** Grow a rect that touches the trim edge so it runs into the bleed. */
function extend(s: Rect, B: Box): Rect {
  const e = B.e,
    tol = 0.5;
  let l = s.x,
    t = s.y,
    r = s.x + s.w,
    bt = s.y + s.h;
  if (Math.abs(l - B.x) < tol) l -= e;
  if (Math.abs(t - B.y) < tol) t -= e;
  if (Math.abs(r - (B.x + B.w)) < tol) r += e;
  if (Math.abs(bt - (B.y + B.h)) < tol) bt += e;
  return { x: l, y: t, w: r - l, h: bt - t };
}

type SlotIn = Omit<Slot, 'd'>;

/** Computes photo slots and the text zone for a layout inside the card box B (all in canvas pixels). */
export function computeLayout(id: LayoutId, B: Box, d: Design): Layout {
  const land = B.w >= B.h,
    m = Math.min(B.w, B.h),
    pad = m * 0.075,
    g = m * 0.016,
    u = m / 100;
  const R = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
  const rs = (x: number, y: number, w: number, h: number): SlotIn => ({ s: 'rect', x, y, w, h, bleed: true });
  const plain = (r: Rect, s: Slot['s'] = 'rect'): SlotIn => ({ s, ...r });
  const right = (x: number) => R(x, B.y + pad, B.x + B.w - x - pad, B.h - pad * 2);
  const below = (y: number) => R(B.x + pad, y, B.w - pad * 2, B.y + B.h - y - pad);
  const L: Layout = {
    slots: [],
    text: null,
    onPhoto: false,
    bg: true,
    band: null,
    overlay: false,
    paper: null,
    stamp: null,
    post: null,
    ink: null,
    frame: false,
    frameLine: 0,
  };
  let slots: SlotIn[] = [];

  switch (id) {
    case 'full':
      L.bg = false;
      slots = [rs(B.x, B.y, B.w, B.h)];
      L.text = R(B.x + pad, B.y + pad, B.w - 2 * pad, B.h - 2 * pad);
      L.onPhoto = true;
      L.overlay = true;
      break;
    case 'magazine':
      L.bg = false;
      slots = [rs(B.x, B.y, B.w, B.h)];
      L.onPhoto = true;
      L.overlay = true;
      L.frameLine = pad * 0.5;
      L.text = land
        ? R(B.x + pad * 1.3, B.y + pad * 1.2, B.w * 0.55, B.h - pad * 2.4)
        : R(B.x + pad * 1.3, B.y + pad * 1.3, B.w - pad * 2.6, B.h * 0.42);
      break;
    case 'band':
      L.bg = false;
      slots = [rs(B.x, B.y, B.w, B.h)];
      L.overlay = true;
      L.band = land ? R(B.x + B.w * 0.6, B.y, B.w * 0.4, B.h) : R(B.x, B.y + B.h * 0.66, B.w, B.h * 0.34);
      L.text = R(L.band.x + pad * 0.8, L.band.y + pad * 0.8, L.band.w - pad * 1.6, L.band.h - pad * 1.6);
      break;
    case 'textfirst':
      if (land) {
        slots = [rs(B.x + B.w * 0.42, B.y, B.w * 0.58, B.h)];
        L.text = R(B.x + pad, B.y + pad, B.w * 0.42 - pad * 1.8, B.h - 2 * pad);
      } else {
        slots = [rs(B.x, B.y + B.h * 0.34, B.w, B.h * 0.66)];
        L.text = R(B.x + pad, B.y + pad, B.w - 2 * pad, B.h * 0.34 - pad * 1.5);
      }
      break;
    case 'split':
      if (land) {
        const sw = B.w * 0.52;
        slots = [rs(B.x, B.y, sw, B.h)];
        L.text = right(B.x + sw + pad);
      } else {
        const sh = B.h * 0.56;
        slots = [rs(B.x, B.y, B.w, sh)];
        L.text = below(B.y + sh + pad * 0.8);
      }
      break;
    case 'sandwich':
      if (land) {
        slots = [rs(B.x, B.y, B.w * 0.33, B.h), rs(B.x + B.w * 0.67, B.y, B.w * 0.33, B.h)];
        L.text = R(B.x + B.w * 0.33 + pad * 0.7, B.y + pad, B.w * 0.34 - pad * 1.4, B.h - 2 * pad);
      } else {
        slots = [rs(B.x, B.y, B.w, B.h * 0.36), rs(B.x, B.y + B.h * 0.64, B.w, B.h * 0.36)];
        L.text = R(B.x + pad, B.y + B.h * 0.36 + pad * 0.5, B.w - 2 * pad, B.h * 0.28 - pad);
      }
      break;
    case 'polaroid':
      if (land) {
        const ph = B.h - pad * 2,
          pw = Math.min(ph * 0.84, B.w * 0.5),
          fm = pw * 0.065;
        L.paper = R(B.x + pad * 1.2, B.y + pad, pw, ph);
        const s = Math.min(pw - 2 * fm, ph * 0.78);
        slots = [plain(R(L.paper.x + (pw - s) / 2, L.paper.y + fm, s, s))];
        L.text = right(L.paper.x + pw + pad);
      } else {
        const pw = B.w - pad * 2.2,
          ph = B.h - pad * 2,
          fm = pw * 0.065;
        L.paper = R(B.x + pad * 1.1, B.y + pad, pw, ph);
        const s = Math.min(pw - 2 * fm, ph * 0.68);
        slots = [plain(R(L.paper.x + (pw - s) / 2, L.paper.y + fm, s, s))];
        const ty = L.paper.y + fm + s + fm;
        L.text = R(L.paper.x + fm * 1.5, ty, pw - fm * 3, L.paper.y + ph - ty - fm);
        L.ink = 'frame';
      }
      break;
    case 'instax': {
      L.bg = false;
      L.frame = true;
      L.ink = 'frame';
      const sz = sizeOf(d);
      let sl: Rect,
        rot = false;
      if (sz.instax) {
        const sp = sz.instax,
          nat = sz.native ?? 'portrait',
          nw = nat === 'portrait' ? sz.S : sz.L,
          nh = nat === 'portrait' ? sz.L : sz.S;
        rot = d.orient !== nat;
        sl = !rot
          ? R(B.x + (B.w * sp.side) / nw, B.y + (B.h * sp.top) / nh, (B.w * sp.w) / nw, (B.h * sp.h) / nh)
          : R(B.x + (B.w * sp.top) / nh, B.y + (B.h * sp.side) / nw, (B.w * sp.h) / nh, (B.h * sp.w) / nw);
      } else {
        const s = m * 0.07;
        sl = R(B.x + s, B.y + s, B.w - 2 * s, B.h - s - B.h * 0.22);
      }
      slots = [plain(sl)];
      L.text = rot
        ? R(sl.x + sl.w + u * 3, sl.y, B.x + B.w - (sl.x + sl.w) - u * 6, sl.h)
        : R(sl.x + u, sl.y + sl.h + u * 2, sl.w - u * 2, B.y + B.h - (sl.y + sl.h) - u * 4);
      break;
    }
    case 'photobooth':
      if (!land) {
        const sw = B.w * 0.46,
          st = R(B.x + pad * 0.9, B.y + pad * 0.8, sw, B.h - pad * 1.6),
          fm = sw * 0.07,
          fh = (st.h - fm * 4) / 3;
        L.paper = st;
        slots = [0, 1, 2].map((i) => plain(R(st.x + fm, st.y + fm + i * (fh + fm), sw - 2 * fm, fh)));
        L.text = right(st.x + sw + pad * 0.9);
      } else {
        const sh = B.h * 0.54,
          st = R(B.x + pad * 0.8, B.y + pad * 0.8, B.w - pad * 1.6, sh),
          fm = sh * 0.07,
          fw = (st.w - fm * 4) / 3;
        L.paper = st;
        slots = [0, 1, 2].map((i) => plain(R(st.x + fm + i * (fw + fm), st.y + fm, fw, sh - 2 * fm)));
        L.text = below(st.y + sh + pad * 0.7);
      }
      break;
    case 'arch':
      if (land) {
        const ah = B.h - pad * 2.2,
          aw = Math.min(ah * 0.66, B.w * 0.44),
          sl = R(B.x + pad * 1.3, B.y + (B.h - ah) / 2, aw, ah);
        slots = [plain(sl, 'arch')];
        L.text = right(sl.x + aw + pad);
      } else {
        const aw = B.w * 0.64,
          ah = Math.min(aw * 1.32, B.h * 0.58),
          sl = R(B.x + (B.w - aw) / 2, B.y + pad * 1.2, aw, ah);
        slots = [plain(sl, 'arch')];
        L.text = below(sl.y + ah + pad * 0.7);
      }
      break;
    case 'window':
      if (land) {
        const wh = B.h - pad * 2.4,
          ww = Math.min(B.w * 0.48, wh * 0.82),
          sl = R(B.x + pad * 1.3, B.y + (B.h - wh) / 2, ww, wh);
        slots = [plain(sl, 'round')];
        L.text = right(sl.x + ww + pad);
      } else {
        const ww = B.w * 0.8,
          wh = Math.min(B.h * 0.6, ww * 1.3),
          sl = R(B.x + (B.w - ww) / 2, B.y + pad * 1.2, ww, wh);
        slots = [plain(sl, 'round')];
        L.text = below(sl.y + wh + pad * 0.7);
      }
      break;
    case 'circle':
      if (land) {
        const dd = Math.min(B.h - pad * 2.2, B.w * 0.46),
          sl = R(B.x + pad * 1.3, B.y + (B.h - dd) / 2, dd, dd);
        slots = [plain(sl, 'circle')];
        L.text = right(sl.x + dd + pad);
      } else {
        const dd = Math.min(B.w * 0.7, B.h * 0.5),
          sl = R(B.x + (B.w - dd) / 2, B.y + pad * 1.2, dd, dd);
        slots = [plain(sl, 'circle')];
        L.text = below(sl.y + dd + pad * 0.7);
      }
      break;
    case 'stamp': {
      let st: Rect;
      if (land) {
        const sh = B.h - pad * 2.6,
          sw = Math.min(sh * 0.8, B.w * 0.42);
        st = R(B.x + pad * 1.3, B.y + (B.h - sh) / 2, sw, sh);
      } else {
        const sw = B.w * 0.6,
          sh = Math.min(sw * 1.22, B.h * 0.56);
        st = R(B.x + (B.w - sw) / 2, B.y + pad * 1.3, sw, sh);
      }
      L.stamp = st;
      const im = u * 3.2;
      slots = [plain(R(st.x + im, st.y + im, st.w - 2 * im, st.h - 2 * im - u * 5))];
      L.post = { x: st.x + st.w - u, y: st.y + u * 5, r: u * 8.5 };
      L.text = land ? right(st.x + st.w + pad + u * 6) : below(st.y + st.h + pad * 0.8);
      break;
    }
    case 'collage2':
      if (land) {
        const aw = B.w * 0.6;
        slots = [rs(B.x, B.y, aw, (B.h - g) / 2), rs(B.x, B.y + (B.h + g) / 2, aw, (B.h - g) / 2)];
        L.text = right(B.x + aw + pad);
      } else {
        const ah = B.h * 0.58;
        slots = [rs(B.x, B.y, (B.w - g) / 2, ah), rs(B.x + (B.w + g) / 2, B.y, (B.w - g) / 2, ah)];
        L.text = below(B.y + ah + pad * 0.8);
      }
      break;
    case 'collage3':
      if (land) {
        const w1 = B.w * 0.38,
          w2 = B.w * 0.24;
        slots = [
          rs(B.x, B.y, w1, B.h),
          rs(B.x + w1 + g, B.y, w2, (B.h - g) / 2),
          rs(B.x + w1 + g, B.y + (B.h + g) / 2, w2, (B.h - g) / 2),
        ];
        L.text = right(B.x + w1 + g + w2 + pad);
      } else {
        const h1 = B.h * 0.36,
          h2 = B.h * 0.22;
        slots = [
          rs(B.x, B.y, B.w, h1),
          rs(B.x, B.y + h1 + g, (B.w - g) / 2, h2),
          rs(B.x + (B.w + g) / 2, B.y + h1 + g, (B.w - g) / 2, h2),
        ];
        L.text = below(B.y + h1 + g + h2 + pad * 0.8);
      }
      break;
    case 'mosaic':
      if (land) {
        const w1 = B.w * 0.42,
          w2 = B.w * 0.18,
          sh = (B.h - 2 * g) / 3;
        slots = [rs(B.x, B.y, w1, B.h), ...[0, 1, 2].map((i) => rs(B.x + w1 + g, B.y + i * (sh + g), w2, sh))];
        L.text = right(B.x + w1 + g + w2 + pad);
      } else {
        const h1 = B.h * 0.46,
          h2 = B.h * 0.2,
          sw = (B.w - 2 * g) / 3;
        slots = [rs(B.x, B.y, B.w, h1), ...[0, 1, 2].map((i) => rs(B.x + i * (sw + g), B.y + h1 + g, sw, h2))];
        L.text = below(B.y + h1 + g + h2 + pad * 0.7);
      }
      break;
    case 'collage4':
      if (land) {
        const aw = B.w * 0.62,
          cw = (aw - g) / 2,
          ch = (B.h - g) / 2;
        slots = [
          rs(B.x, B.y, cw, ch),
          rs(B.x + cw + g, B.y, cw, ch),
          rs(B.x, B.y + ch + g, cw, ch),
          rs(B.x + cw + g, B.y + ch + g, cw, ch),
        ];
        L.text = right(B.x + aw + pad);
      } else {
        const ah = B.h * 0.62,
          cw = (B.w - g) / 2,
          ch = (ah - g) / 2;
        slots = [
          rs(B.x, B.y, cw, ch),
          rs(B.x + cw + g, B.y, cw, ch),
          rs(B.x, B.y + ch + g, cw, ch),
          rs(B.x + cw + g, B.y + ch + g, cw, ch),
        ];
        L.text = below(B.y + ah + pad * 0.8);
      }
      break;
    case 'text':
      L.text = R(B.x + pad * 1.3, B.y + pad * 1.3, B.w - pad * 2.6, B.h - pad * 2.6);
      break;
  }
  L.slots = slots.map((s) => ({ ...s, d: s.bleed ? extend(s, B) : { x: s.x, y: s.y, w: s.w, h: s.h } }));
  if (L.band) L.band = extend(L.band, B);
  return L;
}
