/*
 * RAW photos on desktop (P1.9): develops a camera RAW file with LibRaw's dcraw_emu (LGPL-2.1 / CDDL-1.0, shipped
 * unmodified as a separate program in resources/libraw, fetched by scripts/fetch-libraw.mjs) and hands the page 16-bit
 * linear RGB pixels: camera white balance, sRGB primaries, gamma 1, LibRaw's usual brightness. The page sends the
 * file's bytes, not a path, so this handler never reads a file the user didn't give the app; it is written to a private
 * temporary folder, developed and deleted.
 */
const { app } = require('electron');
const { spawn } = require('node:child_process');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { handle } = require('./ipc.cjs');

/** File types LibRaw reads that cameras write (the page offers the same list). */
const RAW_EXTS = new Set(['.dng', '.cr2', '.cr3', '.crw', '.nef', '.nrw', '.arw', '.srf', '.sr2', '.raf', '.orf', '.rw2', '.pef', '.srw', '.3fr', '.iiq', '.erf', '.kdc', '.mos', '.mrw', '.rwl', '.x3f']);
const RAW_MAX = 300 * 1024 * 1024;
/** Developed pixels this handler will return at most (a 100-megapixel sensor, full size). */
const OUT_MAX = 100e6 * 6 + 64;
const TIMEOUT_MS = 120_000;

/**
 * Where dcraw_emu is: the app's resources when packaged, else electron/resources/libraw/<platform>-<arch>.
 * @returns {string} the program's path
 */
function helper() {
  const key = `${process.platform}-${process.arch}`;
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'libraw') : path.join(__dirname, 'resources', 'libraw', key);
  return path.join(dir, process.platform === 'win32' ? 'dcraw_emu.exe' : 'dcraw_emu');
}

/**
 * Whether the RAW developer is installed (packaged builds always; from source after npm run fetch:libraw).
 * @returns {Promise<boolean>} true when dcraw_emu is there
 */
async function available() {
  try {
    await fsp.access(helper());
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a byte is PPM header whitespace (space, newline, carriage return, tab).
 * @param {number} byte the byte
 * @returns {boolean} true for whitespace
 */
const isSpace = (byte) => byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;

/**
 * Reads a PPM's four header fields (magic, width, height, maxval), skipping whitespace and `#` comments.
 * @param {Uint8Array} buf the file's bytes
 * @returns {{ fields: string[], offset: number }} the fields and where the pixels start
 * @throws {Error} when the header ends early
 */
function ppmHeader(buf) {
  let pos = 0;
  const fields = [];
  while (fields.length < 4) {
    while (pos < buf.length && isSpace(buf[pos])) pos++;
    if (buf[pos] === 0x23) {
      while (pos < buf.length && buf[pos] !== 0x0a) pos++;
      continue;
    }
    let field = '';
    while (pos < buf.length && buf[pos] > 0x20) field += String.fromCharCode(buf[pos++]);
    if (!field) throw new Error('Not a PPM image');
    fields.push(field);
  }
  // One whitespace byte separates the header from the pixels.
  return { fields, offset: pos + 1 };
}

/**
 * Reads a binary 16-bit PPM (P6, maxval 65535), as dcraw_emu writes it.
 * @param {Uint8Array} buf the file's bytes (a Buffer from dcraw_emu)
 * @returns {{ width: number, height: number, data: Uint16Array }} the size and the RGB samples
 * @throws {Error} on any other format or a file cut short
 */
function parsePpm16(buf) {
  const { fields, offset } = ppmHeader(buf);
  const [magic, width, height, max] = [fields[0], +fields[1], +fields[2], +fields[3]];
  if (magic !== 'P6' || max !== 65535 || !(width > 0 && height > 0) || !Number.isInteger(width) || !Number.isInteger(height))
    throw new Error('Not a 16-bit PPM image');
  const count = width * height * 3;
  if (buf.length - offset < count * 2) throw new Error('The PPM image is cut short');
  const out = new Uint16Array(count);
  for (let sample = 0; sample < count; sample++) out[sample] = (buf[offset + sample * 2] << 8) | buf[offset + sample * 2 + 1];
  return { width, height, data: out };
}

/**
 * Develops a RAW file with dcraw_emu into a 16-bit linear sRGB PPM.
 * @param {string} file the RAW file's path
 * @param {boolean} half half size (fast) instead of full size with AHD demosaicing
 * @returns {Promise<Buffer>} the PPM's bytes
 * @throws {Error} with dcraw_emu's last message when it fails, times out or writes too much
 */
function develop(file, half) {
  // -6 -g 1 1: 16-bit linear; -w: camera white balance; -o 1: sRGB primaries; -q 3: AHD for full size; -Z -: stdout.
  const args = ['-6', '-g', '1', '1', '-w', '-o', '1', ...(half ? ['-h'] : ['-q', '3']), '-Z', '-', file];
  return new Promise((resolve, reject) => {
    const child = spawn(helper(), args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    let size = 0,
      err = '';
    const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > OUT_MAX) child.kill();
      else out.push(chunk);
    });
    child.stderr.on('data', (chunk) => (err = (err + chunk).slice(-2000)));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && size <= OUT_MAX) resolve(Buffer.concat(out));
      else reject(new Error(err.trim().split('\n').pop() || `dcraw_emu exited with ${code}`));
    });
  });
}

/**
 * The bytes the page sent, as a Uint8Array.
 * @param {unknown} bytes a Uint8Array or an ArrayBuffer
 * @returns {Uint8Array | null} the bytes, or null for anything else
 */
function bytesOf(bytes) {
  if (bytes instanceof Uint8Array) return bytes;
  return bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
}

/** Registers the RAW IPC handlers: whether the developer is installed, and developing a file's bytes. */
function registerRaw() {
  handle('raw:available', () => available());
  handle('raw:develop', async (_e, bytes, name, opts) => {
    const data = bytesOf(bytes);
    const ext = typeof name === 'string' && name.length <= 255 ? path.extname(name).toLowerCase() : '';
    if (!data || !data.length || data.length > RAW_MAX) throw new Error('That RAW file is empty or larger than 300 MB.');
    if (!RAW_EXTS.has(ext)) throw new Error('That isn’t a camera RAW file.');
    if (!(await available())) throw new Error('The RAW developer isn’t installed.');
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'chitthi-raw-'));
    try {
      const file = path.join(dir, `photo${ext}`);
      await fsp.writeFile(file, data);
      let ppm;
      try {
        ppm = await develop(file, !(opts && opts.half === false));
      } catch (error) {
        const reason = error && error.message ? ` (${error.message})` : '';
        throw new Error(`This RAW file couldn’t be developed${reason}.`, { cause: error });
      }
      const img = parsePpm16(ppm);
      return { width: img.width, height: img.height, data: img.data };
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

module.exports = { registerRaw, parsePpm16, RAW_EXTS, RAW_MAX };
