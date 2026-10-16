import { describe, expect, it } from 'vitest';
import {
  advance,
  dragTo,
  newMotion,
  openPose,
  pointerDown,
  pointerUp,
  touchDistance,
} from '@/components/viewer3dMotion';

describe('viewer motion', () => {
  it('opens each view in its pose', () => {
    expect(openPose('envelope')).toEqual({ rx: -12, ry: 158 });
    expect(openPose('ring')).toEqual({ rx: -10, ry: 0 });
    expect(openPose('wall')).toEqual({ rx: -10, ry: -28 });
  });

  it('eases to a target and lets go of it once there', () => {
    const motion = { ...newMotion(), ry: 0, target: 100 };
    advance(motion, false, 'card');
    expect(motion.ry).toBeCloseTo(12);
    for (let frame = 0; frame < 200; frame++) advance(motion, false, 'card');
    expect(motion.ry).toBe(100);
    expect(motion.target).toBeNull();
  });

  it('turns on its own only in the card and ring views', () => {
    const card = { ...newMotion(), ry: 0 },
      wall = { ...newMotion(), ry: 0 };
    advance(card, true, 'card');
    advance(wall, true, 'wall');
    expect(card.ry).toBeCloseTo(0.22);
    expect(wall.ry).toBe(0);
  });

  it('treats a press without a move as a tap, and a drag as none', () => {
    const tap = newMotion();
    pointerDown(tap, 1, 50, 50);
    expect(pointerUp(tap, 1)).toBe(true);

    const drag = newMotion();
    pointerDown(drag, 1, 50, 50);
    dragTo(drag, 90, 50, 'card');
    expect(drag.ry).toBeCloseTo(-28 + 40 * 0.4);
    expect(pointerUp(drag, 1)).toBe(false);
    expect(drag.drag).toBeNull();
  });

  it('starts a pinch with a second finger instead of turning', () => {
    const motion = newMotion();
    pointerDown(motion, 1, 0, 0);
    pointerDown(motion, 2, 30, 40);
    expect(motion.pinch).toEqual({ d: 50, zoom: 1 });
    expect(motion.drag).toBeNull();
    expect(touchDistance(new Map([[1, { x: 0, y: 0 }]]))).toBe(0);
  });
});
