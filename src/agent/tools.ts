import { AI_LANGUAGES } from '../data/aiProviders';
import { FONTS } from '../data/fonts';
import { marksFor } from '../data/holidays';
import { layoutsFor } from '../data/layouts';
import { MONTHS, PRODUCTS, productOf, sizesFor } from '../data/products';
import { PRINT_SPECS } from '../data/printSpecs';
import { SIZES, sizeLabel } from '../data/sizes';
import { TH } from '../data/themes';
import { calPages, cardMM, mergeDesign, productDesign, sizeOf } from '../engine/design';
import { buildPack, buildPDF, nup } from '../engine/export';
import { slotCount } from '../engine/layout';
import { calMonth, photoDpi, renderCard } from '../engine/render';
import { aiCreditOf, creditOf, isPexels, shortName } from '../lib/credits';
import { db } from '../lib/db';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { fetchPexels, searchPexels, type PexelsPhoto } from '../lib/pexels';
import { applyTheme, openDesign, saveDesign, selectSize, switchProduct } from '../state/actions';
import { putOnCard, storePhotos } from '../state/library';
import { selectSlot } from '../state/photoSlots';
import { getState, replaceCard, setBack, setDesign, setUI } from '../state/store';
import { autoArrange } from '../state/traits';
import type { Design, LayoutId, Orient, ProductId } from '../types';

/*
 * Agent tools (Command pattern): every studio capability an AI agent may use, as {name, description, JSON Schema,
 * handler}. One registry serves the MCP server (electron/mcp.cjs, headless or live) and can serve an in-app
 * assistant. Handlers only call existing store actions and engine functions, so tools behave exactly like the studio,
 * and Undo reverts what an agent did in the live app. Files a tool makes are written by the desktop app into the
 * agent output folder and returned as paths; images for the agent to look at come back small (≤ 1024 px).
 */

export interface ToolFile {
  name: string;
  blob: Blob;
}
export interface ToolResult {
  text: string;
  json?: unknown;
  image?: Blob;
  files?: ToolFile[];
}
export interface AgentTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly?: boolean;
  destructive?: boolean;
  run(args: Record<string, unknown>, env: AgentEnv): Promise<ToolResult>;
}
export interface AgentEnv {
  /** Desktop: reads an image file the agent names (the main process checks type and size). */
  readPhoto?: (path: string) => Promise<{ name: string; data: ArrayBuffer; type: string }>;
}

const obj = (properties: Record<string, unknown> = {}, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'string', description, ...extra });
const num = (description: string, extra: Record<string, unknown> = {}) => ({ type: 'number', description, ...extra });
const bool = (description: string) => ({ type: 'boolean', description });

const s = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const n = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const ok = (text: string, json?: unknown): ToolResult => ({ text, json });
class ToolError extends Error {}

/** A compact description of the design an agent can reason about. */
function summary(d: Design = getState().design) {
  const { w, h } = cardMM(d),
    photos = getState().photos,
    size = sizeOf(d);
  return {
    product: d.product,
    size: { id: size.id, name: size.name, trimMM: [Math.round(w * 10) / 10, Math.round(h * 10) / 10], orient: d.orient },
    layout: d.layout,
    photoSlots: slotCount(d.layout, d),
    photos: photos.map((p) => ({ name: shortName(p.name), pexels: creditOf(p.name)?.photographer ?? null, ai: aiCreditOf(p.name)?.made ?? null })),
    theme: d.useOccasion ? d.themeId : 'plain',
    words: { greeting: d.showHeading ? d.heading : null, quote: d.showQuote ? d.quote : null, signature: d.showSig ? d.sig : null, headFont: d.headFont, quoteFont: d.quoteFont },
    back: d.product === 'postcard' ? { message: d.back.message, from: d.back.from, to: d.back.to, address: d.back.address, pin: d.back.pin } : undefined,
    calendar:
      d.product === 'calendar'
        ? { year: d.cal.year, startMonth: MONTHS[d.cal.start], pages: calPages(d), words: d.cal.text, captions: d.cal.captions, marks: d.cal.marks, grid: d.cal.grid }
        : undefined,
    export: { bleedMM: +d.exp.bleed, dpi: +d.exp.dpi, format: d.exp.format, sheet: d.exp.sheet },
    envelope: d.env.on,
    name: d.designName,
  };
}

