import type { MediaFile } from '@/engine/mediaFile';

/**
 * A test fixture's file as the Blob it is (fixtures are always made from Blobs, never disk media).
 * @param file the fixture's file
 * @returns the Blob
 * @throws when the file isn't a Blob
 */
export function blobFile(file: MediaFile): Blob {
  if (!(file instanceof Blob)) throw new Error(`${file.name} isn’t a Blob in this test.`);
  return file;
}
