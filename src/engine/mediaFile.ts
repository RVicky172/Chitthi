import { BlobSource, UrlSource, type Source } from 'mediabunny';

/*
 * The file behind a clip, a sound or a photo (408 §5): a Blob (a picked file, or one kept in the browser's storage),
 * disk media (the desktop app's file, read by range requests through chitthi-media://), or a file that is missing
 * (moved, changed or cleared). Every decode site reads through `mediaInput` or `blobOf`, never a Blob directly.
 */

/** A file on disk, desktop only: the page knows its id and URL, never its path (main keeps the paths, D-059). */
export interface DiskMedia {
  /** The media id (engine/mediaKey.ts). */
  id: string;
  /** chitthi-media://<id>; '' when missing. */
  url: string;
  /** Bytes. */
  size: number;
  /** MIME type. */
  type: string;
  /** The file's name. */
  name: string;
  /** The file isn't where it was, or changed: drawn as a placeholder, silent, and the export refused (D4). */
  missing?: true;
}

/** A project's file. */
export type MediaFile = Blob | DiskMedia;

/** What a media store gives for a media id: the file to play and decode, or what is known of a missing one. */
export type OpenedMedia = { file: MediaFile; url: string } | { missing: true; name: string };

/**
 * A file that is missing, standing in for it in the project with what the document knows of it.
 * @param media the media entry's id, name, size and type
 * @returns the stand-in
 */
export const missingMedia = (media: Pick<DiskMedia, 'id' | 'name' | 'size' | 'type'>): DiskMedia => ({
  ...media,
  url: '',
  missing: true,
});

/**
 * Whether a project's file is missing.
 * @param file the file
 * @returns true for a missing file's stand-in
 */
export const isMissing = (file: MediaFile): boolean => !(file instanceof Blob) && file.missing === true;

/**
 * Why an export can't start while files are missing (408 D4: refused rather than made with gaps in it).
 * @param files the project's files
 * @returns "Find the missing files first: …" naming each missing file once, in order; null when none is missing
 */
export function missingFilesMessage(files: readonly MediaFile[]): string | null {
  const names = new Set<string>();
  for (const file of files) if (!(file instanceof Blob) && file.missing) names.add(file.name);
  return names.size ? `Find the missing files first: ${[...names].join(', ')}.` : null;
}

/**
 * A file's name, for messages.
 * @param file the file
 * @param fallback the name of a Blob that isn't a File
 * @returns the name
 */
export function mediaName(file: MediaFile, fallback: string): string {
  if (file instanceof File || !(file instanceof Blob)) return file.name;
  return fallback;
}

/**
 * The error for a missing file.
 * @param file the missing file
 * @returns the error
 */
const missingError = (file: DiskMedia): Error => new Error(`“${file.name}” is missing.`);

/**
 * Mediabunny's source for a file: a BlobSource for a Blob, a UrlSource (range requests) for disk media. A local file
 * that can't be read isn't retried: it moved or changed, and retrying won't bring it back.
 * @param file the file
 * @returns the source
 * @throws for a missing file
 */
export function mediaInput(file: MediaFile): Source {
  if (file instanceof Blob) return new BlobSource(file);
  if (file.missing) throw missingError(file);
  return new UrlSource(file.url, { getRetryDelay: () => null });
}

/**
 * A file's bytes as a Blob, for `createImageBitmap` and the like (photos: small). Disk media is fetched once.
 * @param file the file
 * @returns the Blob
 * @throws for a missing file, or one that can't be read
 */
export async function blobOf(file: MediaFile): Promise<Blob> {
  if (file instanceof Blob) return file;
  if (file.missing) throw missingError(file);
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`“${file.name}” couldn’t be read (${response.status}).`);
  const bytes = await response.blob();
  return bytes.type === file.type ? bytes : new Blob([bytes], { type: file.type });
}
