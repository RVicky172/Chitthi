import type { GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The render graph (specs/vision/editor-implementation.md, P0.3). An edit becomes a list of nodes, each one program
 * with its uniforms, built by pure functions (gpu/colour.ts) that can be tested without a GPU. runNodes() runs them in
 * order on the device, ping-ponging between pooled textures so a video preview doesn't allocate every frame.
 * Phase 0 graphs are a straight line; masks (Phase 1) and transitions (Phase 2) add branches.
 */

/**
 * A texture a node reads besides the pictures of the graph: a LUT's numbers (rgba) or an image such as a mask. Built
 * by pure code like the rest of a node; the pool uploads it once per key and keeps it, so a video doesn't upload it
 * every frame.
 */
export interface DataInput {
  /** Same key, same contents: a LUT's id, a mask raster's key. */
  key: string;
  width: number;
  height: number;
  rgba?: Float32Array;
  image?: TexImageSource;
  /** One byte per pixel: a mask. */
  r8?: Uint8Array;
}

/** What a node reads: the node just before it, the graph's input, the output of an earlier node (its index), or data. */
export type NodeInput = 'prev' | 'source' | number | DataInput;

/** One step of a render graph. */
export interface GraphNode {
  program: GpuProgram;
  /** program.uniforms × 4 floats. */
  uniforms: Float32Array;
  /** Its inputs in order, one per program input; by default the previous node's output. */
  inputs?: readonly NodeInput[];
}

/** Spare render targets kept per size. */
export const SPARES = 6;

/** Data textures kept, most recently used last: a LUT per picture and a mask each, for the masks a photo may have. */
export const DATA_KEPT = 12;

/** Render targets kept for reuse, by size, and data textures by key. One pool per device. */
export class TexturePool {
  private free = new Map<string, GpuTexture[]>();
  private kept = new Map<string, GpuTexture>();
  private readonly device: GpuDevice;

  /**
   * A pool for a device.
   * @param device the device its textures belong to
   */
  constructor(device: GpuDevice) {
    this.device = device;
  }

  /**
   * A render target of a size: a spare one, or a new one.
   * @param width px
   * @param height px
   * @returns the target
   */
  take(width: number, height: number): GpuTexture {
    return this.free.get(`${width}x${height}`)?.pop() ?? this.device.target(width, height);
  }

  /**
   * Gives a render target back, to reuse (or frees it when enough of its size are spare).
   * @param texture the target
   */
  give(texture: GpuTexture): void {
    const size = `${texture.width}x${texture.height}`;
    const list = this.free.get(size) ?? [];
    // Enough for the busiest graph (a picture, a blur in two passes and the haze map at once) to run frame after frame
    // without allocating; more would only hold memory.
    if (list.length >= SPARES) this.device.release(texture);
    else this.free.set(size, [...list, texture]);
  }

  /**
   * The texture for a data input, uploaded on first use; the least recently used goes once DATA_KEPT are held.
   * @param input the data input
   * @returns its texture
   * @throws when the input has no contents
   */
  data(input: DataInput): GpuTexture {
    let texture = this.kept.get(input.key);
    if (texture) this.kept.delete(input.key);
    else if (input.rgba) texture = this.device.uploadData(input.rgba, input.width, input.height);
    else if (input.r8) texture = this.device.uploadMask(input.r8, input.width, input.height);
    else if (input.image) texture = this.device.upload(input.image, input.width, input.height);
    else throw new Error(`data input ${input.key} has no contents`);
    this.kept.set(input.key, texture);
    for (const [key, old] of this.kept) {
      if (this.kept.size <= DATA_KEPT) break;
      this.device.release(old);
      this.kept.delete(key);
    }
    return texture;
  }

  /** Frees every texture the pool holds. */
  clear(): void {
    for (const list of this.free.values()) for (const texture of list) this.device.release(texture);
    this.free.clear();
    for (const texture of this.kept.values()) this.device.release(texture);
    this.kept.clear();
  }
}

/** A node's input, resolved: an earlier node's index (-1 for the graph's input) or a data texture. */
type ResolvedInput = number | GpuTexture;

/**
 * A node's input, resolved.
 * @param input the input as the node names it
 * @param index the node's index
 * @param pool the pool that holds data textures
 * @returns a node index (-1 for the graph's input) or a data texture
 */
function resolveInput(input: NodeInput, index: number, pool: TexturePool): ResolvedInput {
  if (input === 'prev') return index - 1;
  if (input === 'source') return -1;
  return typeof input === 'number' ? input : pool.data(input);
}

/**
 * The last node that reads each node's output.
 * @param steps the nodes
 * @param inputs each node's resolved inputs
 * @returns per node, the index of its last reader, or -1 when nothing reads it
 * @throws when a node reads a node that comes after it
 */
function lastReaders(steps: readonly GraphNode[], inputs: readonly ResolvedInput[][]): number[] {
  const lastUse = steps.map(() => -1);
  inputs.forEach((resolved, index) => {
    for (const input of resolved) {
      if (typeof input !== 'number') continue;
      if (input >= index) throw new Error(`node ${index} (${steps.at(index)?.program.id ?? ''}) reads node ${input}, which comes after it`);
      if (input >= 0) lastUse[input] = Math.max(lastUse.at(input) ?? -1, index);
    }
  });
  return lastUse;
}

/**
 * Runs the nodes over input and returns a pooled texture holding the last node's result (give it back to the pool when
 * done). With no nodes the result is a copy of the input, so callers handle one case. A node may read any earlier
 * node's output (a blur beside the picture it blurs, for sharpening); each output goes back to the pool as soon as no
 * later node needs it.
 * @param device the device
 * @param pool its texture pool
 * @param input the graph's input picture
 * @param nodes the nodes, in order
 * @returns the last node's output
 */
export function runNodes(device: GpuDevice, pool: TexturePool, input: GpuTexture, nodes: readonly GraphNode[]): GpuTexture {
  const steps = nodes.length ? nodes : [{ program: COPY_PROGRAM, uniforms: new Float32Array(4) }];
  const inputs = steps.map((node, index) => (node.inputs ?? ['prev']).map((named) => resolveInput(named, index, pool)));
  // The last node that reads each output; the final output is kept for the caller.
  const lastUse = lastReaders(steps, inputs);
  const last = steps.length - 1;
  const outputs: (GpuTexture | null)[] = steps.map(() => null);
  const outputOf = (index: number): GpuTexture => {
    const output = outputs.at(index);
    if (!output) throw new Error(`node ${index}'s output is gone`);
    return output;
  };
  steps.forEach((node, index) => {
    const resolved = inputs.at(index) ?? [];
    const output = pool.take(input.width, input.height);
    device.pass(
      node.program,
      resolved.map((reference) => {
        if (typeof reference !== 'number') return reference;
        return reference < 0 ? input : outputOf(reference);
      }),
      node.uniforms,
      output,
    );
    outputs[index] = output;
    for (const reference of resolved)
      if (typeof reference === 'number' && reference >= 0 && lastUse.at(reference) === index && reference !== last) {
        pool.give(outputOf(reference));
        outputs[reference] = null;
      }
  });
  // Outputs nobody read (they shouldn't exist, but never leak them).
  outputs.forEach((output, index) => {
    if (output && index !== last && (lastUse.at(index) ?? -1) < 0) pool.give(output);
  });
  return outputOf(last);
}
