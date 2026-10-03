import type { GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The WebGL2 backend of the GPU device layer (contract in gpu/types.ts). Works in every current browser, including
 * Firefox and Safari where WebGPU is missing or partial. Textures keep the picture's top row first in memory; the
 * full-frame triangle maps that row to uv.y = 0, so passes, read-back and present agree without flipping in shaders.
 */

interface GlTex extends GpuTexture {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer | null;
  float: boolean;
}

const VERTEX = `#version 300 es
uniform float flipY;
out vec2 vUv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  vUv = p * 0.5 + 0.5;
  if (flipY > 0.5) vUv.y = 1.0 - vUv.y;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const fragment = (p: GpuProgram) => `#version 300 es
precision highp float;
${Array.from({ length: p.inputs }, (_, i) => `uniform sampler2D t${i};`).join('\n')}
uniform vec4 u[${p.uniforms}];
in vec2 vUv;
out vec4 outColor;
${p.glsl}
void main() { outColor = effect(vUv); }`;

export function openWebGL2(): GpuDevice | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  let lost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    lost = true;
  });
  const floatTargets = !!gl.getExtension('EXT_color_buffer_float');
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, viewport[0], viewport[1]);
  const vao = gl.createVertexArray();

  const compile = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('WebGL2: could not create a shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost())
      throw new Error(`WebGL2 shader: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, VERTEX);

  interface Linked {
    prog: WebGLProgram;
    u: WebGLUniformLocation | null;
    flipY: WebGLUniformLocation | null;
    tex: (WebGLUniformLocation | null)[];
  }
  const programs = new Map<string, Linked>();
  const link = (p: GpuProgram): Linked => {
    const hit = programs.get(p.id);
    if (hit) return hit;
    const prog = gl.createProgram();
    if (!prog) throw new Error('WebGL2: could not create a program');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragment(p)));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost())
      throw new Error(`WebGL2 program ${p.id}: ${gl.getProgramInfoLog(prog)}`);
    const l: Linked = {
      prog,
      u: gl.getUniformLocation(prog, 'u'),
      flipY: gl.getUniformLocation(prog, 'flipY'),
      tex: Array.from({ length: p.inputs }, (_, i) => gl.getUniformLocation(prog, `t${i}`)),
    };
    programs.set(p.id, l);
    return l;
  };

  const make = (width: number, height: number, float: boolean): GlTex => {
    const tex = gl.createTexture();
    if (!tex) throw new Error('WebGL2: could not create a texture');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (float) gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
    else gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    return { width, height, tex, fbo: null, float };
  };
  const fbo = (t: GlTex) => {
    if (!t.fbo) {
      t.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    }
    return t.fbo;
  };
  const check = (w: number, h: number) => {
    if (!(w >= 1 && h >= 1 && w <= maxSize && h <= maxSize))
      throw new Error(`GPU texture ${w}×${h} is outside 1–${maxSize}`);
  };

  const draw = (
    p: GpuProgram,
    inputs: readonly GpuTexture[],
    uniforms: Float32Array,
    w: number,
    h: number,
    flipY: boolean,
  ) => {
    const l = link(p);
    gl.useProgram(l.prog);
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    for (let i = 0; i < p.inputs; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, (inputs[i] as GlTex).tex);
      gl.uniform1i(l.tex[i], i);
    }
    const u = new Float32Array(p.uniforms * 4);
    u.set(uniforms.subarray(0, u.length));
    gl.uniform4fv(l.u, u);
    gl.uniform1f(l.flipY, flipY ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const device: GpuDevice = {
    backend: 'webgl2',
    maxSize,
    get lost() {
      return lost || gl.isContextLost();
    },
    upload(src, width, height) {
      check(width, height);
      const t = make(width, height, false);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, src);
      return t;
    },
    uploadData(rgba, width, height) {
      check(width, height);
      const t = make(width, height, true);
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      // RGBA16F takes FLOAT input in WebGL2 and converts it; it is always readable, even where it can't be rendered to.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, rgba);
      return t;
    },
    uploadMask(data, width, height) {
      check(width, height);
      const tex = gl.createTexture();
      if (!tex) throw new Error('WebGL2: could not create a texture');
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, width, height);
      // Rows of one byte per pixel aren't 4-byte aligned in general.
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, data);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      return { width, height, tex, fbo: null, float: false } as GlTex;
    },
    target(width, height) {
      check(width, height);
      return make(width, height, floatTargets);
    },
    pass(program, inputs, uniforms, out) {
      if (inputs.length < program.inputs) throw new Error(`${program.id} needs ${program.inputs} inputs`);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(out as GlTex));
      draw(program, inputs, uniforms, out.width, out.height, false);
    },
    present(tex) {
      if (canvas.width !== tex.width || canvas.height !== tex.height) {
        canvas.width = tex.width;
        canvas.height = tex.height;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      // The canvas shows its bottom row first, so present flips: what the user sees is the picture the right way up.
      draw(COPY_PROGRAM, [tex], new Float32Array(4), tex.width, tex.height, true);
      return canvas;
    },
    async read(tex) {
      let t = tex as GlTex;
      const tmp = t.float ? make(t.width, t.height, false) : null;
      if (tmp) {
        device.pass(COPY_PROGRAM, [t], new Float32Array(4), tmp);
        t = tmp;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo(t));
      const out = new Uint8ClampedArray(t.width * t.height * 4);
      gl.readPixels(0, 0, t.width, t.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      if (tmp) device.release(tmp);
      return out;
    },
    release(tex) {
      const t = tex as GlTex;
      if (t.fbo) gl.deleteFramebuffer(t.fbo);
      gl.deleteTexture(t.tex);
    },
    destroy() {
      for (const l of programs.values()) gl.deleteProgram(l.prog);
      programs.clear();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      lost = true;
    },
  };
  return device;
}
