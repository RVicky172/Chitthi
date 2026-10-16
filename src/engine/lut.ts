import { isObjectLike } from './guards';

/*
 * 3D colour lookup tables (P1.4): `.cube` files (the Adobe / Resolve text format) parsed here, without a library, and
 * applied with tetrahedral interpolation. The GPU program (gpu/lut.ts) reads the same table, packed into a 2D texture,
 * with the same interpolation, so both paths agree. A picture refers to a table by its id (a hash of its contents); the
 * tables themselves live in memory here, put there by the LUT library (lib/userLuts.ts), so edits and undo snapshots
 * stay small. A table that isn't loaded is left out, as if no LUT were set.
 */

/** Largest table side accepted (65³ is the largest size in common use). */
export const LUT_MAX_SIZE = 65;

/** Largest .cube file read, in bytes: a 65³ table written with long numbers is about 9 MB. */
export const LUT_MAX_BYTES = 16 * 1024 * 1024;

/** Three numbers, one per channel. */
type Triple = [number, number, number];

/** A 3D colour lookup table. */
export interface Lut {
  /** Content hash, used by Adjustments.lut. */
  id: string;
  /** From the file's TITLE line, else its name. */
  title: string;
  /** Points per side. */
  size: number;
  /** size³ RGB triples, red changing fastest, then green, then blue (the .cube order). */
  data: Float32Array;
  /** Input range per channel (DOMAIN_MIN / DOMAIN_MAX); 0–1 for almost every file. */
  min: Triple;
  max: Triple;
}

/** A table that can't be read, with a message fit to show the user. */
export class LutError extends Error {}

/**
 * A keyword line's numbers.
 * @param parts the line's words, the keyword first
 * @param count how many numbers it must have
 * @param lineNumber the line's number, for the message
 * @returns the numbers
 * @throws {LutError} when there are not exactly `count` finite numbers
 */
const numbersOf = (parts: string[], count: number, lineNumber: number): number[] => {
  const values = parts.slice(1).map(Number);
  if (values.length !== count || values.some((value) => !Number.isFinite(value))) {
    throw new LutError(`Line ${String(lineNumber)}: expected ${String(count)} number${count > 1 ? 's' : ''}.`);
  }
  return values;
};

/**
 * A keyword line's three numbers.
 * @param parts the line's words, the keyword first
 * @param lineNumber the line's number, for the message
 * @returns the triple
 */
const tripleOf = (parts: string[], lineNumber: number): Triple => {
  const [first = 0, second = 0, third = 0] = numbersOf(parts, 3, lineNumber);
  return [first, second, third];
};

/** A .cube file being read. */
interface CubeReader {
  title: string;
  size: number;
  min: Triple;
  max: Triple;
  data: Float32Array | null;
  /** Colour values read so far. */
  count: number;
}

/**
 * Whether a line holds colour values: it starts with a digit, a sign or a point (keywords start with a letter).
 * @param line the line, trimmed
 * @returns true for a data line
 */
function isDataLine(line: string): boolean {
  const first = line.charCodeAt(0);
  return (first >= 48 && first <= 57) || first === 45 || first === 43 || first === 46;
}

/**
 * Reads a line of colour values into the table.
 * @param reader the file being read
 * @param line the line, trimmed
 * @param lineNumber its number, for messages
 * @throws {LutError} before LUT_3D_SIZE, past the table's size, or for anything but three numbers
 */
function readValues(reader: CubeReader, line: string, lineNumber: number): void {
  const { data, size } = reader;
  if (!data) throw new LutError(`Line ${String(lineNumber)}: colour values before LUT_3D_SIZE.`);
  if (reader.count >= size ** 3) throw new LutError(`Line ${String(lineNumber)}: more values than a ${String(size)}³ table holds.`);
  const parts = line.split(/\s+/);
  if (parts.length !== 3) throw new LutError(`Line ${String(lineNumber)}: expected three numbers (red, green, blue).`);
  parts.forEach((part, channel) => {
    const value = Number(part);
    if (!Number.isFinite(value)) throw new LutError(`Line ${String(lineNumber)}: “${part}” isn’t a number.`);
    // Wild values would overflow the GPU's 16-bit floats; no real table comes near this.
    data[reader.count * 3 + channel] = Math.min(64, Math.max(-64, value));
  });
  reader.count++;
}

/**
 * Reads a keyword line: the title, the size, the input range; unknown keywords are skipped, as the format asks.
 * @param reader the file being read
 * @param line the line, trimmed
 * @param lineNumber its number, for messages
 * @throws {LutError} for a 1D table, a repeated or unusable size, or a range without its numbers
 */
