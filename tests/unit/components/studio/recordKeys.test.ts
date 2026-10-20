import { describe, expect, it } from 'vitest';
import { recordKeyAction } from '@/components/studio/recordKeys';

/* 209 AC-10, Q11: Shift + R records and stops in the video workspace; Esc cancels the count-in. */

const key = (value: string, extra: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: value,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

describe('recordKeyAction', () => {
  it('Shift + R records or stops, whatever the letter case', () => {
    expect(recordKeyAction(key('R', { shiftKey: true }), false)).toBe('toggle');
    expect(recordKeyAction(key('r', { shiftKey: true }), false)).toBe('toggle');
  });

  it('leaves R alone, and Shift + R with Ctrl, Cmd or Alt', () => {
    expect(recordKeyAction(key('r'), false)).toBeNull();
    expect(recordKeyAction(key('R', { shiftKey: true, ctrlKey: true }), false)).toBeNull();
    expect(recordKeyAction(key('R', { shiftKey: true, metaKey: true }), false)).toBeNull();
    expect(recordKeyAction(key('R', { shiftKey: true, altKey: true }), false)).toBeNull();
  });

  it('Esc cancels only during the count-in', () => {
    expect(recordKeyAction(key('Escape'), true)).toBe('cancel');
    expect(recordKeyAction(key('Escape'), false)).toBeNull();
  });
});
