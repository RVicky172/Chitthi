import { colourNeutral, LOOK_IDS, type Adjustments } from '../adjust';
import { CURVE_SAMPLES, curveNeutral, curveTable } from '../curve';
import { mixerNeutral, mixerParams } from '../hsl';
import { lightNeutral, wbGains } from '../light';
import type { GraphNode } from './graph';
import type { GpuProgram } from './types';

/*
 * The colour settings as GPU programs (P0.4): today's looks (engine/photo.ts lookPixels) and sliders
 * (engine/instagram.ts adjustPixels), ported line for line so the GPU and Canvas 2D paths give the same pixels. Both
 * work in 0–255 sRGB values like the CPU code, and round to 8 bits after the look, where the CPU stores its result
 * before the sliders run. Keep each pair of shaders in step with the CPU functions; the self-test compares them.
 */

/**
 * u[0].x = look index = position in LOOK_IDS: 0 none, 1 vivid, 2 warm, 3 cool, 4 bw, 5 tinted, 6 vintage. u[0].y = 1 keeps
 * the result unrounded, for when the light step follows (as lookLightPixels() rounds once, after both).
 */
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
  o = clamp(o, 0.0, 255.0);
  return vec4((u[0].y > 0.5 ? o : floor(o + 0.5)) / 255.0, c.a);
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
  let q = clamp(o, vec3f(0.0), vec3f(255.0));
  return vec4f(select(floor(q + 0.5), q, P.u[0].y > 0.5) / 255.0, c.a);
}`,
};

/**
 * Light and white balance (P1.1), mirroring engine/light.ts lightPixel(): sRGB to linear, white balance and exposure as
 * channel gains, the tone sliders on brightness with the three channels scaled together, back to sRGB, rounded to 8
 * bits unless a later step follows. u[0] = (gain r, g, b with exposure, 1 when a tone slider is set); u[1] = (highlights,
 * shadows, whites, blacks) / 100; u[2].x = 1 keeps the result unrounded.
 */
export const LIGHT_PROGRAM: GpuProgram = {
  id: 'light',
  inputs: 1,
  uniforms: 3,
  glsl: `
float lin(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float srgb(float c) { return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(max(c, 0.0), 1.0 / 2.4) - 0.055; }
float sm(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  vec3 l = vec3(lin(c.r), lin(c.g), lin(c.b)) * u[0].xyz;
  if (u[0].w > 0.5) {
    float y = dot(l, vec3(0.2126, 0.7152, 0.0722));
    if (y > 1e-6) {
      float p = srgb(y);
      float d = u[1].x * 0.3 * sm(0.25, 1.0, p) * (1.0 - p * 0.5) + u[1].y * 0.3 * (1.0 - sm(0.0, 0.75, p)) * (0.5 + p)
        + u[1].z * 0.2 * sm(0.6, 1.0, p) + u[1].w * 0.2 * (1.0 - sm(0.0, 0.4, p));
      l *= lin(max(0.0, p + d)) / y;
    }
  }
  vec3 o = vec3(srgb(l.r), srgb(l.g), srgb(l.b)) * 255.0;
  o = clamp(o, 0.0, 255.0);
  return vec4((u[2].x > 0.5 ? o : floor(o + 0.5)) / 255.0, c.a);
}`,
  wgsl: `
fn lin(c: f32) -> f32 { return select(pow((c + 0.055) / 1.055, 2.4), c / 12.92, c <= 0.04045); }
fn srgb(c: f32) -> f32 { return select(1.055 * pow(max(c, 0.0), 1.0 / 2.4) - 0.055, c * 12.92, c <= 0.0031308); }
fn sm(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  var l = vec3f(lin(c.r), lin(c.g), lin(c.b)) * P.u[0].xyz;
  if (P.u[0].w > 0.5) {
    let y = dot(l, vec3f(0.2126, 0.7152, 0.0722));
    if (y > 1e-6) {
      let p = srgb(y);
      let k = P.u[1];
      let d = k.x * 0.3 * sm(0.25, 1.0, p) * (1.0 - p * 0.5) + k.y * 0.3 * (1.0 - sm(0.0, 0.75, p)) * (0.5 + p)
        + k.z * 0.2 * sm(0.6, 1.0, p) + k.w * 0.2 * (1.0 - sm(0.0, 0.4, p));
      l = l * (lin(max(0.0, p + d)) / y);
    }
  }
  let o = vec3f(srgb(l.r), srgb(l.g), srgb(l.b)) * 255.0;
  let q = clamp(o, vec3f(0.0), vec3f(255.0));
  return vec4f(select(floor(q + 0.5), q, P.u[2].x > 0.5) / 255.0, c.a);
}`,
};

/** The light step's uniforms, with the same gains as lookLightPixels(). */
export function lightUniforms(a: Adjustments): Float32Array {
  const g = wbGains(a.temperature, a.tint),
    ex = 2 ** a.exposure,
    tone = a.highlights || a.shadows || a.whites || a.blacks ? 1 : 0;
  return new Float32Array([g[0] * ex, g[1] * ex, g[2] * ex, tone, a.highlights / 100, a.shadows / 100, a.whites / 100, a.blacks / 100, 0, 0, 0, 0]);
}

/** Index of the "keep unrounded" flag in each chain program's uniforms, set on every step of the chain but the last. */
const UNROUNDED: Record<string, number> = { look: 1, light: 8, curve: 0, mixer: 0 };

/**
 * The tone curve (P1.2): the 129-sample tables of engine/curve.ts curveTable() in u[1…], red then green then blue, read
 * with linear interpolation exactly as readTable() does. u[0].x = 1 keeps the result unrounded.
 */
export const CURVE_PROGRAM: GpuProgram = {
  id: 'curve',
  inputs: 1,
  uniforms: 1 + Math.ceil((CURVE_SAMPLES * 3) / 4),
  glsl: `
float tab(int k, float v) {
  float x = clamp(v, 0.0, 1.0) * ${CURVE_SAMPLES - 1}.0;
  int i = min(${CURVE_SAMPLES - 2}, int(x));
  int a = k * ${CURVE_SAMPLES} + i;
  int b = a + 1;
  float y0 = u[1 + a / 4][a % 4];
  float y1 = u[1 + b / 4][b % 4];
  return y0 + (y1 - y0) * (x - float(i));
}
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  vec3 o = clamp(vec3(tab(0, c.r), tab(1, c.g), tab(2, c.b)) * 255.0, 0.0, 255.0);
  return vec4((u[0].x > 0.5 ? o : floor(o + 0.5)) / 255.0, c.a);
}`,
  wgsl: `
