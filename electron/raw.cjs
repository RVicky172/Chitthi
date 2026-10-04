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

function helper() {
  const key = `${process.platform}-${process.arch}`;
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'libraw') : path.join(__dirname, 'resources', 'libraw', key);
  return path.join(dir, process.platform === 'win32' ? 'dcraw_emu.exe' : 'dcraw_emu');
}

/** True when the RAW developer is installed (packaged builds always; from source after npm run fetch:libraw). */
async function available() {
  try {
    await fsp.access(helper());
    return true;
  } catch {
    return false;
  }
}

/** A binary 16-bit PPM (P6, maxval 65535) as width, height and little-endian RGB values. Throws on anything else. */
function parsePpm16(buf) {
  let i = 0;
  const fields = [];
  while (fields.length < 4) {
    while (i < buf.length && (buf[i] === 0x20 || buf[i] === 0x0a || buf[i] === 0x0d || buf[i] === 0x09)) i++;
    if (buf[i] === 0x23) {
      while (i < buf.length && buf[i] !== 0x0a) i++;
      continue;
    }
    let s = '';
    while (i < buf.length && buf[i] > 0x20) s += String.fromCharCode(buf[i++]);
    if (!s) throw new Error('Not a PPM image');
    fields.push(s);
  }
  i++;
  const [magic, w, h, max] = [fields[0], +fields[1], +fields[2], +fields[3]];
  if (magic !== 'P6' || max !== 65535 || !(w > 0 && h > 0) || !Number.isInteger(w) || !Number.isInteger(h))
    throw new Error('Not a 16-bit PPM image');
  const n = w * h * 3;
  if (buf.length - i < n * 2) throw new Error('The PPM image is cut short');
  const out = new Uint16Array(n);
  for (let k = 0; k < n; k++) out[k] = (buf[i + k * 2] << 8) | buf[i + k * 2 + 1];
  return { width: w, height: h, data: out };
}

function develop(file, half) {
  // -6 -g 1 1: 16-bit linear; -w: camera white balance; -o 1: sRGB primaries; -q 3: AHD for full size; -Z -: stdout.
  const args = ['-6', '-g', '1', '1', '-w', '-o', '1', ...(half ? ['-h'] : ['-q', '3']), '-Z', '-', file];
  return new Promise((resolve, reject) => {
    const p = spawn(helper(), args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const out = [];
    let size = 0,
      err = '';
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.stdout.on('data', (c) => {
      size += c.length;
      if (size > OUT_MAX) p.kill();
      else out.push(c);
    });
    p.stderr.on('data', (c) => (err = (err + c).slice(-2000)));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && size <= OUT_MAX) resolve(Buffer.concat(out));
      else reject(new Error(err.trim().split('\n').pop() || `dcraw_emu exited with ${code}`));
    });
  });
}

function registerRaw() {
  handle('raw:available', () => available());
  handle('raw:develop', async (_e, bytes, name, opts) => {
    const data = bytes instanceof Uint8Array ? bytes : bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : null;
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
      } catch (e) {
        throw new Error(`This RAW file couldn’t be developed${e && e.message ? ` (${e.message})` : ''}.`, { cause: e });
      }
      const img = parsePpm16(ppm);
      return { width: img.width, height: img.height, data: img.data };
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
}

module.exports = { registerRaw, parsePpm16, RAW_EXTS, RAW_MAX };
