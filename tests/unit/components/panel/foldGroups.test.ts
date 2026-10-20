import { describe, expect, it } from 'vitest';
import { FOLDS_KEY, opensNow, readFolds, resolveFold, saveFold, toggleFold } from '@/components/panel/foldGroups';

/*
 * 503 AC-1, AC-2: one section open per group, remembered per panel and mode on this device.
 */

/** The key the per-section folds were kept under before 503. */
const OLD_KEY = 'chitthi-sections';

/** A localStorage stand-in. */
class MemoryStorage {
  readonly items = new Map<string, string>();
  /**
   * @param key the key
   * @returns its value, or null
   */
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  /**
   * @param key the key
   * @param value its value
   */
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  /** @param key the key */
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

/** Storage that refuses every read and write, as when site data is blocked. */
const blocked = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
  removeItem: (): void => {
    throw new Error('SecurityError');
  },
};

describe('toggleFold (AC-1)', () => {
  it('opens a section, closing the one that was open', () => {
    expect(toggleFold('light', 'colour', true)).toBe('colour');
    expect(toggleFold(null, 'colour', true)).toBe('colour');
  });

  it('closes the open section when the group allows none', () => {
    expect(toggleFold('colour', 'colour', true)).toBeNull();
  });

  it('keeps the open section open when the group needs one', () => {
    expect(toggleFold('colour', 'colour', false)).toBe('colour');
  });
});

describe('resolveFold (AC-1, AC-2)', () => {
  const present = ['light', 'colour', 'detail'];

  it('restores the saved section when it is on screen', () => {
    expect(resolveFold('detail', present, 'light')).toBe('detail');
  });

  it('falls back to the default when the saved section is not on screen', () => {
    expect(resolveFold('masks', present, 'light')).toBe('light');
  });

  it('falls back to the default when nothing is saved', () => {
    expect(resolveFold(undefined, present, 'light')).toBe('light');
  });

  it('keeps a saved "none open"', () => {
    expect(resolveFold(null, present, 'light')).toBeNull();
  });
});

describe('readFolds and saveFold (AC-2)', () => {
  it('keeps one entry per group', () => {
    const storage = new MemoryStorage();
    saveFold('reel:audio', 'audio-record', storage);
    saveFold('photos:edit', 'edit-light', storage);
    saveFold('print:Photos', null, storage);
    saveFold('reel:audio', 'audio-loudness', storage);
    expect(readFolds(storage)).toEqual({ 'reel:audio': 'audio-loudness', 'photos:edit': 'edit-light', 'print:Photos': null });
    expect(storage.items.has(FOLDS_KEY)).toBe(true);
  });

  it('reads nothing from an empty or unreadable store', () => {
    const storage = new MemoryStorage();
    expect(readFolds(storage)).toEqual({});
    storage.setItem(FOLDS_KEY, '{not json');
    expect(readFolds(storage)).toEqual({});
    storage.setItem(FOLDS_KEY, '["a"]');
    expect(readFolds(storage)).toEqual({});
  });

  it('drops entries that are not a section id or null', () => {
    const storage = new MemoryStorage();
    storage.setItem(FOLDS_KEY, JSON.stringify({ good: 'a', none: null, bad: 3, worse: { x: 1 } }));
    expect(readFolds(storage)).toEqual({ good: 'a', none: null });
  });

  it('removes the per-section key kept before 503', () => {
    const storage = new MemoryStorage();
    storage.setItem(OLD_KEY, '{"sec-a":true}');
    saveFold('reel:media', 'media-list', storage);
    expect(storage.items.has(OLD_KEY)).toBe(false);
  });

  it('still works when storage is blocked', () => {
    expect(readFolds(blocked)).toEqual({});
    expect(() => saveFold('reel:audio', 'audio-record', blocked)).not.toThrow();
  });
});

describe('opensNow (AC-2, openWhen)', () => {
  it('is true only when the need appears', () => {
    expect(opensNow(false, true)).toBe(true);
    expect(opensNow(undefined, true)).toBe(true);
    expect(opensNow(true, true)).toBe(false);
    expect(opensNow(true, false)).toBe(false);
    expect(opensNow(false, false)).toBe(false);
    expect(opensNow(false, undefined)).toBe(false);
  });
});
