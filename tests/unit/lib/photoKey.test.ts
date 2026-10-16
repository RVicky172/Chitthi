import { describe, expect, it } from 'vitest';
import { photoKey } from '@/lib/photoKey';

describe('photoKey', () => {
  it('uses short URLs as their own key', () => {
    expect(photoKey('')).toBe('');
    expect(photoKey('./samples/holi.webp')).toBe('./samples/holi.webp');
  });

  it('gives the same key for the same data and different keys for different data', () => {
    const first = 'data:image/jpeg;base64,' + 'A'.repeat(5000) + 'B';
    const second = 'data:image/jpeg;base64,' + 'A'.repeat(5000) + 'C';
    expect(photoKey(first)).toBe(photoKey(first.slice()));
    expect(photoKey(first)).not.toBe(photoKey(second));
    expect(photoKey(first).length).toBeLessThan(30);
  });
});
