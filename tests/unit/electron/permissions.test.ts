import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allowed, installPermissions } from '../../../electron/permissions.cjs';

/*
 * 209 AC-7, AC-11, Q12 (Constitution IX): the desktop app grants the microphone to its own page only, for audio only;
 * macOS asks the system first; the web app's Permissions-Policy allows the microphone for its own origin only.
 */

const APP = 'app://chitthi';
const page = `${APP}/index.html#/instagram/video`;

/** A session stand-in that keeps the handlers it is given. */
class FakeSession {
  request: ((webContents: unknown, permission: string, done: (granted: boolean) => void, details: object) => void) | null = null;
  check: ((webContents: unknown, permission: string, origin: string, details: object) => boolean) | null = null;

  /** @param handler the request handler */
  setPermissionRequestHandler(handler: NonNullable<FakeSession['request']>): void {
    this.request = handler;
  }

  /** @param handler the check handler */
  setPermissionCheckHandler(handler: NonNullable<FakeSession['check']>): void {
    this.check = handler;
  }
}

/**
 * macOS's microphone permission stand-in.
 * @param status what the system says now
 * @param answer what the system prompt answers
 * @returns the stand-in and the prompts it showed
 */
function macPrivacy(status: string, answer = true) {
  const asked: string[] = [];
  return {
    asked,
    getMediaAccessStatus: () => status,
    askForMediaAccess: (kind: string) => {
      asked.push(kind);
      return Promise.resolve(answer);
    },
  };
}

/**
 * Asks the installed request handler.
 * @param session the session
 * @param permission the permission
 * @param details the request's details
 * @returns whether it was granted
 */
function request(session: FakeSession, permission: string, details: object): Promise<boolean> {
  return new Promise((resolve) => session.request?.(null, permission, resolve, details));
}

describe('allowed (the desktop predicate)', () => {
  it('keeps today’s two permissions for any page', () => {
    expect(allowed('fullscreen', {}, APP)).toBe(true);
    expect(allowed('clipboard-sanitized-write', {}, APP)).toBe(true);
  });

  it('grants the microphone to the app’s own page, for audio only', () => {
    expect(allowed('media', { requestingUrl: page, mediaTypes: ['audio'] }, APP)).toBe(true);
    expect(allowed('media', { requestingUrl: page, mediaTypes: ['video'] }, APP)).toBe(false);
    expect(allowed('media', { requestingUrl: page, mediaTypes: ['audio', 'video'] }, APP)).toBe(false);
    expect(allowed('media', { requestingUrl: page, mediaTypes: [] }, APP)).toBe(false);
    expect(allowed('media', { requestingUrl: page }, APP)).toBe(false);
  });

  it('refuses every other origin, look-alikes included', () => {
    for (const url of ['https://example.com/', 'app://chitthi.evil/x', 'app://other/index.html', 'chitthi-media://x', 'file:///C:/x.html', '']) {
      expect(allowed('media', { requestingUrl: url, mediaTypes: ['audio'] }, APP)).toBe(false);
    }
  });

  it('answers the check handler’s form (one media type, an origin)', () => {
    expect(allowed('media', { securityOrigin: `${APP}/`, mediaType: 'audio' }, APP)).toBe(true);
    expect(allowed('media', { securityOrigin: APP, mediaType: 'audio' }, APP)).toBe(true);
    expect(allowed('media', { securityOrigin: `${APP}/`, mediaType: 'video' }, APP)).toBe(false);
    expect(allowed('media', { securityOrigin: `${APP}/`, mediaType: 'unknown' }, APP)).toBe(false);
    expect(allowed('media', { securityOrigin: 'https://example.com/', mediaType: 'audio' }, APP)).toBe(false);
  });

  it('refuses the screen, notifications, geolocation and everything else', () => {
    for (const permission of ['display-capture', 'notifications', 'geolocation', 'midi', 'openExternal', 'pointerLock', 'hid', 'serial', 'usb']) {
      expect(allowed(permission, { requestingUrl: page, mediaTypes: ['audio'] }, APP)).toBe(false);
    }
  });
});

describe('installPermissions', () => {
  it('on Windows answers from the predicate alone', async () => {
    const session = new FakeSession();
    installPermissions(session, { appOrigin: APP, platform: 'win32', systemPreferences: macPrivacy('denied') });
    expect(await request(session, 'media', { requestingUrl: page, mediaTypes: ['audio'] })).toBe(true);
    expect(await request(session, 'media', { requestingUrl: page, mediaTypes: ['video'] })).toBe(false);
    expect(await request(session, 'notifications', { requestingUrl: page })).toBe(false);
    expect(session.check?.(null, 'media', APP, { securityOrigin: APP, mediaType: 'audio' })).toBe(true);
    expect(session.check?.(null, 'media', 'https://example.com', { securityOrigin: 'https://example.com', mediaType: 'audio' })).toBe(false);
  });

  it('on macOS asks the system the first time, and follows its answer', async () => {
    const audio = { requestingUrl: page, mediaTypes: ['audio'] };
    for (const [status, answer, expected, prompts] of [
      ['granted', true, true, 0],
      ['not-determined', true, true, 1],
      ['not-determined', false, false, 1],
      ['denied', true, false, 0],
      ['restricted', true, false, 0],
    ] as const) {
      const session = new FakeSession();
      const privacy = macPrivacy(status, answer);
      installPermissions(session, { appOrigin: APP, platform: 'darwin', systemPreferences: privacy });
      expect(await request(session, 'media', audio)).toBe(expected);
      expect(privacy.asked).toEqual(prompts ? ['microphone'] : []);
    }
  });

  it('never asks the system for a request it refuses anyway', async () => {
    const session = new FakeSession();
    const privacy = macPrivacy('not-determined');
    installPermissions(session, { appOrigin: APP, platform: 'darwin', systemPreferences: privacy });
    expect(await request(session, 'media', { requestingUrl: 'https://example.com/', mediaTypes: ['audio'] })).toBe(false);
    expect(privacy.asked).toEqual([]);
  });
});

describe('the build and the web headers', () => {
  const text = (file: string) => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');

  it('macOS declares why the app uses the microphone and the hardened runtime’s audio-input entitlement', () => {
    expect(text('electron-builder.yml')).toMatch(/extendInfo:\n\s+NSMicrophoneUsageDescription: .+/);
    expect(text('build/entitlements.mac.plist')).toMatch(/<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/);
  });

  it('the web app allows the microphone for its own page only; camera, geolocation and payment stay off', () => {
    const policy = /Permissions-Policy "([^"]+)"/.exec(text('nginx/security-headers.conf'))?.[1];
    expect(policy?.split(/,\s*/).toSorted()).toEqual(['camera=()', 'geolocation=()', 'microphone=(self)', 'payment=()']);
  });

  it('vite preview sends the Permissions-Policy too, so the e2e tests see it (209 T001)', () => {
    expect(text('vite.config.ts')).toMatch(/'Permissions-Policy'/);
  });
});
