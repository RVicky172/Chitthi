import type { GpuDevice, GpuProgram, GpuTexture } from './types';
import { COPY_PROGRAM } from './types';

/*
 * The render graph (docs/planning/EDITOR-IMPLEMENTATION.md, P0.3). An edit becomes a list of nodes, each one program
 * with its uniforms, built by pure functions (gpu/colour.ts) that can be tested without a GPU. runNodes() runs them in
 * order on the device, ping-ponging between pooled textures so a video preview doesn't allocate every frame.
 * Phase 0 graphs are a straight line; masks (Phase 1) and transitions (Phase 2) add branches.
 */

export interface GraphNode {
  program: GpuProgram;
  /** program.uniforms × 4 floats. */
  uniforms: Float32Array;
}

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
    // A couple per size covers ping-pong; more would only hold memory.
    if (list.length >= 2) this.dev.release(t);
    else this.free.set(k, [...list, t]);
  }
  clear(): void {
    for (const list of this.free.values()) for (const t of list) this.dev.release(t);
    this.free.clear();
  }
}

/**
 * Runs the nodes over input and returns a pooled texture holding the result (give it back to the pool when done).
 * With no nodes the result is a copy of the input, so callers handle one case.
 */
export function runNodes(
  dev: GpuDevice,
  pool: TexturePool,
  input: GpuTexture,
  nodes: readonly GraphNode[],
): GpuTexture {
  const steps = nodes.length ? nodes : [{ program: COPY_PROGRAM, uniforms: new Float32Array(4) }];
  let src = input,
    out: GpuTexture | null = null;
  for (const n of steps) {
    const next = pool.take(input.width, input.height);
    dev.pass(n.program, [src], n.uniforms, next);
    if (out) pool.give(out);
    out = next;
    src = next;
  }
  return out!;
}