function readKeyword(reader: CubeReader, line: string, lineNumber: number): void {
  const parts = line.split(/\s+/);
  const keyword = (parts[0] ?? '').toUpperCase();
  if (keyword === 'TITLE') {
    reader.title = line
      .slice(5)
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .slice(0, 80);
  } else if (keyword === 'LUT_1D_SIZE') throw new LutError('This is a 1D LUT; Chitthi Studio reads 3D LUTs (LUT_3D_SIZE).');
  else if (keyword === 'LUT_3D_SIZE') {
    if (reader.data) throw new LutError(`Line ${String(lineNumber)}: LUT_3D_SIZE appears twice.`);
    const [size = 0] = numbersOf(parts, 1, lineNumber);
    if (!Number.isInteger(size) || size < 2 || size > LUT_MAX_SIZE) {
      throw new LutError(`The table is ${String(size)} points per side; Chitthi Studio reads 2 to ${String(LUT_MAX_SIZE)}.`);
    }
    reader.size = size;
    reader.data = new Float32Array(size ** 3 * 3);
  } else if (keyword === 'DOMAIN_MIN') reader.min = tripleOf(parts, lineNumber);
  else if (keyword === 'DOMAIN_MAX') reader.max = tripleOf(parts, lineNumber);
  else if (keyword === 'LUT_3D_INPUT_RANGE') {
    const [low = 0, high = 0] = numbersOf(parts, 2, lineNumber);
    reader.min = [low, low, low];
    reader.max = [high, high, high];
  }
}

/**
 * Whether every channel's range is the right way round.
 * @param min the range's starts
 * @param max its ends
 * @returns true when each end is above its start
 */
const rangeValid = (min: Triple, max: Triple): boolean => max[0] > min[0] && max[1] > min[1] && max[2] > min[2];

/**
 * Reads a .cube file.
 * @param text the file's text
 * @param name the file's name (the title when the file has none)
 * @returns the table
 * @throws {LutError} for anything that isn't a valid 3D table of 2 to 65 points per side
 */
export function parseCube(text: string, name = 'LUT'): Lut {
  const reader: CubeReader = { title: '', size: 0, min: [0, 0, 0], max: [1, 1, 1], data: null, count: 0 };
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (isDataLine(line)) readValues(reader, line, index + 1);
    else readKeyword(reader, line, index + 1);
  });
  const { data, size, min, max } = reader;
  if (!data) throw new LutError('This isn’t a 3D .cube LUT: there is no LUT_3D_SIZE line.');
  if (reader.count !== size ** 3) {
    throw new LutError(`The table has ${String(reader.count)} colour values; a ${String(size)}³ table needs ${String(size ** 3)}.`);
  }
  if (!rangeValid(min, max)) throw new LutError('DOMAIN_MAX must be above DOMAIN_MIN for every channel.');
  return {
    id: lutId(data, size, min, max),
    title: reader.title || name.replace(/\.cube$/i, '').slice(0, 80) || 'LUT',
    size,
    data,
    min,
    max,
  };
}

/**
 * FNV-1a over the table's bits and range: the same file always gets the same id, on every device.
 * @param data the table
 * @param size its points per side
 * @param min its range's starts
 * @param max its range's ends
 * @returns the id
 */
