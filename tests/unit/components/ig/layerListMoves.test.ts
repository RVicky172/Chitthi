import { describe, expect, it } from 'vitest';
import { DRAG_START_PX, dropRow, layerListKey, movedRow, stackIndex } from '@/components/ig/layerListMoves';

/* 506 AC-4: the layer list's keys (Alt + ↑/↓ reorder, ↑/↓ move focus), its front-first rows and where a drag lands. */

/** A key's modifiers. */
type Modifiers = Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>>;

/**
 * A key press.
 * @param value the key
 * @param extra the modifiers held
 * @returns the event's fields the list reads
 */
const key = (value: string, extra: Modifiers = {}) => ({
  key: value,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...extra,
});

describe('layerListKey', () => {
  it('Alt + ↑ brings a layer forward, Alt + ↓ sends it back', () => {
    expect(layerListKey(key('ArrowUp', { altKey: true }))).toBe('forward');
    expect(layerListKey(key('ArrowDown', { altKey: true }))).toBe('back');
  });
  it('↑ and ↓ move the focus between rows', () => {
    expect(layerListKey(key('ArrowUp'))).toBe('previous');
    expect(layerListKey(key('ArrowDown'))).toBe('next');
  });
  it('leaves Ctrl, Cmd and Shift combinations and other keys alone', () => {
    expect(layerListKey(key('ArrowUp', { altKey: true, ctrlKey: true }))).toBeNull();
    expect(layerListKey(key('ArrowDown', { metaKey: true }))).toBeNull();
    expect(layerListKey(key('ArrowUp', { shiftKey: true }))).toBeNull();
    expect(layerListKey(key('ArrowLeft', { altKey: true }))).toBeNull();
    expect(layerListKey(key('a'))).toBeNull();
  });
});

describe('stackIndex', () => {
  it('turns a front-first row into a back-first stack index, and back', () => {
    expect(stackIndex(0, 4)).toBe(3);
    expect(stackIndex(3, 4)).toBe(0);
    expect(stackIndex(stackIndex(1, 4), 4)).toBe(1);
  });
});

describe('dropRow and movedRow', () => {
  // Three rows, 40 px tall from y = 100: their tops and the last one's bottom.
  const edges = [100, 140, 180, 220];
  it('gives the gap a row is dropped into: before a row in its upper half, after it in its lower half', () => {
    expect(dropRow(50, edges)).toBe(0);
    expect(dropRow(110, edges)).toBe(0);
    expect(dropRow(130, edges)).toBe(1);
    expect(dropRow(150, edges)).toBe(1);
    expect(dropRow(170, edges)).toBe(2);
    expect(dropRow(219, edges)).toBe(3);
    expect(dropRow(400, edges)).toBe(3);
    expect(dropRow(10, [])).toBe(0);
  });
  it('turns the gap into the dragged row\'s new place (its own gap left out)', () => {
    expect(movedRow(0, 3)).toBe(2);
    expect(movedRow(2, 0)).toBe(0);
    expect(movedRow(1, 1)).toBe(1);
    expect(movedRow(1, 2)).toBe(1);
  });
  it('starts a drag only past 4 px, so a press stays a click', () => {
    expect(DRAG_START_PX).toBe(4);
  });
});
