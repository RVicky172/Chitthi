// Talking to the dashboard server (../lib/server.mjs): reads, polling for changes, and moving a task.
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_SCHEMA, type FeatureData, type ProjectData, type TaskStatus } from './types';

const POLL_MS = 2000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

export interface Live {
  data: ProjectData | null;
  error: string | null;
  /** The server runs another API version: it has to be restarted. */
  stale: boolean;
  /** The server stopped answering. */
  offline: boolean;
  updatedAt: Date | null;
}

/** The whole project; asks the server for its version every 2 s and reloads when it changed. */
export function useProject(): Live {
  const [live, setLive] = useState<Live>({ data: null, error: null, stale: false, offline: false, updatedAt: null });
  const version = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const load = async () => {
      const data = await getJson<ProjectData>('/api/project');
      if (cancelled) return;
      version.current = data.version;
      setLive({ data, error: null, stale: data.schema !== API_SCHEMA, offline: false, updatedAt: new Date() });
    };
    load().catch((e: Error) => !cancelled && setLive((l) => ({ ...l, error: e.message })));
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const v = await getJson<{ schema: number; version: string }>('/api/version');
        if (v.version !== version.current) await load();
        else setLive((l) => (l.offline ? { ...l, offline: false } : l));
      } catch {
        if (!cancelled) setLive((l) => ({ ...l, offline: true }));
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return live;
}

/**
 * One feature, reloaded whenever the project's version changes; `replace` sets it locally (optimistic moves).
 * Nothing is asked for while `enabled` is false (an item with no feature folder).
 */
export function useFeature(id: string, version: string | undefined, enabled = true) {
  const [data, setData] = useState<FeatureData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getJson<FeatureData>(`/api/features/${id}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, version, enabled]);
  const replace = useCallback((d: FeatureData) => setData(d), []);
  return { data: data?.id === id ? data : null, error, replace };
}

/** Moves a task on the server; resolves with the feature as saved, or rejects with the server's message. */
export async function moveTaskOnServer(id: string, task: string, status: TaskStatus, reason?: string): Promise<FeatureData> {
  const res = await fetch(`/api/features/${id}/tasks/${task}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reason ? { status, reason } : { status }),
  });
  const body = (await res.json().catch(() => ({}))) as FeatureData & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `The server answered ${res.status}.`);
  return body;
}
