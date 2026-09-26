import { themeById, PLAIN } from '../data/themes';
import { MONTHS } from '../data/products';
import { calPages, cardMM, cornerMM, mergeDesign, productDesign, sizeOf } from '../engine/design';
import { buildEnvelopePDF, buildEnvelopeTemplate, buildPack, buildPDF, buildPNG, pagesOf, type PrintPage } from '../engine/export';
import { renderEnvelope } from '../engine/envelope';
import { checkFile, loadImage, makePhoto, maxPhotos, photoMeta, photosFromMeta, readAsDataURL } from '../engine/photo';
import { calMonth, renderCard } from '../engine/render';
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
    stored: { name: string; url: string; img: HTMLImageElement }[] = [];
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
      stored.push({ name: f.name, url, img });
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

/** Photo library upload: checks and keeps the files in the photo store without putting them on the card. */
export async function addToLibrary(files: File[]): Promise<[kind: 'err' | 'warn', msg: string][]> {
  const msgs: ['err' | 'warn', string][] = [],
    stored: { name: string; url: string; img: HTMLImageElement }[] = [];
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
        msgs.push(['warn', `${f.name} is only ${img.naturalWidth}×${img.naturalHeight} px, so it will look soft beyond a small print.`]);
      stored.push({ name: f.name, url, img });
    } catch {
      msgs.push(['err', `${f.name} couldn’t be read. The file may be damaged or not really a JPG, PNG or WebP.`]);
    }
  }
  await storePhotos(stored);
  if (stored.length) toast(`${stored.length === 1 ? '1 photo' : `${stored.length} photos`} added to your library.`);
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
    await saveFile(name, blob);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The file couldn’t be created.');
  }
}

/** Documents for print shops: a quote request for this design, or the specification catalog for every product. */
export async function downloadQuote(kind: 'design' | 'catalog'): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const q = await import('../engine/quote');
    const f = kind === 'design' ? await q.buildQuoteRequest(input()) : await q.buildQuoteCatalog();
    await saveFile(f.name, f.blob);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The document couldn’t be created.');
  }
}

/** Envelope files on their own: the print-on-envelope PDF or the fold-your-own template. */
export async function downloadEnvelope(kind: 'pdf' | 'template'): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const f = kind === 'pdf' ? await buildEnvelopePDF(input()) : await buildEnvelopeTemplate(input());
    if (!f) {
      toast('This envelope is too big for a printable template. Use the envelope PDF on a ready-made envelope.');
      return;
    }
    await saveFile(f.name, f.blob);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The envelope file couldn’t be created.');
  }
}

export async function downloadPNG(pg: PrintPage): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { blob, name } = await buildPNG(pg, input());
    await saveFile(name, blob);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The image couldn’t be created.');
  }
}

/** One ZIP with every front and back as separate PNGs, the print PDF and a print-spec text file. */
export async function downloadPack(onStep?: (msg: string) => void): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { blob, name } = await buildPack(input(), onStep);
    await saveFile(name, blob);
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

function faces(longSide: number, quality: number, allPages = false): ViewerFaces {
  const inp = input(),
    { w, h } = cardMM(inp.d),
    px = longSide / Math.max(w, h),
    size = sizeOf(inp.d);
  const a = document.createElement('canvas'),
    b = document.createElement('canvas');
  // The single-page view opens on the month shown in the preview.
  const n = calPages(inp.d),
    page = Math.min(getState().ui.calPage, n - 1);
  renderCard(a, 'front', px, 0, inp, { page });
  renderCard(b, 'back', px, 0, inp);
  const out: ViewerFaces = {
    front: a.toDataURL('image/jpeg', quality),
    back: b.toDataURL('image/jpeg', quality),
    w,
    h,
    round: !!size.instax,
    corner: cornerMM(inp.d) || undefined,
    circle: size.shape === 'circle' || undefined,
  };
  if (allPages && inp.d.env.on) {
    // Envelope layers: address side, back without the flap, the flap, and the flap's lining.
    const cv = document.createElement('canvas'),
      ep = 1000 / 250,
      layer = (face: 'front' | 'body' | 'flap' | 'liner') => {
        const spec = renderEnvelope(cv, face, ep, inp);
        return { spec, url: face === 'front' || face === 'body' ? cv.toDataURL('image/jpeg', 0.88) : cv.toDataURL('image/png') };
      };
    const f = layer('front');
    out.envelope = { front: f.url, body: layer('body').url, flap: layer('flap').url, liner: layer('liner').url, w: f.spec.w, h: f.spec.h, name: f.spec.name };
  }
  if (allPages && n > 1) {
    // Every month for the all-months views, at a lighter resolution (twelve pages share the screen).
    const pp = 900 / Math.max(w, h),
      cv = document.createElement('canvas');
    out.pages = Array.from({ length: n }, (_, p) => {
      renderCard(cv, 'front', pp, 0, inp, { page: p });
      const { month, year } = calMonth(inp.d, p);
      return { src: cv.toDataURL('image/jpeg', 0.86), label: `${MONTHS[month]} ${year}` };
    });
  }
  return out;
}

