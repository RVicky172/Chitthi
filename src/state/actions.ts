import { themeById, PLAIN } from '../data/themes';
import { MONTHS } from '../data/products';
import { calPages, cardMM, cornerMM, mergeDesign, productDesign, sizeOf } from '../engine/design';
import { pagesOf, type PrintPage } from '../engine/printPages';
import { renderEnvelope } from '../engine/envelopeDraw';
import { checkFile, loadImage, makePhoto, maxPhotos, photoMeta, photosFromMeta, readAsDataURL } from '../engine/photo';
import { calMonth } from '../engine/calendarDraw';
import { renderCard } from '../engine/render';
import { db } from '../lib/db';
import { logError } from '../lib/errors';
import { saveFile } from '../lib/download';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { newRecordId } from '../lib/ids';
import { toast } from '../lib/toast';
import { makeZip } from '../lib/zip';
import type { Design, Photo, PhotoMeta, ProductId, SavedDesign, SizeDef, ViewerFaces } from '../types';
import { storePhotos } from './library';
import { getState, markPhotosSaved, replaceCard, resetHistory, setDesign, setDesignId, setExp, setPhotos, setUI } from './store';

/*
 * The print studio's actions: themes and sizes, uploads, print files and documents, switching products, the 3D
 * viewer, and the gallery (save, open, back up, import). They change the store in store.ts.
 */

/**
 * The current card as the renderers take it.
 * @returns the design (as `d`) and the photos
 */
const input = () => ({ d: getState().design, photos: getState().photos });

/**
 * Turn on an occasion theme: its first heading and quote, and its fonts.
 * @param id the theme's id (data/themes.ts)
 */
export function applyTheme(id: string): void {
  const theme = themeById(id);
  setDesign({ themeId: id, useOccasion: true, heading: theme.heads[0], quote: theme.quotes[0], headFont: theme.hf, quoteFont: theme.qf });
  void ensureFonts([theme.hf, theme.qf]);
}

/**
 * Turn the occasion on (the design's theme again) or off (the plain words).
 * @param isOn whether the occasion is on
 */
export function setOccasion(isOn: boolean): void {
  // eslint-disable-next-line sonarjs/no-selector-parameter -- the public API (src/index.ts) takes the checkbox's value
  if (isOn) applyTheme(getState().design.themeId);
  else setDesign({ useOccasion: false, heading: PLAIN.heads[0], quote: PLAIN.quotes[0] });
}

/**
 * Choose a size. An Instax-style size also takes the Instax layout and, if needed, an A4 sheet print file.
 * @param size the size (data/products.ts)
 */
export function selectSize(size: SizeDef): void {
  const design = getState().design;
  if (size.instax) {
    const isSwitchingPrint = design.exp.format !== 'sheet';
    setDesign({
      sizeId: size.id,
      orient: size.native ?? 'portrait',
      layout: 'instax',
      ...(isSwitchingPrint ? { exp: { ...design.exp, format: 'sheet', sheet: 'a4', bleed: '0' } } : {}),
    });
    if (isSwitchingPrint) toast('Print file set to an A4 sheet of Instax-style prints. Change it in Print.');
  } else setDesign({ sizeId: size.id, ...(design.product !== 'postcard' && size.native ? { orient: size.native } : {}) });
}

/** Set the print file to an A4 sheet without bleed (for Instax-style prints). */
export const applyInstaxPreset = () => {
  setExp({ format: 'sheet', sheet: 'a4', bleed: '0' });
};

/** A message shown under the upload area: an error (the file was refused) or a warning. */
export type UploadMessage = [kind: 'err' | 'warn', msg: string];

/** An upload decoded and ready for the photo store. */
interface DecodedUpload {
  name: string;
  url: string;
  img: HTMLImageElement;
}

/** Photos with a short side under this many pixels get a warning that they print soft. */
const SOFT_PIXELS = 800;

/**
 * Check and decode one upload, adding its error or warning to the messages.
 * @param file the file
 * @param softAdvice what the soft-photo warning adds after its first sentence ('' for nothing)
 * @param messages the messages to add to
 * @returns the decoded upload, or null when it was refused or couldn't be read
 */
