import { useEffect, useRef, useState } from 'react';
import { setUI, useApp } from '../state/store';

/** Full-screen 3D card you can spin and flip. */
export function Viewer3D() {
  const faces = useApp((s) => s.ui.viewer);
  const dlg = useRef<HTMLDialogElement>(null),
    card = useRef<HTMLDivElement>(null),
    shadow = useRef<HTMLDivElement>(null);
  const v = useRef({
    rx: -10,
    ry: -28,
    target: null as number | null,
    drag: null as null | { x: number; y: number; rx: number; ry: number },
  });
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [auto, setAuto] = useState(!reduce);
  const [size, setSize] = useState({ w: 600, h: 400 });

  useEffect(() => {
    const el = dlg.current;
    if (!el) return;
    if (faces) {
      v.current = { rx: -10, ry: -28, target: null, drag: null };
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
      setSize({ w, h });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [faces]);

  useEffect(() => {
    if (!faces) return;
    let raf = 0;
    const step = () => {
      const s = v.current;
      if (s.target !== null) {
        s.ry += (s.target - s.ry) * 0.12;
        if (Math.abs(s.target - s.ry) < 0.3) {
          s.ry = s.target;
          s.target = null;
        }
      } else if (!s.drag && auto) s.ry += 0.22;
      if (card.current) {
        card.current.style.transform = `rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
        card.current.style.setProperty('--gx', `${(((s.ry % 360) + 360) % 360) / 3.6}%`);
      }
      if (shadow.current) shadow.current.style.transform = `scaleX(${0.35 + 0.65 * Math.abs(Math.cos((s.ry * Math.PI) / 180))})`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [faces, auto]);

  const radius = faces?.round ? (size.w * 3) / faces.w : 2;
  return (
    <dialog className="viewer" ref={dlg} aria-labelledby="vTitle" onClose={() => setUI({ viewer: null })}>
      <div className="vbar">
        <h2 id="vTitle">{faces?.title ?? '3D preview'}</h2>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const s = v.current;
            s.target = Math.round((s.ry + 180) / 180) * 180;
          }}
        >
          Flip card
        </button>
        <label className="check">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Turn slowly
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const s = v.current;
            s.rx = -10;
            s.target = -28 + Math.round(s.ry / 360) * 360;
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
          s.drag = { x: e.clientX, y: e.clientY, rx: s.rx, ry: s.ry };
          s.target = null;
        }}
        onPointerMove={(e) => {
          const s = v.current;
          if (!s.drag) return;
          s.ry = s.drag.ry + (e.clientX - s.drag.x) * 0.4;
          s.rx = Math.max(-55, Math.min(55, s.drag.rx - (e.clientY - s.drag.y) * 0.3));
        }}
        onPointerUp={() => {
          v.current.drag = null;
        }}
        onPointerCancel={() => {
          v.current.drag = null;
        }}
      >
        {faces && (
          <div className="vcard" ref={card} style={{ width: size.w, height: size.h }}>
            <div className="core" style={{ borderRadius: radius }} />
            <div className="face f" style={{ borderRadius: radius }}>
              <img src={faces.front} alt="Front of the card" />
              <i className="gloss" />
            </div>
            <div className="face b" style={{ borderRadius: radius }}>
              <img src={faces.back} alt="Back of the card" />
              <i className="gloss" />
            </div>
          </div>
        )}
        <div className="vshadow" ref={shadow} style={{ width: size.w * 0.85 }} />
      </div>
      <p className="vhint">Drag to turn the card. Press Esc to close.</p>
    </dialog>
  );
}
