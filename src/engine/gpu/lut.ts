import { lutNeutral, type Adjustments } from '../adjust';
import { lutById, lutScale, lutTexture } from '../lut';
import type { GraphNode } from './graph';
import type { GpuProgram } from './types';

/*
 * The LUT step (P1.4) on the GPU, mirroring engine/lut.ts lutPixel(): the table, packed into a 2D texture by
 * lutTexture() (one tile per blue slice), is read texel by texel and interpolated over the same tetrahedra, then mixed
 * with the input by the amount. Reading texels rather than using a 3D texture's filtering keeps one texture kind in the
 * device layer and full float precision in the weights, so the result matches the Canvas 2D path.
 *
 * t0 = the picture, t1 = the packed table. u[0] = (1 keeps the result unrounded, amount 0–1, points per side, tiles per
 * row); u[1].xyz = scale and u[2].xyz = offset, mapping a value onto 0 … size − 1 (lutScale()).
 */
export const LUT_PROGRAM: GpuProgram = {
  id: 'lut',
  inputs: 2,
  uniforms: 3,
  glsl: `
vec3 at(ivec3 p) {
  int n = int(u[0].z + 0.5), cols = int(u[0].w + 0.5);
  return texelFetch(t1, ivec2((p.z % cols) * n + p.x, (p.z / cols) * n + p.y), 0).rgb;
}
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  float top = u[0].z - 1.0;
  vec3 x = clamp(c.rgb * u[1].xyz + u[2].xyz, 0.0, top);
  ivec3 i = min(ivec3(int(top + 0.5) - 1), ivec3(x));
  vec3 f = x - vec3(i);
  ivec3 s1, s2;
  float fa, fm, fc;
  if (f.r > f.g) {
    if (f.g > f.b) { s1 = ivec3(1, 0, 0); s2 = ivec3(1, 1, 0); fa = f.r; fm = f.g; fc = f.b; }
    else if (f.r > f.b) { s1 = ivec3(1, 0, 0); s2 = ivec3(1, 0, 1); fa = f.r; fm = f.b; fc = f.g; }
    else { s1 = ivec3(0, 0, 1); s2 = ivec3(1, 0, 1); fa = f.b; fm = f.r; fc = f.g; }
  } else if (f.b > f.g) { s1 = ivec3(0, 0, 1); s2 = ivec3(0, 1, 1); fa = f.b; fm = f.g; fc = f.r; }
  else if (f.b > f.r) { s1 = ivec3(0, 1, 0); s2 = ivec3(0, 1, 1); fa = f.g; fm = f.b; fc = f.r; }
  else { s1 = ivec3(0, 1, 0); s2 = ivec3(1, 1, 0); fa = f.g; fm = f.r; fc = f.b; }
  vec3 l = (1.0 - fa) * at(i) + (fa - fm) * at(i + s1) + (fm - fc) * at(i + s2) + fc * at(i + ivec3(1));
  vec3 o = clamp((c.rgb + (l - c.rgb) * u[0].y) * 255.0, 0.0, 255.0);
  return vec4((u[0].x > 0.5 ? o : floor(o + 0.5)) / 255.0, c.a);
}`,
  wgsl: `
fn at(p: vec3i) -> vec3f {
  let n = i32(round(P.u[0].z));
  let cols = i32(round(P.u[0].w));
  return textureLoad(t1, vec2i((p.z % cols) * n + p.x, (p.z / cols) * n + p.y), 0).rgb;
}
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let top = P.u[0].z - 1.0;
  let x = clamp(c.rgb * P.u[1].xyz + P.u[2].xyz, vec3f(0.0), vec3f(top));
  let i = min(vec3i(i32(round(top)) - 1), vec3i(x));
  let f = x - vec3f(i);
  var s1: vec3i;
  var s2: vec3i;
  var fa: f32;
  var fm: f32;
  var fc: f32;
  if (f.r > f.g) {
    if (f.g > f.b) { s1 = vec3i(1, 0, 0); s2 = vec3i(1, 1, 0); fa = f.r; fm = f.g; fc = f.b; }
    else if (f.r > f.b) { s1 = vec3i(1, 0, 0); s2 = vec3i(1, 0, 1); fa = f.r; fm = f.b; fc = f.g; }
    else { s1 = vec3i(0, 0, 1); s2 = vec3i(1, 0, 1); fa = f.b; fm = f.r; fc = f.g; }
  } else if (f.b > f.g) { s1 = vec3i(0, 0, 1); s2 = vec3i(0, 1, 1); fa = f.b; fm = f.g; fc = f.r; }
  else if (f.b > f.r) { s1 = vec3i(0, 1, 0); s2 = vec3i(0, 1, 1); fa = f.g; fm = f.b; fc = f.r; }
  else { s1 = vec3i(0, 1, 0); s2 = vec3i(1, 1, 0); fa = f.g; fm = f.r; fc = f.b; }
  let l = (1.0 - fa) * at(i) + (fa - fm) * at(i + s1) + (fm - fc) * at(i + s2) + fc * at(i + vec3i(1));
  let o = clamp((c.rgb + (l - c.rgb) * P.u[0].y) * 255.0, vec3f(0.0), vec3f(255.0));
  return vec4f(select(floor(o + 0.5), o, P.u[0].x > 0.5) / 255.0, c.a);
}`,
};

/** The LUT node for these settings, or null when no LUT applies (none set, amount 0, or its table not loaded). */
export function lutNode(a: Adjustments): GraphNode | null {
  if (lutNeutral(a)) return null;
  const l = lutById(a.lut)!,
    tex = lutTexture(l),
    { scale, offset } = lutScale(l);
  return {
    program: LUT_PROGRAM,
    uniforms: new Float32Array([0, a.lutAmount / 100, l.size, tex.cols, ...scale, 0, ...offset, 0]),
    inputs: ['prev', { key: `lut:${l.id}`, width: tex.width, height: tex.height, rgba: tex.rgba }],
  };
}
