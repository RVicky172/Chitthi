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
  min: [number, number, number];
  max: [number, number, number];
}

export class LutError extends Error {}

const nums = (parts: string[], n: number, line: number): number[] => {
  const v = parts.slice(1).map(Number);
  if (v.length !== n || v.some((x) => !Number.isFinite(x)))
    throw new LutError(`Line ${line}: expected ${n} number${n > 1 ? 's' : ''}.`);
  return v;
};

/**
 * Reads a .cube file. Throws a LutError, with a message fit to show the user, for anything that isn't a valid 3D table
 * of 2 to 65 points per side. Unknown keywords are skipped, as the format asks.
 */
export function parseCube(text: string, name = 'LUT'): Lut {
  let title = '',
    size = 0,
    min: [number, number, number] = [0, 0, 0],
    max: [number, number, number] = [1, 1, 1],
    data: Float32Array | null = null,
    n = 0,
    lineNo = 0;
  for (const raw of (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r\n|\r|\n/)) {
    lineNo++;
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const c = line.charCodeAt(0);
    // Data lines start with a digit, a sign or a point; keywords with a letter.
    if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
      if (!data) throw new LutError(`Line ${lineNo}: colour values before LUT_3D_SIZE.`);
      if (n >= size ** 3) throw new LutError(`Line ${lineNo}: more values than a ${size}³ table holds.`);
      const parts = line.split(/\s+/);
      if (parts.length !== 3) throw new LutError(`Line ${lineNo}: expected three numbers (red, green, blue).`);
      for (let k = 0; k < 3; k++) {
        const v = Number(parts[k]);
        if (!Number.isFinite(v)) throw new LutError(`Line ${lineNo}: “${parts[k]}” isn’t a number.`);
        // Wild values would overflow the GPU's 16-bit floats; no real table comes near this.
        data[n * 3 + k] = Math.min(64, Math.max(-64, v));
      }
      n++;
      continue;
    }
    const parts = line.split(/\s+/),
      key = parts[0].toUpperCase();
    if (key === 'TITLE')
      title = line
        .slice(5)
        .trim()
        .replace(/^"(.*)"$/, '$1')
        .slice(0, 80);
    else if (key === 'LUT_1D_SIZE') throw new LutError('This is a 1D LUT; Chitthi Studio reads 3D LUTs (LUT_3D_SIZE).');
    else if (key === 'LUT_3D_SIZE') {
      if (data) throw new LutError(`Line ${lineNo}: LUT_3D_SIZE appears twice.`);
      const [s] = nums(parts, 1, lineNo);
      if (!Number.isInteger(s) || s < 2 || s > LUT_MAX_SIZE)
        throw new LutError(`The table is ${s} points per side; Chitthi Studio reads 2 to ${LUT_MAX_SIZE}.`);
      size = s;
      data = new Float32Array(s ** 3 * 3);
    } else if (key === 'DOMAIN_MIN') min = nums(parts, 3, lineNo) as [number, number, number];
    else if (key === 'DOMAIN_MAX') max = nums(parts, 3, lineNo) as [number, number, number];
    else if (key === 'LUT_3D_INPUT_RANGE') {
      const [lo, hi] = nums(parts, 2, lineNo);
      min = [lo, lo, lo];
      max = [hi, hi, hi];
    }
  }
  if (!data) throw new LutError('This isn’t a 3D .cube LUT: there is no LUT_3D_SIZE line.');
  if (n !== size ** 3) throw new LutError(`The table has ${n} colour values; a ${size}³ table needs ${size ** 3}.`);
  if (min.some((v, i) => !(max[i] > v))) throw new LutError('DOMAIN_MAX must be above DOMAIN_MIN for every channel.');
  return {
    id: lutId(data, size, min, max),
    title: title || name.replace(/\.cube$/i, '').slice(0, 80) || 'LUT',
    size,
    data,
    min,
    max,
  };
}

