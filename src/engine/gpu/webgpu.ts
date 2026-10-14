import type { GpuBackend, GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The WebGPU backend of the GPU device layer (contract in gpu/types.ts): Chrome and Edge 113+, the desktop app, and
 * Safari 26 on macOS. WebGPU's framebuffer and textures both put the top row first, so uv.y = 0 is the top everywhere
 * without flipping. Its canvas only takes premultiplied alpha, so present() premultiplies on the way out.
 */

/** A WebGPU texture and its format. */
interface WgTex extends GpuTexture {
  tex: GPUTexture;
  format: GPUTextureFormat;
}

/**
 * A program's WGSL declarations: its uniforms, sampler, inputs and the full-frame vertex stage.
 * @param program the program
 * @returns WGSL
 */
const header = (program: GpuProgram): string => `
struct Params { u: array<vec4f, ${program.uniforms}> };
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var smp: sampler;
${Array.from({ length: program.inputs }, (_, index) => `@group(0) @binding(${index + 2}) var t${index}: texture_2d<f32>;`).join('\n')}
struct VOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VOut {
  let p = vec2f(select(-1.0, 3.0, i == 1u), select(-1.0, 3.0, i == 2u));
  var o: VOut;
  o.pos = vec4f(p, 0.0, 1.0);
  o.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return o;
}
`;

/**
 * A program's whole shader module.
 * @param program the program
 * @param premultiply premultiply the output (drawing to the canvas)
 * @returns WGSL
 */
const shader = (program: GpuProgram, premultiply: boolean): string =>
  `${header(program)}${program.wgsl}
@fragment fn fs(v: VOut) -> @location(0) vec4f {
  let c = effect(v.uv);
  return ${premultiply ? 'vec4f(c.rgb * c.a, c.a)' : 'c'};
}`;

/**
 * A 16-bit float as a number (reading rgba16float textures back).
 * @param half the 16 bits
 * @returns the number
 */
export function fromHalf(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >>> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 0x1f) return mantissa ? NaN : sign * Infinity;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/**
 * A subnormal half (or zero) from a float's mantissa, rounded to nearest even.
 * @param sign the sign bit, in place
 * @param exponent the half's exponent, 0 or below
 * @param mantissa the float's 23-bit mantissa
 * @returns the half's bits
 */
function subnormalHalf(sign: number, exponent: number, mantissa: number): number {
  if (exponent < -10) return sign;
  const full = mantissa | 0x800000;
  const shift = 14 - exponent;
  const half = 1 << (shift - 1);
  let value = full >>> shift;
  const rest = full & ((1 << shift) - 1);
  if (rest > half || (rest === half && value & 1)) value++;
  return sign | value;
}

/**
 * A normal half from a float's exponent and mantissa, rounded to nearest even.
 * @param sign the sign bit, in place
 * @param exponent the half's exponent, 1–30
 * @param mantissa the float's 23-bit mantissa
 * @returns the half's bits
 */
function normalHalf(sign: number, exponent: number, mantissa: number): number {
  let value = (exponent << 10) | (mantissa >>> 13);
  const rest = mantissa & 0x1fff;
  if (rest > 0x1000 || (rest === 0x1000 && value & 1)) value++;
  return sign | value;
}

/**
 * A 32-bit float's bits as 16-bit float bits, rounded to nearest even.
 * @param bits the float's bits
 * @returns the half's bits
 */
function halfBits(bits: number): number {
  const sign = (bits >>> 16) & 0x8000;
  const floatExponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;
  if (floatExponent === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  const exponent = floatExponent - 127 + 15;
  if (exponent >= 0x1f) return sign | 0x7c00;
  if (exponent <= 0) return subnormalHalf(sign, exponent, mantissa);
  return normalHalf(sign, exponent, mantissa);
}

/**
 * 32-bit floats as 16-bit float bits, rounded to nearest even (rgba16float takes no other input).
 * @param source the floats
 * @returns the halves
 */
export function toHalf(source: Float32Array): Uint16Array {
  // One float's bytes, read back as its bits (the machine's byte order both ways, like a Float32Array over a Uint32Array).
  const scratch = new DataView(new ArrayBuffer(4));
  const out = new Uint16Array(source.length);
  for (let index = 0; index < source.length; index++) {
    scratch.setFloat32(0, source[index] ?? 0, true);
    out[index] = halfBits(scratch.getUint32(0, true));
  }
  return out;
}

/**
 * The usage of render targets: drawn into, read by passes, copied out. A function: GPUTextureUsage only exists where
 * WebGPU does.
 * @returns the usage flags
 */
const TARGET = (): number => GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC;

/**
 * A WebGPU texture behind a device texture.
 * @param texture a texture this backend made
 * @returns it, typed
 */
const wgTex = (texture: GpuTexture): WgTex => texture as WgTex;

/**
 * Bytes per buffer row for a texture read-back (WebGPU wants multiples of 256).
 * @param width px
 * @param bytesPerPixel 4 or 8
 * @returns the row's size, bytes
 */
const readRow = (width: number, bytesPerPixel: number): number => Math.ceil((width * bytesPerPixel) / 256) * 256;

/** The WebGPU device: one device and a canvas, pipelines made on first use. */
class WebGPUDevice implements GpuDevice {
  readonly backend: GpuBackend = 'webgpu';
  readonly floatTargets = true;
  readonly maxSize: number;
  private deviceLost = false;
  private readonly sampler: GPUSampler;
  private readonly screen: GPUTextureFormat;
  private readonly layouts = new Map<number, GPUBindGroupLayout>();
  private readonly pipelines = new Map<string, GPURenderPipeline>();

  /**
   * A device with its canvas.
   * @param device the WebGPU device
   * @param canvas the canvas present() shows pictures on
   * @param context its WebGPU context
   */
  constructor(
    private readonly device: GPUDevice,
    private readonly canvas: HTMLCanvasElement,
    private readonly context: GPUCanvasContext,
  ) {
    this.screen = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: this.screen, alphaMode: 'premultiplied' });
    this.maxSize = device.limits.maxTextureDimension2D;
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  }

  /** @returns true once the browser has taken the device away */
  get lost(): boolean {
    return this.deviceLost;
  }

  /** Marks the device lost (the browser took it away). */
  markLost(): void {
    this.deviceLost = true;
  }

  /**
   * The bind group layout for programs with some inputs. Explicit layouts: an 'auto' layout drops bindings a shader
   * doesn't use, which would make the shared bind group (uniforms, sampler, inputs) invalid for programs that ignore
   * some of them.
   * @param inputs how many input textures
   * @returns the layout
   */
  private layoutFor(inputs: number): GPUBindGroupLayout {
    let layout = this.layouts.get(inputs);
    if (!layout) {
      const visibility = GPUShaderStage.FRAGMENT;
      layout = this.device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility, buffer: { type: 'uniform' } },
          { binding: 1, visibility, sampler: { type: 'filtering' } },
          ...Array.from({ length: inputs }, (_, index) => ({ binding: index + 2, visibility, texture: { sampleType: 'float' as const } })),
        ],
      });
      this.layouts.set(inputs, layout);
    }
    return layout;
  }

  /**
   * A program's render pipeline for a target format, made on first use.
   * @param program the program
   * @param format the target's format
   * @param premultiply premultiply the output
   * @returns the pipeline
   */
  private pipeline(program: GpuProgram, format: GPUTextureFormat, premultiply: boolean): GPURenderPipeline {
    const key = `${program.id}|${format}|${String(premultiply)}`;
    let pipeline = this.pipelines.get(key);
    if (!pipeline) {
      const module = this.device.createShaderModule({ code: shader(program, premultiply), label: program.id });
      pipeline = this.device.createRenderPipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.layoutFor(program.inputs)] }),
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: 'fs', targets: [{ format }] },
        primitive: { topology: 'triangle-list' },
        label: program.id,
      });
      this.pipelines.set(key, pipeline);
    }
    return pipeline;
  }

  /**
   * Checks a texture size.
   * @param width px
   * @param height px
   * @throws when it is outside 1–maxSize
   */
  private check(width: number, height: number): void {
    if (!(width >= 1 && height >= 1 && width <= this.maxSize && height <= this.maxSize)) throw new Error(`GPU texture ${width}×${height} is outside 1–${this.maxSize}`);
  }

  /**
   * A new texture.
   * @param width px
   * @param height px
   * @param format its format
   * @param usage its usage flags
   * @returns the texture
   */
  private make(width: number, height: number, format: GPUTextureFormat, usage: number): WgTex {
    return { width, height, format, tex: this.device.createTexture({ size: [width, height], format, usage }) };
  }

  /**
   * Draws a program's full-frame triangle into a view.
   * @param program the program
   * @param inputs its input textures
   * @param uniforms its uniforms
   * @param view the view drawn into
   * @param format the view's format
   * @param premultiply premultiply the output (drawing to the canvas)
   */
  private draw(program: GpuProgram, inputs: readonly GpuTexture[], uniforms: Float32Array, view: GPUTextureView, format: GPUTextureFormat, premultiply: boolean): void {
    if (inputs.length < program.inputs) throw new Error(`${program.id} needs ${program.inputs} inputs`);
    const { device } = this;
    const pipeline = this.pipeline(program, format, premultiply);
    const uniformBuffer = device.createBuffer({ size: program.uniforms * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const values = new Float32Array(program.uniforms * 4);
    values.set(uniforms.subarray(0, values.length));
    device.queue.writeBuffer(uniformBuffer, 0, values);
    const group = device.createBindGroup({
      layout: this.layoutFor(program.inputs),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: this.sampler },
        ...inputs.slice(0, program.inputs).map((texture, index) => ({ binding: index + 2, resource: wgTex(texture).tex.createView() })),
      ],
    });
    const encoder = device.createCommandEncoder();
    const renderPass = encoder.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] });
    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, group);
    renderPass.draw(3);
    renderPass.end();
    device.queue.submit([encoder.finish()]);
    uniformBuffer.destroy();
  }

  upload(src: TexImageSource, width: number, height: number): GpuTexture {
    this.check(width, height);
    const texture = this.make(width, height, 'rgba8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC);
    this.device.queue.copyExternalImageToTexture({ source: src, flipY: false }, { texture: texture.tex, premultipliedAlpha: false }, [width, height]);
    return texture;
  }

  uploadData(rgba: Float32Array, width: number, height: number): GpuTexture {
    this.check(width, height);
    const texture = this.make(width, height, 'rgba16float', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    this.device.queue.writeTexture({ texture: texture.tex }, toHalf(rgba), { bytesPerRow: width * 8 }, [width, height]);
    return texture;
  }

  uploadMask(data: Uint8Array, width: number, height: number): GpuTexture {
    this.check(width, height);
    const texture = this.make(width, height, 'r8unorm', GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
    this.device.queue.writeTexture({ texture: texture.tex }, data, { bytesPerRow: width }, [width, height]);
    return texture;
  }

  target(width: number, height: number): GpuTexture {
    this.check(width, height);
    return this.make(width, height, 'rgba16float', TARGET());
  }

  pass(program: GpuProgram, inputs: readonly GpuTexture[], uniforms: Float32Array, out: GpuTexture): void {
    const output = wgTex(out);
    this.draw(program, inputs, uniforms, output.tex.createView(), output.format, false);
  }

  present(tex: GpuTexture): HTMLCanvasElement {
    const { canvas } = this;
    if (canvas.width !== tex.width || canvas.height !== tex.height) {
      canvas.width = tex.width;
      canvas.height = tex.height;
    }
    this.draw(COPY_PROGRAM, [tex], new Float32Array(4), this.context.getCurrentTexture().createView(), this.screen, true);
    return canvas;
  }

  /**
   * Copies a texture into a mappable buffer and waits for it.
   * @param texture the texture
   * @param row bytes per buffer row
   * @returns the mapped buffer (unmap and destroy it after reading)
   */
  private async mapped(texture: WgTex, row: number): Promise<GPUBuffer> {
    const { device } = this;
    const buffer = device.createBuffer({ size: row * texture.height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: texture.tex }, { buffer, bytesPerRow: row }, [texture.width, texture.height]);
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    return buffer;
  }

  async read(tex: GpuTexture): Promise<Uint8ClampedArray> {
    let texture = wgTex(tex);
    const copy = texture.format !== 'rgba8unorm' ? this.make(texture.width, texture.height, 'rgba8unorm', TARGET()) : null;
    if (copy) {
      this.pass(COPY_PROGRAM, [texture], new Float32Array(4), copy);
      texture = copy;
    }
    const row = readRow(texture.width, 4);
    const buffer = await this.mapped(texture, row);
    const source = new Uint8Array(buffer.getMappedRange());
    const out = new Uint8ClampedArray(texture.width * texture.height * 4);
    for (let y = 0; y < texture.height; y++) out.set(source.subarray(y * row, y * row + texture.width * 4), y * texture.width * 4);
    buffer.unmap();
    buffer.destroy();
    if (copy) this.release(copy);
    return out;
  }

  async readFloat(tex: GpuTexture): Promise<Float32Array> {
    const texture = wgTex(tex);
    if (texture.format !== 'rgba16float') return Float32Array.from(await this.read(tex), (value) => value / 255);
    const row = readRow(texture.width, 8);
    const buffer = await this.mapped(texture, row);
    const source = new Uint16Array(buffer.getMappedRange());
    const out = new Float32Array(texture.width * texture.height * 4);
    for (let y = 0; y < texture.height; y++)
      for (let x = 0; x < texture.width * 4; x++) out[y * texture.width * 4 + x] = fromHalf(source[(y * row) / 2 + x] ?? 0);
    buffer.unmap();
    buffer.destroy();
    return out;
  }

  release(tex: GpuTexture): void {
    wgTex(tex).tex.destroy();
  }

  destroy(): void {
    this.pipelines.clear();
    this.context.unconfigure();
    this.device.destroy();
    this.deviceLost = true;
  }
}

/**
 * Opens a WebGPU device.
 * @returns the device, or null where the browser has none (or refuses one)
 */
export async function openWebGPU(): Promise<GpuDevice | null> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || typeof document === 'undefined') return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) return null;
  const device = await adapter.requestDevice().catch(() => null);
  if (!device) return null;
  let opened: WebGPUDevice | null = null;
  // Runs as a microtask at the earliest, so after `opened` is set below (nothing in between awaits).
  void device.lost.then(() => opened?.markLost());
  device.addEventListener('uncapturederror', (event) => {
    console.error('WebGPU:', event.error.message);
  });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('webgpu');
  if (!context) {
    device.destroy();
    return null;
  }
  opened = new WebGPUDevice(device, canvas, context);
  return opened;
}
