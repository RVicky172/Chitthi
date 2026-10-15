import { FONTS } from '../data/fonts';
import { marksFor } from '../data/holidays';
import { layoutsFor } from '../data/layouts';
import { MONTHS, PRODUCTS, sizesFor } from '../data/products';
import { sizeLabel } from '../data/sizes';
import { TH } from '../data/themes';
import { isOneOf } from '../engine/guards';
import { slotCount } from '../engine/layout';
import { getState } from '../state/store';
import type { ProductId } from '../types';
import { numberArg, numberSchema, objectSchema, ok, stringSchema, type AgentTool } from './common';

/* The catalogue: products, sizes, layouts, themes, fonts and festivals an agent chooses from (read only). */

/** The products' ids, for schemas. */
export const PRODUCT_ENUM: readonly ProductId[] = ['postcard', 'calendar', 'frame', 'magnet'];

/**
 * The sizes of the product an agent names.
 * @param product the argument
 * @returns its sizes, or none for an unknown product
 */
function sizesNamed(product: unknown) {
  return isOneOf(PRODUCT_ENUM, product) ? sizesFor(product) : [];
}

/** The catalogue tools. */
export const CATALOG_TOOLS: AgentTool[] = [
  {
    name: 'list_products',
    title: 'List products',
    description: 'The products Chitthi designs (postcard, calendar, frame print, fridge magnet) with their default size and layout.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () =>
      ok(
        'Products',
        PRODUCTS.map((product) => ({
          id: product.id,
          name: product.name,
          about: product.blurb,
          back: product.backLabel,
          defaults: { size: product.defaults.sizeId, layout: product.defaults.layout, orient: product.defaults.orient },
        })),
      ),
  },
  {
    name: 'list_sizes',
    title: 'List sizes',
    description: 'Every print size for a product, with trim size in mm and inches. Use set_size to choose one.',
    inputSchema: objectSchema({ product: stringSchema('postcard, calendar, frame or magnet', { enum: PRODUCT_ENUM }) }, ['product']),
    readOnly: true,
    run: (args) =>
      ok(
        'Sizes',
        sizesNamed(args.product)
          .filter((size) => size.id !== 'custom')
          .map((size) => ({ id: size.id, name: size.name, size: sizeLabel(size), group: size.grp, tag: size.tag })),
      ),
  },
  {
    name: 'list_layouts',
    title: 'List layouts',
    description: 'Layouts for the current product, with how many photos each holds at the current size.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () => {
      const { design } = getState();
      return ok(
        'Layouts',
        layoutsFor(design.product).map(([id, name]) => ({ id, name, photos: slotCount(id, { ...design, layout: id }) })),
      );
    },
  },
  {
    name: 'list_themes',
    title: 'List occasion themes',
    description: 'Occasion themes (Indian festivals, birthdays, seasons) with their colours, suggested greetings and quotes.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () =>
      ok(
        'Themes',
        TH.map((theme) => ({ id: theme.id, name: theme.name, group: theme.g, colours: [theme.bg1, theme.accent], greetings: theme.heads, quotes: theme.quotes.slice(0, 2) })),
      ),
  },
  {
    name: 'list_fonts',
    title: 'List fonts',
    description:
      'Font families available for every text field, with category (ind = Hindi and Indian scripts, reg = other Indian scripts, disp = display, scr = script, ss = sans).',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () => ok('Fonts', FONTS.map((font) => ({ name: font.n, category: font.c, note: font.note }))),
  },
  {
    name: 'list_festivals',
    title: 'List festivals and national days',
    description:
      'National days and festivals Chitthi marks on calendars for a year (Government of India holiday lists; moving festivals are built in for some years only).',
    inputSchema: objectSchema({ year: numberSchema('Year, e.g. 2027') }, ['year']),
    readOnly: true,
    run: (args) => {
      const year = numberArg(args.year, new Date().getFullYear());
      const months = MONTHS.map((month, index) => ({
        month,
        days: [...marksFor(year, index, 'all').entries()].map(([day, marks]) => ({ day, names: marks.map((mark) => mark.name) })),
      }));
      return ok(`Festivals in ${year}`, months);
    },
  },
];
