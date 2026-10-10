// Motion for the road (405 §7), always with a still twin: every hook reads the reduced-motion setting and gives the final
// state at once when it is on. Only cheap properties move (stroke offsets, transforms, opacity), at most once a frame.
import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ProjectData } from '../types';
import { changedIds, diffProjects } from './changes';

const QUERY = '(prefers-reduced-motion: reduce)';

/** True while the system asks for reduced motion (follows changes live). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(QUERY).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(QUERY);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** False until the element first comes into view (then stays true); true at once with reduced motion or no observer. */
export function useRevealed(ref: RefObject<Element | null>, reduced: boolean): boolean {
  const [shown, setShown] = useState(reduced || typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (shown) return;
    if (reduced) return setShown(true);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, reduced, shown]);
  return shown;
}

/** A number that counts from 0 to `value` over 600 ms once `active`; `value` at once with reduced motion. */
export function useCountUp(value: number, active: boolean, reduced: boolean): number {
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    if (!active) return;
    if (reduced) return setShown(value);
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setShown(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, active, reduced]);
  return active ? shown : reduced ? value : 0;
}

/**
 * Draws `path` (the whole road) up to the point level with the reading line (60 % down the viewport) as the page
 * scrolls. `stops` are the anchor points the road passes, in the path's own coordinates; `top` gives the path's
 * container top in viewport coordinates. One passive listener, one write per frame; complete with reduced motion.
 */
export function useScrollDraw(path: RefObject<SVGPathElement | null>, points: { x: number; y: number }[], top: () => number, reduced: boolean) {
  useEffect(() => {
    const el = path.current;
    if (!el || points.length < 2) return;
    const total = el.getTotalLength();
    el.style.strokeDasharray = `${total}`;
    if (reduced) {
      el.style.strokeDashoffset = '0';
      return;
    }
    // Length along the road at each stop: the length of the road cut at that stop.
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const at: number[] = [0];
    const d = el.getAttribute('d') ?? '';
    const cuts = d.split(' C');
    for (let i = 1; i < points.length; i++) {
      probe.setAttribute('d', cuts.slice(0, i + 1).join(' C'));
      at.push(probe.getTotalLength());
    }
    let pending = false;
    const draw = () => {
      pending = false;
      const y = innerHeight * 0.6 - top();
      let len = 0;
      if (y >= points[points.length - 1].y) len = total;
      else
        for (let i = 1; i < points.length; i++)
          if (y < points[i].y) {
            const k = Math.max(0, (y - points[i - 1].y) / Math.max(1, points[i].y - points[i - 1].y));
            len = at[i - 1] + k * (at[i] - at[i - 1]);
            break;
          }
      el.style.strokeDashoffset = `${total - len}`;
    };
    const onScroll = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(draw);
    };
    draw();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    return () => {
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, [path, points, top, reduced]);
}

/** How long a live change stays marked on the page. */
export const HIGHLIGHT_MS = 2000;

/**
 * What changed since the last load (never on the first one): the ids to mark for 2 s ("204", "204/T030") and the
 * announcement for the live region (`key` changes with every new announcement, so a repeat is read again).
 */
export function useLiveChanges(project: ProjectData): { changed: Set<string>; announce: string; key: number } {
  const prev = useRef<ProjectData | null>(null);
  const [state, setState] = useState<{ changed: Set<string>; announce: string; key: number }>({ changed: new Set(), announce: '', key: 0 });
  useEffect(() => {
    const before = prev.current;
    prev.current = project;
    if (!before || before.version === project.version) return;
    const { changes, announce } = diffProjects(before, project);
    if (!changes.length) return;
    setState((s) => ({ changed: changedIds(changes), announce, key: s.key + 1 }));
    const t = setTimeout(() => setState((s) => ({ ...s, changed: new Set() })), HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [project]);
  return state;
}
