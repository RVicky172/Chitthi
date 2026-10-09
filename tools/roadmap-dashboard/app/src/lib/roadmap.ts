// Roadmap-level views of the data: which phase is current, how far each phase is, what an item waits on.
import type { FeatureSummary, Roadmap } from '../types';

/** True when the item's roadmap status is one that fits an implemented feature (✔️). */
export function isDone(roadmap: Roadmap, itemId: string): boolean {
  const item = roadmap.items.byId[itemId];
  return Boolean(item && roadmap.statuses.byId[item.status]?.featureStatus.includes('implemented'));
}

const isInProgress = (roadmap: Roadmap, itemId: string) => {
  const item = roadmap.items.byId[itemId];
  return Boolean(item && roadmap.statuses.byId[item.status]?.featureStatus.includes('in-progress'));
};

/**
 * The phase to show first: roadmap.currentPhase when it names a phase, else the first phase with an item in
 * progress, else the first one not finished, else the last.
 */
export function currentPhase(roadmap: Roadmap): string | null {
  const order = roadmap.phases.order.filter((id) => roadmap.phases.byId[id]);
  if (roadmap.currentPhase && roadmap.phases.byId[roadmap.currentPhase]) return roadmap.currentPhase;
  const items = (id: string) => roadmap.phases.byId[id].items;
  return (
    order.find((id) => items(id).some((i) => isInProgress(roadmap, i))) ??
    order.find((id) => items(id).some((i) => !isDone(roadmap, i))) ??
    order.at(-1) ??
    null
  );
}

export interface PhaseProgress {
  done: number;
  total: number;
  byStatus: Record<string, number>;
}

export function phaseProgress(roadmap: Roadmap, phaseId: string): PhaseProgress {
  const ids = (roadmap.phases.byId[phaseId]?.items ?? []).filter((id) => roadmap.items.byId[id]);
  const byStatus: Record<string, number> = {};
  for (const id of ids) {
    const s = roadmap.items.byId[id].status;
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  return { done: ids.filter((id) => isDone(roadmap, id)).length, total: ids.length, byStatus };
}

/** The items this one needs that are not done yet. */
export function waitingOn(roadmap: Roadmap, itemId: string): string[] {
  return (roadmap.items.byId[itemId]?.needs ?? []).filter((n) => !isDone(roadmap, n));
}

/** Items that need this one. */
export function neededBy(roadmap: Roadmap, itemId: string): string[] {
  return Object.entries(roadmap.items.byId)
    .filter(([, item]) => item.needs.includes(itemId))
    .map(([id]) => id);
}

export function totals(roadmap: Roadmap, features: Record<string, FeatureSummary>) {
  const ids = Object.keys(roadmap.items.byId);
  const tasks = { done: 0, total: 0, blocked: 0 };
  let openQuestions = 0;
  for (const f of Object.values(features)) {
    if (!f.progress) continue;
    tasks.done += f.progress.tasks.done;
    tasks.total += f.progress.tasks.total;
    tasks.blocked += f.progress.tasks.byStatus.blocked ?? 0;
    openQuestions += f.progress.openQuestions;
  }
  return {
    items: ids.length,
    done: ids.filter((id) => isDone(roadmap, id)).length,
    inProgress: ids.filter((id) => isInProgress(roadmap, id)).length,
    features: Object.keys(features).length,
    tasks,
    openQuestions,
  };
}
