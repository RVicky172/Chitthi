import { MONTHS } from '../data/products';
import { calPages, cardMM, mergeDesign, sizeOf } from '../engine/design';
import { isObjectLike, isRecord } from '../engine/guards';
import { slotCount } from '../engine/layout';
import { photoDpi } from '../engine/render';
import { aiCreditOf, creditOf, shortName } from '../lib/credits';
import { getState, setDesign } from '../state/store';
import type { Design } from '../types';
import { ok, type ToolResult } from './common';

/*
 * What the print-design tools share: the design as an agent sees it, a partial update through the same gate as a
 * loaded file, and the list of photos on the design.
 */

/**
 * A compact description of the design an agent can reason about.
 * @param design the design (default: the one open)
 * @returns product, size, layout, photos with credits, words, back, calendar, export settings and name
 */
export function designSummary(design: Design = getState().design) {
  const { w: width, h: height } = cardMM(design);
  const { photos } = getState();
  const size = sizeOf(design);
  const { back, cal: calendar, exp: exportSettings } = design;
  return {
    product: design.product,
    size: { id: size.id, name: size.name, trimMM: [Math.round(width * 10) / 10, Math.round(height * 10) / 10], orient: design.orient },
    layout: design.layout,
    photoSlots: slotCount(design.layout, design),
    photos: photos.map((photo) => ({
      name: shortName(photo.name),
      pexels: creditOf(photo.name)?.photographer ?? null,
      ai: aiCreditOf(photo.name)?.made ?? null,
    })),
    theme: design.useOccasion ? design.themeId : 'plain',
    words: {
      greeting: design.showHeading ? design.heading : null,
      quote: design.showQuote ? design.quote : null,
      signature: design.showSig ? design.sig : null,
      headFont: design.headFont,
      quoteFont: design.quoteFont,
    },
    back: design.product === 'postcard' ? { message: back.message, from: back.from, to: back.to, address: back.address, pin: back.pin } : undefined,
    calendar:
      design.product === 'calendar'
        ? {
            year: calendar.year,
            startMonth: MONTHS[calendar.start],
            pages: calPages(design),
            words: calendar.text,
            captions: calendar.captions,
            marks: calendar.marks,
            grid: calendar.grid,
          }
        : undefined,
    export: { bleedMM: Number(exportSettings.bleed), dpi: Number(exportSettings.dpi), format: exportSettings.format, sheet: exportSettings.sheet },
    envelope: design.env.on,
    name: design.designName,
  };
}

/**
 * Deep-merges a partial design (nested groups too) and validates it the way loading a saved design does.
 * @param patch design fields; a plain object over a group merges into it
 * @returns the keys that aren't design fields (left out)
 */
export function patchDesign(patch: Record<string, unknown>): string[] {
  const current: Record<string, unknown> = { ...getState().design };
  const next: Record<string, unknown> = { ...current };
  const ignored: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in current)) {
      ignored.push(key);
      continue;
    }
    const currentValue = current[key];
    next[key] = isRecord(value) && isObjectLike(currentValue) ? { ...currentValue, ...value } : value;
  }
  setDesign(mergeDesign(next));
  return ignored;
}

/**
 * The photos on the design in slot order, with their credit and how sharp each will print.
 * @returns the list_photos result
 */
export function photoList(): ToolResult {
  const { design, photos } = getState();
  const dpiOfPhotos = photoDpi({ d: design, photos });
  return ok(
    'Photos',
    photos.map((photo, index) => ({
      index,
      name: shortName(photo.name),
      pixels: [photo.sw, photo.sh],
      dpi: dpiOfPhotos[index],
      pexels: creditOf(photo.name),
      ai: aiCreditOf(photo.name),
    })),
  );
}
