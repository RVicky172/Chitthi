import { describe, expect, it } from 'vitest';
import { lengthFromPackets } from '@/engine/takeLength';

/* 209 AC-1, R1: a take's length from its packets, the last one (0 s in WebM) counted as long as the one before. */

/**
 * Packets as MediaRecorder's WebM gives them through Mediabunny: each lasts until the next, the last 0 s.
 * @param count how many
 * @param step each one's length, s
 * @param first the first one's timestamp, s
 * @returns the packets
 */
const webm = (count: number, step: number, first = 0) =>
  Array.from({ length: count }, (_, index) => ({ timestamp: first + index * step, duration: index === count - 1 ? 0 : step }));

describe('lengthFromPackets', () => {
  it('counts the last packet of a WebM take (Chromium 60 ms, Firefox 20 ms packets, as measured in T001)', () => {
    expect(lengthFromPackets(webm(83, 0.06))).toBeCloseTo(4.98, 9);
    expect(lengthFromPackets(webm(250, 0.02, 0.006))).toBeCloseTo(5.006, 9);
  });

  it('uses a last packet’s own duration when it has one', () => {
    expect(lengthFromPackets([{ timestamp: 0, duration: 0.023 }, { timestamp: 0.023, duration: 0.023 }])).toBeCloseTo(0.046, 9);
  });

  it('is 0 without packets', () => {
    expect(lengthFromPackets([])).toBe(0);
  });
});
