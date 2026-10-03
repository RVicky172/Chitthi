import type { GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The render graph (docs/planning/EDITOR-IMPLEMENTATION.md, P0.3). An edit becomes a list of nodes, each one program
 * with its uniforms, built by pure functions (gpu/colour.ts) that can be tested without a GPU. runNodes() runs them in
 * order on the device, ping-ponging between pooled textures so a video preview doesn't allocate every frame.
 * Phase 0 graphs are a straight line; masks (Phase 1) and transitions (Phase 2) add branches.
 */

/** What a node reads: the node just before it, the graph's input, or the output of an earlier node (its index). */
export type NodeInput = 'prev' | 'source' | number;

export interface GraphNode {
  program: GpuProgram;
  /** program.uniforms × 4 floats. */
  uniforms: Float32Array;
  /** Its inputs in order, one per program input; by default the previous node's output. */
  inputs?: readonly NodeInput[];
}

/** Spare render targets kept per size. */
export const SPARES = 6;

/** Render targets kept for reuse, by size. One pool per device. */
export class TexturePool {
  private free = new Map<string, GpuTexture[]>();
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
  clear(): void {
    for (const list of this.free.values()) for (const t of list) this.dev.release(t);
    this.free.clear();
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
  const refs = steps.map((n, i) =>
    (n.inputs ?? ['prev']).map((r): number => (r === 'prev' ? i - 1 : r === 'source' ? -1 : r)),
  );
  // The last node that reads each output; the final output is kept for the caller.
  const lastUse = steps.map(() => -1);
  refs.forEach((rs, i) =>
    rs.forEach((r) => {
      if (r >= i) throw new Error(`node ${i} (${steps[i].program.id}) reads node ${r}, which comes after it`);
      if (r >= 0) lastUse[r] = Math.max(lastUse[r], i);
    }),
  );
  const outs: (GpuTexture | null)[] = steps.map(() => null);
  steps.forEach((n, i) => {
    const out = pool.take(input.width, input.height);
    dev.pass(
      n.program,
      refs[i].map((r) => (r < 0 ? input : outs[r]!)),
      n.uniforms,
      out,
    );
    outs[i] = out;
    for (const r of refs[i])
      if (r >= 0 && lastUse[r] === i && r !== steps.length - 1) {
        pool.give(outs[r]!);
        outs[r] = null;
      }
  });
  // Outputs nobody read (they shouldn't exist, but never leak them).
  outs.forEach((t, i) => t && i !== steps.length - 1 && lastUse[i] < 0 && pool.give(t));
  return outs[steps.length - 1]!;
}
