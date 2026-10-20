import { describe, expect, it } from 'vitest';
import { toDocument } from '@/engine/projectDoc';
import { NAME_MAX, mergeProject } from '@/engine/projectGate';
import { projectLength } from '@/engine/timeline';
import { legacyDoc, legacyFixtures } from '../../support/timeline.testkit';

/*
 * 408 T011 (AC-6): the gate reads a saved project's name, playhead and track heights, and keeps them in range.
 */

/**
 * A valid version 1 document (the 2.x "mixed" fixture through the gate) with some fields changed.
 * @param patch the fields to set
 * @returns the document as parsed JSON
 */
function saved(patch: Record<string, unknown>): Record<string, unknown> {
  return { ...structuredClone(toDocument(mergeProject(legacyDoc(legacyFixtures().mixed), true).doc)), ...patch };
}

describe('408: the gate reads the name', () => {
  it('keeps a name, trimmed', () => {
    const { doc, dropped } = mergeProject(saved({ name: '  Trip to the hills  ' }), true);
    expect(doc.name).toBe('Trip to the hills');
    expect(dropped).toEqual([]);
  });

  it(`cuts a long name to ${NAME_MAX} characters, counting an emoji as one`, () => {
    expect(mergeProject(saved({ name: '🎬'.repeat(100) }), true).doc.name).toBe('🎬'.repeat(NAME_MAX));
    expect(mergeProject(saved({ name: `${'a'.repeat(79)}👨‍👩‍👧b` }), true).doc.name).toBe(`${'a'.repeat(79)}👨‍👩‍👧`);
  });

  it('leaves out an empty name', () => {
    expect(mergeProject(saved({ name: '   ' }), true).doc).not.toHaveProperty('name');
  });

  it('a name that isn’t text is left out, and says so', () => {
    const { doc, dropped } = mergeProject(saved({ name: { evil: true } }), true);
    expect(doc).not.toHaveProperty('name');
    expect(dropped.join(' ')).toMatch(/name/);
  });
});

describe('408: the gate reads the playhead', () => {
  const length = projectLength(mergeProject(saved({}), true).doc);

  it.each([
    [2.5, 2.5],
    [-3, 0],
    [1e9, length],
  ])('%s s → %s s (within the project)', (playhead, expected) => {
    expect(mergeProject(saved({ playhead }), true).doc.playhead).toBe(expected);
  });

  it.each([['NaN', NaN], ['text', '3'], ['Infinity', Infinity]])('a playhead that is %s is left out', (_, playhead) => {
    expect(mergeProject(saved({ playhead }), true).doc).not.toHaveProperty('playhead');
  });
});

describe('504: the gate reads a media entry’s recorded mark', () => {
  const take = { id: 'take', kind: 'audio', name: 'Voice 1', type: 'audio/webm', size: 300, w: 0, h: 0, srcDur: 2 };
  const mediaOf = (entry: Record<string, unknown>) => mergeProject(saved({ media: [...(saved({}).media as unknown[]), entry] }), true);

  it('keeps recorded: true', () => {
    const { doc, dropped } = mediaOf({ ...take, recorded: true });
    expect(doc.media.find((media) => media.id === 'take')).toEqual({ ...take, recorded: true });
    expect(dropped).toEqual([]);
  });

  it.each([['false', false], ['text', 'yes'], ['a number', 1]])('leaves out a recorded mark that is %s', (_, recorded) => {
    expect(mediaOf({ ...take, recorded }).doc.media.find((media) => media.id === 'take')).toEqual(take);
  });

  it('keeps an entry nothing uses (a file in the media pool)', () => {
    expect(mediaOf(take).doc.media.map((media) => media.id)).toContain('take');
  });
});

describe('505: the gate reads a take’s details', () => {
  const take = { id: 'take', kind: 'audio', name: 'Voice 1', type: 'audio/webm', size: 300, w: 0, h: 0, srcDur: 2, recorded: true };
  const entryOf = (entry: Record<string, unknown>) =>
    mergeProject(saved({ media: [...(saved({}).media as unknown[]), entry] }), true).doc.media.find((media) => media.id === 'take');

  it('keeps a recordedAt in range and a microphone name', () => {
    const recordedAt = Date.UTC(2026, 9, 20, 14, 2);
    expect(entryOf({ ...take, recordedAt, microphone: 'MacBook Microphone' })).toEqual({ ...take, recordedAt, microphone: 'MacBook Microphone' });
  });

  it('cuts a microphone name to 200 characters', () => {
    expect(entryOf({ ...take, microphone: 'm'.repeat(300) })?.microphone).toBe('m'.repeat(200));
  });

  it.each([
    ['text', 'yesterday'],
    ['negative', -1],
    ['not finite', Number.POSITIVE_INFINITY],
    ['far in the future', 1e16],
  ])('leaves out a recordedAt that is %s', (_, recordedAt) => {
    expect(entryOf({ ...take, recordedAt })).toEqual(take);
  });

  it.each([['a number', 3], ['empty', ''], ['an object', { name: 'x' }]])('leaves out a microphone that is %s', (_, microphone) => {
    expect(entryOf({ ...take, microphone })).toEqual(take);
  });
});

describe('408: the gate reads the track heights', () => {
  it('keeps heights of the project’s tracks', () => {
    expect(mergeProject(saved({ trackView: { V1: 'large', A1: 'small' } }), true).doc.trackView).toEqual({
      V1: 'large',
      A1: 'small',
    });
  });

  it('drops heights of tracks it doesn’t have, and unknown heights', () => {
    const { doc, dropped } = mergeProject(saved({ trackView: { V1: 'huge', O9: 'small', A1: 'medium', __proto__: 'large' } }), true);
    expect(doc.trackView).toEqual({ A1: 'medium' });
    expect(dropped).toEqual([]);
  });

  it.each([['an array', ['large']], ['text', 'large'], ['nothing valid', { X: 'small' }]])(
    'track heights that are %s are left out',
    (_, trackView) => {
      expect(mergeProject(saved({ trackView }), true).doc).not.toHaveProperty('trackView');
    },
  );
});
