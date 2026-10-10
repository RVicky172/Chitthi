// What changed between two loads of the project (405, AC-10): tasks that moved and features that changed status, as
// shown on the road and announced once to screen readers. Only real moves count: a first load, a stale schema, a new
// or vanished feature and new tasks change nothing.
import { API_SCHEMA, type ProjectData } from '../types';

export interface Change {
  feature: string;
  task?: string;
  from: string;
  to: string;
}

const TASK_WORDS: Record<string, string> = { done: 'done', 'in-progress': 'started', blocked: 'blocked', todo: 'back to do' };
const FEATURE_WORDS: Record<string, string> = {
  draft: 'drafted',
  approved: 'approved',
  'in-progress': 'in progress',
  implemented: 'implemented',
  superseded: 'superseded',
};

export function diffProjects(prev: ProjectData | null, next: ProjectData): { changes: Change[]; announce: string } {
  if (!prev || prev.schema !== API_SCHEMA || next.schema !== API_SCHEMA) return { changes: [], announce: '' };
  const changes: Change[] = [];
  for (const [id, now] of Object.entries(next.features)) {
    const was = prev.features[id];
    if (!was || !was.progress || !now.progress) continue;
    if (was.status && now.status && was.status !== now.status) changes.push({ feature: id, from: was.status, to: now.status });
    for (const [task, to] of Object.entries(now.progress.statuses)) {
      const from = was.progress.statuses[task];
      if (from && from !== to) changes.push({ feature: id, task, from, to });
    }
  }
  const announce = changes
    .map((c) => (c.task ? `${c.feature} ${c.task} ${TASK_WORDS[c.to] ?? c.to}` : `${c.feature} ${FEATURE_WORDS[c.to] ?? c.to}`))
    .join('; ');
  return { changes, announce };
}

/** The ids a change marks on the page: the stop ("204") and, for a task, the task ("204/T030"). */
export const changedIds = (changes: Change[]) => new Set(changes.flatMap((c) => (c.task ? [c.feature, `${c.feature}/${c.task}`] : [c.feature])));
