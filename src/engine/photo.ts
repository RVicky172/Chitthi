import type { LookId, Photo, PhotoMeta } from '../types';

export const MAX_MB = 25;
export const MAX_PHOTOS = 4;
/** Photos a design can hold: a 12-month calendar needs one per month (two for two-photo pages). */
export const maxPhotos = (product: string): number => (product === 'calendar' ? 24 : MAX_PHOTOS);
const MAX_PIXELS = 16e6; // stays under mobile Safari's canvas limit

/** Returns a user-facing reason when a file can't be used, or null when it's fine. */
export function checkFile(f: File): string | null {
  const ext = (f.name.includes('.') ? (f.name.split('.').pop() ?? '') : '').toLowerCase();
  const type = (f.type || '').toLowerCase();
  if (/heic|heif/.test(type) || ext === 'heic' || ext === 'heif')
    return `${f.name}: HEIC photos from iPhone can’t be opened in the browser. Save it as JPG (Share › Save as JPEG, or set Settings › Camera › Formats › Most Compatible).`;
  if (ext === 'tif' || ext === 'tiff' || type.includes('tiff')) return `${f.name}: TIFF isn’t supported. Save it as JPG or PNG.`;
  if (ext === 'gif' || type === 'image/gif') return `${f.name}: GIF images are too low in quality for printing. Use JPG or PNG.`;
  if (ext === 'bmp' || type.includes('bmp')) return `${f.name}: BMP isn’t supported. Save it as JPG or PNG.`;
  if (ext === 'svg' || type.includes('svg')) return `${f.name}: SVG drawings can’t be used as photos. Export it as PNG.`;
  if (ext === 'pdf' || type === 'application/pdf')
    return `${f.name}: PDFs can’t be used as photos. Export the page as JPG or PNG.`;
  if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext) && !['image/jpeg', 'image/png', 'image/webp'].includes(type))
    return `${f.name}: this file type isn’t supported. Use JPG, PNG or WebP.`;
  if (f.size === 0) return `${f.name} is empty. Choose the file again.`;
  if (f.size > MAX_MB * 1048576)
    return `${f.name} is ${(f.size / 1048576).toFixed(1)} MB. The limit is ${MAX_MB} MB; export a smaller JPG from your gallery app.`;
  return null;
}

export const readAsDataURL = (f: File) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(f);
  });

export const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = url;
  });

function applyLook(cv: HTMLCanvasElement, look: LookId): void {
  const x = cv.getContext('2d');
  if (!x) return;
  const d = x.getImageData(0, 0, cv.width, cv.height);
  lookPixels(d.data, look);
  x.putImageData(d, 0, 0);
}

/** One pixel through a look (0–255 in, 0–255 out, neither rounded nor clamped), written into out (no allocation per pixel). */
export function lookPixel(r: number, g: number, b: number, look: LookId, out: number[]): void {
  const l = 0.299 * r + 0.587 * g + 0.114 * b;
  switch (look) {
    case 'bw':
      r = g = b = (l - 128) * 1.08 + 128;
      break;
    case 'warm':
      r *= 1.08;
      g *= 1.02;
      b *= 0.88;
      break;
    case 'cool':
      r *= 0.9;
      g *= 1.01;
      b *= 1.1;
      break;
    case 'vivid':
      r = (l + (r - l) * 1.35 - 128) * 1.06 + 128;
      g = (l + (g - l) * 1.35 - 128) * 1.06 + 128;
      b = (l + (b - l) * 1.35 - 128) * 1.06 + 128;
      break;
    case 'tinted': {
      // Hand-tinted: a black-and-white print on warm paper, with thin washes of colour laid back in only where the
      // photo was strongly coloured (a sari, marigolds, a turban), the way studio photographs were once painted.
      const hi = Math.max(r, g, b),
        sat = hi ? (hi - Math.min(r, g, b)) / hi : 0,
        wash = Math.min(1, Math.max(0, (sat - 0.28) / 0.42)) * 0.62,
        base = (l - 128) * 1.06 + 128;
      r = base * 1.015 + 4 + (r - l) * wash;
      g = base * 0.995 + 2 + (g - l) * wash;
      b = base * 0.955 + 1 + (b - l) * wash;
      break;
    }
    case 'vintage':
      r = r * 0.45 + (l * 1.07 + 20) * 0.55;
      g = g * 0.45 + (l * 0.95 + 12) * 0.55;
      b = b * 0.45 + (l * 0.78 + 10) * 0.55;
      break;
    default:
      break;
  }
  out[0] = r;
  out[1] = g;
  out[2] = b;
}

/**
 * The colour looks, on raw RGBA pixels (shared with the Instagram studio, engine/instagram.ts). The same formulas as
 * lookPixel(), kept inline in this loop because a call per pixel makes it 2–3× slower; photo.test.ts checks they agree.
 */
