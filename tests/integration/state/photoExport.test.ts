import { describe, expect, it } from 'vitest';
import { DEFAULT_EDIT } from '@/engine/instagram';
import { missingMedia } from '@/engine/mediaFile';
import { setIgState, type IgItem } from '@/state/instagram';
import { renderBatch } from '@/state/instagramExport';

/*
 * 408 T022 (D4): the photo batch isn't rendered while a photo's file is missing; the message names the files.
 */

/**
 * A photo of the batch (its preview is never drawn here).
 * @param id its id
 * @param file its file
 * @returns the photo
 */
const photo = (id: string, file: IgItem['file']): IgItem => ({
  id,
  name: `${id}.jpg`,
  file,
  w: 10,
  h: 10,
  preview: {} as HTMLCanvasElement,
  edit: { ...DEFAULT_EDIT },
  layers: [],
});

describe('408: photo export with missing files (D4)', () => {
  it('is refused, naming the missing files, before anything is drawn', async () => {
    const gone = missingMedia({ id: 'm1', name: 'hills.jpg', size: 10, type: 'image/jpeg' });
    setIgState({ items: [photo('a', gone), photo('b', new Blob(['x'])), photo('c', gone)] });
    await expect(renderBatch()).rejects.toThrow('Find the missing files first: hills.jpg.');
  });
});