async function decodeUpload(file: File, softAdvice: string, messages: UploadMessage[]): Promise<DecodedUpload | null> {
  const refusal = checkFile(file);
  if (refusal) {
    messages.push(['err', refusal]);
    return null;
  }
  try {
    const url = await readAsDataURL(file),
      img = await loadImage(url);
    const { naturalWidth: width, naturalHeight: height } = img;
    if (Math.min(width, height) < SOFT_PIXELS)
      messages.push(['warn', `${file.name} is only ${width}×${height} px, so it will look soft beyond a small print.${softAdvice}`]);
    return { name: file.name, url, img };
  } catch {
    // Unreadable files are reported to the user in the message below, not logged.
    messages.push(['err', `${file.name} couldn’t be read. The file may be damaged or not really a JPG, PNG or WebP.`]);
    return null;
  }
}

/**
 * Validates and loads files onto the card (as many as it holds; every good one also goes into the photo store).
 * @param files the chosen or dropped files
 * @returns messages to show under the upload area
 */
export async function addFiles(files: File[]): Promise<UploadMessage[]> {
  const messages: UploadMessage[] = [];
  const added: Photo[] = [],
    stored: DecodedUpload[] = [];
  const limit = maxPhotos(getState().design.product);
  let room = limit - getState().photos.length,
    leftOut = 0;
  for (const file of files) {
    const upload = await decodeUpload(file, ' Use the original photo if you have it.', messages);
    if (!upload) continue;
    stored.push(upload);
    if (room > 0) {
      room--;
      added.push(makePhoto(upload.img, upload.name, upload.url));
    } else leftOut++;
  }
  if (added.length) {
    const { photos, design } = getState();
    setPhotos([...photos, ...added]);
    if (!photos.length && design.layout === 'text') setDesign({ layout: 'full' });
  }
  // Every good upload goes into the photo store, including ones the card has no room for.
  await storePhotos(stored);
  if (leftOut) {
    const howMany = leftOut === 1 ? 'one photo was' : `${leftOut} photos were`;
    messages.push(['warn', `This design holds up to ${limit} photos, so ${howMany} saved to your photo store only. Tap it there to swap it in.`]);
  }
  return messages;
}

/**
 * Photo library upload: checks and keeps the files in the photo store without putting them on the card.
 * @param files the chosen or dropped files
 * @returns messages to show under the upload area
 */
export async function addToLibrary(files: File[]): Promise<UploadMessage[]> {
  const messages: UploadMessage[] = [],
    stored: DecodedUpload[] = [];
  for (const file of files) {
    const upload = await decodeUpload(file, '', messages);
    if (upload) stored.push(upload);
  }
  await storePhotos(stored);
  const howMany = stored.length === 1 ? '1 photo' : `${stored.length} photos`;
  if (stored.length) toast(`${howMany} added to your library.`);
  return messages;
}

/**
 * The print-file builders (PDF, PNG, envelope, pack), loaded on the first export so they stay out of the start-up bundle.
 * @returns engine/export.ts
 */
const printFiles = (): Promise<typeof import('../engine/export')> => import('../engine/export');

/**
 * Report a failed download: logged, and toasted with its message or the fallback.
 * @param error what was thrown
 * @param fallback the toast when the error has no message
 */
function reportFailure(error: unknown, fallback: string): void {
  logError('handled', error);
  toast(error instanceof Error && error.message ? error.message : fallback);
}

/** Save the print file: the PDF, or one PNG per print page when the format is PNG. */
export async function downloadPrintFile(): Promise<void> {
  const design = getState().design;
  try {
    await ensureFonts(fontsFor(design));
    if (design.exp.format === 'png') {
      for (const page of pagesOf(design)) await downloadPNG(page);
      return;
    }
    const { blob, name } = await (await printFiles()).buildPDF(input());
    await saveFile(name, blob);
  } catch (error) {
    reportFailure(error, 'The file couldn’t be created.');
  }
}

/**
 * Documents for print shops: a quote request for this design, or the specification catalog for every product.
 * @param kind which document
 */
export async function downloadQuote(kind: 'design' | 'catalog'): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const quote = await import('../engine/quote');
    const file = kind === 'design' ? await quote.buildQuoteRequest(input()) : await quote.buildQuoteCatalog();
    await saveFile(file.name, file.blob);
  } catch (error) {
    reportFailure(error, 'The document couldn’t be created.');
  }
}

/**
 * Envelope files on their own: the print-on-envelope PDF or the fold-your-own template.
 * @param kind which file
 */
