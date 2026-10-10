// The route rail (405 §6): a mark per phase and stop beside the road, the current position, and the stretch in view;
// below 1100 px a bottom bar with the phase in view. Both offer "Back to now". Marks link to #/?at=NNN and scroll the
// stop into view, moving focus to it.
import { useEffect, useState, type MouseEvent } from 'react';
import type { Road } from '../lib/road';
import { href } from '../route';

interface Props {
  road: Road;
  reduced: boolean;
  /** Stops matching the filter (only these get marks), or undefined. */
  matches?: Set<string>;
  /** Keeps the current query (q, status) when a mark sets `at`. */
  params: URLSearchParams;
}

/** Scrolls a stop to the middle of the view and (unless `focus` is false) focuses it (its li has tabIndex -1). */
export function goToStop(id: string, reduced: boolean, focus = true): boolean {
  const el = document.getElementById(`stop-${id}`);
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  if (focus) el.focus({ preventScroll: true });
  return true;
}

function atLink(params: URLSearchParams, id: string) {
  return href('/', { q: params.get('q'), status: params.get('status'), at: id });
}

export function RouteRail({ road, reduced, matches, params }: Props) {
  const [inView, setInView] = useState<Set<string>>(new Set());
  const [nowVisible, setNowVisible] = useState(true);

  useEffect(() => {
    const els = road.stops.map((s) => document.getElementById(`stop-${s.id}`)).filter((e): e is HTMLElement => Boolean(e));
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const id = (e.target as HTMLElement).dataset.stop!;
          if (e.isIntersecting) seen.add(id);
          else seen.delete(id);
          if (id === road.current?.id) setNowVisible(e.isIntersecting);
        }
        setInView(new Set(seen));
      },
      { rootMargin: '-15% 0px -15% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [road]);

  const firstInView = road.stops.find((s) => inView.has(s.id));
  const phaseInView = road.regions.find((g) => g.phase === firstInView?.phase) ?? road.regions.find((g) => g.current);
  const go = (id: string) => (e: MouseEvent) => {
    if (!goToStop(id, reduced)) return;
    e.preventDefault();
    history.replaceState(null, '', atLink(params, id));
  };
  const backToNow = road.current && (
    <a className={`rail-now${nowVisible ? ' is-here' : ''}`} href={atLink(params, road.current.id)} onClick={go(road.current.id)}>
      Back to now <span className="num">{road.current.id}</span>
    </a>
  );

  return (
    <nav className="rail" aria-label="Route">
      <ol className="rail-marks">
        {road.regions.map((g) => (
          <li key={g.phase} className="rail-phase">
            <a
              href={g.stops[0] ? atLink(params, g.stops[0].id) : href('/')}
              onClick={g.stops[0] ? go(g.stops[0].id) : undefined}
              className={phaseInView?.phase === g.phase ? 'is-in-view' : undefined}
            >
              {g.title.replace(/\s*\(.*\)\s*$/, '').replace(/\s+—.*$/, '')}
            </a>
            <ol>
              {g.stops
                .filter((s) => !matches || matches.has(s.id))
                .map((s) => (
                  <li key={s.id}>
                    <a
                      href={atLink(params, s.id)}
                      onClick={go(s.id)}
                      className={`rail-stop k-${s.kind} st-${s.state}${inView.has(s.id) ? ' is-in-view' : ''}`}
                      aria-current={s.state === 'current' ? 'location' : undefined}
                      title={`${s.id} ${s.item.title}`}
                    >
                      <span className="sr-only">
                        {s.id} {s.item.title}, {s.statusText}
                        {s.state === 'current' ? ', you are here' : ''}
                      </span>
                    </a>
                  </li>
                ))}
            </ol>
          </li>
        ))}
      </ol>
      <p className="rail-bar">
        <span className="rail-bar-phase">{phaseInView?.title ?? ''}</span>
        {backToNow}
      </p>
      <div className="rail-foot">{backToNow}</div>
    </nav>
  );
}
