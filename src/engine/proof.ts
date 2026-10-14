/*
 * "Print colours" preview: an approximate soft proof of how a screen design comes out on paper.
 *
 * Screens show colours (RGB) that CMYK printing can't reach: vivid blues and violets, electric greens and cyans,
 * neon pinks. A print shop converts them to the nearest printable colour, so they come out duller. This preview
 * mimics that on the screen copy only (the print files are untouched): it pulls very saturated colours in, most for
 * the hues ink reaches least, tones pure white down to paper white and lifts pure black to printed black.
 * It is a guide, not a colour-managed proof: each press and paper differs.
 */

/** How much of a fully saturated colour each hue keeps in print (0–360°, linear between the points). */
const KEEP: readonly (readonly [number, number])[] = [
  [0, 0.94], // red
  [30, 0.95], // orange
  [60, 0.93], // yellow
  [100, 0.8], // yellow-green
  [140, 0.72], // green
  [180, 0.76], // cyan
  [215, 0.74], // azure
  [245, 0.7], // blue / violet
  [285, 0.8], // purple
  [320, 0.84], // magenta / pink
  [360, 0.94],
];
/**
 * How much saturation a hue keeps in print.
 * @param hue 0–360°
 * @returns 0–1, linear between the points of KEEP
 */
function keepAt(hue: number): number {
  for (let index = 1; index < KEEP.length; index++) {
    const [toHue, toKeep] = KEEP[index] ?? [360, 0.94];
    if (hue <= toHue) {
      const [fromHue, fromKeep] = KEEP[index - 1] ?? [0, 0.94];
      return fromKeep + ((hue - fromHue) / (toHue - fromHue)) * (toKeep - fromKeep);
    }
  }
  return KEEP[0]?.[1] ?? 0.94;
}

/** Paper white in RGB (uncoated card is a touch warmer and darker than the screen's white). */
const PAPER = { red: 246, green: 243, blue: 236 };
/** Printed black in RGB. */
const INK = { red: 35, green: 31, blue: 32 };

/**
 * Applies the print-colours look to a canvas in place. The hue maths stay inline: the loop runs for every pixel, and
 * a call per pixel cost about 9 %.
 * @param canvas the screen copy of the design
 */
export function softProof(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !canvas.width || !canvas.height) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  // Hue keep factors in a small table.
  const keepByHue = new Float32Array(361);
  for (let hue = 0; hue <= 360; hue++) keepByHue[hue] = keepAt(hue);
  const redRange = PAPER.red - INK.red;
  const greenRange = PAPER.green - INK.green;
  const blueRange = PAPER.blue - INK.blue;
  for (let index = 0; index < pixels.length; index += 4) {
    let red = pixels[index] ?? 0;
    let green = pixels[index + 1] ?? 0;
    let blue = pixels[index + 2] ?? 0;
    const max = Math.max(red, green, blue);
    const chroma = max - Math.min(red, green, blue);
    if (chroma > 24) {
      let sector: number;
      if (max === red) sector = ((green - blue) / chroma) % 6;
      else if (max === green) sector = (blue - red) / chroma + 2;
      else sector = (red - green) / chroma + 4;
      const hue = Math.round((sector * 60 + 360) % 360);
      // Only strong colours lose saturation; soft tones and skin print close to the screen.
      const strength = Math.min(1, Math.max(0, (chroma - 70) / 150));
      const keep = 1 - (1 - (keepByHue[hue] ?? 1)) * strength;
      const grey = 0.299 * red + 0.587 * green + 0.114 * blue;
      red = grey + (red - grey) * keep;
      green = grey + (green - grey) * keep;
      blue = grey + (blue - grey) * keep;
    }
    // Map the full range from printed black to paper white.
    pixels[index] = INK.red + (red / 255) * redRange;
    pixels[index + 1] = INK.green + (green / 255) * greenRange;
    pixels[index + 2] = INK.blue + (blue / 255) * blueRange;
  }
  context.putImageData(image, 0, 0);
}
