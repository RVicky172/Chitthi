import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { ShowcaseImage } from '../data/showcase';

/*
 * 3D pieces for the landing page, built from the pre-rendered showcase images with CSS 3D transforms (no WebGL):
 * the hero stage that tilts with the pointer, a spinning card, and an envelope that opens and lets the card out.
 * Everything stays still for people who ask for reduced motion.
 */

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tilts its content towards the pointer (a few degrees), easing back to rest when the pointer leaves. */
export function TiltStage({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return;
    let raf = 0,
      tx = 0,
      ty = 0,
      x = 0,
      y = 0;
    const host = el.parentElement ?? el;
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const leave = () => {
      tx = 0;
      ty = 0;
    };
    const tick = () => {
      x += (tx - x) * 0.08;
      y += (ty - y) * 0.08;
      el.style.setProperty('--ry', `${x * 9}deg`);
      el.style.setProperty('--rx', `${-y * 7}deg`);
      raf = requestAnimationFrame(tick);
    };
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener('pointermove', move);
      host.removeEventListener('pointerleave', leave);
    };
  }, []);
  return (
    <div className={`tilt ${className ?? ''}`} ref={ref}>
      {children}
    </div>
  );
}

/** Starts (and stops) something only while the element is on screen. */
function useVisible<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return setOn(true);
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, on];
}

/** A card turning slowly in 3D, front and back, with a little thickness. Drag to spin it yourself. */
export function SpinCard({ front, back }: { front?: ShowcaseImage; back?: ShowcaseImage }) {
  const [box, visible] = useVisible<HTMLDivElement>();
  const card = useRef<HTMLDivElement>(null);
  const st = useRef({ ry: -24, rx: -8, v: 0.25, drag: null as null | { x: number; y: number; ry: number; rx: number } });
  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      const s = st.current;
      if (!s.drag && !reduced()) s.ry += s.v;
      if (card.current) card.current.style.transform = `rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);
  if (!front || !back) return null;
  return (
    <div
      className="spin"
      ref={box}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const s = st.current;
        s.drag = { x: e.clientX, y: e.clientY, ry: s.ry, rx: s.rx };
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s.drag) return;
        s.ry = s.drag.ry + (e.clientX - s.drag.x) * 0.45;
        s.rx = Math.max(-40, Math.min(40, s.drag.rx - (e.clientY - s.drag.y) * 0.3));
      }}
      onPointerUp={() => {
        st.current.drag = null;
      }}
      onPointerCancel={() => {
        st.current.drag = null;
      }}
    >
      <div className="spin-card" ref={card} style={{ aspectRatio: `${front.w} / ${front.h}` }}>
        <div className="spin-edge" />
        <img className="spin-f" src={front.src} alt={`${front.title}, front`} width={front.w} height={front.h} loading="lazy" decoding="async" />
        <img className="spin-b" src={back.src} alt={`${back.title}, back`} width={back.w} height={back.h} loading="lazy" decoding="async" />
      </div>
      <div className="spin-shadow" />
    </div>
  );
}

/**
 * The matching envelope in 3D: it turns to its back, the flap opens, the card slides out, then it closes and turns
 * back, on a loop while it's on screen. Tap to open or close it yourself; drag to turn it.
 */
export function EnvelopeScene({
  front,
  body,
  flap,
  liner,
  card,
}: {
  front?: ShowcaseImage;
  body?: ShowcaseImage;
  flap?: ShowcaseImage;
  liner?: ShowcaseImage;
  card?: ShowcaseImage;
}) {
  const [box, visible] = useVisible<HTMLDivElement>();
  const obj = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const st = useRef({ ry: 20, rx: -10, target: 160, drag: null as null | { x: number; y: number; ry: number; rx: number; moved: boolean } });

  // The loop: show the back, open, hold, close, show the front.
  useEffect(() => {
    if (!visible || manual || reduced()) return;
    const s = st.current;
    const steps: [number, () => void][] = [
      [0, () => (s.target = 158)],
      [1400, () => setOpen(true)],
      [5200, () => setOpen(false)],
      [6800, () => (s.target = 22)],
    ];
    let timers: number[] = [];
    const cycle = () => {
      timers = steps.map(([t, f]) => window.setTimeout(f, t));
      timers.push(window.setTimeout(cycle, 9500));
    };
    cycle();
    return () => timers.forEach(clearTimeout);
  }, [visible, manual]);

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const tick = () => {
      const s = st.current;
      if (!s.drag) s.ry += (s.target - s.ry) * 0.05;
      if (obj.current) obj.current.style.transform = `rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!front || !body || !flap || !liner || !card) return null;
  const portraitCard = card.h > card.w;
  return (
    <div
      className="env3d"
      ref={box}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const s = st.current;
        s.drag = { x: e.clientX, y: e.clientY, ry: s.ry, rx: s.rx, moved: false };
      }}
      onPointerMove={(e) => {
        const s = st.current;
        if (!s.drag) return;
        if (Math.abs(e.clientX - s.drag.x) + Math.abs(e.clientY - s.drag.y) > 5) s.drag.moved = true;
        s.ry = s.drag.ry + (e.clientX - s.drag.x) * 0.4;
        s.rx = Math.max(-35, Math.min(35, s.drag.rx - (e.clientY - s.drag.y) * 0.25));
      }}
      onPointerUp={() => {
        const s = st.current,
          tap = s.drag && !s.drag.moved;
        if (s.drag) s.target = s.ry;
        s.drag = null;
        setManual(true);
        if (tap) {
          // A tap opens the envelope from the back, turning it round first if needed.
          const facingBack = Math.cos(((s.ry - 180) * Math.PI) / 180) > 0;
          if (!facingBack) s.target = 158 + Math.round((s.ry - 158) / 360) * 360;
          setOpen((o) => !o || !facingBack);
        }
      }}
      onPointerCancel={() => {
        st.current.drag = null;
      }}
    >
      <div className={`env3d-obj${open ? ' open' : ''}`} ref={obj} style={{ aspectRatio: `${front.w} / ${front.h}` }}>
        <img className="env3d-front" src={front.src} alt="Envelope, address side" loading="lazy" decoding="async" />
        <div className="env3d-card">
          <div className="env3d-slide">
            <img
              className={portraitCard ? 'rot' : undefined}
              src={card.src}
              alt="The card inside"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
        <img className="env3d-body" src={body.src} alt="Envelope, back" loading="lazy" decoding="async" />
        <div className="env3d-flap">
          <img className="out" src={flap.src} alt="" loading="lazy" decoding="async" />
          <img className="in" src={liner.src} alt="" loading="lazy" decoding="async" />
        </div>
      </div>
      <div className="env3d-shadow" />
      <p className="env3d-hint">Tap to open · drag to turn</p>
    </div>
  );
}
