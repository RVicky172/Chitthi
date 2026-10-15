# Chitthi – Low-level design

This document describes the modules, data model and algorithms behind the [high-level design](architecture.md). Paths
are relative to the repository root.

## 1. Module map

```text
src/
  main.tsx                 Entry: applies the saved theme, loads bundled UI fonts on desktop, mounts <App>, registers the service worker
  App.tsx                  Screens (home / studio / sizes / paper / instagram / docs), hash routing, start-up effects,
                           keyboard shortcuts
  index.ts                 Library entry for the design-system sync (re-exports; never mounts)
  types.ts                 Every shared type: Design, Photo, Layout, SizeDef, CalendarSettings, …
  vite-env.d.ts            Type references: Vite client, @webgpu/types
  assets/                  fonts/: the Schibsted Grotesk UI font (WOFF2, Latin and Latin Extended), bundled by Vite
  assests/                 Unused Pexels photos (Images/postcards/), nothing imports them (000 Known gaps)
  data/                    Specifications as data
    products.ts              PRODUCTS, productOf, sizesFor, MONTHS
    sizes.ts                 SIZES, SIZE_GROUPS, sizeLabel
    layouts.ts               LAYOUTS (id, name, product), LOOKS
    themes.ts                25 occasion themes: colours, patterns, fonts, greetings, quotes
    fonts.ts                 46 font families with category and weights
    samples.ts               Gallery samples (definitions) built from Pexels photos in public/samples/; state/samples.ts
                             loads them
    showcase.ts, .json       Landing page examples (definitions) and their pre-rendered images (manifest)
    printSamples.ts          The 12 print samples for test prints and quotes (npm run build:print-samples)
    docs.ts                  The in-app documentation (#/docs) as pages of blocks, rendered by DocsPage.tsx
    instagram.ts             Instagram post formats and limits
    layers.ts                Layer shapes, stickers, text styles, brushes and palette for photos and video
  engine/                  Framework-free; no React imports
    design.ts                DEFAULT_DESIGN, productDesign, mergeDesign, cardMM, calPages, cornerMM, resolveTheme, inks
    layout.ts                computeLayout (a table of one builder per layout), slotCount, slotPhotoIndex
    layoutParts.ts           What layout builders share: the context (card, pad, gap, unit) and rect / slot helpers
    postcardLayouts.ts       The postcard layouts' builders
    printLayouts.ts          The frame-print, calendar and magnet layouts' builders
    render.ts                renderCard (one side, bleed, round cut, guides), renderThemeTile, photoDpi
    themeBackground.ts       The card's unit, the bleed fill, the occasion background (drawThemeBg)
    printText.ts             wrapLines, shrinkFont, label typeface, letter spacing, cap height
    photoSlots.ts            Photo slots (shapes, cover photo, hint, outline, print, tape), layout art, mat, glass
    postalDecor.ts           Stamp, postmark, badge arc lettering, Instagram tag
    frontText.ts             The front's words (drawText, layoutText) and a calendar page's words
    cardFront.ts             drawFront: the front, bottom first
    cardBack.ts              Postcard, frame and magnet backs, the credit line
    calendarDraw.ts          calMonth, month page and title, day grid and marks, big number, year grid and back
    patterns.ts              Procedural occasion artwork (PAT)
    photo.ts                 File checks, loading, makePhoto / updatePhoto (crop, rotate, looks), lookPixels
    instagram.ts             Instagram posts: placement, colour adjustments, renderIg (docs/MEDIA-STUDIO.md)
    adjust.ts                A photo's or clip's colour settings as parameters (never pixels), kept apart from framing
    light.ts                 Light and white balance in linear light: temperature, tint, exposure, tones (P1.1)
    curve.ts, hsl.ts         Tone curve (monotone spline, per channel) and colour mixer (8 bands) (P1.2)
    chain.ts                 The Canvas 2D colour chain: look → light → curve → mixer → LUT, one rounding at the end
    detail.ts                Noise reduction, dehaze, clarity, sharpening, grain, sized for a 1080 px frame (P1.3)
    lut.ts                   .cube parser, tetrahedral lookup, LUTs loaded this session (gpu/lut.ts on the GPU)
    presets.ts               Saved presets: mergePreset, names, the preset file (presets plus their LUTs); the built-in
                             presets (looks) and presetApplied
    masks.ts                 Masks: the model (parts, limits, ranges, new parts and masks)
    maskGate.ts              mergeMasks, mergePart: the gate for masks from outside
    maskBrush.ts             Brush strokes on a raster, painted incrementally while drawing
    maskRaster.ts            Gradient / range / AI rasters, parts and masks (cached), the photo sample
    maskPlace.ts             The photo's place on the frame, gradient handles and drags, frameMask
    segments.ts              AI segmentation maps (subject, sky) per picture source, for AI mask parts (P1.8)
    photoExport.ts           Photo file types (JPEG, PNG, WebP, AVIF): which this browser writes, encodePhoto
    raw.ts, tiff.ts          Camera RAW: developed pixels → preview and linear source; 16-bit TIFF writer (P1.9)
    deep.ts                  The 16-bit float render behind the TIFF export (P1.9)
    gpu/                     The GPU render graph (P0.2–P0.5, P1.3–P1.6), with the Canvas 2D path as fallback:
                             types.ts (device contract), device.ts (WebGPU, else WebGL2, else none), webgpu.ts,
                             webgl2.ts, graph.ts (nodes, runNodes), colour.ts, detail.ts, lut.ts, mask.ts (programs
                             mirroring the CPU code), apply.ts (the GPU step of renderIg)
    layers.ts                Text, shapes, stickers, drawings, images over photos and video: the model, new layers,
                             names, scaleLayer, addStroke, the session's pictures
    layerDraw.ts             drawLayers (blend, mask), layerBox, wrapText, shapePath
    layerPick.ts             hitLayer, handles, the selection outline, rotationFor
    layerGate.ts             mergeLayers: the gate for layers from project files
    videoFormats.ts          Video formats, bitrates, frame rates, per-platform limits (limitsFor)
    video.ts                 Frame drawing: renderStack, renderFrame, motions, fades, NO_PICTURE
    timeline.ts              Video project as tracks (201): clip timing (clipLength, frameRange), the clip transform
                             (IDENTITY), pack, gaps, videoAt, framePlan
    tracks.ts                Tracks (201, 203): the main video and music tracks, switches, add / rename / move / delete
    soundPlan.ts             The export's sound plan (audioPlan) and a clip's sound edges (206)
    projectDoc.ts            The project document: its JSON shape, fromSequence (2.x), toDocument
    projectGate.ts           mergeProject: the gate for project files and 2.x projects
    edits.ts                 Edit operations on a track (202): ripple / lift / gaps, trim, moveTo, reorder, roll, slip,
                             slide, nudge, snapping, checkTrack
    decodePool.ts            Decoder pool (204): lanes of decoded frames for the preview and the export, lanePlan,
                             frameTime, poolLimits (section 4.10)
    frameSource.ts           The pool's frames from Mediabunny: inputs shared per file, readers, openFrames() registry
    videoExport.ts           MP4 export (H.264 + AAC, fast start) with Mediabunny over framePlan / audioPlan, on export
    printPages.ts            pagesOf, nup, SHEETS, exportSummary, baseName: what the studio shows before building
    export.ts                buildPDF, buildPNG, printSpec, buildPack, envelope PDFs; loaded with import() on export
    envelope.ts              Envelope size and paper, flap shapes, the template's sheet, envelopeSummary
    envelopeDraw.ts          renderEnvelope: front / back and the 3D layers (body, flap, liner); drawChitthiMark
    envelopeTemplate.ts      renderEnvelopeTemplate: the fold-your-own net with cut and fold lines
    quote.ts, quoteWriter.ts Print-shop documents (catalog, quote request, order sheet) and their jsPDF writer
    color.ts, sample.ts      Colour maths and drawing helpers; painted stand-in photos
  state/
    store.ts                 App store, undo/redo, persistence, setters
    actions.ts               User actions (photos, products, export, gallery, backup, 3D)
    photoSlots.ts            Photo ↔ slot mapping, slot selection
    library.ts               Photo store (every upload), putOnCard, keyOfStored
    photoFit.ts              Photo shape vs slot shape, crop loss, print dpi in a slot, learned pixel sizes
    instagram.ts             Instagram studio's store: batch, selections, tools, undo / redo, `change`, limit, photo
                             edits (adjust, masks, look to all)
    instagramLayers.ts       Layer actions of the photo editor (add, update, remove, restack, copy to all)
    instagramMedia.ts        Photos into the batch (addPhotos; RAW developed on desktop, its embedded JPEG on the web)
    instagramExport.ts       Rendering the batch at full size (renderBatch, prepareBatch), ZIP, share check
    presets.ts               Saved presets of the photo & video editors: list, save, rename, delete, export, import
    samples.ts               Gallery samples: the photo set's manifest (sampleCredits), buildSample
    videoStore.ts            Video editor's store: kind, tracks, clips, layers, music, playhead, Magnetic, tool, Snap,
                             undo / redo, `change` / `commit` (the one path for undoable changes), loadVideoProject
    videoTracks.ts           Track actions (add, rename, move, delete, hide / mute / lock, heights), clipPlace
    videoClips.ts            Clip changes, remove, move, duplicate, split; edit tools (through engine/edits.ts)
    videoBox.ts              A clip's box and volume, stored or keyed at the playhead; presets
    videoKeys.ts             Keyframe actions on clips and layers (toggle, remove animation, move, ease, delete)
    videoLayers.ts           Layer actions; updateLayerAt (keyed at the playhead), setLayerTimes
    videoTransitions.ts      Transition actions: set, remove, on every cut
    videoMedia.ts            Photos and videos into clips (addMedia, filmstrips), the music
    videoExportJob.ts        The export: in memory or streamed to a file, progress, cancel
  lib/
    db.ts                    Storage API: IndexedDB in browsers, IPC to files on desktop
    idb.ts                   The IndexedDB helpers db, userFonts and userLuts share (open, one request per transaction)
    fonts.ts                 On-demand font loading (Google Fonts or bundled)
    ids.ts                   Record ids (saved designs, stored photos): time + a cryptographic random tag
    pexels.ts                Pexels client, key and settings storage, suggestions
    userFonts.ts             Uploaded fonts: IndexedDB storage, FontFace registration
    userLuts.ts              Imported .cube LUTs: IndexedDB storage, loaded into engine/lut.ts when chosen
    fileSink.ts              A file the video export streams into (desktop IPC or the File System Access API)
    gpuSetting.ts            The "use the graphics card" setting, kept on this device (P0.5, P0.9)
    perf.ts                  Performance monitor sampler (CPU / load, frames, memory, photos, storage) and report
    errors.ts                In-memory log of recent errors (uncaught, rejections, render, handled) for the reports;
                             components/ErrorBoundary.tsx shows the error screen
    download.ts, zip.ts, toast.ts, theme.ts
  ai/                      Loaded with import() only when an AI feature is used (section 5, AI)
    types.ts                 TextAdapter, ImageAdapter, requests, AiError, aspect helpers
    registry.ts              Provider id → lazy adapter module; request context per call
    service.ts               Facade: writeWords, writeCaptions, writeMessages, generateArt, textBudget, slotShape
    transport.ts             Adds the key for allowed hosts (web) or sends the request to the main process (desktop)
    secrets.ts, settings.ts  Keys (SecretStore); chosen services, models, daily limits and usage
    prompts/                 Versioned templates: words.ts (greetings, captions, messages), artwork.ts (pictures)
    providers/               anthropic, openai, gemini, openaiCompat, stability, fal, bfl, replicate, ideogram; read.ts
                             reads their JSON answers without trusting the shape
    segment/                 AI masks (P1.8): index.ts (models on the device, download + SHA-256 check, segmentPhoto,
                             modelState / deleteModel for Settings, 401), models.ts (the two models, modelRow),
                             worker.ts (ONNX Runtime Web), models/u2netp.onnx
  agent/
    tools.ts                 The registry: the 56 agent tools in the order agents see them, toolNamed
    catalogTools.ts          Print catalogue: products, sizes, layouts, themes, fonts, festivals (read only)
    designTools.ts           Print design: new design, size, layout, theme, words, back, calendar, any setting
    cardPhotoTools.ts        Photos on a print design: slots, calendar pages, files, URLs, Pexels, arrange
    aiTools.ts               Words, captions and pictures with the user's AI provider (ai/service loaded on use)
    outputTools.ts           check_design, previews, print pack, PDF, quote request, print specs
    galleryTools.ts          Saved designs: list, open, save
    designSummary.ts         The design as an agent sees it, patchDesign (through mergeDesign), the photo list
    photoTools.ts            The 22 photo studio tools: batch, framing, colour, preview, export, with maskTools.ts
                             (masks, AI too) and presetTools.ts (presets, LUTs)
    photoStudioInfo.ts       The batch as an agent sees it; finding the photo or mask an agent names
    photoEdits.ts            Colour settings' schema and gate (cleanAdjust), mask parts and putMask, AI masks, drawing
    common.ts                Tool shape, schema helpers (objectSchema …), argument readers, reading an image by path or URL
    prompts.ts               MCP prompts (workflows) and resources (design, specs, photo rules)
    bridge.ts                Page side of MCP: runs one call at a time, returns text, images and files
  platform/
    desktop.ts               Typed window.chitthiDesktop bridge (absent in browsers)
    menu.ts                  Desktop menu commands → actions
  dev/                     Development only, never in production builds
    selftest.ts              The checks behind npm test (opened at ?selftest in Electron)
    poolChecks.ts,           Decoder pool checks (204): in npm test, plus playbackChecks' timings on demand
      playbackChecks.ts        (CHITTHI_TEST_ONLY=pooltiming / poolcount)
    showcase.ts              Renders the landing examples for npm run build:showcase
    printSamples.ts          Renders the print samples for npm run build:print-samples
  components/              React UI (section 8); studio/ = the photo & video studio workspace (Shell, PhotoWorkspace,
                           VideoWorkspace, Timeline, Dialog, previewFrame / previewSound: section 4.10; the timeline is
                           Timeline, PictureRow, CutMarks, TimelineBars, TrackHead, Transport, timelineDrag,
                           timelineActions, timelineRows), ig/ = editing
                           panels shared by photos and video (layers, masks, curves, colour mixer, looks), panes/ = the
                           print studio's step panes, ai/ = AI settings, words and artwork dialogs
  styles.css               Ordered @imports of styles/ (section 8, Styles)
  styles/                  The stylesheet split by feature: 01-base.css … 40-site-nav.css, in cascade order
electron/
  main.cjs                 Main process: window, app:// protocol + CSP, file library, dialogs, menus, updater
  preload.cjs              contextBridge: the only system access for the page
  ipc.cjs                  handle / on: IPC registration that accepts only the app's own page
  ai.cjs, ai-hosts.json    AI requests with encrypted keys; allowed hosts and auth header per provider
  mcp.cjs                  MCP server (official SDK): loopback HTTP, headless start, agent IPC
  mcp-stdio.cjs            stdio ↔ HTTP relay run by the Electron binary in Node mode (headless)
  raw.cjs                  RAW photos: develops the page's bytes with LibRaw's dcraw_emu to 16-bit linear RGB (P1.9)
  dev.mjs                  Runs Vite + Electron together for development
  resources/               Not in git, fetched before packaging: fonts/ (npm run fetch:fonts) and
                           libraw/<platform>-<arch>/ (npm run fetch:libraw)
scripts/                   Build, test and fetch scripts (specs/build.md): check-bundle, check-licenses, test, mcp-smoke,
                           fetch-* (samples, fonts, LibRaw), build-* (showcase, print samples, favicons), spec-tables
```

