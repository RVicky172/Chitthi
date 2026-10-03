import type { GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The render graph (docs/planning/EDITOR-IMPLEMENTATION.md, P0.3). An edit becomes a list of nodes, each one program
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
  private readonly dev: GpuDevice;
  constructor(dev: GpuDevice) {
    this.dev = dev;
  }
  take(width: number, height: number): GpuTexture {
    return this.free.get(`${width}x${height}`)?.pop() ?? this.dev.target(width, height);
  }
  give(t: GpuTexture): void {
    const k = `${t.width}x${t.height}`;
    const list = this.free.get(k) ?? [];
    // Enough for the busiest graph (a picture, a blur in two passes and the haze map at once) to run frame after frame
    // without allocating; more would only hold memory.
    if (list.length >= SPARES) this.dev.release(t);
    else this.free.set(k, [...list, t]);
  }
  /** The texture for a data input, uploaded on first use; the least recently used goes once DATA_KEPT are held. */
  data(d: DataInput): GpuTexture {
    let t = this.kept.get(d.key);
    if (t) this.kept.delete(d.key);
    else if (d.rgba) t = this.dev.uploadData(d.rgba, d.width, d.height);
    else if (d.r8) t = this.dev.uploadMask(d.r8, d.width, d.height);
    else if (d.image) t = this.dev.upload(d.image, d.width, d.height);
    else throw new Error(`data input ${d.key} has no contents`);
    this.kept.set(d.key, t);
    for (const [k, old] of this.kept) {
      if (this.kept.size <= DATA_KEPT) break;
      this.dev.release(old);
      this.kept.delete(k);
    }
    return t;
  }
  clear(): void {
    for (const list of this.free.values()) for (const t of list) this.dev.release(t);
    this.free.clear();
    for (const t of this.kept.values()) this.dev.release(t);
    this.kept.clear();
  }
}

/**
 * Runs the nodes over input and returns a pooled texture holding the last node's result (give it back to the pool when
 * done). With no nodes the result is a copy of the input, so callers handle one case. A node may read any earlier
 * node's output (a blur beside the picture it blurs, for sharpening); each output goes back to the pool as soon as no
 * later node needs it.
 */
export function runNodes(
  dev: GpuDevice,
  pool: TexturePool,
  input: GpuTexture,
  nodes: readonly GraphNode[],
): GpuTexture {
  const steps = nodes.length ? nodes : [{ program: COPY_PROGRAM, uniforms: new Float32Array(4) }];
  // Each input as a node index (-1 for the graph's input) or a data texture.
  const refs = steps.map((n, i) =>
    (n.inputs ?? ['prev']).map((r): number | GpuTexture => (r === 'prev' ? i - 1 : r === 'source' ? -1 : typeof r === 'number' ? r : pool.data(r))),
  );
  // The last node that reads each output; the final output is kept for the caller.
  const lastUse = steps.map(() => -1);
  refs.forEach((rs, i) =>
    rs.forEach((r) => {
      if (typeof r !== 'number') return;
      if (r >= i) throw new Error(`node ${i} (${steps[i].program.id}) reads node ${r}, which comes after it`);
      if (r >= 0) lastUse[r] = Math.max(lastUse[r], i);
    }),
  );
  const outs: (GpuTexture | null)[] = steps.map(() => null);
  steps.forEach((n, i) => {
    const out = pool.take(input.width, input.height);
    dev.pass(
      n.program,
      refs[i].map((r) => (typeof r !== 'number' ? r : r < 0 ? input : outs[r]!)),
      n.uniforms,
      out,
    );
    outs[i] = out;
    for (const r of refs[i])
      if (typeof r === 'number' && r >= 0 && lastUse[r] === i && r !== steps.length - 1) {
        pool.give(outs[r]!);
        outs[r] = null;
      }
  });
  // Outputs nobody read (they shouldn't exist, but never leak them).
  outs.forEach((t, i) => t && i !== steps.length - 1 && lastUse[i] < 0 && pool.give(t));
  return outs[steps.length - 1]!;
}
