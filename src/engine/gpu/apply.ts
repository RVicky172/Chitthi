import type { Adjustments } from '../adjust';
import { colourNodes } from './colour';
import { detailNodes } from './detail';
import { gpu, gpuPool } from './device';
import { runNodes } from './graph';

/*
 * The GPU colour step for renderIg() (P0.5): the photo, already placed on its own layer canvas, goes through the colour
 * nodes, then the detail nodes (P1.3), on the GPU and is drawn into ctx. Returns false, having drawn nothing, when there is no open device, the layer is
 * too big for it, or the GPU fails; the caller then uses the Canvas 2D path, so a frame is never lost.
 */
export function gpuColour(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  a: Adjustments,
  W: number,
  H: number,
): boolean {
  const dev = gpu();
  if (!dev || layer.width > dev.maxSize || layer.height > dev.maxSize) return false;
  const pool = gpuPool(dev);
  let input = null;
  try {
    input = dev.upload(layer, layer.width, layer.height);
    const colour = colourNodes(a),
      nodes = [...colour, ...detailNodes(a, layer.width, layer.height, colour.length)];
    const out = runNodes(dev, pool, input, nodes);
    ctx.drawImage(dev.present(out), 0, 0, W, H);
    pool.give(out);
    return true;
  } catch (e) {
    console.warn('GPU colour failed; using Canvas 2D', e);
    return false;
  } finally {
    if (input) dev.release(input);
  }
}