Dependency rule: `components → state → engine → data`. `engine` never imports from `state` or `components`, so it
can render and export in any context: preview, thumbnails, gallery samples or the sizes guide.

## 2. Data model

### Design (`src/types.ts`)

The complete, serialisable description of one piece. It is saved as JSON in `localStorage`, the gallery, backups
and `.chitthi` files.

| Group | Fields |
| --- | --- |
| Product and size | `product: 'postcard'｜'calendar'｜'frame'｜'magnet'`, `sizeId`, `custom {w,h}` (mm), `orient` |
| Look | `useOccasion`, `themeId`, `group`, `artwork`, `decor`, `plain {bg, ink, accent, gradient}`, `frame` (paper / mat / border colour), `mat` (frame prints) |
| Layout | `layout: LayoutId` |
| Words | `heading`, `quote`, `sig`, `show*` flags, `insta`, `headFont`, `quoteFont`, `sigFont`, `instaFont`, `textScale`, `vAlign`, `hAlign`, `customColor`, `color`, `scrim`, `ornament` |
| Back | `back {message, font, fromFont, addrFont, labelFont, from, to, address, pin, stamp, label, tint, credit, date}` |
| Postmark | `postYear` (0 = automatic: the calendar's year, else this year; `postmarkYear(d)`) |
| Calendar | `cal {year, start, months: 1｜12, weekStart, text: 'off'｜'caption'｜'photo', captions[12], titleAlign, numbers, grid: 'lines'｜'boxes'｜'tiles'｜'none', font, numFont, numBold, numSync, titleScale, numScale, showYear, sundays, capFont, titleFont, backQuote, marks: 'off'｜'national'｜'all', markNames, ownDates[{m, d, label}]}` |

**Optional fonts** (`sigFont`, `instaFont`, `back.fromFont / addrFont / labelFont`, `cal.capFont / titleFont / numFont`)
are empty strings that mean "follow the parent font": the signature follows the quote font, From and address follow
the message font, labels and the tag use Hind, captions follow the greeting font, and the year-page title follows the
month font. A picker writes `''` back when the parent font is chosen, so the field keeps following it. With
`cal.numSync` the dates use the month font, and `numFont` is kept for when it is turned off.
| Export | `exp {format: 'pdf'｜'sheet'｜'png', sheet, bleed, dpi, quality, marks, back, pngs}` |
| Meta | `designName` |

`mergeDesign(saved)` makes any stored object safe: it starts from `DEFAULT_DESIGN`, keeps only known keys,
deep-merges nested groups, pads `cal.captions` to 12, and resets a size, layout or font that no longer exists for
the product. Optional fonts whose family is gone (an uploaded font removed from the device) fall back to `''`.
Every load goes through it, so old saves keep working, and new fields (calendar sizes, font sync, the year and
Sunday switches) take their defaults.

### Photo

`PhotoMeta` (serialisable): `name, url (data URL), rot, flip, crop {x,y,w,h} (0–1), zoom, px, py (−1…1), look`.
`Photo` adds runtime fields: `id`, `orig` (the decoded image), and `src / sw / sh` (the processed source).

### Specifications

`SizeDef {id, grp, products?, name, L, S (mm), inch?, tag?, instax?, native?, corner?, shape?}` and
`ProductDef {id, name, short, blurb, backLabel, paper, defaults}`. See [SPECIFICATIONS.md](../docs/SPECIFICATIONS.md).

### Layout (result of `computeLayout`)

| Field | Meaning |
| --- | --- |
| `slots: Slot[]` | Photo windows: `{x,y,w,h}` plus `s` shape (`rect｜round｜circle｜arch｜poly`), `bleed`, `bare` (no accent outline), and `d`, the drawing rect extended into the bleed when the slot touches the trim edge |
| `text: Rect｜null` | Zone for greeting / quote / signature; `onPhoto` makes it white with a shadow |
| `ink` | `'frame'` (the paper's ink), `'dark'` (the theme's darkest ink, on a light glass panel), or the default |
| `textFill?`, `textScaled?` | Text height as a share of the zone height (default 0.32; calendar caption bands use 0.72). `textScaled` means the zone was already sized with `textScale`, so the words aren't scaled twice |
| `glass?` | A frosted-glass panel over the photo (`glass`, `cal-glass`) |
| `bg`, `frame`, `paper`, `band`, `overlay`, `frameLine`, `mat` | What is painted behind and around the photos |
| `stamp`, `post` | Postage-stamp layout pieces |
| `calTitle`, `calGrid`, `calYear`, `calNum` | Calendar month title, day grid, the 12-month grid of the Year strip, or the big month number (`cal-bold`) |
| `scrimArea?` | Limits "darken the photo" to the photo (calendars) |
| `arc?` | Badge magnet ring for curved lettering |

## 3. State (`src/state/store.ts`)

```ts
interface AppState { design: Design; photos: Photo[]; ui: UIState; designId: string | null; canUndo; canRedo }
interface UIState  { side, guides, pane, cropId, slot, viewer, gallery, settings, screen: 'home'|'studio'|'sizes'|'paper', calPage, fontTick }
```

- A module-level object plus a listener set. Components subscribe with `useApp(selector)`, built on
  `useSyncExternalStore`. Selectors must return stable references or primitives.
- `set(patch, track)`: tracked changes (design or photos) schedule **persistence** and **history**; UI changes
  (`setUI`) do not.
- **History**: `scheduleCommit()` debounces for 400 ms, then `commit()` pushes `{design, photos}` (a stack of up to
  100). Undo and redo restore snapshots by reference. Photo objects are immutable, so snapshots are cheap.
- **Persistence**: design → `localStorage['chitthi-v3']` after 400 ms. Photos → `db.putWorkPhotos` after 1.2 s, only
  when a signature (names, URL lengths, edits) changed.
- Setters: `setDesign(patch | fn)`, `setBack`, `setExp`, `setPlain`, `setPhotos`, `patchPhoto`, `setUI`,
  `replaceCard`.
- Routing helpers: `screenOf(hash)` / `hashOf(screen)` map `#/studio`, `#/sizes`, `#/paper` and home.

### Actions (`src/state/actions.ts`)

| Action | What it does |
| --- | --- |
| `addFiles(files)` | `checkFile` → data URL → `makePhoto`; fills up to `maxPhotos(product)`; every good file also goes to the photo store; returns user messages |
| `selectSize(s)` | Sets the size; Instax sizes also force the Instax layout and an A4 sheet without bleed |
| `switchProduct(p)` | Saves the current design under `chitthi-product-<old>`, restores or creates the other product's design, keeps photos |
| `downloadPack / downloadPrintFile / downloadPNG` | Ensure fonts, run the export engine, `saveFile` (browser download or native dialog) |
| `open3D()` | Renders front, back and (calendars) every month page to JPEG data URLs → `ui.viewer` |
| `saveDesign / openDesign / newCard` | Gallery record with photo metas and 900 px thumbnails |
| `exportBackup / exportDesignFile / importText` | JSON gallery backup, single `.chitthi` file, validated import |
| `restoreWork()` | On start, reloads the previous card's photos |
| `openSample()` | Loads a gallery sample into the studio |

### Photos and slots (`photoSlots.ts`, `library.ts`)

The **order of `photos` is the assignment**: slot `i` on page `p` shows `photos[slotPhotoIndex(i, n, p, count)]`,
which is `(p × count + i) mod n`. Calendars therefore move through the list month by month. Placing a photo in a
slot swaps two list positions, so undo, autosave and export need no extra state. `putOnCard(storedPhoto)` adds a
stored or downloaded photo: move it if it's already on the card, fill an empty slot, add it, or replace the photo
in the selected slot when the card is full.

## 4. Engine

### 4.1 Geometry (`design.ts`, `layout.ts`)

- `cardMM(d)` gives the trim size in mm for the orientation (custom sizes are clamped by the UI to 40–420 mm).
- `renderCard(canvas, side, pxPerMM, bleedMM, input, opts)` sizes the canvas to `(w + 2·bleed) × (h + 2·bleed) ×
  pxPerMM` and defines the box `B = {x: e, y: e, w, h, e}` in canvas pixels, where `e` is the bleed in pixels.
- `computeLayout(id, B, d)` returns a `Layout` in the same pixel space, through the layout's builder (`BUILDERS`:
  `postcardLayouts.ts`, `printLayouts.ts`). Each builder gets a `LayoutContext` (`layoutParts.ts`) with the shared
  metrics: `short = min(w, h)`, `pad = 0.075·short`, `gap = 0.016·short`, `unit = short/100`. Because every value is
  relative to the box, one layout works at any size and dpi. Helpers: `bleedSlot()` makes a bleed slot,
  `plainSlot()` an inset slot, `rightOf()` / `below()` the text zone beside or under a photo. At the end, slots
  touching the trim are extended into the bleed (`extend()`).
