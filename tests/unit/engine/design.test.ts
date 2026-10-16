import { describe, expect, it } from 'vitest';
import { layoutsFor } from '@/data/layouts';
import { PRODUCTS, sizesFor } from '@/data/products';
import { DEFAULT_DESIGN, mergeDesign, productDesign } from '@/engine/design';
import { computeLayout, slotCount } from '@/engine/layout';

describe('mergeDesign', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const value of [null, undefined, 42, 'x']) expect(mergeDesign(value)).toEqual(DEFAULT_DESIGN);
  });

  it('drops keys a design does not have', () => {
    const design = mergeDesign({
      ...DEFAULT_DESIGN,
      evil: '<script>',
      __proto__: { polluted: true },
    }) as unknown as Record<string, unknown>;
    expect('evil' in design).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('falls back to a valid product, size and layout', () => {
    const design = mergeDesign({ product: 'spaceship', sizeId: 'nope', layout: 'nope' });
    expect(design.product).toBe('postcard');
    expect(sizesFor('postcard').some((def) => def.id === design.sizeId)).toBe(true);
    expect(layoutsFor('postcard').some(([id]) => id === design.layout)).toBe(true);
  });

  it('replaces unknown fonts with the defaults', () => {
    const design = mergeDesign({ headFont: 'Not A Font', quoteFont: 'Nope', back: { font: 'Nope' } });
    expect(design.headFont).toBe('Rozha One');
    expect(design.quoteFont).toBe('Kalam');
    expect(design.back.font).toBe('Kalam');
  });

  it('keeps calendar captions at exactly 12 strings', () => {
    const design = mergeDesign({ cal: { captions: ['Jan', 7, null] } });
    expect(design.cal.captions).toHaveLength(12);
    expect(design.cal.captions[0]).toBe('Jan');
    expect(design.cal.captions.slice(1).every((caption) => caption === '')).toBe(true);
  });

  it('keeps only valid own dates, at most 60', () => {
    const good = { m: 3, d: 14, label: 'Holi' };
    const ownDates = [
      good,
      { m: 13, d: 1, label: 'x' },
      { m: 1, d: 0, label: 'x' },
      { m: 1.5, d: 2, label: 'x' },
      { m: 1, d: 2 },
      null,
      ...Array.from({ length: 100 }, () => good),
    ];
    const design = mergeDesign({ cal: { ownDates } });
    expect(design.cal.ownDates).toHaveLength(60);
    expect(design.cal.ownDates.every((ownDate) => ownDate.m === 3 && ownDate.d === 14)).toBe(true);
  });
});

describe('computeLayout', () => {
  // Every product × size × layout gives the number of photo slots the layout promises, each with a real size.
  for (const def of PRODUCTS)
    for (const size of sizesFor(def.id))
      for (const [id] of layoutsFor(def.id))
        it(`${def.id} ${size.id} ${id}`, () => {
          const sized = { ...productDesign(def.id), sizeId: size.id, layout: id };
          const computed = computeLayout(id, { x: 0, y: 0, w: 1200, h: 800, e: 0 }, sized);
          expect(computed.slots).toHaveLength(slotCount(id, sized));
          for (const slot of computed.slots) {
            expect(Number.isFinite(slot.x) && Number.isFinite(slot.y)).toBe(true);
            expect(slot.w).toBeGreaterThan(0);
            expect(slot.h).toBeGreaterThan(0);
          }
        });
});
