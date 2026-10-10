// The data the dashboard reads: feature.json (specs/schema/feature.schema.json), roadmap.json
// (specs/schema/roadmap.schema.json) and the server's API answers (../lib/project.mjs). Keep in step with them.

export type TaskStatus = 'todo' | 'in-progress' | 'blocked' | 'done';
export type FeatureStatus = 'draft' | 'approved' | 'in-progress' | 'implemented' | 'superseded';

export interface Collection<T> {
  order: string[];
  byId: Record<string, T>;
}

export interface Criterion {
  text: string;
  proof?: string | null;
  group?: string | null;
  done: boolean;
}
export interface Question {
  text: string;
  open: boolean;
}
export interface SpecSection {
  kind: 'summary' | 'stories' | 'criteria' | 'questions' | 'changelog' | 'markdown';
  title: string;
  markdown?: string;
}
export interface Spec {
  phase?: string | null;
  summary: string;
  stories: Collection<{ text: string }>;
  criteria: Collection<Criterion>;
  groupIntros?: Record<string, string>;
  questions: Collection<Question>;
  changelog: { date: string; text: string }[];
  sections: SpecSection[];
}

export interface Plan {
  header: string;
  files?: { file: string; change: string; purpose: string }[];
  risks?: { text: string }[];
  constitution?: { principle: string; status: string; notes: string }[];
  sections: { kind: 'files' | 'risks' | 'constitution' | 'markdown'; title: string; markdown?: string }[];
}

export interface Task {
  text: string;
  section: string;
  status: TaskStatus;
  blockedReason?: string | null;
  parallel?: boolean;
  manual?: boolean;
  covers?: string[];
  files?: string[];
  test?: string | null;
  startedOn?: string | null;
  doneOn?: string | null;
  commits?: string[];
  notes?: string[];
}
export interface Tasks {
  intro: string;
  sections: { title: string; intro?: string | null }[];
  items: Collection<Task>;
}

export interface Feature {
  schema: 2;
  id: string;
  title: string;
  workItem?: string | null;
  status: FeatureStatus;
  owner?: string | null;
  dates: { created: string; approved?: string | null; started?: string | null; done?: string | null };
  git?: { branch?: string | null };
  spec: Spec;
  plan: Plan | null;
  tasks: Tasks | null;
}

export interface RoadmapStatus {
  icon: string;
  label: string;
  featureStatus: FeatureStatus[];
}
export interface Phase {
  title: string;
  goal?: string | null;
  exit?: string | null;
  /** The release the phase ends with: a milestone on the road. */
  release?: string | null;
  intro?: string | null;
  items: string[];
}
export interface RoadmapItem {
  title: string;
  workItem?: string | null;
  status: string;
  note?: string;
  folder: string | null;
  needs: string[];
}
export interface Roadmap {
  schema: 1;
  title: string;
  updated: string;
  lead?: string | null;
  intro?: string | null;
  currentPhase?: string | null;
  statuses: Collection<RoadmapStatus>;
  phases: Collection<Phase>;
  items: { byId: Record<string, RoadmapItem> };
  backlog: Collection<{ text: string; added?: string | null }> & { title?: string };
}

export interface Progress {
  criteria: { done: number; total: number };
  tasks: { done: number; total: number; byStatus: Record<TaskStatus, number> };
  openQuestions: number;
  next: { id: string; text: string; status: TaskStatus } | null;
  /** Task sections in order, with their counts (405). */
  sections: { title: string; done: number; total: number }[];
  running: { id: string; text: string; section: string; startedOn: string | null }[];
  blocked: { id: string; text: string; reason: string | null }[];
  /** Done tasks with a date. */
  finished: { id: string; text: string; doneOn: string }[];
  /** Task id → status, for spotting changes between two loads. */
  statuses: Record<string, TaskStatus>;
  /** The first task still to do (the hero's "Next"). */
  upNext: { id: string; text: string } | null;
}
export interface FeatureSummary {
  id: string;
  folder: string;
  title?: string;
  status?: FeatureStatus;
  workItem?: string | null;
  dates?: Feature['dates'];
  branch?: string | null;
  progress?: Progress;
  error?: string;
}
export interface NowSection {
  title: string;
  markdown: string;
}
export interface ProjectData {
  schema: number;
  version: string;
  roadmap: Roadmap | null;
  features: Record<string, FeatureSummary>;
  now: { state: NowSection | null; progress: NowSection | null };
  problems: string[];
}
export interface FeatureData {
  schema: number;
  id: string;
  folder: string;
  feature: Feature | null;
  coverage: Record<string, string[]>;
  docs: { spec: string | null; plan: string | null; tasks: string | null };
}

/** The API's shape version; bumped with lib/project.mjs API_SCHEMA. */
export const API_SCHEMA = 3;
