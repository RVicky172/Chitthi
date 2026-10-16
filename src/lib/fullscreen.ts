import { useEffect, useState } from 'react';

/*
 * Full-screen mode for the whole app (landing, studio, sizes guide). Works in browsers and the desktop app.
 */

/**
 * Whether the app is full screen.
 * @returns true while an element is shown full screen
 */
export const isFullscreen = (): boolean => !!document.fullscreenElement;

/** Enters full screen, or leaves it. */
export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* not allowed here (for example inside a frame): nothing to do */
  }
}

/**
 * Whether this page may go full screen.
 * @returns false inside a frame that doesn't allow it, or without a document
 */
export const canFullscreen = (): boolean => typeof document !== 'undefined' && document.fullscreenEnabled;

/**
 * Follows full-screen mode.
 * @returns whether the app is full screen, updated when that changes
 */
export function useFullscreen(): boolean {
  const [isOn, setIsOn] = useState(isFullscreen);
  useEffect(() => {
    const sync = () => setIsOn(isFullscreen());
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  return isOn;
}
