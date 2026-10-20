import { describe, expect, it } from 'vitest';
import { RAIL_KEY, railWidth, readRailWidth, saveRailWidth } from '@/components/panel/railWidth';

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
}

/** Storage that refuses every read and write, as when site data is blocked. */
const blocked = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

describe('railWidth: the rail is wide unless the user made it narrow (501 AC-6)', () => {
  it('keeps a saved choice', () => {
    expect(railWidth('wide')).toBe('wide');
    expect(railWidth('narrow')).toBe('narrow');
  });

  it.each([null, undefined, '', 'Narrow', 'compact', '0', 1, true, {}])('gives wide for %j', (saved) => {
    expect(railWidth(saved)).toBe('wide');
  });
});

describe('the saved rail width', () => {
  it('is wide on a device that never chose', () => {
    expect(readRailWidth(new MemoryStorage())).toBe('wide');
  });

  it('round-trips a choice under its key', () => {
    const storage = new MemoryStorage();
    saveRailWidth('narrow', storage);
    expect(storage.items.get(RAIL_KEY)).toBe('narrow');
    expect(readRailWidth(storage)).toBe('narrow');
    saveRailWidth('wide', storage);
    expect(readRailWidth(storage)).toBe('wide');
  });

  it('ignores a damaged value', () => {
    const storage = new MemoryStorage();
    storage.setItem(RAIL_KEY, '{"width":"narrow"}');
    expect(readRailWidth(storage)).toBe('wide');
  });

  it('still works when storage throws', () => {
    expect(readRailWidth(blocked)).toBe('wide');
    expect(() => saveRailWidth('narrow', blocked)).not.toThrow();
  });

  it('still works when there is no storage at all', () => {
    // Node has no localStorage: the default reads it inside the try.
    expect(readRailWidth()).toBe('wide');
    expect(() => saveRailWidth('narrow')).not.toThrow();
  });
});