- **Calendars**: each calendar layout defines a photo region and an *area*. When `cal.text` is `photo`, the text
  zone is the photo inset by 8%, with white ink and the scrim limited to the photo. When it is `caption`, a band
  of `min(0.1·area.h, 0.075·area.w) × textScale` is taken from the top of the area. The title band is
  `min(0.17·area.h, 0.12·area.w) × cal.titleScale` (both scales clamped to 0.5–1.8). Caption and title share at most
  46% of the area and shrink together beyond that, so the grid always keeps the rest. For the **Year strip** it
  splits into a year title and `calYear`. **Big number** (`cal-bold`) splits the title row into `calNum` (the
  number, 1.5 × its height wide) and a title box sized so the month name's baseline meets the number's.
  **Frosted glass** (`cal-glass`) puts the area on a `glass` panel with `ink: 'dark'`; **Arch window** (`cal-arch`)
  uses an arch slot above (or beside) it.
- **Badge magnet**: a circular photo of radius `r − band` inside a ring; `arc` describes the ring for lettering.

### 4.2 Rendering (`render.ts` and the modules it draws through, §2)

`drawFront` (`cardFront.ts`) runs in this order:

1. Background: paper colour (`frame` layouts), occasion gradient and patterns (`bg`), or nothing (full-bleed).
2. Paper card and stamp shapes.
3. Photo slots: `drawSlot` clips to the slot shape and draws the photo with **cover** scaling
   (`max(w/sw, h/sh) × zoom`), offset by `px, py`. Empty slots show a hatched "Add a photo" hint in the preview.
4. Mat bevels (frames), stamp text and postmark, frosted glass (`drawGlass`: the photo under the panel drawn at
   1/28 size and scaled back up, which blurs it in every browser, then lightened), calendar band, occasion overlay
   decoration, frame line.
5. Words: `drawText` lays out heading / ornament / quote / signature (`layoutText` + `wrapLines`). It starts at
   `min(Z.w × (0.13 + 0.06·tall), Z.h × textFill) × textScale` (`tall` grows from 0 to 1 as the zone goes from
   0.8 to 2 times taller than wide, so narrow columns wrap the greeting instead of shrinking it) and shrinks by 7%
   until everything fits the zone, then aligns with `vAlign` / `hAlign`. On a calendar, `calendarWords()`
   substitutes that month's caption for the greeting, in `cal.capFont`, aligned with the month title when it sits
   above the month.
6. Calendar month (`drawMonth`), Year strip (`drawYearTitle` + `drawYearGrid`), badge lettering (`drawBadge`),
   Instagram tag.

Backs: `drawBack` (postal back), `drawYearBack` (calendar), `drawFrameBack` (dedication label), `drawMagnetBack`.
Round sizes are then masked white outside the trim circle plus bleed. `drawGuides` draws trim (red) and safe area
(blue, 4 mm) as rectangles or circles.

**Calendar typography** (the rules that keep pages consistent):

- *Month title*: font size is the largest at which the **widest** of the twelve month names, plus the year, fits
  the title box. Every page gets the same size. The baseline is centred on the font's cap height, and the year sits
  on the same baseline in the accent colour. A left-aligned title is inset to match the first column's numbers.
- *Grid*: always **five rows** on month pages. A sixth week shares the cell above it, drawn smaller and split by a
  diagonal ("23/30"). The grid lines and number positions are therefore identical every month.
- *Numbers* in the cell corner (padding 13% of the cell) or centred, scaled by `cal.numScale` and capped to the
  cell. Sundays use the accent colour unless `cal.sundays` is off. Weekday headers are letter-spaced capitals
  aligned the same way as the numbers. The dates font is `numFont` (Hind when empty), or the month font with
  `numSync`. The **Tiles** grid draws a rounded, lightly tinted square behind each date instead of rules.
- *Accent on paper*: a pale accent (lightness above 0.6) is deepened towards the ink for the year, Sundays and the
  big number, so yellow themes stay readable on white.
- *Month number* (`cal-bold`): the cap height fills `calNum`, sized on "00" so every month matches.
- *Marked days*: `marksFor(year, month, cal.marks, cal.ownDates)` (`data/holidays.ts`) gives each day's national
  days, festivals and own dates. National days and festivals colour the date like a Sunday; `drawMarks` writes the
  names along the bottom of the cell (two lines when the cell is tall enough, cut short with "…", "+N" for more), or
  one dot per kind in the year grid, in shared "23/30" cells and when `markNames` is off. `mergeDesign` turns marks
  off for calendars saved before the feature, so their look doesn't change.
- *Year grid* (back page, Year strip): 3, 4 or 6 columns by aspect ratio, with month names sized to the widest name.

### 4.3 Photos (`photo.ts`)

`checkFile` rejects HEIC, TIFF, GIF, BMP, SVG, PDF, empty files and files over 25 MB, each with its own message.
`makePhoto` stores the metadata and runs `processed()`: rotation, mirroring, crop and the colour look are applied
once at full resolution (capped at 16 MP for mobile canvas limits) into an off-screen canvas. `updatePhoto`
re-processes only when rotation, mirroring, crop or look changed; zoom and position are applied at draw time.

### 4.4 Export (`printPages.ts`, `export.ts`)

`printPages.ts` holds what the studio shows before anything is built (pages, imposition, the summary, file names);
`export.ts` builds the files and is loaded with `import()` on the first export (D-042).

