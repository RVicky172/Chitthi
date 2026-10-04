import type { Adjustments } from '../adjust';
import {
  CLARITY_SIGMA,
  DETAIL_WIDTH,
  detailNeutral,
  GRAIN_CELL,
  gaussKernel,
  HAZE_SIGMA,
  MAX_TAPS,
  noiseParams,
  type Kernel,
} from '../detail';
import type { GraphNode, NodeInput } from './graph';
import type { GpuProgram } from './types';

/*
 * Detail and effects on the GPU (P1.3), mirroring engine/detail.ts tap for tap: the same Gaussian kernels (weights
 * passed as uniforms), the same alpha-weighted blurs, the same 5×5 noise filter and grain hash. Intermediate results
 * stay unrounded; the last detail step rounds to 8 bits, as detailPixels() does. Every program here keeps transparent
 * pixels as they are. The "round" flag is u[1].x on the steps that can come last.
 */

const LUMA = 'vec3(0.299, 0.587, 0.114)';
const LUMA_W = 'vec3f(0.299, 0.587, 0.114)';
const W_SLOTS = Math.ceil((2 * MAX_TAPS + 1) / 4);

/**
 * One direction of an alpha-weighted Gaussian blur. u[0] = (step x, step y in uv, taps either side, mode). Mode 0 reads
 * straight colour and writes premultiplied sums; mode 1 reads those and writes straight colour with the blurred alpha.
 * u[1…] = the kernel weights.
 */
export const BLUR_PROGRAM: GpuProgram = {
  id: 'blur',
  inputs: 1,
  uniforms: 1 + W_SLOTS,
  glsl: `
float wt(int i) { return u[1 + i / 4][i % 4]; }
vec4 effect(vec2 uv) {
  int n = int(u[0].z + 0.5);
  vec4 s = vec4(0.0);
  for (int t = -${MAX_TAPS}; t <= ${MAX_TAPS}; t++) {
    if (t < -n || t > n) continue;
    vec4 c = texture(t0, uv + float(t) * u[0].xy);
    float w = wt(t + n);
    if (u[0].w < 0.5) s += vec4(c.rgb * c.a, c.a) * w;
    else s += c * w;
  }
  if (u[0].w < 0.5) return s;
  return s.a > 0.0 ? vec4(s.rgb / s.a, s.a) : vec4(0.0);
}`,
  wgsl: `
fn wt(i: i32) -> f32 { return P.u[1 + i / 4][i % 4]; }
fn effect(uv: vec2f) -> vec4f {
  let n = i32(round(P.u[0].z));
  var s = vec4f(0.0);
  for (var t = -${MAX_TAPS}; t <= ${MAX_TAPS}; t++) {
    if (t < -n || t > n) { continue; }
    let c = textureSampleLevel(t0, smp, uv + f32(t) * P.u[0].xy, 0.0);
    let w = wt(t + n);
    if (P.u[0].w < 0.5) { s += vec4f(c.rgb * c.a, c.a) * w; } else { s += c * w; }
  }
  if (P.u[0].w < 0.5) { return s; }
  if (s.a > 0.0) { return vec4f(s.rgb / s.a, s.a); }
  return vec4f(0.0);
}`,
};

/** The darkest of red, green and blue in all three channels: the haze estimate. */
export const DARK_PROGRAM: GpuProgram = {
  id: 'dark',
  inputs: 1,
  uniforms: 1,
  glsl: 'vec4 effect(vec2 uv) { vec4 c = texture(t0, uv); return vec4(vec3(min(c.r, min(c.g, c.b))), c.a); }',
  wgsl: 'fn effect(uv: vec2f) -> vec4f { let c = textureSampleLevel(t0, smp, uv, 0.0); return vec4f(vec3f(min(c.r, min(c.g, c.b))), c.a); }',
};

const ROUND_GLSL = 'u[1].x > 0.5 ? floor(clamp(o, 0.0, 1.0) * 255.0 + 0.5) / 255.0 : o';
const ROUND_WGSL = 'select(o, floor(clamp(o, vec3f(0.0), vec3f(1.0)) * 255.0 + 0.5) / 255.0, P.u[1].x > 0.5)';