export async function open3D(f?: ViewerFaces, start?: ViewerFaces['start']): Promise<void> {
  await ensureFonts(fontsFor(getState().design));
  const v = f ?? faces(1400, 0.9, true);
  setUI({ viewer: start ? { ...v, start } : v });
}

/* ---------- gallery ---------- */
const newId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** The current card as a gallery record: design, photos and rendered thumbnails of both faces. */
async function currentRecord(id: string): Promise<SavedDesign> {
  await ensureFonts(fontsFor(getState().design));
  const { design, photos } = getState();
  const f = faces(900, 0.85),
    size = sizeOf(design).name;
  return {
    id,
    name: design.designName.trim() || `${design.heading || 'Postcard'} – ${size}`,
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
}

const backupJSON = (designs: SavedDesign[]) =>
  JSON.stringify({ app: 'chitthi', version: 2, exported: new Date().toISOString(), designs });

export async function saveDesign(asNew: boolean): Promise<void> {
  try {
    const cur = getState().designId;
    const rec = await currentRecord(asNew || !cur ? newId() : cur);
    await db.put(rec);
    setDesignId(rec.id);
    toast(`Saved “${rec.name}” to your gallery.`);
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
    const blob = new Blob([backupJSON(list)], { type: 'application/json' });
    await saveFile(`chitthi-gallery-backup-${new Date().toISOString().slice(0, 10)}.json`, blob);
  } catch {
    toast('The backup couldn’t be created.');
  }
}

/** Saves the current card as a single .chitthi file (photos included) to share or keep outside the gallery. */
export async function exportDesignFile(): Promise<void> {
  try {
    const rec = await currentRecord(getState().designId ?? newId());
    const base = rec.name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chitthi-design';
    await saveFile(`${base}.chitthi`, new Blob([backupJSON([rec])], { type: 'application/json' }));
  } catch {
    toast('The design file couldn’t be created.');
  }
}

export const importBackup = async (file: File): Promise<void> => importText(file.name, await file.text());

/**
 * Reads a gallery backup (.json) or a single design (.chitthi). Everything valid goes into the gallery; a
 * .chitthi file is also opened in the studio.
 */
export async function importText(name: string, text: string): Promise<void> {
  const single = /\.chitthi$/i.test(name);
  if (!single && !/\.json$/i.test(name)) {
    toast('Choose a Chitthi design (.chitthi) or gallery backup (.json).');
    return;
  }
  try {
    const data = JSON.parse(text) as { app?: string; designs?: unknown[] };
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
    if (single && ok.length) {
      await openDesign(ok[0].id);
      setUI({ screen: 'studio', gallery: false });
      return;
    }
    const skip = data.designs.length - ok.length;
    toast(
      ok.length
        ? `Restored ${ok.length} design${ok.length > 1 ? 's' : ''}${skip ? `; ${skip} skipped because they were damaged` : ''}.`
        : 'No designs in that file could be read.',
    );
  } catch {
    toast(single ? 'That file isn’t a Chitthi design.' : 'That file isn’t a Chitthi gallery backup.');
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
    void storePhotos(photos.map((p) => ({ name: p.name, url: p.url, img: p.orig })));
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
  void storePhotos(photos.map((p) => ({ name: p.name, url: p.url, img: p.orig })));
  toast(`Opened the “${design.designName}” sample. Swap in your own photos from the Photos step.`);
}
