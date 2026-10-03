import { describe, expect, it } from 'vitest';
import { layoutsFor } from '../data/layouts';
import { PRODUCTS, sizesFor } from '../data/products';
import { DEFAULT_DESIGN, mergeDesign, productDesign } from './design';
import { computeLayout, slotCount } from './layout';

describe('mergeDesign', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const v of [null, undefined, 42, 'x']) expect(mergeDesign(v)).toEqual(DEFAULT_DESIGN);
  });

  it('drops keys a design does not have', () => {
    const d = mergeDesign({ ...DEFAULT_DESIGN, evil: '<script>', __proto__: { polluted: true } }) as unknown as Record<string, unknown>;
    expect('evil' in d).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('falls back to a valid product, size and layout', () => {
    const d = mergeDesign({ product: 'spaceship', sizeId: 'nope', layout: 'nope' });
    expect(d.product).toBe('postcard');
    expect(sizesFor('postcard').some((s) => s.id === d.sizeId)).toBe(true);
    expect(layoutsFor('postcard').some(([id]) => id === d.layout)).toBe(true);
  });

  it('replaces unknown fonts with the defaults', () => {
    const d = mergeDesign({ headFont: 'Not A Font', quoteFont: 'Nope', back: { font: 'Nope' } });
    expect(d.headFont).toBe('Rozha One');
    expect(d.quoteFont).toBe('Kalam');
    expect(d.back.font).toBe('Kalam');
  });

  it('keeps calendar captions at exactly 12 strings', () => {
    const d = mergeDesign({ cal: { captions: ['Jan', 7, null] } });
    expect(d.cal.captions).toHaveLength(12);
    expect(d.cal.captions[0]).toBe('Jan');
    expect(d.cal.captions.slice(1).every((c) => c === '')).toBe(true);
  });

  it('keeps only valid own dates, at most 60', () => {
    const good = { m: 3, d: 14, label: 'Holi' };
    const ownDates = [good, { m: 13, d: 1, label: 'x' }, { m: 1, d: 0, label: 'x' }, { m: 1.5, d: 2, label: 'x' }, { m: 1, d: 2 }, null, ...Array(100).fill(good)];
    const d = mergeDesign({ cal: { ownDates } });
    expect(d.cal.ownDates).toHaveLength(60);
    expect(d.cal.ownDates.every((o) => o.m === 3 && o.d === 14)).toBe(true);
  });
});

describe('computeLayout', () => {
  // Every product × size × layout gives the number of photo slots the layout promises, each with a real size.
  for (const p of PRODUCTS)
    for (const size of sizesFor(p.id))
      for (const [id] of layoutsFor(p.id))
        it(`${p.id} ${size.id} ${id}`, () => {
          const d = { ...productDesign(p.id), sizeId: size.id, layout: id };
          const L = computeLayout(id, { x: 0, y: 0, w: 1200, h: 800, e: 0 }, d);
          expect(L.slots).toHaveLength(slotCount(id, d));
          for (const s of L.slots) {
            expect(Number.isFinite(s.x) && Number.isFinite(s.y)).toBe(true);
            expect(s.w).toBeGreaterThan(0);
            expect(s.h).toBeGreaterThan(0);
          }
        });
});
