// The kanban board of a feature's tasks: columns, filters, and the local (optimistic) version of a move. The server
// makes the real move with the same rules (tools/specs-index/lib/ops.mjs setTaskStatus).
import type { Feature, Task, TaskStatus } from '../types';

export const COLUMNS: { id: TaskStatus; title: string; empty: string }[] = [
  { id: 'todo', title: 'To do', empty: 'Nothing waiting.' },
  { id: 'in-progress', title: 'In progress', empty: 'Nothing started.' },
  { id: 'blocked', title: 'Blocked', empty: 'Nothing blocked.' },
  { id: 'done', title: 'Done', empty: 'Nothing done yet.' },
];

export interface Card {
  id: string;
  task: Task;
}

export interface BoardFilter {
  section?: string;
  criterion?: string;
  q?: string;
}

export function columns(feature: Feature, filter: BoardFilter = {}): Record<TaskStatus, Card[]> {
  const out: Record<TaskStatus, Card[]> = { todo: [], 'in-progress': [], blocked: [], done: [] };
  const items = feature.tasks?.items;
  if (!items) return out;
  const q = filter.q?.trim().toLowerCase();
  for (const id of items.order) {
    const task = items.byId[id];
    if (!task) continue;
    if (filter.section && task.section !== filter.section) continue;
    if (filter.criterion && !task.covers?.includes(filter.criterion)) continue;
    if (q && !`${id} ${task.text}`.toLowerCase().includes(q)) continue;
    (out[task.status] ?? out.todo).push({ id, task });
  }
  return out;
}

/** A copy of the feature with the task moved, as the server will record it. */
export function moveTask(
  feature: Feature,
  id: string,
  status: TaskStatus,
  { reason, today }: { reason?: string; today: string },
): Feature {
  const tasks = feature.tasks;
  const t = tasks?.items.byId[id];
  if (!tasks || !t) return feature;
  const next: Task = {
    ...t,
    status,
    blockedReason: status === 'blocked' ? (reason ?? t.blockedReason ?? null) : null,
    startedOn: status === 'in-progress' || status === 'done' ? (t.startedOn ?? today) : (t.startedOn ?? null),
    doneOn: status === 'done' ? today : null,
  };
  return { ...feature, tasks: { ...tasks, items: { ...tasks.items, byId: { ...tasks.items.byId, [id]: next } } } };
}

export const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
