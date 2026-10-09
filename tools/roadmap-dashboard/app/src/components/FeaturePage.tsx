import { useFeature } from '../api';
import { neededBy, waitingOn } from '../lib/roadmap';
import { href, TABS, type Route, type Tab } from '../route';
import type { FeatureData, ProjectData } from '../types';
import { Board } from './Board';
import { FeatureBadge, Md, Ring, StatusBadge } from './bits';
import { DocsTab, PlanTab, SpecTab } from './Documents';

const TAB_LABELS: Record<Tab, string> = { board: 'Board', spec: 'Spec', plan: 'Plan', docs: 'Documents' };

export function FeaturePage({ project, route }: { project: ProjectData; route: Extract<Route, { view: 'feature' }> }) {
  const { id, tab } = route;
  const r = project.roadmap;
  const item = r?.items.byId[id];
  const summary = project.features[id];
  const { data, error, replace } = useFeature(id, project.version, Boolean(summary && !summary.error));
  const f = data?.feature;
  const title = f?.title ?? summary?.title ?? item?.title ?? `Feature ${id}`;
  const p = summary?.progress;

  return (
    <article className="feature">
      <a className="back" href="#/">
        ← Roadmap
      </a>
      <header className="feature-head">
        <div className="feature-title">
          <p className="eyebrow num">
            {id}
            {(f?.workItem ?? item?.workItem) && ` · ${f?.workItem ?? item?.workItem}`}
          </p>
          <h1 tabIndex={-1}>
            <Md text={title} inline />
          </h1>
          <div className="facts">
            {r && item && <StatusBadge roadmap={r} status={item.status} />}
            {f && <FeatureBadge status={f.status} />}
            {f?.git?.branch && (
              <span>
                Branch <code>{f.git.branch}</code>
              </span>
            )}
            {f && <Dates dates={f.dates} />}
          </div>
          {r && item && <Links roadmapId={id} roadmap={r} />}
        </div>
        {p && p.tasks.total > 0 && (
          <div className="feature-score">
            <Ring done={p.tasks.done} total={p.tasks.total} label="Tasks done" />
            <dl className="mini-stats">
              <div>
                <dt>Tasks</dt>
                <dd className="num">
                  {p.tasks.done}/{p.tasks.total}
                </dd>
              </div>
              <div>
                <dt>Criteria</dt>
                <dd className="num">
                  {p.criteria.done}/{p.criteria.total}
                </dd>
              </div>
              <div className={p.tasks.byStatus.blocked ? 'warn' : ''}>
                <dt>Blocked</dt>
                <dd className="num">{p.tasks.byStatus.blocked}</dd>
              </div>
            </dl>
          </div>
        )}
      </header>

      {!summary ? (
        <p className="empty card-like">{item ? 'No spec yet: this item has no feature folder.' : `Nothing called ${id} on the roadmap.`}</p>
      ) : summary.error ? (
        <p className="callout problems">{summary.error}: see the problems on the roadmap page.</p>
      ) : (
        <>
          <nav className="tabs" role="tablist" aria-label="Feature views">
            {TABS.map((t) => (
              <a key={t} role="tab" id={`tab-${t}`} href={href(`/feature/${id}/${t}`)} aria-selected={t === tab} aria-controls="panel">
                {TAB_LABELS[t]}
                {t === 'board' && p && <span className="tab-count num">{p.tasks.total}</span>}
                {t === 'spec' && p && (
                  <span className="tab-count num">
                    {p.criteria.done}/{p.criteria.total}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div className="panel" role="tabpanel" id="panel" aria-labelledby={`tab-${tab}`}>
            {error && !data && <p className="callout problems">{error}</p>}
            {!data && !error && <p className="loading">Loading…</p>}
            {data && <TabBody tab={tab} data={data} params={route.params} replace={replace} />}
          </div>
        </>
      )}
    </article>
  );
}

function TabBody({ tab, data, params, replace }: { tab: Tab; data: FeatureData; params: URLSearchParams; replace: (d: FeatureData) => void }) {
  if (!data.feature) return <p className="callout problems">feature.json can’t be read: see the problems on the roadmap page.</p>;
  if (tab === 'board') return <Board data={data} params={params} replace={replace} />;
  if (tab === 'spec') return <SpecTab data={data} />;
  if (tab === 'plan') return <PlanTab data={data} />;
  return <DocsTab data={data} params={params} />;
}

function Dates({ dates }: { dates: { created: string; approved?: string | null; started?: string | null; done?: string | null } }) {
  const list = [
    ['Created', dates.created],
    ['Approved', dates.approved],
    ['Started', dates.started],
    ['Done', dates.done],
  ].filter(([, v]) => v);
  return (
    <span className="dates">
      {list.map(([k, v]) => (
        <span key={k}>
          {k} <span className="num">{v}</span>
        </span>
      ))}
    </span>
  );
}

function Links({ roadmapId, roadmap }: { roadmapId: string; roadmap: NonNullable<ProjectData['roadmap']> }) {
  const item = roadmap.items.byId[roadmapId];
  const waiting = waitingOn(roadmap, roadmapId);
  const by = neededBy(roadmap, roadmapId);
  if (!item.needs.length && !by.length) return null;
  return (
    <p className="links">
      {item.needs.length > 0 && (
        <span>
          Needs{' '}
          {item.needs.map((n, i) => (
            <span key={n}>
              {i > 0 && ', '}
              <a href={href(`/feature/${n}/board`)}>{n}</a>
              {waiting.includes(n) ? ' (not done)' : ' ✓'}
            </span>
          ))}
        </span>
      )}
      {by.length > 0 && (
        <span>
          Needed by{' '}
          {by.map((n, i) => (
            <span key={n}>
              {i > 0 && ', '}
              <a href={href(`/feature/${n}/board`)}>{n}</a>
            </span>
          ))}
        </span>
      )}
    </p>
  );
}

