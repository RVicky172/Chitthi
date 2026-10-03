import { colourNeutral, LOOK_IDS, type Adjustments } from '../adjust';
import type { GraphNode } from './graph';
import type { GpuProgram } from './types';

/*
 * The colour settings as GPU programs (P0.4): today's looks (engine/photo.ts lookPixels) and sliders
 * (engine/instagram.ts adjustPixels), ported line for line so the GPU and Canvas 2D paths give the same pixels. Both
 * work in 0–255 sRGB values like the CPU code, and round to 8 bits after the look, where the CPU stores its result
 * before the sliders run. Keep each pair of shaders in step with the CPU functions; the self-test compares them.
 */

/** Look index = position in LOOK_IDS: 0 none, 1 vivid, 2 warm, 3 cool, 4 bw, 5 tinted, 6 vintage. */
export const LOOK_PROGRAM: GpuProgram = {
  id: 'look',
  inputs: 1,
  uniforms: 1,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  vec3 p = c.rgb * 255.0;
  float l = dot(p, vec3(0.299, 0.587, 0.114));
  int k = int(u[0].x + 0.5);
  vec3 o = p;
  if (k == 1) o = (vec3(l) + (p - vec3(l)) * 1.35 - 128.0) * 1.06 + 128.0;
  else if (k == 2) o = p * vec3(1.08, 1.02, 0.88);
  else if (k == 3) o = p * vec3(0.9, 1.01, 1.1);
  else if (k == 4) o = vec3((l - 128.0) * 1.08 + 128.0);
  else if (k == 5) {
    float hi = max(p.r, max(p.g, p.b));
    float sat = hi > 0.0 ? (hi - min(p.r, min(p.g, p.b))) / hi : 0.0;
    float wash = clamp((sat - 0.28) / 0.42, 0.0, 1.0) * 0.62;
    float base = (l - 128.0) * 1.06 + 128.0;
    o = vec3(base * 1.015 + 4.0, base * 0.995 + 2.0, base * 0.955 + 1.0) + (p - vec3(l)) * wash;
  } else if (k == 6) o = p * 0.45 + vec3(l * 1.07 + 20.0, l * 0.95 + 12.0, l * 0.78 + 10.0) * 0.55;
  return vec4(floor(clamp(o, 0.0, 255.0) + 0.5) / 255.0, c.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  let p = c.rgb * 255.0;
  let l = dot(p, vec3f(0.299, 0.587, 0.114));
  let k = i32(round(P.u[0].x));
  var o = p;
  if (k == 1) { o = (vec3f(l) + (p - vec3f(l)) * 1.35 - 128.0) * 1.06 + 128.0; }
  else if (k == 2) { o = p * vec3f(1.08, 1.02, 0.88); }
  else if (k == 3) { o = p * vec3f(0.9, 1.01, 1.1); }
  else if (k == 4) { o = vec3f((l - 128.0) * 1.08 + 128.0); }
  else if (k == 5) {
    let hi = max(p.r, max(p.g, p.b));
    let sat = select(0.0, (hi - min(p.r, min(p.g, p.b))) / hi, hi > 0.0);
    let wash = clamp((sat - 0.28) / 0.42, 0.0, 1.0) * 0.62;
    let base = (l - 128.0) * 1.06 + 128.0;
    o = vec3f(base * 1.015 + 4.0, base * 0.995 + 2.0, base * 0.955 + 1.0) + (p - vec3f(l)) * wash;
  } else if (k == 6) { o = p * 0.45 + vec3f(l * 1.07 + 20.0, l * 0.95 + 12.0, l * 0.78 + 10.0) * 0.55; }
  return vec4f(floor(clamp(o, vec3f(0.0), vec3f(255.0)) + 0.5) / 255.0, c.a);
}`,
};

/** u[0] = (brightness offset, contrast factor, saturation factor, warmth offset), in 0–255 units (adjustUniforms). */
export const ADJUST_PROGRAM: GpuProgram = {
  id: 'adjust',
  inputs: 1,
  uniforms: 1,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  vec3 p = (c.rgb * 255.0 + u[0].x - 128.0) * u[0].y + 128.0;
  float l = dot(p, vec3(0.299, 0.587, 0.114));
  p = vec3(l) + (p - vec3(l)) * u[0].z + vec3(u[0].w, u[0].w * 0.15, -u[0].w);
  return vec4(clamp(p, 0.0, 255.0) / 255.0, c.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let a = P.u[0];
  var p = (c.rgb * 255.0 + a.x - 128.0) * a.y + 128.0;
  let l = dot(p, vec3f(0.299, 0.587, 0.114));
  p = vec3f(l) + (p - vec3f(l)) * a.z + vec3f(a.w, a.w * 0.15, -a.w);
  return vec4f(clamp(p, vec3f(0.0), vec3f(255.0)) / 255.0, c.a);
}`,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The slider uniforms, with the same scaling as adjustPixels(). */
export function adjustUniforms(a: Adjustments): Float32Array {
  return new Float32Array([
    (clamp(a.brightness, -100, 100) / 100) * 64,
    1 + clamp(a.contrast, -100, 100) / 125,
    1 + clamp(a.saturation, -100, 100) / 100,
    (clamp(a.warmth, -100, 100) / 100) * 24,
  ]);
}

/** The nodes for a picture's colour settings: the look, then the sliders, each only when it changes something. */
export function colourNodes(a: Adjustments): GraphNode[] {
  if (colourNeutral(a)) return [];
  const nodes: GraphNode[] = [];
  if (a.look !== 'none')
    nodes.push({ program: LOOK_PROGRAM, uniforms: new Float32Array([LOOK_IDS.indexOf(a.look), 0, 0, 0]) });
  if (a.brightness || a.contrast || a.saturation || a.warmth)
    nodes.push({ program: ADJUST_PROGRAM, uniforms: adjustUniforms(a) });
  return nodes;
}
