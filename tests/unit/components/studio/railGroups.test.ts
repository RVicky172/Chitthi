import { describe, expect, it } from 'vitest';
import { PHOTO_RAIL, VIDEO_RAIL } from '@/components/studio/railTools';
import type { RailItem } from '@/components/studio/Shell';

/*
 * 501 AC-2: the media rail groups its tools under Add (bring things in) and Edit (change what is there), as the panel
 * map in docs/DESIGN.md §2 lists them (spec Q2), and never needs to scroll at 720 px tall: at most 6 tools that are
 * not minor (minor ones go into More below that height).
 */

/** The most tools a mode shows in the rail itself. */
const MAX_SHOWN = 6;

/** Each mode's rail. The Reel and YouTube editors share one. */
const MODES: [string, readonly RailItem<string>[]][] = [
  ['photo', PHOTO_RAIL],
  ['Reel and YouTube', VIDEO_RAIL],
];

/**
 * The ids of a rail's tools in one group.
 * @param rail the rail
 * @param group Add or Edit
 * @returns the ids, in rail order
 */
const idsIn = (rail: readonly RailItem<string>[], group: RailItem<string>['group']) =>
  rail.filter((item) => item.group === group).map((item) => item.id);

describe('the media rail is grouped (501 AC-2)', () => {
  it.each(MODES)('every %s tool has a group, a label and a one-sentence lead', (_mode, rail) => {
    for (const item of rail) {
      expect(['add', 'edit']).toContain(item.group);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.lead).toMatch(/^[A-Z].{10,100}\.$/);
    }
  });

  it('the photo rail adds photos, text, elements and drawings, and edits masks and layers', () => {
    expect(new Set(idsIn(PHOTO_RAIL, 'add'))).toEqual(new Set(['draw', 'elements', 'media', 'text']));
    expect(new Set(idsIn(PHOTO_RAIL, 'edit'))).toEqual(new Set(['layers', 'masks']));
  });

  it('the video rail adds media, text, elements, drawings and audio, and edits transitions and layers', () => {
    expect(new Set(idsIn(VIDEO_RAIL, 'add'))).toEqual(new Set(['audio', 'draw', 'elements', 'media', 'text']));
    expect(new Set(idsIn(VIDEO_RAIL, 'edit'))).toEqual(new Set(['layers', 'transitions']));
  });

  it.each(MODES)('the %s rail shows at most 6 tools itself', (_mode, rail) => {
    expect(rail.filter((item) => !item.minor).length).toBeLessThanOrEqual(MAX_SHOWN);
  });

  it.each(MODES)('the %s rail lists Add before Edit', (_mode, rail) => {
    const groups = rail.map((item) => item.group);
    expect(groups.lastIndexOf('add')).toBeLessThan(groups.indexOf('edit'));
  });
});
