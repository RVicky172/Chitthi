import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSP } from '../../../electron/csp.cjs';
import { MEDIA_PRIVILEGES, MEDIA_SCHEME } from '../../../electron/media.cjs';

/*
 * 408 T052 (AC-5, Constitution IX): the desktop shell around the media scheme. The page's CSP lets media and fetches
 * reach chitthi-media: (and nothing else new); the scheme is privileged as the T001 spike needed, without bypassCSP;
 * every file main.cjs loads is packaged.
 */

/**
 * One directive's sources.
 * @param name the directive
 * @returns its sources
 */
const directive = (name: string): string[] =>
  CSP.split(';')
    .map((part) => part.trim().split(/\s+/))
    .find(([first]) => first === name)
    ?.slice(1) ?? [];

describe('the desktop shell (408 T052)', () => {
  it('the CSP lets media and fetches read chitthi-media:, and only those', () => {
    expect(directive('media-src')).toContain('chitthi-media:');
    expect(directive('connect-src')).toContain('chitthi-media:');
    for (const name of ['default-src', 'script-src', 'img-src', 'worker-src', 'frame-src', 'object-src']) {
      expect(directive(name)).not.toContain('chitthi-media:');
    }
    expect(directive('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
  });

  it('the media scheme has the spike’s privileges and doesn’t bypass the CSP', () => {
    expect(MEDIA_SCHEME).toBe('chitthi-media');
    expect(MEDIA_PRIVILEGES).toEqual({ standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true });
  });

  it('every file main.cjs and preload.cjs load is in electron-builder.yml files:', () => {
    const builder = fs.readFileSync('electron-builder.yml', 'utf8').replaceAll('\r\n', '\n');
    const loaded = new Set<string>();
    for (const file of ['electron/main.cjs', 'electron/preload.cjs', 'electron/projects.cjs', 'electron/media.cjs']) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/require\('\.\/([\w.-]+)'\)/g)) loaded.add(`electron/${match[1]}`);
    }
    expect(loaded).toContain('electron/media.cjs');
    expect(loaded).toContain('electron/projects.cjs');
    expect(loaded).toContain('electron/csp.cjs');
    for (const file of loaded) {
      expect(fs.existsSync(path.normalize(file))).toBe(true);
      expect(builder, file).toContain(`  - ${file}\n`);
    }
  });
});
