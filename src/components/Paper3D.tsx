import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { PRINT_SPECS } from '../data/printSpecs';
import { productOf, sizesFor } from '../data/products';
import { cardMM, productDesign } from '../engine/design';
import { envelopeSpec, renderEnvelope } from '../engine/envelope';
import { nup, SHEETS } from '../engine/export';
import { renderCard } from '../engine/render';
import { samplePhoto } from '../engine/sample';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { selectSize, switchProduct } from '../state/actions';
import { getState, setDesign, setUI, useApp } from '../state/store';
import type { Design, Orient, Photo, ProductId, SizeDef } from '../types';
import { Seg } from './common';
import { Logo } from './icons';

/*
 * Paper sizes in 3D (#/paper): every size Chitthi prints, laid on a cutting mat at true relative scale, with a real
 * design on each face. Three views: side by side, stacked (largest at the bottom), and one size imposed on a print
 * sheet exactly as the sheet PDF does it. Built with CSS 3D transforms like the rest of the app's 3D (no WebGL):
 * drag to orbit, scroll or pinch to zoom, arrow keys too, and an "actual size" top view.
 */

type GroupId = ProductId | 'envelope' | 'sheet' | 'ref';
type Mode = 'side' | 'stack' | 'sheet';
type OrientPick = 'natural' | 'portrait' | 'landscape';
type SheetId = Design['exp']['sheet'];

const GROUPS: [GroupId, string, string][] = [
  ['postcard', 'Postcards', '#E8833A'],
  ['calendar', 'Calendars', '#3B82F6'],
  ['frame', 'Frame prints', '#8B5CF6'],
  ['magnet', 'Magnets', '#EC4899'],
  ['envelope', 'Envelopes', '#B08D5B'],
  ['sheet', 'Print sheets', '#94A3B8'],
  ['ref', 'Reference', '#10B981'],
];
const groupOf = (g: GroupId) => GROUPS.find((x) => x[0] === g)!;

interface Piece {
  id: string;
  name: string;
  group: GroupId;
  /** Size in mm as it lies on the mat. */
  w: number;
  h: number;
  circle?: boolean;
  corner: number;
  tag?: string;
  /** Product pieces: the size and the design drawn on the face. */
  size?: SizeDef;
  design?: Design;
  /** Envelopes: the sizes that go in it. */
  fits?: string[];
  note?: string;
}

const MM_PX = 96 / 25.4; // CSS pixels per millimetre: "actual size" on a correctly calibrated screen
const BLEED = 3;
const r1 = (n: number) => Math.round(n * 10) / 10;
const inch = (mm: number) => r1(mm / 25.4);
const px300 = (mm: number) => Math.round((mm / 25.4) * 300);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function orientFor(s: SizeDef, p: ProductId, pick: OrientPick): Orient {
  if (s.L === s.S) return 'portrait';
  if (pick !== 'natural') return pick;
  return s.native ?? (p === 'calendar' || p === 'frame' ? 'portrait' : 'landscape');
}

function designFor(p: ProductId, s: SizeDef, orient: Orient): Design {
  const d = productDesign(p, getState().design);
  return { ...d, sizeId: s.id, orient, layout: s.instax ? 'instax' : d.layout, exp: { ...d.exp, bleed: String(BLEED), marks: true } };
}

