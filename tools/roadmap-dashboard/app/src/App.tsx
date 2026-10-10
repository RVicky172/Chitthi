import { useEffect, type ReactNode } from 'react';
import { useProject } from './api';
import { FeaturePage } from './components/FeaturePage';
import { RoadmapPage } from './components/RoadmapPage';
import { TopBar } from './components/TopBar';
import { useRoute } from './route';

export function App() {
  const live = useProject();
  const route = useRoute();
  const key = route.view === 'feature' ? `f-${route.id}` : 'roadmap';

  // A new page: start at the top with focus on its heading, so screen readers announce it. The roadmap places itself
  // (at the current stop, or ?at=: 405).
  useEffect(() => {
    if (route.view !== 'roadmap') window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- once per page, not per route object

  let body;
  if (live.error && !live.data) body = <Notice title="Couldn’t load the roadmap">{live.error}</Notice>;
  else if (live.stale)
    body = <Notice title="The dashboard server was updated">Restart it: Ctrl + C, then npm run roadmap.</Notice>;
  else if (!live.data) body = <p className="loading">Loading…</p>;
  else if (route.view === 'feature') body = <FeaturePage key={key} project={live.data} route={route} />;
  else body = <RoadmapPage project={live.data} params={route.params} />;

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => (e.preventDefault(), document.getElementById('main')?.focus())}>
        Skip to content
      </a>
      <TopBar live={live} />
      <main id="main" tabIndex={-1}>
        {body}
      </main>
    </>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="notice" role="alert">
      <h1 tabIndex={-1}>{title}</h1>
      <p>{children}</p>
    </section>
  );
}
