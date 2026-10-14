import type { Photo } from '../types';

/** Colour moods for the made-up sample photos: sky top, sky bottom, sun, three hill layers, water. */
const MOODS = [
  ['#7dd3fc', '#fde68a', '#fff7cc', '#0e7490', '#155e75', '#083344', '#38bdf8'],
  ['#fda4af', '#fed7aa', '#fffbeb', '#9d174d', '#6b213f', '#3b0d24', '#fb7185'],
  ['#a5f3fc', '#e0f2fe', '#ffffff', '#15803d', '#166534', '#052e16', '#67e8f9'],
  ['#c4b5fd', '#fbcfe8', '#fff1f2', '#4c1d95', '#2e1065', '#1e1b4b', '#a78bfa'],
];

/** A hill's shape: its base height and wave, shares of the picture. */
interface Hill {
  base: number;
  amplitude: number;
  frequency: number;
  phase: number;
  colour: string;
}

/**
 * Paints a hill: two sine waves over a base line, filled to the bottom.
 * @param ctx the picture's context
 * @param width pixels
 * @param height pixels
 * @param hill the hill
 */
function paintHill(ctx: CanvasRenderingContext2D, width: number, height: number, hill: Hill): void {
  const { base, amplitude, frequency, phase } = hill;
  ctx.fillStyle = hill.colour;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 8) {
    ctx.lineTo(
      x,
      height * base - Math.sin(x / (width / frequency) + phase) * height * amplitude - Math.sin(x / (width / (frequency * 2.7)) + phase * 2) * height * amplitude * 0.35,
    );
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

/**
 * A painted landscape used as a stand-in photo on the landing page, so product previews come from the real
 * renderer without shipping any image files.
 * @param mood which colours (cycles through MOODS)
 * @param width pixels
 * @param height pixels
 * @returns the photo
 * @throws {Error} when no 2D context can be made
 */
export function samplePhoto(mood: number, width = 900, height = 640): Photo {
  const [sky1 = '', sky2 = '', sun = '', hill1 = '', hill2 = '', hill3 = '', water = ''] = MOODS[mood % MOODS.length] ?? [];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.7);
  sky.addColorStop(0, sky1);
  sky.addColorStop(1, sky2);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * 0.68, height * 0.42, 0, width * 0.68, height * 0.42, height * 0.5);
  glow.addColorStop(0, sun);
  glow.addColorStop(0.18, sun);
  glow.addColorStop(0.2, 'rgba(255,255,255,.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  paintHill(ctx, width, height, { base: 0.6, amplitude: 0.07, frequency: 1.3, phase: mood, colour: hill1 });
  paintHill(ctx, width, height, { base: 0.7, amplitude: 0.06, frequency: 2.1, phase: mood + 1.7, colour: hill2 });
  ctx.fillStyle = water;
  ctx.globalAlpha = 0.55;
  ctx.fillRect(0, height * 0.78, width, height * 0.22);
  ctx.globalAlpha = 1;
  paintHill(ctx, width, height, { base: 0.86, amplitude: 0.05, frequency: 1.7, phase: mood + 3.1, colour: hill3 });
  // Crop, rotate and colour looks read the original's natural size, which a canvas doesn't have: give it one.
  Object.defineProperties(canvas, { naturalWidth: { value: width }, naturalHeight: { value: height } });
  return {
    id: `sample-${String(mood)}`,
    name: 'Sample photo',
    url: '',
    rot: 0,
    flip: false,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    zoom: 1,
    px: 0,
    py: 0,
    look: 'none',
    // The canvas stands in for the decoded image: it is drawn like one and has its natural size (set above).
    orig: canvas as unknown as HTMLImageElement,
    src: canvas,
    sw: width,
    sh: height,
  };
}
