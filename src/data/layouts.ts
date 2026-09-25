import type { LayoutId, LookId, ProductId } from '../types';

/** Every layout with the product it belongs to (the order here is the order in the Layout step and gallery). */
export const LAYOUTS: [LayoutId, string, ProductId][] = [
  ['full', 'Full photo', 'postcard'],
  ['magazine', 'Cover', 'postcard'],
  ['band', 'Photo and band', 'postcard'],
  ['textfirst', 'Words first', 'postcard'],
  ['split', 'Split', 'postcard'],
  ['sandwich', 'Sandwich', 'postcard'],
  ['polaroid', 'Polaroid', 'postcard'],
  ['instax', 'Instax frame', 'postcard'],
  ['photobooth', 'Photo strip', 'postcard'],
  ['arch', 'Jharokha arch', 'postcard'],
  ['window', 'Window', 'postcard'],
  ['circle', 'Circle', 'postcard'],
  ['stamp', 'Postage stamp', 'postcard'],
  ['collage2', 'Two photos', 'postcard'],
  ['collage3', 'Three photos', 'postcard'],
  ['mosaic', 'Mosaic', 'postcard'],
  ['collage4', 'Four photos', 'postcard'],
  ['text', 'Text only', 'postcard'],

  ['frame-single', 'Single photo', 'frame'],
  ['frame-caption', 'Photo and caption', 'frame'],
  ['frame-duo', 'Pair', 'frame'],
  ['frame-trio', 'Triptych', 'frame'],
  ['frame-grid', 'Grid of four', 'frame'],
  ['frame-feature', 'Feature and two', 'frame'],

  ['cal-top', 'Photo above', 'calendar'],
  ['cal-side', 'Photo beside', 'calendar'],
  ['cal-full', 'Full photo', 'calendar'],
  ['cal-duo', 'Two photos', 'calendar'],
  ['cal-plain', 'Dates only', 'calendar'],
];
export const layoutName = (id: LayoutId) => LAYOUTS.find((l) => l[0] === id)?.[1] ?? id;
export const layoutsFor = (p: ProductId) => LAYOUTS.filter((l) => l[2] === p);

export const LOOKS: [LookId, string][] = [
  ['none', 'Original'],
  ['vivid', 'Vivid'],
  ['warm', 'Warm'],
  ['cool', 'Cool'],
  ['bw', 'Black & white'],
  ['vintage', 'Vintage'],
];
