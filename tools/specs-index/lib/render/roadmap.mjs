// specs/roadmap.md, written from specs/roadmap.json. The output is deterministic: same JSON, same bytes.
import { entries } from '../store.mjs';

export const ROADMAP_NOTE =
  '<!-- Generated from specs/roadmap.json by `npm run specs:sync`. Edit the JSON (or use `npm run specs`), not this file. -->';

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function itemRow(id, item, statuses) {
  const status = statuses.byId?.[item.status];
  const title = cell(item.title) + (item.workItem ? ` (${item.workItem})` : '');
  const spec = item.folder ? `[spec](${item.folder}/spec.md)` : '—';
  const state = (status ? status.icon : item.status) + (item.note ? ` ${cell(item.note)}` : '');
  const needs = item.needs?.length ? item.needs.join(', ') : '—';
  return `| ${id} | ${title} | ${spec} | ${state} | ${needs} |`;
}

export function renderRoadmap(r) {
  const out = [ROADMAP_NOTE, '', `# ${r.title}`, ''];
  const legend = entries(r.statuses)
    .map(([, s]) => `${s.icon} ${s.label}`)
    .join(' · ');
  const quote = [...(r.lead ? r.lead.split('\n') : []), `Status legend: ${legend}`];
  out.push(...quote.map((l) => `> ${l}`), '', `**Last updated:** ${r.updated}`, '');
  if (r.intro) out.push(r.intro, '');
  out.push('---', '');

  for (const [, phase] of entries(r.phases)) {
    out.push(`## ${phase.title}`, '');
    if (phase.goal) out.push(`_Goal:_ ${phase.goal}`, '');
    if (phase.release) out.push(`_Release:_ ${phase.release}`, '');
    if (phase.intro) out.push(phase.intro, '');
    const items = phase.items.map((id) => [id, r.items.byId[id]]).filter(([, item]) => item);
    if (items.length) {
      out.push('| #   | Feature | Spec | Status | Needs |', '| --- | ------- | ---- | ------ | ----- |');
      for (const [id, item] of items) out.push(itemRow(id, item, r.statuses));
      out.push('');
    } else out.push('_No items yet._', '');
    if (phase.exit) out.push(`**Exit criteria:** ${phase.exit}`, '');
  }

  out.push(`## ${r.backlog.title ?? 'Backlog'}`, '');
  for (const [, entry] of entries(r.backlog)) {
    const lines = entry.text.split(/\r?\n/);
    if (entry.added) lines[lines.length - 1] += ` _(added ${entry.added})_`;
    out.push(`- ${lines[0]}`, ...lines.slice(1).map((l) => (l ? `  ${l}` : '')));
  }

  while (out.at(-1) === '') out.pop();
  return out.join('\n') + '\n';
}
