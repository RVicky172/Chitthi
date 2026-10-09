import { describe, expect, it } from 'vitest';
import { legacyClipLength, legacyFixtures, legacyFrameRange } from './timeline.testkit';
import { clipLength, frameRange } from './video';

/*
 * The frozen 2.x reference must equal the editor's own functions as long as they exist. Until 201 T023 this also
 * compared the 2.x `timeline` / `clipAt` / `totalLength`; they are gone, and timeline.test.ts proves the track model
 * gives their answers. What is left here: the fixtures, clip lengths and frame ranges.
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

  it.each(fixtures)('%s: clip lengths', (_, p) => {
    for (const c of p.clips) expect(legacyClipLength(c)).toBe(clipLength(c));
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
