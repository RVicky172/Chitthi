/*
 * Where the preview's limiter worklet is served from: its own bundled file (Vite's `?worker&url`, 208 T001), loaded
 * only when the stage first plays sound.
 */
import url from './limiter.worklet.ts?worker&url';

/** The worklet module's same-origin URL, for `audioWorklet.addModule`. */
export const limiterUrl: string = url;
