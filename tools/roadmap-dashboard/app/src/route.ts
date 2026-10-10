// Hash routes, so the page needs no server routing and every view can be bookmarked:
//   #/                                   roadmap          ?q=…&status=…&at=203   (at: the stop to open at)
//   #/feature/202/board                  feature tab      ?section=…&criterion=…&q=…   (board filters)
//   #/feature/202/docs                   documents        ?doc=spec|plan|tasks
import { useEffect, useState } from 'react';

export type Tab = 'board' | 'spec' | 'plan' | 'docs';
export const TABS: Tab[] = ['board', 'spec', 'plan', 'docs'];

export type Route =
  | { view: 'roadmap'; params: URLSearchParams }
  | { view: 'feature'; id: string; tab: Tab; params: URLSearchParams };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const m = /^\/feature\/(\d{3})(?:\/(board|spec|plan|docs))?\/?$/.exec(path || '/');
  if (m) return { view: 'feature', id: m[1], tab: (m[2] as Tab) ?? 'board', params };
  return { view: 'roadmap', params };
}

export function href(path: string, params?: Record<string, string | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v) p.set(k, v);
  const q = p.toString();
  return `#${path}${q ? `?${q}` : ''}`;
}

/** Changes the query of the current route without adding a history entry or a hashchange re-render. */
export function replaceParams(params: Record<string, string | undefined | null>) {
  const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
  history.replaceState(null, '', href(path, params));
}

export function useRoute(): Route {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseRoute(hash);
}
