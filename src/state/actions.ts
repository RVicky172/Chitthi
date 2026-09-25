import { themeById, PLAIN } from '../data/themes';
import { cardMM, mergeDesign, productDesign, sizeOf } from '../engine/design';
import { buildPack, buildPDF, buildPNG, pagesOf, type PrintPage } from '../engine/export';
import { checkFile, loadImage, makePhoto, maxPhotos, photoMeta, photosFromMeta, readAsDataURL } from '../engine/photo';
import { renderCard } from '../engine/render';
import { db } from '../lib/db';
import { saveFile } from '../lib/download';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { toast } from '../lib/toast';
import type { Design, Photo, ProductId, SavedDesign, SizeDef, ViewerFaces } from '../types';
import { storePhotos } from './library';
import { getState, markPhotosSaved, replaceCard, resetHistory, setDesign, setDesignId, setExp, setPhotos, setUI } from './store';

const input = () => ({ d: getState().design, photos: getState().photos });

export function applyTheme(id: string): void {
  const t = themeById(id);
  setDesign({ themeId: id, useOccasion: true, heading: t.heads[0], quote: t.quotes[0], headFont: t.hf, quoteFont: t.qf });
  void ensureFonts([t.hf, t.qf]);
}

export function setOccasion(on: boolean): void {
  if (on) applyTheme(getState().design.themeId);
  else setDesign({ useOccasion: false, heading: PLAIN.heads[0], quote: PLAIN.quotes[0] });
}

export function selectSize(s: SizeDef): void {
  const d = getState().design;
  if (s.instax) {
    const switchPrint = d.exp.format !== 'sheet';
    setDesign({
      sizeId: s.id,
      orient: s.native ?? 'portrait',
      layout: 'instax',
      ...(switchPrint ? { exp: { ...d.exp, format: 'sheet', sheet: 'a4', bleed: '0' } } : {}),
    });
    if (switchPrint) toast('Print file set to an A4 sheet of Instax-style prints. Change it in Print.');
  } else setDesign({ sizeId: s.id, ...(d.product !== 'postcard' && s.native ? { orient: s.native } : {}) });
}

export const applyInstaxPreset = () => setExp({ format: 'sheet', sheet: 'a4', bleed: '0' });

/** Validates and loads files; returns messages to show under the upload area. */
export async function addFiles(files: File[]): Promise<[kind: 'err' | 'warn', msg: string][]> {
  const msgs: ['err' | 'warn', string][] = [];
  const added = [],
    stored: { name: string; url: string }[] = [];
  const limit = maxPhotos(getState().design.product);
  let room = limit - getState().photos.length,
    full = 0;
  for (const f of files) {
    const err = checkFile(f);
    if (err) {
      msgs.push(['err', err]);
      continue;
    }
    try {
      const url = await readAsDataURL(f),
        img = await loadImage(url);
      if (Math.min(img.naturalWidth, img.naturalHeight) < 800)
        msgs.push([
          'warn',
          `${f.name} is only ${img.naturalWidth}×${img.naturalHeight} px, so it will look soft beyond a small print. Use the original photo if you have it.`,
        ]);
      stored.push({ name: f.name, url });
      if (room > 0) {
        room--;
        added.push(makePhoto(img, f.name, url));
      } else full++;
    } catch {
      msgs.push(['err', `${f.name} couldn’t be read. The file may be damaged or not really a JPG, PNG or WebP.`]);
    }
  }
  if (added.length) {
    const { photos, design } = getState();
    setPhotos([...photos, ...added]);
    if (!photos.length && design.layout === 'text') setDesign({ layout: 'full' });
  }
  // Every good upload goes into the photo store, including ones the card has no room for.
  await storePhotos(stored);
  if (full)
    msgs.push([
      'warn',
      `This design holds up to ${limit} photos, so ${full === 1 ? 'one photo was' : `${full} photos were`} saved to your photo store only. Tap it there to swap it in.`,
    ]);
  return msgs;
}

export async function downloadPrintFile(): Promise<void> {
  const d = getState().design;
  try {
    await ensureFonts(fontsFor(d));
    if (d.exp.format === 'png') {
      for (const pg of pagesOf(d)) await downloadPNG(pg);
      return;
    }
    const { blob, name } = await buildPDF(input());
    saveFile(name, blob);
    toast(`Downloading ${name}`);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The file couldn’t be created.');
  }
}

export async function downloadPNG(pg: PrintPage): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { blob, name } = await buildPNG(pg, input());
    saveFile(name, blob);
    toast(`Downloading ${name}`);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The image couldn’t be created.');
  }
}

/** One ZIP with every front and back as separate PNGs, the print PDF and a print-spec text file. */
export async function downloadPack(onStep?: (msg: string) => void): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { blob, name } = await buildPack(input(), onStep);
    saveFile(name, blob);
    toast(`Downloading ${name}`);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The print pack couldn’t be created.');
  }
}

/* ---------- products ---------- */
const productKey = (p: ProductId) => `chitthi-product-${p}`;

/**
 * Switch to another product. Each product keeps its own last design (size, layout, options, words),
 * so going Postcard → Calendar → Postcard brings the postcard back as it was. Photos are shared.
 */
export function switchProduct(p: ProductId): void {
  const cur = getState().design;
  if (cur.product === p) return;
  try {
    localStorage.setItem(productKey(cur.product), JSON.stringify(cur));
  } catch {
    /* storage full or blocked */
  }
  let next: Design | null = null;
  try {
    const raw = localStorage.getItem(productKey(p));
    if (raw) next = mergeDesign(JSON.parse(raw));
  } catch {
    /* ignore a damaged copy */
  }
  replaceCard(next ?? productDesign(p, cur), getState().photos, null);
  setUI({ side: 'front', slot: 0, calPage: 0 });
  void ensureFonts(fontsFor(getState().design));
}

