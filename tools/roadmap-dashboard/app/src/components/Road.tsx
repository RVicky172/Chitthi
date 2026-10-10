// The roadmap as a road (405 §4): phase regions holding stops, one per item, in reading order; behind them an SVG road
// through each stop's anchor (travelled solid up to the current stop, ahead dashed, a line drawn as you scroll) and the
// "you are here" marker. The road is decoration (aria-hidden): every fact is in the list.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { roadPath, splitAt, type Point } from '../lib/geometry';
import { useCountUp, useRevealed, useScrollDraw } from '../lib/motion';
import type { Region, Road as RoadData, Stop } from '../lib/road';
import { waitingOn } from '../lib/roadmap';
import { href } from '../route';
import type { Roadmap } from '../types';
import { Md, StatusBadge } from './bits';

interface Props {
  road: RoadData;
  roadmap: Roadmap;
  reduced: boolean;
  /** Ids marked by a live change ("204", "204/T030"). */
  changed: Set<string>;
  /** Stops matching the search and status filter; undefined when not filtering. */
  matches?: Set<string>;
  /** The current stop's hero (rendered inside its stop). */
  hero?: ReactNode;
  /** Extra lines under a stop (its age, quiet mark). */
  extra?: (stop: Stop) => ReactNode;
}

const samePoints = (a: Point[], b: Point[]) => a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);

