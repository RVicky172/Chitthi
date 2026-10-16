import type { LookId } from '../types';
import { curveNeutral, FLAT_CURVE, mergeCurve, type ToneCurve } from './curve';
import { detailNeutral } from './detail';
import { isObjectLike, isOneOf, keysOf } from './guards';
import { FLAT_MIXER, mergeMixer, mixerNeutral, type ColourMixer } from './hsl';
import { lightNeutral } from './light';
import { LUT_ID, lutById } from './lut';

/*
 * The colour settings of a photo or a video clip, kept apart from where the picture sits in the frame (engine/instagram.ts
 * IgEdit). They are parameters, never pixels: the renderer applies them each time it draws, so every edit stays
 * changeable and the export matches the preview. Later phases add curves, colour mixer, masks and LUTs here
 * (specs/vision/editor-implementation.md, P0.1).
 */

/** Bumped when the stored shape of Adjustments changes; mergeAdjust() reads every older version. */
export const ADJUST_VERSION = 5; // 2: light and white balance (P1.1); 3: tone curve and colour mixer (P1.2); 4: detail and effects (P1.3); 5: LUT (P1.4). Older versions read with the new settings at their defaults

/** The ready-made looks. */
export const LOOK_IDS: readonly LookId[] = ['none', 'vivid', 'warm', 'cool', 'bw', 'tinted', 'vintage'];

/** A photo's or a clip's colour settings. */
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
  /** Detail and effects (engine/detail.ts). Sharpening 0–100 with its radius (px at 1080 wide) and edge masking 0–100. */
  sharpen: number;
  sharpenRadius: number;
  sharpenMask: number;
  /** Noise reduction 0–100; clarity and dehaze -100 to 100; grain 0–100. */
  noise: number;
  clarity: number;
  dehaze: number;
  grain: number;
  /** An imported 3D LUT (engine/lut.ts) by its id, '' for none, and how strongly it applies, 0–100. */
  lut: string;
  lutAmount: number;
}

/** The settings that change nothing. */
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
  sharpen: 0,
  sharpenRadius: 1,
  sharpenMask: 0,
  noise: 0,
  clarity: 0,
  dehaze: 0,
  grain: 0,
  lut: '',
  lutAmount: 100,
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
  sharpen: [0, 100],
  sharpenRadius: [0.5, 3],
  sharpenMask: [0, 100],
  noise: [0, 100],
  clarity: [-100, 100],
  dehaze: [-100, 100],
  grain: [0, 100],
  lutAmount: [0, 100],
} as const satisfies Record<Exclude<keyof Adjustments, 'look' | 'curve' | 'mixer' | 'lut'>, readonly [number, number]>;

/** The slider settings. */
const SLIDERS = keysOf(ADJUST_RANGES);

/**
 * Whether nothing processes the photo's pixels.
 * @param adjust the settings
 * @returns true for neutral colour and no detail settings
 */
export const pixelsNeutral = (adjust: Adjustments): boolean => colourNeutral(adjust) && detailNeutral(adjust);

/**
 * Whether the colour of the photo is left as it is (the vignette is drawn on top, so it doesn't count).
 * @param adjust the settings
 * @returns true when no look, slider, curve, mixer or LUT changes the colour
 */
export const colourNeutral = (adjust: Adjustments): boolean =>
  adjust.look === 'none' &&
  !adjust.brightness &&
  !adjust.contrast &&
  !adjust.saturation &&
  !adjust.warmth &&
  lightNeutral(adjust) &&
  curveNeutral(adjust.curve) &&
  mixerNeutral(adjust.mixer) &&
  lutNeutral(adjust);

/**
 * Whether no LUT applies.
 * @param adjust the LUT settings
 * @returns true when none is set, its amount is 0, or its table isn't loaded in this session
 */
export const lutNeutral = (adjust: Pick<Adjustments, 'lut' | 'lutAmount'>): boolean => !adjust.lut || Number.isNaN(adjust.lutAmount) || adjust.lutAmount <= 0 || !lutById(adjust.lut);

/**
 * A number within a range, or a fallback.
 * @param value anything
 * @param range the least and the most
 * @param fallback the value when `value` isn't a finite number
 * @returns the number
 */
const num = (value: unknown, [low, high]: readonly [number, number], fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

/**
 * The single gate for colour settings from outside the running app (presets, project files, agent tools): returns a
 * complete, valid Adjustments, whatever it is given. Unknown fields are dropped, numbers are clamped to their ranges,
 * an unknown look becomes 'none'. Reads 2.x edits too, where the look was called `filter` and the settings sat directly
 * in the photo's edit.
 * @param raw anything
 * @returns valid settings
 */
export function mergeAdjust(raw: unknown): Adjustments {
  const fields = isObjectLike(raw) ? raw : {};
  const look = fields.look ?? fields.filter;
  const adjust: Adjustments = {
    ...DEFAULT_ADJUST,
    look: isOneOf(LOOK_IDS, look) ? look : 'none',
    curve: mergeCurve(fields.curve),
    mixer: mergeMixer(fields.mixer),
    lut: typeof fields.lut === 'string' && LUT_ID.test(fields.lut) ? fields.lut : '',
  };
  for (const slider of SLIDERS) adjust[slider] = num(fields[slider], ADJUST_RANGES[slider], DEFAULT_ADJUST[slider]);
  return adjust;
}
