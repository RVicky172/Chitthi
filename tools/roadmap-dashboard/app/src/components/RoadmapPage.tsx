import { useEffect, useMemo, useRef, useState } from 'react';
import { matchItem } from '../lib/filter';
import { useLiveChanges, useReducedMotion } from '../lib/motion';
import { localToday } from '../lib/pace';
import { buildRoad } from '../lib/road';
import { totals } from '../lib/roadmap';
import { replaceParams } from '../route';
import type { ProjectData } from '../types';
import { Md } from './bits';
import { Activity, StopAge } from './Activity';
import { Hero } from './Hero';
import { Road } from './Road';
import { goToStop, RouteRail } from './RouteRail';

interface Props {
  project: ProjectData;
  params: URLSearchParams;
}

export function RoadmapPage({ project, params }: Props) {
  const r = project.roadmap;
  const [q, setQ] = useState(params.get('q') ?? '');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const reduced = useReducedMotion();
  const live = useLiveChanges(project);
  const road = useMemo(() => (r ? buildRoad(r, project.features) : null), [r, project.features]);
  const today = localToday();
  // Open at ?at= or at the current stop, once (later data refreshes keep the scroll: 404's AC-12).
  const opened = useRef(false);
  const at = params.get('at');
  useEffect(() => {
    if (!road) return;
    const target = at ?? road.current?.id;
    if (!opened.current) {
      opened.current = true;
      // Placed, not announced: focus stays on the page heading (App).
      if (target) requestAnimationFrame(() => goToStop(target, true, false));
    } else if (at) goToStop(at, reduced);
  }, [road, at, reduced]);
  if (!r)
    return (
      <>
        <h1 tabIndex={-1}>Roadmap</h1>
        <p>specs/roadmap.json can’t be shown: see the problems below.</p>
        <Problems problems={project.problems} />
      </>
    );

  const update = (next: { q?: string; status?: string }) => {
    const nq = next.q ?? q;
    const ns = next.status ?? status;
    setQ(nq);
    setStatus(ns);
    replaceParams({ q: nq.trim() || null, status: ns || null });
  };
  const t = totals(r, project.features);
  const filtering = Boolean(q.trim() || status);
  const matches = Object.entries(r.items.byId).filter(([id, item]) => matchItem({ id, ...item }, { q, status }));
  // Filtering dims the stops that don't match (405 D4); the road and every stop stay in place.
  const matchSet = filtering ? new Set(matches.map(([id]) => id)) : undefined;

  return (
    <div className="roadmap">
      <h1 className="sr-only" tabIndex={-1}>
        {r.title}
      </h1>
      <p className="sr-only" role="status" aria-live="polite" key={live.key}>
        {live.announce}
      </p>
      <dl className="stats" aria-label="Totals">
        <Stat label="Items done" value={`${t.done}/${t.items}`} />
        <Stat label="In progress" value={t.inProgress} />
        <Stat label="Features with a spec" value={t.features} />
        <Stat label="Tasks done" value={`${t.tasks.done}/${t.tasks.total}`} />
        <Stat label="Blocked tasks" value={t.tasks.blocked} warn={t.tasks.blocked > 0} />
        <Stat label="Open questions" value={t.openQuestions} warn={t.openQuestions > 0} />
      </dl>

      <Problems problems={project.problems} />

      <Activity features={project.features} today={today} />

      <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="field search">
          <span>Search</span>
          <input type="search" value={q} placeholder="Number, title or work item" onChange={(e) => update({ q: e.target.value })} />
        </label>
        <div className="chips" role="group" aria-label="Status">
          <button type="button" className="chip" aria-pressed={!status} onClick={() => update({ status: '' })}>
            All
          </button>
          {r.statuses.order.map((sid) => (
            <button key={sid} type="button" className="chip" aria-pressed={status === sid} onClick={() => update({ status: status === sid ? '' : sid })}>
              <span aria-hidden="true">{r.statuses.byId[sid].icon}</span> {r.statuses.byId[sid].label}
            </button>
          ))}
        </div>
        <p className="count" aria-live="polite">
          {filtering ? `${matches.length} of ${t.items} items` : `${t.items} items`}
        </p>
      </form>

      {filtering && !matches.length && <p className="empty">Nothing matches: every stop is dimmed.</p>}

      {road && (
        <section aria-labelledby="the-road" className="road-section">
          <h2 id="the-road" className="sr-only">
            The road: every phase and item in order
          </h2>
          <RouteRail road={road} reduced={reduced} params={params} matches={matchSet} />
          <Road
            road={road}
            roadmap={r}
            reduced={reduced}
            changed={live.changed}
            matches={matchSet}
            hero={road.current && <Hero stop={road.current} road={road} roadmap={r} today={today} changed={live.changed} />}
            extra={(stop) => <StopAge stop={stop} today={today} />}
          />
        </section>
      )}

      <Now now={project.now} />

      {!filtering && r.backlog.order.length > 0 && (
        <section className="backlog" aria-labelledby="backlog">
          <h2 id="backlog" className="section-title">
            {r.backlog.title ?? 'Backlog'}
          </h2>
          <ul className="backlog-list">
            {r.backlog.order.map((bid) => {
              const b = r.backlog.byId[bid];
              return b ? (
                <li key={bid}>
                  <Md text={b.text} />
                  {b.added && <p className="muted">Added {b.added}</p>}
                </li>
              ) : null;
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className={`stat${warn ? ' warn' : ''}`}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

function Problems({ problems }: { problems: string[] }) {
  if (!problems.length) return null;
  return (
    <section className="callout problems" aria-labelledby="problems">
      <h2 id="problems">specs:check found {problems.length} problem{problems.length > 1 ? 's' : ''}</h2>
      <ul>
        {problems.map((p) => (
          <li key={p}>
            <code>{p}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Now({ now }: { now: ProjectData['now'] }) {
  const [open, setOpen] = useState(false);
  if (!now.state && !now.progress) return null;
  return (
    <details className="now" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="section-title">Now</span>
        <span className="muted">{[now.state?.title, now.progress && `latest: ${now.progress.title}`].filter(Boolean).join(' · ')}</span>
      </summary>
      <div className="now-grid">
        {now.state && (
          <div>
            <h3>{now.state.title}</h3>
            <Md text={now.state.markdown} />
          </div>
        )}
        {now.progress && (
          <div>
            <h3>{now.progress.title}</h3>
            <Md text={now.progress.markdown} />
          </div>
        )}
      </div>
    </details>
  );
}