- `pagesOf(d)`: one front (or one per calendar month, one for the Year strip), plus the back when `exp.back` is on
  and the product prints one (magnets don't).
- `cardCanvas(page)`: `renderCard` at `dpi / 25.4` px per mm with the chosen bleed.
- **Print PDF**: one page per side, page size = trim + bleed + a 9 mm slug when crop marks are on. Marks are drawn
  as vectors, with a label line.
- **Sheet PDF**: `nup(d)` tries both rotations on the sheet (8 mm margins, 10 mm gap with marks, 4 mm without) and
  keeps the one that fits more. Backs are placed in mirrored columns and rotated the other way, for long-edge duplex.
- **PNG**: canvas → PNG, then a `pHYs` chunk is inserted so the file reports its dpi.
- **Pack**: PNGs in `front/` and `back/`, the PDF, and `PRINT-SPEC.txt` (`printSpec`), zipped by `lib/zip.ts`
  (stored, CRC-32).

```mermaid
sequenceDiagram
  participant U as User
  participant H as Header / PrintPane
  participant A as actions.downloadPack
  participant E as engine/export
  participant R as engine/render
  participant F as lib/download
  U->>H: Print pack
  H->>A: downloadPack(onStep)
  A->>A: ensureFonts(fontsFor(design))
  A->>E: buildPack({design, photos})
  loop every page
    E->>R: renderCard(canvas, side, dpi/25.4, bleed, {page})
    E->>E: buildPNG (+ pHYs)
  end
  E->>E: buildPDF (jsPDF, lazy import)
  E->>E: printSpec + makeZip
  E-->>A: {blob, name}
  A->>F: saveFile(name, blob)
  F-->>U: browser download or native Save dialog
```

### 4.5 Envelopes (`envelope.ts`, `envelopeDraw.ts`, `envelopeTemplate.ts`)

- `envelopeSpec(d)`: the smallest standard envelope with at least 5 mm room around the piece; square pieces get
  square envelopes; bigger pieces get a made-to-measure size.
- `renderEnvelope(canvas, face, pxPerMM, input)` draws at envelope size, without bleed (ready-made envelopes print to
  a margin). `front`: occasion band, return address (`back.from` + `env.sender`), stamp box, recipient (`back.to`,
  `back.address`) with PIN boxes, the greeting. `back`: paper, pocket seams, the flap in the occasion artwork and a
  scalloped seal holding the first photo or a monogram, and the Chitthi logo stamp (`drawChitthiMark`) with "Made with Chitthi" at the bottom centre as the product mark. `body`, `flap` and `liner` are the separate layers the 3D
  view animates.
- `renderEnvelopeTemplate()` lays the flat net on the smallest sheet it fits (A4, Letter, A3, 13×19 in, either way
  round): the address front in the centre; side flaps, bottom flap and closing flap around it. Flaps fold behind the
  front, so the closing flap's artwork is drawn **rotated 180°** about the top fold and reads correctly once folded.
  Solid lines are cuts, dashed lines folds, with 2 mm of paper colour bleeding past each cut.
- Export: `buildPack` adds `envelope/…-envelope-front.png`, `-back.png`, `-envelope-print.pdf` and
  `-envelope-template-<sheet>.pdf` when `design.env.on`.

### 4.6 Photo analysis and arrangement (`engine/analyze.ts`, `state/traits.ts`)

`analyzeImage()` reads a ≤ 96 px copy of a photo: mean luminance (brightness), its spread (contrast), colourfulness,
warmth (red − blue), the dominant hue (chroma-weighted histogram over nine named hues), a three-colour palette
(4-level colour boxes), sharpness (mean Laplacian edge energy) and a focus point (the centre of edge energy and
colour, weighted towards the middle). It also derives plain search tags (*bright, dark, colourful, muted, warm,
cool, sharp, soft, sky, night, black and white, wide / tall / square* and the hue).

- `relevance(traits, slot, theme)`: 0.45 × shape fit (crop loss) + 0.25 × print resolution in the slot + 0.12 ×
  sharpness + 0.18 × palette harmony with the occasion colours.
- `focusPosition(traits, aspect)`: the crop offset (px, py) that keeps the focus point in view.
- `assign(photos, slots)`: best total relevance; exhaustive for ≤ 6 slots and ≤ 8 photos, otherwise greedy by best
  pair.
- `state/traits.ts` caches traits by URL, analyses library photos in idle time one at a time, and stores the result
  on the stored photo (`StoredPhoto.traits`) so each is analysed once. `autoArrange()` reorders the card's photos by
  `assign` and sets each crop with `focusPosition` (calendars keep month order); `smartFill()` adds the most relevant
  library photos to empty slots. The photo strip shows at most 8 card and 8 library photos (most relevant first) and
  "All photos" to open the library.

The photo dock under the preview (`PhotoTray.tsx`) shows the layout's slots, then up to ten suggestions for the
selected slot (the design's unused photos, then the most relevant library photos, never duplicating a slot), then
tools. Slots accept drag and drop: a suggestion onto a slot places it; a slot onto another swaps them.

### 4.7 Print quotes (`data/printSpecs.ts`, `engine/quote.ts`)

`PRINT_SPECS` holds material, weight, finish, colour sides and finishing per category. `buildQuoteCatalog()` and
`buildQuoteRequest()` write A4 PDFs with jsPDF (a small writer with wrapping tables that break across pages, image
rows and fill-in lines); `buildPack` adds the request to every print pack and `printSpec()` lists the same details.

### 4.8 Photo fit (`state/photoFit.ts`)

`slotInfo(design, slot)` measures a slot at trim size. `cropLoss(w, h, aspect)` is the share of a photo a cover crop
removes (`1 − min(r, 1/r)`, where r is the photo aspect divided by the slot aspect); a photo *fits* when that is at
most 20%. `slotDpi` is the resolution a photo reaches covering the slot. Pixel sizes of stored photos are learned
from their thumbnails (`rememberDims`) and cached for the session, so filtering needs no extra decoding.

### 4.9 Video project as tracks (`timeline.ts`, `tracks.ts`, `soundPlan.ts`, `projectDoc.ts`, `projectGate.ts`, `state/video*.ts`)

A project is `{ tracks, clips, audio, layers, fadeOut }`. A `Track` has an id, a kind (`video`, `overlay`, `audio`), a
name and `hidden` / `muted` / `locked`; every project has `V1` (main video) and `A1` (music); limits 8 + 8 tracks on
desktop, 4 + 4 on the web (`TRACK_LIMITS`). A clip is today's `ClipTiming` plus `track` and `start` (seconds, full
precision); the music is an `AudioClip` on `A1` with `in` = its offset and `toEnd` (plays to the end of the video).

- `pack(clips)` places the main track's clips end to end, summing lengths as 2.x did (bit-identical starts). It runs
  in one place, the store's `change()`, and only while **Magnetic** is on (the default, 202): then the track stays
  gapless as in 201 and 2.x. With Magnetic off clips keep their starts, in start order, and the track can have gaps
  (`gaps(p, track)`).
- `projectLength`, `videoAt(p, t)` (the clip and local time on the topmost visible picture track; null inside a gap;
  clamps like 2.x before 0 and at the end), `framePlan(p, fps)` (the export's frame ranges; a gap is a `{ clip: null }`
  span of black frames, so frames run 0 → total; one black span when `V1` is hidden) and `audioPlan(p)` (clips' sound
  with 0.03 s ramps, the music unless `A1` is muted, fading out over min(1.5 s, a third); since 203 also every video
  clip of an overlay track that isn't muted). `framePlan` stays as the 2.x oracle; preview and export draw
  `frameStack` (below).
- `patchTrack` (Hide only on picture tracks, Mute only on sound tracks) and `lockedReason`, used by the store's
  `setTrack` (an undo step), `clipLocked` / `musicLocked` and the refusals of every clip and music action.
- `toDocument` / `mergeProject(raw, desktop)` → `{ doc, dropped }`: the JSON form (version 1; media described, never
  embedded) and its single validator. No version = a 2.x project, converted by `fromSequence` (also how the store's
  shape maps to tracks). Numbers are checked and clamped, enums checked, edits through `mergeEdit`, layers through
  `mergeLayers` (image layers only with a picture the project has), clips without a known track or media dropped with
  a reason, limits enforced; it never throws.
- The document has an optional `magnetic` (missing = on; `toDocument` always writes it). On, `mergeProject` packs the
  main track; off, it sorts it by start and moves a clip that overlaps the one before to that clip's end, with a
  reason (D-009 D3).
- `timeline.testkit.ts` keeps the 2.x placement, frame loop and sound list, frozen, with 12 fixtures; unit tests and
  the self-test compare the model against it.

**Edit operations (`engine/edits.ts`, 202).** Pure functions on a project's picture clips, each returning
`{ clips }` or `{ error }` (never throwing; the same array when nothing changes) with an `EditCtx` (the length limit,
the lock check): `rippleDelete`, `lift`, `closeGap`, `closeGaps`, `trim(id, side, delta, { ripple })`, `moveTo` (a
time, else the nearest free spot that fits, else refused: no overwrite), `reorder`, `roll` (the cut between two
touching clips), `slip` (videos only), `slide` (needs a clip after it; with `magnetic` it opens no gap), `nudge`
(Alt + arrows per tool) and `snapTargets` / `snapTime`. Limits: 0.3 s (`MIN_LEN`; a 2.x clip already shorter can't be
shortened), the source, 60 s for photos (`PHOTO_MAX`), the project's length. Video edges are clamped to the source
and starts at 0 where they move (floating-point sums miss them by 1e-16). `checkTrack` is the invariant (sorted, no
overlap, inside sources, within the limit, nothing newly under 0.3 s); 1,000 seeded edits per operation keep it and
pass `mergeProject` unchanged; each runs in ≤ 0.02 ms on 500 clips. The store (`state/videoClips.ts`) wraps each in one
undo step (`apply`); `magnetic` is in its undo snapshots (D1), `tool` and `snapping` are view settings (D4), and
`loadVideoProject` starts a project from ready clips (tests).

**The timeline UI (`components/studio/Timeline.tsx`, 202; clip drags in `PictureRow.tsx`, keys in `timelineActions.ts`, the transport in `Transport.tsx`).** The transport has the tool picker (a `radiogroup` of
native radios: V / R / Y / U) and the Magnetic / Snap switches (`aria-pressed`). A clip's body and edges call one store
action per tool (plan §4): Select reorders (Magnetic on) or follows the pointer and calls `moveClipToTime` on release
(off, with a drop marker), its edges `trimClip` (ripple with Magnetic on or Shift at the press); Roll's edges
`rollClip` on the clip before the cut; Slip and Slide (body, the edges pass the press on) `slipClip` / `slideClip`.
Drags edit from the store's current clip step by step under one undo key and say a refusal once. `snap()` leaves out
the dragged clip or layer, is skipped with Snap off or Alt held, and otherwise rounds to the frame. Gaps are focusable
`.tl-gap` buttons (Delete → `deleteGap`). Keys: Alt + ← / → `nudgeClip` (Shift: a second; with Slip and nothing
selected, `slipMusic`), Q / W `rippleTrimToPlayhead`, Shift + Delete `rippleDeleteClip`. `describeClipChange`
(`timelineRows.ts`) puts the changed clip's times in the polite `.tl-live` region 250 ms after a change settles.

Track heights (`trackView`, 40 / 64 / 96 px) are a view setting in the store: not undone, not saved.

**Compositing (203).** Picture tracks are drawn bottom first: `V1`, then the overlay tracks in their order in `tracks`.

- **The stack** (`engine/stack.ts`): `frameStack(p, t)` is the clips drawn at `t`, one per visible picture track
  (a gap draws nothing; the main track keeps `videoAt`'s clamps; edges `EDGE_EPS` early, D-032). With only `V1` it is
  exactly `[videoAt(p, t)]`. `mostVideosAt(clips, tracks)` (an event sweep; hidden tracks counted, photos not) is the
  videos-at-once count the edits check (`EditCtx.maxVideos`, `tooManyVideos`); `snapBox` snaps a moved box's centre
  or edges to the frame's centre lines and edges.
- **The transform**: a picture clip may carry `tf?: ClipTransform` = `{ x, y, w, rot, opacity, radius }` (centre and
  width as shares of the frame, degrees, 0–1, corner radius as a share of the shorter side); missing = `IDENTITY`
  (the whole frame). `clampTransform` is its gate, `presetTransform` the inspector's presets (35 % wide, 4 % margin).
- **Drawing** (`engine/video.ts`): `renderStack(ctx, frameWidth, frameHeight, items, layers, time, total, fadeOut)`: black, each item, the
  layers, the darkness. An item at the identity draws through 2.x's `renderIg` call, so a project without overlays
  is pixel-identical (AC-10); otherwise `intoBox` (translate, rotate, rounded clip, scale `w`), and a see-through
  item (opacity × an overlay's fade-in ramp < 1) is drawn on a scratch canvas and laid down once. `save()` /
  `restore()` pairs restore in `finally` (a closed frame must not leave the canvas moved). `renderFrame` is
  `renderStack` with one item.
- **The document**: `DocClip.transform` (written only when not the identity), overlay tracks kept, the overlap rule
  on every picture track; 201 / 202 documents round-trip byte-identical.
- **The store** (`state/videoTracks.ts`, `videoMedia.ts`, `videoBox.ts`, `videoClips.ts`): `addTrack`, `renameTrack`, `moveTrack`, `deleteTrack`, `setTrack` (Mute for
  overlays), `addMedia(files, { track, at })` (`NEW_TRACK` makes one), `moveClipToTrack`, `setClipTransform` (a
  key per drag), `applyPreset`, `updateClipWhy` (the inspector shows refusals); every result is checked with
  `limitVideos`; overlay clips are lifted, never rippled (Q8).
- **The timeline** (`Timeline.tsx`, `PictureRow.tsx`, `TrackHead.tsx`, `timelineRows.ts`): a `PictureRow` per picture track, top first
  (`pictureTracksTopFirst`); an overlay `TrackHead` renames (the name becomes a field) and its height menu moves and
  deletes the track; `AddTrackButton` by the ruler; files dropped on a row (`rowUnderPointer`) land there, on the
  ruler in a new track; a Select drag over another row calls `moveClipToTrack`; "Move to" in the transport does it by
  keyboard. Snap targets come from every picture track; `clipLabel` names clips per track and `describeClipChange`
  announces changes (box changes through `describeTransform`).
- **The stage** (`useClipTransform.ts`, `engine/clipBox.ts`): `useLayerPointer`'s background handlers, so layers get
  presses first. `partAt` picks the corner (resize: `resizedTransform`, aspect kept), the top handle (turn:
  `rotatedTransform`, Shift 15°) or the body (move: `movedTransform` with `snapBox` at 8 screen px, guides drawn);
  arrow keys `nudgedTransform` (1 %, Shift 10 %); a press on an overlay clip selects it. ClipPanel's Position and size
  group sets the same transform.

**Keyframes (205, D-034).** One pure module, `engine/keyframes.ts`, evaluates keyframes for the preview, the export,
the stage and the inspector.

- **The model**: a clip or layer may carry `keys?: Keyframes<P>` = `{ [value]: Keyframe[] }`, `Keyframe` =
  `{ t, v, ease }` with `t` in seconds from the item's start, sorted, `ease` one of `linear`, `ease-in`, `ease-out`,
  `ease-in-out` (new keys), `hold`. Clip values (`ClipKeyProp`): the box's `x y w rot opacity radius` and `volume`;
  layer values (`LayerKeyProp`): `x y w rot opacity`. Ranges are 203's box clamps, volume 0–1 and `mergeLayers`'
  clamps (`clampValue`). Limits (`KEY_LIMITS`): 100 per value, 5,000 per project.
- **Evaluation**: `valueAt(keys, t)` (binary search; the first value before the first key, the last after; the CSS
  cubic-bezier eases solved by Newton with a bisection fallback, stop 1e-12); `transformAt(clip, local)`,
  `volumeAt`, `layerAt(layer, t)` (an animated `w` scales the whole layer with `scaleLayer`) and `layersAt` return
  the item itself when nothing is animated, so projects without keys take the 203 paths; `itemTransform` gives
  `renderStack` each item's box, `drawLayers` draws `layersAt(layers, t)` (the photo editor passes no time).
  500 clips with 5,000 keys: median 0.016 ms a frame.
- **Edits** (pure, each returning new keys or `undefined` when nothing is left animated): `setKey` (a key within half
  a frame is replaced), `removeKey`, `moveKey` (one value or all), `setEase`, `animate` / `stopAnimating` (keeps the
  value at the playhead), `shiftKeys` and `splitKeys` (each part keeps its side and a key at the cut). In
  `engine/edits.ts`, `keepKeys` shifts a clip's keys by minus its start's move when its start edge moves (a start trim
  without ripple, Roll's right clip, Slide's next clip), so keys stay on the timeline; whole-clip moves need nothing.
- **Sound**: `audioPlan` gives a keyed clip `gain` (its volume keys) and mixes it when any key is above 0;
  `gainCurve` samples it every ≤ 5 ms (within 0.5 dB of the exact curve) and `mixWindow` sets one
  `setValueCurveAtTime` per source per 10 s window (unkeyed sources keep the 0.03 s ramps); `previewSound` sets each
  element's volume from `volumeAt` on every tick.
- **The document**: `DocClip.keys` and `Layer.keys`, written only when some are left, so documents without keys are
  byte-identical. `mergeKeys(raw, props, on, budget)` is the gate: known values only (`__proto__` and unknown names
  dropped), finite times within a day, values clamped, unknown eases → `ease-in-out`, sorted with the last of equal
  times kept, the limits (one `KeyBudget` shared by clips then layers), each reason once; it never throws.
- **The store** (`state/videoKeys.ts`, `videoBox.ts`, `videoLayers.ts`): `toggleKey(target, props)`, `removeAnimation`, `moveKeys` (a drag passes one undo
  key), `setKeyEase`, `deleteKeys` (a value's last key stores its value); routers `setClipTransformAt`,
  `setClipVolume`, `updateLayerAt` write an animated value as a key at the playhead and any other as before (auto-key,
  Q4); `setLayerTimes` shifts a layer's keys when only its start moves; split and duplicate carry keys. Each action
  is one undo step returning its refusal (a locked track, a limit).
- **The UI**: `KeyframeButton` / `KeyframeNav` (`components/studio/KeyframeButton.tsx`, states from `keyState`, times
  from `adjacentKey`) beside the inspector's values; the stage (`useClipTransform`, `useLayerPointer` given
  `layersAt`) edits the values shown and writes through the routers; `KeyframeLane.tsx` under the selected item's row
  (`keyTimes`, `easeShape`, `describeKeyChange` in `timelineRows.ts`), K and Alt + [ / ] in the timeline.

**Transitions (206, D-035, D-036).** `engine/transitions.ts`; `frameStack` returning both clips is what everything
else follows (the preview picture and sound, the export, the decoder pool).

- **The model**: `TimedClip.transition?` = `{ kind, dur, to, dir?, colour? }` on the outgoing clip, `to` naming the
  clip it leads into (D1); kinds `dissolve`, `dip`, `wipe`, `slide`, `zoom`; `dur` 0.1–3 s in whole frames
  (`TRANSITION_LIMITS`), centred on the cut. `cutsOf`, `halves`, `progressAt` (205's Ease in and out), `roomFor`.
- **The one rule**: `tidyTransitions(clips, fps)` drops a transition whose `to` doesn't start where its clip ends on
  the same track and clamps the rest, in time order, so each clip's two halves fit; run in the store's `change()`
  (after `pack`) and in `mergeProject` (after placing clips), so edits know nothing of transitions.
- **The stack**: `frameStack` gives a track's pair during a transition (`transitionItems`), each with
  `mix: { kind, dir?, colour?, progress, role }` and its `local` past its ends (the handles); `mostVideosAt` widens a
  video's span by its halves; `lanePlan` lists both clips and readies the incoming one 2 s before its transition;
  pool lanes are primed from the handle (`poolClip(c, lead)`, the export's `lane`), as `prepare` primes at `in`.
- **Drawing**: `transitionOps(mix, W, H)` = a `DrawOp` (alpha, `lighter` or `source-over`, clip rect, move, scale) and
  a dip's colour; `renderStack` draws a pair with `drawPair`: each clip as `drawClip` draws it alone on a layer canvas,
  laid onto a pair canvas with its op, the dip colour `source-atop`, the pair laid down once.
- **Sound**: `SoundSource.lead` / `trail` / `edgeIn` / `edgeOut` from `soundEdges`; `edgeGain` (sin / cos of the eased
  progress, or the dip through silence) inside `sourceGainAt`, so `gainCurve` and `mixWindow`'s one curve cover it;
  the preview plays both clips into their handles at the same gain.
- **The document**: `DocClip.transition`, written only when present; `mergeTransition` (unknown kind → dissolve,
  unknown option → its default, length clamped, each reason once), then `tidyTransitions`.
- **The store and UI**: `setTransition`, `removeTransition`, `transitionEveryCut` (one undo step each; refusals: no
  touching clip after it, no room, locked, videos at once), split and duplicate carry them, `transitionSel` (view
  state); `TransitionPanel.tsx` (the rail panel, `panelCut`) and `TransitionInspector`; the timeline's `CutMarks`
  (cut buttons and blocks, `draggedLength`, `describeTransitionChange`).

### 4.10 Decoder pool (`decodePool.ts`, `frameSource.ts`)

The preview and the export get their video pictures from one place, so a paused preview shows the frame the export
encodes and memory doesn't grow with the clip count. Spec, decisions D1–D5 and the measurements:
`specs/features/204-decoder-pool/`.

**The pool (`engine/decodePool.ts`, pure).** A `DecodePool(open, limits, { maxWidth? })` keeps one **lane** per clip
id that needs pictures (two clips of one file get two lanes). A lane has a frame source on the clip's file, the frames
decoded ahead (`buf`, in time order) and `last`, the frame handed out last, held until a newer one replaces it. The
pool knows nothing of Mediabunny: sources come from a `FrameSourceFactory`, whose `from(t)` is a restartable reader of
frames in order from the one showing at `t` (`decodePool.test.ts` drives the pool with a fake). Only the pool closes
the frames it hands out. Each lane has one worker (`run`) at a time, which opens the source and then steps towards the
lane's goal: an exact ask, else the playing target, else the prepared first frame; with none it stops, so an idle
pool decodes nothing.

- `frame(clip, srcTime)` (async, exact: the export and a paused preview) resolves with the frame covering the time
  (`time ≤ t < time + duration`; the source's last frame past its end, its first before its start). Latest wins: a
  newer ask on the lane resolves the older one to `null`. Rejects when the clip can't be decoded.
- `peek(clip, srcTime)` (sync, never waits: playback) returns the frame if it is decoded, else the lane's `last` (a
  **hold**, counted in `stats().holds`; null until the clip's first frame is decoded). It marks the lane playing, so the
  worker decodes up to `limits.ahead` frames past the one shown.
- `prepare(clip)` (look-ahead) opens the lane and decodes its first frame; `want(ids)` names the lanes still needed;
  `forget(id)` closes one; `fallback(id)` is why a clip can't be decoded (or null); `stats()` gives decoders, frames,
  bytes and holds; `dispose()` closes every lane.
- Readers: a lane reads on while the time moves forward by less than 2 s (`REREAD`), else restarts its reader at the
  new time (the source seeks to the key frame before it). Handing a frame out closes the frames before it, and of the
  unshown frames at or before the goal only the newest is kept.
- Limits (`poolLimits(videosAtOnce, desktop)`, Q3): decoders = `videosAtOnce` + 2 (the visible clips, the next to start,
  a spare for scrubbing), 4 frames ahead per lane, and a byte budget of 256 MB on the web and 1 GB on the desktop app,
  counted at the frame's width × height × 4 (D2: the display size in the preview, the resized canvas in the export).
  Opening a lane at the decoder limit closes another open lane, those not wanted first, then the least recently used;
  with none to close the lane waits and is woken when one closes. Before each decode the lane **reserves** the frame's
  bytes (its last frame's size, else the biggest seen), so frames in flight count against the budget. At the budget,
  decoding ahead stops; the frame a lane's goal needs (exact, playing or prepared) makes room from the other lanes in
  the same order: their frames ahead first (keeping the one their goal needs), then their held frames.
- Failures: a source that fails to open or to decode puts its lane in **fallback** (`failed` = the reason, which usually
  names the file): the pending ask rejects, later `frame()` calls reject and `peek()` returns null; other lanes go on. A
  decoder the browser took back (`takenBack`: a `QuotaExceededError`, or a "reclaimed" message, as Chrome reclaims idle
  codecs) is not the file's fault: the lane releases its frames and reopens, up to `REOPENS` = 2 times, keeping the
  pending exact ask, before it goes to fallback.

`lanePlan(project, t, ahead)` is the clips a time needs (Q10): on every visible picture track the video clip showing
at `t` (the main track clamps at its ends as `videoAt` does) and the track's next video clip starting less than
`ahead` seconds later. Photos need no lane. `frameTime(t, fps)` = `floor(t · fps + 1e-6) / fps` puts a time on the
export's frame grid (D3).

**Frames from Mediabunny (`engine/frameSource.ts`).** `mediabunnySource(file, { maxWidth })` shares one `Input` per file
(reference-counted, disposed with the last source on it) and checks its video track once: an unreadable file, no video
track or `canDecode()` false rejects with a message naming the file. Each reader is one Mediabunny iterator, so one
`VideoDecoder` until it ends or its `return()` stops it (T001). Preview sources read `VideoSampleSink.samples(t)` and
keep a `VideoFrame` per sample (a canvas when the file asks for a rotation or flip); export sources (`maxWidth`, D5)
read `CanvasSink.canvases(t)`, no wider than `maxWidth`, from a ring of 8 canvases. Frames go through one registry
(`trackFrame`) and readers through `reader`, so `openFrames()` gives the frames, bytes and decoders open right now
across every pool, and `made`, every frame decoded so far: the self-tests read it after exports, cancels and failures
(AC-11, AC-12). `undecodableForTests` (a `WeakSet` of files, empty in the app) makes a self-test's file fail as an
undecodable codec.

**Preview (`components/studio/previewFrame.ts`, `VideoStage` in `VideoWorkspace.tsx`).** `stageSource()` makes the
stage's picture source: where `VideoDecoder` exists, a `DecodePool` (`poolLimits(1, …)`; Mediabunny is imported with the
first lane, not with the editor) wrapped by `poolSource`, which draws a clip in fallback from a muted `<video>`
(`videoElementSource`, the pre-204 path); without `VideoDecoder` (Q7), `<video>` elements alone. `pausedAt` /
`pausedFrame` give the paused picture on the export's grid (`frameTime`, then `videoAt`), and `drawPreview` draws it
through `renderFrame` as the export does; the stage and the AC-4 self-test call the same functions. `noteFallback` /
`useFallbackNote` keep per file "This clip can't be exported here: <reason>" (logged once with `logError`), shown in the
clip's timeline title and accessible name and in the inspector. `VideoStage` creates the stage on first use and disposes
it when the editor closes. A frame is a `StageFrame`: its grid time and its stack (`items`: clip, local time, picture). Playing, each tick draws
the stack with every video `peek()`-ed (what is ready, else its held frame); paused, it draws `heldStageFrame` at once
(each clip keeps its own last picture, so an overlay arriving doesn't blank the main clip), then the exact
`pausedFrame` when it lands (every picture of the stack awaited together; only the newest ask is drawn). A fallback
clip's `<video>` follows the clips on screen (`frameStack`), not the sound plan, so a muted overlay's still moves. Each tick and each paused change calls `want()` with `lanePlan(…, 2)` and `prepare()` for the next clips; a clip
removed from the project is `forget`-ed.

**Preview sound (`components/studio/previewSound.ts`, D1).** `soundPlan(project, t)` is whose sound plays: the video
clip on top at `t` (a hidden main track's clips still sound), the clips starting within 2 s, and the other visible
clips (covered by an overlay, kept loaded and silent). `previewSound()` keeps an audio-only `<audio>` element for
exactly those and releases the rest, so elements don't grow with the clip count; the next ones are pre-seeked to their
`in`, so a cut starts without a seek. A playing element is kept in step by `soundFix(drift, fps, rate)`: over 0.25 s
it seeks; over one frame (or, while still nudging, over 10 ms) `playbackRate` moves by up to ±3 % in 0.5 % steps;
otherwise it is 1. The music keeps its own element in `VideoStage`.

**Export (`engine/videoExport.ts`).** Video clips decode through a pool of the export's own, with
`poolLimits(videosAtOnce, …)` and `maxWidth` = 1.8 × the frame's long side (D5). Frames 0…N each draw
`frameStack(p, i / fps)` through `renderStack`: every picture of a frame awaited together (videos from the pool, the
export waits and never skips; past the end of a source shorter than its trim the last frame is held per clip; photos
decoded once per clip); `want` / `prepare` follow `lanePlan(t, 2)` when the stack changes and each second; a clip is
released (`forget`, its photo URL revoked) once it has left the stack. `ExportJob.trace` reports each frame's clips
for the self-test. `dispose()` runs in
`finally`, so after a cancel or an error no frame or decoder is left. A clip the pool can't decode is refused with its
reason, which usually names the file.

**Limits.** `limitsFor()` (`engine/videoFormats.ts`) gives `videosAtOnce`: 3 on the web, 5 on the desktop app, 1 without
`VideoDecoder`, set from the AC-15 measurements by Q2's rule (the numbers:
[PERFORMANCE.md](../docs/PERFORMANCE.md#videos-on-screen-at-once)); `203` enforces it in the edits. The preview's and
the export's pools use `poolLimits(videosAtOnce, …)` (the limit + 2 decoders).

**Checks.** `decodePool.test.ts` (unit: holds, latest wins, bounds, fallback, reopening); `src/dev/poolChecks.ts` in
the default `npm test` (AC-1–AC-4, AC-9, AC-11, AC-14), with `playbackChecks`' quick checks (AC-12's release, AC-13);
`src/dev/playbackChecks.ts` timings on demand: `CHITTHI_TEST_ONLY=pooltiming npm test` (AC-5, AC-7, AC-8 and AC-12's
bounds on the real editor) and `CHITTHI_TEST_ONLY=poolcount npm test` (AC-15: simultaneous videos through the pool);
`CHITTHI_TEST_ONLY=pool npm test` runs only the pool section of the default run.

## 5. Integrations

### Fonts (`lib/fonts.ts`)

`ensureFont(name)` adds the family's stylesheet link (Google Fonts, or `app://chitthi/fonts/<slug>.css` on desktop
builds with bundled fonts) and waits for `document.fonts.load` of each weight. `fontsFor(design)` lists the heading,
quote, back and calendar month fonts. The app bumps `ui.fontTick` when fonts arrive, so canvases redraw.

### Uploaded fonts (`lib/userFonts.ts`)

`addUserFont(file)` checks the type (TTF, OTF, WOFF, WOFF2) and size (10 MB), test-loads it with `FontFace`, stores
`{family, file, data}` in IndexedDB `chitthi-fonts`, registers it with `document.fonts`, and adds a `FontDef`
(category `own`) to `USER_FONTS` in `data/fonts.ts`. The family name comes from the file name. The list of names is
mirrored in `localStorage`, so `mergeDesign` keeps a design's uploaded font at start-up before the files load;
`ensureFont` waits for `loadUserFonts()` for those names. Font pickers list them under **Your fonts** with an
upload button; Settings lists, previews and deletes them.

### Pexels (`lib/pexels.ts`)

| Function | Purpose |
| --- | --- |
| `pexelsKey()` / `setPexelsKey()` | The user's key in `localStorage['chitthi-pexels-key']`; changing it clears the cache and fires `chitthi:pexels` |
| `pexelsHidden()` / `setPexelsHidden()` | "Show Pexels search" setting |
| `testPexelsKey(key)` | One `per_page=1` search: `ok｜refused｜limit｜offline` |
| `pexelsAccess()` | `key` (saved key), `server` (same-origin proxy answers JSON) or `none` |
| `searchPexels(q, orientation, page)` | Saved key → api.pexels.com; else `./api/pexels/`. Results cached per request. Throws `PexelsKeyError` when there is no access |
| `fetchPexels(photo)` | Downloads up to 3000 px, returns `{name, url: dataURL}` |
| `pexelsSuggestions(d, page)`, `slotOrientation(d, slot)` | Queries and shape filter from the design |

Full description: [PEXELS.md](../docs/PEXELS.md).

### AI (`src/ai/`)

- **Providers** are data in `data/aiProviders.ts` (name, kinds, `web: 'direct' | 'desktop'`, base URL, key page,
  suggested models) and hosts in `electron/ai-hosts.json`. `registry.ts` maps each id to an `import()` of its adapter
  (OpenAI-compatible services share `openaiCompat.ts`).
- **Adapters** (Strategy) implement `TextAdapter.generateJSON(ctx, req)` and/or `ImageAdapter.generate(ctx, req)`.
  `ctx.http.fetch` is the transport; the adapter never holds a key. Claude uses the official SDK
  (`output_config.format` JSON schema, effort low, `stop_reason === 'refusal'` handled, the server-side fallback beta
  unless turned off). Errors become `AiError` kinds: `key`, `limit`, `refused`, `network`, `setup`, `bad-output`, `cancelled`, `provider`.
- **Service** (Facade): `writeWords` / `writeCaptions` / `writeMessages` build a prompt from `prompts/words.ts` with a
  character budget from the layout (`textBudget`) and return options; nothing is applied until the user picks one
  (`setDesign`, so undo works). `generateArt` builds the prompt from `prompts/artwork.ts` with the slot's aspect
  (`slotShape`, `nearestAspect`), runs one job at a time, counts against the daily limit (`settings.spend`), and
  returns `Blob`s. The chosen picture becomes a JPEG data URL (`blobToJpegDataUrl`) named by `aiPhotoName`, then goes
  through `storePhotos` and `putOnCard`.
- **Transport** (Bridge): web adds the key header only when `keyAllowed(provider, url, base)`; desktop serialises the
  request to `ai:fetch`, and strips any auth header the SDK sets, because the main process adds the real key.
- **Credits**: `lib/credits.ts` `aiCreditOf` / `isAi` read the `(AI / Provider model)` suffix; `creditsText` and
  the printed credit line include AI pictures.

### Storage (`lib/db.ts`)

One interface, `DesktopBridge['db']`: `all/get/put/del` for designs, `getWorkPhotos/putWorkPhotos`, and
`libAll/libPut/libDel` for the photo store. Reads come back unchecked from IndexedDB (`lib/idb.ts`), so each list
keeps only records with the fields the app relies on (ids, names, urls); designs still pass `mergeDesign()` and presets
`mergePreset()` when used.

- Browser: IndexedDB database `chitthi` v4 with object stores `designs`, `work` (key `photos`), `library` and
  `libfull`, all keyed by `id`. `library` holds each stored photo's details (name, 320 px JPEG thumbnail, pixel size,
  analysis, fingerprint) and `libfull` its full image, so listing the library reads a few kB per photo instead of
  megabytes (60 phone photos: 1.2 MB instead of 128 MB, 22 ms instead of 260 ms). `db.libUrl(id)` fetches the full
  image when a photo is placed. The v3 → v4 upgrade moves existing images across; thumbnails and analysis for them are
  added in the background (`library.ts`, idle time).
- Photos are matched between a design and the library by `photoKey()` (`lib/photoKey.ts`): data length plus an
  FNV-1a hash of 4 KB from the start and end, instead of comparing multi-megabyte strings.
- Desktop: IPC to `library/designs/<id>.json`, `library/photos/<id>.json` (full image), `library/photos-meta/<id>.json`
  (everything else, created on first run for older libraries), `library/presets/<id>.json` (saved presets; the main
  process checks the id, name, shape and a 64 KB size, the page validates with `mergePreset()`) and `library/work.json`, written atomically
  (temporary file + rename). Ids are validated against `/^[A-Za-z0-9_-]{1,100}$/`.

## 6. Desktop shell (`electron/`)

| Channel | Direction | Purpose |
| --- | --- | --- |
| `desktop:info` (sync) | page → main | Version, platform, whether fonts are bundled |
| `desktop:saveFile(name, data)` | invoke | Native save dialog, write file, remember the path |
| `desktop:showInFolder(path)` | invoke | Only for paths saved in this session |
| `desktop:openExternal(url)` | invoke | `https:` and `mailto:` only |
| `desktop:openDesignFile()` | invoke | Open dialog for `.chitthi` / `.json` |
| `desktop:metrics()` | invoke | CPU (% of one core since the last call) and working-set memory of every Chitthi process (`app.getAppMetrics`), CPU count and total memory, for the performance monitor |
| `db:*` | invoke | Storage above |
| `menu` | main → page | Menu command (`MenuAction`, handled in `platform/menu.ts`) |
| `open-file` | main → page | A `.chitthi` file opened from the OS |
| `ai:keys` / `ai:setKey` / `ai:deleteKey` | invoke | Which providers have a key (never the key), save one encrypted, delete one |
| `ai:fetch` | invoke | An AI request: the main process checks the host against `ai-hosts.json`, adds the key, returns status, headers and body (≤ 40 MB, 180 s, 2 at a time) |
| `agent:call` | main → page | An MCP request for the page (`__list`, `__resource`, `__prompt` or a tool) |
| `agent:reply` | page → main | Its result (id 0: the page is ready) |
| `agent:writeFiles` | invoke | Save tool output to Documents/Chitthi agent output (unique names) |
| `agent:readPhoto` | invoke | Read a JPG / PNG / WebP ≤ 25 MB (or a camera RAW ≤ 300 MB) for `add_photo` and `add_batch_photo` |
| `raw:available` | invoke | Whether LibRaw's RAW developer is installed (`electron/raw.cjs`) |
| `raw:develop` | invoke | Develop a RAW file's bytes (≤ 300 MB, RAW extension) to 16-bit linear RGB; returns width, height and the pixels |
| `agent:status` / `agent:setLive` | invoke | Live MCP endpoint: state, and turn it on or off (returns URL and token) |

`app://chitthi` is a privileged standard scheme serving `dist/` (and `fonts/` from resources) with the CSP header on
HTML. Navigation away from the origin is blocked, and external links open in the system browser. Window size is
remembered. On a packaged start, `electron-updater` checks GitHub Releases.

### MCP

`Chitthi --mcp` (`MCP_MODE` in `main.cjs`) skips the window and the single-instance lock, loads the app hidden with
`?agent` (which installs `agent/bridge.ts`), starts the HTTP server on a random loopback port, and spawns
`mcp-stdio.cjs` with `ELECTRON_RUN_AS_NODE=1`, `CHITTHI_MCP_URL` and `CHITTHI_MCP_TOKEN`. The relay forwards each
newline-delimited JSON-RPC message as an HTTP POST and writes the JSON reply to stdout; when stdin closes the app
quits. Live mode uses the same `listen()` against the open window. Each request gets a fresh stateless
`StreamableHTTPServerTransport` (`enableJsonResponse`); handlers for tools, resources and prompts forward to the page
over `agent:call` and wait for `agent:reply`. Images come back as base64 PNG, files as paths.

## 7. Routing and screens

The hash is the source of truth: `#/studio[/product]`, `#/sizes[/product]`, `#/paper`,
`#/instagram[/video|/youtube]`, `#/docs[/page[/section]]`, or empty for home (`screenOf` in `state/store.ts`). `App` listens to
`hashchange` / `popstate` → `setUI({screen})`, and writes the hash when `ui.screen` changes, so Back works. Dialogs
(gallery, settings, crop, 3D viewer) are flags in `ui` that drive native `<dialog>` elements.

## 8. Components

```text
App
├─ Landing                       home: hero, product cards (live renders), how it works
├─ SizeGuide                     #/sizes: size table, to-scale diagram, layouts at the chosen size
├─ Paper3D                       #/paper: every size in 3D at true relative scale (see below)
├─ InstagramStudio              #/instagram[/video|/youtube]: the photo & video studio (studio/: PhotoWorkspace,
│                                VideoWorkspace on Shell + Timeline; docs/MEDIA-STUDIO.md)
├─ DocsPage                      #/docs[/page[/section]]: the in-app documentation, rendered from src/data/docs.ts
│    (the site pages share SiteNav: brand, guide links and "On this page", gallery, Find, theme, Settings, full
│     screen, and both studios as one pair of buttons; links and tools fold into the Menu below 1200 and 760 px)
├─ Studio
│  ├─ Header                     product switcher, Find, Photos (library), theme, sizes guide, settings, full screen,
│  │                             undo/redo, save, print pack, and a More menu (MoreMenu) for whatever doesn't fit
│  ├─ Rail                       six steps + gallery
│  ├─ panel → Pane per step      PhotosPane (upload, PexelsSearch, PhotoStore, photo list)
│  │                             LayoutPane (orientation, layouts, calendar / mat options, sizes)
│  │                             OccasionPane, WordsPane (CardWords, or CalendarFront for calendars),
│  │                             BackPane (per product), PrintPane
│  └─ Stage                      side toggle, guides, month pager, 3D button (phones: a View menu), live canvas (drag, wheel, keys),
│                                MonthStrip (calendars), PhotoTray (slots + store)
├─ FeatureFinder (Ctrl+K: search every feature; opens the step and reveals the section, or runs the action)
├─ CropDialog, GalleryDialog (+ SampleGallery), PhotoLibrary, SettingsDialog (key, fonts),
│  Viewer3D (card / ring / wall / envelope modes), Toast
└─ PerfMonitor (lazy; while ui.perf is on)
```

**Responsive layout.** Nothing on any screen scrolls sideways from 1920 px down to 360 px (checked with Playwright at
1920, 1440, 1280, 1100, 1024, 900, 820, 700, 600, 390 and 360 px). Secondary actions move into a menu instead of
wrapping. The widths, all in `styles/32-header-nav.css` unless noted:

| Width | Studio header (`Header`) | Page nav (`SiteNav`) | Stage |
| --- | --- | --- | --- |
| > 1480 px | Everything inline with labels | Links, actions and icons inline | Full bar |
| 1241–1480 px | Find, Photos and Save as icons (product names keep their labels) | same | same |
| 961–1240 px | Product switcher icons only | ≤ 1100 px: links and page actions fold into **Menu** | same |
| 601–960 px | Theme, sizes guide, settings, full screen fold into **More** | same | Card gets a fixed height and the stage grows (≤ 860 px, `styles/11-phones.css` + `32`) |
| ≤ 600 px | Logo, undo, redo, print pack and More on one row; the product switcher gets its own row (icon over name); Find, Photos and Save fold into More | Find, Settings and full screen fold into Menu | Print guides / Print colours fold into a **View** menu, 3D view is an icon |

`MoreMenu` renders one list for every width; each row's class (`mm-md`, `mm-sm`) decides at which width it is listed,
matching the `hide-md` / `hide-sm` class on the inline button, so an action is always in exactly one place. It closes
on Escape or an outside click and supports arrow keys, Home and End.

**Styles.** `src/styles.css` is an ordered list of `@import`s of `src/styles/NN-feature.css` (numbers = cascade
order; Vite inlines them). Add rules to their feature's file and keep a media query next to the rules it adjusts.
`npm run build:lib` also writes `dist-lib/styles.css`, the same stylesheet flattened, for the design-system sync.

**Performance monitor** (`lib/perf.ts`, `PerfMonitor.tsx`; More → Performance monitor, Find a feature, or View →
Performance monitor on desktop; the choice is kept in `localStorage['chitthi-perf']`). It samples once a second only
while open and pauses while the page is hidden: frames drawn, long tasks (`PerformanceObserver('longtask')`) as a
"main thread busy" share, worst timer delay, JS heap (Chromium), DOM size, decoded photo bytes, undo-history bytes and
storage use; on desktop also CPU and memory per process type from `desktop:metrics`. **Copy report** puts the last
two minutes of samples and a summary on the clipboard as JSON. See [PERFORMANCE.md](../docs/PERFORMANCE.md).

Steps are built from `Section` (`components/common.tsx`): a titled, collapsible group whose open state is kept in
`localStorage['chitthi-sections']`. `revealSection(id)` opens, scrolls to and focuses a section, waiting for it to mount
when its step isn't on screen yet; the feature finder uses it. `lib/fullscreen.ts` wraps the Fullscreen API.

The 3D viewer (`Viewer3D.tsx`) runs one animation loop: drag with momentum (velocity from the last pointer move,
decaying 7% a frame), hover tilt towards the pointer, smoothed zoom (wheel, pinch, buttons, 50–260%), and per-face
shading from the angle to a light at the upper left. Keys: arrows turn (or change month), F flips, O opens the
envelope, +/−/0 zoom, R resets, Space toggles turning. Double-click flips, or opens a month from the ring.

**Pexels credits** (`lib/credits.ts`): a Pexels photo's name ends in `(Pexels / Photographer #id)`. `creditOf(name)`
parses it (older names without `#id` still parse, without a link), `shortName` drops it for labels, `creditsText`
writes the credits file, and `PhotoCredit` (`common.tsx`) shows the linked credit. `lib/pexels.ts` reads
`X-Ratelimit-Remaining` / `X-Ratelimit-Reset` and stops searching until the reset once the allowance is used.

**Print colours** (`engine/proof.ts`): `softProof(canvas)` runs on the studio preview when `ui.proof` is on. It
pulls strong colours towards grey by a per-hue factor (`KEEP`, lowest for greens, cyans and blues), leaves soft
tones alone, and maps black–white to printed black–paper white.

**Quote pack** (`downloadQuotePack` in `state/actions.ts`): for the designs picked in the gallery it loads each saved
design, builds its `QUOTE-REQUEST.pdf`, and zips them with `orderSheetCSV(items)` (`engine/quote.ts`), the catalogue
and the combined photo credits.

**Code splitting**: `App.tsx` loads the landing page, sizes guide, 3D paper page and the dialogs with `React.lazy`
(dialogs mount only while open), and fetches them all a few seconds after start-up, so the service worker has them
for offline use. The feature finder stays in the main bundle for its Ctrl+K listener.

**Calendar Front** (`panes/CalendarFront.tsx`) is grouped in the order people decide: *Style* (five presets that set
the title and date fonts, grid, date position and alignment together; the matching one is highlighted), *Year*
(`YearField` from `common.tsx`: a number box with − / +, 1900–2200), *Month title*, *Dates*, *Festivals and your dates*,
*Words on the months*, then *On the photo* (quote, signature, position, darkening), shown only when the words
sit on the photo.

**Paper sizes in 3D** (`Paper3D.tsx`) uses CSS 3D like the viewer. `allPieces()` builds every product size (in the
chosen orientation), the distinct envelopes they need (`envelopeSpec`), the `SHEETS` and two references (a bank
card and a ₹10 coin), all in millimetres. Three arrangements: `sideBySide` (rows packed by area, each row on a
shared baseline with a label strip), `stacked` (largest first, a few pixels apart in Z) and `onSheet` (the pieces
placed with `nup()` exactly as `buildPDF` imposes them, lifted by a slider). One scale `S` (px per mm) fits the
arrangement to the view, times the zoom; **Actual size** sets `S = 96 / 25.4` with a flat top view and
`perspective: none`, centred on the selected piece. Faces are real renders (`renderCard` / `renderEnvelope` with
`samplePhoto` stand-ins), drawn in the background, cached per piece and picked up as they arrive. Drag turns (tilt
0–80°); Shift + drag, or any drag in actual size, pans; wheel and pinch zoom (30–800%); keys: arrows, + / −, 0.

Measured (Chrome, 12 MP photos): a preview render takes ~2 ms because the GPU keeps each decoded photo as a texture,
and typing redraws within one frame even with the 24 layout and 12 month thumbnails on screen. Pre-scaled photo
copies (mipmaps) and a binary-search text fit were tried and measured slower, so they were left out.

Performance details: layout and month thumbnails redraw from `useDeferredValue` copies. Only the current step
pane and its neighbours are mounted. Sample thumbnails are cached for the session (their decoded photos are not; they
reload for "Use this"), Pexels results for the last 60 searches. The undo history drops its oldest steps once the
processed photo canvases only it still holds pass 320 MB (at least 10 steps stay). Memory rules in full:
[PERFORMANCE.md](../docs/PERFORMANCE.md).

## 9. Extension points

| To add | Touch |
| --- | --- |
| A size, layout or product | [SPECIFICATIONS.md](../docs/SPECIFICATIONS.md) → *Changing specifications* |
| An occasion theme | `src/data/themes.ts` (colours, patterns from `PAT`, fonts, greetings); new artwork goes in `engine/patterns.ts` |
| A font | `src/data/fonts.ts`, then `npm run fetch:fonts` for desktop |
| An export format | `engine/printPages.ts` (`pagesOf`), `engine/export.ts` (`buildPack`), `ExportFormat` type, `PrintPane` |
| A setting | `SettingsDialog.tsx`; keep values in `localStorage` via a small module like `lib/pexels.ts` |
| An AI provider | [AI.md](../docs/AI.md) → *Adding a provider* |
| An agent tool | The tool file for its job in `src/agent/` (schema + handler; `tools.ts` lists them in order), then document it in [MCP.md](../docs/MCP.md); `npm test` runs every tool |
| A prompt template | `src/ai/prompts/*.ts` (bump the version string); MCP workflow prompts in `src/agent/prompts.ts` |
| A desktop menu command | `MenuAction` (`platform/desktop.ts`), `ACTIONS` (`platform/menu.ts`), template in `electron/main.cjs` |
