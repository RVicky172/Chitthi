import { MONTHS } from '../data/products';
import { calPages } from '../engine/design';
import { isOneOf } from '../engine/guards';
import { slotCount } from '../engine/layout';
import { calMonth } from '../engine/calendarDraw';
import { fetchPexels, searchPexels, type PexelsOrientation, type PexelsPhoto } from '../lib/pexels';
import { putOnCard, storePhotos } from '../state/library';
import { selectSlot } from '../state/photoSlots';
import { getState, setUI } from '../state/store';
import { autoArrange } from '../state/traits';
import { dataUrlOf, fetchImage, numberArg, numberSchema, objectSchema, ok, stringArg, stringSchema, ToolError, type AgentTool } from './common';
import { photoList } from './designSummary';

/* The photos on a print design: slots, calendar pages, adding photos from files, URLs and Pexels, arranging. */

const ORIENTATIONS: readonly PexelsOrientation[] = ['landscape', 'portrait', 'square'];

/** Pexels results the agent has seen, so add_pexels_photo can use one by id (with its credit). */
const pexelsSeen = new Map<number, PexelsPhoto>();

/**
 * Remembers a search result (the last 500).
 * @param photo the result
 */
function remember(photo: PexelsPhoto): void {
  pexelsSeen.set(photo.id, photo);
  const oldest = pexelsSeen.keys().next();
  if (pexelsSeen.size > 500 && !oldest.done) pexelsSeen.delete(oldest.value);
}

/**
 * Puts a photo into the library and onto the design (into the selected slot).
 * @param photo its name and data URL
 */
async function placePhoto(photo: { name: string; url: string }): Promise<void> {
  await storePhotos([photo]);
  await putOnCard({ id: '', added: Date.now(), ...photo });
}

/** The tools for the photos on a print design. */
export const CARD_PHOTO_TOOLS: AgentTool[] = [
  {
    name: 'list_photos',
    title: 'List photos on the design',
    description:
      'Photos on the design in slot order, with their credit and how sharp each will print (dpi; 250+ sharp, 150–250 fine, under 150 soft).',
    inputSchema: objectSchema(),
    readOnly: true,
    run: photoList,
  },
  {
    name: 'select_slot',
    title: 'Select a photo slot',
    description: 'Selects which photo slot (0-based) the next added photo goes into. For calendars, set_calendar_page chooses the month.',
    inputSchema: objectSchema({ slot: numberSchema('Slot index, 0-based', { minimum: 0 }) }, ['slot']),
    run: (args) => {
      const count = slotCount(getState().design.layout, getState().design);
      const slot = Math.min(count - 1, Math.max(0, Math.round(numberArg(args.slot, 0))));
      selectSlot(slot);
      return ok(`Slot ${slot + 1} of ${count} selected.`);
    },
  },
  {
    name: 'set_calendar_page',
    title: 'Show a calendar month',
    description: 'Calendars: shows a month page (1-based page number in the calendar), so render_preview and photo tools act on it.',
    inputSchema: objectSchema({ page: numberSchema('Page number, 1 = first month', { minimum: 1 }) }, ['page']),
    run: (args) => {
      const { design } = getState();
      const page = Math.min(calPages(design), Math.max(1, Math.round(numberArg(args.page, 1)))) - 1;
      setUI({ calPage: page, side: 'front' });
      const { year, month } = calMonth(design, page);
      return ok(`Showing ${MONTHS[month] ?? ''} ${year}.`);
    },
  },
  {
    name: 'add_photo',
    title: 'Add a photo from a file or URL',
    description:
      'Adds a JPG, PNG or WebP photo to the design (into the selected slot) and the photo library, from a local file path (desktop) or an https URL the user owns or may use.',
    inputSchema: objectSchema({ path: stringSchema('Local file path'), url: stringSchema('https URL of an image'), name: stringSchema('Name to show for the photo') }),
    run: async (args, env) => {
      const { name, blob } = await fetchImage(args, env);
      await placePhoto({ name, url: await dataUrlOf(blob) });
      return ok(`Added “${name}”.`, photoList().json);
    },
  },
  {
    name: 'search_pexels',
    title: 'Search free photos on Pexels',
    description:
      'Searches Pexels (needs the user’s Pexels key in Settings). Results carry the photographer credit. Pexels rules: credit photographers, don’t sell an unaltered photo as a print (add words, layout or artwork), no identifiable people in a bad light, don’t imply endorsement.',
    inputSchema: objectSchema(
      { query: stringSchema('Search words, e.g. "diwali diya lamps"'), orientation: stringSchema('Photo shape', { enum: ORIENTATIONS }) },
      ['query'],
    ),
    readOnly: true,
    run: async (args) => {
      const orientation = isOneOf(ORIENTATIONS, args.orientation) ? args.orientation : null;
      const results = await searchPexels(stringArg(args.query), orientation, 1);
      for (const photo of results.photos) remember(photo);
      return ok(
        `${results.total_results} results; showing ${results.photos.length}. Add one with add_pexels_photo.`,
        results.photos.map((photo) => ({ id: photo.id, alt: photo.alt, photographer: photo.photographer, size: [photo.width, photo.height], page: photo.url })),
      );
    },
  },
  {
    name: 'add_pexels_photo',
    title: 'Add a Pexels photo',
    description: 'Downloads a photo from the last search_pexels results (by id) into the selected slot, keeping its photographer credit.',
    inputSchema: objectSchema({ id: numberSchema('Photo id from search_pexels') }, ['id']),
    run: async (args) => {
      const photo = pexelsSeen.get(numberArg(args.id, 0));
      if (!photo) throw new ToolError('Search first with search_pexels, then use an id from its results.');
      await placePhoto(await fetchPexels(photo));
      return ok(`Added the photo by ${photo.photographer} on Pexels.`);
    },
  },
  {
    name: 'auto_arrange',
    title: 'Auto-arrange photos',
    description: 'Puts each photo in the slot whose shape suits it and centres each crop on its subject.',
    inputSchema: objectSchema(),
    run: () => {
      autoArrange();
      return ok('Photos arranged.');
    },
  },
];