/** From the landing page: open the studio on a product, starting at the first step. */
export function startProduct(p: ProductId): void {
  switchProduct(p);
  setUI({ screen: 'studio', pane: 'photos' });
}

function faces(longSide: number, quality: number): ViewerFaces {
  const inp = input(),
    { w, h } = cardMM(inp.d),
    px = longSide / Math.max(w, h);
  const a = document.createElement('canvas'),
    b = document.createElement('canvas');
  renderCard(a, 'front', px, 0, inp);
  renderCard(b, 'back', px, 0, inp);
  return {
    front: a.toDataURL('image/jpeg', quality),
    back: b.toDataURL('image/jpeg', quality),
    w,
    h,
    round: !!sizeOf(inp.d).instax,
  };
}

export async function open3D(f?: ViewerFaces): Promise<void> {
  await ensureFonts(fontsFor(getState().design));
  setUI({ viewer: f ?? faces(1400, 0.9) });
}

/* ---------- gallery ---------- */
export async function saveDesign(asNew: boolean): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { design, photos } = getState();
    let id = getState().designId;
    if (asNew || !id) id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const f = faces(900, 0.85),
      size = sizeOf(design).name;
    const name = design.designName.trim() || `${design.heading || 'Postcard'} – ${size}`;
    const rec: SavedDesign = {
      id,
      name,
      updated: Date.now(),
      w: f.w,
      h: f.h,
      round: f.round,
      size,
      design,
      photos: photos.map(photoMeta),
      front: f.front,
      back: f.back,
    };
    await db.put(rec);
    setDesignId(id);
    toast(`Saved “${name}” to your gallery.`);
    window.dispatchEvent(new Event('chitthi:gallery'));
  } catch (e) {
    toast(
      e instanceof DOMException && e.name === 'QuotaExceededError'
        ? 'Your browser is out of space for the gallery. Delete an older design and try again.'
        : 'The gallery isn’t available in this browser.',
    );
  }
}

export async function openDesign(id: string): Promise<void> {
  const d = await db.get(id);
  if (!d) return;
  const design = mergeDesign(d.design);
  design.designName = d.name;
  replaceCard(design, await photosFromMeta(d.photos), d.id);
  await ensureFonts(fontsFor(design));
  setUI({ pane: 'photos', side: 'front' });
  toast(`Opened “${d.name}”.`);
}

export function newCard(): void {
  const cur = getState().design;
  replaceCard(productDesign(cur.product, cur), [], null);
  setUI({ pane: 'photos', side: 'front' });
  toast('New card started. Use Undo to go back.');
}

export async function exportBackup(): Promise<void> {
  try {
    const list = await db.all();
    if (!list.length) {
      toast('Your gallery is empty, so there’s nothing to back up yet.');
      return;
    }
    const blob = new Blob([JSON.stringify({ app: 'chitthi', version: 2, exported: new Date().toISOString(), designs: list })], {
      type: 'application/json',
    });
    saveFile(`chitthi-gallery-backup-${new Date().toISOString().slice(0, 10)}.json`, blob);
  } catch {
    toast('The backup couldn’t be created.');
  }
}

export async function importBackup(file: File): Promise<void> {
  if (!/\.json$/i.test(file.name)) {
    toast('Choose a Chitthi backup file ending in .json.');
    return;
  }
  try {
    const data = JSON.parse(await file.text()) as { app?: string; designs?: unknown[] };
    if (data.app !== 'chitthi' || !Array.isArray(data.designs)) throw new Error('bad');
    const img = (v: unknown) => typeof v === 'string' && v.startsWith('data:image/');
    const ok = data.designs.filter((x): x is SavedDesign & { state?: unknown } => {
      const d = x as Partial<SavedDesign> & { state?: unknown };
      return (
        !!d &&
        typeof d.id === 'string' &&
        typeof (d.design ?? d.state) === 'object' &&
        img(d.front) &&
        img(d.back) &&
        Array.isArray(d.photos) &&
        d.photos.every((p) => p && img(p.url))
      );
    });
    for (const d of ok) await db.put({ ...d, design: mergeDesign(d.design ?? d.state) });
    window.dispatchEvent(new Event('chitthi:gallery'));
    const skip = data.designs.length - ok.length;
    toast(
      ok.length
        ? `Restored ${ok.length} design${ok.length > 1 ? 's' : ''}${skip ? `; ${skip} skipped because they were damaged` : ''}.`
        : 'No designs in that file could be read.',
    );
  } catch {
    toast('That file isn’t a Chitthi gallery backup.');
  }
}

/** Brings back the photos of the card the user was working on before reloading. */
export async function restoreWork(): Promise<void> {
  try {
    const metas = await db.getWorkPhotos();
    if (!metas.length || getState().photos.length) return;
    const photos = await photosFromMeta(metas);
    if (!photos.length) return;
    setPhotos(photos);
    markPhotosSaved();
    void storePhotos(metas.map((m) => ({ name: m.name, url: m.url })));
    resetHistory();
    toast('Your last card is back, photos included.');
  } catch {
    /* nothing saved */
  }
}

/** Open a gallery sample in the studio: its product, design and photos (which also go into the photo store). */
export async function openSample(design: Design, photos: Photo[]): Promise<void> {
  if (getState().design.product !== design.product) switchProduct(design.product);
  replaceCard(structuredClone(design), photos, null);
  await ensureFonts(fontsFor(design));
  setUI({ gallery: false, screen: 'studio', pane: 'photos', side: 'front', slot: 0, calPage: 0 });
  void storePhotos(photos.map((p) => ({ name: p.name, url: p.url })));
  toast(`Opened the “${design.designName}” sample. Swap in your own photos from the Photos step.`);
}
