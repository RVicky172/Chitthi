import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as RPointerEvent,
} from 'react';
import { PRINT_SPECS } from '../data/printSpecs';
import { productOf, sizesFor } from '../data/products';
import { cardMM, productDesign } from '../engine/design';
import { envelopeSpec } from '../engine/envelope';
import { renderEnvelope } from '../engine/envelopeDraw';
import { nup, SHEETS } from '../engine/printPages';
import { renderCard } from '../engine/render';
import { samplePhoto } from '../engine/sample';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { selectSize, switchProduct } from '../state/actions';
import { getState, setDesign, setUI, useApp } from '../state/store';
import type { Design, Orient, Photo, ProductId, SizeDef } from '../types';
import { Seg } from './common';
import { SiteNav } from './SiteNav';

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
const groupOf = (group: GroupId) => GROUPS.find((x) => x[0] === group)!;

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
const r1 = (value: number) => Math.round(value * 10) / 10;
const inch = (mm: number) => r1(mm / 25.4);
const px300 = (mm: number) => Math.round((mm / 25.4) * 300);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function orientFor(size: SizeDef, product: ProductId, pick: OrientPick): Orient {
  if (size.L === size.S) return 'portrait';
  if (pick !== 'natural') return pick;
  return size.native ?? (product === 'calendar' || product === 'frame' ? 'portrait' : 'landscape');
}

function designFor(product: ProductId, size: SizeDef, orient: Orient): Design {
  const design = productDesign(product, getState().design);
  return {
    ...design,
    sizeId: size.id,
    orient,
    layout: size.instax ? 'instax' : design.layout,
    exp: { ...design.exp, bleed: String(BLEED), marks: true },
  };
}

