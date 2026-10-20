/*
 * What the desktop app's page may use (209 §9, Q12, Constitution IX). Electron grants every permission by default; the
 * app needs fullscreen, copying text to the clipboard and, for voice-over, the microphone: only for its own page and
 * only for audio. The camera, the screen and every other origin stay refused. On macOS the system's own microphone
 * permission is asked for first. Its own module, free of `require('electron')`, so the unit tests load it.
 */

/** Allowed for the app's page whatever it asks. */
const ALWAYS = new Set(['fullscreen', 'clipboard-sanitized-write']);

/**
 * Whether a URL (or origin) is the app's own page.
 * @param {string | undefined} url the requesting URL or origin
 * @param {string} appOrigin the app's origin, e.g. app://chitthi
 * @returns {boolean} true for that exact scheme and host
 */
function isApp(url, appOrigin) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}` === appOrigin;
  } catch {
    return false;
  }
}

/**
 * Whether a permission is granted (the request handler's `details` carry `mediaTypes`, the check handler's a single
 * `mediaType`).
 * @param {string} permission the permission
 * @param {{ requestingUrl?: string, securityOrigin?: string, mediaTypes?: string[], mediaType?: string }} details what
 *   Electron says of the request
 * @param {string} appOrigin the app's origin
 * @returns {boolean} true when granted
 */
function allowed(permission, details, appOrigin) {
  if (ALWAYS.has(permission)) return true;
  if (permission !== 'media') return false;
  if (!isApp(details.requestingUrl ?? details.securityOrigin, appOrigin)) return false;
  if (details.mediaTypes) return details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio';
  return details.mediaType === 'audio';
}

/**
 * macOS's own microphone permission: granted already, asked for the first time, or refused in System Settings.
 * @param {{ getMediaAccessStatus(kind: string): string, askForMediaAccess(kind: string): Promise<boolean> }} privacy
 *   Electron's systemPreferences
 * @returns {Promise<boolean>} whether the app may record
 */
async function macMicrophone(privacy) {
  const status = privacy.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'not-determined') return privacy.askForMediaAccess('microphone');
  return false;
}

/**
 * Installs the request and check handlers on a session.
 * @param {{ setPermissionRequestHandler: Function, setPermissionCheckHandler: Function }} session the session
 * @param {{ appOrigin: string, platform: string, systemPreferences: { getMediaAccessStatus(kind: string): string,
 *   askForMediaAccess(kind: string): Promise<boolean> } }} options the app's origin, the platform and macOS's privacy
 */
function installPermissions(session, options) {
  const { appOrigin, platform, systemPreferences } = options;
  session.setPermissionRequestHandler((_webContents, permission, done, details) => {
    if (!allowed(permission, details ?? {}, appOrigin)) return done(false);
    if (permission === 'media' && platform === 'darwin') {
      macMicrophone(systemPreferences).then(done, () => done(false));
      return undefined;
    }
    return done(true);
  });
  session.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details) =>
    allowed(permission, { securityOrigin: requestingOrigin, ...details }, appOrigin),
  );
}

module.exports = { allowed, installPermissions };
