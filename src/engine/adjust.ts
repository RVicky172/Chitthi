import type { LookId } from '../types';
import { curveNeutral, FLAT_CURVE, mergeCurve, type ToneCurve } from './curve';
import { FLAT_MIXER, mergeMixer, mixerNeutral, type ColourMixer } from './hsl';
import { lightNeutral } from './light';

/*
 * The colour settings of a photo or a video clip, kept apart from where the picture sits in the frame (engine/instagram.ts
 * IgEdit). They are parameters, never pixels: the renderer applies them each time it draws, so every edit stays
 * changeable and the export matches the preview. Later phases add curves, colour mixer, masks and LUTs here
 * (docs/planning/EDITOR-IMPLEMENTATION.md, P0.1).
 */

/** Bumped when the stored shape of Adjustments changes; mergeAdjust() reads every older version. */
export const ADJUST_VERSION = 3; // 2: light and white balance (P1.1); 3: tone curve and colour mixer (P1.2). Older versions read with the new settings neutral

export const LOOK_IDS: readonly LookId[] = ['none', 'vivid', 'warm', 'cool', 'bw', 'tinted', 'vintage'];

export interface Adjustments {
  /** One of the ready-made looks, applied before the sliders. */
  look: LookId;
  /** -100 to 100, 0 = unchanged. */
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  /** 0 to 100: darkened corners. */
  vignette: number;
  /** Light and white balance (engine/light.ts), in linear light. Exposure in stops, -4 to 4; the rest -100 to 100. */
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  /** Warmer (> 0) or cooler, and magenta (> 0) or green. */
  temperature: number;
  tint: number;
  /** Tone curve: master and per-channel point lists (engine/curve.ts). */
  curve: ToneCurve;
  /** Colour mixer: hue, saturation and luminance for eight colour bands (engine/hsl.ts). */
  mixer: ColourMixer;
}

export const DEFAULT_ADJUST: Readonly<Adjustments> = Object.freeze({
  look: 'none',
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  vignette: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  curve: FLAT_CURVE,
  mixer: FLAT_MIXER,
});

/** The slider settings with their ranges: one table for validation, the UI and agent tools. */
export const ADJUST_RANGES = {
  brightness: [-100, 100],
  contrast: [-100, 100],
  saturation: [-100, 100],
  warmth: [-100, 100],
  vignette: [0, 100],
  exposure: [-4, 4],
  highlights: [-100, 100],
  shadows: [-100, 100],
  whites: [-100, 100],
  blacks: [-100, 100],
  temperature: [-100, 100],
  tint: [-100, 100],
} as const satisfies Record<Exclude<keyof Adjustments, 'look' | 'curve' | 'mixer'>, readonly [number, number]>;

type Slider = keyof typeof ADJUST_RANGES;
const SLIDERS = Object.keys(ADJUST_RANGES) as Slider[];

/** True when the colour of the photo is left as it is (the vignette is drawn on top, so it doesn't count). */
export const colourNeutral = (a: Adjustments): boolean =>
  a.look === 'none' && !a.brightness && !a.contrast && !a.saturation && !a.warmth && lightNeutral(a) && curveNeutral(a.curve) && mixerNeutral(a.mixer);

const num = (v: unknown, [lo, hi]: readonly [number, number]): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0;

/**
 * The single gate for colour settings from outside the running app (presets, project files, agent tools): returns a
 * complete, valid Adjustments, whatever it is given. Unknown fields are dropped, numbers are clamped to their ranges,
 * an unknown look becomes 'none'. Reads 2.x edits too, where the look was called `filter` and the settings sat directly
 * in the photo's edit.
 */
export function mergeAdjust(raw: unknown): Adjustments {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const look = o.look ?? o.filter;
  const out: Adjustments = {
    ...DEFAULT_ADJUST,
    look: LOOK_IDS.includes(look as LookId) ? (look as LookId) : 'none',
    curve: mergeCurve(o.curve),
    mixer: mergeMixer(o.mixer),
  };
  for (const k of SLIDERS) out[k] = num(o[k], ADJUST_RANGES[k]);
  return out;
}
