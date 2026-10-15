import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { setUI, useApp } from '../state/store';
import type { ViewerFaces } from '../types';
import { Seg } from './common';
import {
  advance,
  dragTo,
  HOME_RY,
  newMotion,
  openPose,
  pageUnder,
  paintTurn,
  pointerCancel,
  pointerDown,
  pointerUp,
  SWITCH_RX,
  touchDistance,
  type Mode,
  type Motion,
} from './viewer3dMotion';
import { CardView, EnvelopeView, RingView, WallView, type ViewerPage } from './Viewer3DFaces';

/** The hint under the scene, per view. */
const HINTS: Record<Exclude<Mode, 'envelope'>, string> = {
  ring: 'Flick to spin through the year · tap a month to bring it forward · double-click to open it · scroll to zoom.',
  wall: 'Tap the calendar to turn the page. Drag to tilt it.',
  card: 'Drag or flick to turn · double-click to flip · scroll or pinch to zoom · keys: arrows, F, +/−, R, Space.',
};

/**
 * The corners of the card on screen.
 * @param faces what is shown, if anything
 * @param width the card's width on screen
 * @returns a circle, the card's own corner, a rounded photo's corner, or 2 px
 */
function cornerRadius(faces: ViewerFaces | null, width: number): number | string {
  if (!faces) return 2;
  if (faces.circle) return '50%';
  if (faces.corner) return (width * faces.corner) / faces.w;
  return faces.round ? (width * 3) / faces.w : 2;
}

/**
 * The views on offer: the calendar views when there are several pages, the card, and the envelope when there is one.
 * @param many whether there are several pages
 * @param hasEnvelope whether there is an envelope
 * @returns the views with their names
 */
function modesFor(many: boolean, hasEnvelope: boolean): [Mode, string][] {
  const modes: [Mode, string][] = [];
  if (many) modes.push(['ring', 'All months'], ['wall', 'Wall calendar']);
  modes.push(['card', many ? 'Single page' : 'Card']);
  if (hasEnvelope) modes.push(['envelope', 'Envelope']);
  return modes;
}

/** The viewer's size: the card fitted to the window, and the window's width. */
interface ViewerSize {
  w: number;
  h: number;
  vw: number;
}

/**
 * The card's size on screen, fitted to the window and kept up to date as it resizes.
 * @param faces what is shown, if anything
 * @returns the size
 */
