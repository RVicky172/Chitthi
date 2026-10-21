/*
 * The layer list's rules (506 AC-4): its keys (Alt + ↑/↓ reorder, ↑/↓ move the focus), its rows front first while the
 * stack is back first, and where a dragged row lands. Pure, so the list component only wires events to them.
 */

/** What a key does in the layer list. */
export type LayerListKey = 'forward' | 'back' | 'previous' | 'next' | null;

/** A press becomes a drag only after the pointer moves this far, so a press without a move stays a click. */
export const DRAG_START_PX = 4;

/**
 * What a key press does in the layer list.
 * @param event the key and its modifiers
 * @returns 'forward' (Alt + ↑), 'back' (Alt + ↓), 'previous' / 'next' (↑ / ↓, the focus), or null
 */
export function layerListKey(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): LayerListKey {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return null;
  if (event.key === 'ArrowUp') return event.altKey ? 'forward' : 'previous';
  if (event.key === 'ArrowDown') return event.altKey ? 'back' : 'next';
  return null;
}

/**
 * A row's stack index: the list shows the front layer first, the stack keeps the back one first (and the other way).
 * @param row the row, 0 = the top of the list (the front)
 * @param count how many layers there are
 * @returns the stack index, 0 = the back
 */
export const stackIndex = (row: number, count: number): number => count - 1 - row;

/**
 * The gap a dragged row is dropped into: before a row when the pointer is in its upper half, after it in its lower half.
 * @param y the pointer's y
 * @param rowEdges each row's top, then the last row's bottom
 * @returns the gap, 0 (before the first row) to the row count (after the last)
 */
export function dropRow(y: number, rowEdges: readonly number[]): number {
  let gap = 0;
  for (let row = 0; row + 1 < rowEdges.length; row++) {
    const top = rowEdges[row] ?? 0,
      bottom = rowEdges[row + 1] ?? top;
    if (y >= (top + bottom) / 2) gap = row + 1;
  }
  return gap;
}

/**
 * The dragged row's new place once it is dropped into a gap (the gap after it counts as its own place).
 * @param from the dragged row
 * @param gap the gap it is dropped into (dropRow)
 * @returns its new row
 */
export const movedRow = (from: number, gap: number): number => (gap > from ? gap - 1 : gap);
