// The roadmap as a road (405): every item a stop, in phase order, travelled up to the current stop and ahead after it,
// grouped into phase regions; plus what the current stop's hero shows and every blocked task. Pure: the components only
// render what these functions give.
import type { FeatureSummary, Progress, Roadmap, RoadmapItem } from '../types';
import { currentPhase, isDone } from './roadmap';

export type StopState = 'travelled' | 'current' | 'ahead';
export type StopKind = 'done' | 'in-progress' | 'blocked' | 'approved' | 'drafted' | 'not-started';

export interface Stop {
  id: string;
  /** Position on the road, from 0. */
  index: number;
  phase: string;
  item: RoadmapItem;
  feature?: FeatureSummary;
  state: StopState;
  kind: StopKind;
  /** The roadmap status's label (or its id when the roadmap doesn't define it). */
  statusText: string;
  /** Has a spec: links to its board. */
  link: boolean;
}

export interface Region {
  phase: string;
  title: string;
  goal: string | null;
  exit: string | null;
  release: string | null;
  items: { done: number; total: number };
  tasks: { done: number; total: number };
  stops: Stop[];
  /** Holds the current stop. */
  current: boolean;
}

export interface Road {
  regions: Region[];
  stops: Stop[];
  current: Stop | null;
}

function kindOf(roadmap: Roadmap, item: RoadmapItem, feature?: FeatureSummary): StopKind {
  const fits = roadmap.statuses.byId[item.status]?.featureStatus ?? [];
  if (fits.includes('implemented')) return 'done';
  if (feature?.progress?.blocked.length) return 'blocked';
  if (fits.includes('in-progress')) return 'in-progress';
  if (fits.includes('approved')) return 'approved';
  if (fits.includes('draft')) return 'drafted';
  return 'not-started';
}

/** The current phase's first item in progress, else its first item not done, else the first item not done after it,
 * else the first not done anywhere; null when everything is done. */
function currentId(roadmap: Roadmap, order: { id: string; phase: string }[]): string | null {
  const phase = currentPhase(roadmap);
  const inProgress = (id: string) => roadmap.statuses.byId[roadmap.items.byId[id].status]?.featureStatus.includes('in-progress');
  const notDone = (s: { id: string }) => !isDone(roadmap, s.id);
  const own = order.filter((s) => s.phase === phase);
  const start = order.findIndex((s) => s.phase === phase);
  return (
    own.find((s) => inProgress(s.id))?.id ??
    own.find(notDone)?.id ??
    order.slice(Math.max(0, start)).find(notDone)?.id ??
    order.find(notDone)?.id ??
    null
  );
}

export function buildRoad(roadmap: Roadmap, features: Record<string, FeatureSummary>): Road {
  const order = roadmap.phases.order
    .filter((p) => roadmap.phases.byId[p])
    .flatMap((phase) => roadmap.phases.byId[phase].items.filter((id) => roadmap.items.byId[id]).map((id) => ({ id, phase })));
  const cur = currentId(roadmap, order);
  const curIndex = cur === null ? order.length : order.findIndex((s) => s.id === cur);
  const stops: Stop[] = order.map(({ id, phase }, index) => {
    const item = roadmap.items.byId[id];
    const feature = features[id];
    return {
      id,
      index,
      phase,
      item,
      feature,
      state: index < curIndex ? 'travelled' : index === curIndex ? 'current' : 'ahead',
      kind: kindOf(roadmap, item, feature),
      statusText: roadmap.statuses.byId[item.status]?.label ?? item.status,
      link: Boolean(feature),
    };
  });
  const regions: Region[] = roadmap.phases.order
    .filter((p) => roadmap.phases.byId[p])
    .map((phase) => {
      const p = roadmap.phases.byId[phase];
      const own = stops.filter((s) => s.phase === phase);
      const tasks = { done: 0, total: 0 };
      for (const s of own) {
        tasks.done += s.feature?.progress?.tasks.done ?? 0;
        tasks.total += s.feature?.progress?.tasks.total ?? 0;
      }
      return {
        phase,
        title: p.title,
        goal: p.goal ?? null,
        exit: p.exit ?? null,
        release: p.release ?? null,
        items: { done: own.filter((s) => s.kind === 'done').length, total: own.length },
        tasks,
        stops: own,
        current: own.some((s) => s.state === 'current'),
      };
    });
  return { regions, stops, current: stops.find((s) => s.state === 'current') ?? null };
}

export interface HeroModel {
  ring: { done: number; total: number };
  segments: Progress['sections'];
  running: Progress['running'];
  next: Progress['next'];
  blocked: Progress['blocked'];
}

/** What the current stop shows when it opens: null for an item without a (readable) spec. */
export function heroModel(stop: Stop): HeroModel | null {
  const p = stop.feature?.progress;
  if (!p) return null;
  return {
    ring: { done: p.tasks.done, total: p.tasks.total },
    segments: p.sections,
    running: p.running,
    next: p.next,
    blocked: p.blocked,
  };
}

/** Every blocked task on the road, with its stop, in road order. */
export function roadblocks(stops: Stop[]): { stop: Stop; task: Progress['blocked'][number] }[] {
  return stops.flatMap((stop) => (stop.feature?.progress?.blocked ?? []).map((task) => ({ stop, task })));
}
