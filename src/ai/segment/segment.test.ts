import { describe, expect, it } from 'vitest';
import { normalise } from './index';
import { SEG_MODELS } from './models';

describe('segmentation maps', () => {
  it('are stretched to 0–1, as the models’ reference code does', () => {
    expect([...normalise(new Float32Array([0.01, 0.045, 0.08]))].map((v) => +v.toFixed(3))).toEqual([0, 0.5, 1]);
  });
  it('stay empty when the model found nothing (a flat map)', () => {
    expect([...normalise(new Float32Array([0.2, 0.205, 0.2]))]).toEqual([0, 0, 0]);
  });
});

describe('segmentation models', () => {
  it('pin their files by size and SHA-256; only the small one ships', () => {
    for (const m of Object.values(SEG_MODELS)) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.bytes).toBeGreaterThan(1e6);
      expect(['MIT', 'Apache-2.0']).toContain(m.licence);
    }
    expect(SEG_MODELS.subject.bundled).toBe(true);
    expect(SEG_MODELS.sky.bundled).toBe(false);
    expect(SEG_MODELS.sky.url).toMatch(/^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\//);
  });
});
