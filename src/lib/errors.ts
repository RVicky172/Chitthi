/*
 * A small in-memory log of the errors this page has hit: uncaught errors, unhandled promise rejections and React render
 * errors (components/ErrorBoundary.tsx). Nothing leaves the device: the log only shows up in the diagnostic report the
 * user copies themselves (the performance monitor's report and the error screen).
 */

export interface LoggedError {
  when: string;
  /** handled = caught by the app and shown to the user as a message, logged so a report can explain it. */
  source: 'error' | 'rejection' | 'render' | 'handled';
  message: string;
  stack?: string;
}

const MAX = 20;
const log: LoggedError[] = [];

export function logError(source: LoggedError['source'], err: unknown): void {
  const e = err instanceof Error ? err : null;
  log.push({
    when: new Date().toISOString(),
    source,
    message: (e ? e.message : String(err)).slice(0, 500),
    // A short stack is enough to find the place; long ones only bloat a pasted report.
    stack: e?.stack?.split('\n').slice(0, 8).join('\n'),
  });
  if (log.length > MAX) log.shift();
}

export const recentErrors = (): LoggedError[] => log.slice();

let installed = false;

/** Records uncaught errors and unhandled rejections (once per page). */
export function installErrorLog(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (e) => logError('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => logError('rejection', e.reason));
}
