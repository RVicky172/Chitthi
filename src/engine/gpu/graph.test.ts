import { describe, expect, it } from 'vitest';
import { DEFAULT_ADJUST } from '../adjust';
import { ADJUST_PROGRAM, adjustUniforms, colourNodes, LOOK_PROGRAM } from './colour';
import { runNodes, TexturePool } from './graph';
import { COPY_PROGRAM, type GpuDevice, type GpuProgram, type GpuTexture } from './types';

/** A device that only records what it was asked to do. */
function fakeDevice() {
  let made = 0;
  const released: GpuTexture[] = [];
  const passes: { program: GpuProgram; input: GpuTexture; out: GpuTexture }[] = [];
  const dev: GpuDevice = {
    backend: 'webgl2',
    maxSize: 8192,
    lost: false,
    upload: (_s, width, height) => ({ width, height, id: `up${made++}` }) as GpuTexture,
    target: (width, height) => ({ width, height, id: `t${made++}` }) as GpuTexture,
    pass: (program, inputs, _u, out) => void passes.push({ program, input: inputs[0], out }),
    present: () => {
      throw new Error('not in tests');
    },
    read: async () => new Uint8ClampedArray(),
    release: (t) => void released.push(t),
    destroy: () => {},
  };
  return { dev, passes, released, made: () => made };
}

describe('colourNodes', () => {
  it('has nothing to do for neutral colour, even with a vignette (drawn on top)', () => {
    expect(colourNodes(DEFAULT_ADJUST)).toEqual([]);
    expect(colourNodes({ ...DEFAULT_ADJUST, vignette: 60 })).toEqual([]);
  });
  it('runs the look first, then the sliders', () => {
    const n = colourNodes({ ...DEFAULT_ADJUST, look: 'tinted', warmth: 20 });
    expect(n.map((x) => x.program.id)).toEqual(['look', 'adjust']);
    expect(n[0].uniforms[0]).toBe(5);
  });
  it('skips the sliders node when only a look is chosen, and the look node when only sliders move', () => {
    expect(colourNodes({ ...DEFAULT_ADJUST, look: 'bw' }).map((x) => x.program)).toEqual([LOOK_PROGRAM]);
    expect(colourNodes({ ...DEFAULT_ADJUST, contrast: -10 }).map((x) => x.program)).toEqual([ADJUST_PROGRAM]);
  });
  it('scales the sliders exactly as adjustPixels does', () => {
    const u = adjustUniforms({ ...DEFAULT_ADJUST, brightness: 50, contrast: 25, saturation: -100, warmth: 100 });
    [32, 1.2, 0, 24].forEach((v, i) => expect(u[i]).toBeCloseTo(v, 6));
    expect([...adjustUniforms({ ...DEFAULT_ADJUST, brightness: 900 })][0]).toBe(64);
  });
  it('declares programs the device layer accepts', () => {
    for (const p of [LOOK_PROGRAM, ADJUST_PROGRAM]) {
      expect(p.glsl).toMatch(/vec4 effect\(vec2 uv\)/);
      expect(p.wgsl).toMatch(/fn effect\(uv: vec2f\) -> vec4f/);
      expect(p.inputs).toBe(1);
    }
  });
});

describe('runNodes', () => {
  it('chains the nodes, each reading the one before', () => {
    const { dev, passes } = fakeDevice();
    const pool = new TexturePool(dev);
    const input = dev.upload({} as TexImageSource, 10, 5);
    const out = runNodes(dev, pool, input, colourNodes({ ...DEFAULT_ADJUST, look: 'warm', brightness: 10 }));
    expect(passes.map((p) => p.program.id)).toEqual(['look', 'adjust']);
    expect(passes[0].input).toBe(input);
    expect(passes[1].input).toBe(passes[0].out);
    expect(out).toBe(passes[1].out);
    expect([out.width, out.height]).toEqual([10, 5]);
  });
  it('copies the input when there is nothing to do, so callers handle one case', () => {
    const { dev, passes } = fakeDevice();
    const input = dev.upload({} as TexImageSource, 4, 4);
    const out = runNodes(dev, new TexturePool(dev), input, []);
    expect(passes.map((p) => p.program)).toEqual([COPY_PROGRAM]);
    expect(out).not.toBe(input);
  });
  it('reuses pooled textures frame after frame instead of allocating new ones', () => {
    const { dev, made } = fakeDevice();
    const pool = new TexturePool(dev);
    const input = dev.upload({} as TexImageSource, 8, 8);
    const nodes = colourNodes({ ...DEFAULT_ADJUST, look: 'vivid', saturation: 30 });
    for (let frame = 0; frame < 30; frame++) pool.give(runNodes(dev, pool, input, nodes));
    // The upload plus two ping-pong targets, however many frames ran.
    expect(made()).toBe(3);
  });
  it('keeps at most two spare textures per size and releases the rest', () => {
    const { dev, released } = fakeDevice();
    const pool = new TexturePool(dev);
    const ts = [1, 2, 3].map(() => pool.take(4, 4));
    ts.forEach((t) => pool.give(t));
    expect(released).toEqual([ts[2]]);
    pool.clear();
    expect(released).toHaveLength(3);
  });
});
