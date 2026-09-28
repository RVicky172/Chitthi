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
const KEEP: [number, number][] = [
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
function keepAt(h: number): number {
  for (let i = 1; i < KEEP.length; i++) {
    const [h1, k1] = KEEP[i];
    if (h <= h1) {
      const [h0, k0] = KEEP[i - 1];
      return k0 + ((h - h0) / (h1 - h0)) * (k1 - k0);
    }
  }
  return KEEP[0][1];
}

// Paper white and printed black in RGB (uncoated card is a touch warmer and darker than the screen's white).
const PAPER = [246, 243, 236],
  INK = [35, 31, 32];

/** Applies the print-colours look to a canvas in place. */
export function softProof(cv: HTMLCanvasElement): void {
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c || !cv.width || !cv.height) return;
  const img = c.getImageData(0, 0, cv.width, cv.height),
    a = img.data;
  // Hue keep factors in a small table: the loop runs for every pixel.
  const table = new Float32Array(361);
  for (let h = 0; h <= 360; h++) table[h] = keepAt(h);
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i],
      g = a[i + 1],
      b = a[i + 2];
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      chroma = max - min;
    if (chroma > 24) {
      let h: number;
      if (max === r) h = ((g - b) / chroma) % 6;
      else if (max === g) h = (b - r) / chroma + 2;
      else h = (r - g) / chroma + 4;
      h = Math.round((h * 60 + 360) % 360);
      // Only strong colours lose saturation; soft tones and skin print close to the screen.
      const t = Math.min(1, Math.max(0, (chroma - 70) / 150)),
        k = 1 - (1 - table[h]) * t;
      const grey = 0.299 * r + 0.587 * g + 0.114 * b;
      r = grey + (r - grey) * k;
      g = grey + (g - grey) * k;
      b = grey + (b - grey) * k;
    }
    // Map the full range from printed black to paper white.
    a[i] = INK[0] + (r / 255) * (PAPER[0] - INK[0]);
    a[i + 1] = INK[1] + (g / 255) * (PAPER[1] - INK[1]);
    a[i + 2] = INK[2] + (b / 255) * (PAPER[2] - INK[2]);
  }
  c.putImageData(img, 0, 0);
}