export async function downloadEnvelope(kind: 'pdf' | 'template'): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const files = await printFiles();
    const file = kind === 'pdf' ? await files.buildEnvelopePDF(input()) : await files.buildEnvelopeTemplate(input());
    if (!file) {
      toast('This envelope is too big for a printable template. Use the envelope PDF on a ready-made envelope.');
      return;
    }
    await saveFile(file.name, file.blob);
  } catch (error) {
    reportFailure(error, 'The envelope file couldn’t be created.');
  }
}

/**
 * Save one print page as a PNG.
 * @param page the page (engine/printPages.ts)
 */
export async function downloadPNG(page: PrintPage): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { blob, name } = await (await printFiles()).buildPNG(page, input());
    await saveFile(name, blob);
  } catch (error) {
    reportFailure(error, 'The image couldn’t be created.');
  }
}

/**
 * One ZIP with every front and back as separate PNGs, the print PDF and a print-spec text file.
 * @param onStep told what is being made, for a progress line
 */
export async function downloadPack(onStep?: (msg: string) => void): Promise<void> {
  try {
    await ensureFonts(fontsFor(getState().design));
    const { blob, name } = await (await printFiles()).buildPack(input(), onStep);
    await saveFile(name, blob);
  } catch (error) {
    reportFailure(error, 'The print pack couldn’t be created.');
  }
}

/* ---------- products ---------- */

/**
 * The localStorage key of a product's last design.
 * @param product the product
 * @returns the key
 */
const productKey = (product: ProductId) => `chitthi-product-${product}`;

/**
 * Switch to another product. Each product keeps its own last design (size, layout, options, words),
 * so going Postcard → Calendar → Postcard brings the postcard back as it was. Photos are shared.
 * @param product the product to switch to
 */
export function switchProduct(product: ProductId): void {
  const current = getState().design;
  if (current.product === product) return;
  try {
    localStorage.setItem(productKey(current.product), JSON.stringify(current));
  } catch {
    /* storage full or blocked */
  }
  let next: Design | null = null;
  try {
    const savedJson = localStorage.getItem(productKey(product));
    if (savedJson) next = mergeDesign(JSON.parse(savedJson));
  } catch {
    /* ignore a damaged copy */
  }
  replaceCard(next ?? productDesign(product, current), getState().photos, null);
  setUI({ side: 'front', slot: 0, calPage: 0 });
  void ensureFonts(fontsFor(getState().design));
}

/**
 * From the landing page: open the studio on a product, starting at the first step.
 * @param product the product
 */
export function startProduct(product: ProductId): void {
  switchProduct(product);
  setUI({ screen: 'studio', pane: 'photos' });
}

/** The card as the renderers take it. */
type CardInput = ReturnType<typeof input>;

/**
 * The matching envelope as layers for the 3D view: address side, back without the flap, the flap, and its lining.
 * @param card the card
 * @returns the layers as image URLs, and the envelope's size in mm and name
 */
function envelopeFaces(card: CardInput): NonNullable<ViewerFaces['envelope']> {
  const canvas = document.createElement('canvas'),
    pixelsPerMm = 1000 / 250;
  const layer = (face: 'front' | 'body' | 'flap' | 'liner') => {
    const spec = renderEnvelope(canvas, face, pixelsPerMm, card);
    return { spec, url: face === 'front' || face === 'body' ? canvas.toDataURL('image/jpeg', 0.88) : canvas.toDataURL('image/png') };
  };
  const front = layer('front');
  return { front: front.url, body: layer('body').url, flap: layer('flap').url, liner: layer('liner').url, w: front.spec.w, h: front.spec.h, name: front.spec.name };
}

/**
 * Every calendar month for the all-months views, at a lighter resolution (twelve pages share the screen).
 * @param card the card
 * @param pageCount the number of months
 * @param longSideMm the card's long side in mm
 * @returns each month as a JPEG URL and its label
 */
function monthPages(card: CardInput, pageCount: number, longSideMm: number): NonNullable<ViewerFaces['pages']> {
  const pixelsPerMm = 900 / longSideMm,
    canvas = document.createElement('canvas');
  return Array.from({ length: pageCount }, (_, page) => {
    renderCard(canvas, 'front', pixelsPerMm, 0, card, { page });
    const { month, year } = calMonth(card.d, page);
    return { src: canvas.toDataURL('image/jpeg', 0.86), label: `${MONTHS[month]} ${year}` };
  });
}

