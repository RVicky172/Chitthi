import { useEffect, useRef, useState } from 'react';
import { setUI, useApp } from '../state/store';
import { Seg } from './common';

type Mode = 'card' | 'ring' | 'wall' | 'envelope';

/** Full-screen 3D card you can spin and flip. Calendars can also show every month at once. */
export function Viewer3D() {
  const faces = useApp((state) => state.ui.viewer);
  const dlg = useRef<HTMLDialogElement>(null),
    card = useRef<HTMLDivElement>(null),
    shadow = useRef<HTMLDivElement>(null);
  const motion = useRef({
    rx: -10,
    ry: -28,
    target: null as number | null,
    drag: null as null | {
      x: number;
      y: number;
      rx: number;
      ry: number;
      moved: boolean;
      t: number;
      px: number;
      py: number;
    },
    /** Spin left over from a flick, in degrees per frame; decays each frame. */
    vry: 0,
    vrx: 0,
    zoom: 1,
    zoomTo: 1,
    /** Pointer position over the scene (−1…1), for the hover tilt. */
    hx: 0,
    hy: 0,
    tx: 0,
    ty: 0,
    /** Active touch points, for pinch zoom. */
    touches: new Map<number, { x: number; y: number }>(),
    pinch: null as null | { d: number; zoom: number },
  });
  const zoomBox = useRef<HTMLDivElement>(null);
  const [zoomPct, setZoomPct] = useState(100);
  /** The page shown in the single-page view (a month picked in the ring), or the card's front. */
  const [pageSrc, setPageSrc] = useState<string | null>(null);
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [auto, setAuto] = useState(!reduce);
  const [size, setSize] = useState({ w: 600, h: 400, vw: 1200 });
  const pages = faces?.pages ?? [];
  const many = pages.length > 1;
  const [mode, setMode] = useState<Mode>('card');
  const [cur, setCur] = useState(0); // wall calendar: pages turned so far
  const [opened, setOpened] = useState(false); // envelope: flap open and card out
  const env = faces?.envelope;

  // All pages in the ring: every month, then the year page on the back.
  const ring = faces ? [...pages, ...(many ? [{ src: faces.back, label: 'Year at a glance' }] : [])] : [];
  const ringCount = ring.length,
    step = ringCount ? 360 / ringCount : 0;

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (faces) {
      const start: Mode = faces.start ?? (faces.pages && faces.pages.length > 1 ? 'ring' : 'card');
      Object.assign(motion.current, {
        rx: start === 'envelope' ? -12 : -10,
        ry: start === 'envelope' ? 158 : start === 'ring' ? 0 : -28,
        target: null,
        drag: null,
        vry: 0,
        vrx: 0,
        zoom: 1,
        zoomTo: 1,
      });
      setZoomPct(100);
      setPageSrc(null);
      setMode(start);
      setCur(0);
      setOpened(false);
      if (!el.open) el.showModal();
    } else if (el.open) el.close();
  }, [faces]);

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
    return () => window.removeEventListener('resize', fit);
  }, [faces]);

  // Ring geometry: pages sized so the whole ring fits the window, the front page nearest the viewer.
  const aspect = faces ? faces.w / faces.h : 1;
  let pw = ringCount
    ? Math.min(size.w * 0.55, (Math.min(size.vw * 0.92, 1500) / (1 + 1 / Math.tan(Math.PI / ringCount))) * 0.9)
    : 0;
  if (pw / aspect > size.h * 0.75) pw = size.h * 0.75 * aspect;
  const ringRadius = ringCount ? pw / 2 / Math.tan(Math.PI / ringCount) + pw * 0.14 : 0;
  const pre = useRef('');
  pre.current = mode === 'ring' ? `translateZ(${-ringRadius}px) ` : '';

  useEffect(() => {
    if (!faces) return;
    let raf = 0;
    const tick = () => {
      const now = motion.current;
      const coasting = Math.abs(now.vry) > 0.02 || Math.abs(now.vrx) > 0.02;
      if (now.target !== null) {
        now.ry += (now.target - now.ry) * 0.12;
        if (Math.abs(now.target - now.ry) < 0.3) {
          now.ry = now.target;
          now.target = null;
        }
      } else if (!now.drag && coasting) {
        // Momentum after a flick: keeps turning and slows down, like a card spun on a table.
        now.ry += now.vry;
        now.rx = Math.max(-55, Math.min(55, now.rx + now.vrx));
        now.vry *= 0.93;
        now.vrx *= 0.9;
      } else if (!now.drag && auto && mode !== 'wall' && mode !== 'envelope') now.ry += mode === 'ring' ? 0.12 : 0.22;
      // Hover tilt: the object leans a little towards the pointer when it's not being turned.
      const lean =
        !now.drag && !coasting && now.target === null && (mode === 'card' || mode === 'envelope' || mode === 'wall');
      now.tx += ((lean ? now.hx * 7 : 0) - now.tx) * 0.08;
      now.ty += ((lean ? -now.hy * 6 : 0) - now.ty) * 0.08;
      now.zoom += (now.zoomTo - now.zoom) * 0.15;
      if (zoomBox.current) zoomBox.current.style.transform = `scale(${now.zoom})`;
      const rx = now.rx + now.ty,
        ry = now.ry + now.tx;
      if (card.current) {
        card.current.style.transform = `${pre.current}rotateX(${rx}deg) rotateY(${ry}deg)`;
        // Light from the upper left: each face darkens as it turns away, and the highlight slides across it.
        const rad = Math.PI / 180,
          facing = Math.cos(ry * rad) * Math.cos(rx * rad);
        card.current.style.setProperty('--gx', `${(((ry % 360) + 360) % 360) / 3.6}%`);
        card.current.style.setProperty('--gy', `${50 - rx}%`);
        card.current.style.setProperty(
          '--shadeF',
          `${Math.max(0, 0.08 - facing * 0.08 + (1 - Math.max(0, facing)) * 0.35)}`,
        );
        card.current.style.setProperty(
          '--shadeB',
          `${Math.max(0, 0.08 + facing * 0.08 + (1 - Math.max(0, -facing)) * 0.35)}`,
        );
      }
      if (shadow.current)
        shadow.current.style.transform = `scaleX(${mode === 'card' ? 0.35 + 0.65 * Math.abs(Math.cos((now.ry * Math.PI) / 180)) : 1})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [faces, auto, mode]);

  /** Turn the ring so page i faces the viewer (the shortest way round). */
  const face = (index: number) => {
    const now = motion.current,
      want = -index * step;
    now.target = want + Math.round((now.ry - want) / 360) * 360;
  };
  const frontIndex = () =>
    ringCount ? ((Math.round(-motion.current.ry / step) % ringCount) + ringCount) % ringCount : 0;
  const turn = (dir: 1 | -1) => {
    if (mode === 'ring') face(frontIndex() + dir);
    else if (mode === 'wall') setCur((current) => Math.max(0, Math.min(pages.length - 1, current + dir)));
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
    motion.current.vry = motion.current.vrx = 0;
    const now = motion.current;
    now.target = null;
    now.rx = nextMode === 'wall' ? -6 : nextMode === 'envelope' ? -12 : -10;
    now.ry = nextMode === 'card' ? -28 : nextMode === 'wall' ? -12 : nextMode === 'envelope' ? 158 : 0;
    setOpened(false);
  };
  const modes: [Mode, string][] = [
    ...(many
      ? ([
          ['ring', 'All months'],
          ['wall', 'Wall calendar'],
        ] as [Mode, string][])
      : []),
    ['card', many ? 'Single page' : 'Card'],
    ...(env ? ([['envelope', 'Envelope']] as [Mode, string][]) : []),
  ];
  // Envelope size on screen, leaving room above for the card sliding out.
  const eScale = env ? Math.min(Math.min(size.vw * 0.55, 820) / env.w, (size.h * 0.72) / env.h) : 0,
    ew = env ? env.w * eScale : 0,
    eh = env ? env.h * eScale : 0,
    portraitCard = !!faces && faces.h > faces.w,
    cw = faces ? (portraitCard ? faces.h : faces.w) * eScale : 0,
    ch = faces ? (portraitCard ? faces.w : faces.h) * eScale : 0;

  const radius = !faces
    ? 2
    : faces.circle
      ? '50%'
      : faces.corner
        ? (size.w * faces.corner) / faces.w
        : faces.round
          ? (size.w * 3) / faces.w
          : 2;
  const title = faces?.title ?? '3D preview';
  return (
    <dialog
      className="viewer"
      ref={dlg}
      aria-labelledby="vTitle"
      onClose={() => setUI({ viewer: null })}
      onKeyDown={(event) => {
        const now = motion.current,
          target = event.target as HTMLElement;
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
        const key = event.key.toLowerCase();
        const act: Record<string, () => void> = {
          arrowright: () =>
            mode === 'ring' || mode === 'wall' ? turn(1) : ((now.vry = 0), (now.target = (now.target ?? now.ry) + 30)),
          arrowleft: () =>
            mode === 'ring' || mode === 'wall' ? turn(-1) : ((now.vry = 0), (now.target = (now.target ?? now.ry) - 30)),
          arrowup: () => (now.rx = Math.max(-55, now.rx - 8)),
          arrowdown: () => (now.rx = Math.min(55, now.rx + 8)),
          '+': () => setZoom(now.zoomTo * 1.2),
          '=': () => setZoom(now.zoomTo * 1.2),
          '-': () => setZoom(now.zoomTo / 1.2),
          '0': () => setZoom(1),
          f: () => (mode === 'card' || mode === 'envelope' ? flip() : undefined),
          o: () => (mode === 'envelope' ? setOpened((x) => !x) : undefined),
          r: () => {
            now.vry = now.vrx = 0;
            setZoom(1);
            now.rx = -10;
            now.target =
              (mode === 'card' ? -28 : mode === 'envelope' ? 158 : mode === 'wall' ? -12 : 0) +
              Math.round(now.ry / 360) * 360;
          },
          ' ': () => setAuto((wasAuto) => !wasAuto),
        };
        const fn = act[key];
        if (!fn || (key === ' ' && target.tagName === 'BUTTON')) return;
        event.preventDefault();
        fn();
      }}
    >
      <div className="vbar">
        <h2 id="vTitle">{title}</h2>
        {modes.length > 1 && (
          <div className="vmode">
            <Seg<Mode> label="View" value={mode} options={modes} onChange={(nextMode) => switchMode(nextMode)} />
          </div>
        )}
        {mode === 'envelope' && (
          <button
            type="button"
            className="btn"
            aria-pressed={opened}
            onClick={() => setOpened((wasOpened) => !wasOpened)}
          >
            {opened ? 'Close envelope' : 'Open envelope'}
          </button>
        )}
        {(mode === 'card' || mode === 'envelope') && (
          <button type="button" className="btn" title="Flip (F, or double-click)" onClick={flip}>
            Flip card
          </button>
        )}
        {(mode === 'ring' || mode === 'wall') && (
          <span className="vnav">
            <button
              type="button"
              className="btn"
              aria-label="Previous month"
              disabled={mode === 'wall' && cur === 0}
              onClick={() => turn(-1)}
            >
              ‹
            </button>
            {mode === 'wall' && <span aria-live="polite">{pages[cur]?.label}</span>}
            <button
              type="button"
              className="btn"
              aria-label="Next month"
              disabled={mode === 'wall' && cur >= pages.length - 1}
              onClick={() => turn(1)}
            >
              ›
            </button>
          </span>
        )}
        {(mode === 'card' || mode === 'ring') && (
          <label className="check">
            <input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} /> Turn slowly
          </label>
        )}
        <span className="vzoom-ctl" role="group" aria-label="Zoom">
          <button
            type="button"
            className="btn"
            aria-label="Zoom out"
            title="Zoom out (−)"
            onClick={() => setZoom(motion.current.zoomTo / 1.2)}
          >
            −
          </button>
          <button type="button" className="btn vzoom-pct" title="Actual size (0)" onClick={() => setZoom(1)}>
            {zoomPct}%
          </button>
          <button
            type="button"
            className="btn"
            aria-label="Zoom in"
            title="Zoom in (+)"
            onClick={() => setZoom(motion.current.zoomTo * 1.2)}
          >
            +
          </button>
        </span>
        <button
          type="button"
          className="btn"
          title="Reset view (R)"
          onClick={() => {
            const now = motion.current;
            now.vry = now.vrx = 0;
            setZoom(1);
            now.rx = mode === 'wall' ? -6 : -10;
            const home = mode === 'card' ? -28 : mode === 'wall' ? -12 : mode === 'envelope' ? 158 : 0;
            now.target = home + Math.round((now.ry - home) / 360) * 360;
          }}
        >
          Reset view
        </button>
        <button type="button" className="btn" onClick={() => dlg.current?.close()}>
          Close
        </button>
      </div>
      <div
        className="vscene"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const now = motion.current;
          now.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (now.touches.size === 2) {
            // Two fingers: pinch to zoom instead of turning.
            const [first, second] = [...now.touches.values()];
            now.pinch = { d: Math.hypot(first.x - second.x, first.y - second.y), zoom: now.zoomTo };
            now.drag = null;
            return;
          }
          now.drag = {
            x: event.clientX,
            y: event.clientY,
            rx: now.rx,
            ry: now.ry,
            moved: false,
            t: performance.now(),
            px: event.clientX,
            py: event.clientY,
          };
          now.target = null;
          now.vry = now.vrx = 0;
        }}
        onPointerMove={(event) => {
          const held = motion.current,
            box = event.currentTarget.getBoundingClientRect();
          held.hx = ((event.clientX - box.left) / box.width) * 2 - 1;
          held.hy = ((event.clientY - box.top) / box.height) * 2 - 1;
          if (held.touches.has(event.pointerId))
            held.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (held.pinch && held.touches.size === 2) {
            const [first, second] = [...held.touches.values()];
            setZoom(held.pinch.zoom * (Math.hypot(first.x - second.x, first.y - second.y) / held.pinch.d));
            return;
          }
          if (!held.drag) return;
          const dx = event.clientX - held.drag.x,
            dy = event.clientY - held.drag.y,
            speed = mode === 'ring' ? 0.25 : 0.4;
          if (Math.abs(dx) + Math.abs(dy) > 4) held.drag.moved = true;
          // Velocity from the last move, for the momentum when the pointer lets go.
          const now = performance.now(),
            dt = Math.max(8, now - held.drag.t);
          held.vry = ((event.clientX - held.drag.px) * speed * 16) / dt;
          held.vrx = (-(event.clientY - held.drag.py) * 0.3 * 16) / dt;
          held.drag.t = now;
          held.drag.px = event.clientX;
          held.drag.py = event.clientY;
          held.ry = held.drag.ry + dx * speed;
          held.rx = Math.max(-55, Math.min(55, held.drag.rx - dy * 0.3));
        }}
        onPointerLeave={() => {
          motion.current.hx = motion.current.hy = 0;
        }}
        onWheel={(event) => setZoom(motion.current.zoomTo * Math.exp(-event.deltaY * 0.001))}
        onDoubleClick={(event) => {
          if (mode === 'card' || mode === 'envelope') flip();
          else if (mode === 'ring') {
            // Open the double-clicked month on its own.
            const hit = document
              .elementsFromPoint(event.clientX, event.clientY)
              .find((el) => el instanceof HTMLElement && el.dataset.page);
            const index = hit instanceof HTMLElement ? +(hit.dataset.page ?? 0) : frontIndex();
            setPageSrc(ring[index]?.src ?? null);
            switchMode('card', true);
          }
        }}
        onPointerUp={(event) => {
          const now = motion.current;
          now.touches.delete(event.pointerId);
          if (now.pinch) {
            if (now.touches.size < 2) now.pinch = null;
            return;
          }
          const tap = now.drag && !now.drag.moved;
          // A slow release shouldn't coast: only keep speed from a real flick.
          if (now.drag && performance.now() - now.drag.t > 80) now.vry = now.vrx = 0;
          now.vry = Math.max(-8, Math.min(8, now.vry));
          now.drag = null;
          if (!tap) return;
          now.vry = now.vrx = 0;
          // A tap (no drag): bring the tapped page to the front, or turn the wall calendar's page.
          if (mode === 'ring') {
            const hit = document
              .elementsFromPoint(event.clientX, event.clientY)
              .find((el) => el instanceof HTMLElement && el.dataset.page);
            if (hit instanceof HTMLElement) face(+(hit.dataset.page ?? 0));
          } else if (mode === 'wall') setCur((current) => (current < pages.length - 1 ? current + 1 : 0));
          else if (mode === 'envelope') setOpened((wasOpened) => !wasOpened);
        }}
        onPointerCancel={(event) => {
          const now = motion.current;
          now.drag = null;
          now.pinch = null;
          now.touches.delete(event.pointerId);
        }}
      >
        <div className="vzoom" ref={zoomBox}>
          {faces && mode === 'card' && (
            <div className="vcard" ref={card} style={{ width: size.w, height: size.h }}>
              <div className="core" style={{ borderRadius: radius }} />
              <div className="face f" style={{ borderRadius: radius }}>
                <img src={pageSrc ?? faces.front} alt="Front of the card" />
                <i className="shade" />
                <i className="gloss" />
              </div>
              <div className="face b" style={{ borderRadius: radius }}>
                <img src={faces.back} alt="Back of the card" />
                <i className="shade b" />
                <i className="gloss" />
              </div>
            </div>
          )}
          {faces && mode === 'ring' && (
            <div className="vring" ref={card} style={{ width: pw, height: pw / aspect }}>
              {ring.map((pg, index) => (
                <figure
                  key={index}
                  className="vpage"
                  data-page={index}
                  style={{ transform: `rotateY(${index * step}deg) translateZ(${ringRadius}px)` }}
                >
                  <div className="face f" data-page={index}>
                    <img src={pg.src} alt={pg.label} data-page={index} />
                    <i className="gloss" />
                  </div>
                  <div className="face b" />
                  <figcaption>{pg.label}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {faces && mode === 'wall' && (
            <div className="vwall" ref={card} style={{ width: size.w * 0.86, height: (size.w * 0.86) / aspect }}>
              <div className="vbind" aria-hidden="true" />
              {pages.map((pg, index) => {
                const turned = index < cur;
                // Turned pages go up over the binding and hang behind; the rest stack underneath the current one.
                const transform = turned
                  ? `rotateX(${354 - (cur - 1 - index) * 0.5}deg) translateZ(${-(cur - index) * 0.6}px)`
                  : `translateZ(${-(index - cur) * 0.7}px)`;
                return (
                  <div
                    key={index}
                    className="vleaf"
                    style={{ transform: transform, zIndex: turned ? 0 : pages.length - index }}
                    aria-hidden={index !== cur}
                  >
                    <div className="face f">
                      <img src={pg.src} alt={pg.label} />
                      <i className="gloss" />
                    </div>
                    <div className="face b" />
                  </div>
                );
              })}
            </div>
          )}
          {faces && env && mode === 'envelope' && (
            <div className={`venv${opened ? ' open' : ''}`} ref={card} style={{ width: ew, height: eh }}>
              <div className="face f">
                <img src={env.front} alt={`Envelope, address side (${env.name})`} />
                <i className="gloss" />
              </div>
              <div className="venv-card" style={{ width: cw, height: ch, left: (ew - cw) / 2, top: (eh - ch) / 2 }}>
                <div className="venv-slide" style={{ transform: opened ? `translateY(${-ch * 0.5}px)` : 'none' }}>
                  <div className="face f" style={{ transform: 'rotateY(180deg)' }}>
                    <img
                      src={faces.front}
                      alt="The card inside"
                      style={
                        portraitCard
                          ? {
                              width: ch,
                              height: cw,
                              transform: `translate(${(cw - ch) / 2}px, ${(ch - cw) / 2}px) rotate(-90deg)`,
                            }
                          : undefined
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="face b">
                <img src={env.body} alt="Envelope, back" />
              </div>
              <div
                className="venv-flap"
                style={{ transform: `rotateY(180deg) translateZ(3px) rotateX(${opened ? 196 : 0}deg)` }}
              >
                <img className="out" src={env.flap} alt="" />
                <img className="in" src={env.liner} alt="" />
              </div>
            </div>
          )}
        </div>
        <div className="vshadow" ref={shadow} style={{ width: (mode === 'ring' ? pw * 3 : size.w) * 0.85 }} />
      </div>
      <p className="vhint">
        {mode === 'envelope'
          ? `${env?.name ?? ''} envelope. Tap it to open, drag to turn it over.`
          : mode === 'ring'
            ? 'Flick to spin through the year · tap a month to bring it forward · double-click to open it · scroll to zoom.'
            : mode === 'wall'
              ? 'Tap the calendar to turn the page. Drag to tilt it.'
              : 'Drag or flick to turn · double-click to flip · scroll or pinch to zoom · keys: arrows, F, +/−, R, Space.'}
      </p>
    </dialog>
  );
}
