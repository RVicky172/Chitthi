import { describe, expect, it } from 'vitest';
import { cornerAt, draggedCrop, fittedCrop, nudgedCrop, pressAction, type CropView } from '@/components/cropGeometry';

/**
 * A 400 × 300 photo with a 200 × 100 box at (100, 100).
 * @returns the crop state
 */
const view = (): CropView => ({ DW: 400, DH: 300, cr: { x: 100, y: 100, w: 200, h: 100 }, disp: null, act: null, first: false });

describe('fittedCrop', () => {
  it('takes the whole photo for a free shape', () => {
    expect(fittedCrop(400, 300, 0)).toEqual({ x: 0, y: 0, w: 400, h: 300 });
  });
  it('centres the largest box of the shape', () => {
    expect(fittedCrop(400, 300, 1)).toEqual({ x: 50, y: 0, w: 300, h: 300 });
    expect(fittedCrop(400, 300, 2)).toEqual({ x: 0, y: 50, w: 400, h: 200 });
  });
});

describe('pressAction', () => {
  it('resizes from the opposite corner when a corner is pressed', () => {
    expect(pressAction(view().cr, 102, 98)).toEqual({ t: 'resize', ax: 300, ay: 200 });
    expect(pressAction(view().cr, 299, 201)).toEqual({ t: 'resize', ax: 100, ay: 100 });
  });
  it('moves when pressed inside, and draws a new box outside', () => {
    expect(pressAction(view().cr, 200, 150)).toEqual({ t: 'move', sx: 200, sy: 150, ox: 100, oy: 100 });
    expect(pressAction(view().cr, 20, 20)).toEqual({ t: 'resize', ax: 20, ay: 20 });
  });
  it('finds corners within the handle size only', () => {
    expect(cornerAt(view().cr, 110, 110)?.[0]).toBe('tl');
    expect(cornerAt(view().cr, 120, 120)).toBeUndefined();
  });
});

describe('draggedCrop', () => {
  it('moves the box within the photo', () => {
    const moved = draggedCrop(view(), { t: 'move', sx: 200, sy: 150, ox: 100, oy: 100 }, 1000, 1000, 0);
    expect(moved).toEqual({ x: 200, y: 200, w: 200, h: 100 });
  });
  it('resizes towards the pointer, kept to the shape and to at least 20 px', () => {
    expect(draggedCrop(view(), { t: 'resize', ax: 100, ay: 100 }, 300, 160, 2)).toEqual({ x: 100, y: 100, w: 120, h: 60 });
    expect(draggedCrop(view(), { t: 'resize', ax: 100, ay: 100 }, 90, 95, 0)).toEqual({ x: 80, y: 80, w: 20, h: 20 });
  });
});

describe('nudgedCrop', () => {
  it('moves by 4 px, 20 px with Shift, and stops at the edge', () => {
    expect(nudgedCrop(view(), 'ArrowRight', false)?.x).toBe(104);
    expect(nudgedCrop(view(), 'ArrowUp', true)?.y).toBe(80);
    expect(nudgedCrop({ ...view(), cr: { x: 198, y: 0, w: 200, h: 100 } }, 'ArrowRight', true)?.x).toBe(200);
  });
  it('ignores other keys', () => {
    expect(nudgedCrop(view(), 'Enter', false)).toBeNull();
  });
});
