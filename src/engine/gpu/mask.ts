import type { Adjustments } from '../adjust';
import type { FrameMask } from '../masks';
import { colourNodes } from './colour';
import { detailNodes } from './detail';
import type { GraphNode, NodeInput } from './graph';
import type { GpuProgram } from './types';

/*
 * Masks on the GPU (P1.6), mirroring engine/instagram.ts maskPixels(): the mask's own colour and detail nodes run on
 * the picture so far, then MASK_MIX_PROGRAM mixes the two by the mask, read from the frame-size raster made by
 * engine/masks.ts frameMask() (the same bytes the Canvas 2D path reads). t0 = the picture so far, t1 = it with the
 * mask's settings, t2 = the mask (one channel).
 */
export const MASK_MIX_PROGRAM: GpuProgram = {
  id: 'maskmix',
  inputs: 3,
  uniforms: 1,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 a = texture(t0, uv);
  if (a.a == 0.0) return a;
  vec3 b = texture(t1, uv).rgb;
  float m = floor(texture(t2, uv).r * 255.0 + 0.5) / 255.0;
  vec3 o = clamp((a.rgb + (b - a.rgb) * m) * 255.0, 0.0, 255.0);
  return vec4(floor(o + 0.5) / 255.0, a.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let a = textureSampleLevel(t0, smp, uv, 0.0);
  if (a.a == 0.0) { return a; }
  let b = textureSampleLevel(t1, smp, uv, 0.0).rgb;
  let m = floor(textureSampleLevel(t2, smp, uv, 0.0).r * 255.0 + 0.5) / 255.0;
  let o = clamp((a.rgb + (b - a.rgb) * m) * 255.0, vec3f(0.0), vec3f(255.0));
  return vec4f(floor(o + 0.5) / 255.0, a.a);
}`,
};

/** The mix for a deep (16-bit) render: the same, without rounding the result to 8 bits. */
export const MASK_MIX_DEEP_PROGRAM: GpuProgram = {
  id: 'maskmixdeep',
  inputs: 3,
  uniforms: 1,
  glsl: `
vec4 effect(vec2 uv) {
  vec4 a = texture(t0, uv);
  if (a.a == 0.0) return a;
  vec3 b = texture(t1, uv).rgb;
  float m = floor(texture(t2, uv).r * 255.0 + 0.5) / 255.0;
  return vec4(clamp(a.rgb + (b - a.rgb) * m, 0.0, 1.0), a.a);
}`,
  wgsl: `
fn effect(uv: vec2f) -> vec4f {
  let a = textureSampleLevel(t0, smp, uv, 0.0);
  if (a.a == 0.0) { return a; }
  let b = textureSampleLevel(t1, smp, uv, 0.0).rgb;
  let m = floor(textureSampleLevel(t2, smp, uv, 0.0).r * 255.0 + 0.5) / 255.0;
  return vec4f(clamp(a.rgb + (b - a.rgb) * m, vec3f(0.0), vec3f(1.0)), a.a);
}`,
};

/**
 * Appends one mask's nodes to a graph whose picture so far is `from` (the last node, or the source when the graph is
 * empty): the mask's colour and detail steps, then the mix. Returns the mix node's index, or `from` unchanged when the
 * mask's settings do nothing.
 */
export function maskNodes(
  nodes: GraphNode[],
  from: NodeInput,
  a: Adjustments,
  mask: FrameMask,
  W: number,
  H: number,
  deep = false,
): NodeInput {
  const start = nodes.length;
  // The colour nodes read 'prev', the detail nodes the node before them: both are `from`, the graph's last output.
  nodes.push(...colourNodes(a, deep));
  nodes.push(...detailNodes(a, W, H, nodes.length, deep));
  if (nodes.length === start) return from;
  nodes.push({
    program: deep ? MASK_MIX_DEEP_PROGRAM : MASK_MIX_PROGRAM,
    uniforms: new Float32Array(4),
    inputs: [from, nodes.length - 1, { key: mask.key, width: mask.width, height: mask.height, r8: mask.data }],
  });
  return nodes.length - 1;
}
