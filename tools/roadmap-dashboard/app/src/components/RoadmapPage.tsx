import { useMemo, useState } from 'react';
import { matchItem } from '../lib/filter';
import { useLiveChanges, useReducedMotion } from '../lib/motion';
import { localToday } from '../lib/pace';
import { buildRoad } from '../lib/road';
import { totals, waitingOn } from '../lib/roadmap';
import { href, replaceParams } from '../route';
import type { FeatureSummary, ProjectData, Roadmap, RoadmapItem } from '../types';
import { Bar, FeatureBadge, Md, StatusBadge } from './bits';
import { Hero } from './Hero';
import { Road } from './Road';

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

  return (
    <div className="roadmap">
      <h1 className="sr-only" tabIndex={-1}>
        {r.title}
      </h1>
      <dl className="stats" aria-label="Totals">
        <Stat label="Items done" value={`${t.done}/${t.items}`} />
        <Stat label="In progress" value={t.inProgress} />
        <Stat label="Features with a spec" value={t.features} />
        <Stat label="Tasks done" value={`${t.tasks.done}/${t.tasks.total}`} />
        <Stat label="Blocked tasks" value={t.tasks.blocked} warn={t.tasks.blocked > 0} />
        <Stat label="Open questions" value={t.openQuestions} warn={t.openQuestions > 0} />
      </dl>

      <Problems problems={project.problems} />

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

      {filtering ? (
        <section aria-labelledby="results">
          <h2 id="results" className="section-title">
            Results
          </h2>
          {matches.length ? (
            <ul className="rows">
              {matches.map(([id, item]) => (
                <ItemRow key={id} id={id} item={item} roadmap={r} feature={project.features[id]} />
              ))}
            </ul>
          ) : (
            <p className="empty">Nothing matches.</p>
          )}
        </section>
      ) : (
        road && (
          <section aria-labelledby="the-road" className="road-section">
            <h2 id="the-road" className="sr-only">
              The road: every phase and item in order
            </h2>
            <Road
              road={road}
              roadmap={r}
              reduced={reduced}
              changed={live.changed}
              hero={road.current && <Hero stop={road.current} road={road} roadmap={r} today={localToday()} changed={live.changed} />}
            />
          </section>
        )
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

function ItemRow({ id, item, roadmap, feature }: { id: string; item: RoadmapItem; roadmap: Roadmap; feature?: FeatureSummary }) {
  const waiting = waitingOn(roadmap, id);
  const p = feature?.progress;
  return (
    <li>
      <a className="row" href={href(`/feature/${id}/board`)}>
        <span className="num row-id">{id}</span>
        <span className="row-main">
          <span className="row-title">
            <Md text={item.title} inline />
            {item.workItem && <span className="muted"> ({item.workItem})</span>}
          </span>
          <span className="row-meta">
            {feature?.status && <FeatureBadge status={feature.status} />}
            {p && <span>Criteria {p.criteria.done}/{p.criteria.total}</span>}
            {p && p.openQuestions > 0 && <span className="tag warn">{p.openQuestions} open questions</span>}
            {p?.next && (
              <span>
                Next <span className="num">{p.next.id}</span>
              </span>
            )}
            {!feature && <span className="muted">No spec yet</span>}
            {feature?.error && <span className="tag warn">{feature.error}</span>}
            {waiting.length > 0 && <span className="tag">Waiting on {waiting.join(', ')}</span>}
            {item.note && <span className="muted">{item.note}</span>}
          </span>
        </span>
        <span className="row-side">
          <StatusBadge roadmap={roadmap} status={item.status} />
          {p && <Bar done={p.tasks.done} total={p.tasks.total} label={`${id} tasks done`} />}
        </span>
      </a>
    </li>
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
