/*
 * A small in-memory log of the errors this page has hit: uncaught errors, unhandled promise rejections and React render
 * errors (components/ErrorBoundary.tsx). Nothing leaves the device: the log only shows up in the diagnostic report the
 * user copies themselves (the performance monitor's report and the error screen).
 */

/** One logged error. */
export interface LoggedError {
  /** When it happened, as an ISO date. */
  when: string;
  /** handled = caught by the app and shown to the user as a message, logged so a report can explain it. */
  source: 'error' | 'rejection' | 'render' | 'handled';
  message: string;
  stack?: string;
}

const MAX = 20;
const log: LoggedError[] = [];

/**
 * Logs an error (the last 20 are kept).
 * @param source where it was caught
 * @param thrown what was thrown or rejected
 */
export function logError(source: LoggedError['source'], thrown: unknown): void {
  const error = thrown instanceof Error ? thrown : null;
  log.push({
    when: new Date().toISOString(),
    source,
    message: (error ? error.message : String(thrown)).slice(0, 500),
    // A short stack is enough to find the place; long ones only bloat a pasted report.
    stack: error?.stack?.split('\n').slice(0, 8).join('\n'),
  });
  if (log.length > MAX) log.shift();
}

/**
 * The errors logged so far, oldest first.
 * @returns a copy of the log
 */
export const recentErrors = (): LoggedError[] => log.slice();

let installed = false;

/** Records uncaught errors and unhandled rejections (once per page). */
export function installErrorLog(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (event) => logError('error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => logError('rejection', event.reason));
}
