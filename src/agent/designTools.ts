import { layoutsFor } from '../data/layouts';
import { productOf } from '../data/products';
import { SIZES } from '../data/sizes';
import { TH } from '../data/themes';
import { productDesign } from '../engine/design';
import { isOneOf } from '../engine/guards';
import { slotCount } from '../engine/layout';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { applyTheme, selectSize, switchProduct } from '../state/actions';
import { getState, replaceCard, setBack, setDesign } from '../state/store';
import type { BackDesign, CalendarSettings, CalTextPlace, Design, Orient } from '../types';
import { PRODUCT_ENUM } from './catalogTools';
import { numberSchema, objectSchema, ok, recordArg, stringArg, stringSchema, ToolError, type AgentTool } from './common';
import { designSummary, patchDesign } from './designSummary';

/* The design tools: product, size, layout, theme, words, back, calendar and any other setting. */

const ORIENTS: readonly Orient[] = ['landscape', 'portrait'];
const CALENDAR_WORDS: readonly CalTextPlace[] = ['off', 'caption', 'photo'];
const CALENDAR_MARKS: readonly CalendarSettings['marks'][] = ['off', 'national', 'all'];

/**
 * An argument that must be one of a schema's values.
 * @param options the allowed values
 * @param value the argument
 * @param what what it is, for the message
 * @returns the value
 * @throws ToolError for any other value
 */
function oneOf<T extends string>(options: readonly T[], value: unknown, what: string): T {
  if (!isOneOf(options, value)) throw new ToolError(`Unknown ${what} “${stringArg(value)}”; use ${options.join(', ')}.`);
  return value;
}

/**
 * The captions an agent gives, over the calendar's.
 * @param given an array (index 0 = January) or an object keyed by month number 1–12
 * @param captions the calendar's captions
 * @returns the new captions
 */
function captionsFrom(given: unknown, captions: readonly string[]): string[] {
  const next = [...captions];
  if (Array.isArray(given)) given.slice(0, 12).forEach((caption, index) => (next[index] = stringArg(caption)));
  else
    for (const [month, caption] of Object.entries(recordArg(given))) {
      const number = Number(month);
      if (number >= 1 && number <= 12) next[number - 1] = stringArg(caption);
    }
  return next;
}

/**
 * A calendar's settings with an agent's changes (all but the style preset).
 * @param args the set_calendar arguments
 * @param calendar the calendar's settings
 * @returns the changed settings
 */
function calendarWith(args: Record<string, unknown>, calendar: CalendarSettings): CalendarSettings {
  const next = { ...calendar };
  if (typeof args.year === 'number') next.year = Math.round(args.year);
  if (typeof args.startMonth === 'number') next.start = Math.min(11, Math.max(0, Math.round(args.startMonth) - 1));
  if (args.pages === 1 || args.pages === 12) next.months = args.pages;
  if (args.captions) {
    next.captions = captionsFrom(args.captions, calendar.captions);
    if (next.text === 'off') next.text = 'caption';
  }
  if (typeof args.words === 'string') next.text = oneOf(CALENDAR_WORDS, args.words, 'words place');
  if (typeof args.marks === 'string') next.marks = oneOf(CALENDAR_MARKS, args.marks, 'marks setting');
  return next;
}

/**
 * The words an agent gives, as a design patch.
 * @param args the set_words arguments
 * @returns the fields to change
 */
function wordsPatch(args: Record<string, unknown>): Partial<Design> {
  const patch: Partial<Design> = {};
  if (typeof args.greeting === 'string') Object.assign(patch, { heading: args.greeting, showHeading: !!args.greeting.trim() });
  if (typeof args.quote === 'string') Object.assign(patch, { quote: args.quote, showQuote: !!args.quote.trim() });
  if (typeof args.signature === 'string') Object.assign(patch, { sig: args.signature, showSig: !!args.signature.trim() });
  for (const key of ['headFont', 'quoteFont', 'sigFont'] as const) {
    const font = args[key];
    if (typeof font === 'string') patch[key] = font;
  }
  if (typeof args.textScale === 'number') patch.textScale = Math.min(1.6, Math.max(0.6, args.textScale));
  return patch;
}