/** FNV-1a over the table's bits and range: the same file always gets the same id, on every device. */
function lutId(data: Float32Array, size: number, min: number[], max: number[]): string {
  const extra = new Float32Array([size, ...min, ...max]);
  let h1 = 0x811c9dc5,
    h2 = 0x01000193 ^ size;
  for (const arr of [new Uint32Array(extra.buffer), new Uint32Array(data.buffer, data.byteOffset, data.length)])
    for (let i = 0; i < arr.length; i++) {
      h1 = Math.imul(h1 ^ arr[i], 0x01000193);
      h2 = Math.imul(h2 ^ (arr[i] >>> 7), 0x5bd1e995);
    }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}`;
}

/** A LUT as it travels in a preset file (engine/presets.ts): the table as little-endian 32-bit floats in base64. */
export interface LutJson {
  title: string;
  size: number;
  min: number[];
  max: number[];
  data: string;
}

export function lutToJson(l: Lut): LutJson {
  const bytes = new Uint8Array(l.data.length * 4),
    view = new DataView(bytes.buffer);
  l.data.forEach((v, i) => view.setFloat32(i * 4, v, true));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { title: l.title, size: l.size, min: [...l.min], max: [...l.max], data: btoa(bin) };
}

/** Reads a LUT from a preset file with the same checks as a .cube file; the id is recomputed from the contents. */
export function lutFromJson(raw: unknown): Lut {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const size = o.size,
    triple = (v: unknown) =>
      Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))
        ? (v as [number, number, number])
        : null;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 2 || size > LUT_MAX_SIZE)
    throw new LutError('A LUT in the file has an unusable size.');
  const min = triple(o.min),
    max = triple(o.max);
  if (!min || !max || min.some((v, i) => !(max[i] > v))) throw new LutError('A LUT in the file has an unusable range.');
  let bin: string;
  try {
    bin = atob(typeof o.data === 'string' ? o.data : '');
  } catch {
    throw new LutError('A LUT in the file is damaged.');
  }
  if (bin.length !== size ** 3 * 12) throw new LutError('A LUT in the file is damaged.');
  const view = new DataView(new ArrayBuffer(bin.length)),
    data = new Float32Array(size ** 3 * 3);
  for (let i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i));
  for (let i = 0; i < data.length; i++) {
    const v = view.getFloat32(i * 4, true);
    if (!Number.isFinite(v)) throw new LutError('A LUT in the file is damaged.');
    data[i] = Math.min(64, Math.max(-64, v));
  }
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim().slice(0, 80) : 'LUT';
  return { id: lutId(data, size, min, max), title, size, data, min, max };
}

/** The id pattern mergeAdjust() accepts. */
export const LUT_ID = /^[0-9a-z]{2,16}$/;

/** A table that changes nothing, size points per side. */
export function identityLut(size = 2): Lut {
  const data = new Float32Array(size ** 3 * 3);
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++)
        data.set([r / (size - 1), g / (size - 1), b / (size - 1)], ((b * size + g) * size + r) * 3);
  return { id: lutId(data, size, [0, 0, 0], [1, 1, 1]), title: 'Identity', size, data, min: [0, 0, 0], max: [1, 1, 1] };
}

/** Per channel: index = v × scale + offset maps the domain onto 0 … size − 1. */
export function lutScale(l: Lut): { scale: number[]; offset: number[] } {
  const scale = [0, 1, 2].map((i) => (l.size - 1) / (l.max[i] - l.min[i]));
  return { scale, offset: [0, 1, 2].map((i) => -l.min[i] * scale[i]) };
}

/**
 * Looks up one colour (display values, 0–1 inside the domain) with tetrahedral interpolation: the cube cell is split
 * into six tetrahedra along its grey diagonal, so greys stay grey and no hue drifts in between, unlike trilinear.
 * Writes 0–1 values (not clamped) to out. gpu/lut.ts does the same steps.
 */
export function lutPixel(l: Lut, r: number, g: number, b: number, out: number[], sc = lutScale(l)): void {
  const N = l.size,
    d = l.data,
    top = N - 1;
  const x = Math.min(top, Math.max(0, r * sc.scale[0] + sc.offset[0])),
    y = Math.min(top, Math.max(0, g * sc.scale[1] + sc.offset[1])),
    z = Math.min(top, Math.max(0, b * sc.scale[2] + sc.offset[2]));
  const i = Math.min(N - 2, x | 0),
    j = Math.min(N - 2, y | 0),
    k = Math.min(N - 2, z | 0),
    fr = x - i,
    fg = y - j,
    fb = z - k;
  // Corner offsets in the data, as steps along red (1), green (N) and blue (N²).
  const base = ((k * N + j) * N + i) * 3,
    R = 3,
    G = N * 3,
    B = N * N * 3;
  // The tetrahedron holding the point: corners c0 (the cell's origin), c1, c2, c3 (= the far corner), with weights.
  // Sorting the fractions picks it: largest first (a, its step c1), then the middle one (b, c2 = c1 + its step), then c.
  let c1: number, c2: number, fa: number, fm: number, fc: number;
  if (fr > fg) {
    if (fg > fb) {
      c1 = R;
      c2 = R + G;
      fa = fr;
      fm = fg;
      fc = fb;
    } else if (fr > fb) {
      c1 = R;
      c2 = R + B;
      fa = fr;
      fm = fb;
      fc = fg;
    } else {
      c1 = B;
      c2 = R + B;
      fa = fb;
      fm = fr;
      fc = fg;
    }
  } else if (fb > fg) {
    c1 = B;
    c2 = G + B;
    fa = fb;
    fm = fg;
    fc = fr;
  } else if (fb > fr) {
    c1 = G;
    c2 = G + B;
    fa = fg;
    fm = fb;
    fc = fr;
  } else {
    c1 = G;
    c2 = R + G;
    fa = fg;
    fm = fr;
    fc = fb;
  }
  const w0 = 1 - fa,
    w1 = fa - fm,
    w2 = fm - fc,
    w3 = fc,
    p1 = base + c1,
    p2 = base + c2,
    p3 = base + R + G + B;
  for (let c = 0; c < 3; c++) out[c] = w0 * d[base + c] + w1 * d[p1 + c] + w2 * d[p2 + c] + w3 * d[p3 + c];
}

/**
 * The table as an RGBA float texture for the GPU: one size × size tile per blue slice (red across, green down), tiles
 * laid out in rows of `cols`, so even a 65³ table fits a small texture (585 × 520) on every device.
 */
export function lutTexture(l: Lut): LutTexture {
  const hit = packed.get(l);
  if (hit) return hit;
  const N = l.size,
    cols = Math.ceil(Math.sqrt(N)),
    rows = Math.ceil(N / cols),
    width = cols * N,
    height = rows * N,
    rgba = new Float32Array(width * height * 4);
  for (let b = 0; b < N; b++) {
    const ox = (b % cols) * N,
      oy = Math.floor(b / cols) * N;
    for (let g = 0; g < N; g++)
      for (let r = 0; r < N; r++) {
        const s = ((b * N + g) * N + r) * 3,
          t = ((oy + g) * width + ox + r) * 4;
        rgba[t] = l.data[s];
        rgba[t + 1] = l.data[s + 1];
        rgba[t + 2] = l.data[s + 2];
        rgba[t + 3] = 1;
      }
  }
  const out = { width, height, cols, rgba };
  packed.set(l, out);
  return out;
}

export interface LutTexture {
  width: number;
  height: number;
  cols: number;
  rgba: Float32Array;
}
/** Packed once per table: a video asks for it every frame. */
const packed = new WeakMap<Lut, LutTexture>();

/* ---------- the tables loaded in this session ---------- */

const loaded = new Map<string, Lut>();

/** Makes a table available to the renderers. */
export const addLut = (l: Lut): void => void loaded.set(l.id, l);
export const removeLut = (id: string): void => void loaded.delete(id);
/** The table with this id, if it is loaded. */
export const lutById = (id: string): Lut | undefined => (id ? loaded.get(id) : undefined);