function useViewerSize(faces: ViewerFaces | null): ViewerSize {
  const [size, setSize] = useState<ViewerSize>({ w: 600, h: 400, vw: 1200 });
  useEffect(() => {
    if (!faces) return;
    const fit = () => {
      const aspect = faces.w / faces.h,
        maxW = Math.min(window.innerWidth * 0.7, 960),
        maxH = window.innerHeight * 0.58;
      let width = maxW,
        height = width / aspect;
      if (height > maxH) {
        height = maxH;
        width = height * aspect;
      }
      setSize({ w: width, h: height, vw: window.innerWidth });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => {
      window.removeEventListener('resize', fit);
    };
  }, [faces]);
  return size;
}

/** The elements the loop moves. */
interface SpinTargets {
  object: RefObject<HTMLDivElement | null>;
  shadow: RefObject<HTMLDivElement | null>;
  zoomBox: RefObject<HTMLDivElement | null>;
  /** A transform before the turn (the ring's distance). */
  prefix: RefObject<string>;
}

/**
 * The animation loop while the viewer is open: advances the motion and draws it every frame.
 * @param faces what is shown (no loop when closed)
 * @param motion the motion
 * @param auto whether it turns on its own
 * @param mode the view
 * @param targets the elements it moves
 */
function useSpinLoop(
  faces: ViewerFaces | null,
  motion: RefObject<Motion>,
  auto: boolean,
  mode: Mode,
  targets: SpinTargets,
): void {
  const { object, shadow, zoomBox, prefix } = targets;
  useEffect(() => {
    if (!faces) return;
    let frame = 0;
    const tick = () => {
      const now = motion.current;
      const { rx, ry } = advance(now, auto, mode);
      if (zoomBox.current) zoomBox.current.style.transform = `scale(${now.zoom})`;
      if (object.current) paintTurn(object.current, prefix.current, rx, ry);
      if (shadow.current)
        shadow.current.style.transform = `scaleX(${mode === 'card' ? 0.35 + 0.65 * Math.abs(Math.cos((now.ry * Math.PI) / 180)) : 1})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [faces, auto, mode, motion, object, shadow, zoomBox, prefix]);
}

/** What the viewer's bar shows and does. */
interface ViewerBarProps {
  title: string;
  mode: Mode;
  modes: [Mode, string][];
  onMode: (mode: Mode) => void;
  opened: boolean;
  onToggleOpened: () => void;
  onFlip: () => void;
  onTurn: (direction: 1 | -1) => void;
  /** Wall calendar: pages turned, and the pages. */
  turnedCount: number;
  pages: ViewerPage[];
  auto: boolean;
  onAuto: (auto: boolean) => void;
  zoomPct: number;
  onZoomBy: (factor: number) => void;
  onZoomReset: () => void;
  onResetView: () => void;
  onClose: () => void;
}

/**
 * The viewer's bar: title, view, open / flip / month buttons for the view, turn slowly, zoom, reset and close.
 * @param props what it shows and its actions
 */
function ViewerBar(props: Readonly<ViewerBarProps>) {
  const { mode, turnedCount, pages } = props;
  return (
    <div className="vbar">
      <h2 id="vTitle">{props.title}</h2>
      {props.modes.length > 1 && (
        <div className="vmode">
          <Seg<Mode> label="View" value={mode} options={props.modes} onChange={props.onMode} />
        </div>
      )}
      {mode === 'envelope' && (
        <button type="button" className="btn" aria-pressed={props.opened} onClick={props.onToggleOpened}>
          {props.opened ? 'Close envelope' : 'Open envelope'}
        </button>
      )}
      {(mode === 'card' || mode === 'envelope') && (
        <button type="button" className="btn" title="Flip (F, or double-click)" onClick={props.onFlip}>
          Flip card
        </button>
      )}
      {(mode === 'ring' || mode === 'wall') && (
        <span className="vnav">
          <button
            type="button"
            className="btn"
            aria-label="Previous month"
            disabled={mode === 'wall' && turnedCount === 0}
            onClick={() => props.onTurn(-1)}
          >
            ‹
          </button>
          {mode === 'wall' && <span aria-live="polite">{pages.at(turnedCount)?.label}</span>}
          <button
            type="button"
            className="btn"
            aria-label="Next month"
            disabled={mode === 'wall' && turnedCount >= pages.length - 1}
            onClick={() => props.onTurn(1)}
          >
            ›
          </button>
        </span>
      )}
      {(mode === 'card' || mode === 'ring') && (
        <label className="check">
          <input type="checkbox" checked={props.auto} onChange={(event) => props.onAuto(event.target.checked)} /> Turn
          slowly
        </label>
      )}
      <span className="vzoom-ctl" role="group" aria-label="Zoom">
        <button
          type="button"
          className="btn"
          aria-label="Zoom out"
          title="Zoom out (−)"
          onClick={() => props.onZoomBy(1 / 1.2)}
        >
          −
        </button>
        <button type="button" className="btn vzoom-pct" title="Actual size (0)" onClick={props.onZoomReset}>
          {props.zoomPct}%
        </button>
        <button
          type="button"
          className="btn"
          aria-label="Zoom in"
          title="Zoom in (+)"
          onClick={() => props.onZoomBy(1.2)}
        >
          +
        </button>
      </span>
      <button type="button" className="btn" title="Reset view (R)" onClick={props.onResetView}>
        Reset view
      </button>
      <button type="button" className="btn" onClick={props.onClose}>
        Close
      </button>
    </div>
  );
}

/** Full-screen 3D card you can spin and flip. Calendars can also show every month at once. */
export function Viewer3D() {
  const faces = useApp((state) => state.ui.viewer);
  const dlg = useRef<HTMLDialogElement>(null),
    object = useRef<HTMLDivElement>(null),
    shadow = useRef<HTMLDivElement>(null),
    zoomBox = useRef<HTMLDivElement>(null),
    prefix = useRef('');
  const motion = useRef<Motion>(newMotion());
  const [zoomPct, setZoomPct] = useState(100);
  /** The page shown in the single-page view (a month picked in the ring), or the card's front. */
  const [pageSrc, setPageSrc] = useState<string | null>(null);
  const [auto, setAuto] = useState(() => !matchMedia('(prefers-reduced-motion: reduce)').matches);
  const size = useViewerSize(faces);
  const pages = faces?.pages ?? [];
  const many = pages.length > 1;
  const [mode, setMode] = useState<Mode>('card');
  const [cur, setCur] = useState(0); // wall calendar: pages turned so far
  const [opened, setOpened] = useState(false); // envelope: flap open and card out
  const envelope = faces?.envelope;

  // All pages in the ring: every month, then the year page on the back.
  const ring: ViewerPage[] = faces ? [...pages, ...(many ? [{ src: faces.back, label: 'Year at a glance' }] : [])] : [];
  const ringCount = ring.length,
    step = ringCount ? 360 / ringCount : 0;

  useEffect(() => {
    const dialog = dlg.current;
    if (!dialog) return;
    if (!faces) {
      if (dialog.open) dialog.close();
      return;
    }
    const start: Mode = faces.start ?? (faces.pages && faces.pages.length > 1 ? 'ring' : 'card');
    Object.assign(motion.current, { ...openPose(start), target: null, drag: null, vry: 0, vrx: 0, zoom: 1, zoomTo: 1 });
    setZoomPct(100);
    setPageSrc(null);
    setMode(start);
    setCur(0);
    setOpened(false);
    if (!dialog.open) dialog.showModal();
  }, [faces]);

  // Ring geometry: pages sized so the whole ring fits the window, the front page nearest the viewer.
  const aspect = faces ? faces.w / faces.h : 1;
  let pageWidth = ringCount
    ? Math.min(size.w * 0.55, (Math.min(size.vw * 0.92, 1500) / (1 + 1 / Math.tan(Math.PI / ringCount))) * 0.9)
    : 0;
  if (pageWidth / aspect > size.h * 0.75) pageWidth = size.h * 0.75 * aspect;
  const ringRadius = ringCount ? pageWidth / 2 / Math.tan(Math.PI / ringCount) + pageWidth * 0.14 : 0;
  useLayoutEffect(() => {
    prefix.current = mode === 'ring' ? `translateZ(${-ringRadius}px) ` : '';
  });
  useSpinLoop(faces, motion, auto, mode, { object, shadow, zoomBox, prefix });

  /**
   * Turn the ring so a page faces the viewer (the shortest way round).
   * @param index the page
   */
  const face = (index: number) => {
    const now = motion.current,
      want = -index * step;
    now.target = want + Math.round((now.ry - want) / 360) * 360;
  };
  const frontIndex = () =>
    ringCount ? ((Math.round(-motion.current.ry / step) % ringCount) + ringCount) % ringCount : 0;
  const turn = (direction: 1 | -1) => {
    if (mode === 'ring') face(frontIndex() + direction);
    else if (mode === 'wall') setCur((current) => Math.max(0, Math.min(pages.length - 1, current + direction)));
  };
  const flip = () => {
    const now = motion.current;
    now.vry = now.vrx = 0;
    now.target = Math.round((now.ry + 180) / 180) * 180;
  };
  const setZoom = (zoom: number) => {
    const now = motion.current;
    now.zoomTo = Math.max(0.5, Math.min(2.6, zoom));
    setZoomPct(Math.round(now.zoomTo * 100));
  };
  const switchMode = (nextMode: Mode, keepPage = false) => {
    if (!keepPage) setPageSrc(null);
    setMode(nextMode);
    const now = motion.current;
    now.vry = now.vrx = 0;
    now.target = null;
    now.rx = SWITCH_RX[nextMode];
    now.ry = HOME_RY[nextMode];
    setOpened(false);
  };
  const resetView = () => {
    const now = motion.current;
    now.vry = now.vrx = 0;
    setZoom(1);
    now.rx = mode === 'wall' ? -6 : -10;
    const home = HOME_RY[mode];
    now.target = home + Math.round((now.ry - home) / 360) * 360;
  };
  /**
   * Turns the card or envelope a little with the arrow keys (the ring and wall calendar turn a page).
   * @param degrees how far, and which way
   */
  const nudge = (degrees: number) => {
    const now = motion.current;
    if (mode === 'ring' || mode === 'wall') turn(degrees > 0 ? 1 : -1);
    else {
      now.vry = 0;
      now.target = (now.target ?? now.ry) + degrees;
    }
  };

  const keyActions: Partial<Record<string, () => void>> = {
    arrowright: () => nudge(30),
    arrowleft: () => nudge(-30),
    arrowup: () => (motion.current.rx = Math.max(-55, motion.current.rx - 8)),
    arrowdown: () => (motion.current.rx = Math.min(55, motion.current.rx + 8)),
    '+': () => setZoom(motion.current.zoomTo * 1.2),
    '=': () => setZoom(motion.current.zoomTo * 1.2),
    '-': () => setZoom(motion.current.zoomTo / 1.2),
    '0': () => setZoom(1),
    f: () => {
      if (mode === 'card' || mode === 'envelope') flip();
    },
    o: () => {
      if (mode === 'envelope') setOpened((wasOpened) => !wasOpened);
    },
    r: () => {
      const now = motion.current;
      now.vry = now.vrx = 0;
      setZoom(1);
      now.rx = -10;
      now.target = HOME_RY[mode] + Math.round(now.ry / 360) * 360;
    },
    ' ': () => setAuto((wasAuto) => !wasAuto),
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    const key = event.key.toLowerCase();
    const action = keyActions[key];
    if (!action || (key === ' ' && target.tagName === 'BUTTON')) return;
    event.preventDefault();
    action();
  };

  /**
   * A tap (no drag): bring the tapped page to the front, turn the wall calendar's page, or open the envelope.
   * @param x the tap, client pixels
   * @param y the tap, client pixels
   */
  const onTap = (x: number, y: number) => {
    if (mode === 'ring') {
      const page = pageUnder(x, y);
      if (page !== null) face(page);
    } else if (mode === 'wall') setCur((current) => (current < pages.length - 1 ? current + 1 : 0));
    else if (mode === 'envelope') setOpened((wasOpened) => !wasOpened);
  };

  // Envelope size on screen, leaving room above for the card sliding out.
  const envelopeScale = envelope
      ? Math.min(Math.min(size.vw * 0.55, 820) / envelope.w, (size.h * 0.72) / envelope.h)
      : 0,
    portraitCard = !!faces && faces.h > faces.w;
  const hint =
    mode === 'envelope' ? `${envelope?.name ?? ''} envelope. Tap it to open, drag to turn it over.` : HINTS[mode];
  return (
    <dialog
      className="viewer"
      ref={dlg}
      aria-labelledby="vTitle"
      onClose={() => setUI({ viewer: null })}
      onKeyDown={onKeyDown}
    >
      <ViewerBar
        title={faces?.title ?? '3D preview'}
        mode={mode}
        modes={modesFor(many, !!envelope)}
        onMode={(nextMode) => switchMode(nextMode)}
        opened={opened}
        onToggleOpened={() => setOpened((wasOpened) => !wasOpened)}
        onFlip={flip}
        onTurn={turn}
        turnedCount={cur}
        pages={pages}
        auto={auto}
        onAuto={setAuto}
        zoomPct={zoomPct}
        onZoomBy={(factor) => setZoom(motion.current.zoomTo * factor)}
        onZoomReset={() => setZoom(1)}
        onResetView={resetView}
        onClose={() => dlg.current?.close()}
      />
      <div
        className="vscene"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pointerDown(motion.current, event.pointerId, event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          const now = motion.current,
            box = event.currentTarget.getBoundingClientRect();
          now.hx = ((event.clientX - box.left) / box.width) * 2 - 1;
          now.hy = ((event.clientY - box.top) / box.height) * 2 - 1;
          if (now.touches.has(event.pointerId))
            now.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (now.pinch && now.touches.size === 2) {
            setZoom(now.pinch.zoom * (touchDistance(now.touches) / now.pinch.d));
            return;
          }
          dragTo(now, event.clientX, event.clientY, mode);
        }}
        onPointerLeave={() => {
          motion.current.hx = motion.current.hy = 0;
        }}
        onWheel={(event) => setZoom(motion.current.zoomTo * Math.exp(-event.deltaY * 0.001))}
        onDoubleClick={(event) => {
          if (mode === 'card' || mode === 'envelope') flip();
          else if (mode === 'ring') {
            // Open the double-clicked month on its own.
            const index = pageUnder(event.clientX, event.clientY) ?? frontIndex();
            setPageSrc(ring.at(index)?.src ?? null);
            switchMode('card', true);
          }
        }}
        onPointerUp={(event) => {
          if (pointerUp(motion.current, event.pointerId)) onTap(event.clientX, event.clientY);
        }}
        onPointerCancel={(event) => pointerCancel(motion.current, event.pointerId)}
      >
        <div className="vzoom" ref={zoomBox}>
          {faces && mode === 'card' && (
            <CardView
              faces={faces}
              objectRef={object}
              width={size.w}
              height={size.h}
              radius={cornerRadius(faces, size.w)}
              pageSrc={pageSrc}
            />
          )}
          {faces && mode === 'ring' && (
            <RingView
              ring={ring}
              objectRef={object}
              pageWidth={pageWidth}
              aspect={aspect}
              step={step}
              radius={ringRadius}
            />
          )}
          {faces && mode === 'wall' && (
            <WallView pages={pages} objectRef={object} width={size.w * 0.86} aspect={aspect} turnedCount={cur} />
          )}
          {faces && envelope && mode === 'envelope' && (
            <EnvelopeView
              faces={faces}
              envelope={envelope}
              objectRef={object}
              width={envelope.w * envelopeScale}
              height={envelope.h * envelopeScale}
              cardWidth={(portraitCard ? faces.h : faces.w) * envelopeScale}
              cardHeight={(portraitCard ? faces.w : faces.h) * envelopeScale}
              portraitCard={portraitCard}
              opened={opened}
            />
          )}
        </div>
        <div className="vshadow" ref={shadow} style={{ width: (mode === 'ring' ? pageWidth * 3 : size.w) * 0.85 }} />
      </div>
      <p className="vhint">{hint}</p>
    </dialog>
  );
}
