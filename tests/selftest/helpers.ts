/*
 * Development only: small helpers the self-test's checks share. Reading the self-test's own arrays (test photos,
 * decoded colours, sampled pixels) where an entry must be there, a canvas's 2D context, and the problems a failed
 * check lists. A missing entry or context is a broken check, so it throws with the check's words (the check's group
 * reports it as one failure) instead of reading undefined.
 */

/** A list that can be read with `at` (arrays, typed arrays). */
export interface ListLike<T> {
  readonly length: number;
  at(index: number): T | undefined;
}

/**
 * The entry at an index of a list that must have it.
 * @param list the list
 * @param index the index (negative counts from the end, as `Array.at`)
 * @param what what the entry is, for the error
 * @returns the entry
 * @throws when the list has no entry there
 */
export function entryAt<T>(list: ListLike<T>, index: number, what = 'entry'): T {
  const entry = list.at(index);
  if (entry === undefined) throw new Error(`Self-test: no ${what} at ${index} (of ${list.length}).`);
  return entry;
}

/**
 * The entry at an index of a non-empty list, wrapping around (`list[index % list.length]`).
 * @param list the list
 * @param index any whole number from 0
 * @param what what the entry is, for the error
 * @returns the entry
 * @throws when the list is empty
 */
export function cycleOf<T>(list: ListLike<T>, index: number, what = 'entry'): T {
  return entryAt(list, index % list.length, what);
}

/**
 * A canvas's 2D context, which the self-test's canvases always have.
 * @param canvas the canvas
 * @param options the context's options (e.g. `willReadFrequently`)
 * @returns its 2D context
 * @throws when the engine gives none
 */
export function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('Self-test: canvas unavailable.');
  return context;
}

/**
 * The first few problems of a check, for its message.
 * @param problems what went wrong
 * @param count how many to show
 * @returns `: first; second; third`, or '' when there are none
 */
export function firstFew(problems: readonly string[], count = 3): string {
  return problems.length ? `: ${problems.slice(0, count).join('; ')}` : '';
}

/**
 * The mean colour of some RGBA pixels (e.g. a patch from `getImageData`).
 * @param pixels the pixels, 4 bytes each
 * @returns the mean red, green and blue (0–255, not rounded)
 */
export function meanRgb(pixels: Uint8ClampedArray): [number, number, number] {
  let red = 0,
    green = 0,
    blue = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    red += pixels.at(index) ?? 0;
    green += pixels.at(index + 1) ?? 0;
    blue += pixels.at(index + 2) ?? 0;
  }
  const count = pixels.length / 4;
  return [red / count, green / count, blue / count];
}

/**
 * Waits.
 * @param ms how long, in milliseconds
 * @returns a promise settled after it
 */
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * What a caught error says, for a failed check's message.
 * @param error anything thrown
 * @returns its message, or the value as text
 */
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * A value a check needs (a tool, a provider, a file it made), which the code under test should have given.
 * @param value the value, or null / undefined
 * @param what what it is, for the error
 * @returns the value
 * @throws when it is missing
 */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Self-test: no ${what}.`);
  return value;
}

/**
 * A canvas as an image file.
 * @param canvas the canvas
 * @param type the file's type, e.g. `image/png`
 * @param quality the JPEG or WebP quality (0–1), when it has one
 * @returns the file
 * @throws (rejects) when the canvas can't be encoded
 */
export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Self-test: the canvas gave no ${type}.`));
      },
      type,
      quality,
    );
  });
}

/**
 * Whether a colour is within `tol` levels of another in every channel of the wanted one.
 * @param got the colour read, or none
 * @param want the colour wanted
 * @param tol the most levels a channel may be off
 * @returns whether they match (false when there is no colour)
 */
export function isNear(got: ListLike<number> | null | undefined, want: readonly number[], tol = 8): boolean {
  return !!got && want.every((level, channel) => Math.abs(level - (got.at(channel) ?? NaN)) <= tol);
}
