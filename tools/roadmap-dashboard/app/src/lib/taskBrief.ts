import type { Feature } from '../types';

export const TASK_BRIEF_MAX_LENGTH = 2000;

export type TaskBriefResult = { ok: true; text: string } | { ok: false; reason: 'task-not-found' | 'required-content-too-long' };

/** Build a compact handoff from the feature data already loaded for its task board. */
export function taskBrief(feature: Feature, taskId: string): TaskBriefResult {
  const task = feature.tasks?.items.byId[taskId];
  if (!task) return { ok: false, reason: 'task-not-found' };

  const criteria = (task.covers ?? [])
    .map((id) => ({ id, criterion: feature.spec.criteria.byId[id] }))
    .filter((entry) => entry.criterion)
    .map(({ id, criterion }) => `- ${id}: ${criterion.text}`);
  const files = task.files?.length ? task.files.map((file) => `- ${file}`) : [];
  const required = [
    `Feature: ${feature.id} — ${feature.title}`,
    `Task: ${taskId} (${task.section})`,
    '',
    'Instruction:',
    task.text,
    ...(criteria.length ? ['', 'Acceptance criteria:', ...criteria] : []),
    ...(files.length ? ['', 'Files:', ...files] : []),
    ...(task.test ? ['', 'Proving test:', task.test] : []),
  ].join('\n');

  if (required.length > TASK_BRIEF_MAX_LENGTH) return { ok: false, reason: 'required-content-too-long' };

  const summary = feature.spec.summary.trim();
  const contexts = [
    summary ? `Feature context: ${summary.slice(0, 300)}` : '',
    feature.plan?.header?.trim() ? `Plan context: ${feature.plan.header.trim()}` : '',
  ].filter(Boolean);
  let text = required;
  for (const context of contexts) {
    const next = `${text}\n\n${context}`;
    if (next.length <= TASK_BRIEF_MAX_LENGTH) text = next;
  }
  return { ok: true, text };
}
