import { describe, expect, it } from 'vitest';
import { LOUD_DBFS, LOUD_HOLD_MS, lastLoud, peakDbfs, tooLoud } from '@/engine/voiceLevel';

/* 209 AC-4: the level meter reads the input's peak in dBFS within 0.5 dB and marks Too loud for 2 s. */

/**
 * A window of 2048 samples: silence, then a 1 kHz tone burst at a level.
 * @param dbfs the tone's peak level
 * @param phase its starting phase, radians
 * @returns the samples at 48 kHz
 */
function burst(dbfs: number, phase = 0.3): Float32Array {
  const samples = new Float32Array(2048);
  const amplitude = 10 ** (dbfs / 20);
  for (let index = 512; index < 1536; index++) samples[index] = amplitude * Math.sin(phase + (2 * Math.PI * 1000 * index) / 48_000);
  return samples;
}

describe('peakDbfs', () => {
  it('reads tone bursts at known levels within 0.5 dB', () => {
    for (const level of [-40, -20, -6, -1, 0]) {
      for (const phase of [0, 0.3, 1.1]) expect(Math.abs(peakDbfs(burst(level, phase)) - level)).toBeLessThan(0.5);
    }
  });

  it('reads negative peaks as well as positive ones', () => {
    const samples = new Float32Array([0.01, -0.5, 0.2]);
    expect(peakDbfs(samples)).toBeCloseTo(20 * Math.log10(0.5), 9);
  });

  it('is −Infinity for silence', () => {
    expect(peakDbfs(new Float32Array(2048))).toBe(-Infinity);
    expect(peakDbfs(new Float32Array(0))).toBe(-Infinity);
  });
});

describe('Too loud', () => {
  it('starts at a peak at or above −1 dBFS', () => {
    expect(LOUD_DBFS).toBe(-1);
    expect(lastLoud(null, -1, 5_000)).toBe(5_000);
    expect(lastLoud(null, 0, 5_000)).toBe(5_000);
    expect(lastLoud(null, -1.2, 5_000)).toBeNull();
    expect(lastLoud(3_000, -6, 5_000)).toBe(3_000);
  });

  it('is held for 2 s after the last loud peak', () => {
    expect(LOUD_HOLD_MS).toBe(2_000);
    expect(tooLoud(null, 10_000)).toBe(false);
    expect(tooLoud(10_000, 10_000)).toBe(true);
    expect(tooLoud(10_000, 11_999)).toBe(true);
    expect(tooLoud(10_000, 12_000)).toBe(false);
  });

  it('follows a meter fed 30 times a second', () => {
    let loudAt: number | null = null;
    const shown: boolean[] = [];
    for (let frame = 0; frame < 150; frame++) {
      const now = frame * (1000 / 30);
      const peak = frame === 30 ? 0 : -12;
      loudAt = lastLoud(loudAt, peak, now);
      shown.push(tooLoud(loudAt, now));
    }
    expect(shown.indexOf(true)).toBe(30);
    expect(shown.lastIndexOf(true)).toBe(89);
  });
});