export function lookPixels(a: Uint8ClampedArray, look: LookId): void {
  if (look === 'none') return;
  for (let i = 0; i < a.length; i += 4) {
    let r = a[i],
      g = a[i + 1],
      b = a[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    switch (look) {
      case 'bw':
        r = g = b = (l - 128) * 1.08 + 128;
        break;
      case 'warm':
        r *= 1.08;
        g *= 1.02;
        b *= 0.88;
        break;
      case 'cool':
        r *= 0.9;
        g *= 1.01;
        b *= 1.1;
        break;
      case 'vivid':
        r = (l + (r - l) * 1.35 - 128) * 1.06 + 128;
        g = (l + (g - l) * 1.35 - 128) * 1.06 + 128;
        b = (l + (b - l) * 1.35 - 128) * 1.06 + 128;
        break;
      case 'tinted': {
        // Hand-tinted: a black-and-white print on warm paper, with thin washes of colour laid back in only where the
        // photo was strongly coloured (a sari, marigolds, a turban), the way studio photographs were once painted.
        const hi = Math.max(r, g, b),
          sat = hi ? (hi - Math.min(r, g, b)) / hi : 0,
          wash = Math.min(1, Math.max(0, (sat - 0.28) / 0.42)) * 0.62,
          base = (l - 128) * 1.06 + 128;
        r = base * 1.015 + 4 + (r - l) * wash;
        g = base * 0.995 + 2 + (g - l) * wash;
        b = base * 0.955 + 1 + (b - l) * wash;
        break;
      }
      case 'vintage':
        r = r * 0.45 + (l * 1.07 + 20) * 0.55;
        g = g * 0.45 + (l * 0.95 + 12) * 0.55;
        b = b * 0.45 + (l * 0.78 + 10) * 0.55;
        break;
      default:
        break;
    }
    a[i] = r;
    a[i + 1] = g;
    a[i + 2] = b;
  }
}

/** Applies rotation, mirroring, crop and look to the original image at full resolution. */
function processed(orig: HTMLImageElement, m: PhotoMeta): { src: CanvasImageSource; sw: number; sh: number } {
  const iw = orig.naturalWidth,
    ih = orig.naturalHeight,
    rot = ((m.rot % 360) + 360) % 360;
  const sw = rot % 180 ? ih : iw,
    sh = rot % 180 ? iw : ih,
    c = m.crop;
  if (!rot && !m.flip && m.look === 'none' && c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1)
    return { src: orig, sw: iw, sh: ih };
  const cw = Math.max(1, Math.round(c.w * sw)),
    ch = Math.max(1, Math.round(c.h * sh));
  const k = Math.min(1, Math.sqrt(MAX_PIXELS / (cw * ch)));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(cw * k));
  cv.height = Math.max(1, Math.round(ch * k));
  const x = cv.getContext('2d');
  if (!x) return { src: orig, sw: iw, sh: ih };
  x.imageSmoothingQuality = 'high';
  x.scale(k, k);
  x.translate(-c.x * sw, -c.y * sh);
  x.translate(sw / 2, sh / 2);
  x.rotate((rot * Math.PI) / 180);
  if (m.flip) x.scale(-1, 1);
  x.drawImage(orig, -iw / 2, -ih / 2);
  if (m.look !== 'none') applyLook(cv, m.look);
  return { src: cv, sw: cv.width, sh: cv.height };
}

let seq = 0;
export function makePhoto(orig: HTMLImageElement, name: string, url: string, meta: Partial<PhotoMeta> = {}): Photo {
  const m: PhotoMeta = {
    name,
    url,
    rot: meta.rot ?? 0,
    flip: !!meta.flip,
    crop: meta.crop ?? { x: 0, y: 0, w: 1, h: 1 },
    zoom: meta.zoom ?? 1,
    px: meta.px ?? 0,
    py: meta.py ?? 0,
    look: meta.look ?? 'none',
  };
  return { ...m, id: `p${Date.now().toString(36)}${(seq++).toString(36)}`, orig, ...processed(orig, m) };
}

/** Returns an updated photo, re-processing pixels only when the crop/rotation/look changed. */
export function updatePhoto(p: Photo, patch: Partial<PhotoMeta>): Photo {
  const next = { ...p, ...patch };
  const heavy =
    (['rot', 'flip', 'look'] as const).some((k) => k in patch && patch[k] !== p[k]) ||
    ('crop' in patch && JSON.stringify(patch.crop) !== JSON.stringify(p.crop));
  return heavy ? { ...next, ...processed(p.orig, next) } : next;
}

export const photoMeta = (p: Photo): PhotoMeta => ({
  name: p.name,
  url: p.url,
  rot: p.rot,
  flip: p.flip,
  crop: p.crop,
  zoom: p.zoom,
  px: p.px,
  py: p.py,
  look: p.look,
});

export async function photosFromMeta(list: PhotoMeta[]): Promise<Photo[]> {
  const out: Photo[] = [];
  for (const m of list) {
    try {
      out.push(makePhoto(await loadImage(m.url), m.name, m.url, m));
    } catch {
      /* skip unreadable photo */
    }
  }
  return out;
}
