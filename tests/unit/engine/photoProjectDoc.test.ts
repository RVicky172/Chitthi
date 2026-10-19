import { describe, expect, it } from 'vitest';
import { IG_CAPTION_MAX, IG_MAX_BATCH } from '@/data/instagram';
import { DEFAULT_EDIT, mergeEdit } from '@/engine/instagram';
import type { Layer } from '@/engine/layers';
import {
  mergePhotoProject,
  photoDocument,
  photoFromDocument,
  type EditorBatch,
  type EditorPhoto,
  type PhotoProjectDoc,
} from '@/engine/photoProjectDoc';
import type { DocMedia } from '@/engine/projectDoc';
import { defined } from '../../support/defined';

/*
 * 408 T012 (AC-2, AC-6): the photo studio's batch → its saved document → the batch again → the same document, byte for
 * byte; damaged, newer and out-of-range documents open what is valid and say what they left out.
 */

/** A file as the tests hold it: its size and type, and the media id it was kept under. */
interface TestFile {
  id: string;
  size: number;
  type: string;
}

const idOf = (file: TestFile): string => file.id;
const fileFor = (media: DocMedia): TestFile => ({ id: media.id, size: media.size, type: media.type });

const hills: TestFile = { id: 'mHills', size: 3_200_000, type: 'image/jpeg' };
const dng: TestFile = { id: 'mRaw', size: 24_000_000, type: 'image/x-adobe-dng' };
const sea: TestFile = { id: 'mSea', size: 1_100_000, type: 'image/png' };

const caption: Layer = {
  id: 'l1',
  kind: 'text',
  x: 0.5,
  y: 0.8,
  w: 0.7,
  rot: 0,
  opacity: 1,
  text: 'Monsoon',
  font: 'Poppins',
  size: 0.07,
  color: '#ffffff',
  align: 'center',
  bold: true,
  italic: false,
  outline: '',
  bg: '',
  shadow: true,
};

/** An edit with everything a photo can carry: placement, colour, and masks of several kinds (through the gate). */
const editedLook = mergeEdit({
  fit: 'fit',
  bg: 'blur',
  zoom: 1.6,
  px: -0.3,
  py: 0.4,
  rot: 90,
  flip: true,
  adjust: { look: 'warm', exposure: 0.4, contrast: 12, vignette: 30 },
  masks: [
    {
      id: 'k1',
      name: 'Sky',
      on: true,
      invert: false,
      parts: [
        { id: 'p1', kind: 'linear', combine: 'add', invert: false, x: 0.5, y: 0.3, angle: 90, width: 0.2 },
        { id: 'p2', kind: 'radial', combine: 'subtract', invert: true, x: 0.4, y: 0.5, rx: 0.2, ry: 0.1, angle: 10, feather: 40 },
        {
          id: 'p3',
          kind: 'brush',
          combine: 'add',
          invert: false,
          strokes: [{ pts: [0.1, 0.1, 0.2, 0.25], size: 0.05, feather: 50, flow: 80, erase: false }],
        },
      ],
      adjust: { exposure: -0.5 },
    },
  ],
});

/**
 * A photo of the batch.
 * @param id its id
 * @param file its file
 * @param more the fields that differ from a plain photo
 * @returns the photo
 */
function photo(id: string, file: TestFile, more: Partial<EditorPhoto<TestFile>> = {}): EditorPhoto<TestFile> {
  return { id, name: `${id}.jpg`, file, w: 4000, h: 3000, edit: { ...DEFAULT_EDIT }, layers: [], ...more };
}

/** A batch using everything a photo project saves. */
const fullBatch: EditorBatch<TestFile> = {
  items: [
    photo('ig1', hills, { name: 'hills.jpg', edit: editedLook, layers: [caption] }),
    photo('ig2', dng, { name: 'DSC_0042.dng', w: 6000, h: 4000, raw: true }),
    // The same file added twice: one media entry.
    photo('ig3', hills, { name: 'hills.jpg' }),
    photo('ig4', sea, { name: 'sea.png', w: 1080, h: 1350 }),
  ],
  selected: 'ig2',
  format: 'square',
  limit: 10,
  fileType: 'png',
  quality: 85,
  caption: 'Rain over the hills #monsoon',
};

/**
 * The batch's document, through JSON, the gate and back to the batch and to a document again.
 * @param batch the batch
 * @param desktop whether the gate is the desktop app's
 * @returns the first and second documents' JSON
 */
function roundTrip(batch: EditorBatch<TestFile>, desktop = true): { first: string; second: string } {
  const first = JSON.stringify(photoDocument(batch, 'Monsoon post', idOf));
  const merged = mergePhotoProject(JSON.parse(first), desktop);
  expect(merged.dropped).toEqual([]);
  const opened = photoFromDocument(merged.doc, fileFor);
  return { first, second: JSON.stringify(photoDocument(opened.batch, opened.name, idOf)) };
}

/**
 * A valid document to break.
 * @returns a fresh copy
 */
