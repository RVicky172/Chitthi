// The factory's specialist agents (402 §4, AC-9): each exists, says what it's for, and is limited to its tools.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = join(import.meta.dirname, '../../.claude/agents');
const EDITS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

function agent(name) {
  const text = readFileSync(join(DIR, `${name}.md`), 'utf8').replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!fm) throw new Error(`${name}: no frontmatter`);
  const field = (k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fm[1])?.[1].trim();
  return { name: field('name'), description: field('description'), model: field('model'), tools: (field('tools') ?? '').split(',').map((t) => t.trim()).filter(Boolean), body: fm[2] };
}

const EXPECTED = {
  'spec-writer': { must: ['Read', 'Write', 'Edit'], never: ['Bash', 'PowerShell'] },
  planner: { must: ['Read', 'Write', 'Edit', 'Bash'], never: [] },
  implementer: { must: ['Read', 'Edit', 'Write', 'Bash', 'PowerShell'], never: ['Agent'] },
  reviewer: { must: ['Read', 'Grep', 'Bash', 'StructuredOutput'], never: EDITS },
  verifier: { must: ['Read', 'Bash', 'Edit'], never: ['Write'] },
  scribe: { must: ['Read', 'Edit', 'Write'], never: ['Bash', 'PowerShell'] },
  'licence-auditor': { must: ['Read', 'Bash', 'StructuredOutput'], never: EDITS },
};

describe('specialist agents', () => {
  it.each(Object.keys(EXPECTED))('%s: frontmatter, tools and rules', (name) => {
    expect(existsSync(join(DIR, `${name}.md`))).toBe(true);
    const a = agent(name);
    expect(a.name).toBe(name);
    expect(a.description?.length).toBeGreaterThan(40);
    expect(a.model).toBeTruthy();
    for (const t of EXPECTED[name].must) expect(a.tools, `${name} needs ${t}`).toContain(t);
    for (const t of EXPECTED[name].never) expect(a.tools, `${name} must not have ${t}`).not.toContain(t);
    // Each points at the project's own rules instead of copying them.
    expect(a.body).toMatch(/specs\/constitution\.md/);
  });

  it('the implementer and reviewer speak the orchestrator protocol', () => {
    expect(agent('implementer').body).toMatch(/FACTORY: done/);
    expect(agent('implementer').body).toMatch(/FACTORY-STOP: (spec-change|dependency|question)/);
    expect(agent('reviewer').body).toMatch(/verdict\.schema\.json/);
  });

  it("the reviewer's verdict schema is valid JSON with ok and reasons", () => {
    const schema = JSON.parse(readFileSync(join(import.meta.dirname, 'verdict.schema.json'), 'utf8'));
    expect(schema.required).toEqual(['ok', 'reasons']);
    expect(schema.properties.reasons.items.required).toEqual(['rule', 'why']);
  });
});