/** Every piece the page can show, in the chosen orientation. */
function allPieces(pick: OrientPick): Piece[] {
  const out: Piece[] = [];
  const envs = new Map<string, Piece>();
  for (const p of ['postcard', 'calendar', 'frame', 'magnet'] as ProductId[]) {
    for (const s of sizesFor(p).filter((x) => x.id !== 'custom')) {
      const o = orientFor(s, p, pick),
        d = designFor(p, s, o),
        { w, h } = cardMM(d);
      out.push({
        id: `${p}:${s.id}`,
        name: `${s.name}${p === 'postcard' || s.name.includes(productOf(p).short) ? '' : ` ${productOf(p).short.toLowerCase()}`}`,
        group: p,
        w,
        h,
        circle: s.shape === 'circle',
        corner: s.corner ?? (s.instax ? 3 : 0),
        tag: s.tag,
        size: s,
        design: d,
      });
      const e = envelopeSpec(d),
        key = e.name;
      const label = `${s.name} ${productOf(p).short.toLowerCase()}`;
      if (!envs.has(key)) {
        const ew = pick === 'portrait' ? e.h : e.w,
          eh = pick === 'portrait' ? e.w : e.h;
        envs.set(key, { id: `env:${key}`, name: `${key} envelope`, group: 'envelope', w: ew, h: eh, corner: 0, design: { ...d, env: { ...d.env, on: true } }, fits: [label] });
      } else envs.get(key)!.fits!.push(label);
    }
  }
  out.push(...[...envs.values()]);
  for (const [id, [w, h, name]] of Object.entries(SHEETS) as [SheetId, [number, number, string]][]) {
    const land = pick === 'landscape';
    out.push({
      id: `sheet:${id}`,
      name: `${name} sheet`,
      group: 'sheet',
      w: land ? h : w,
      h: land ? w : h,
      corner: 0,
      note: 'A sheet the print shop prints on. Sheet PDFs place as many pieces on it as fit, with crop marks.',
    });
  }
  out.push(
    { id: 'ref:card', name: 'Bank card', group: 'ref', w: 85.6, h: 53.98, corner: 3.2, note: 'A debit or credit card (85.6 × 54 mm), to judge sizes against something in your wallet.' },
    { id: 'ref:coin', name: '₹10 coin', group: 'ref', w: 27, h: 27, circle: true, corner: 0, note: 'A ₹10 coin is 27 mm across.' },
  );
  return out;
}

/* ---------- faces: real Chitthi renders, drawn once and cached ---------- */

const faces = new Map<string, string>();
let samples: Photo[] | null = null;
async function faceOf(pc: Piece): Promise<string | null> {
  if (!pc.design) return null;
  const key = `${pc.id}:${pc.w}x${pc.h}`;
  const hit = faces.get(key);
  if (hit) return hit;
  samples ??= [0, 1, 2, 3].map((i) => samplePhoto(i, 480, 340));
  await ensureFonts(fontsFor(pc.design));
  const cv = document.createElement('canvas'),
    k = Math.min(3, 420 / Math.max(pc.w, pc.h));
  if (pc.group === 'envelope') renderEnvelope(cv, 'front', k, { d: pc.design, photos: samples });
  else renderCard(cv, 'front', k, 0, { d: pc.design, photos: samples }, { thumb: true });
  const url = cv.toDataURL('image/jpeg', 0.82);
  faces.set(key, url);
  return url;
}

/* ---------- arrangements (all in mm; z in screen pixels) ---------- */

interface Placed {
  pc: Piece;
  x: number;
  y: number;
  z: number;
  /** Turned 90° (a piece imposed sideways on a sheet). */
  rot?: boolean;
  w: number;
  h: number;
}
const LABEL = 16,
  GAP = 18;

function sideBySide(ps: Piece[]): { placed: Placed[]; w: number; h: number } {
  if (!ps.length) return { placed: [], w: 300, h: 200 };
  const items = [...ps].sort((a, b) => b.w * b.h - a.w * a.h);
  const area = items.reduce((s, p) => s + (p.w + GAP) * (p.h + GAP + LABEL), 0),
    maxW = Math.max(...items.map((p) => p.w), Math.sqrt(area * 1.7));
  const rows: { items: Piece[]; w: number; h: number }[] = [];
  let row = { items: [] as Piece[], w: 0, h: 0 };
  for (const p of items) {
    if (row.items.length && row.w + GAP + p.w > maxW) {
      rows.push(row);
      row = { items: [], w: 0, h: 0 };
    }
    row.w += (row.items.length ? GAP : 0) + p.w;
    row.h = Math.max(row.h, p.h);
    row.items.push(p);
  }
  rows.push(row);
  const total = rows.reduce((s, r) => s + r.h + LABEL, 0) + GAP * (rows.length - 1),
    W = Math.max(...rows.map((r) => r.w));
  const placed: Placed[] = [];
  let y = -total / 2;
  for (const r of rows) {
    let x = -r.w / 2;
    for (const p of r.items) {
      // Pieces in a row share a baseline, so their labels line up.
      placed.push({ pc: p, x: x + p.w / 2, y: y + r.h - p.h / 2, z: 0, w: p.w, h: p.h });
      x += p.w + GAP;
    }
    y += r.h + LABEL + GAP;
  }
  return { placed, w: W, h: total };
}

