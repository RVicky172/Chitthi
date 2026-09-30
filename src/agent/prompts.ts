import { layoutsFor } from '../data/layouts';
import { PRODUCTS, sizesFor } from '../data/products';
import { PRINT_SPECS } from '../data/printSpecs';
import { sizeLabel } from '../data/sizes';
import { TOOLS_BY_NAME } from './tools';

/*
 * MCP prompts and resources. Prompts are ready-made instructions that walk an agent through a whole job with the
 * tools (the same workflows as the skills in skills/). Resources are read-only reference an agent can load: the
 * current design, sizes, layouts, print specs and the photo rules.
 */

export interface PromptArg {
  name: string;
  description: string;
  required?: boolean;
}
export interface AgentPrompt {
  name: string;
  title: string;
  description: string;
  arguments: PromptArg[];
  build(args: Record<string, string>): string;
}

const CHECK = 'Before exporting, call check_design and fix every error; mention warnings to the user. Look at render_preview for the front (and back) and fix anything that looks wrong: text that is hard to read, awkward crops, empty slots.';
const PHOTO_RULES =
  'Photos: prefer the user’s own; otherwise search_pexels (credits are kept automatically) or generate_image (marked as AI). Never use photos of real, identifiable people in a bad light or to imply endorsement, and never print a Pexels photo unaltered for sale.';

export const PROMPTS: AgentPrompt[] = [
  {
    name: 'festival_postcard',
    title: 'Festival postcard',
    description: 'Design a postcard for an Indian festival or occasion, write its words, and export the print pack.',
    arguments: [
      { name: 'occasion', description: 'e.g. Diwali, Holi, Eid, a birthday', required: true },
      { name: 'recipient', description: 'Who it is for (optional)' },
      { name: 'language', description: 'en, hi, hinglish, ta, … (optional)' },
    ],
    build: (a) =>
      [
        `Make a postcard for ${a.occasion}${a.recipient ? ` for ${a.recipient}` : ''} in Chitthi.`,
        '1. new_design with product "postcard". list_themes and set_theme to the best match for the occasion.',
        '2. list_layouts and set_layout to one that suits the photos you will use; set_size (4x6 is standard in India).',
        `3. Photos. ${PHOTO_RULES}`,
        `4. Words: write_words${a.language ? ` with language "${a.language}"` : ''} and pick the option that fits best (or set_words). Keep the greeting short.`,
        `5. The back: set_back with a short message if the user gave one; otherwise leave it empty for handwriting. ${CHECK}`,
        '6. export_print_pack and tell the user where the file is. save_design to keep it.',
      ].join('\n'),
  },
  {
    name: 'year_calendar',
    title: 'Year calendar',
    description: 'Build a 12-month wall or desk calendar with festival dates, captions and a style, then export it.',
    arguments: [
      { name: 'year', description: 'e.g. 2027', required: true },
      { name: 'theme', description: 'What the calendar is about (optional)' },
      { name: 'size', description: 'cal-a4, cal-a3, cal-a5, … (optional)' },
    ],
    build: (a) =>
      [
        `Make a ${a.year} calendar${a.theme ? ` about ${a.theme}` : ''} in Chitthi.`,
        `1. new_design with product "calendar"; set_size${a.size ? ` to ${a.size}` : ''}; set_calendar with year ${a.year}, pages 12, marks "all" and a style (modern or classic).`,
        '2. list_festivals for the year. For each month, set_calendar_page and add a photo that matches its festival or season. ' + PHOTO_RULES,
        '3. write_calendar_captions (or set_calendar captions yourself).',
        `4. Check a few months with set_calendar_page + render_preview, and the back (year at a glance). ${CHECK}`,
        '5. export_print_pack; save_design.',
      ].join('\n'),
  },
  {
    name: 'print_quote',
    title: 'Get a print quote',
    description: 'Prepare quote documents for print shops for the current or saved designs.',
    arguments: [{ name: 'quantity', description: 'How many pieces the user wants (optional)' }],
    build: (a) =>
      [
        'Prepare a print-shop quote for the user’s Chitthi design(s).',
        '1. get_design (or list_saved and open_saved for each design to include).',
        `2. check_design and fix errors. 3. export_quote_request for each design, and export_print_pack for the files the shop will print.`,
        `4. print_specs gives the paper and finishing to mention.${a.quantity ? ` The user wants about ${a.quantity} pieces: say so to the shop.` : ''}`,
        '5. Summarise for the user what to send: the quote request PDF(s) and the print pack(s).',
      ].join('\n'),
  },
  {
    name: 'photo_sourcing',
    title: 'Find photos (Pexels rules)',
    description: 'Find and add suitable free photos from Pexels for the current design, following the Pexels license.',
    arguments: [{ name: 'subject', description: 'What the photos should show', required: true }],
    build: (a) =>
      [
        `Find photos of ${a.subject} for the current Chitthi design.`,
        '1. get_design to see how many slots there are and their shapes (list_layouts gives photo counts).',
        '2. search_pexels with specific words and the slot’s orientation. Prefer photos without people unless asked.',
        '3. add_pexels_photo for the best match per slot (select_slot first). Credits are kept automatically.',
        '4. list_photos: replace any photo under 150 dpi. Remind the user: selling a Pexels photo as an unaltered print is not allowed; the design must change it.',
      ].join('\n'),
  },
  {
    name: 'ai_artwork',
    title: 'AI artwork for a slot',
    description: 'Create a picture with the user’s AI image service for a photo slot and check it prints well.',
    arguments: [
      { name: 'subject', description: 'What the picture shows', required: true },
      { name: 'style', description: 'photo, watercolour, illustration, papercut, pattern, madhubani (optional)' },
    ],
    build: (a) =>
      [
        `Create a picture of ${a.subject} for the current Chitthi design.`,
        `1. select_slot for the slot to fill. 2. generate_image with the subject${a.style ? ` and style "${a.style}"` : ''}. It has no lettering and no real people, and is marked as AI-generated.`,
        '3. list_photos: AI pictures are often 1–2 megapixels; if it prints under 150 dpi, choose a smaller slot or size and tell the user.',
        '4. render_preview to check the words still read well over it.',
      ].join('\n'),
  },
];