/** Deep-merges a partial design (nested groups too) and validates it the way loading a saved design does. */
function patchDesign(patch: Record<string, unknown>): string[] {
  const cur = getState().design as unknown as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  const ignored: string[] = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in cur)) {
      ignored.push(k);
      continue;
    }
    next[k] = v && typeof v === 'object' && !Array.isArray(v) && cur[k] && typeof cur[k] === 'object' ? { ...(cur[k] as object), ...(v as object) } : v;
  }
  setDesign(mergeDesign(next));
  return ignored;
}

const toBlob = (cv: HTMLCanvasElement, type = 'image/png', q?: number) =>
  new Promise<Blob>((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new ToolError('The image couldn’t be made.'))), type, q));

/** Pexels results the agent has seen, so add_pexels_photo can use one by id (with its credit). */
const pexelsSeen = new Map<number, PexelsPhoto>();
const remember = (p: PexelsPhoto) => {
  pexelsSeen.set(p.id, p);
  if (pexelsSeen.size > 500) pexelsSeen.delete(pexelsSeen.keys().next().value!);
};

export const TOOLS: AgentTool[] = [
  /* ---------- catalogue ---------- */
  {
    name: 'list_products',
    title: 'List products',
    description: 'The products Chitthi designs (postcard, calendar, frame print, fridge magnet) with their default size and layout.',
    inputSchema: obj(),
    readOnly: true,
    run: async () =>
      ok('Products', PRODUCTS.map((p) => ({ id: p.id, name: p.name, about: p.blurb, back: p.backLabel, defaults: { size: p.defaults.sizeId, layout: p.defaults.layout, orient: p.defaults.orient } }))),
  },
  {
    name: 'list_sizes',
    title: 'List sizes',
    description: 'Every print size for a product, with trim size in mm and inches. Use set_size to choose one.',
    inputSchema: obj({ product: str('postcard, calendar, frame or magnet', { enum: ['postcard', 'calendar', 'frame', 'magnet'] }) }, ['product']),
    readOnly: true,
    run: async (a) => ok('Sizes', sizesFor(s(a.product) as ProductId).filter((x) => x.id !== 'custom').map((x) => ({ id: x.id, name: x.name, size: sizeLabel(x), group: x.grp, tag: x.tag }))),
  },
  {
    name: 'list_layouts',
    title: 'List layouts',
    description: 'Layouts for the current product, with how many photos each holds at the current size.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => {
      const d = getState().design;
      return ok('Layouts', layoutsFor(d.product).map(([id, name]) => ({ id, name, photos: slotCount(id, { ...d, layout: id }) })));
    },
  },
  {
    name: 'list_themes',
    title: 'List occasion themes',
    description: 'Occasion themes (Indian festivals, birthdays, seasons) with their colours, suggested greetings and quotes.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => ok('Themes', TH.map((t) => ({ id: t.id, name: t.name, group: t.g, colours: [t.bg1, t.accent], greetings: t.heads, quotes: t.quotes.slice(0, 2) }))),
  },
  {
    name: 'list_fonts',
    title: 'List fonts',
    description: 'Font families available for every text field, with category (ind = Hindi and Indian scripts, reg = other Indian scripts, disp = display, scr = script, ss = sans).',
    inputSchema: obj(),
    readOnly: true,
    run: async () => ok('Fonts', FONTS.map((f) => ({ name: f.n, category: f.c, note: f.note }))),
  },
  {
    name: 'list_festivals',
    title: 'List festivals and national days',
    description: 'National days and festivals Chitthi marks on calendars for a year (Government of India holiday lists; moving festivals are built in for some years only).',
    inputSchema: obj({ year: num('Year, e.g. 2027') }, ['year']),
    readOnly: true,
    run: async (a) => {
      const year = n(a.year, new Date().getFullYear());
      const out = MONTHS.map((m, i) => ({ month: m, days: [...marksFor(year, i, 'all').entries()].map(([day, list]) => ({ day, names: list.map((x) => x.name) })) }));
      return ok(`Festivals in ${year}`, out);
    },
  },

  /* ---------- design ---------- */
  {
    name: 'get_design',
    title: 'Get the current design',
    description: 'A summary of the design open in Chitthi: product, size, layout, photos (with credits), words, calendar and export settings.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => ok('Current design', summary()),
  },
  {
    name: 'new_design',
    title: 'Start a new design',
    description: 'Starts a fresh design of a product (postcard, calendar, frame, magnet) with its default size and layout. The previous design stays in history (Undo) but is not saved; call save_design first to keep it.',
    inputSchema: obj({ product: str('postcard, calendar, frame or magnet', { enum: ['postcard', 'calendar', 'frame', 'magnet'] }) }, ['product']),
    run: async (a) => {
      const p = s(a.product, 'postcard') as ProductId;
      switchProduct(p);
      replaceCard(productDesign(p, getState().design), [], null);
      return ok(`New ${productOf(p).name.toLowerCase()} started.`, summary());
    },
  },
  {
    name: 'set_size',
    title: 'Set size and orientation',
    description: 'Chooses a print size (id from list_sizes) and optionally the orientation.',
    inputSchema: obj({ sizeId: str('Size id from list_sizes'), orient: str('landscape (horizontal) or portrait (vertical)', { enum: ['landscape', 'portrait'] }) }, ['sizeId']),
    run: async (a) => {
      const size = SIZES.find((x) => x.id === a.sizeId);
      if (!size) throw new ToolError(`Unknown size “${s(a.sizeId)}”. Use list_sizes.`);
      selectSize(size);
      if (a.orient) setDesign({ orient: s(a.orient) as Orient });
      return ok(`Size set to ${size.name}.`, summary());
    },
  },
  {
    name: 'set_layout',
    title: 'Set layout',
    description: 'Chooses a layout (id from list_layouts).',
    inputSchema: obj({ layout: str('Layout id from list_layouts') }, ['layout']),
    run: async (a) => {
      const d = getState().design,
        id = s(a.layout) as LayoutId;
      if (!layoutsFor(d.product).some(([l]) => l === id)) throw new ToolError(`“${id}” isn’t a ${d.product} layout. Use list_layouts.`);
      setDesign({ layout: id });
      return ok(`Layout set to ${id}; it holds ${slotCount(id, getState().design)} photo(s).`);
    },
  },
  {
    name: 'set_theme',
    title: 'Set occasion theme',
    description: 'Applies an occasion theme (id from list_themes): colours, artwork, fonts and a suggested greeting and quote. Use "plain" for no theme.',
    inputSchema: obj({ themeId: str('Theme id from list_themes, or "plain"') }, ['themeId']),
    run: async (a) => {
      const id = s(a.themeId);
      if (id === 'plain') setDesign({ useOccasion: false });
      else if (TH.some((t) => t.id === id)) applyTheme(id);
      else throw new ToolError(`Unknown theme “${id}”. Use list_themes.`);
      return ok(`Theme set to ${id}.`, summary().words);
    },
  },
  {
    name: 'set_words',
    title: 'Set the words',
    description: 'Sets the greeting, quote and signature on the front, and optionally their fonts (names from list_fonts). Pass an empty string to hide a line.',
    inputSchema: obj({
      greeting: str('Headline, e.g. "Shubh Deepavali"'),
      quote: str('Wish or quote, one or two sentences'),
      signature: str('Signature line, e.g. "With love, Asha"'),
      headFont: str('Font for the greeting'),
      quoteFont: str('Font for the quote'),
      sigFont: str('Font for the signature'),
      textScale: num('Text size, 0.6–1.6 (1 = the layout’s own size)', { minimum: 0.6, maximum: 1.6 }),
    }),
    run: async (a) => {
      const p: Partial<Design> = {};
      if (typeof a.greeting === 'string') Object.assign(p, { heading: a.greeting, showHeading: !!a.greeting.trim() });
      if (typeof a.quote === 'string') Object.assign(p, { quote: a.quote, showQuote: !!a.quote.trim() });
      if (typeof a.signature === 'string') Object.assign(p, { sig: a.signature, showSig: !!a.signature.trim() });
      for (const k of ['headFont', 'quoteFont', 'sigFont'] as const) if (typeof a[k] === 'string') p[k] = a[k] as string;
      if (typeof a.textScale === 'number') p.textScale = Math.min(1.6, Math.max(0.6, a.textScale));
      patchDesign(p);
      await ensureFonts(fontsFor(getState().design));
      return ok('Words updated.', summary().words);
    },
  },
  {
    name: 'set_back',
    title: 'Set the back',
    description: 'Postcards: the message and address on the back (leave message empty for ruled lines to write by hand). Frames: the dedication message and From.',
    inputSchema: obj({ message: str('Message'), from: str('From (sender name)'), to: str('To (name)'), address: str('Address, lines separated by \\n'), pin: str('6-digit PIN code') }),
    run: async (a) => {
      const p: Record<string, string> = {};
      for (const k of ['message', 'from', 'to', 'address'] as const) if (typeof a[k] === 'string') p[k] = a[k] as string;
      if (typeof a.pin === 'string') p.pin = a.pin.replace(/\D/g, '').slice(0, 6);
      setBack(p);
      return ok('Back updated.', summary().back);
    },
  },
  {
    name: 'set_calendar',
    title: 'Set calendar options',
    description:
      'Calendars: year, first month (1–12), 12 pages or a single month, captions (an array of up to 12, January first, or an object {"3": "Holi"}), where words go, marked festivals, and a style preset (classic, modern, minimal, elegant, bold).',
    inputSchema: obj({
      year: num('Year, e.g. 2027'),
      startMonth: num('First month, 1 = January', { minimum: 1, maximum: 12 }),
      pages: num('12 or 1', { enum: [1, 12] }),
      captions: { description: 'Captions: array (index 0 = January) or object keyed by month number 1–12' },
      words: str('Where words go', { enum: ['off', 'caption', 'photo'] }),
      marks: str('Marked days', { enum: ['off', 'national', 'all'] }),
      style: str('Style preset', { enum: ['classic', 'modern', 'minimal', 'elegant', 'bold'] }),
    }),
    run: async (a) => {
      const d = getState().design;
      if (d.product !== 'calendar') throw new ToolError('The current design isn’t a calendar. Use new_design with product "calendar".');
      const cal = { ...d.cal };
      if (typeof a.year === 'number') cal.year = Math.round(a.year);
      if (typeof a.startMonth === 'number') cal.start = Math.min(11, Math.max(0, Math.round(a.startMonth) - 1));
      if (a.pages === 1 || a.pages === 12) cal.months = a.pages;
      if (Array.isArray(a.captions)) a.captions.slice(0, 12).forEach((c, i) => (cal.captions[i] = s(c)));
      else if (a.captions && typeof a.captions === 'object')
        for (const [k, v] of Object.entries(a.captions as Record<string, unknown>)) if (+k >= 1 && +k <= 12) cal.captions[+k - 1] = s(v);
      if (a.captions && cal.text === 'off') cal.text = 'caption';
      if (typeof a.words === 'string') cal.text = a.words as typeof cal.text;
      if (typeof a.marks === 'string') cal.marks = a.marks as typeof cal.marks;
      if (typeof a.style === 'string') {
        const { STYLES } = await import('../components/panes/CalendarFront');
        const st = STYLES.find(([id]) => id === a.style);
        if (st) Object.assign(cal, st[2], { titleScale: 1, numScale: 1 });
      }
      setDesign({ cal });
      await ensureFonts(fontsFor(getState().design));
      return ok('Calendar updated.', summary().calendar);
    },
  },
  {
    name: 'update_design',
    title: 'Update any design setting',
    description:
      'Advanced: merges a partial design object (the same fields a saved .chitthi file has, e.g. {"exp": {"bleed": "3"}}, {"env": {"on": true}}). Values are validated like loading a saved design; unknown keys are ignored and reported.',
    inputSchema: obj({ patch: { type: 'object', description: 'Partial design' } }, ['patch']),
    run: async (a) => {
      const ignored = patchDesign((a.patch as Record<string, unknown>) ?? {});
      return ok(ignored.length ? `Updated. Ignored unknown keys: ${ignored.join(', ')}.` : 'Updated.', summary());
    },
  },

  /* ---------- photos ---------- */
  {
    name: 'list_photos',
    title: 'List photos on the design',
    description: 'Photos on the design in slot order, with their credit and how sharp each will print (dpi; 250+ sharp, 150–250 fine, under 150 soft).',
    inputSchema: obj(),
    readOnly: true,
    run: async () => {
      const { design: d, photos } = getState(),
        dpi = photoDpi({ d, photos });
      return ok('Photos', photos.map((p, i) => ({ index: i, name: shortName(p.name), pixels: [p.sw, p.sh], dpi: dpi[i], pexels: creditOf(p.name), ai: aiCreditOf(p.name) })));
    },
  },
  {
    name: 'select_slot',
    title: 'Select a photo slot',
    description: 'Selects which photo slot (0-based) the next added photo goes into. For calendars, set_calendar_page chooses the month.',
    inputSchema: obj({ slot: num('Slot index, 0-based', { minimum: 0 }) }, ['slot']),
    run: async (a) => {
      const count = slotCount(getState().design.layout, getState().design);
      const i = Math.min(count - 1, Math.max(0, Math.round(n(a.slot, 0))));
      selectSlot(i);
      return ok(`Slot ${i + 1} of ${count} selected.`);
    },
  },
  {
    name: 'set_calendar_page',
    title: 'Show a calendar month',
    description: 'Calendars: shows a month page (1-based page number in the calendar), so render_preview and photo tools act on it.',
    inputSchema: obj({ page: num('Page number, 1 = first month', { minimum: 1 }) }, ['page']),
    run: async (a) => {
      const d = getState().design,
        p = Math.min(calPages(d), Math.max(1, Math.round(n(a.page, 1)))) - 1;
      setUI({ calPage: p, side: 'front' });
      const { year, month } = calMonth(d, p);
      return ok(`Showing ${MONTHS[month]} ${year}.`);
    },
  },
  {
    name: 'add_photo',
    title: 'Add a photo from a file or URL',
    description: 'Adds a JPG, PNG or WebP photo to the design (into the selected slot) and the photo library, from a local file path (desktop) or an https URL the user owns or may use.',
    inputSchema: obj({ path: str('Local file path'), url: str('https URL of an image'), name: str('Name to show for the photo') }),
    run: async (a, env) => {
      let data: Blob, name: string;
      if (typeof a.path === 'string' && a.path) {
        if (!env.readPhoto) throw new ToolError('Local files can be added in the desktop app only.');
        const f = await env.readPhoto(a.path);
        data = new Blob([f.data], { type: f.type });
        name = s(a.name) || f.name;
      } else if (typeof a.url === 'string' && /^https:\/\//.test(a.url)) {
        const r = await fetch(a.url);
        if (!r.ok) throw new ToolError(`The image couldn’t be downloaded (${r.status}).`);
        data = await r.blob();
        name = s(a.name) || decodeURIComponent(a.url.split('/').pop() ?? 'photo').slice(0, 60);
      } else throw new ToolError('Give a local file path or an https URL.');
      if (!/^image\/(jpeg|png|webp)$/.test(data.type)) throw new ToolError('Only JPG, PNG or WebP images can be used.');
      const url = await new Promise<string>((ok2, fail) => {
        const fr = new FileReader();
        fr.onload = () => ok2(String(fr.result));
        fr.onerror = () => fail(fr.error);
        fr.readAsDataURL(data);
      });
      const ph = { name, url };
      await storePhotos([ph]);
      await putOnCard({ id: '', added: Date.now(), ...ph });
      return ok(`Added “${name}”.`, (await TOOLS_BY_NAME.list_photos.run({}, env)).json);
    },
  },
  {
    name: 'search_pexels',
    title: 'Search free photos on Pexels',
    description:
      'Searches Pexels (needs the user’s Pexels key in Settings). Results carry the photographer credit. Pexels rules: credit photographers, don’t sell an unaltered photo as a print (add words, layout or artwork), no identifiable people in a bad light, don’t imply endorsement.',
    inputSchema: obj({ query: str('Search words, e.g. "diwali diya lamps"'), orientation: str('Photo shape', { enum: ['landscape', 'portrait', 'square'] }) }, ['query']),
    readOnly: true,
    run: async (a) => {
      const r = await searchPexels(s(a.query), (s(a.orientation) || null) as 'landscape' | 'portrait' | 'square' | null, 1);
      for (const p of r.photos) remember(p);
      return ok(`${r.total_results} results; showing ${r.photos.length}. Add one with add_pexels_photo.`, r.photos.map((p) => ({ id: p.id, alt: p.alt, photographer: p.photographer, size: [p.width, p.height], page: p.url })));
    },
  },
  {
    name: 'add_pexels_photo',
    title: 'Add a Pexels photo',
    description: 'Downloads a photo from the last search_pexels results (by id) into the selected slot, keeping its photographer credit.',
    inputSchema: obj({ id: num('Photo id from search_pexels') }, ['id']),
    run: async (a) => {
      const p = pexelsSeen.get(n(a.id, 0));
      if (!p) throw new ToolError('Search first with search_pexels, then use an id from its results.');
      const ph = await fetchPexels(p);
      await storePhotos([ph]);
      await putOnCard({ id: '', added: Date.now(), ...ph });
      return ok(`Added the photo by ${p.photographer} on Pexels.`);
    },
  },
  {
    name: 'auto_arrange',
    title: 'Auto-arrange photos',
    description: 'Puts each photo in the slot whose shape suits it and centres each crop on its subject.',
    inputSchema: obj(),
    run: async () => {
      autoArrange();
      return ok('Photos arranged.');
    },
  },

  /* ---------- AI (the user's own provider, chosen in Settings → AI) ---------- */
  {
    name: 'write_words',
    title: 'Write words with AI',
    description:
      'Asks the AI service chosen in Chitthi’s settings for greeting, quote and signature options that fit the layout. Set apply to an option index to use it. Languages: ' +
      AI_LANGUAGES.map((l) => l.id).join(', '),
    inputSchema: obj({ language: str('Language id', { enum: AI_LANGUAGES.map((l) => l.id) }), tone: str('warm, playful, formal, poetic, short and sweet'), notes: str('Anything to mention'), apply: num('Index of the option to use') }),
    run: async (a) => {
      const { writeWords } = await import('../ai/service');
      const opts = await writeWords(getState().design, { language: s(a.language, 'en'), tone: s(a.tone, 'warm'), notes: s(a.notes) || undefined });
      if (typeof a.apply === 'number' && opts[a.apply]) {
        const o = opts[a.apply];
        setDesign({ heading: o.greeting, quote: o.quote, sig: o.signature, showHeading: true, showQuote: true, showSig: true });
      }
      return ok(typeof a.apply === 'number' ? `Applied option ${a.apply}.` : `${opts.length} options. Call again with apply, or use set_words.`, opts);
    },
  },
  {
    name: 'write_calendar_captions',
    title: 'Write calendar captions with AI',
    description: 'Calendars: asks the AI service for one caption per month using that month’s festivals and photo, and applies them unless apply is false.',
    inputSchema: obj({ language: str('Language id'), tone: str('Tone'), notes: str('Anything to mention'), apply: bool('Apply the captions (default true)') }),
    run: async (a) => {
      const d = getState().design;
      if (d.product !== 'calendar') throw new ToolError('The current design isn’t a calendar.');
      const { writeCaptions } = await import('../ai/service');
      const caps = await writeCaptions(d, getState().photos, { language: s(a.language, 'en'), tone: s(a.tone, 'warm'), notes: s(a.notes) || undefined });
      if (a.apply !== false)
        setDesign((cur) => {
          const captions = [...cur.cal.captions];
          for (const c of caps) captions[c.month] = c.caption;
          return { cal: { ...cur.cal, captions, text: cur.cal.text === 'off' ? 'caption' : cur.cal.text } };
        });
      return ok(a.apply === false ? 'Captions written (not applied).' : 'Captions written and applied.', caps.map((c) => ({ month: MONTHS[c.month], caption: c.caption })));
    },
  },
  {
    name: 'generate_image',
    title: 'Create a picture with AI',
    description:
      'Asks the image service chosen in Chitthi’s settings for a picture shaped for a photo slot (no lettering, no real people), and puts it on the design. It is marked as AI-generated in the library and print credits.',
    inputSchema: obj(
      {
        subject: str('What the picture shows'),
        style: str('Style', { enum: ['photo', 'watercolour', 'illustration', 'papercut', 'pattern', 'madhubani'] }),
        slot: num('Photo slot index, 0-based (default: the selected slot)'),
        people: bool('Allow people (never a real person); default false'),
      },
      ['subject'],
    ),
    run: async (a) => {
      const { generateArt, aiPhotoName, blobToJpegDataUrl } = await import('../ai/service');
      const d = getState().design;
      const slot = typeof a.slot === 'number' ? Math.max(0, Math.round(a.slot)) : getState().ui.slot;
      selectSlot(slot);
      const r = await generateArt(d, slot, { subject: s(a.subject), style: (s(a.style) || 'photo') as 'photo', people: a.people === true, n: 1 });
      const ph = { name: aiPhotoName(s(a.subject), r.provider, r.model), url: await blobToJpegDataUrl(r.blobs[0]) };
      await storePhotos([ph]);
      await putOnCard({ id: '', added: Date.now(), ...ph });
      return ok(`Picture made with ${r.provider} ${r.model} and placed in slot ${slot + 1}.`);
    },
  },

  /* ---------- checks and output ---------- */
  {
    name: 'check_design',
    title: 'Check the design for print',
    description: 'Finds problems before printing: empty photo slots, photos that will print soft, Pexels photos printed unaltered, missing words, sheet fit and credits to include.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => {
      const { design: d, photos } = getState();
      const issues: { level: 'error' | 'warning' | 'info'; message: string }[] = [];
      const slots = slotCount(d.layout, d);
      if (slots > photos.length) issues.push({ level: d.product === 'calendar' ? 'warning' : 'error', message: `The layout holds ${slots} photo(s) but the design has ${photos.length}; empty slots print the background.` });
      photoDpi({ d, photos }).forEach((dpi, i) => {
        if (dpi !== null && dpi < 150) issues.push({ level: 'warning', message: `Photo ${i + 1} (“${shortName(photos[i].name)}”) is ${dpi} dpi here and may print soft. Use a larger photo or a smaller slot.` });
      });
      const words = (d.showHeading && d.heading.trim()) || (d.showQuote && d.quote.trim()) || (d.showSig && d.sig.trim());
      if (photos.some((p) => isPexels(p.name)) && !words && (['full', 'mag-full'].includes(d.layout) || (d.product === 'frame' && d.layout !== 'frame-caption')))
        issues.push({ level: 'warning', message: 'A Pexels photo is printed almost unaltered. Fine for personal use; to sell prints, add words, a layout or artwork (Pexels license).' });
      if (!words && d.product !== 'frame') issues.push({ level: 'info', message: 'The front has no words.' });
      if (d.product === 'calendar' && d.cal.year < new Date().getFullYear()) issues.push({ level: 'warning', message: `The calendar is for ${d.cal.year}, a past year.` });
      if (d.exp.format === 'sheet') {
        const nn = nup(d);
        if (!(nn.cols * nn.rows)) issues.push({ level: 'error', message: `The piece doesn’t fit on the chosen ${d.exp.sheet} sheet.` });
      }
      if (+d.exp.bleed === 0 && d.product !== 'magnet') issues.push({ level: 'info', message: 'No bleed: a print shop usually needs 3 mm.' });
      const credits = photos.filter((p) => isPexels(p.name) || aiCreditOf(p.name)).length;
      if (credits) issues.push({ level: 'info', message: `${credits} photo(s) need credits or AI disclosure; the print pack includes PHOTO-CREDITS.txt.` });
      return ok(issues.length ? `${issues.length} note(s).` : 'No problems found.', issues);
    },
  },
  {
    name: 'render_preview',
    title: 'Render a preview image',
    description: 'A PNG preview of the front or back (calendars: the current month page) to look at, at most 1024 px on the long side.',
    inputSchema: obj({ side: str('front or back', { enum: ['front', 'back'] }), maxPx: num('Long side in pixels, 256–1024', { minimum: 256, maximum: 1024 }) }),
    readOnly: true,
    run: async (a) => {
      const { design: d, photos, ui } = getState();
      await ensureFonts(fontsFor(d));
      const { w, h } = cardMM(d),
        long = Math.min(1024, Math.max(256, n(a.maxPx, 900)));
      const cv = document.createElement('canvas');
      renderCard(cv, s(a.side) === 'back' ? 'back' : 'front', long / Math.max(w, h), 0, { d, photos }, { page: ui.calPage });
      const blob = await toBlob(cv);
      cv.width = cv.height = 0;
      return { text: `${s(a.side) === 'back' ? 'Back' : 'Front'} of the ${d.product}.`, image: blob };
    },
  },
  {
    name: 'export_print_pack',
    title: 'Export the print pack',
    description: 'Writes the complete print pack (PDF with bleed and crop marks, PNGs unless turned off, envelope files, quote request, spec, photo credits) as a ZIP into the agent output folder.',
    inputSchema: obj(),
    run: async () => {
      const { design: d, photos } = getState();
      await ensureFonts(fontsFor(d));
      const pack = await buildPack({ d, photos });
      return { text: `Print pack ready: ${pack.name}.`, files: [{ name: pack.name, blob: pack.blob }] };
    },
  },
  {
    name: 'export_pdf',
    title: 'Export the print PDF',
    description: 'Writes the print PDF: one page per side at the exact size ("pdf"), or many pieces on one sheet ("sheet", using the design’s sheet size).',
    inputSchema: obj({ format: str('pdf or sheet', { enum: ['pdf', 'sheet'] }) }),
    run: async (a) => {
      const { design: d, photos } = getState();
      await ensureFonts(fontsFor(d));
      const f = await buildPDF({ d, photos }, s(a.format) === 'sheet' ? 'sheet' : 'pdf');
      return { text: `PDF ready: ${f.name}.`, files: [{ name: f.name, blob: f.blob }] };
    },
  },
  {
    name: 'export_quote_request',
    title: 'Export a quote request',
    description: 'Writes a QUOTE-REQUEST.pdf for print shops: previews, size, paper, finishing and a price grid by quantity.',
    inputSchema: obj(),
    run: async () => {
      const { design: d, photos } = getState();
      const { buildQuoteRequest } = await import('../engine/quote');
      const f = await buildQuoteRequest({ d, photos });
      return { text: `Quote request ready: ${f.name}.`, files: [{ name: f.name, blob: f.blob }] };
    },
  },
  {
    name: 'print_specs',
    title: 'Paper and finishing specs',
    description: 'The paper, weight, finish and finishing Chitthi recommends to print shops for each product and envelopes.',
    inputSchema: obj(),
    readOnly: true,
    run: async () => ok('Print specs', PRINT_SPECS),
  },

  /* ---------- gallery ---------- */
  {
    name: 'list_saved',
    title: 'List saved designs',
    description: 'Designs saved in the Chitthi gallery (id, name, size, last change).',
    inputSchema: obj(),
    readOnly: true,
    run: async () => ok('Saved designs', (await db.all()).map((x) => ({ id: x.id, name: x.name, size: x.size, updated: new Date(x.updated).toISOString(), product: x.design?.product }))),
  },
  {
    name: 'open_saved',
    title: 'Open a saved design',
    description: 'Opens a saved design by id (from list_saved). The current design is replaced (Undo brings it back); save it first if needed.',
    inputSchema: obj({ id: str('Design id from list_saved') }, ['id']),
    run: async (a) => {
      await openDesign(s(a.id));
      return ok('Opened.', summary());
    },
  },
  {
    name: 'save_design',
    title: 'Save to the gallery',
    description: 'Saves the current design to the gallery, optionally under a new name or as a copy. Saving over an existing design needs confirm: true.',
    inputSchema: obj({ name: str('Name for the design'), copy: bool('Save as a new copy'), confirm: bool('Required to overwrite the design already saved') }),
    destructive: true,
    run: async (a) => {
      if (typeof a.name === 'string' && a.name.trim()) setDesign({ designName: a.name.trim() });
      const existing = getState().designId;
      if (existing && !a.copy && a.confirm !== true) throw new ToolError('This would overwrite the saved design. Pass confirm: true, or copy: true to save a new one.');
      await saveDesign(a.copy === true || !existing);
      return ok(`Saved “${getState().design.designName || 'design'}”.`);
    },
  },
];

export const TOOLS_BY_NAME: Record<string, AgentTool> = Object.fromEntries(TOOLS.map((t) => [t.name, t]));
export { ToolError };