function stacked(ps: Piece[]): { placed: Placed[]; w: number; h: number } {
  const items = [...ps].sort((a, b) => b.w * b.h - a.w * a.h);
  const step = Math.min(12, 150 / Math.max(1, items.length));
  return {
    placed: items.map((p, i) => ({ pc: p, x: 0, y: 0, z: i * step, w: p.w, h: p.h })),
    w: Math.max(100, ...items.map((p) => p.w)),
    h: Math.max(100, ...items.map((p) => p.h)),
  };
}

function onSheet(pc: Piece, sheet: SheetId, lift: number): { placed: Placed[]; w: number; h: number; count: number; sheetPc: Piece } {
  const [SW, SH, name] = SHEETS[sheet];
  const sheetPc: Piece = { id: `sheet:${sheet}`, name: `${name} sheet`, group: 'sheet', w: SW, h: SH, corner: 0 };
  const placed: Placed[] = [{ pc: sheetPc, x: 0, y: 0, z: 0, w: SW, h: SH }];
  if (!pc.design) return { placed, w: SW, h: SH, count: 0, sheetPc };
  const n = nup({ ...pc.design, exp: { ...pc.design.exp, sheet } }),
    gw = n.cols * n.cw + (n.cols - 1) * n.gap,
    gh = n.rows * n.ch + (n.rows - 1) * n.gap,
    x0 = (SW - gw) / 2,
    y0 = (SH - gh) / 2;
  for (let r = 0; r < n.rows; r++)
    for (let c = 0; c < n.cols; c++)
      placed.push({
        pc,
        x: x0 + c * (n.cw + n.gap) + n.cw / 2 - SW / 2,
        y: y0 + r * (n.ch + n.gap) + n.ch / 2 - SH / 2,
        z: 2 + lift * (1 + (r * n.cols + c) * 0.04),
        w: n.w,
        h: n.h,
        rot: n.rot,
      });
  return { placed, w: SW, h: SH, count: n.cols * n.rows, sheetPc };
}

/* ---------- the page ---------- */

const VIEWS: Record<string, { tilt: number; spin: number }> = {
  top: { tilt: 0, spin: 0 },
  angled: { tilt: 52, spin: -18 },
  low: { tilt: 70, spin: -32 },
};

function area(pc: Piece): string {
  const a = pc.circle ? Math.PI * (pc.w / 2) ** 2 : pc.w * pc.h,
    k = a / (210 * 297);
  if (k > 0.94 && k < 1.06) return 'about the size of an A4 sheet';
  if (k > 1) return `${r1(k)} × the area of an A4 sheet`;
  const n = Math.round(1 / k);
  return n <= 1 ? 'a little smaller than A4' : `about 1/${n} of an A4 sheet`;
}

