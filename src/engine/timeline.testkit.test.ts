import { describe, expect, it } from 'vitest';
import {
  legacyClipAt,
  legacyClipLength,
  legacyFixtures,
  legacyFrameRange,
  legacyTimeline,
  legacyTotal,
} from './timeline.testkit';
import { clipAt, clipLength, frameRange, timeline, totalLength } from './video';

/*
 * The frozen 2.x reference must equal the editor's own functions as long as they exist (they are replaced in 201
 * T023; this file then goes with them). It proves the reference is a faithful copy.
 */
describe('the 2.x reference matches today’s timeline code', () => {
  const fixtures = Object.entries(legacyFixtures());

  it('has every shape', () => {
    expect(fixtures.map(([k]) => k)).toEqual([
      'empty',
      'photoOnly',
      'videoOnly',
      'mixed',
      'musicOffset',
      'musicSilent',
      'timedLayers',
      'noFadeOut',
      'tinyClips',
      'clips20',
      'clips60',
      'clips500',
    ]);
    expect(legacyFixtures().clips500.clips).toHaveLength(500);
  });

  it.each(fixtures)('%s: placement, length, the clip at any time', (_, p) => {
    expect(legacyTimeline(p.clips)).toEqual(timeline(p.clips));
    expect(legacyTotal(p.clips)).toBe(totalLength(p.clips));
    for (const c of p.clips) expect(legacyClipLength(c)).toBe(clipLength(c));
    const tl = timeline(p.clips),
      ltl = legacyTimeline(p.clips);
    const total = totalLength(p.clips);
    const times = [-1, 0, total, total + 5, ...tl.flatMap((q) => [q.start, q.end, q.start - 1e-6, q.end - 1e-6])];
    for (let i = 0; i < 200; i++) times.push((i / 200) * (total + 1));
    for (const t of times) expect(legacyClipAt(ltl, t)?.index).toBe(clipAt(tl, t)?.index);
  });

  it('frame ranges at 30 and 60 fps', () => {
    for (const [a, b] of [
      [0, 3],
      [3, 7.5],
      [1 / 3, 2 / 3],
      [0.37, 1.11],
    ])
      for (const fps of [30, 60]) expect(legacyFrameRange(a, b, fps)).toEqual(frameRange(a, b, fps));
  });
});
