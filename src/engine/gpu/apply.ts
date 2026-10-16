import type { Adjustments } from '../adjust';
import type { FrameMask } from '../maskPlace';
import { colourNodes } from './colour';
import { detailNodes } from './detail';
import { gpu, gpuPool } from './device';
import { runNodes, type GraphNode, type NodeInput } from './graph';
import { maskNodes } from './mask';

/*
 * The GPU colour step for renderIg() (P0.5): the photo, already placed on its own layer canvas, goes through the colour
 * nodes, then the detail nodes (P1.3), then each mask's nodes (P1.6), on the GPU, and is drawn into the canvas.
 */

/** A mask with its own colour settings. */
export interface AdjustedMask {
  adjust: Adjustments;
  mask: FrameMask;
}

/**
 * Runs the photo's colour, detail and mask nodes on the GPU and draws the result.
 * @param context the canvas to draw into
 * @param layer the photo, placed on its own layer canvas
 * @param adjust the photo's colour and detail settings
 * @param width the drawn width, px
 * @param height the drawn height, px
 * @param masks the masks, in order
 * @returns true when drawn; false, having drawn nothing, when there is no open device, the layer is too big for it, or
 * the GPU fails (the caller then uses the Canvas 2D path, so a frame is never lost)
 */
export function gpuColour(context: CanvasRenderingContext2D, layer: HTMLCanvasElement, adjust: Adjustments, width: number, height: number, masks: readonly AdjustedMask[] = []): boolean {
  const device = gpu();
  if (!device || layer.width > device.maxSize || layer.height > device.maxSize) return false;
  const pool = gpuPool(device);
  let input = null;
  try {
    input = device.upload(layer, layer.width, layer.height);
    const colour = colourNodes(adjust);
    const nodes: GraphNode[] = [...colour, ...detailNodes(adjust, layer.width, layer.height, colour.length)];
    let picture: NodeInput = nodes.length ? nodes.length - 1 : 'source';
    for (const { adjust: maskAdjust, mask } of masks) picture = maskNodes(nodes, picture, maskAdjust, mask, layer.width, layer.height);
    const output = runNodes(device, pool, input, nodes);
    context.drawImage(device.present(output), 0, 0, width, height);
    pool.give(output);
    return true;
  } catch (error) {
    console.warn('GPU colour failed; using Canvas 2D', error);
    return false;
  } finally {
    if (input) device.release(input);
  }
}
