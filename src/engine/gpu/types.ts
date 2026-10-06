/*
 * The GPU device layer's contract (specs/vision/editor-implementation.md, P0.2). Two backends implement it, WebGPU
 * (gpu/webgpu.ts) and WebGL2 (gpu/webgl2.ts); callers never branch on which one they have. When neither is available
 * the editors keep their Canvas 2D path.
 *
 * A pass draws one full-frame quad: its program reads up to four input textures and a small array of vec4 uniforms
 * and writes one output texture. Colours are straight (not premultiplied) RGBA in 0–1 everywhere inside the device.
 */

export type GpuBackend = 'webgpu' | 'webgl2';

/** A texture owned by one device. Opaque to callers. */
export interface GpuTexture {
  readonly width: number;
  readonly height: number;
}

/**
 * One effect, written once per shading language with the same meaning:
 *
 * - GLSL ES 3.0: defines `vec4 effect(vec2 uv)`. In scope: `uniform sampler2D t0 … t3;` and `uniform vec4 u[N];`.
 * - WGSL: defines `fn effect(uv: vec2f) -> vec4f`. In scope: `t0 … t3: texture_2d<f32>`, sampler `smp`, and
 *   `u: array<vec4f, N>` (read as `P.u[i]`).
 *
 * `uv` runs from (0, 0) at the top-left pixel's corner to (1, 1) at the bottom-right, on both backends.
 */
export interface GpuProgram {
  /** Unique name, used to cache the compiled program. */
  id: string;
  /** How many input textures it reads (0–4). */
  inputs: number;
  /** How many vec4 uniforms it reads (1–128; WebGL2 guarantees 224 per fragment shader). */
  uniforms: number;
  glsl: string;
  wgsl: string;
}

export interface GpuDevice {
  readonly backend: GpuBackend;
  /** Largest texture side this device accepts; bigger pictures stay on the Canvas 2D path. */
  readonly maxSize: number;
  /** True once the browser has taken the device away (driver reset, too many contexts); open a new one. */
  readonly lost: boolean;

  /** Copies an image, canvas, bitmap or video frame into a new texture (straight alpha, 8 bits per channel). */
  upload(src: TexImageSource, width: number, height: number): GpuTexture;
  /**
   * A texture holding data rather than a picture (a LUT): width × height RGBA floats, top row first, stored as 16-bit
   * floats. Programs read it texel by texel (texelFetch / textureLoad), not through the sampler.
   */
  uploadData(rgba: Float32Array, width: number, height: number): GpuTexture;
  /** A one-channel 8-bit texture (a mask), width × height bytes, top row first. Programs read it as `.r`. */
  uploadMask(data: Uint8Array, width: number, height: number): GpuTexture;
  /** A new texture to render into, with 16-bit float channels where the device can render to them. */
  target(width: number, height: number): GpuTexture;
  /** Runs a program over the inputs into out. uniforms holds program.uniforms × 4 floats. */
  pass(program: GpuProgram, inputs: readonly GpuTexture[], uniforms: Float32Array, out: GpuTexture): void;
  /**
   * Shows a texture on the device's own canvas, sized to it, and returns that canvas. Draw it with drawImage() straight
   * away, in the same task: its contents are only kept until the browser next paints.
   */
  present(tex: GpuTexture): HTMLCanvasElement | OffscreenCanvas;
  /** Reads a texture back as 8-bit straight RGBA, top row first. For tests and exports; slow. */
  read(tex: GpuTexture): Promise<Uint8ClampedArray>;
  /** True when targets hold 16-bit floats, so readFloat() gives more than 8 bits (the 16-bit TIFF export needs it). */
  readonly floatTargets: boolean;
  /** Reads a texture back as straight RGBA floats, 0–1, top row first. For the 16-bit TIFF export; slow. */
  readFloat(tex: GpuTexture): Promise<Float32Array>;
  release(tex: GpuTexture): void;
  destroy(): void;
}

/** The pass that copies its input unchanged: used by the self-test and as the simplest example of a program. */
export const COPY_PROGRAM: GpuProgram = {
  id: 'copy',
  inputs: 1,
  uniforms: 1,
  glsl: 'vec4 effect(vec2 uv) { return texture(t0, uv); }',
  wgsl: 'fn effect(uv: vec2f) -> vec4f { return textureSampleLevel(t0, smp, uv, 0.0); }',
};
