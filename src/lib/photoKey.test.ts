import { describe, expect, it } from 'vitest';
import { photoKey } from './photoKey';

describe('photoKey', () => {
  it('uses short URLs as their own key', () => {
    expect(photoKey('')).toBe('');
    expect(photoKey('./samples/holi.webp')).toBe('./samples/holi.webp');
  });

  it('gives the same key for the same data and different keys for different data', () => {
    const a = 'data:image/jpeg;base64,' + 'A'.repeat(5000) + 'B';
    const b = 'data:image/jpeg;base64,' + 'A'.repeat(5000) + 'C';
    expect(photoKey(a)).toBe(photoKey(a.slice()));
    expect(photoKey(a)).not.toBe(photoKey(b));
    expect(photoKey(a).length).toBeLessThan(30);
  });
});
