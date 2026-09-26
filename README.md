# Chitthi – print studio

Design **postcards**, **calendars**, **framed prints** and **fridge magnets** from your own photos, with Indian
festival, birthday and season themes, then download print-ready files: PNGs and PDFs with bleed and crop marks, plus
a print specification for the shop.

Chitthi runs entirely on the user's device, in the browser or as a desktop app for Windows and macOS. There is no
backend and photos are never uploaded.

- **Web:** a static site (Docker image with nginx included).
- **Desktop:** download the installer from [GitHub Releases](https://github.com/RVicky172/Chitthi/releases). It
  works offline and updates itself.

## Features

| Area | What you get |
| --- | --- |
| **Postcards** | 4×6 in, A6, India Post, 5×7, 6×9, 6×11 in, DL, square, Instax Mini / Square / Wide, A5, A4, custom. 24 layouts, including modern ones (offset block, diagonal duo, scrapbook, film strip, minimal, twin arches). Postal back with message, address, PIN boxes and stamp box |
| **Calendars** | A4, A3, A5 desk, tabloid, 12×12 in. 12 months from any start month, a single month, or the whole year on one page (**Year strip**). Words above the month or on the photo, **a caption per month**, month titles left or centred, dates in the corner or centred, rows / boxes / no lines, a separate month font, and a font and weight for the dates and weekday names. Every page uses the same title size and a five-row grid, so the months line up when bound. Year-at-a-glance back |
| **Photo frames** | 4×6 up to 11×14 in, A4, A3, square. Thin, classic or wide mat. Single, caption, pair, triptych, grid and feature layouts. Dedication label for the back |
| **Fridge magnets** | 2×2, 2×3, 3×3, 3×4, 2.5×3.5, 4×6 in with rounded corners, 58 and 75 mm round button magnets. Full photo, caption, mini Polaroid, badge (lettering around the photo), two and four photo, words-only layouts. Many to a sheet |
| **Occasions** | 16 festivals, 5 birthday styles and 5 seasons with drawn artwork and wishes in English, Hindi, Hinglish and regional scripts, or plain colours |
| **Smart photos** | Every photo is analysed once (shape, colour, brightness, contrast, sharpness and where its subject is). The library sorts by **relevance** to the selected slot, shows a match score, filters by colour, light, mood and print quality, and search understands words like *blue*, *warm*, *sky* or *bright*. **Auto-arrange** puts each photo in the slot that suits it and centres each crop on its subject; **Fill empty slots** picks the best matches from the library |
| **Photo library** | **Photos** in the top bar: every photo on the device, with upload, crop, take off and delete. Filters by shape, source and use, and **"Fits this slot"** shows the photos whose shape suits the selected slot of the current layout, each with its print sharpness there. The strip under the preview adds, removes and crops photos too |
| **Photos** | Upload with clear checks, crop (free, 1:1 … 16:9, or the exact shape of the slot), rotate, mirror, zoom, drag, colour looks, print-sharpness in dpi |
| **Free photos** | Search **Pexels** from the Photos step, with ideas from the occasion, product and calendar month, filtered to the shape of the selected photo slot. The API key is entered in **Settings** |
| **Words** | 46 font families including Devanagari, Gurmukhi, Gujarati, Bengali, Tamil, Malayalam, Kannada, Telugu and Odia, plus **your own fonts** (TTF, OTF, WOFF, WOFF2) kept on the device for every design. Instagram tag |
| **Envelopes** | A matching envelope for every design: the smallest standard size it fits (C6, A7, DL, square…), dressed in the same occasion with a photo seal, the address, and the Chitthi logo stamp as the product mark on the back. Exported with the print pack as a print-on-envelope PDF and a fold-your-own template, and viewable in 3D with the flap opening and the card sliding out |
| **Sizes and layouts guide** | A page with every size of every product, filtered by shape (square, rounded, round), scale and search: trim, bleed and safe area drawn to scale, pixel sizes, how many fit on a sheet, and every layout at that size (filtered by photo count and words) with the pixels each photo slot needs |
| **Print quotes** | A specification PDF for print shops with every category, sample designs, paper, weight, finish and finishing, every size with bleed and sheet counts, and blank price-per-piece grids; every print pack also carries a `QUOTE-REQUEST.pdf` for that design. See [docs/print-quote](docs/print-quote/README.md) |
| **Print files** | Print-shop PDF with bleed and crop marks; sheet PDF (A4, A3, 13×19 in, Letter) lined up for double-sided printing; PNG at 300 dpi with dpi metadata; a print pack ZIP with a `PRINT-SPEC.txt` |
| **3D preview** | Spin and flip any design. Calendars also show all twelve months as a ring, or as a wall calendar you page through |
| **Studio** | Every step is made of collapsible sections that remember whether they're open, with Collapse all / Expand all. **Find a feature** (Ctrl+K / ⌘K, or Find in the header) jumps straight to any setting or action. **Full screen** from the header, the home page or the finder |
| **Also** | Gallery with sample designs, backup and restore, `.chitthi` design files, undo / redo, autosave, warm cream light theme and grey dark theme with a saffron accent, offline support |

Keyboard: `Ctrl+K` find a feature, `Ctrl+Z` undo, `Ctrl+Shift+Z` / `Ctrl+Y` redo, `Ctrl+S` save to gallery, `F` flip the card, arrow keys and
`+` / `−` move and zoom the photo in the selected slot. On desktop, `Ctrl+,` opens Settings.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

With Docker:

```bash
docker compose up -d --build     # http://localhost:8080, health check at /healthz
```

Desktop app from source:

```bash
npm run fetch:fonts    # once: offline fonts for the desktop build
npm run desktop:dev    # Vite + Electron with hot reload
```

All scripts, the Docker image, the desktop build and the release process are described in
[docs/BUILD.md](docs/BUILD.md).

## Pexels photo search

The key is never built into the app. Users enter their own free key in **Settings** (gear icon in the studio header
or on the home page; **File → Settings** on desktop). It is tested, then kept on that device only. For development,
put `PEXELS_API_KEY=…` in `.env.local` (see `.env.example`). The dev and preview servers then proxy searches and add
the key on the server side. Details, security and a production proxy recipe: [docs/PEXELS.md](docs/PEXELS.md).

## Documentation

| Document | Contents |
| --- | --- |
| [docs/HLD.md](docs/HLD.md) | High-level design: context, deployment views, building blocks, key flows, storage, security, decisions |
| [docs/LLD.md](docs/LLD.md) | Low-level design: modules, data model, store, layout and rendering algorithms, export, storage, IPC |
| [docs/TECHNOLOGIES.md](docs/TECHNOLOGIES.md) | The stack and why each piece is used |
| [docs/BUILD.md](docs/BUILD.md) | Scripts, web and Docker build, how the app runs, desktop packaging, releasing |
| [docs/PEXELS.md](docs/PEXELS.md) | How the Pexels connection works, the API key, proxying, licensing, troubleshooting |
| [docs/print-quote/](docs/print-quote/README.md) | Ready-to-send specification and quote PDFs for printers, and the paper per category |
| [docs/SPECIFICATIONS.md](docs/SPECIFICATIONS.md) | Print specifications, where they live, how to add sizes, layouts and products; generated size tables |
| [docs/DESKTOP.md](docs/DESKTOP.md) | Desktop app: differences from web, data folder, signing, updates |

## Project structure

```text
src/
  main.tsx, App.tsx     Entry, screens (home / studio / sizes guide), routing, shortcuts
  types.ts              Shared types (Design, Photo, Layout, SizeDef, …)
  data/                 Specifications as data: products, sizes, layouts, themes, fonts, samples
  engine/               Framework-free: layout, rendering, photo processing, PDF / PNG / ZIP export
  state/                App store with undo/redo and autosave, user actions, photo slots, photo store
  lib/                  Storage, fonts, Pexels client, downloads, ZIP, toasts
  platform/             Desktop bridge and menu commands
  components/           React UI: landing, studio, panes, stage, dialogs, 3D viewer, sizes guide, settings
electron/               Desktop main process and preload bridge
public/                 Service worker, manifest, sample photos
public/favicon/         Every icon of the product (SVG sources, PNG sizes, .ico); see its README
public/showcase/        Landing page examples, pre-rendered as small WebP files (npm run build:showcase)
showcase-src/           Source photos for those examples (Pexels; not shipped)
nginx/                  Web server config, security headers and CSP
scripts/                Sample photo and font downloaders, spec-table generator
docs/                   Design and operations documentation
```

## License

Chitthi is free for everyone to use, copy, change and share, including commercially, under the [MIT License](LICENSE).
Third-party parts (fonts, icons, libraries, sample photos) keep their own licences: see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Designs and files you make with Chitthi are yours.

## Where user data lives

Designs, the photo library, uploaded fonts, the current card and settings stay on the user's device: IndexedDB and `localStorage` in
the browser, JSON files in the app's data folder on desktop. Nothing syncs between devices. Designs move with
**Gallery → Back up gallery / Restore a backup**, or as single `.chitthi` files.

## Internet access and HTTPS

Fonts load from Google Fonts on the web (bundled on desktop). After the first visit the service worker keeps the app
and the fonts it used, so the web app works offline. Service workers only run on HTTPS or `localhost`, so deploy the
container behind an HTTPS reverse proxy. Photo search needs internet access to Pexels.

## Updating a deployment

Bump `APP_CACHE` in `public/sw.js` with each release so returning users get the new version, then:

```bash
docker compose up -d --build
```

Desktop releases are built by GitHub Actions when a `v*` tag is pushed ([docs/BUILD.md](docs/BUILD.md#releasing-a-new-version)).