export function Road({ road, roadmap, reduced, changed, matches, hero, extra }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const drawn = useRef<SVGPathElement>(null);
  const [points, setPoints] = useState<Point[]>([]);

  // Measure every stop's anchor (one pass a frame, when the layout changes) and draw the road through them.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      const box = el.getBoundingClientRect();
      const next = [...el.querySelectorAll<HTMLElement>('.stop-anchor')].map((a) => {
        const r = a.getBoundingClientRect();
        return { x: Math.round(r.left - box.left), y: Math.round(r.top - box.top) };
      });
      setPoints((prev) => (samePoints(prev, next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [road]);

  const currentIndex = road.current ? road.current.index : -1;
  const { travelled, ahead } = splitAt(points, Math.min(currentIndex, points.length - 1));
  const marker = currentIndex >= 0 ? points[currentIndex] : undefined;
  // The drawn line covers the travelled road only, up to the reading line.
  const travelledPoints = useMemo(() => (currentIndex >= 0 ? points.slice(0, currentIndex + 1) : points), [points, currentIndex]);
  const top = useCallback(() => wrap.current?.getBoundingClientRect().top ?? 0, []);
  useScrollDraw(drawn, travelledPoints, top, reduced);

  return (
    <div className="road" ref={wrap}>
      <svg className="road-svg" aria-hidden="true" focusable="false">
        {/* A road: kerbs, the bed, a dashed centre line ahead; the travelled part tinted and drawn as you scroll. */}
        <path className="road-kerb" d={roadPath(points)} />
        <path className="road-bed" d={roadPath(points)} />
        <path className="road-ahead" d={ahead} />
        <path className="road-travelled" d={travelled} />
        <path className="road-drawn" ref={drawn} d={travelled} />
      </svg>
      {marker && <span className="road-marker" aria-hidden="true" style={{ transform: `translate(${marker.x}px, ${marker.y}px)` }} />}
      {road.regions.map((region) => (
        <RegionView
          key={region.phase}
          region={region}
          roadmap={roadmap}
          reduced={reduced}
          changed={changed}
          matches={matches}
          hero={hero}
          extra={extra}
        />
      ))}
    </div>
  );
}

function RegionView({ region, roadmap, reduced, changed, matches, hero, extra }: Omit<Props, 'road'> & { region: Region }) {
  const [open, setOpen] = useState(region.current);
  const id = `phase-${region.phase}`;
  return (
    <section className={`region${region.current ? ' is-current' : ''}`} aria-labelledby={id} data-phase={region.phase}>
      <header className="region-head">
        <h2 id={id} className="region-title">
          {region.title}
        </h2>
        <p className="region-progress">
          <span className="num">
            {region.items.done}/{region.items.total}
          </span>{' '}
          items done
          {region.tasks.total > 0 && (
            <>
              {' · '}
              <span className="num">
                {region.tasks.done}/{region.tasks.total}
              </span>{' '}
              tasks
            </>
          )}
          {region.current && <span className="tag">Current</span>}
        </p>
        {(region.goal || region.exit) && (
          <details className="region-more" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary>{open ? 'Goal and exit criteria' : <Md text={region.goal ?? region.exit} inline />}</summary>
            {region.goal && (
              <p>
                <strong>Goal:</strong> <Md text={region.goal} inline />
              </p>
            )}
            {region.exit && (
              <p>
                <strong>Exit criteria:</strong> <Md text={region.exit} inline />
              </p>
            )}
          </details>
        )}
      </header>
      {region.stops.length ? (
        <ol className="stops">
          {region.stops.map((stop) => (
            <StopView
              key={stop.id}
              stop={stop}
              roadmap={roadmap}
              reduced={reduced}
              changed={changed.has(stop.id)}
              dimmed={matches ? !matches.has(stop.id) : false}
              hero={stop.state === 'current' ? hero : undefined}
              extra={extra}
            />
          ))}
        </ol>
      ) : (
        <p className="empty">No items yet.</p>
      )}
      {region.release && (
        <p className="milestone">
          <span className="milestone-flag" aria-hidden="true" />
          Release <span className="num">{region.release}</span>
          <span className="muted"> · {region.items.done === region.items.total && region.items.total ? 'reached' : 'at the end of this phase'}</span>
        </p>
      )}
    </section>
  );
}

function StopView({
  stop,
  roadmap,
  reduced,
  changed,
  dimmed,
  hero,
  extra,
}: {
  stop: Stop;
  roadmap: Roadmap;
  reduced: boolean;
  changed: boolean;
  dimmed: boolean;
  hero?: ReactNode;
  extra?: (stop: Stop) => ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const shown = useRevealed(ref, reduced);
  const p = stop.feature?.progress;
  const done = useCountUp(p?.tasks.done ?? 0, shown, reduced);
  const pct = p && p.tasks.total ? (done / p.tasks.total) * 100 : 0;
  const side = stop.state === 'current' ? 'wide' : stop.index % 2 ? 'right' : 'left';
  const blocked = p?.blocked ?? [];
  const body = (
    <>
      <span className="stop-top">
        <span className="num stop-id">{stop.id}</span>
        <StatusBadge roadmap={roadmap} status={stop.item.status} />
      </span>
      <span className="stop-title">
        <Md text={stop.item.title} inline />
        {stop.item.workItem && <span className="muted"> {stop.item.workItem}</span>}
      </span>
      {p && p.tasks.total > 0 ? (
        <span className="stop-progress">
          <span className="stop-track" aria-hidden="true">
            <span className="stop-fill" style={{ transform: `scaleX(${pct / 100})` }} />
          </span>
          <span className="num" aria-hidden="true">
            {done}/{p.tasks.total}
          </span>
          <span className="sr-only">
            {p.tasks.done} of {p.tasks.total} tasks done
          </span>
        </span>
      ) : (
        <span className="stop-note muted">{stop.feature?.error ?? (stop.link ? 'No tasks yet' : 'No spec yet')}</span>
      )}
      {blocked.length > 0 && (
        <span className="stop-block">
          <span aria-hidden="true">⛔</span> {blocked.length} blocked
          <span className="stop-reasons">
            {blocked.map((b) => (
              <span key={b.id}>
                <span className="num">{b.id}</span> {b.reason ?? 'No reason given'}
              </span>
            ))}
          </span>
        </span>
      )}
      {stop.kind !== 'done' && waitingOn(roadmap, stop.id).length > 0 && (
        <span className="stop-wait">Waiting on {waitingOn(roadmap, stop.id).join(', ')}</span>
      )}
      {extra?.(stop)}
      {dimmed && <span className="sr-only"> (not matching the filter)</span>}
    </>
  );
  return (
    <li
      ref={ref}
      id={`stop-${stop.id}`}
      data-stop={stop.id}
      tabIndex={-1}
      className={`stop side-${side} k-${stop.kind} st-${stop.state}${changed ? ' is-changed' : ''}${dimmed ? ' is-dim' : ''}${shown ? ' is-shown' : ''}`}
    >
      <span className="stop-anchor" aria-hidden="true" />
      {hero ?? (
        <>
          {stop.link ? (
            <a className="stop-card" href={href(`/feature/${stop.id}/board`)}>
              {body}
            </a>
          ) : (
            <div className="stop-card">{body}</div>
          )}
        </>
      )}
    </li>
  );
}
