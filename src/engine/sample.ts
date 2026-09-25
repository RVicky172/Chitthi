import type { Photo } from '../types';

/** Colour moods for the made-up sample photos: sky top, sky bottom, sun, three hill layers, water. */
const MOODS = [
  ['#7dd3fc', '#fde68a', '#fff7cc', '#0e7490', '#155e75', '#083344', '#38bdf8'],
  ['#fda4af', '#fed7aa', '#fffbeb', '#9d174d', '#6b213f', '#3b0d24', '#fb7185'],
  ['#a5f3fc', '#e0f2fe', '#ffffff', '#15803d', '#166534', '#052e16', '#67e8f9'],
  ['#c4b5fd', '#fbcfe8', '#fff1f2', '#4c1d95', '#2e1065', '#1e1b4b', '#a78bfa'],
];

/**
 * A painted landscape used as a stand-in photo on the landing page, so product previews come from the real
 * renderer without shipping any image files.
 */
export function samplePhoto(mood: number, w = 900, h = 640): Photo {
  const [sky1, sky2, sun, h1, h2, h3, water] = MOODS[mood % MOODS.length];
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const sky = c.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, sky1);
  sky.addColorStop(1, sky2);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  const glow = c.createRadialGradient(w * 0.68, h * 0.42, 0, w * 0.68, h * 0.42, h * 0.5);
  glow.addColorStop(0, sun);
  glow.addColorStop(0.18, sun);
  glow.addColorStop(0.2, 'rgba(255,255,255,.35)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, w, h);
  const hill = (base: number, amp: number, freq: number, phase: number, col: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, h);
    for (let x = 0; x <= w; x += 8)
      c.lineTo(x, h * base - Math.sin(x / (w / freq) + phase) * h * amp - Math.sin(x / (w / (freq * 2.7)) + phase * 2) * h * amp * 0.35);
    c.lineTo(w, h);
    c.closePath();
    c.fill();
  };
  hill(0.6, 0.07, 1.3, mood, h1);
  hill(0.7, 0.06, 2.1, mood + 1.7, h2);
  c.fillStyle = water;
  c.globalAlpha = 0.55;
  c.fillRect(0, h * 0.78, w, h * 0.22);
  c.globalAlpha = 1;
  hill(0.86, 0.05, 1.7, mood + 3.1, h3);
  // Crop, rotate and colour looks read the original's natural size, which a canvas doesn't have: give it one.
  Object.defineProperties(cv, { naturalWidth: { value: w }, naturalHeight: { value: h } });
  return {
    id: `sample-${mood}`,
    name: 'Sample photo',
    url: '',
    rot: 0,
    flip: false,
    crop: { x: 0, y: 0, w: 1, h: 1 },
    zoom: 1,
    px: 0,
    py: 0,
    look: 'none',
    orig: cv as unknown as HTMLImageElement,
    src: cv,
    sw: w,
    sh: h,
  };
}
