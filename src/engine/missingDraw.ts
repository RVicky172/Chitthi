/*
 * The picture drawn in place of a file that is missing (408 D4): grey diagonal hatching with the file's name, so a
 * reopened project shows where the clip or photo was. It is never exported: the export is refused while files are
 * missing (engine/mediaFile.ts, missingFilesMessage).
 */

/** The placeholder's size: 16:9 (a missing photo uses its own size). */
const WIDTH = 1280;
const HEIGHT = 720;

/** One canvas per name and size, made once: the stage asks for it on every frame. */
const made = new Map<string, HTMLCanvasElement>();

/**
 * The placeholder for a missing file.
 * @param name the file's name, written in the middle
 * @param width the picture's width in pixels (a missing photo's own; 16:9 by default)
 * @param height its height in pixels
 * @returns the canvas
 */
export function missingPicture(name: string, width = WIDTH, height = HEIGHT): HTMLCanvasElement {
  const key = `${width}x${height}:${name}`;
  const kept = made.get(key);
  if (kept) return kept;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext('2d');
  if (context) drawMissing(context, canvas.width, canvas.height, name);
  made.set(key, canvas);
  return canvas;
}

/**
 * Draws the hatching and the name.
 * @param context the canvas's context
 * @param width its width in pixels
 * @param height its height in pixels
 * @param name the file's name
 */
function drawMissing(context: CanvasRenderingContext2D, width: number, height: number, name: string): void {
  context.fillStyle = '#2b2b30';
  context.fillRect(0, 0, width, height);
  const gap = Math.max(12, Math.round(Math.min(width, height) / 24));
  context.strokeStyle = '#45454d';
  context.lineWidth = gap / 3;
  context.beginPath();
  for (let offset = -height; offset < width; offset += gap) {
    context.moveTo(offset, height);
    context.lineTo(offset + height, 0);
  }
  context.stroke();
  const size = Math.max(14, Math.round(Math.min(width, height) / 18));
  context.font = `600 ${size}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = `Missing: ${name}`;
  const textWidth = Math.min(width * 0.9, context.measureText(label).width);
  context.fillStyle = 'rgba(20, 20, 24, 0.85)';
  context.fillRect((width - textWidth) / 2 - size, height / 2 - size, textWidth + size * 2, size * 2);
  context.fillStyle = '#f2f2f5';
  context.fillText(label, width / 2, height / 2, width * 0.9);
}