/** 5×5 edge-preserving noise filter. u[0] = (step x, step y in uv, 1 / (2 sigmaR²), spatial factor). */
export const DENOISE_PROGRAM: GpuProgram = {
  id: 'denoise',
  inputs: 1,
  uniforms: 2,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  float l0 = dot(c.rgb, ${LUMA});
  vec3 s = vec3(0.0);
  float sw = 0.0;
  for (int dy = -2; dy <= 2; dy++)
    for (int dx = -2; dx <= 2; dx++) {
      vec4 p = texture(t0, uv + vec2(float(dx), float(dy)) * u[0].xy);
      float dl = dot(p.rgb, ${LUMA}) - l0;
      float w = exp(-float(dx * dx + dy * dy) * u[0].w - dl * dl * u[0].z) * p.a;
      s += p.rgb * w;
      sw += w;
    }
  vec3 o = s / sw;
  return vec4(${ROUND_GLSL}, c.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let l0 = dot(c.rgb, ${LUMA_W});
  var s = vec3f(0.0);
  var sw = 0.0;
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      let p = textureSampleLevel(t0, smp, uv + vec2f(f32(dx), f32(dy)) * P.u[0].xy, 0.0);
      let dl = dot(p.rgb, ${LUMA_W}) - l0;
      let w = exp(-f32(dx * dx + dy * dy) * P.u[0].w - dl * dl * P.u[0].z) * p.a;
      s += p.rgb * w;
      sw += w;
    }
  }
  let o = s / sw;
  return vec4f(${ROUND_WGSL}, c.a);
}`,
};

/** Dehaze from the picture (t0) and its blurred dark channel (t1). u[0].x = strength, -1 to 1. */
export const DEHAZE_PROGRAM: GpuProgram = {
  id: 'dehaze',
  inputs: 2,
  uniforms: 2,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  float h = texture(t1, uv).r, k = u[0].x;
  vec3 o = k > 0.0 ? (c.rgb - 1.0) / max(1.0 - k * 0.95 * h, 0.1) + 1.0 : c.rgb + -k * 0.4 * (0.9 - c.rgb);
  return vec4(${ROUND_GLSL}, c.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let h = textureSampleLevel(t1, smp, uv, 0.0).r;
  let k = P.u[0].x;
  var o: vec3f;
  if (k > 0.0) { o = (c.rgb - 1.0) / max(1.0 - k * 0.95 * h, 0.1) + 1.0; } else { o = c.rgb + -k * 0.4 * (0.9 - c.rgb); }
  return vec4f(${ROUND_WGSL}, c.a);
}`,
};

/** Clarity from the picture (t0) and its large blur (t1). u[0].x = strength × 0.7. */
export const CLARITY_PROGRAM: GpuProgram = {
  id: 'clarity',
  inputs: 2,
  uniforms: 2,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  vec3 b = texture(t1, uv).rgb;
  float l = dot(c.rgb, ${LUMA});
  float w = 1.0 - (2.0 * l - 1.0) * (2.0 * l - 1.0);
  vec3 o = c.rgb + (c.rgb - b) * u[0].x * w;
  return vec4(${ROUND_GLSL}, c.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let b = textureSampleLevel(t1, smp, uv, 0.0).rgb;
  let l = dot(c.rgb, ${LUMA_W});
  let w = 1.0 - (2.0 * l - 1.0) * (2.0 * l - 1.0);
  let o = c.rgb + (c.rgb - b) * P.u[0].x * w;
  return vec4f(${ROUND_WGSL}, c.a);
}`,
};

/** Unsharp mask from the picture (t0) and its small blur (t1). u[0] = (amount × 1.5, edge threshold). */
export const SHARPEN_PROGRAM: GpuProgram = {
  id: 'sharpen',
  inputs: 2,
  uniforms: 2,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  vec3 d = c.rgb - texture(t1, uv).rgb;
  float th = u[0].y, e = abs(dot(d, ${LUMA}));
  float t = th > 0.0 ? clamp((e - th) / (th + 0.01), 0.0, 1.0) : 1.0;
  vec3 o = c.rgb + d * (u[0].x * t * t * (3.0 - 2.0 * t));
  return vec4(${ROUND_GLSL}, c.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let d = c.rgb - textureSampleLevel(t1, smp, uv, 0.0).rgb;
  let th = P.u[0].y;
  let e = abs(dot(d, ${LUMA_W}));
  let t = select(1.0, clamp((e - th) / (th + 0.01), 0.0, 1.0), th > 0.0);
  let o = c.rgb + d * (P.u[0].x * t * t * (3.0 - 2.0 * t));
  return vec4f(${ROUND_WGSL}, c.a);
}`,
};