const validDoc = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(photoDocument(fullBatch, 'Monsoon post', idOf))) as Record<string, unknown>;

describe('photo project document (408 T012)', () => {
  it('a batch → document → batch → document is the same, byte for byte', () => {
    const { first, second } = roundTrip(fullBatch);
    expect(second).toBe(first);
  });

  it('an empty batch with default settings round-trips too', () => {
    const empty: EditorBatch<TestFile> = { items: [], selected: null, format: 'portrait', limit: 4, fileType: 'jpeg', quality: 92, caption: '' };
    const { first, second } = roundTrip(empty);
    expect(second).toBe(first);
  });

  it('every setting, the selection, edits, masks, layers and the RAW flag come back', () => {
    const doc = photoDocument(fullBatch, 'Monsoon post', idOf);
    const { name, batch } = photoFromDocument(mergePhotoProject(JSON.parse(JSON.stringify(doc)), true).doc, fileFor);
    expect(name).toBe('Monsoon post');
    expect(batch.format).toBe('square');
    expect(batch.limit).toBe(10);
    expect(batch.fileType).toBe('png');
    expect(batch.quality).toBe(85);
    expect(batch.caption).toBe('Rain over the hills #monsoon');
    expect(batch.selected).toBe('ig2');
    const [first, second, third, fourth] = batch.items;
    expect(defined(first, 'ig1').edit).toEqual(editedLook);
    expect(defined(first, 'ig1').edit.masks.map((mask) => mask.parts.map((part) => part.kind))).toEqual([['linear', 'radial', 'brush']]);
    expect(defined(first, 'ig1').layers).toEqual([caption]);
    expect(defined(second, 'ig2').raw).toBe(true);
    expect(defined(first, 'ig1').raw).toBeUndefined();
    expect(defined(fourth, 'ig4')).toMatchObject({ name: 'sea.png', w: 1080, h: 1350, file: { id: 'mSea' } });
    // The same file twice opens as the same file.
    expect(defined(third, 'ig3').file).toBe(defined(first, 'ig1').file);
  });

  it('lists each file once, in the order the batch first uses it', () => {
    const doc = photoDocument(fullBatch, 'Monsoon post', idOf);
    expect(doc.media.map((entry) => entry.id)).toEqual(['mHills', 'mRaw', 'mSea']);
    expect(doc.media[0]).toEqual({ id: 'mHills', kind: 'photo', name: 'hills.jpg', type: 'image/jpeg', size: 3_200_000, w: 4000, h: 3000, srcDur: 0 });
    expect(doc.items.map((item) => item.media)).toEqual(['mHills', 'mRaw', 'mHills', 'mSea']);
  });

  it('writes edits and layers with sorted keys, so the same batch always gives the same bytes', () => {
    const reordered = Object.fromEntries(Object.entries(editedLook).reverse()) as typeof editedLook;
    const again = { ...fullBatch, items: fullBatch.items.map((item, index) => (index === 0 ? { ...item, edit: reordered } : item)) };
    expect(JSON.stringify(photoDocument(again, 'Monsoon post', idOf))).toBe(JSON.stringify(photoDocument(fullBatch, 'Monsoon post', idOf)));
  });
});

