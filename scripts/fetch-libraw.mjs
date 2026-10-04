#!/usr/bin/env node
/*
 * Fetches LibRaw's RAW developer (dcraw_emu, LibRaw's own sample program) for the desktop app (P1.9) into
 * electron/resources/libraw/<platform>-<arch>/, which electron-builder ships as extraResources. LibRaw is LGPL-2.1 or
 * CDDL-1.0 (an approved exception, docs/LICENSING.md): it ships unmodified, as a separate program the app starts, with
 * its licence texts and a note pointing to its exact source.
 *
 * Windows x64 and macOS arm64 use LibRaw's official builds; LibRaw publishes no Intel Mac build, so on macOS the
 * Intel copy is built from the same release's source, cross-compiled with clang (-arch x86_64). Every download is
 * checked against its SHA-256.
 *
 *   node scripts/fetch-libraw.mjs           this machine's platform (on macOS both arm64 and x64)
 *   node scripts/fetch-libraw.mjs --force   fetch again even when present
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const VERSION = '0.22.2';
const BASE = 'https://www.libraw.org/data';
const ARCHIVES = {
  win: { file: `LibRaw-${VERSION}-Win64.zip`, sha256: 'ac64fa12bb00a7581332d4c6ab918c0533fb3f119d6b668d47a6875410dca948' },
  mac: { file: `LibRaw-${VERSION}-macOS.zip`, sha256: '46e9cec8798419775df1411cc4554bb023e003509ff44b4057fd3b84eb55a517' },
  src: { file: `LibRaw-${VERSION}.tar.gz`, sha256: 'de86b035655accff8d4010f1a221fdf50d353cb7b1422ba26f14a0db92612cfa' },
};
const OUT = 'electron/resources/libraw';
const force = process.argv.includes('--force');
// bsdtar reads zip and tar.gz alike: Windows' own (not a GNU tar from Git Bash on the PATH), macOS's default.
const TAR = process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe') : 'tar';

async function download(a) {
  const r = await fetch(`${BASE}/${a.file}`);
  if (!r.ok) throw new Error(`${a.file}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== a.sha256) throw new Error(`${a.file}: SHA-256 ${got}, expected ${a.sha256}`);
  const tmp = mkdtempSync(join(tmpdir(), 'libraw-'));
  const path = join(tmp, a.file);
  writeFileSync(path, buf);
  execFileSync(TAR, ['-xf', path, '-C', tmp]);
  return join(tmp, `LibRaw-${VERSION}`);
}

/** Copies the program (and its library on Windows), the licences and a source note into OUT/<key>. */
function install(key, root, files, how) {
  const dir = join(OUT, key);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const [from, to] of files) {
    copyFileSync(join(root, from), join(dir, to));
    if (!to.endsWith('.dll')) chmodSync(join(dir, to), 0o755);
  }
  for (const f of ['LICENSE.LGPL', 'LICENSE.CDDL', 'COPYRIGHT']) copyFileSync(join(root, f), join(dir, f));
  writeFileSync(
    join(dir, 'SOURCE.txt'),
    [
      `LibRaw ${VERSION} (https://www.libraw.org), dual-licensed LGPL-2.1 or CDDL-1.0 (LICENSE.LGPL, LICENSE.CDDL).`,
      'Chitthi Studio ships it unmodified and runs dcraw_emu, LibRaw\'s own sample program, as a separate process.',
      `${how}`,
      `Exact source: ${BASE}/${ARCHIVES.src.file} (SHA-256 ${ARCHIVES.src.sha256}).`,
      'You may replace this program with your own build of the same LibRaw version (or a later compatible one).',
      '',
    ].join('\n'),
  );
  console.log(`fetch-libraw: ${key} ready in ${dir}`);
}

const have = (key, exe) => !force && existsSync(join(OUT, key, exe));

if (process.platform === 'win32') {
  if (have('win32-x64', 'dcraw_emu.exe')) console.log('fetch-libraw: win32-x64 already present');
  else {
    const root = await download(ARCHIVES.win);
    install('win32-x64', root, [['bin/dcraw_emu.exe', 'dcraw_emu.exe'], ['bin/libraw.dll', 'libraw.dll']], `Binaries: LibRaw's official Windows build, ${ARCHIVES.win.file} (SHA-256 ${ARCHIVES.win.sha256}).`);
  }
} else if (process.platform === 'darwin') {
  if (have('darwin-arm64', 'dcraw_emu')) console.log('fetch-libraw: darwin-arm64 already present');
  else {
    const root = await download(ARCHIVES.mac);
    install('darwin-arm64', root, [['bin/dcraw_emu', 'dcraw_emu']], `Binary: LibRaw's official macOS (Apple silicon) build, ${ARCHIVES.mac.file} (SHA-256 ${ARCHIVES.mac.sha256}).`);
  }
  if (have('darwin-x64', 'dcraw_emu')) console.log('fetch-libraw: darwin-x64 already present');
  else {
    // No official Intel build: compile the release's own sample program for x86_64, statically, without optional
    // libraries (no JPEG, Jasper, LCMS, zlib or OpenMP), as LibRaw's own macOS build is made.
    const root = await download(ARCHIVES.src);
    const flags = '-arch x86_64 -O2 -mmacosx-version-min=11.0';
    const env = { ...process.env, CC: 'clang', CXX: 'clang++', CFLAGS: flags, CXXFLAGS: flags, LDFLAGS: '-arch x86_64' };
    const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, env, stdio: 'inherit' });
    run('./configure', ['--host=x86_64-apple-darwin', '--disable-shared', '--enable-static', '--disable-openmp', '--disable-jpeg', '--disable-jasper', '--disable-lcms', '--disable-zlib']);
    run('make', ['-j4', 'bin/dcraw_emu']);
    const info = execFileSync('lipo', ['-archs', join(root, 'bin/dcraw_emu')]).toString().trim();
    if (info !== 'x86_64') throw new Error(`darwin-x64: built for ${info}, expected x86_64`);
    install('darwin-x64', root, [['bin/dcraw_emu', 'dcraw_emu']], `Binary: built by Chitthi's release workflow from ${ARCHIVES.src.file}, unmodified, with: ./configure --host=x86_64-apple-darwin --disable-shared --enable-static --disable-openmp --disable-jpeg --disable-jasper --disable-lcms --disable-zlib; make bin/dcraw_emu (CFLAGS ${flags}).`);
  }
} else console.log(`fetch-libraw: no desktop build for ${process.platform}; RAW files open their embedded preview`);
