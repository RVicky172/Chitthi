import type { GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The WebGPU backend of the GPU device layer (contract in gpu/types.ts): Chrome and Edge 113+, the desktop app, and
 * Safari 26 on macOS. WebGPU's framebuffer and textures both put the top row first, so uv.y = 0 is the top everywhere
 * without flipping. Its canvas only takes premultiplied alpha, so present() premultiplies on the way out.
 */

interface WgTex extends GpuTexture {
  tex: GPUTexture;
  format: GPUTextureFormat;
}

const header = (p: GpuProgram) => `
struct Params { u: array<vec4f, ${p.uniforms}> };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var smp: sampler;
${Array.from({ length: p.inputs }, (_, i) => `@group(0) @binding(${i + 2}) var t${i}: texture_2d<f32>;`).join('\n')}
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = vec2f(select(-1.0, 3.0, i == 1u), select(-1.0, 3.0, i == 2u));
  var o: VOut;
  o.pos = vec4f(p, 0.0, 1.0);
  o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}
`;
const shader = (p: GpuProgram, premultiply: boolean) =>
  `${header(p)}${p.wgsl}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  let c = effect(v.uv);
  return ${premultiply ? 'vec4f(c.rgb * c.a, c.a)' : 'c'};
}`;

/** 32-bit floats to 16-bit float bits, rounded to nearest even (rgba16float takes no other input). */
export function toHalf(src: Float32Array): Uint16Array {
  const f = new Float32Array(1),
    u = new Uint32Array(f.buffer),
    out = new Uint16Array(src.length);
  for (let i = 0; i < src.length; i++) {
    f[0] = src[i];
    const x = u[0],
      sign = (x >>> 16) & 0x8000,
      exp = (x >>> 23) & 0xff,
      man = x & 0x7fffff;
    let h: number;
    if (exp === 0xff) h = sign | 0x7c00 | (man ? 0x200 : 0);
    else {
      const e = exp - 127 + 15;
      if (e >= 0x1f) h = sign | 0x7c00;
      else if (e <= 0) {
        // Subnormal halves (or zero).
        if (e < -10) h = sign;
        else {
          const m = man | 0x800000,
            shift = 14 - e,
            half = 1 << (shift - 1);
          let v = m >>> shift;
          const rest = m & ((1 << shift) - 1);
          if (rest > half || (rest === half && v & 1)) v++;
          h = sign | v;
        }
      } else {
        let v = (e << 10) | (man >>> 13);
        const rest = man & 0x1fff;
        if (rest > 0x1000 || (rest === 0x1000 && v & 1)) v++;
        h = sign | v;
      }
    }
    out[i] = h;
  }
  return out;
}

/** Opens a WebGPU device, or null where the browser has none (or refuses one). */
export async function openWebGPU(): Promise<GpuDevice | null> {
  if (typeof navigator === 'undefined' || !navigator.gpu || typeof document === 'undefined') return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) return null;
  const dev = await adapter.requestDevice().catch(() => null);
  if (!dev) return null;

  let lost = false;
  void dev.lost.then(() => (lost = true));
  dev.addEventListener('uncapturederror', (e) =>
    console.error('WebGPU:', (e as GPUUncapturedErrorEvent).error.message),
  );
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('webgpu');
  if (!ctx) {
    dev.destroy();
    return null;
  }
  const screen = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device: dev, format: screen, alphaMode: 'premultiplied' });
  const maxSize = dev.limits.maxTextureDimension2D;
  const smp = dev.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // Explicit layouts: an 'auto' layout drops bindings a shader doesn't use, which would make the shared bind group
  // (uniforms, sampler, inputs) invalid for programs that ignore some of them.
  const layouts = new Map<number, GPUBindGroupLayout>();
  const layoutFor = (inputs: number) => {
    let l = layouts.get(inputs);
    if (!l) {
      const vis = GPUShaderStage.FRAGMENT;
      l = dev.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: vis, buffer: { type: 'uniform' } },
          { binding: 1, visibility: vis, sampler: { type: 'filtering' } },
          ...Array.from({ length: inputs }, (_, i) => ({
            binding: i + 2,
            visibility: vis,
            texture: { sampleType: 'float' as const },
          })),
        ],
      });
      layouts.set(inputs, l);
    }
    return l;
  };
  const pipelines = new Map<string, GPURenderPipeline>();
  const pipeline = (p: GpuProgram, format: GPUTextureFormat, premultiply: boolean) => {
    const key = `${p.id}|${format}|${premultiply}`;
    let pl = pipelines.get(key);
    if (!pl) {
      const module = dev.createShaderModule({ code: shader(p, premultiply), label: p.id });
      pl = dev.createRenderPipeline({
        layout: dev.createPipelineLayout({ bindGroupLayouts: [layoutFor(p.inputs)] }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
        label: p.id,
      });
      pipelines.set(key, pl);
    }
    return pl;
  };

  const check = (w: number, h: number) => {
    if (!(w >= 1 && h >= 1 && w <= maxSize && h <= maxSize))
      throw new Error(`GPU texture ${w}×${h} is outside 1–${maxSize}`);
  };
  const make = (width: number, height: number, format: GPUTextureFormat, usage: number): WgTex => ({
    width,
    height,
    format,
    tex: dev.createTexture({ size: [width, height], format, usage }),
  });
  const TARGET = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;

  const draw = (
    p: GpuProgram,
    inputs: readonly GpuTexture[],
    uniforms: Float32Array,
    view: GPUTextureView,
    format: GPUTextureFormat,
    premultiply: boolean,
  ) => {
    if (inputs.length < p.inputs) throw new Error(`${p.id} needs ${p.inputs} inputs`);
    const pl = pipeline(p, format, premultiply);
    const ubuf = dev.createBuffer({ size: p.uniforms * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const u = new Float32Array(p.uniforms * 4);
    u.set(uniforms.subarray(0, u.length));
    dev.queue.writeBuffer(ubuf, 0, u);
    const group = dev.createBindGroup({
      layout: layoutFor(p.inputs),
      entries: [
        { binding: 0, resource: { buffer: ubuf } },
        { binding: 1, resource: smp },
        ...inputs.slice(0, p.inputs).map((t, i) => ({ binding: i + 2, resource: (t as WgTex).tex.createView() })),
      ],
    });
    const enc = dev.createCommandEncoder();
    const rp = enc.beginRenderPass({
      colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
    });
    rp.setPipeline(pl);
    rp.setBindGroup(0, group);
    rp.draw(3);
    rp.end();
    dev.queue.submit([enc.finish()]);
    ubuf.destroy();
  };

  const device: GpuDevice = {
    backend: 'webgpu',
    maxSize,
    get lost() {
      return lost;
    },
    upload(src, width, height) {
      check(width, height);
      const t = make(
        width,
        height,
        'rgba8unorm',
        GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT |
          GPUTextureUsage.COPY_SRC,
      );
      dev.queue.copyExternalImageToTexture(
        { source: src as GPUCopyExternalImageSource, flipY: false },
        { texture: t.tex, premultipliedAlpha: false },
        [width, height],
      );
      return t;
    },
    uploadData(rgba, width, height) {
      check(width, height);
      const t = make(width, height, 'rgba16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
      dev.queue.writeTexture({ texture: t.tex }, toHalf(rgba), { bytesPerRow: width * 8 }, [width, height]);
      return t;
    },
    target(width, height) {
      check(width, height);
      return make(width, height, 'rgba16float', TARGET);
    },
    pass(program, inputs, uniforms, out) {
      const o = out as WgTex;
      draw(program, inputs, uniforms, o.tex.createView(), o.format, false);
    },
    present(tex) {
      if (canvas.width !== tex.width || canvas.height !== tex.height) {
        canvas.width = tex.width;
        canvas.height = tex.height;
      }
      draw(COPY_PROGRAM, [tex], new Float32Array(4), ctx.getCurrentTexture().createView(), screen, true);
      return canvas;
    },
    async read(tex) {
      let t = tex as WgTex;
      const tmp = t.format !== 'rgba8unorm' ? make(t.width, t.height, 'rgba8unorm', TARGET) : null;
      if (tmp) {
        device.pass(COPY_PROGRAM, [t], new Float32Array(4), tmp);
        t = tmp;
      }
      const row = Math.ceil((t.width * 4) / 256) * 256;
      const buf = dev.createBuffer({ size: row * t.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
      const enc = dev.createCommandEncoder();
      enc.copyTextureToBuffer({ texture: t.tex }, { buffer: buf, bytesPerRow: row }, [t.width, t.height]);
      dev.queue.submit([enc.finish()]);
      await buf.mapAsync(GPUMapMode.READ);
      const src = new Uint8Array(buf.getMappedRange());
      const out = new Uint8ClampedArray(t.width * t.height * 4);
      for (let y = 0; y < t.height; y++) out.set(src.subarray(y * row, y * row + t.width * 4), y * t.width * 4);
      buf.unmap();
      buf.destroy();
      if (tmp) device.release(tmp);
      return out;
    },
    release(tex) {
      (tex as WgTex).tex.destroy();
    },
    destroy() {
      pipelines.clear();
      ctx.unconfigure();
      dev.destroy();
      lost = true;
    },
  };
  return device;
}