/** The design tools. */
export const DESIGN_TOOLS: AgentTool[] = [
  {
    name: 'get_design',
    title: 'Get the current design',
    description: 'A summary of the design open in Chitthi: product, size, layout, photos (with credits), words, calendar and export settings.',
    inputSchema: objectSchema(),
    readOnly: true,
    run: () => ok('Current design', designSummary()),
  },
  {
    name: 'new_design',
    title: 'Start a new design',
    description:
      'Starts a fresh design of a product (postcard, calendar, frame, magnet) with its default size and layout. The previous design stays in history (Undo) but is not saved; call save_design first to keep it.',
    inputSchema: objectSchema({ product: stringSchema('postcard, calendar, frame or magnet', { enum: PRODUCT_ENUM }) }, ['product']),
    run: (args) => {
      const product = oneOf(PRODUCT_ENUM, stringArg(args.product, 'postcard'), 'product');
      switchProduct(product);
      replaceCard(productDesign(product, getState().design), [], null);
      return ok(`New ${productOf(product).name.toLowerCase()} started.`, designSummary());
    },
  },
  {
    name: 'set_size',
    title: 'Set size and orientation',
    description: 'Chooses a print size (id from list_sizes) and optionally the orientation.',
    inputSchema: objectSchema(
      { sizeId: stringSchema('Size id from list_sizes'), orient: stringSchema('landscape (horizontal) or portrait (vertical)', { enum: ORIENTS }) },
      ['sizeId'],
    ),
    run: (args) => {
      const size = SIZES.find((candidate) => candidate.id === args.sizeId);
      if (!size) throw new ToolError(`Unknown size “${stringArg(args.sizeId)}”. Use list_sizes.`);
      const orient = args.orient ? oneOf(ORIENTS, args.orient, 'orientation') : undefined;
      selectSize(size);
      if (orient) setDesign({ orient });
      return ok(`Size set to ${size.name}.`, designSummary());
    },
  },
  {
    name: 'set_layout',
    title: 'Set layout',
    description: 'Chooses a layout (id from list_layouts).',
    inputSchema: objectSchema({ layout: stringSchema('Layout id from list_layouts') }, ['layout']),
    run: (args) => {
      const { design } = getState();
      const layout = layoutsFor(design.product).find(([id]) => id === args.layout)?.[0];
      if (!layout) throw new ToolError(`“${stringArg(args.layout)}” isn’t a ${design.product} layout. Use list_layouts.`);
      setDesign({ layout });
      return ok(`Layout set to ${layout}; it holds ${slotCount(layout, getState().design)} photo(s).`);
    },
  },
  {
    name: 'set_theme',
    title: 'Set occasion theme',
    description:
      'Applies an occasion theme (id from list_themes): colours, artwork, fonts and a suggested greeting and quote. Use "plain" for no theme.',
    inputSchema: objectSchema({ themeId: stringSchema('Theme id from list_themes, or "plain"') }, ['themeId']),
    run: (args) => {
      const themeId = stringArg(args.themeId);
      if (themeId === 'plain') setDesign({ useOccasion: false });
      else if (TH.some((theme) => theme.id === themeId)) applyTheme(themeId);
      else throw new ToolError(`Unknown theme “${themeId}”. Use list_themes.`);
      return ok(`Theme set to ${themeId}.`, designSummary().words);
    },
  },
  {
    name: 'set_words',
    title: 'Set the words',
    description:
      'Sets the greeting, quote and signature on the front, and optionally their fonts (names from list_fonts). Pass an empty string to hide a line.',
    inputSchema: objectSchema({
      greeting: stringSchema('Headline, e.g. "Shubh Deepavali"'),
      quote: stringSchema('Wish or quote, one or two sentences'),
      signature: stringSchema('Signature line, e.g. "With love, Asha"'),
      headFont: stringSchema('Font for the greeting'),
      quoteFont: stringSchema('Font for the quote'),
      sigFont: stringSchema('Font for the signature'),
      textScale: numberSchema('Text size, 0.6–1.6 (1 = the layout’s own size)', { minimum: 0.6, maximum: 1.6 }),
    }),
    run: async (args) => {
      patchDesign(wordsPatch(args));
      await ensureFonts(fontsFor(getState().design));
      return ok('Words updated.', designSummary().words);
    },
  },
  {
    name: 'set_back',
    title: 'Set the back',
    description:
      'Postcards: the message and address on the back (leave message empty for ruled lines to write by hand). Frames: the dedication message and From.',
    inputSchema: objectSchema({
      message: stringSchema('Message'),
      from: stringSchema('From (sender name)'),
      to: stringSchema('To (name)'),
      address: stringSchema('Address, lines separated by \\n'),
      pin: stringSchema('6-digit PIN code'),
    }),
    run: (args) => {
      const patch: Partial<BackDesign> = {};
      for (const key of ['message', 'from', 'to', 'address'] as const) {
        const value = args[key];
        if (typeof value === 'string') patch[key] = value;
      }
      if (typeof args.pin === 'string') patch.pin = args.pin.replace(/\D/g, '').slice(0, 6);
      setBack(patch);
      return ok('Back updated.', designSummary().back);
    },
  },
  {
    name: 'set_calendar',
    title: 'Set calendar options',
    description:
      'Calendars: year, first month (1–12), 12 pages or a single month, captions (an array of up to 12, January first, or an object {"3": "Holi"}), where words go, marked festivals, and a style preset (classic, modern, minimal, elegant, bold).',
    inputSchema: objectSchema({
      year: numberSchema('Year, e.g. 2027'),
      startMonth: numberSchema('First month, 1 = January', { minimum: 1, maximum: 12 }),
      pages: numberSchema('12 or 1', { enum: [1, 12] }),
      captions: { description: 'Captions: array (index 0 = January) or object keyed by month number 1–12' },
      words: stringSchema('Where words go', { enum: CALENDAR_WORDS }),
      marks: stringSchema('Marked days', { enum: CALENDAR_MARKS }),
      style: stringSchema('Style preset', { enum: ['classic', 'modern', 'minimal', 'elegant', 'bold'] }),
    }),
    run: async (args) => {
      const { design } = getState();
      if (design.product !== 'calendar') throw new ToolError('The current design isn’t a calendar. Use new_design with product "calendar".');
      const calendar = calendarWith(args, design.cal);
      if (typeof args.style === 'string') {
        const { STYLES } = await import('../components/panes/CalendarFront');
        const style = STYLES.find(([id]) => id === args.style);
        if (style) Object.assign(calendar, style[2], { titleScale: 1, numScale: 1 });
      }
      setDesign({ cal: calendar });
      await ensureFonts(fontsFor(getState().design));
      return ok('Calendar updated.', designSummary().calendar);
    },
  },
  {
    name: 'update_design',
    title: 'Update any design setting',
    description:
      'Advanced: merges a partial design object (the same fields a saved .chitthi file has, e.g. {"exp": {"bleed": "3"}}, {"env": {"on": true}}). Values are validated like loading a saved design; unknown keys are ignored and reported.',
    inputSchema: objectSchema({ patch: { type: 'object', description: 'Partial design' } }, ['patch']),
    run: (args) => {
      const ignored = patchDesign(recordArg(args.patch));
      return ok(ignored.length ? `Updated. Ignored unknown keys: ${ignored.join(', ')}.` : 'Updated.', designSummary());
    },
  },
];