/**
 * The card drawn for the 3D viewer and the gallery's thumbnails.
 * @param longSide pixels on the card's long side
 * @param quality JPEG quality (0–1)
 * @param isAllPages also draw the envelope and every calendar month (the viewer, not thumbnails)
 * @returns the faces as image URLs, with the card's size and shape
 */
function faces(longSide: number, quality: number, isAllPages = false): ViewerFaces {
  const card = input(),
    { w: width, h: height } = cardMM(card.d),
    pixelsPerMm = longSide / Math.max(width, height),
    size = sizeOf(card.d);
  const frontCanvas = document.createElement('canvas'),
    backCanvas = document.createElement('canvas');
  // The single-page view opens on the month shown in the preview.
  const pageCount = calPages(card.d),
    page = Math.min(getState().ui.calPage, pageCount - 1);
  renderCard(frontCanvas, 'front', pixelsPerMm, 0, card, { page });
  renderCard(backCanvas, 'back', pixelsPerMm, 0, card);
  const out: ViewerFaces = {
    front: frontCanvas.toDataURL('image/jpeg', quality),
    back: backCanvas.toDataURL('image/jpeg', quality),
    w: width,
    h: height,
    round: !!size.instax,
    corner: cornerMM(card.d) || undefined,
    circle: size.shape === 'circle' || undefined,
  };
  if (isAllPages && card.d.env.on) out.envelope = envelopeFaces(card);
  if (isAllPages && pageCount > 1) out.pages = monthPages(card, pageCount, Math.max(width, height));
  return out;
}

/**
 * Open the 3D viewer.
 * @param givenFaces faces to show (a gallery design's); missing = the current card
 * @param start the view to open on
 */
export async function open3D(givenFaces?: ViewerFaces, start?: ViewerFaces['start']): Promise<void> {
  await ensureFonts(fontsFor(getState().design));
  const viewer = givenFaces ?? faces(1400, 0.9, true);
  setUI({ viewer: start ? { ...viewer, start } : viewer });
}

/* ---------- gallery ---------- */

/**
 * The current card as a gallery record: design, photos and rendered thumbnails of both faces.
 * @param id the record's id
 * @returns the record
 */
async function currentRecord(id: string): Promise<SavedDesign> {
  await ensureFonts(fontsFor(getState().design));
  const { design, photos } = getState();
  const thumbnails = faces(900, 0.85),
    size = sizeOf(design).name;
  return {
    id,
    name: design.designName.trim() || `${design.heading || 'Postcard'} – ${size}`,
    updated: Date.now(),
    w: thumbnails.w,
    h: thumbnails.h,
    round: thumbnails.round,
    size,
    design,
    photos: photos.map(photoMeta),
    front: thumbnails.front,
    back: thumbnails.back,
  };
}

/**
 * A gallery backup's text.
 * @param designs the records
 * @returns the JSON
 */
const backupJSON = (designs: SavedDesign[]) =>
  JSON.stringify({ app: 'chitthi', version: 2, exported: new Date().toISOString(), designs });

/**
 * Save the current card to the gallery.
 * @param isNew save as a new design even when the card came from one
 */
export async function saveDesign(isNew: boolean): Promise<void> {
  try {
    const currentId = getState().designId;
    const record = await currentRecord(isNew || !currentId ? newRecordId('d') : currentId);
    await db.put(record);
    setDesignId(record.id);
    toast(`Saved “${record.name}” to your gallery.`);
    window.dispatchEvent(new Event('chitthi:gallery'));
  } catch (error) {
    logError('handled', error);
    toast(
      error instanceof DOMException && error.name === 'QuotaExceededError'
        ? 'Your browser is out of space for the gallery. Delete an older design and try again.'
        : 'The gallery isn’t available in this browser.',
    );
  }
}

/**
 * Open a gallery design in the studio.
 * @param id the saved design's id (nothing happens when it is gone)
 */
export async function openDesign(id: string): Promise<void> {
  const saved = await db.get(id);
  if (!saved) return;
  const design = mergeDesign(saved.design);
  design.designName = saved.name;
  replaceCard(design, await photosFromMeta(saved.photos), saved.id);
  await ensureFonts(fontsFor(design));
  setUI({ pane: 'photos', side: 'front' });
  toast(`Opened “${saved.name}”.`);
}