fn tab(k: i32, v: f32) -> f32 {
  let x = clamp(v, 0.0, 1.0) * ${CURVE_SAMPLES - 1}.0;
  let i = min(${CURVE_SAMPLES - 2}, i32(x));
  let a = k * ${CURVE_SAMPLES} + i;
  let b = a + 1;
  let y0 = P.u[1 + a / 4][a % 4];
  let y1 = P.u[1 + b / 4][b % 4];
  return y0 + (y1 - y0) * (x - f32(i));
}
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let o = clamp(vec3f(tab(0, c.r), tab(1, c.g), tab(2, c.b)) * 255.0, vec3f(0.0), vec3f(255.0));
  return vec4f(select(floor(o + 0.5), o, P.u[0].x > 0.5) / 255.0, c.a);
}`,
};

/**
 * The colour mixer (P1.2), mirroring engine/hsl.ts hslPixel(). u[1…6] = hue, saturation and luminance fractions for the
 * eight bands (mixerParams()); u[0].x = 1 keeps the result unrounded.
 */
export const MIXER_PROGRAM: GpuProgram = {
  id: 'mixer',
  inputs: 1,
  uniforms: 7,
  glsl: `
float prm(int i) { return u[1 + i / 4][i % 4]; }
float h2c(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
const float HUES[9] = float[9](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0, 360.0);
vec4 effect(vec2 uv) {
  vec4 c = texture(t0, uv);
  if (c.a == 0.0) return c;
  vec3 v = clamp(c.rgb, 0.0, 1.0);
  float hi = max(v.r, max(v.g, v.b)), lo = min(v.r, min(v.g, v.b)), d = hi - lo, l = (hi + lo) / 2.0;
  vec3 o = v;
  if (d > 1e-6) {
    float s = d / (1.0 - abs(2.0 * l - 1.0));
    float h = hi == v.r ? (v.g - v.b) / d + (v.g < v.b ? 6.0 : 0.0) : hi == v.g ? (v.b - v.r) / d + 2.0 : (v.r - v.g) / d + 4.0;
    h *= 60.0;
    int k = 7;
    for (int i = 0; i < 7; i++) {
      if (h < HUES[i + 1]) {
        k = i;
        break;
      }
    }
    int k1 = (k + 1) % 8;
    float t = clamp((h - HUES[k]) / (HUES[k + 1] - HUES[k]), 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    float dh = prm(k) * (1.0 - t) + prm(k1) * t;
    float ds = prm(8 + k) * (1.0 - t) + prm(8 + k1) * t;
    float dl = prm(16 + k) * (1.0 - t) + prm(16 + k1) * t;
    float hh = mod(h + dh * 30.0, 360.0) / 360.0;
    float s2 = clamp(s * (1.0 + ds), 0.0, 1.0);
    float l2 = clamp(l + dl * 0.25 * s * (1.0 - abs(2.0 * l - 1.0)), 0.0, 1.0);
    float q = l2 < 0.5 ? l2 * (1.0 + s2) : l2 + s2 - l2 * s2;
    float p = 2.0 * l2 - q;
    o = vec3(h2c(p, q, hh + 1.0 / 3.0), h2c(p, q, hh), h2c(p, q, hh - 1.0 / 3.0));
  }
  o = clamp(o * 255.0, 0.0, 255.0);
  return vec4((u[0].x > 0.5 ? o : floor(o + 0.5)) / 255.0, c.a);
}`,
  wgsl: `
fn prm(i: i32) -> f32 { return P.u[1 + i / 4][i % 4]; }
fn h2c(p: f32, q: f32, t_in: f32) -> f32 {
  var t = t_in;
  if (t < 0.0) { t += 1.0; }
  if (t > 1.0) { t -= 1.0; }
  if (t < 1.0 / 6.0) { return p + (q - p) * 6.0 * t; }
  if (t < 0.5) { return q; }
  if (t < 2.0 / 3.0) { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
  return p;
}
fn hueAt(i: i32) -> f32 {
  var hs = array<f32, 9>(0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0, 360.0);
  return hs[i];
}
fn effect(uv: vec2f) -> vec4f {
  let c = textureSampleLevel(t0, smp, uv, 0.0);
  if (c.a == 0.0) { return c; }
  let v = clamp(c.rgb, vec3f(0.0), vec3f(1.0));
  let hi = max(v.r, max(v.g, v.b));
  let lo = min(v.r, min(v.g, v.b));
  let d = hi - lo;
  let l = (hi + lo) / 2.0;
  var o = v;
  if (d > 1e-6) {
    let s = d / (1.0 - abs(2.0 * l - 1.0));
    var h: f32;
    if (hi == v.r) { h = (v.g - v.b) / d + select(0.0, 6.0, v.g < v.b); }
    else if (hi == v.g) { h = (v.b - v.r) / d + 2.0; }
    else { h = (v.r - v.g) / d + 4.0; }
    h *= 60.0;
    var k = 7;
    for (var i = 0; i < 7; i++) {
      if (h < hueAt(i + 1)) {
        k = i;
        break;
      }
    }
    let k1 = (k + 1) % 8;
    var t = clamp((h - hueAt(k)) / (hueAt(k + 1) - hueAt(k)), 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    let dh = prm(k) * (1.0 - t) + prm(k1) * t;
    let ds = prm(8 + k) * (1.0 - t) + prm(8 + k1) * t;
    let dl = prm(16 + k) * (1.0 - t) + prm(16 + k1) * t;
    var hh = (h + dh * 30.0) - 360.0 * floor((h + dh * 30.0) / 360.0);
    hh = hh / 360.0;
    let s2 = clamp(s * (1.0 + ds), 0.0, 1.0);
    let l2 = clamp(l + dl * 0.25 * s * (1.0 - abs(2.0 * l - 1.0)), 0.0, 1.0);
    let q = select(l2 + s2 - l2 * s2, l2 * (1.0 + s2), l2 < 0.5);
    let p = 2.0 * l2 - q;
    o = vec3f(h2c(p, q, hh + 1.0 / 3.0), h2c(p, q, hh), h2c(p, q, hh - 1.0 / 3.0));
  }
  let w = clamp(o * 255.0, vec3f(0.0), vec3f(255.0));
  return vec4f(select(floor(w + 0.5), w, P.u[0].x > 0.5) / 255.0, c.a);
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

/** The nodes for a picture's colour settings: the look, light and white balance, then the older sliders, each only when it changes something. */
export function colourNodes(a: Adjustments): GraphNode[] {
  if (colourNeutral(a)) return [];
  // The chain (look, light, curve, mixer) rounds once, after its last step, as chain.ts chainPixels() does.
  const nodes: GraphNode[] = [];
  if (a.look !== 'none') nodes.push({ program: LOOK_PROGRAM, uniforms: new Float32Array([LOOK_IDS.indexOf(a.look), 0, 0, 0]) });
  if (!lightNeutral(a)) nodes.push({ program: LIGHT_PROGRAM, uniforms: lightUniforms(a) });
  if (!curveNeutral(a.curve)) {
    const u = new Float32Array(CURVE_PROGRAM.uniforms * 4);
    u.set(curveTable(a.curve), 4);
    nodes.push({ program: CURVE_PROGRAM, uniforms: u });
  }
  if (!mixerNeutral(a.mixer)) {
    const u = new Float32Array(MIXER_PROGRAM.uniforms * 4);
    u.set(mixerParams(a.mixer), 4);
    nodes.push({ program: MIXER_PROGRAM, uniforms: u });
  }
  for (const n of nodes.slice(0, -1)) n.uniforms[UNROUNDED[n.program.id]] = 1;
  if (a.brightness || a.contrast || a.saturation || a.warmth) nodes.push({ program: ADJUST_PROGRAM, uniforms: adjustUniforms(a) });
  return nodes;
}