/** Every piece the page can show, in the chosen orientation. */
function allPieces(pick: OrientPick): Piece[] {
  const out: Piece[] = [];
  const envs = new Map<string, Piece>();
  for (const product of ['postcard', 'calendar', 'frame', 'magnet'] as ProductId[]) {
    for (const size of sizesFor(product).filter((x) => x.id !== 'custom')) {
      const orient = orientFor(size, product, pick),
        design = designFor(product, size, orient),
        { w, h } = cardMM(design);
      out.push({
        id: `${product}:${size.id}`,
        name: `${size.name}${product === 'postcard' || size.name.includes(productOf(product).short) ? '' : ` ${productOf(product).short.toLowerCase()}`}`,
        group: product,
        w,
        h,
        circle: size.shape === 'circle',
        corner: size.corner ?? (size.instax ? 3 : 0),
        tag: size.tag,
        size: size,
        design: design,
      });
      const envelope = envelopeSpec(design),
        key = envelope.name;
      const label = `${size.name} ${productOf(product).short.toLowerCase()}`;
      if (!envs.has(key)) {
        const ew = pick === 'portrait' ? envelope.h : envelope.w,
          eh = pick === 'portrait' ? envelope.w : envelope.h;
        envs.set(key, {
          id: `env:${key}`,
          name: `${key} envelope`,
          group: 'envelope',
          w: ew,
          h: eh,
          corner: 0,
          design: { ...design, env: { ...design.env, on: true } },
          fits: [label],
        });
      } else envs.get(key)!.fits!.push(label);
    }
  }
  out.push(...[...envs.values()]);
  for (const [id, [width, height, name]] of Object.entries(SHEETS) as [SheetId, [number, number, string]][]) {
    const land = pick === 'landscape';
    out.push({
      id: `sheet:${id}`,
      name: `${name} sheet`,
      group: 'sheet',
      w: land ? height : width,
      h: land ? width : height,
      corner: 0,
      note: 'A sheet the print shop prints on. Sheet PDFs place as many pieces on it as fit, with crop marks.',
    });
  }
  out.push(
    {
      id: 'ref:card',
      name: 'Bank card',
      group: 'ref',
      w: 85.6,
      h: 53.98,
      corner: 3.2,
      note: 'A debit or credit card (85.6 × 54 mm), to judge sizes against something in your wallet.',
    },
    {
      id: 'ref:coin',
      name: '₹10 coin',
      group: 'ref',
      w: 27,
      h: 27,
      circle: true,
      corner: 0,
      note: 'A ₹10 coin is 27 mm across.',
    },
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
  samples ??= [0, 1, 2, 3].map((index) => samplePhoto(index, 480, 340));
  await ensureFonts(fontsFor(pc.design));
  const cv = document.createElement('canvas'),
    scale = Math.min(3, 420 / Math.max(pc.w, pc.h));
  if (pc.group === 'envelope') renderEnvelope(cv, 'front', scale, { d: pc.design, photos: samples });
  else renderCard(cv, 'front', scale, 0, { d: pc.design, photos: samples }, { thumb: true });
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
  const items = [...ps].sort((left, right) => right.w * right.h - left.w * left.h);
  const area = items.reduce((sum, piece) => sum + (piece.w + GAP) * (piece.h + GAP + LABEL), 0),
    maxW = Math.max(...items.map((piece) => piece.w), Math.sqrt(area * 1.7));
  const rows: { items: Piece[]; w: number; h: number }[] = [];
  let row = { items: [] as Piece[], w: 0, h: 0 };
  for (const piece of items) {
    if (row.items.length && row.w + GAP + piece.w > maxW) {
      rows.push(row);
      row = { items: [], w: 0, h: 0 };
    }
    row.w += (row.items.length ? GAP : 0) + piece.w;
    row.h = Math.max(row.h, piece.h);
    row.items.push(piece);
  }
  rows.push(row);
  const total = rows.reduce((sum, line) => sum + line.h + LABEL, 0) + GAP * (rows.length - 1),
    width = Math.max(...rows.map((line) => line.w));
  const placed: Placed[] = [];
  let y = -total / 2;
  for (const line of rows) {
    let x = -line.w / 2;
    for (const piece of line.items) {
      // Pieces in a row share a baseline, so their labels line up.
      placed.push({ pc: piece, x: x + piece.w / 2, y: y + line.h - piece.h / 2, z: 0, w: piece.w, h: piece.h });
      x += piece.w + GAP;
    }
    y += line.h + LABEL + GAP;
  }
  return { placed, w: width, h: total };
}

function stacked(ps: Piece[]): { placed: Placed[]; w: number; h: number } {
  const items = [...ps].sort((left, right) => right.w * right.h - left.w * left.h);
  const step = Math.min(12, 150 / Math.max(1, items.length));
  return {
    placed: items.map((piece, index) => ({ pc: piece, x: 0, y: 0, z: index * step, w: piece.w, h: piece.h })),
    w: Math.max(100, ...items.map((piece) => piece.w)),
    h: Math.max(100, ...items.map((piece) => piece.h)),
  };
}

function onSheet(
  pc: Piece,
  sheet: SheetId,
  lift: number,
): { placed: Placed[]; w: number; h: number; count: number; sheetPc: Piece } {
  const [SW, SH, name] = SHEETS[sheet];
  const sheetPc: Piece = { id: `sheet:${sheet}`, name: `${name} sheet`, group: 'sheet', w: SW, h: SH, corner: 0 };
  const placed: Placed[] = [{ pc: sheetPc, x: 0, y: 0, z: 0, w: SW, h: SH }];
  if (!pc.design) return { placed, w: SW, h: SH, count: 0, sheetPc };
  const layout = nup({ ...pc.design, exp: { ...pc.design.exp, sheet } }),
    gw = layout.cols * layout.cw + (layout.cols - 1) * layout.gap,
    gh = layout.rows * layout.ch + (layout.rows - 1) * layout.gap,
    x0 = (SW - gw) / 2,
    y0 = (SH - gh) / 2;
  for (let row = 0; row < layout.rows; row++)
    for (let column = 0; column < layout.cols; column++)
      placed.push({
        pc,
        x: x0 + column * (layout.cw + layout.gap) + layout.cw / 2 - SW / 2,
        y: y0 + row * (layout.ch + layout.gap) + layout.ch / 2 - SH / 2,
        z: 2 + lift * (1 + (row * layout.cols + column) * 0.04),
        w: layout.w,
        h: layout.h,
        rot: layout.rot,
      });
  return { placed, w: SW, h: SH, count: layout.cols * layout.rows, sheetPc };
}

/* ---------- the page ---------- */

const VIEWS: Record<string, { tilt: number; spin: number }> = {
  top: { tilt: 0, spin: 0 },
  angled: { tilt: 52, spin: -18 },
  low: { tilt: 70, spin: -32 },
};

function area(pc: Piece): string {
  const areaMM = pc.circle ? Math.PI * (pc.w / 2) ** 2 : pc.w * pc.h,
    ofA4 = areaMM / (210 * 297);
  if (ofA4 > 0.94 && ofA4 < 1.06) return 'about the size of an A4 sheet';
  if (ofA4 > 1) return `${r1(ofA4)} × the area of an A4 sheet`;
  const fraction = Math.round(1 / ofA4);
  return fraction <= 1 ? 'a little smaller than A4' : `about 1/${fraction} of an A4 sheet`;
}

export function Paper3D() {
  const photosTick = useApp((state) => state.ui.fontTick);
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
  const shown = pieces.filter((piece) => groups.has(piece.group) && !hidden.has(piece.id));
  const selected = pieces.find((piece) => piece.id === sel) ?? null;
  // The sheet view needs a product piece: the selected one, else the first product piece on show.
  const sheetPiece =
    selected?.design && selected.group !== 'envelope'
      ? selected
      : (shown.find((piece) => piece.design && piece.group !== 'envelope') ?? pieces[0]);

  const scene = useMemo(() => {
    if (mode === 'sheet') return onSheet(sheetPiece, sheet, lift);
    return mode === 'stack' ? stacked(shown) : sideBySide(shown);
  }, [mode, shown.map((piece) => piece.id).join(), sheetPiece.id, sheet, lift, pick]);

  // Faces render in the background, a few at a time, and the scene picks them up as they arrive.
  useEffect(() => {
    if (!showFaces) return;
    let stop = false;
    void (async () => {
      const todo = [...new Map(scene.placed.map((placed) => [placed.pc.id, placed.pc])).values()].filter(
        (piece) => piece.design,
      );
      for (const piece of todo) {
        if (stop) return;
        await faceOf(piece);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!stop) setFaceTick((tick) => tick + 1);
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
  const pxPerMM = actual ? MM_PX : fit * cam.zoom;
  const tilt = actual ? 0 : cam.tilt,
    spin = actual ? 0 : cam.spin;

  /* ---------- orbit, zoom, pinch, keys ---------- */
  const drag = useRef<{
    x: number;
    y: number;
    moved: number;
    pts: Map<number, { x: number; y: number }>;
    pinch: number;
  } | null>(null);
  const setCamAnim = (change: Partial<typeof cam>, animate = true) => {
    setAnim(animate && !reduced());
    setActual(false);
    setCam((cur) => ({ ...cur, ...change }));
  };
  const onDown = (event: RPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const pointer = drag.current ?? { x: event.clientX, y: event.clientY, moved: 0, pts: new Map(), pinch: 0 };
    pointer.pts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (pointer.pts.size === 2) {
      const [first, second] = [...pointer.pts.values()];
      pointer.pinch = Math.hypot(first.x - second.x, first.y - second.y);
    }
    drag.current = pointer;
    setAnim(false);
  };
  const onMove = (event: RPointerEvent<HTMLDivElement>) => {
    const pointer = drag.current;
    if (!pointer || !pointer.pts.has(event.pointerId)) return;
    pointer.pts.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointer.pts.size === 2) {
      const [first, second] = [...pointer.pts.values()],
        dist = Math.hypot(first.x - second.x, first.y - second.y);
      if (pointer.pinch) setCamAnim({ zoom: Math.min(8, Math.max(0.3, cam.zoom * (dist / pointer.pinch))) }, false);
      pointer.pinch = dist;
      pointer.moved += 10;
      return;
    }
    const dx = event.clientX - pointer.x,
      dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved += Math.abs(dx) + Math.abs(dy);
    if (pointer.moved <= 4) return;
    if (actual || event.shiftKey) {
      setAnim(false);
      setPan((previous) => ({ x: previous.x + dx, y: previous.y + dy }));
    } else setCamAnim({ spin: cam.spin + dx * 0.35, tilt: Math.min(80, Math.max(0, cam.tilt - dy * 0.3)) }, false);
  };
  const onUp = (event: RPointerEvent<HTMLDivElement>) => {
    const pointer = drag.current;
    if (!pointer) return;
    pointer.pts.delete(event.pointerId);
    if (!pointer.pts.size) {
      // A click without a drag picks the piece under the pointer.
      if (pointer.moved <= 4) {
        const hit = (
          document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null
        )?.closest<HTMLElement>('[data-pid]');
        if (hit?.dataset.pid) setSel(hit.dataset.pid);
      }
      drag.current = null;
    }
  };
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // A non-passive listener so the page doesn't scroll while zooming the scene.
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      setAnim(false);
      setActual(false);
      setCam((camera) => ({
        ...camera,
        zoom: Math.min(8, Math.max(0.3, camera.zoom * Math.exp(-event.deltaY * 0.0015))),
      }));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  const onKey = (event: KeyboardEvent) => {
    const key = event.key;
    if (key === 'ArrowLeft' || key === 'ArrowRight') setCamAnim({ spin: spin + (key === 'ArrowLeft' ? -8 : 8) });
    else if (key === 'ArrowUp' || key === 'ArrowDown')
      setCamAnim({ tilt: Math.min(80, Math.max(0, tilt + (key === 'ArrowUp' ? -6 : 6))) });
    else if (key === '+' || key === '=') setCamAnim({ zoom: Math.min(8, cam.zoom * 1.2) });
    else if (key === '-' || key === '_') setCamAnim({ zoom: Math.max(0.3, cam.zoom / 1.2) });
    else if (key === '0') setCamAnim({ ...VIEWS.angled, zoom: 1 });
    else return;
    event.preventDefault();
  };

  const toggleGroup = (group: GroupId) =>
    setGroups((cur) => {
      const next = new Set(cur);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  const toggleHidden = (id: string) =>
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
      <SiteNav current="paper" />
      <main>
        <header className="sg-head">
          <h1>Paper sizes in 3D</h1>
          <p className="lsec-sub">
            Every size Chitthi prints, drawn to the same scale on a cutting mat, with a real design on each. Drag to
            turn the mat, scroll or pinch to zoom, and click a piece to see its numbers.
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
            onChange={(nextMode) => {
              setMode(nextMode);
              setPan({ x: 0, y: 0 });
              setActual(false);
              setCamAnim({ ...(nextMode === 'stack' ? VIEWS.low : VIEWS.angled), zoom: 1 });
            }}
          />
          {mode !== 'sheet' && (
            <div className="chips" role="group" aria-label="Show">
              {GROUPS.map(([group, name, col]) => (
                <button
                  key={group}
                  type="button"
                  className="chip"
                  aria-pressed={groups.has(group)}
                  onClick={() => toggleGroup(group)}
                >
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
                options={(Object.entries(SHEETS) as [SheetId, [number, number, string]][]).map(([id, entry]) => [
                  id,
                  entry[2],
                ])}
                onChange={setSheet}
              />
              <label className="f p3-lift">
                Lift the pieces
                <input type="range" min={0} max={140} value={lift} onChange={(event) => setLift(+event.target.value)} />
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
                    width: matW * pxPerMM,
                    height: matH * pxPerMM,
                    left: (-matW / 2) * pxPerMM,
                    top: (-matH / 2) * pxPerMM,
                    backgroundSize: `${10 * pxPerMM}px ${10 * pxPerMM}px, ${10 * pxPerMM}px ${10 * pxPerMM}px, ${50 * pxPerMM}px ${50 * pxPerMM}px, ${50 * pxPerMM}px ${50 * pxPerMM}px`,
                  }}
                />
                {scene.placed.map((placed, index) => {
                  const col = groupOf(placed.pc.group)[2],
                    face = showFaces ? faces.get(`${placed.pc.id}:${placed.pc.w}x${placed.pc.h}`) : undefined,
                    on = placed.pc.id === sel && mode !== 'sheet',
                    hov = placed.pc.id === hover;
                  const radius = placed.pc.circle ? '50%' : `${placed.pc.corner * pxPerMM}px`;
                  return (
                    <div
                      key={`${placed.pc.id}-${index}`}
                      data-pid={placed.pc.id}
                      className={`p3-piece g-${placed.pc.group}${on ? ' on' : ''}${hov ? ' hov' : ''}`}
                      style={{
                        width: placed.w * pxPerMM,
                        height: placed.h * pxPerMM,
                        left: (placed.x - placed.w / 2) * pxPerMM,
                        top: (placed.y - placed.h / 2) * pxPerMM,
                        transform: `translateZ(${placed.z + (on || hov ? 6 : 0)}px)`,
                        borderRadius: radius,
                        ['--c' as string]: col,
                        transition: reduced() ? 'none' : undefined,
                      }}
                      onPointerEnter={() => setHover(placed.pc.id)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <div
                        className="p3-shadow"
                        style={{
                          borderRadius: radius,
                          transform: `translateZ(${-placed.z - (on || hov ? 6 : 0) + 0.5}px)`,
                        }}
                      />
                      <div className="p3-edge" style={{ borderRadius: radius }} />
                      <div className="p3-face" style={{ borderRadius: radius }}>
                        {face ? (
                          <img
                            src={face}
                            alt=""
                            draggable={false}
                            style={
                              placed.rot
                                ? {
                                    width: placed.h * pxPerMM,
                                    height: placed.w * pxPerMM,
                                    transform: `translate(-50%,-50%) rotate(90deg)`,
                                    left: '50%',
                                    top: '50%',
                                    position: 'absolute',
                                  }
                                : undefined
                            }
                          />
                        ) : (
                          <span
                            className="p3-plain"
                            style={{ fontSize: Math.max(6, Math.min(placed.w, placed.h) * pxPerMM * 0.12) }}
                          >
                            {placed.pc.group === 'sheet' || placed.pc.group === 'ref' || !showFaces
                              ? placed.pc.name
                              : ''}
                          </span>
                        )}
                      </div>
                      {mode === 'side' && (
                        <span
                          className="p3-label"
                          style={{
                            top: placed.h * pxPerMM + 2 * pxPerMM,
                            width: (placed.w + GAP * 0.8) * pxPerMM,
                            fontSize: Math.max(7, 3.6 * pxPerMM),
                          }}
                        >
                          {placed.pc.name}
                          <small>
                            {placed.pc.circle
                              ? `${r1(placed.pc.w)} mm across`
                              : `${r1(placed.pc.w)} × ${r1(placed.pc.h)} mm`}
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
              <button
                type="button"
                className="btn ghost"
                aria-pressed={!actual && tilt === VIEWS.top.tilt && spin === 0}
                onClick={() => setCamAnim(VIEWS.top)}
              >
                Top
              </button>
              <button type="button" className="btn ghost" onClick={() => setCamAnim(VIEWS.angled)}>
                Angled
              </button>
              <button type="button" className="btn ghost" onClick={() => setCamAnim(VIEWS.low)}>
                Low
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCamAnim({ zoom: Math.max(0.3, cam.zoom / 1.25) })}
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setCamAnim({ zoom: Math.min(8, cam.zoom * 1.25) })}
                aria-label="Zoom in"
              >
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
                  const at = !actual ? scene.placed.find((placed) => placed.pc.id === sel) : undefined;
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
                <input type="checkbox" checked={showFaces} onChange={(event) => setShowFaces(event.target.checked)} />{' '}
                Show designs
              </label>
              {actual && (
                <span className="hint">
                  Actual size assumes a standard 96 dpi screen; hold a bank card up to check.
                </span>
              )}
            </div>
          </div>

          <aside className="p3-side">
            {selected ? (
              <Details
                pc={selected}
                onDesign={design}
                onSheet={() => (setMode('sheet'), setCamAnim({ ...VIEWS.angled, zoom: 1 }))}
              />
            ) : (
              <p className="hint">Click a piece to see its numbers.</p>
            )}
            {mode !== 'sheet' && (
              <details className="p3-list" open>
                <summary>
                  In view <small>{shown.length}</small>
                </summary>
                {GROUPS.filter(([group]) => groups.has(group)).map(([group, name, col]) => (
                  <div key={group} className="p3-lgrp">
                    <h3>
                      <i className="p3-dot" style={{ background: col }} />
                      {name}
                    </h3>
                    <ul>
                      {pieces
                        .filter((piece) => piece.group === group)
                        .map((piece) => (
                          <li
                            key={piece.id}
                            className={piece.id === sel ? 'on' : undefined}
                            onPointerEnter={() => setHover(piece.id)}
                            onPointerLeave={() => setHover(null)}
                          >
                            <input
                              type="checkbox"
                              aria-label={`Show ${piece.name}`}
                              checked={!hidden.has(piece.id)}
                              onChange={() => toggleHidden(piece.id)}
                            />
                            <button type="button" className="linkbtn" onClick={() => setSel(piece.id)}>
                              {piece.name}
                            </button>
                            <small>{piece.circle ? `${r1(piece.w)} mm` : `${r1(piece.w)} × ${r1(piece.h)}`}</small>
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
function Details({ pc, onDesign, onSheet }: Readonly<{ pc: Piece; onDesign: (pc: Piece) => void; onSheet: () => void }>) {
  const [, name, col] = groupOf(pc.group);
  const design = pc.design,
    product = design && pc.group !== 'envelope' ? design.product : null,
    spec = product ? PRINT_SPECS[product] : pc.group === 'envelope' ? PRINT_SPECS.envelope : null;
  const per = (sheet: SheetId) => {
    if (!design || !product) return 0;
    const layout = nup({ ...design, exp: { ...design.exp, sheet } });
    return layout.cols * layout.rows;
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
              <b>File with bleed</b> {r1(pc.w + 2 * BLEED)} × {r1(pc.h + 2 * BLEED)} mm,{' '}
              {px300(pc.w + 2 * BLEED).toLocaleString()} × {px300(pc.h + 2 * BLEED).toLocaleString()} px at 300 dpi
            </li>
            <li>
              <b>Per sheet</b> {per('a4') || '–'} on A4 · {per('a3') || '–'} on A3 · {per('1319') || '–'} on 13×19 in
            </li>
            <li>
              <b>Envelope</b> {envelopeSpec(design!).name} ({envelopeSpec(design!).w} × {envelopeSpec(design!).h} mm)
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
