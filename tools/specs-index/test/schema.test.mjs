import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSchema, validate } from '../lib/schema.mjs';
import { MINI, readJsonFile } from './helpers.mjs';

describe('validate (JSON Schema subset)', () => {
  const schema = {
    type: 'object',
    required: ['id', 'when'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', pattern: '^\\d{3}$' },
      when: { type: ['string', 'null'], format: 'date' },
      kind: { enum: ['a', 'b'] },
      tags: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      map: { type: 'object', propertyNames: { pattern: '^T\\d+$' }, additionalProperties: { $ref: '#/$defs/n' } },
      maybe: { oneOf: [{ type: 'null' }, { $ref: '#/$defs/box' }] },
    },
    $defs: { n: { type: 'integer' }, box: { type: 'object', required: ['x'] } },
  };

  it('accepts valid data', () => {
    expect(validate(schema, { id: '101', when: '2026-01-02', kind: 'a', tags: ['x'], map: { T1: 2 }, maybe: null })).toEqual([]);
    expect(validate(schema, { id: '101', when: null, maybe: { x: 1 } })).toEqual([]);
  });

  it('names the path of each error', () => {
    expect(
      validate(schema, { id: '1', when: '2026-1-2', kind: 'c', tags: ['x', 'x', 3], map: { X1: 1.5 }, extra: 1 }),
    ).toEqual([
      '/id: does not match ^\\d{3}$',
      '/when: is not a date (YYYY-MM-DD)',
      '/kind: must be one of a, b',
      '/tags: has duplicate items',
      '/tags/2: must be string',
      '/map/X1: name does not match ^T\\d+$',
      '/map/X1: must be integer',
      '/extra: is not allowed',
    ]);
    expect(validate(schema, {})).toEqual(['/: missing id', '/: missing when']);
  });

  it('oneOf: reports the branch that fits the value', () => {
    expect(validate(schema, { id: '101', when: null, maybe: {} })).toEqual(['/maybe: missing x']);
    expect(validate(schema, { id: '101', when: null, maybe: 3 })).toEqual(['/maybe: does not match any allowed shape']);
  });
});

describe('the repo schemas', () => {
  it('accept the mini fixture', () => {
    expect(validate(loadSchema('roadmap'), readJsonFile(join(MINI, 'specs/roadmap.json')))).toEqual([]);
    for (const f of ['101-alpha', '102-beta'])
      expect(validate(loadSchema('feature'), readJsonFile(join(MINI, `specs/features/${f}/feature.json`)))).toEqual([]);
  });

  it('accept a phase with a release, and still reject unknown phase fields (405 D1)', () => {
    const r = readJsonFile(join(MINI, 'specs/roadmap.json'));
    r.phases.byId['phase-1'].release = '1.0.0';
    expect(validate(loadSchema('roadmap'), r)).toEqual([]);
    r.phases.byId['phase-1'].release = null;
    expect(validate(loadSchema('roadmap'), r)).toEqual([]);
    r.phases.byId['phase-1'].ship = 'soon';
    expect(validate(loadSchema('roadmap'), r)).toEqual(['/phases/byId/phase-1/ship: is not allowed']);
  });

  it('reject a bad feature', () => {
    const f = readJsonFile(join(MINI, 'specs/features/102-beta/feature.json'));
    f.status = 'nearly';
    f.tasks.items.byId.T002.status = 'started';
    f.tasks.items.byId.T002.covers = 'AC-1';
    f.spec.criteria.byId['AC-x'] = { text: 'x', proof: 'unit', group: null, done: false };
    f.plan.sections[0].kind = 'essay';
    delete f.dates.created;
    expect(validate(loadSchema('feature'), f)).toEqual([
      '/status: must be one of draft, approved, in-progress, implemented, superseded',
      '/dates: missing created',
      '/spec/criteria/byId/AC-x: name does not match ^AC-\\d+[a-z]?$',
      '/plan/sections/0/kind: must be one of files, risks, constitution, markdown',
      '/tasks/items/byId/T002/status: must be one of todo, in-progress, blocked, done',
      '/tasks/items/byId/T002/covers: must be array',
    ]);
  });

  it('reject a schema 1 feature', () => {
    const f = readJsonFile(join(MINI, 'specs/features/101-alpha/feature.json'));
    f.schema = 1;
    expect(validate(loadSchema('feature'), f)).toEqual(['/schema: must be 2']);
  });
});