/** Start a new card of the same product (undoable). */
export function newCard(): void {
  const current = getState().design;
  replaceCard(productDesign(current.product, current), [], null);
  setUI({ pane: 'photos', side: 'front' });
  toast('New card started. Use Undo to go back.');
}

/** Save every gallery design as one backup file (.json). */
export async function exportBackup(): Promise<void> {
  try {
    const records = await db.all();
    if (!records.length) {
      toast('Your gallery is empty, so there’s nothing to back up yet.');
      return;
    }
    const blob = new Blob([backupJSON(records)], { type: 'application/json' });
    await saveFile(`chitthi-gallery-backup-${new Date().toISOString().slice(0, 10)}.json`, blob);
  } catch (error) {
    logError('handled', error);
    toast('The backup couldn’t be created.');
  }
}

/** Saves the current card as a single .chitthi file (photos included) to share or keep outside the gallery. */
export async function exportDesignFile(): Promise<void> {
  try {
    const record = await currentRecord(getState().designId ?? newRecordId('d'));
    const base = record.name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chitthi-design';
    await saveFile(`${base}.chitthi`, new Blob([backupJSON([record])], { type: 'application/json' }));
  } catch (error) {
    logError('handled', error);
    toast('The design file couldn’t be created.');
  }
}

/**
 * Read a chosen gallery backup or design file (see `importText`).
 * @param file the file
 */
export const importBackup = async (file: File): Promise<void> => {
  await importText(file.name, await file.text());
};

/** A record in a backup file: a saved design, or one from before 2.x's `design` field (then `state`). */
type ImportedRecord = Omit<SavedDesign, 'design'> & { design?: unknown; state?: unknown };

/**
 * Whether a value is an image data URL.
 * @param value the value
 * @returns true for a `data:image/…` string
 */
const isImageUrl = (value: unknown) => typeof value === 'string' && value.startsWith('data:image/');

/**
 * Whether a backup's entry is a whole record: an id, a design, both thumbnails and photos with image data.
 * @param entry the entry
 * @returns true when it can go into the gallery (its design is still checked by `mergeDesign`)
 */
function isImportedRecord(entry: unknown): entry is ImportedRecord {
  // The checks below read each field as unknown; the cast only names the fields to read.
  const record = entry as Partial<Record<keyof ImportedRecord, unknown>> | null;
  return (
    !!record &&
    typeof record.id === 'string' &&
    typeof (record.design ?? record.state) === 'object' &&
    isImageUrl(record.front) &&
    isImageUrl(record.back) &&
    Array.isArray(record.photos) &&
    record.photos.every((photo: Partial<PhotoMeta> | null) => photo && isImageUrl(photo.url))
  );
}

/**
 * The message after a backup was read.
 * @param restored how many designs went into the gallery
 * @param skipped how many were damaged
 * @returns the toast
 */
function restoredMessage(restored: number, skipped: number): string {
  if (!restored) return 'No designs in that file could be read.';
  const skippedNote = skipped ? `; ${skipped} skipped because they were damaged` : '';
  return `Restored ${restored} design${restored > 1 ? 's' : ''}${skippedNote}.`;
}

/**
 * Reads a gallery backup (.json) or a single design (.chitthi). Everything valid goes into the gallery; a
 * .chitthi file is also opened in the studio.
 * @param name the file's name (its extension says which it is)
 * @param text the file's text
 */
export async function importText(name: string, text: string): Promise<void> {
  const isSingle = /\.chitthi$/i.test(name);
  if (!isSingle && !/\.json$/i.test(name)) {
    toast('Choose a Chitthi design (.chitthi) or gallery backup (.json).');
    return;
  }
  try {
    const data = JSON.parse(text) as { app?: string; designs?: unknown[] };
    if (data.app !== 'chitthi' || !Array.isArray(data.designs)) throw new Error('Not a Chitthi backup or design file.');
    const records = data.designs.filter(isImportedRecord);
    for (const record of records) await db.put({ ...record, design: mergeDesign(record.design ?? record.state) });
    window.dispatchEvent(new Event('chitthi:gallery'));
    const first = records.at(0);
    if (isSingle && first) {
      await openDesign(first.id);
      setUI({ screen: 'studio', gallery: false });
      return;
    }
    toast(restoredMessage(records.length, data.designs.length - records.length));
  } catch (error) {
    logError('handled', error);
    toast(isSingle ? 'That file isn’t a Chitthi design.' : 'That file isn’t a Chitthi gallery backup.');
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
    void storePhotos(photos.map((photo) => ({ name: photo.name, url: photo.url, img: photo.orig })));
    resetHistory();
    toast('Your last card is back, photos included.');
  } catch {
    /* nothing saved */
  }
}

