// spec.md, plan.md and tasks.md, written from feature.json. Pure and deterministic: the same JSON always gives the
// same bytes. Blocks are joined by one blank line; every file starts with the generated note.
import { entries } from '../store.mjs';

export const FEATURE_NOTE =
  '<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->';

export const STATUS_LABELS = {
  draft: 'Draft',
  approved: 'Approved',
  'in-progress': 'In Progress',
  implemented: 'Implemented',
  superseded: 'Superseded',
};

const NONE = '_None yet._';
const finish = (blocks) => blocks.filter((b) => b != null && b !== '').join('\n\n') + '\n';
/** Continuation lines of a list item, indented under its text. */
const indent = (text, by) => String(text).split('\n').map((l, i) => (i && l ? by + l : l)).join('\n');
const list = (lines) => (lines.length ? lines.join('\n') : NONE);
const cell = (s) => String(s ?? '').replace(/\r?\n/g, ' ');

// ---------- spec.md ----------

function criteriaBlocks(criteria, intros = {}) {
  const out = [];
  let run = null;
  for (const [id, c] of entries(criteria)) {
    const line = `- [${c.done ? 'x' : ' '}] **${id}:** ${indent(c.text, '      ')}${c.proof ? ` _(${c.proof})_` : ''}`;
    const group = c.group ?? null;
    if (!run || run.group !== group) {
      run = { group, lines: [] };
      out.push(run);
    }
    run.lines.push(line);
  }
  // The section's own intro (key "") comes first, whether or not the first criteria have a group; each group's
  // intro follows its heading.
  const blocks = [intros[''] ?? null];
  if (!out.length) return [...blocks, NONE];
  for (const r of out) blocks.push(r.group ? `### ${r.group}` : null, r.group ? (intros[r.group] ?? null) : null, r.lines.join('\n'));
  return blocks;
}

function specSection(spec, section) {
  switch (section.kind) {
    case 'summary':
      return [spec.summary || NONE];
    case 'stories':
      return [list(entries(spec.stories).map(([id, s]) => `- **${id}:** ${indent(s.text, '  ')}`))];
    case 'criteria':
      return criteriaBlocks(spec.criteria, spec.groupIntros);
    case 'questions':
      return [
        list(
          entries(spec.questions).map(
            ([id, q]) => `- **${id}** ${q.open ? '[NEEDS CLARIFICATION]' : '_(resolved)_'} ${indent(q.text, '  ')}`,
          ),
        ),
      ];
    case 'changelog':
      return [list(spec.changelog.map((c) => `- ${c.date} — ${indent(c.text, '  ')}`))];
    default:
      return [section.markdown ?? ''];
  }
}

export function renderSpec(f) {
  const s = f.spec;
  const meta = [s.phase && `**Roadmap phase:** ${s.phase}`, `**Created:** ${f.dates.created}`, f.owner && `**Owner:** ${f.owner}`]
    .filter(Boolean)
    .join(' · ');
  const blocks = [FEATURE_NOTE, `# ${f.id} — ${f.title}`, `**Status:** ${STATUS_LABELS[f.status] ?? f.status}\n${meta}`];
  for (const section of s.sections) blocks.push(`## ${section.title}`, ...specSection(s, section));
  return finish(blocks);
}

// ---------- plan.md ----------

const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');

function planSection(plan, section) {
  switch (section.kind) {
    case 'files':
      return [plan.files?.length ? table(['File', 'Change', 'Purpose'], plan.files.map((x) => [x.file, x.change, x.purpose])) : NONE];
    case 'risks':
      return [list((plan.risks ?? []).map((r) => `- ${indent(r.text, '  ')}`))];
    case 'constitution':
      return [
        plan.constitution?.length
          ? table(['Principle', 'Status', 'Notes'], plan.constitution.map((c) => [c.principle, c.status, c.notes]))
          : NONE,
      ];
    default:
      return [section.markdown ?? ''];
  }
}

export function renderPlan(f) {
  const p = f.plan;
  const blocks = [FEATURE_NOTE, `# ${f.id} — ${f.title} · Implementation Plan`, p.header];
  for (const section of p.sections) blocks.push(`## ${section.title}`, ...planSection(p, section));
  return finish(blocks);
}

// ---------- tasks.md ----------

function taskLines(id, t) {
  const files = t.files?.length ? ` · files: ${t.files.map((x) => (x.includes('`') ? x : `\`${x}\``)).join(', ')}` : '';
  const test = t.test ? ` · test: ${t.test}` : '';
  const flags = `${t.parallel ? ' [P]' : ''}${t.manual ? ' 👤' : ''}`;
  const lines = [`- [${t.status === 'done' ? 'x' : ' '}] **${id}**${flags} — ${indent(t.text, '      ')}${files}${test}`];
  if (t.status === 'blocked') lines.push(`  - **Blocked:** ${indent(t.blockedReason ?? '', '    ')}`);
  if (t.status === 'in-progress') lines.push(`  - **In progress**${t.startedOn ? ` since ${t.startedOn}` : ''}`);
  for (const note of t.notes ?? []) lines.push(`  - ${indent(note, '    ')}`);
  return lines;
}

export function renderTasks(f) {
  const t = f.tasks;
  const blocks = [FEATURE_NOTE, `# ${f.id} — ${f.title} · Tasks`, t.intro];
  const tasks = entries(t.items);
  const titles = t.sections.map((s) => s.title);
  const sections = [...t.sections];
  if (tasks.some(([, x]) => !titles.includes(x.section))) sections.push({ title: 'Other', intro: null, other: true });
  for (const s of sections) {
    const mine = tasks.filter(([, x]) => (s.other ? !titles.includes(x.section) : x.section === s.title));
    blocks.push(`## ${s.title}`, s.intro, mine.length ? mine.flatMap(([id, x]) => taskLines(id, x)).join('\n') : '_No tasks yet._');
  }
  const criteria = entries(f.spec?.criteria);
  if (criteria.length) {
    const rows = criteria.map(([ac]) => [ac, tasks.filter(([, x]) => x.covers?.includes(ac)).map(([id]) => id).join(', ') || '—']);
    blocks.push('## AC coverage', table(['AC', 'Tasks'], rows));
  }
  return finish(blocks);
}
