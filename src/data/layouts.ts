import type { LayoutId, LookId } from '../types';

export const LAYOUTS: [LayoutId, string][] = [
  ['full', 'Full photo'],
  ['magazine', 'Cover'],
  ['band', 'Photo and band'],
  ['textfirst', 'Words first'],
  ['split', 'Split'],
  ['sandwich', 'Sandwich'],
  ['polaroid', 'Polaroid'],
  ['instax', 'Instax frame'],
  ['photobooth', 'Photo strip'],
  ['arch', 'Jharokha arch'],
  ['window', 'Window'],
  ['circle', 'Circle'],
  ['stamp', 'Postage stamp'],
  ['collage2', 'Two photos'],
  ['collage3', 'Three photos'],
  ['mosaic', 'Mosaic'],
  ['collage4', 'Four photos'],
  ['text', 'Text only'],
];
export const layoutName = (id: LayoutId) => LAYOUTS.find((l) => l[0] === id)?.[1] ?? id;

export const LOOKS: [LookId, string][] = [
  ['none', 'Original'],
  ['vivid', 'Vivid'],
  ['warm', 'Warm'],
  ['cool', 'Cool'],
  ['bw', 'Black & white'],
  ['vintage', 'Vintage'],
];