/** Grain: smooth value noise from an integer hash, the same as detail.ts grainAt(). u[0] = (amount, cell px, width, height). */
export const GRAIN_PROGRAM: GpuProgram = {
  id: 'grain',
  inputs: 1,
  uniforms: 2,
  glsl: `
float hsh(int x, int y) {
  uint h = (uint(x) * 0x8da6b343u) ^ (uint(y) * 0xd8163841u);
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return float(h) / 4294967296.0;
}
float noise(vec2 g) {
  vec2 i = floor(g), f = g - i, s = f * f * (3.0 - 2.0 * f);
  int x = int(i.x), y = int(i.y);
  float a = hsh(x, y) + (hsh(x + 1, y) - hsh(x, y)) * s.x;
  float b = hsh(x, y + 1) + (hsh(x + 1, y + 1) - hsh(x, y + 1)) * s.x;
  return a + (b - a) * s.y;
}
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  vec2 px = floor(uv * u[0].zw);
  float n = (noise((px + 0.5) / u[0].y) - 0.5) * u[0].x;
  vec3 o = c.rgb + n;
  return vec4(${ROUND_GLSL}, c.a);
}`,
  wgsl: `
fn hsh(x: i32, y: i32) -> f32 {
  var h = (u32(x) * 0x8da6b343u) ^ (u32(y) * 0xd8163841u);
  h = (h ^ (h >> 16u)) * 0x7feb352du;
  h = (h ^ (h >> 15u)) * 0x846ca68bu;
  h = h ^ (h >> 16u);
  return f32(h) / 4294967296.0;
}
fn noise(g: vec2f) -> f32 {
  let i = floor(g);
  let f = g - i;
  let s = f * f * (3.0 - 2.0 * f);
  let x = i32(i.x);
  let y = i32(i.y);
  let a = hsh(x, y) + (hsh(x + 1, y) - hsh(x, y)) * s.x;
  let b = hsh(x, y + 1) + (hsh(x + 1, y + 1) - hsh(x, y + 1)) * s.x;
  return a + (b - a) * s.y;
}
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let px = floor(uv * P.u[0].zw);
  let n = (noise((px + 0.5) / P.u[0].y) - 0.5) * P.u[0].x;
  let o = c.rgb + n;
  return vec4f(${ROUND_WGSL}, c.a);
}`,
};

function blurUniforms(k: Kernel, dx: number, dy: number, mode: 0 | 1): Float32Array {
  const u = new Float32Array(BLUR_PROGRAM.uniforms * 4),
    n = (k.weights.length - 1) / 2;
  u.set([dx * k.step, dy * k.step, n, mode]);
  u.set(k.weights, 4);
  return u;
}

/**
 * The detail settings as graph nodes for a W×H picture, appended after `base` earlier nodes (their indices start at
 * base). The first reads the node before it ('prev'), or the graph input when base is 0.
 */
export function detailNodes(a: Adjustments, W: number, H: number, base: number, deep = false): GraphNode[] {
  if (detailNeutral(a)) return [];
  const scale = W / DETAIL_WIDTH,
    tx = 1 / W,
    ty = 1 / H,
    nodes: GraphNode[] = [];
  const add = (n: GraphNode) => base + nodes.push(n) - 1;
  let img: NodeInput = base > 0 ? base - 1 : 'source';
  const blur = (from: NodeInput, sigma: number): number => {
    const k = gaussKernel(sigma);
    add({ program: BLUR_PROGRAM, uniforms: blurUniforms(k, tx, 0, 0), inputs: [from] });
    return add({ program: BLUR_PROGRAM, uniforms: blurUniforms(k, 0, ty, 1) });
  };
  const steps: GraphNode[] = [];
  const step = (program: GpuProgram, u: number[], inputs: NodeInput[]) => {
    const uniforms = new Float32Array(program.uniforms * 4);
    uniforms.set(u);
    const n = { program, uniforms, inputs };
    steps.push(n);
    return add(n);
  };
  if (a.noise > 0) {
    const p = noiseParams(a.noise, scale);
    img = step(DENOISE_PROGRAM, [tx * p.step, ty * p.step, 1 / (2 * p.sigmaR * p.sigmaR), p.spatial], [img]);
  }
  if (a.dehaze) {
    const dark = add({ program: DARK_PROGRAM, uniforms: new Float32Array(4), inputs: [img] });
    img = step(DEHAZE_PROGRAM, [a.dehaze / 100], [img, blur(dark, HAZE_SIGMA * scale)]);
  }
  if (a.clarity) img = step(CLARITY_PROGRAM, [(a.clarity / 100) * 0.7], [img, blur(img, CLARITY_SIGMA * scale)]);
  if (a.sharpen > 0)
    img = step(
      SHARPEN_PROGRAM,
      [(a.sharpen / 100) * 1.5, (a.sharpenMask / 100) * 0.08],
      [img, blur(img, a.sharpenRadius * scale)],
    );
  if (a.grain > 0) step(GRAIN_PROGRAM, [(a.grain / 100) * 0.12, GRAIN_CELL * scale, W, H], [img]);
  // The last step rounds to 8 bits, like detailPixels(); it is always the final node. Not in a deep (16-bit) render.
  if (!deep) steps[steps.length - 1].uniforms[4] = 1;
  return nodes;
}