function lutId(data: Float32Array, size: number, min: number[], max: number[]): string {
  const extra = new Float32Array([size, ...min, ...max]);
  let first = 0x811c9dc5;
  let second = 0x01000193 ^ size;
  for (const words of [new Uint32Array(extra.buffer), new Uint32Array(data.buffer, data.byteOffset, data.length)]) {
    for (const word of words) {
      first = Math.imul(first ^ word, 0x01000193);
      second = Math.imul(second ^ (word >>> 7), 0x5bd1e995);
    }
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

/** A LUT as it travels in a preset file (engine/presets.ts): the table as little-endian 32-bit floats in base64. */
export interface LutJson {
  title: string;
  size: number;
  min: number[];
  max: number[];
  data: string;
}

/**
 * A LUT for a preset file.
 * @param lut the table
 * @returns its JSON form
 */
export function lutToJson(lut: Lut): LutJson {
  const bytes = new Uint8Array(lut.data.length * 4);
  const view = new DataView(bytes.buffer);
  lut.data.forEach((value, index) => {
    view.setFloat32(index * 4, value, true);
  });
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return { title: lut.title, size: lut.size, min: [...lut.min], max: [...lut.max], data: btoa(binary) };
}

/**
 * Three finite numbers.
 * @param value anything
 * @returns the triple, or null
 */
const asTriple = (value: unknown): Triple | null => {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const parts: unknown[] = value;
  const [first, second, third] = parts;
  const finite = (part: unknown): part is number => typeof part === 'number' && Number.isFinite(part);
  return finite(first) && finite(second) && finite(third) ? [first, second, third] : null;
};

/**
 * The table's values decoded from base64, each checked.
 * @param encoded the base64 text
 * @param size the table's points per side
 * @returns the values
 * @throws {LutError} when the text isn't base64 of the right length or holds a value that isn't finite
 */
function decodeTable(encoded: string, size: number): Float32Array {
  const damaged = () => new LutError('A LUT in the file is damaged.');
  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw damaged();
  }
  if (binary.length !== size ** 3 * 12) throw damaged();
  const view = new DataView(new ArrayBuffer(binary.length));
  const data = new Float32Array(size ** 3 * 3);
  for (let index = 0; index < binary.length; index++) view.setUint8(index, binary.charCodeAt(index));
  for (let index = 0; index < data.length; index++) {
    const value = view.getFloat32(index * 4, true);
    if (!Number.isFinite(value)) throw damaged();
    data[index] = Math.min(64, Math.max(-64, value));
  }
  return data;
}

/**
 * Reads a LUT from a preset file with the same checks as a .cube file; the id is recomputed from the contents.
 * @param raw anything
 * @returns the table
 * @throws {LutError} for an unusable size or range, or damaged data
 */
export function lutFromJson(raw: unknown): Lut {
  const fields = isObjectLike(raw) ? raw : {};
  const size = fields.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 2 || size > LUT_MAX_SIZE) throw new LutError('A LUT in the file has an unusable size.');
  const min = asTriple(fields.min);
  const max = asTriple(fields.max);
  if (!min || !max || !rangeValid(min, max)) throw new LutError('A LUT in the file has an unusable range.');
  const data = decodeTable(typeof fields.data === 'string' ? fields.data : '', size);
  const title = typeof fields.title === 'string' && fields.title.trim() ? fields.title.trim().slice(0, 80) : 'LUT';
  return { id: lutId(data, size, min, max), title, size, data, min, max };
}

/** The id pattern mergeAdjust() accepts. */
export const LUT_ID = /^[0-9a-z]{2,16}$/;

/**
 * A table that changes nothing.
 * @param size points per side
 * @returns the table
 */
export function identityLut(size = 2): Lut {
  const data = new Float32Array(size ** 3 * 3);
  for (let blue = 0; blue < size; blue++) {
    for (let green = 0; green < size; green++) {
      for (let red = 0; red < size; red++) data.set([red / (size - 1), green / (size - 1), blue / (size - 1)], ((blue * size + green) * size + red) * 3);
    }
  }
  return { id: lutId(data, size, [0, 0, 0], [1, 1, 1]), title: 'Identity', size, data, min: [0, 0, 0], max: [1, 1, 1] };
}

/** Per channel: index = value × scale + offset maps the domain onto 0 … size − 1. */
export interface LutScale {
  scale: Triple;
  offset: Triple;
}

/**
 * The mapping from a table's domain to its indices.
 * @param lut the table
 * @returns the scale and offset per channel
 */
export function lutScale(lut: Lut): LutScale {
  const scale: Triple = [(lut.size - 1) / (lut.max[0] - lut.min[0]), (lut.size - 1) / (lut.max[1] - lut.min[1]), (lut.size - 1) / (lut.max[2] - lut.min[2])];
  return { scale, offset: [-lut.min[0] * scale[0], -lut.min[1] * scale[1], -lut.min[2] * scale[2]] };
}

/** The tetrahedron of a cube cell a colour falls in: its two middle corners (data offsets) and the sorted fractions. */
interface Tetrahedron {
  /** Offset of the corner one step from the origin. */
  near: number;
  /** Offset of the corner two steps from the origin. */
  middle: number;
  largest: number;
  median: number;
  smallest: number;
}

/** Reused for every pixel: lutPixel runs per pixel, so it allocates nothing. */
const cell: Tetrahedron = { near: 0, middle: 0, largest: 0, median: 0, smallest: 0 };

/**
 * Sets the cell's corners and weights.
 * @param near the corner one step away
 * @param middle the corner two steps away
 * @param largest the largest fraction
 * @param median the middle fraction
 * @param smallest the smallest fraction
 */
function setCell(near: number, middle: number, largest: number, median: number, smallest: number): void {
  cell.near = near;
  cell.middle = middle;
  cell.largest = largest;
  cell.median = median;
  cell.smallest = smallest;
}

/**
 * Picks the tetrahedron holding a point: sorting the fractions, the largest first (its step is the near corner), then
 * the middle one (its step added gives the middle corner).
 * @param red the red fraction in the cell
 * @param green the green fraction
 * @param blue the blue fraction
 * @param stepGreen the data offset of one step along green (red's is 3)
 * @param stepBlue the data offset of one step along blue
 */