/**
 * Open a gallery sample in the studio: its product, design and photos (which also go into the photo store).
 * @param design the sample's design
 * @param photos its photos
 */
export async function openSample(design: Design, photos: Photo[]): Promise<void> {
  if (getState().design.product !== design.product) switchProduct(design.product);
  replaceCard(structuredClone(design), photos, null);
  await ensureFonts(fontsFor(design));
  setUI({ gallery: false, screen: 'studio', pane: 'photos', side: 'front', slot: 0, calPage: 0 });
  void storePhotos(photos.map((photo) => ({ name: photo.name, url: photo.url, img: photo.orig })));
  toast(`Opened the “${design.designName}” sample. Swap in your own photos from the Photos step.`);
}

/** A file in the quote pack's ZIP. */
interface ZipEntry {
  name: string;
  data: Blob | string;
}

/** What the quote pack collects from the saved designs. */
interface QuoteParts {
  /** Each design's quote request PDF, numbered. */
  entries: ZipEntry[];
  /** The order sheet's rows. */
  items: { label: string; d: Design }[];
  /** Every photo's file name, for the credits. */
  photoNames: string[];
}

/**
 * Each saved design's quote request, order-sheet row and photo names.
 * @param ids the saved designs (missing ones are skipped)
 * @param onStep told which design is being made
 * @returns the parts
 */
async function quoteParts(ids: string[], onStep?: (msg: string) => void): Promise<QuoteParts> {
  const quote = await import('../engine/quote');
  const parts: QuoteParts = { entries: [], items: [], photoNames: [] };
  for (const id of ids) {
    const saved = await db.get(id);
    if (!saved) continue;
    const number = parts.items.length + 1;
    onStep?.(`Design ${number} of ${ids.length}…`);
    const design = mergeDesign(saved.design);
    design.designName = saved.name;
    const photos = await photosFromMeta(saved.photos);
    await ensureFonts(fontsFor(design));
    const request = await quote.buildQuoteRequest({ d: design, photos });
    parts.entries.push({ name: `${String(number).padStart(2, '0')}-${request.name}`, data: request.blob });
    parts.items.push({ label: saved.name, d: design });
    parts.photoNames.push(...photos.map((photo) => photo.name));
  }
  return parts;
}

/**
 * One quote pack for several saved designs: an order sheet with a row per design (and per envelope size), a quote
 * request PDF for each design, the specification catalogue, and the photo credits, in one ZIP to send to printers.
 * @param ids the saved designs
 * @param onStep told what is being made, for a progress line
 */
export async function downloadQuotePack(ids: string[], onStep?: (msg: string) => void): Promise<void> {
  if (!ids.length) return;
  try {
    const { entries, items, photoNames } = await quoteParts(ids, onStep);
    if (!items.length) return;
    const quote = await import('../engine/quote');
    const { creditsText } = await import('../lib/credits');
    onStep?.('Writing the order sheet…');
    entries.unshift({ name: 'ORDER-SHEET.csv', data: quote.orderSheetCSV(items) });
    const catalog = await quote.buildQuoteCatalog();
    entries.push({ name: catalog.name, data: catalog.blob });
    const credits = creditsText(photoNames);
    if (credits) entries.push({ name: 'PHOTO-CREDITS.txt', data: credits.replace(/\n/g, '\r\n') });
    onStep?.('Packing…');
    const zip = await makeZip(entries);
    const plural = items.length > 1 ? 's' : '';
    await saveFile(`chitthi-quote-${items.length}-design${plural}.zip`, zip);
    toast(`Quote pack ready: ${items.length} design${plural}, an order sheet and a quote request each.`);
  } catch (error) {
    logError('handled', error);
    toast('The quote pack couldn’t be made. Try again.');
  }
}
