/*
 * The website's documentation (#/docs), as data: pages of sections, each a list of blocks. Inline text may use
 * **bold**, `code` and [links](https://…) or [links](#/route); components/DocsPage.tsx renders them (no HTML here).
 * Keep it in step with the app and with README.md; the deeper engineering docs stay in docs/*.md on GitHub.
 */

export type DocBlock =
  | { p: string }
  | { list: string[] }
  | { steps: string[] }
  | { table: { head: string[]; rows: string[][] } }
  | { code: string }
  | { note: string };

export interface DocSection {
  id: string;
  title: string;
  blocks: DocBlock[];
}

export interface DocPage {
  id: string;
  title: string;
  group: 'Using Chitthi' | 'For developers';
  summary: string;
  sections: DocSection[];
}

const GH = 'https://github.com/RVicky172/Chitthi';
const DOC = (f: string) => `${GH}/blob/main/docs/${f}`;
const SPEC = (f: string) => `${GH}/blob/main/specs/${f}`;

export const DOC_PAGES: DocPage[] = [
  {
    id: 'start',
    title: 'Getting started',
    group: 'Using Chitthi',
    summary: 'What Chitthi Studio makes, web or desktop, and your first postcard and Instagram post.',
    sections: [
      {
        id: 'what',
        title: 'What Chitthi Studio is',
        blocks: [
          {
            p: 'Chitthi Studio turns your photos into things to **print** (postcards, calendars, framed prints, fridge magnets, with matching envelopes) and things to **post** (Instagram photos and carousels, Reels and Shorts, YouTube videos). It is free and open source under the MIT License: no account, no subscription, no paid tier and no locked features.',
          },
          {
            table: {
              head: ['Studio', 'Makes', 'You get'],
              rows: [
                ['Print studio', 'Postcards, calendars, framed prints, fridge magnets, envelopes', 'Print-shop PDFs with bleed and crop marks, 300 dpi PNGs, a print pack ZIP with specs and a quote request'],
                ['Photo & video studio', 'Instagram photos and carousels, Reels and Shorts, YouTube videos', 'JPEG, PNG, WebP, AVIF or 16-bit TIFF photos; H.264 + AAC MP4 videos with fast start'],
              ],
            },
          },
          { p: 'Everything happens on your device. Photos, designs and settings are never uploaded.' },
        ],
      },
      {
        id: 'web-desktop',
        title: 'Web or desktop',
        blocks: [
          { p: 'Both are built from the same code and make the same files. The desktop app adds what a browser tab can’t do well.' },
          {
            table: {
              head: ['', 'Web app', 'Desktop app (Windows, macOS)'],
              rows: [
                ['Install', 'Any modern browser; installable from the address bar, works offline after the first visit', `Installer from [GitHub Releases](${GH}/releases); updates itself`],
                ['Video', 'Reels up to 90 s; YouTube up to 15 min at 1080p30', 'Reels up to 3 min; YouTube up to 3 hours, 4K, 60 fps'],
                ['RAW photos', 'Opens the JPEG preview stored in the file', 'Develops the RAW in 16 bits with LibRaw'],
                ['AI services', 'Those that allow browser calls', 'All, with keys encrypted by the operating system'],
                ['Extras', '—', 'MCP server for AI agents, real CPU and memory in the performance monitor, native menus and dialogs'],
              ],
            },
          },
          { note: 'Desktop-only features are limited by technology, never by price: everything is free in both.' },
        ],
      },
      {
        id: 'first-postcard',
        title: 'Your first postcard',
        blocks: [
          {
            steps: [
              'Open the studio (**Start a postcard** on the home page).',
              '**Photos:** add a photo from your device, or search free Pexels photos (needs a free Pexels key in Settings).',
              '**Layout:** pick how photos and words sit on the card; **Occasion:** a festival, birthday or season theme, or plain.',
              '**Front:** write the greeting, quote and signature, each in its own font. **Back:** a message and address, or ruled lines.',
              '**Print:** download the print pack ZIP (PDF with bleed and crop marks, PNGs, envelope files, a spec and a quote request) and take it to a print shop.',
            ],
          },
        ],
      },
      {
        id: 'first-post',
        title: 'Your first Instagram post',
        blocks: [
          {
            steps: [
              'Open **Photo & video** and choose **Instagram photos**.',
              'Add up to 20 photos; the first is the carousel cover. Pick the format (4:5 portrait is the default).',
              'Edit each photo: framing, light, colour, curves, masks; add text, stickers or drawings.',
              '**Export:** download a ZIP, or **Prepare** then **Share to Instagram** (the caption is copied for you).',
            ],
          },
        ],
      },
      {
        id: 'privacy',
        title: 'Privacy',
        blocks: [
          {
            list: [
              'No account and no analytics. Designs, the photo library, fonts, presets and keys stay in your browser or the desktop app’s data folder.',
              'The only network calls are fonts (web), the Pexels search you run, the AI service you choose, the sky model for AI masks (once, if you agree), and update checks (desktop).',
              `Full policy: [PRIVACY.md](${GH}/blob/main/PRIVACY.md).`,
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'print',
    title: 'Print studio',
    group: 'Using Chitthi',
    summary: 'Postcards, calendars, framed prints and magnets: sizes, layouts, occasions and print-shop files.',
    sections: [
      {
        id: 'products',
        title: 'Products, sizes and layouts',
        blocks: [
          {
            table: {
              head: ['Product', 'Sizes', 'Layouts'],
              rows: [
                ['Postcards', '13, from 4×6 in, A6 and India Post to Instax and A4, plus custom', '25, with a postal back (message, address, PIN boxes, stamp box)'],
                ['Calendars', '5 (A4, A3, A5 desk, tabloid, 12×12 in), any year', '9; 12 months from any start month, one month, or the year on one page; festivals marked'],
                ['Photo frames', '8, 4×6 up to 11×14 in, A4, A3, square; three mat widths', '6, from a single photo to a grid of four'],
                ['Fridge magnets', '8, rounded rectangles and round buttons', '7, many to a sheet'],
                ['Envelopes', 'The smallest standard size each design fits', 'Dressed in the same occasion; print-on PDF and a fold-your-own template'],
              ],
            },
          },
          { p: 'Every size is drawn to scale, with trim, bleed and safe area, in the [sizes and layouts guide](#/sizes) and as real paper in [Paper in 3D](#/paper).' },
        ],
      },
      {
        id: 'steps',
        title: 'Six steps',
        blocks: [
          {
            table: {
              head: ['Step', 'What you do'],
              rows: [
                ['Photos', 'Add your own or Pexels photos; the library ranks them for each slot by shape, colour, light and sharpness, and **Auto-arrange** places the best matches'],
                ['Layout', 'Choose a layout; crop, rotate, mirror and zoom each photo; print sharpness in dpi'],
                ['Occasion', '15 festivals, 5 birthday styles, 5 seasons, with drawn artwork and wishes, or plain colours'],
                ['Front', 'Greeting, quote and signature in any of 46 fonts (Hindi and regional scripts too) or your own'],
                ['Back', 'Postcard message and address, frame dedication, calendar year at a glance'],
                ['Print', 'Print pack, PDFs, sheet PDFs, PNGs, quote request, print-colours soft proof'],
              ],
            },
          },
          { p: '**Find a feature** (`Ctrl+K`) jumps to any setting. Undo and redo, autosave, a gallery of designs with backup and restore, and `.chitthi` design files.' },
        ],
      },
      {
        id: 'files',
        title: 'Print files and quotes',
        blocks: [
          {
            list: [
              'A print-shop PDF with bleed and crop marks, sheet PDFs (A4, A3, 13×19 in, Letter) lined up for double-sided printing, and 300 dpi PNGs.',
              'A print pack ZIP with a `PRINT-SPEC.txt`, a `QUOTE-REQUEST.pdf` and photo credits.',
              'From the gallery, one quote for several designs: an `ORDER-SHEET.csv` and a request each.',
              'A 3D preview of every design and envelope, and a print-colours soft proof of how screen colours come out on paper.',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'photo',
    title: 'Photo editor',
    group: 'Using Chitthi',
    summary: 'Instagram photos: formats, light and colour, curves, masks (AI too), presets and LUTs, layers, RAW and export.',
    sections: [
      {
        id: 'formats',
        title: 'Formats and the batch',
        blocks: [
          {
            table: {
              head: ['Format', 'Pixels', 'Use'],
              rows: [
                ['Portrait 4:5 (default)', '1080 × 1350', 'Feed posts and carousels; the most space in the feed'],
                ['Square 1:1', '1080 × 1080', 'Feed posts and carousels'],
                ['Tall portrait 3:4', '1080 × 1440', 'The newer shape that matches the profile grid'],
                ['Landscape 1.91:1', '1080 × 566', 'Feed posts and carousels'],
                ['Story 9:16', '1080 × 1920', 'Stories and Reel covers'],
              ],
            },
          },
          { p: 'A batch holds up to 20 photos (one carousel). Drag to reorder; the first is the cover. 80 steps of undo.' },
        ],
      },
      {
        id: 'adjust',
        title: 'Light, colour and detail',
        blocks: [
          {
            list: [
              '**Light:** exposure (±4 stops), contrast, highlights, shadows, whites and blacks, worked out in linear light like a camera.',
              '**Colour:** temperature and tint with an eyedropper (click something grey or white), and saturation.',
              '**Tone curve:** RGB and red, green and blue curves, usable with the mouse or the keyboard.',
              '**Colour mixer:** hue, saturation and luminance for eight colour bands.',
              '**Detail and effects:** sharpening with radius and edge masking, noise reduction, clarity, dehaze, vignette and grain.',
            ],
          },
          { p: 'Effects run on the graphics card (WebGPU, or WebGL2) and give the same pixels as the Canvas 2D fallback.' },
        ],
      },
      {
        id: 'presets',
        title: 'Presets and LUTs',
        blocks: [
          {
            list: [
              'Seven built-in looks (Vivid, Warm, Cool, Black and white, Hand-tinted, Vintage, Original) as presets.',
              '**Save as preset** keeps every colour setting under a name; apply it in one click or to every photo of the batch.',
              '**Import .cube** adds a 3D LUT (up to 65³) with an amount slider.',
              'Preset files carry the LUTs they use, so presets move between devices.',
            ],
          },
        ],
      },
      {
        id: 'masks',
        title: 'Masks',
        blocks: [
          { p: 'A mask limits its own settings to part of the photo. Masks follow the photo when you move, turn or mirror it.' },
          {
            table: {
              head: ['Kind', 'How it is shaped'],
              rows: [
                ['Brush', 'Paint with size, feather and flow; Erase takes away'],
                ['Linear and radial gradients', 'Drag on the photo or move their handles; every setting is also a slider'],
                ['Colour and brightness ranges', 'Click the photo to pick a colour or a tone'],
                ['Subject, Background, Sky (AI)', 'Found by an AI model on your device; paint over it to refine'],
              ],
            },
          },
          {
            p: 'Parts combine by adding, subtracting or intersecting (a sky gradient narrowed to its blue colours, say). The subject model ships with the app; the sky model (176 MB) is downloaded once, only after you agree, and kept on the device.',
          },
        ],
      },
      {
        id: 'layers',
        title: 'Text, stickers, drawings and images',
        blocks: [
          {
            list: [
              'Text in six one-tap styles and any font; 11 shapes, seven of which hold words; 40 stickers; freehand drawing with four brushes.',
              'Image layers for logos, frames and textures.',
              'A blend mode on every layer (multiply, screen, overlay and 13 more), and a layer mask (a fade or a spot).',
              '**Copy these layers to every photo** puts the same title on the whole batch.',
            ],
          },
        ],
      },
      {
        id: 'raw',
        title: 'RAW photos',
        blocks: [
          {
            p: 'Camera RAW files (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2 and more) can be added to the batch. The desktop app develops them with LibRaw in 16 bits; export them as **TIFF (16-bit)** to keep that precision through every edit. In a browser, a RAW file opens the JPEG preview the camera stored inside it.',
          },
        ],
      },
      {
        id: 'export',
        title: 'Export and posting',
        blocks: [
          {
            table: {
              head: ['File type', 'Use'],
              rows: [
                ['JPEG (default)', 'What Instagram stores; small files'],
                ['PNG', 'Lossless; Instagram converts it to JPEG'],
                ['WebP, AVIF', 'Smaller files for websites; shown only where the browser can write them'],
                ['TIFF (16-bit)', 'Printing and further editing; where the graphics card can render in floats'],
              ],
            },
          },
          { p: 'Download all as a ZIP, or prepare the photos and share them to the Instagram app with the caption copied.' },
        ],
      },
    ],
  },
  {
    id: 'video',
    title: 'Video editor',
    group: 'Using Chitthi',
    summary: 'Reels, Shorts and YouTube videos on a timeline, exported as MP4 on your device.',
    sections: [
      {
        id: 'modes',
        title: 'Reels, Shorts and YouTube',
        blocks: [
          {
            table: {
              head: ['Mode', 'Makes', 'Formats'],
              rows: [
                ['Reels & Shorts', 'A vertical MP4 from photos and clips, shared or downloaded', '9:16, 4:5, 1:1'],
                ['YouTube video', 'A 16:9 vlog saved straight to a file', '1080p; 1440p and 4K in the desktop app'],
              ],
            },
          },
        ],
      },
      {
        id: 'timeline',
        title: 'The timeline',
        blocks: [
          {
            list: [
              'Drag clips to reorder, drag their edges to trim, split and delete; moves snap to edges and the playhead.',
              'Per clip: duration or trim, volume, movement on photos (zoom and pan), fade from black, looks and adjustments.',
              'Text, shapes, stickers and drawings with **Appears at** and **Disappears at**; music with its waveform.',
              'Export: H.264 and AAC in an MP4 with its index at the front (fast start), using the graphics card where it can.',
            ],
          },
        ],
      },
      {
        id: 'limits',
        title: 'Browser or desktop',
        blocks: [
          {
            table: {
              head: ['', 'Browser', 'Desktop app'],
              rows: [
                ['Reels & Shorts', 'Up to 90 s, 20 clips, 300 MB per file, 30 fps', 'Up to 3 min, 50 clips, 4 GB files, 30 or 60 fps'],
                ['YouTube video', 'Up to 15 min, 60 clips, 4 GB files, 1080p, 30 fps', 'Up to 3 hours, 500 clips, 50 GB files, up to 4K, 30 or 60 fps'],
              ],
            },
          },
          { p: 'The web video editor needs WebCodecs: Chrome or Edge 94+, Firefox 130+, Safari 26.' },
        ],
      },
    ],
  },
  {
    id: 'ai',
    title: 'AI features',
    group: 'Using Chitthi',
    summary: 'Writing and pictures with your own AI service, and AI masks that run on your device.',
    sections: [
      {
        id: 'own-key',
        title: 'Writing and pictures, with your own key',
        blocks: [
          { p: 'AI is optional and off until you choose a service in **Settings → AI**. Each service bills your own account; daily limits stop a mistake from running up a bill.' },
          {
            table: {
              head: ['Feature', 'What it does'],
              rows: [
                ['Write with AI', 'Greeting, quote and signature sized to the layout, in 12 languages and 5 tones'],
                ['Write captions with AI', 'Twelve calendar captions from each month’s festivals'],
                ['Write the message with AI', 'The message on the back of a postcard'],
                ['Create a picture with AI', 'Artwork shaped for a photo slot, credited as AI everywhere'],
              ],
            },
          },
          {
            p: 'Services: Anthropic (Claude), OpenAI, Google Gemini, OpenRouter, Groq, DeepSeek, Mistral, Together, Stability, fal.ai, Black Forest Labs, Replicate, Ideogram, a local Ollama or LM Studio (free and private), or any OpenAI-compatible service.',
          },
        ],
      },
      {
        id: 'on-device',
        title: 'AI masks, on your device',
        blocks: [
          { p: 'The photo editor’s Subject, Background and Sky masks use small models that run in your browser or the desktop app. No key, no account, and your photos never leave the device.' },
        ],
      },
    ],
  },
  {
    id: 'help',
    title: 'Questions and fixes',
    group: 'Using Chitthi',
    summary: 'Quick answers to the questions people ask most.',
    sections: [
      {
        id: 'faq',
        title: 'Common questions',
        blocks: [
          {
            table: {
              head: ['Question', 'Answer'],
              rows: [
                ['My iPhone photo won’t open', 'HEIC photos can’t be opened by browsers: save it as JPEG (Settings → Camera → Formats → Most Compatible)'],
                ['Windows says “Windows protected your PC”', 'The build isn’t code-signed yet: check it came from the releases page, then More info → Run anyway'],
                ['Effects are slow', 'Turn on **Settings → Photo & video effects** to use the graphics card'],
                ['TIFF isn’t in the export list', 'It needs graphics-card effects that can render in floats; use JPEG or PNG otherwise'],
                ['A RAW file shows only a small picture on the web', 'Browsers open the JPEG preview stored in the file; the desktop app develops the full RAW'],
                ['Where are my designs?', 'In this browser (or the desktop app’s data folder). Use **Gallery → Back up gallery** to move them'],
              ],
            },
          },
          { p: `More fixes: [TROUBLESHOOTING.md](${DOC('TROUBLESHOOTING.md')}). Report a bug or ask for a feature: [GitHub issues](${GH}/issues/new/choose).` },
        ],
      },
    ],
  },
  {
    id: 'agents',
    title: 'AI agents (MCP)',
    group: 'For developers',
    summary: 'Drive Chitthi from Claude Code and other agents: 56 tools for print designs and photo editing.',
    sections: [
      {
        id: 'what',
        title: 'What agents can do',
        blocks: [
          { p: 'The desktop app is an [MCP](https://modelcontextprotocol.io) server. Its tools run the same code as the studio, so anything an agent makes is exactly what you’d make by hand, and in a live session every change can be undone.' },
          {
            table: {
              head: ['Group', 'Tools'],
              rows: [
                ['Print designs (34)', 'Create postcards, calendars, frames and magnets; sizes, layouts, themes, words; photos from files, URLs or Pexels; AI words and pictures; check, preview and export print packs, PDFs and quote requests; the gallery'],
                ['Photo studio (22)', 'The batch, framing, every colour setting (one photo or all), white balance from a point, masks (AI too), presets and LUTs, previews and export, RAW to 16-bit TIFF'],
                ['Prompts (5) and resources (5)', 'Ready-made workflows (festival postcard, year calendar, print quote, photo sourcing, AI artwork) and reference data'],
              ],
            },
          },
        ],
      },
      {
        id: 'use-cases',
        title: 'Use cases',
        blocks: [
          {
            table: {
              head: ['Job', 'Ask your agent'],
              rows: [
                ['A festival card', '“Make a Diwali postcard for my Nani in Hindi with a Pexels photo and export the print pack”'],
                ['A year calendar', '“Build a 2027 wall calendar with our trip photos, festivals marked, and a caption per month”'],
                ['Batch photo editing', '“Add the photos in D:\\Trip, warm them up, lift the shadows, darken the sky with a sky mask, and export them as 4:5 JPEGs”'],
                ['RAW to print', '“Open these DNG files, apply my Golden hour preset and export 16-bit TIFFs”'],
                ['Print samples', '“Make one sample of every postcard layout at 4×6 in for the print shop”'],
                ['Quotes', '“Export a quote request for 200 calendars on 300 gsm matt”'],
              ],
            },
          },
        ],
      },
      {
        id: 'connect',
        title: 'Connect',
        blocks: [
          { p: '**Claude Code plugin** (recommended): adds the server and six workflow skills.' },
          { code: '/plugin marketplace add RVicky172/Chitthi\n/plugin install chitthi@chitthi' },
          { p: '**Headless server** (no window; the agent starts the app):' },
          { code: 'claude mcp add chitthi -- "%LOCALAPPDATA%\\Programs\\Chitthi Studio\\Chitthi Studio.exe" --mcp' },
          { p: '**Live, in the open window:** turn on **Settings → AI → Let an agent work in this open window** and copy the command shown there.' },
          { p: '**Claude Desktop, VS Code, Cursor:** the same command with `--mcp` in their MCP settings.' },
          { code: '{\n  "mcpServers": {\n    "chitthi": { "type": "stdio", "command": "<path to Chitthi Studio>", "args": ["--mcp"] }\n  }\n}' },
        ],
      },
      {
        id: 'security',
        title: 'Security',
        blocks: [
          {
            list: [
              'Loopback only, with a random bearer token per session; browser origins refused.',
              'No tool returns API keys; files are written only to **Documents/Chitthi agent output**.',
              'Overwriting a saved design or deleting a preset needs `confirm: true`; the sky model downloads only with `allowDownload` after the user agrees.',
              `Full reference: [MCP.md](${DOC('MCP.md')}).`,
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'self-host',
    title: 'Self-hosting',
    group: 'For developers',
    summary: 'Run the web app on your own server with Docker and nginx.',
    sections: [
      {
        id: 'docker',
        title: 'Docker',
        blocks: [
          { code: 'docker compose up -d --build     # http://localhost:8080, health check at /healthz' },
          {
            list: [
              'nginx, non-root, read-only file system; no backend and no database.',
              'Put it behind an HTTPS reverse proxy: the service worker (offline use) needs HTTPS.',
              'Bump `APP_CACHE` in `public/sw.js` with each release so returning visitors get the new version.',
            ],
          },
        ],
      },
      {
        id: 'csp',
        title: 'Content Security Policy',
        blocks: [
          {
            p: 'The policy lives in `nginx/security-headers.conf`. It allows the AI services that accept browser calls, Pexels, fonts, and Hugging Face for the sky model. A self-hosted custom AI service needs its host added to `connect-src`.',
          },
          { p: `Production setup, headers, upgrades and rollback: [OPERATIONS.md](${DOC('OPERATIONS.md')}). A Pexels proxy recipe: [PEXELS.md](${DOC('PEXELS.md')}).` },
        ],
      },
    ],
  },
  {
    id: 'build',
    title: 'Build and extend',
    group: 'For developers',
    summary: 'Run from source, how the code is laid out, adding sizes, themes and AI services, and the tests.',
    sections: [
      {
        id: 'source',
        title: 'Run from source',
        blocks: [
          { p: 'Node.js 20.19+ or 22.12+.' },
          {
            code: 'npm install\nnpm run dev              # web app at http://localhost:5173\nnpm run fetch:fonts      # once, for the desktop app\nnpm run fetch:libraw     # once, for RAW photos in the desktop app\nnpm run desktop:dev      # desktop app with hot reload',
          },
        ],
      },
      {
        id: 'layout',
        title: 'How the code is laid out',
        blocks: [
          {
            table: {
              head: ['Folder', 'What is in it'],
              rows: [
                ['`src/data/`', 'Specifications as data: products, sizes, layouts, themes, fonts, formats, presets, these docs'],
                ['`src/engine/`', 'No React: print geometry and rendering, export, the photo and video engines, masks, the GPU pipeline, RAW and TIFF'],
                ['`src/state/`', 'Small stores with undo and redo: the print design, the photo batch, the video project, presets'],
                ['`src/components/`', 'The UI; screens and dialogs load on demand'],
                ['`src/ai/`', 'AI services (loaded on demand) and the on-device segmentation models'],
                ['`src/agent/`', 'Agent tools, prompts and resources for MCP'],
                ['`electron/`', 'The desktop main process, preload bridge, IPC guard, AI requests, MCP server and RAW developer'],
              ],
            },
          },
          { p: 'Preview and export share one code path, so files always match the preview.' },
        ],
      },
      {
        id: 'extend',
        title: 'Extending Chitthi',
        blocks: [
          {
            table: {
              head: ['To add', 'Where'],
              rows: [
                ['A print size, layout or product', `Data in \`src/data/\` ([SPECIFICATIONS.md](${DOC('SPECIFICATIONS.md')}))`],
                ['An occasion theme or font', '`src/data/themes.ts`, `src/data/fonts.ts`'],
                ['An AI service', `An adapter in \`src/ai/providers/\` and its host in \`electron/ai-hosts.json\` ([AI.md](${DOC('AI.md')}))`],
                ['An agent tool', '`src/agent/tools.ts` or `photoTools.ts`, with a self-test check'],
                ['A library, model or asset', `Check the licence first: permissive only ([licensing.md](${SPEC('licensing.md')}))`],
              ],
            },
          },
        ],
      },
      {
        id: 'tests',
        title: 'Tests',
        blocks: [
          {
            table: {
              head: ['Command', 'What it checks'],
              rows: [
                ['`npm run lint`, `npm run typecheck`', 'ESLint and strict TypeScript'],
                ['`npm run test:unit`', 'Vitest: the pure logic (design loading, colour maths, masks, LUTs, TIFF, RAW)'],
                ['`npm test`', 'About 6,100 checks inside Electron: every product × size × layout, GPU parity, AI masks, every agent tool'],
                ['`npm run test:mcp`', 'The MCP server end to end, including RAW to 16-bit TIFF'],
                ['`npm run test:e2e`', 'Playwright on the production build at desktop and phone sizes, with accessibility checks'],
              ],
            },
          },
          { p: `How the tests work: [testing-strategy.md](${SPEC('testing-strategy.md')}). Contributing: [CONTRIBUTING.md](${GH}/blob/main/CONTRIBUTING.md).` },
        ],
      },
    ],
  },
];

export const docPage = (id: string | undefined): DocPage => DOC_PAGES.find((p) => p.id === id) ?? DOC_PAGES[0];
