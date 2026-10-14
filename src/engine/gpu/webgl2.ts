import type { GpuBackend, GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The WebGL2 backend of the GPU device layer (contract in gpu/types.ts). Works in every current browser, including
 * Firefox and Safari where WebGPU is missing or partial. Textures keep the picture's top row first in memory; the
 * full-frame triangle maps that row to uv.y = 0, so passes, read-back and present agree without flipping in shaders.
 */

/** A WebGL2 texture, with the framebuffer that renders into it (made on first use). */
interface GlTex extends GpuTexture {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer | null;
  /** Holds 16-bit floats (else 8-bit). */
  float: boolean;
}

/** A linked program and its uniform locations. */
interface Linked {
  prog: WebGLProgram;
  u: WebGLUniformLocation | null;
  flipY: WebGLUniformLocation | null;
  tex: (WebGLUniformLocation | null)[];
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

/**
 * A program's fragment shader: its inputs and uniforms declared around its GLSL effect.
 * @param program the program
 * @returns GLSL ES 3.0
 */
const fragment = (program: GpuProgram): string => `#version 300 es
precision highp float;
${Array.from({ length: program.inputs }, (_, index) => `uniform sampler2D t${index};`).join('\n')}
uniform vec4 u[${program.uniforms}];
in vec2 vUv;
out vec4 outColor;
${program.glsl}
void main() { outColor = effect(vUv); }`;

/**
 * A WebGL2 texture behind a device texture.
 * @param texture a texture this backend made
 * @returns it, typed
 */
const glTex = (texture: GpuTexture): GlTex => texture as GlTex;

/**
 * Sets a bound texture's filtering (linear) and edges (clamped).
 * @param gl the context
 */
function textureParameters(gl: WebGL2RenderingContext): void {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/**
 * A new texture name (null when the context is lost, whatever the type says).
 * @param gl the context
 * @returns the texture
 * @throws when there is none
 */
function newTexture(gl: WebGL2RenderingContext): WebGLTexture {
  // The DOM types say never null, but a lost context returns null.
  const texture = gl.createTexture() as WebGLTexture | null;
  if (!texture) throw new Error('WebGL2: could not create a texture');
  return texture;
}

/** The WebGL2 device: one context on its own canvas, programs linked on first use. */
class WebGL2Device implements GpuDevice {
  readonly backend: GpuBackend = 'webgl2';
  readonly maxSize: number;
  readonly floatTargets: boolean;
  private contextLost = false;
  private readonly vao: WebGLVertexArrayObject | null;
  private readonly vertexShader: WebGLShader;
  private readonly programs = new Map<string, Linked>();

  /**
   * A device on a context.
   * @param canvas the context's canvas, which present() shows pictures on
   * @param gl the context
   */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
  ) {
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextLost = true;
    });
    this.floatTargets = !!gl.getExtension('EXT_color_buffer_float');
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, viewport.at(0) ?? 0, viewport.at(1) ?? 0);
    this.vao = gl.createVertexArray();
    this.vertexShader = this.compile(gl.VERTEX_SHADER, VERTEX);
  }

  /** @returns true once the browser has taken the context away */
  get lost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }

  /**
   * Compiles a shader.
   * @param type vertex or fragment
   * @param source the GLSL
   * @returns the shader
   * @throws when it doesn't compile (and the context isn't lost)
   */
  private compile(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('WebGL2: could not create a shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`WebGL2 shader: ${gl.getShaderInfoLog(shader) ?? ''}`);
    return shader;
  }

  /**
   * A program, linked on first use and cached by its id.
   * @param program the program
   * @returns it, linked, with its uniform locations
   */
  private link(program: GpuProgram): Linked {
    const hit = this.programs.get(program.id);
    if (hit) return hit;
    const { gl } = this;
    // The DOM types say never null, but a lost context returns null.
    const linked = gl.createProgram() as WebGLProgram | null;
    if (!linked) throw new Error('WebGL2: could not create a program');
    gl.attachShader(linked, this.vertexShader);
    gl.attachShader(linked, this.compile(gl.FRAGMENT_SHADER, fragment(program)));
    gl.linkProgram(linked);
    if (!gl.getProgramParameter(linked, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`WebGL2 program ${program.id}: ${gl.getProgramInfoLog(linked) ?? ''}`);
    const entry: Linked = {
      prog: linked,
      u: gl.getUniformLocation(linked, 'u'),
      flipY: gl.getUniformLocation(linked, 'flipY'),
      tex: Array.from({ length: program.inputs }, (_, index) => gl.getUniformLocation(linked, `t${index}`)),
    };
    this.programs.set(program.id, entry);
    return entry;
  }

  /**
   * A new RGBA texture.
   * @param width px
   * @param height px
   * @param float 16-bit floats (else 8-bit)
   * @returns the texture
   */
  private make(width: number, height: number, float: boolean): GlTex {
    const { gl } = this;
    const tex = newTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    textureParameters(gl);
    if (float) gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height);
    else gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    return { width, height, tex, fbo: null, float };
  }

  /**
   * A texture's framebuffer, made on first use.
   * @param texture the texture
   * @returns its framebuffer
   */
  private framebuffer(texture: GlTex): WebGLFramebuffer | null {
    const { gl } = this;
    if (!texture.fbo) {
      texture.fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, texture.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture.tex, 0);
    }
    return texture.fbo;
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
   * Draws a program's full-frame triangle into the bound framebuffer.
   * @param program the program
   * @param inputs its input textures
   * @param uniforms its uniforms
   * @param width the viewport's width
   * @param height the viewport's height
   * @param flipY flip the picture (when drawing to the canvas)
   */
  private draw(program: GpuProgram, inputs: readonly GpuTexture[], uniforms: Float32Array, width: number, height: number, flipY: boolean): void {
    const { gl } = this;
    const linked = this.link(program);
    gl.useProgram(linked.prog);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    for (let index = 0; index < program.inputs; index++) {
      gl.activeTexture(gl.TEXTURE0 + index);
      const input = inputs.at(index);
      gl.bindTexture(gl.TEXTURE_2D, input ? glTex(input).tex : null);
      gl.uniform1i(linked.tex.at(index) ?? null, index);
    }
    const values = new Float32Array(program.uniforms * 4);
    values.set(uniforms.subarray(0, values.length));
    gl.uniform4fv(linked.u, values);
    gl.uniform1f(linked.flipY, flipY ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Sets the unpack state for straight-alpha uploads, top row first.
   * @param texture the texture to upload into, bound here
   */
  private bindForUpload(texture: GlTex): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, texture.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  upload(src: TexImageSource, width: number, height: number): GpuTexture {
    this.check(width, height);
    const texture = this.make(width, height, false);
    this.bindForUpload(texture);
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, src);
    return texture;
  }

  uploadData(rgba: Float32Array, width: number, height: number): GpuTexture {
    this.check(width, height);
    const texture = this.make(width, height, true);
    this.bindForUpload(texture);
    // RGBA16F takes FLOAT input in WebGL2 and converts it; it is always readable, even where it can't be rendered to.
    this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, width, height, this.gl.RGBA, this.gl.FLOAT, rgba);
    return texture;
  }

  uploadMask(data: Uint8Array, width: number, height: number): GpuTexture {
    this.check(width, height);
    const { gl } = this;
    const tex = newTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    textureParameters(gl);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, width, height);
    // Rows of one byte per pixel aren't 4-byte aligned in general.
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    const texture: GlTex = { width, height, tex, fbo: null, float: false };
    return texture;
  }

  target(width: number, height: number): GpuTexture {
    this.check(width, height);
    return this.make(width, height, this.floatTargets);
  }

  pass(program: GpuProgram, inputs: readonly GpuTexture[], uniforms: Float32Array, out: GpuTexture): void {
    if (inputs.length < program.inputs) throw new Error(`${program.id} needs ${program.inputs} inputs`);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer(glTex(out)));
    this.draw(program, inputs, uniforms, out.width, out.height, false);
  }

  present(tex: GpuTexture): HTMLCanvasElement {
    const { canvas } = this;
    if (canvas.width !== tex.width || canvas.height !== tex.height) {
      canvas.width = tex.width;
      canvas.height = tex.height;
    }
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    // The canvas shows its bottom row first, so present flips: what the user sees is the picture the right way up.
    this.draw(COPY_PROGRAM, [tex], new Float32Array(4), tex.width, tex.height, true);
    return canvas;
  }

  /**
   * Reads a texture back as 8-bit RGBA, through an 8-bit copy when it holds floats.
   * @param tex the texture
   * @returns the pixels, top row first
   */
  private readBytes(tex: GpuTexture): Uint8ClampedArray {
    const { gl } = this;
    let texture = glTex(tex);
    const copy = texture.float ? this.make(texture.width, texture.height, false) : null;
    if (copy) {
      this.pass(COPY_PROGRAM, [texture], new Float32Array(4), copy);
      texture = copy;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer(texture));
    const out = new Uint8ClampedArray(texture.width * texture.height * 4);
    gl.readPixels(0, 0, texture.width, texture.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
    if (copy) this.release(copy);
    return out;
  }

  read(tex: GpuTexture): Promise<Uint8ClampedArray> {
    try {
      return Promise.resolve(this.readBytes(tex));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async readFloat(tex: GpuTexture): Promise<Float32Array> {
    const texture = glTex(tex);
    if (!texture.float) return Float32Array.from(await this.read(tex), (value) => value / 255);
    // EXT_color_buffer_float lets a float framebuffer be read as floats.
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer(texture));
    const out = new Float32Array(texture.width * texture.height * 4);
    gl.readPixels(0, 0, texture.width, texture.height, gl.RGBA, gl.FLOAT, out);
    return out;
  }

  release(tex: GpuTexture): void {
    const texture = glTex(tex);
    if (texture.fbo) this.gl.deleteFramebuffer(texture.fbo);
    this.gl.deleteTexture(texture.tex);
  }

  destroy(): void {
    for (const linked of this.programs.values()) this.gl.deleteProgram(linked.prog);
    this.programs.clear();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.contextLost = true;
  }
}

/**
 * Opens a WebGL2 device on a canvas of its own.
 * @returns the device, or null when this browser has no WebGL2
 */
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
  return new WebGL2Device(canvas, gl);
}
