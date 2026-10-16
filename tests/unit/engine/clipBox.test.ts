import { describe, expect, it } from 'vitest';
import {
  clipBoxPixels,
  describeTransform,
  nudgedTransform,
  partAt,
  resizedTransform,
  rotatedTransform,
  movedTransform,
} from '@/engine/clipBox';
import { IDENTITY, presetTransform, type ClipTransform } from '@/engine/timeline';

import { defined } from '../../support/defined';
/** A 1080 × 1920 Reel frame. */
const WIDTH = 1080,
  HEIGHT = 1920;
/** The top-right corner preset at 9:16. */
const corner: ClipTransform = { ...presetTransform('top-right', WIDTH, HEIGHT), opacity: 1 };

describe('clipBoxPixels', () => {
  it("is the frame scaled by the transform's width, around its centre", () => {
    const box = clipBoxPixels({ ...IDENTITY, x: 0.25, y: 0.75, w: 0.5, rot: 90 }, WIDTH, HEIGHT);
    expect(box).toEqual({ cx: 270, cy: 1440, w: 540, h: 960, rot: Math.PI / 2 });
  });
  it('is the whole frame at the identity', () => {
    expect(clipBoxPixels(IDENTITY, WIDTH, HEIGHT)).toEqual({ cx: 540, cy: 960, w: 1080, h: 1920, rot: 0 });
  });
});

describe('partAt', () => {
  const box = clipBoxPixels({ ...IDENTITY, w: 0.5 }, WIDTH, HEIGHT);
  const handle = 8;
  it('finds the corner resize handle, the rotate handle above the box, and the body', () => {
    expect(partAt(box, 540 + 270, 960 + 480, handle)).toBe('resize');
    expect(partAt(box, 540, 960, handle)).toBe('move');
    expect(partAt(box, 540, 960 - 480 - 20, handle)).toBe('rotate');
  });
  it('is nothing outside the box', () => {
    expect(partAt(box, 10, 10, handle)).toBeNull();
  });
});

describe('movedTransform', () => {
  it('moves the centre by the pointer, as shares of the frame', () => {
    const { transform } = movedTransform(corner, 108, -192, WIDTH, HEIGHT, null);
    expect(transform.x).toBeCloseTo(corner.x + 0.1, 9);
    expect(transform.y).toBeCloseTo(corner.y - 0.1, 9);
    expect(transform.w).toBe(corner.w);
  });
  it("snaps the centre to the frame's centre lines within the tolerance, and says which lines", () => {
    const start = { ...IDENTITY, x: 0.3, y: 0.3, w: 0.3 };
    const { transform, guides } = movedTransform(start, 0.2 * WIDTH - 5, 0.2 * HEIGHT + 6, WIDTH, HEIGHT, 8);
    expect(transform.x).toBeCloseTo(0.5, 9);
    expect(transform.y).toBeCloseTo(0.5, 9);
    expect(guides.map((guide) => guide.axis).sort()).toEqual(['x', 'y']);
  });
  it('does not snap with snapping off (null tolerance)', () => {
    const start = { ...IDENTITY, x: 0.3, y: 0.3, w: 0.3 };
    const { transform, guides } = movedTransform(start, 0.2 * WIDTH - 5, 0, WIDTH, HEIGHT, null);
    expect(transform.x).toBeCloseTo(0.5 - 5 / WIDTH, 9);
    expect(guides).toEqual([]);
  });
  it('keeps the centre within its range when dragged far away', () => {
    expect(movedTransform(corner, 10 * WIDTH, 0, WIDTH, HEIGHT, null).transform.x).toBe(1.5);
  });
});

describe('resizedTransform', () => {
  const box = clipBoxPixels({ ...IDENTITY, w: 0.5 }, WIDTH, HEIGHT);
  it('scales the width by how far the pointer moved from the centre, keeping the aspect (one size field)', () => {
    const corner0 = { x: box.cx + box.w / 2, y: box.cy + box.h / 2 };
    const doubled = { x: box.cx + box.w, y: box.cy + box.h };
    expect(resizedTransform({ ...IDENTITY, w: 0.5 }, box, corner0, doubled).w).toBeCloseTo(1, 9);
  });
  it('never gets smaller than the smallest box', () => {
    const corner0 = { x: box.cx + box.w / 2, y: box.cy + box.h / 2 };
    expect(resizedTransform({ ...IDENTITY, w: 0.5 }, box, corner0, { x: box.cx, y: box.cy }).w).toBe(0.05);
  });
});

describe('rotatedTransform', () => {
  const box = clipBoxPixels({ ...IDENTITY, w: 0.5 }, WIDTH, HEIGHT);
  it('turns the box to face the pointer, clockwise from straight up, within −180…180', () => {
    expect(rotatedTransform(IDENTITY, box, { x: box.cx + 100, y: box.cy }, false).rot).toBeCloseTo(90, 6);
    expect(rotatedTransform(IDENTITY, box, { x: box.cx - 100, y: box.cy }, false).rot).toBeCloseTo(-90, 6);
  });
  it('turns in 15° steps with Shift', () => {
    const pointer = { x: box.cx + 100, y: box.cy - 100 * Math.tan((50 * Math.PI) / 180) };
    expect(rotatedTransform(IDENTITY, box, pointer, false).rot).toBeCloseTo(40, 0);
    expect(rotatedTransform(IDENTITY, box, pointer, true).rot).toBe(45);
  });
});

describe('nudgedTransform', () => {
  it('moves 1 % of the frame per arrow key, 10 % with Shift', () => {
    expect(defined(nudgedTransform(corner, 'ArrowRight', false)).x).toBeCloseTo(corner.x + 0.01, 9);
    expect(defined(nudgedTransform(corner, 'ArrowUp', true)).y).toBeCloseTo(corner.y - 0.1, 9);
  });
  it('ignores other keys', () => {
    expect(nudgedTransform(corner, 'Enter', false)).toBeNull();
  });
});

describe('describeTransform', () => {
  it('says the clip and its new position and size for screen readers', () => {
    expect(describeTransform('Overlay 1, clip 1', { ...IDENTITY, x: 0.72, y: 0.2, w: 0.35 })).toBe(
      'Overlay 1, clip 1: x 72 %, y 20 %, size 35 %',
    );
  });
  it('adds rotation, opacity and corners when they are not the default', () => {
    expect(describeTransform('Clip 1', { ...IDENTITY, rot: 15, opacity: 0.5, radius: 0.1 })).toBe(
      'Clip 1: x 50 %, y 50 %, size 100 %, turned 15°, opacity 50 %, corners 10 %',
    );
  });
});