function pickTetrahedron(red: number, green: number, blue: number, stepGreen: number, stepBlue: number): void {
  const stepRed = 3;
  if (red > green) {
    if (green > blue) setCell(stepRed, stepRed + stepGreen, red, green, blue);
    else if (red > blue) setCell(stepRed, stepRed + stepBlue, red, blue, green);
    else setCell(stepBlue, stepRed + stepBlue, blue, red, green);
  } else if (blue > green) setCell(stepBlue, stepGreen + stepBlue, blue, green, red);
  else if (blue > red) setCell(stepGreen, stepGreen + stepBlue, green, blue, red);
  else setCell(stepGreen, stepRed + stepGreen, green, red, blue);
}

/**
 * Looks up one colour with tetrahedral interpolation: the cube cell is split into six tetrahedra along its grey
 * diagonal, so greys stay grey and no hue drifts in between, unlike trilinear. gpu/lut.ts does the same steps.
 * @param lut the table
 * @param red display value, 0–1 inside the domain
 * @param green display value
 * @param blue display value
 * @param out where the colour is written, 0–1 (not clamped)
 * @param mapping the table's scale (lutScale), worked out once per picture
 */
export function lutPixel(lut: Lut, red: number, green: number, blue: number, out: number[], mapping = lutScale(lut)): void {
  const size = lut.size;
  const data = lut.data;
  const top = size - 1;
  const redAt = Math.min(top, Math.max(0, red * mapping.scale[0] + mapping.offset[0]));
  const greenAt = Math.min(top, Math.max(0, green * mapping.scale[1] + mapping.offset[1]));
  const blueAt = Math.min(top, Math.max(0, blue * mapping.scale[2] + mapping.offset[2]));
  const column = Math.min(size - 2, redAt | 0);
  const row = Math.min(size - 2, greenAt | 0);
  const slice = Math.min(size - 2, blueAt | 0);
  // Corner offsets in the data, as steps along red (3), green (size × 3) and blue (size² × 3).
  const base = ((slice * size + row) * size + column) * 3;
  const stepGreen = size * 3;
  const stepBlue = size * size * 3;
  pickTetrahedron(redAt - column, greenAt - row, blueAt - slice, stepGreen, stepBlue);
  const originWeight = 1 - cell.largest;
  const nearWeight = cell.largest - cell.median;
  const middleWeight = cell.median - cell.smallest;
  const farWeight = cell.smallest;
  const near = base + cell.near;
  const middle = base + cell.middle;
  const far = base + 3 + stepGreen + stepBlue;
  for (let channel = 0; channel < 3; channel++) {
    out[channel] =
      originWeight * (data[base + channel] ?? 0) +
      nearWeight * (data[near + channel] ?? 0) +
      middleWeight * (data[middle + channel] ?? 0) +
      farWeight * (data[far + channel] ?? 0);
  }
}

/** A table packed into an RGBA float texture. */
export interface LutTexture {
  width: number;
  height: number;
  cols: number;
  rgba: Float32Array;
}

/** Packed once per table: a video asks for it every frame. */
const packed = new WeakMap<Lut, LutTexture>();

/**
 * The table as an RGBA float texture for the GPU: one size × size tile per blue slice (red across, green down), tiles
 * laid out in rows of `cols`, so even a 65³ table fits a small texture (585 × 520) on every device.
 * @param lut the table
 * @returns the texture's data (cached)
 */
export function lutTexture(lut: Lut): LutTexture {
  const hit = packed.get(lut);
  if (hit) return hit;
  const size = lut.size;
  const cols = Math.ceil(Math.sqrt(size));
  const rows = Math.ceil(size / cols);
  const width = cols * size;
  const height = rows * size;
  const rgba = new Float32Array(width * height * 4);
  for (let blue = 0; blue < size; blue++) {
    const left = (blue % cols) * size;
    const top = Math.floor(blue / cols) * size;
    for (let green = 0; green < size; green++) {
      for (let red = 0; red < size; red++) {
        const source = ((blue * size + green) * size + red) * 3;
        const target = ((top + green) * width + left + red) * 4;
        rgba.set(lut.data.subarray(source, source + 3), target);
        rgba[target + 3] = 1;
      }
    }
  }
  const texture = { width, height, cols, rgba };
  packed.set(lut, texture);
  return texture;
}

/* ---------- the tables loaded in this session ---------- */

const loaded = new Map<string, Lut>();

/**
 * Makes a table available to the renderers.
 * @param lut the table
 */
export function addLut(lut: Lut): void {
  loaded.set(lut.id, lut);
}

/**
 * Forgets a table.
 * @param id its id
 */
export function removeLut(id: string): void {
  loaded.delete(id);
}

/**
 * A loaded table.
 * @param id its id
 * @returns the table with this id, if it is loaded
 */
export const lutById = (id: string): Lut | undefined => (id ? loaded.get(id) : undefined);
