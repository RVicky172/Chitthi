import { themeById, PLAIN } from '../data/themes';
import { cardMM, DEFAULT_DESIGN, mergeDesign, sizeOf } from '../engine/design';
import { buildPDF, buildPNG } from '../engine/export';
import { checkFile, loadImage, makePhoto, MAX_PHOTOS, photoMeta, photosFromMeta, readAsDataURL } from '../engine/photo';
import { renderCard } from '../engine/render';
import { db } from '../lib/db';
import { saveFile } from '../lib/download';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { toast } from '../lib/toast';
import type { SavedDesign, Side, SizeDef, ViewerFaces } from '../types';
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
  } else setDesign({ sizeId: s.id });
}

export const applyInstaxPreset = () => setExp({ format: 'sheet', sheet: 'a4', bleed: '0' });

/** Validates and loads files; returns messages to show under the upload area. */
export async function addFiles(files: File[]): Promise<[kind: 'err' | 'warn', msg: string][]> {
  const msgs: ['err' | 'warn', string][] = [];
  const added = [];
  let room = MAX_PHOTOS - getState().photos.length;
  for (const f of files) {
    const err = checkFile(f);
    if (err) {
      msgs.push(['err', err]);
      continue;
    }
    if (room <= 0) {
      msgs.push(['err', `${f.name} wasn’t added: a card holds up to ${MAX_PHOTOS} photos. Remove one first.`]);
      continue;
    }
    room--;
    try {
      const url = await readAsDataURL(f),
        img = await loadImage(url);
      if (Math.min(img.naturalWidth, img.naturalHeight) < 800)
        msgs.push([
          'warn',
          `${f.name} is only ${img.naturalWidth}×${img.naturalHeight} px, so it will look soft beyond a small print. Use the original photo if you have it.`,
        ]);
      added.push(makePhoto(img, f.name, url));
    } catch {
      msgs.push(['err', `${f.name} couldn’t be read. The file may be damaged or not really a JPG, PNG or WebP.`]);
    }
  }
  if (added.length) {
    const { photos, design } = getState();
    setPhotos([...photos, ...added]);
    if (!photos.length && design.layout === 'text') setDesign({ layout: 'full' });
  }
  return msgs;
}

export async function downloadPrintFile(): Promise<void> {
  const d = getState().design;
  try {
    await ensureFonts(fontsFor(d));
    if (d.exp.format === 'png') {
      await downloadPNG('front');
      if (d.exp.back) await downloadPNG('back');
      return;
    }
    const { blob, name } = await buildPDF(input());
    saveFile(name, blob);
    toast(`Downloading ${name}`);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The file couldn’t be created.');
  }
}

export async function downloadPNG(side: Side): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { blob, name } = await buildPNG(side, input());
    saveFile(name, blob);
    toast(`Downloading ${name}`);
  } catch (e) {
    toast(e instanceof Error && e.message ? e.message : 'The image couldn’t be created.');
  }
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
  setUI({ pane: 'size', side: 'front' });
  toast(`Opened “${d.name}”.`);
}

export function newCard(): void {
  const cur = getState().design;
  replaceCard({ ...structuredClone(DEFAULT_DESIGN), exp: cur.exp }, [], null);
  setUI({ pane: 'size', side: 'front' });
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
    resetHistory();
    toast('Your last card is back, photos included.');
  } catch {
    /* nothing saved */
  }
}
