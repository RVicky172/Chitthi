import { useEffect, useRef, useState } from 'react';
import { setUI, useApp } from '../state/store';
import { Seg } from './common';

type Mode = 'card' | 'ring' | 'wall' | 'envelope';

/** Full-screen 3D card you can spin and flip. Calendars can also show every month at once. */
export function Viewer3D() {
  const faces = useApp((s) => s.ui.viewer);
  const dlg = useRef<HTMLDialogElement>(null),
    card = useRef<HTMLDivElement>(null),
    shadow = useRef<HTMLDivElement>(null);
  const v = useRef({
    rx: -10,
    ry: -28,
    target: null as number | null,
    drag: null as null | { x: number; y: number; rx: number; ry: number; moved: boolean; t: number; px: number; py: number },
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
  const n = ring.length,
    step = n ? 360 / n : 0;

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (faces) {
      const m: Mode = faces.start ?? (faces.pages && faces.pages.length > 1 ? 'ring' : 'card');
      Object.assign(v.current, { rx: m === 'envelope' ? -12 : -10, ry: m === 'envelope' ? 158 : m === 'ring' ? 0 : -28, target: null, drag: null, vry: 0, vrx: 0, zoom: 1, zoomTo: 1 });
      setZoomPct(100);
      setPageSrc(null);
      setMode(m);
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
      let w = maxW,
        h = w / aspect;
      if (h > maxH) {
        h = maxH;
        w = h * aspect;
      }
      setSize({ w, h, vw: window.innerWidth });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [faces]);

  // Ring geometry: pages sized so the whole ring fits the window, the front page nearest the viewer.
  const aspect = faces ? faces.w / faces.h : 1;
  let pw = n ? Math.min(size.w * 0.55, (Math.min(size.vw * 0.92, 1500) / (1 + 1 / Math.tan(Math.PI / n))) * 0.9) : 0;
  if (pw / aspect > size.h * 0.75) pw = size.h * 0.75 * aspect;
  const R = n ? pw / 2 / Math.tan(Math.PI / n) + pw * 0.14 : 0;
  const pre = useRef('');
  pre.current = mode === 'ring' ? `translateZ(${-R}px) ` : '';

  useEffect(() => {
    if (!faces) return;
    let raf = 0;
    const tick = () => {
      const s = v.current;
      const coasting = Math.abs(s.vry) > 0.02 || Math.abs(s.vrx) > 0.02;
      if (s.target !== null) {
        s.ry += (s.target - s.ry) * 0.12;
        if (Math.abs(s.target - s.ry) < 0.3) {
          s.ry = s.target;
          s.target = null;
        }
      } else if (!s.drag && coasting) {
        // Momentum after a flick: keeps turning and slows down, like a card spun on a table.
        s.ry += s.vry;
        s.rx = Math.max(-55, Math.min(55, s.rx + s.vrx));
        s.vry *= 0.93;
        s.vrx *= 0.9;
      } else if (!s.drag && auto && mode !== 'wall' && mode !== 'envelope') s.ry += mode === 'ring' ? 0.12 : 0.22;
      // Hover tilt: the object leans a little towards the pointer when it's not being turned.
      const lean = !s.drag && !coasting && s.target === null && (mode === 'card' || mode === 'envelope' || mode === 'wall');
      s.tx += ((lean ? s.hx * 7 : 0) - s.tx) * 0.08;
      s.ty += ((lean ? -s.hy * 6 : 0) - s.ty) * 0.08;
      s.zoom += (s.zoomTo - s.zoom) * 0.15;
      if (zoomBox.current) zoomBox.current.style.transform = `scale(${s.zoom})`;
      const rx = s.rx + s.ty,
        ry = s.ry + s.tx;
      if (card.current) {
        card.current.style.transform = `${pre.current}rotateX(${rx}deg) rotateY(${ry}deg)`;
        // Light from the upper left: each face darkens as it turns away, and the highlight slides across it.
        const rad = Math.PI / 180,
          facing = Math.cos(ry * rad) * Math.cos(rx * rad);
        card.current.style.setProperty('--gx', `${(((ry % 360) + 360) % 360) / 3.6}%`);
        card.current.style.setProperty('--gy', `${50 - rx}%`);
        card.current.style.setProperty('--shadeF', `${Math.max(0, 0.08 - facing * 0.08 + (1 - Math.max(0, facing)) * 0.35)}`);
        card.current.style.setProperty('--shadeB', `${Math.max(0, 0.08 + facing * 0.08 + (1 - Math.max(0, -facing)) * 0.35)}`);
      }
      if (shadow.current)
        shadow.current.style.transform = `scaleX(${mode === 'card' ? 0.35 + 0.65 * Math.abs(Math.cos((s.ry * Math.PI) / 180)) : 1})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [faces, auto, mode]);

  /** Turn the ring so page i faces the viewer (the shortest way round). */
  const face = (i: number) => {
    const s = v.current,
      want = -i * step;
    s.target = want + Math.round((s.ry - want) / 360) * 360;
  };
  const frontIndex = () => (n ? (((Math.round(-v.current.ry / step) % n) + n) % n) : 0);
  const turn = (dir: 1 | -1) => {
    if (mode === 'ring') face(frontIndex() + dir);
    else if (mode === 'wall') setCur((c) => Math.max(0, Math.min(pages.length - 1, c + dir)));
  };
  const flip = () => {
    const s = v.current;
    s.vry = s.vrx = 0;
    s.target = Math.round((s.ry + 180) / 180) * 180;
  };
  const setZoom = (z: number) => {
    const s = v.current;
    s.zoomTo = Math.max(0.5, Math.min(2.6, z));
    setZoomPct(Math.round(s.zoomTo * 100));
  };
  const switchMode = (m: Mode, keepPage = false) => {
    if (!keepPage) setPageSrc(null);
    setMode(m);
    v.current.vry = v.current.vrx = 0;
    const s = v.current;
    s.target = null;
    s.rx = m === 'wall' ? -6 : m === 'envelope' ? -12 : -10;
    s.ry = m === 'card' ? -28 : m === 'wall' ? -12 : m === 'envelope' ? 158 : 0;
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
  const eScale = env ? Math.min((Math.min(size.vw * 0.55, 820)) / env.w, (size.h * 0.72) / env.h) : 0,
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
      onKeyDown={(e) => {
        const s = v.current,
          t = e.target as HTMLElement;
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
        const key = e.key.toLowerCase();
        const act: Record<string, () => void> = {
          arrowright: () => (mode === 'ring' || mode === 'wall' ? turn(1) : ((s.vry = 0), (s.target = (s.target ?? s.ry) + 30))),
          arrowleft: () => (mode === 'ring' || mode === 'wall' ? turn(-1) : ((s.vry = 0), (s.target = (s.target ?? s.ry) - 30))),
          arrowup: () => (s.rx = Math.max(-55, s.rx - 8)),
          arrowdown: () => (s.rx = Math.min(55, s.rx + 8)),
          '+': () => setZoom(s.zoomTo * 1.2),
          '=': () => setZoom(s.zoomTo * 1.2),
          '-': () => setZoom(s.zoomTo / 1.2),
          '0': () => setZoom(1),
          f: () => (mode === 'card' || mode === 'envelope' ? flip() : undefined),
          o: () => (mode === 'envelope' ? setOpened((x) => !x) : undefined),
          r: () => {
            s.vry = s.vrx = 0;
            setZoom(1);
            s.rx = -10;
            s.target = (mode === 'card' ? -28 : mode === 'envelope' ? 158 : mode === 'wall' ? -12 : 0) + Math.round(s.ry / 360) * 360;
          },
          ' ': () => setAuto((a) => !a),
        };
        const fn = act[key];
        if (!fn || (key === ' ' && t.tagName === 'BUTTON')) return;
        e.preventDefault();
        fn();
      }}
    >
      <div className="vbar">
        <h2 id="vTitle">{title}</h2>
        {modes.length > 1 && (
          <div className="vmode">
            <Seg<Mode> label="View" value={mode} options={modes} onChange={(m) => switchMode(m)} />
          </div>
        )}
        {mode === 'envelope' && (
          <button type="button" className="btn" aria-pressed={opened} onClick={() => setOpened((o) => !o)}>
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
            <button type="button" className="btn" aria-label="Previous month" disabled={mode === 'wall' && cur === 0} onClick={() => turn(-1)}>
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
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Turn slowly
          </label>
        )}
        <span className="vzoom-ctl" role="group" aria-label="Zoom">
          <button type="button" className="btn" aria-label="Zoom out" title="Zoom out (−)" onClick={() => setZoom(v.current.zoomTo / 1.2)}>
            −
          </button>
          <button type="button" className="btn vzoom-pct" title="Actual size (0)" onClick={() => setZoom(1)}>
            {zoomPct}%
          </button>
          <button type="button" className="btn" aria-label="Zoom in" title="Zoom in (+)" onClick={() => setZoom(v.current.zoomTo * 1.2)}>
            +
          </button>
        </span>
        <button
          type="button"
          className="btn"
          title="Reset view (R)"
          onClick={() => {
            const s = v.current;
            s.vry = s.vrx = 0;
            setZoom(1);
            s.rx = mode === 'wall' ? -6 : -10;
            const home = mode === 'card' ? -28 : mode === 'wall' ? -12 : mode === 'envelope' ? 158 : 0;
            s.target = home + Math.round((s.ry - home) / 360) * 360;
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
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const s = v.current;
          s.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (s.touches.size === 2) {
            // Two fingers: pinch to zoom instead of turning.
            const [a, b] = [...s.touches.values()];
            s.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: s.zoomTo };
            s.drag = null;
            return;
          }
          s.drag = { x: e.clientX, y: e.clientY, rx: s.rx, ry: s.ry, moved: false, t: performance.now(), px: e.clientX, py: e.clientY };
          s.target = null;
          s.vry = s.vrx = 0;
        }}
        onPointerMove={(e) => {
          const s = v.current,
            r = e.currentTarget.getBoundingClientRect();
          s.hx = ((e.clientX - r.left) / r.width) * 2 - 1;
          s.hy = ((e.clientY - r.top) / r.height) * 2 - 1;
          if (s.touches.has(e.pointerId)) s.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (s.pinch && s.touches.size === 2) {
            const [a, b] = [...s.touches.values()];
            setZoom(s.pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / s.pinch.d));
            return;
          }
          if (!s.drag) return;
          const dx = e.clientX - s.drag.x,
            dy = e.clientY - s.drag.y,
            k = mode === 'ring' ? 0.25 : 0.4;
          if (Math.abs(dx) + Math.abs(dy) > 4) s.drag.moved = true;
          // Velocity from the last move, for the momentum when the pointer lets go.
          const now = performance.now(),
            dt = Math.max(8, now - s.drag.t);
          s.vry = ((e.clientX - s.drag.px) * k * 16) / dt;
          s.vrx = (-(e.clientY - s.drag.py) * 0.3 * 16) / dt;
          s.drag.t = now;
          s.drag.px = e.clientX;
          s.drag.py = e.clientY;
          s.ry = s.drag.ry + dx * k;
          s.rx = Math.max(-55, Math.min(55, s.drag.rx - dy * 0.3));
        }}
        onPointerLeave={() => {
          v.current.hx = v.current.hy = 0;
        }}
        onWheel={(e) => setZoom(v.current.zoomTo * Math.exp(-e.deltaY * 0.001))}
        onDoubleClick={(e) => {
          if (mode === 'card' || mode === 'envelope') flip();
          else if (mode === 'ring') {
            // Open the double-clicked month on its own.
            const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset.page);
            const i = hit instanceof HTMLElement ? +(hit.dataset.page ?? 0) : frontIndex();
            setPageSrc(ring[i]?.src ?? null);
            switchMode('card', true);
          }
        }}
        onPointerUp={(e) => {
          const s = v.current;
          s.touches.delete(e.pointerId);
          if (s.pinch) {
            if (s.touches.size < 2) s.pinch = null;
            return;
          }
          const tap = s.drag && !s.drag.moved;
          // A slow release shouldn't coast: only keep speed from a real flick.
          if (s.drag && performance.now() - s.drag.t > 80) s.vry = s.vrx = 0;
          s.vry = Math.max(-8, Math.min(8, s.vry));
          s.drag = null;
          if (!tap) return;
          s.vry = s.vrx = 0;
          // A tap (no drag): bring the tapped page to the front, or turn the wall calendar's page.
          if (mode === 'ring') {
            const hit = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset.page);
            if (hit instanceof HTMLElement) face(+(hit.dataset.page ?? 0));
          } else if (mode === 'wall') setCur((c) => (c < pages.length - 1 ? c + 1 : 0));
          else if (mode === 'envelope') setOpened((o) => !o);
        }}
        onPointerCancel={(e) => {
          const s = v.current;
          s.drag = null;
          s.pinch = null;
          s.touches.delete(e.pointerId);
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
            {ring.map((pg, i) => (
              <figure key={i} className="vpage" data-page={i} style={{ transform: `rotateY(${i * step}deg) translateZ(${R}px)` }}>
                <div className="face f" data-page={i}>
                  <img src={pg.src} alt={pg.label} data-page={i} />
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
            {pages.map((pg, i) => {
              const turned = i < cur;
              // Turned pages go up over the binding and hang behind; the rest stack underneath the current one.
              const t = turned ? `rotateX(${354 - (cur - 1 - i) * 0.5}deg) translateZ(${-(cur - i) * 0.6}px)` : `translateZ(${-(i - cur) * 0.7}px)`;
              return (
                <div key={i} className="vleaf" style={{ transform: t, zIndex: turned ? 0 : pages.length - i }} aria-hidden={i !== cur}>
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
                    style={portraitCard ? { width: ch, height: cw, transform: `translate(${(cw - ch) / 2}px, ${(ch - cw) / 2}px) rotate(-90deg)` } : undefined}
                  />
                </div>
              </div>
            </div>
            <div className="face b">
              <img src={env.body} alt="Envelope, back" />
            </div>
            <div className="venv-flap" style={{ transform: `rotateY(180deg) translateZ(3px) rotateX(${opened ? 196 : 0}deg)` }}>
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
