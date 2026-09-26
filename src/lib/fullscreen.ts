import { useEffect, useState } from 'react';

/** Full-screen mode for the whole app (landing, studio, sizes guide). Works in browsers and the desktop app. */
export const isFullscreen = () => !!document.fullscreenElement;

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch {
    /* not allowed here (for example inside a frame): nothing to do */
  }
}

export const canFullscreen = () => typeof document !== 'undefined' && !!document.fullscreenEnabled;

export function useFullscreen(): boolean {
  const [on, setOn] = useState(isFullscreen);
  useEffect(() => {
    const sync = () => setOn(isFullscreen());
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  return on;
}
