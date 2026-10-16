import type { AiTarget } from '../../engine/segments';
import u2netpUrl from './models/u2netp.onnx?url';

/*
 * The segmentation models (P1.8), one per target, with what licensing.md's register records for them. Both are U²-Net
 * networks: a 320 × 320 RGB picture in (ImageNet mean and deviation), a 320 × 320 map of shares 0–1 as the first output.
 * U²-Net-p ships with the app; skyseg (the full U²-Net, trained for skies) is too big to ship, so it is downloaded on
 * first use, only after the user agrees, from a pinned revision, and checked against its SHA-256 before it is used.
 */

/** A segmentation model and its file. */
export interface SegModel {
  id: string;
  title: string;
  /** Where the file comes from: bundled with the app, or downloaded once and kept on the device. */
  url: string;
  bundled: boolean;
  bytes: number;
  sha256: string;
  licence: string;
  source: string;
}

/** The models' input side, in pixels. */
export const SEG_INPUT = 320;
/** ImageNet's mean and deviation per colour, for normalising the input. */
export const SEG_MEAN = [0.485, 0.456, 0.406] as const;
export const SEG_STD = [0.229, 0.224, 0.225] as const;

/** The model for each target. */
export const SEG_MODELS: Record<AiTarget, SegModel> = {
  subject: {
    id: 'u2netp',
    title: 'U²-Net-p (subject)',
    url: u2netpUrl,
    bundled: true,
    bytes: 4574861,
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
    licence: 'Apache-2.0',
    source: 'https://github.com/xuebinqin/U-2-Net (ONNX export from https://github.com/danielgatis/rembg, MIT)',
  },
  sky: {
    id: 'skyseg',
    title: 'skyseg (sky)',
    url: 'https://huggingface.co/JianyuanWang/skyseg/resolve/3ba8c6df1d9ba9ff26f637c7ba9568ac11a9aa7f/skyseg.onnx',
    bundled: false,
    bytes: 175997079,
    sha256: 'ab9c34c64c3d821220a2886a4a06da4642ffa14d5b30e8d5339056a089aa1d39',
    licence: 'MIT',
    source: 'https://huggingface.co/JianyuanWang/skyseg',
  },
};

/**
 * A model's size for asking before a download.
 * @param bytes the size in bytes
 * @returns "176 MB"
 */
export const sizeText = (bytes: number): string => `${Math.round(bytes / 1e6)} MB`;

/** Where a model is: part of the app, in the device's private storage, only in memory for this session, or absent. */
export type ModelState = 'bundled' | 'stored' | 'session' | 'none';

/**
 * A model's row in Settings › AI models on this device (401).
 * @param state where the model is
 * @returns the status shown and whether it can be deleted
 */
export function modelRow(state: ModelState): { status: string; canDelete: boolean } {
  const status = {
    bundled: 'Part of the app',
    stored: 'On this device',
    session: 'Kept for this session only',
    none: 'Not downloaded',
  }[state];
  return { status, canDelete: state === 'stored' || state === 'session' };
}