export function Paper3D() {
  const photosTick = useApp((s) => s.ui.fontTick);
  const [groups, setGroups] = useState<Set<GroupId>>(() => new Set(['postcard', 'sheet', 'ref'] as GroupId[]));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(['sheet:letter', 'sheet:1319']));
  const [mode, setMode] = useState<Mode>('side');
  const [pick, setPick] = useState<OrientPick>('natural');
  const [showFaces, setShowFaces] = useState(true);
  const [sheet, setSheet] = useState<SheetId>('a4');
  const [lift, setLift] = useState(40);
  const [sel, setSel] = useState<string | null>('postcard:4x6');
  const [hover, setHover] = useState<string | null>(null);
  const [cam, setCam] = useState({ tilt: 52, spin: -18, zoom: 1 });
  const [anim, setAnim] = useState(true);
  const [actual, setActual] = useState(false);
  // Screen-space pan: drag in actual-size view (or Shift + drag) to slide the mat.
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [view, setView] = useState({ w: 900, h: 560 });
  const [faceTick, setFaceTick] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const pieces = useMemo(() => allPieces(pick), [pick]);
  const shown = pieces.filter((p) => groups.has(p.group) && !hidden.has(p.id));
  const selected = pieces.find((p) => p.id === sel) ?? null;
  // The sheet view needs a product piece: the selected one, else the first product piece on show.
  const sheetPiece = selected?.design && selected.group !== 'envelope' ? selected : (shown.find((p) => p.design && p.group !== 'envelope') ?? pieces[0]);

  const scene = useMemo(() => {
    if (mode === 'sheet') return onSheet(sheetPiece, sheet, lift);
    return mode === 'stack' ? stacked(shown) : sideBySide(shown);
  }, [mode, shown.map((p) => p.id).join(), sheetPiece.id, sheet, lift, pick]);

  // Faces render in the background, a few at a time, and the scene picks them up as they arrive.
  useEffect(() => {
    if (!showFaces) return;
    let stop = false;
    void (async () => {
      const todo = [...new Map(scene.placed.map((p) => [p.pc.id, p.pc])).values()].filter((p) => p.design);
      for (const p of todo) {
        if (stop) return;
        await faceOf(p);
        await new Promise((r) => setTimeout(r, 0));
        if (!stop) setFaceTick((t) => t + 1);
      }
    })();
    return () => {
      stop = true;
    };
  }, [scene, showFaces, photosTick]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = mode === 'sheet' ? (scene as ReturnType<typeof onSheet>).count : 0;
  // Pixels per millimetre: fit the arrangement (plus its mat) in the view, then the user's zoom.
  const fit = Math.min((view.w * 0.96) / (scene.w + 60), (view.h * 0.92) / (scene.h + 60));
  const S = actual ? MM_PX : fit * cam.zoom;
  const tilt = actual ? 0 : cam.tilt,
    spin = actual ? 0 : cam.spin;

  /* ---------- orbit, zoom, pinch, keys ---------- */
  const drag = useRef<{ x: number; y: number; moved: number; pts: Map<number, { x: number; y: number }>; pinch: number } | null>(null);
  const setCamAnim = (c: Partial<typeof cam>, animate = true) => {
    setAnim(animate && !reduced());
    setActual(false);
    setCam((cur) => ({ ...cur, ...c }));
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const d = drag.current ?? { x: e.clientX, y: e.clientY, moved: 0, pts: new Map(), pinch: 0 };
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    d.x = e.clientX;
    d.y = e.clientY;
    if (d.pts.size === 2) {
      const [a, b] = [...d.pts.values()];
      d.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    drag.current = d;
    setAnim(false);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !d.pts.has(e.pointerId)) return;
    d.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pts.size === 2) {
      const [a, b] = [...d.pts.values()],
        dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (d.pinch) setCamAnim({ zoom: Math.min(8, Math.max(0.3, cam.zoom * (dist / d.pinch))) }, false);
      d.pinch = dist;
      d.moved += 10;
      return;
    }
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (d.moved <= 4) return;
    if (actual || e.shiftKey) {
      setAnim(false);
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    } else setCamAnim({ spin: cam.spin + dx * 0.35, tilt: Math.min(80, Math.max(0, cam.tilt - dy * 0.3)) }, false);
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.pts.delete(e.pointerId);
    if (!d.pts.size) {
      // A click without a drag picks the piece under the pointer.
      if (d.moved <= 4) {
        const hit = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-pid]');
        if (hit?.dataset.pid) setSel(hit.dataset.pid);
      }
      drag.current = null;
    }
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A non-passive listener so the page doesn't scroll while zooming the scene.
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setAnim(false);
      setActual(false);
      setCam((c) => ({ ...c, zoom: Math.min(8, Math.max(0.3, c.zoom * Math.exp(-e.deltaY * 0.0015))) }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const onKey = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight') setCamAnim({ spin: spin + (k === 'ArrowLeft' ? -8 : 8) });
    else if (k === 'ArrowUp' || k === 'ArrowDown') setCamAnim({ tilt: Math.min(80, Math.max(0, tilt + (k === 'ArrowUp' ? -6 : 6))) });
    else if (k === '+' || k === '=') setCamAnim({ zoom: Math.min(8, cam.zoom * 1.2) });
    else if (k === '-' || k === '_') setCamAnim({ zoom: Math.max(0.3, cam.zoom / 1.2) });
    else if (k === '0') setCamAnim({ ...VIEWS.angled, zoom: 1 });
    else return;
    e.preventDefault();
  };

  const toggleGroup = (g: GroupId) =>
    setGroups((cur) => {
      const n = new Set(cur);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  const toggleHidden = (id: string) =>
    setHidden((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const design = (pc: Piece) => {
    if (!pc.size || !pc.design) return;
    switchProduct(pc.design.product);
    selectSize(pc.size);
    if (!pc.size.instax) setDesign({ orient: pc.design.orient });
    setUI({ screen: 'studio', pane: 'layout', side: 'front', slot: 0, calPage: 0 });
  };

  const worldStyle: CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) rotateX(${tilt}deg) rotateZ(${spin}deg)`,
    transition: anim ? 'transform .7s cubic-bezier(.2,.7,.2,1)' : 'none',
  };
  const matW = scene.w + 60,
    matH = scene.h + 60 + (mode === 'side' ? LABEL : 0);
  void faceTick;

  return (
    <div className="landing sg p3">
      <nav className="lnav" aria-label="Main">
        <a
          className="lbrand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setUI({ screen: 'home' });
          }}
        >
          <Logo />
          <span>Chitthi</span>
        </a>
        <button type="button" className="btn ghost" onClick={() => setUI({ screen: 'sizes' })}>
          Sizes guide
        </button>
        <button type="button" className="btn ghost" onClick={() => setUI({ finder: true })}>
          Find a feature
        </button>
        <button type="button" className="btn primary" onClick={() => setUI({ screen: 'studio' })}>
          Open studio
        </button>
      </nav>
      <main>
        <header className="sg-head">
          <h1>Paper sizes in 3D</h1>
          <p className="lsec-sub">
            Every size Chitthi prints, drawn to the same scale on a cutting mat, with a real design on each. Drag to turn the
            mat, scroll or pinch to zoom, and click a piece to see its numbers.
          </p>
        </header>

        <div className="p3-bar">
          <Seg<Mode>
            label="View"
            value={mode}
            options={[
              ['side', 'Side by side'],
              ['stack', 'Stacked'],
              ['sheet', 'On a print sheet'],
            ]}
            onChange={(m) => {
              setMode(m);
              setPan({ x: 0, y: 0 });
              setActual(false);
              setCamAnim({ ...(m === 'stack' ? VIEWS.low : VIEWS.angled), zoom: 1 });
            }}
          />
          {mode !== 'sheet' && (
            <div className="chips" role="group" aria-label="Show">
              {GROUPS.map(([g, name, col]) => (
                <button key={g} type="button" className="chip" aria-pressed={groups.has(g)} onClick={() => toggleGroup(g)}>
                  <i className="p3-dot" style={{ background: col }} />
                  {name}
                </button>
              ))}
            </div>
          )}
          {mode === 'sheet' && (
            <>
              <Seg<SheetId>
                label="Sheet"
                value={sheet}
                options={(Object.entries(SHEETS) as [SheetId, [number, number, string]][]).map(([id, v]) => [id, v[2]])}
                onChange={setSheet}
              />
              <label className="f p3-lift">
                Lift the pieces
                <input type="range" min={0} max={140} value={lift} onChange={(e) => setLift(+e.target.value)} />
              </label>
            </>
          )}
        </div>

        <div className="p3-main">
          <div className="p3-stagewrap">
            <div
              className={`p3-view${actual ? ' actual' : ''}`}
              ref={box}
              tabIndex={0}
              role="application"
              aria-label="3D view of paper sizes. Drag or use the arrow keys to turn, Shift and drag to move, scroll or plus and minus to zoom."
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onKeyDown={onKey}
            >
              <div className="p3-world" style={worldStyle}>
                <div
                  className="p3-mat"
                  style={{
                    width: matW * S,
                    height: matH * S,
                    left: (-matW / 2) * S,
                    top: (-matH / 2) * S,
                    backgroundSize: `${10 * S}px ${10 * S}px, ${10 * S}px ${10 * S}px, ${50 * S}px ${50 * S}px, ${50 * S}px ${50 * S}px`,
                  }}
                />
                {scene.placed.map((p, i) => {
                  const col = groupOf(p.pc.group)[2],
                    face = showFaces ? faces.get(`${p.pc.id}:${p.pc.w}x${p.pc.h}`) : undefined,
                    on = p.pc.id === sel && mode !== 'sheet',
                    hov = p.pc.id === hover;
                  const radius = p.pc.circle ? '50%' : `${p.pc.corner * S}px`;
                  return (
                    <div
                      key={`${p.pc.id}-${i}`}
                      data-pid={p.pc.id}
                      className={`p3-piece g-${p.pc.group}${on ? ' on' : ''}${hov ? ' hov' : ''}`}
                      style={{
                        width: p.w * S,
                        height: p.h * S,
                        left: (p.x - p.w / 2) * S,
                        top: (p.y - p.h / 2) * S,
                        transform: `translateZ(${p.z + (on || hov ? 6 : 0)}px)`,
                        borderRadius: radius,
                        ['--c' as string]: col,
                        transition: reduced() ? 'none' : undefined,
                      }}
                      onPointerEnter={() => setHover(p.pc.id)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <div className="p3-shadow" style={{ borderRadius: radius, transform: `translateZ(${-p.z - (on || hov ? 6 : 0) + 0.5}px)` }} />
                      <div className="p3-edge" style={{ borderRadius: radius }} />
                      <div className="p3-face" style={{ borderRadius: radius }}>
                        {face ? (
                          <img
                            src={face}
                            alt=""
                            draggable={false}
                            style={p.rot ? { width: p.h * S, height: p.w * S, transform: `translate(-50%,-50%) rotate(90deg)`, left: '50%', top: '50%', position: 'absolute' } : undefined}
                          />
                        ) : (
                          <span className="p3-plain" style={{ fontSize: Math.max(6, Math.min(p.w, p.h) * S * 0.12) }}>
                            {p.pc.group === 'sheet' || p.pc.group === 'ref' || !showFaces ? p.pc.name : ''}
                          </span>
                        )}
                      </div>
                      {mode === 'side' && (
                        <span className="p3-label" style={{ top: p.h * S + 2 * S, width: (p.w + GAP * 0.8) * S, fontSize: Math.max(7, 3.6 * S) }}>
                          {p.pc.name}
                          <small>
                            {p.pc.circle ? `${r1(p.pc.w)} mm across` : `${r1(p.pc.w)} × ${r1(p.pc.h)} mm`}
                          </small>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {!scene.placed.length && <p className="p3-empty">Pick something to show above.</p>}
              {mode === 'sheet' && (
                <p className="p3-count">
                  <b>{count || 'None'}</b> {sheetPiece.name} per {SHEETS[sheet][2]} sheet
                  {count ? `, ${Math.ceil(100 / count)} sheets for 100 pieces` : ' (too big for this sheet)'}
                </p>
              )}
            </div>
            <div className="p3-cam" role="group" aria-label="Camera">
              <button type="button" className="btn ghost" aria-pressed={!actual && tilt === VIEWS.top.tilt && spin === 0} onClick={() => setCamAnim(VIEWS.top)}>
                Top
              </button>
              <button type="button" className="btn ghost" onClick={() => setCamAnim(VIEWS.angled)}>
                Angled
              </button>
              <button type="button" className="btn ghost" onClick={() => setCamAnim(VIEWS.low)}>
                Low
              </button>
              <button type="button" className="btn ghost" onClick={() => setCamAnim({ zoom: Math.max(0.3, cam.zoom / 1.25) })} aria-label="Zoom out">
                −
              </button>
              <button type="button" className="btn ghost" onClick={() => setCamAnim({ zoom: Math.min(8, cam.zoom * 1.25) })} aria-label="Zoom in">
                +
              </button>
              <button
                type="button"
                className="btn ghost"
                aria-pressed={actual}
                title="Top view at 1 mm = 1 mm on a typical screen: hold a card up to check"
                onClick={() => {
                  setAnim(!reduced());
                  // Actual size centres on the selected piece (1 mm on screen = 1 mm, so big sheets run off the edges).
                  const at = !actual ? scene.placed.find((p) => p.pc.id === sel) : undefined;
                  setPan(at ? { x: -at.x * MM_PX, y: -at.y * MM_PX } : { x: 0, y: 0 });
                  setActual(!actual);
                }}
              >
                Actual size
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setPan({ x: 0, y: 0 });
                  setCamAnim({ ...VIEWS.angled, zoom: 1 });
                }}
              >
                Reset
              </button>
            </div>
            <div className="p3-opts">
              <Seg<OrientPick>
                label="Orientation"
                value={pick}
                options={[
                  ['natural', 'As designed'],
                  ['portrait', 'All vertical'],
                  ['landscape', 'All horizontal'],
                ]}
                onChange={setPick}
              />
              <label className="check">
                <input type="checkbox" checked={showFaces} onChange={(e) => setShowFaces(e.target.checked)} /> Show designs
              </label>
              {actual && <span className="hint">Actual size assumes a standard 96 dpi screen; hold a bank card up to check.</span>}
            </div>
          </div>

          <aside className="p3-side">
            {selected ? <Details pc={selected} onDesign={design} onSheet={() => (setMode('sheet'), setCamAnim({ ...VIEWS.angled, zoom: 1 }))} /> : <p className="hint">Click a piece to see its numbers.</p>}
            {mode !== 'sheet' && (
              <details className="p3-list" open>
                <summary>
                  In view <small>{shown.length}</small>
                </summary>
                {GROUPS.filter(([g]) => groups.has(g)).map(([g, name, col]) => (
                  <div key={g} className="p3-lgrp">
                    <h3>
                      <i className="p3-dot" style={{ background: col }} />
                      {name}
                    </h3>
                    <ul>
                      {pieces
                        .filter((p) => p.group === g)
                        .map((p) => (
                          <li key={p.id} className={p.id === sel ? 'on' : undefined} onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)}>
                            <input type="checkbox" aria-label={`Show ${p.name}`} checked={!hidden.has(p.id)} onChange={() => toggleHidden(p.id)} />
                            <button type="button" className="linkbtn" onClick={() => setSel(p.id)}>
                              {p.name}
                            </button>
                            <small>{p.circle ? `${r1(p.w)} mm` : `${r1(p.w)} × ${r1(p.h)}`}</small>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </details>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

/** The selected piece's numbers: size, bleed, pixels, paper, sheets and envelope. */
function Details({ pc, onDesign, onSheet }: { pc: Piece; onDesign: (pc: Piece) => void; onSheet: () => void }) {
  const [, name, col] = groupOf(pc.group);
  const d = pc.design,
    product = d && pc.group !== 'envelope' ? d.product : null,
    spec = product ? PRINT_SPECS[product] : pc.group === 'envelope' ? PRINT_SPECS.envelope : null;
  const per = (sheet: SheetId) => {
    if (!d || !product) return 0;
    const n = nup({ ...d, exp: { ...d.exp, sheet } });
    return n.cols * n.rows;
  };
  return (
    <div className="p3-det" style={{ ['--c' as string]: col }}>
      <p className="p3-grp">
        <i className="p3-dot" style={{ background: col }} />
        {name}
        {pc.tag && <em>{pc.tag}</em>}
      </p>
      <h2>{pc.name}</h2>
      <ul className="sg-facts">
        <li>
          <b>Size</b> {pc.circle ? `${r1(pc.w)} mm across` : `${r1(pc.w)} × ${r1(pc.h)} mm`} ({inch(pc.w)}
          {pc.circle ? '' : ` × ${inch(pc.h)}`} in)
        </li>
        <li>
          <b>Compared</b> {area(pc)}
        </li>
        {product && (
          <>
            <li>
              <b>File with bleed</b> {r1(pc.w + 2 * BLEED)} × {r1(pc.h + 2 * BLEED)} mm, {px300(pc.w + 2 * BLEED).toLocaleString()} ×{' '}
              {px300(pc.h + 2 * BLEED).toLocaleString()} px at 300 dpi
            </li>
            <li>
              <b>Per sheet</b> {per('a4') || '–'} on A4 · {per('a3') || '–'} on A3 · {per('1319') || '–'} on 13×19 in
            </li>
            <li>
              <b>Envelope</b> {envelopeSpec(d!).name} ({envelopeSpec(d!).w} × {envelopeSpec(d!).h} mm)
            </li>
          </>
        )}
        {pc.fits && (
          <li>
            <b>Holds</b> {pc.fits.join(', ')}
          </li>
        )}
        {spec && (
          <li>
            <b>Paper</b> {spec.stock}, {spec.weight}
          </li>
        )}
        {pc.note && <li>{pc.note}</li>}
      </ul>
      {product && (
        <div className="p3-acts">
          <button type="button" className="btn primary" onClick={() => onDesign(pc)}>
            Design at this size
          </button>
          <button type="button" className="btn ghost" onClick={onSheet}>
            See it on a print sheet
          </button>
        </div>
      )}
    </div>
  );
}