describe('mergePhotoProject (408 T012, AC-6)', () => {
  it('turns away what isn’t a photo project, and documents from a newer version', () => {
    expect(mergePhotoProject('nope', true)).toMatchObject({ doc: { items: [] }, dropped: ['This isn’t a photo project.'] });
    expect(mergePhotoProject({ ...validDoc(), version: 2 }, true)).toMatchObject({
      doc: { items: [] },
      dropped: ['This project is from a newer version of Chitthi Studio (version 2).'],
    });
    expect(mergePhotoProject({ items: [] }, true).dropped).toEqual(['This isn’t a photo project.']);
  });

  it('never throws, whatever it is given', () => {
    const hostile = Object.defineProperty({ version: 1 }, 'items', {
      get() {
        throw new Error('boom');
      },
    });
    const merged = mergePhotoProject(hostile, true);
    expect(merged.doc.items).toEqual([]);
    expect(merged.dropped).toEqual(['The project couldn’t be read (boom).']);
  });

  it('settings out of range are clamped or replaced by the defaults', () => {
    const { doc, dropped } = mergePhotoProject(
      { ...validDoc(), format: 'banner', limit: 99, fileType: 'gif', quality: 20, caption: 'x'.repeat(IG_CAPTION_MAX + 50) },
      true,
    );
    expect(dropped).toEqual([]);
    expect(doc).toMatchObject({ format: 'portrait', limit: IG_MAX_BATCH, fileType: 'jpeg', quality: 60 });
    expect(doc.caption).toHaveLength(IG_CAPTION_MAX);
    expect(mergePhotoProject({ ...validDoc(), quality: 'high', limit: 'x', caption: 7 }, true).doc).toMatchObject({ quality: 92, limit: 4, caption: '' });
  });

  it('the batch limit is never below the photos the batch holds', () => {
    expect(mergePhotoProject({ ...validDoc(), limit: 2 }, true).doc.limit).toBe(4);
  });

  it('keeps at most 20 photos, saying how many were left out', () => {
    const doc = validDoc();
    const first = defined((doc.items as unknown[])[0], 'item');
    const items = Array.from({ length: 23 }, (_, index) => ({ ...(first as object), id: `p${index}` }));
    const merged = mergePhotoProject({ ...doc, items }, true);
    expect(merged.doc.items).toHaveLength(IG_MAX_BATCH);
    expect(merged.dropped).toEqual([`A batch holds up to ${IG_MAX_BATCH} photos; 3 were left out.`]);
  });

  it('photos without their media, or unreadable, are left out; the others open', () => {
    const doc = validDoc();
    const items = doc.items as Record<string, unknown>[];
    const merged = mergePhotoProject({ ...doc, items: [items[0], { ...items[1], media: 'gone' }, 'junk', items[3]] }, true);
    expect(merged.doc.items.map((item) => item.id)).toEqual(['ig1', 'ig4']);
    expect(merged.dropped).toEqual(['A photo without its media was left out.', 'A photo was unreadable and was left out.']);
    // Media no photo uses any more isn't kept.
    expect(merged.doc.media.map((entry) => entry.id)).toEqual(['mHills', 'mSea']);
    // The selected photo was left out: nothing is selected.
    expect(merged.doc.selected).toBeNull();
  });

  it('media that isn’t a photo, or unreadable, doesn’t count as a photo’s media', () => {
    const doc = validDoc();
    const media = (doc.media as Record<string, unknown>[]).map((entry) => (entry.id === 'mSea' ? { ...entry, kind: 'audio' } : entry));
    const merged = mergePhotoProject({ ...doc, media: [...media, { id: '../etc' }] }, true);
    expect(merged.doc.items.map((item) => item.id)).toEqual(['ig1', 'ig2', 'ig3']);
    expect(merged.dropped).toEqual(['A media entry was unreadable and was left out.', 'A photo without its media was left out.']);
  });

  it('two photos with one id: the second is renamed', () => {
    const doc = validDoc();
    const items = (doc.items as Record<string, unknown>[]).map((item) => ({ ...item, id: item.id === 'ig3' ? 'ig1' : item.id }));
    const merged = mergePhotoProject({ ...doc, items }, true);
    const ids = merged.doc.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids[0]).toBe('ig1');
    expect(merged.dropped).toEqual(['Two photos had the id “ig1”; one was renamed.']);
  });

  it('a photo’s edits and layers go through their own gates', () => {
    const doc = validDoc();
    const items = (doc.items as Record<string, unknown>[]).map((item, index) =>
      index === 0 ? { ...item, edit: { zoom: 99, rot: 45, bg: 'red', masks: 'x' }, layers: [{ kind: 'text', text: 'ok' }, { kind: 'nope' }] } : item,
    );
    const merged = mergePhotoProject({ ...doc, items }, true);
    const first = defined(merged.doc.items[0], 'first');
    expect(first.edit).toMatchObject({ zoom: 4, rot: 0, bg: '#ffffff', masks: [] });
    expect(first.layers.map((layer) => layer.kind)).toEqual(['text']);
    expect(merged.dropped).toEqual(['1 layer(s) couldn’t be read and were left out.']);
  });

  it('a camera RAW photo opens only in the desktop app', () => {
    const merged = mergePhotoProject(validDoc(), false);
    expect(merged.doc.items.map((item) => item.id)).toEqual(['ig1', 'ig3', 'ig4']);
    expect(merged.dropped).toEqual(['A camera RAW photo was left out: RAW photos open in the desktop app.']);
    expect(merged.doc.media.map((entry) => entry.id)).toEqual(['mHills', 'mSea']);
  });

  it('the name is trimmed and cut to 80 characters; a name that isn’t text is said', () => {
    expect(mergePhotoProject({ ...validDoc(), name: `  ${'é'.repeat(90)} ` }, true).doc.name).toBe('é'.repeat(80));
    const merged = mergePhotoProject({ ...validDoc(), name: 5 }, true);
    expect(merged.doc.name).toBeUndefined();
    expect(merged.dropped).toEqual(['The project’s name couldn’t be read.']);
  });

  it('a photo’s size comes from its media; media without a size leaves the photo out', () => {
    const doc = validDoc();
    const media = (doc.media as Record<string, unknown>[]).map((entry) => (entry.id === 'mSea' ? { ...entry, w: 0 } : entry));
    const merged = mergePhotoProject({ ...doc, media }, true);
    expect(merged.doc.items.map((item) => item.id)).toEqual(['ig1', 'ig2', 'ig3']);
    expect(merged.dropped).toEqual(['A photo without its media was left out.']);
  });

  it('the document type is what the library stores', () => {
    const doc: PhotoProjectDoc = photoDocument(fullBatch, 'Monsoon post', idOf);
    expect(Object.keys(doc)).toEqual(['version', 'name', 'format', 'limit', 'fileType', 'quality', 'caption', 'selected', 'items', 'media']);
  });
});