export interface AgentResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read(): Promise<string>;
}

export const RESOURCES: AgentResource[] = [
  {
    uri: 'chitthi://design/current',
    name: 'Current design',
    description: 'The design open in Chitthi (same as get_design).',
    mimeType: 'application/json',
    read: async () => JSON.stringify((await TOOLS_BY_NAME.get_design.run({}, {})).json, null, 2),
  },
  {
    uri: 'chitthi://specs/sizes',
    name: 'Print sizes',
    description: 'Every product’s sizes with trim in mm and inches.',
    mimeType: 'application/json',
    read: async () =>
      JSON.stringify(
        Object.fromEntries(PRODUCTS.map((p) => [p.id, sizesFor(p.id).filter((x) => x.id !== 'custom').map((x) => ({ id: x.id, name: x.name, size: sizeLabel(x) }))])),
        null,
        2,
      ),
  },
  {
    uri: 'chitthi://specs/layouts',
    name: 'Layouts',
    description: 'Layout ids and names for each product.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(Object.fromEntries(PRODUCTS.map((p) => [p.id, layoutsFor(p.id).map(([id, name]) => ({ id, name }))])), null, 2),
  },
  {
    uri: 'chitthi://print-specs',
    name: 'Paper and finishing',
    description: 'Material, weight, finish, colour sides and finishing per product.',
    mimeType: 'application/json',
    read: async () => JSON.stringify(PRINT_SPECS, null, 2),
  },
  {
    uri: 'chitthi://rules/photos',
    name: 'Photo rules (Pexels and AI)',
    description: 'What the Pexels license and AI picture disclosure require.',
    mimeType: 'text/markdown',
    read: async () =>
      [
        '# Photo rules in Chitthi',
        '',
        '## Pexels (https://www.pexels.com/license/)',
        '- Free to use and print. Credit the photographer where possible: Chitthi keeps "Photo by X on Pexels" with each photo and writes PHOTO-CREDITS.txt into print packs.',
        '- Don’t sell unaltered copies of a photo as a poster, print or physical product: the design must change it (words, layout, artwork).',
        '- Identifiable people must not appear in a bad light or seem to endorse anything. Don’t use photos as trademarks or logos.',
        '- Don’t redistribute Pexels photos on other stock or wallpaper sites.',
        '',
        '## AI pictures',
        '- Made with the user’s own account; that service’s terms apply.',
        '- Chitthi marks them "(AI / Provider model)", lists them in PHOTO-CREDITS.txt and the Print step.',
        '- No real people’s likeness, no brands or logos, no lettering (the card adds its own words).',
      ].join('\n'),
  },
];
