<div align="center">

<img src="public/favicon/icon-512.png" alt="Chitthi Studio logo: a round seal reading चिट्ठी, Chitthi Print Studio" width="200" height="200" />

# Chitthi Studio

**Your photos, made into postcards, calendars and prints, Instagram posts, Reels and YouTube videos.**

Indian festival, birthday and season themes · print-ready PDFs with bleed and crop marks · Instagram photos with text,
stickers and drawings · a video editor for Reels and vlogs · runs entirely on your device, in the browser or as a
desktop app

[![Release](https://img.shields.io/github/v/release/RVicky172/Chitthi?label=release)](https://github.com/RVicky172/Chitthi/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-7a4a2b)](LICENSE)
![Platforms](https://img.shields.io/badge/platforms-web%20%C2%B7%20Windows%20%C2%B7%20macOS-7a4a2b)
![No backend](https://img.shields.io/badge/backend-none%3A%20photos%20stay%20on%20your%20device-2a241e)

<img src="docs/screenshots/studio-postcard.webp" alt="The Chitthi studio: a Diwali postcard with a photo of a lit diya in an arch, the six steps on the left and the live preview on the right" width="900" />

</div>

## Contents

[Highlights](#highlights) · [Screenshots](#screenshots) · [Get started](#get-started) · [AI writing and pictures](#ai-writing-and-pictures) ·
[AI agents (MCP)](#ai-agents-mcp) · [Performance monitor](#performance-monitor) · [Features in detail](#features-in-detail) ·
[Documentation](#documentation) · [Development](#development) · [Privacy and data](#privacy-and-data) · [License](#license)

## Highlights

- **Four products, 34 print sizes, 47 layouts.** Postcards (4×6 in, A6, India Post, Instax…), wall and desk
  calendars for any year, framed prints with a mat, and fridge magnets, square, rounded or round.
- **Made for India.** 25 occasions with drawn artwork and wishes in English, Hindi, Hinglish and regional scripts;
  46 fonts covering Devanagari, Gurmukhi, Gujarati, Bengali, Tamil, Malayalam, Kannada, Telugu and Odia; calendars
  mark national days and festivals from the Government of India holiday lists.
- **Print-shop ready.** One click makes a ZIP with the print PDF (bleed and crop marks), sheet PDFs, 300 dpi PNGs, a
  print spec, a quote request and a matching envelope with a fold-your-own template.
- **Smart photos.** Every photo is analysed for shape, colour, light and sharpness; the library ranks photos for
  each slot, auto-arranges them and centres crops on the subject. Free Pexels photos come with their credits.
- **See it before you print.** 3D preview of every design and envelope, a print-colours soft proof, and a page with
  every paper size in 3D at true scale.
- **Optional AI, your own key.** Greetings, calendar captions and slot-shaped artwork from Claude, OpenAI, Gemini,
  a local Ollama and 12 more services.
- **Works with AI agents.** The desktop app is an MCP server with 34 tools; a Claude Code plugin adds six workflow skills.
- **Private by design.** No account and no server: photos, designs and keys never leave the device.

## Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/home.webp" alt="Home page: 'Your photos, made to hold' with a postcard, calendar, envelope and magnet" /><br /><sub><b>Home</b>: every picture is a real Chitthi render</sub></td>
    <td width="50%"><img src="docs/screenshots/studio-calendar.webp" alt="Calendar studio: style presets, year field and a January page with festivals marked" /><br /><sub><b>Calendars</b>: five styles, any year, festivals marked by name</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/ai-writing.webp" alt="Front step with the Write with AI panel: language, tone, notes and Suggest" /><br /><sub><b>Write with AI</b>: greetings sized to the layout, in your language</sub></td>
    <td><img src="docs/screenshots/print-step.webp" alt="Print step: print pack, photo credits and print settings" /><br /><sub><b>Print</b>: one print pack with bleed, credits and a quote request</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/photo-library.webp" alt="Photo library with filters by shape, colour, light, mood and quality, and a match score per photo" /><br /><sub><b>Photo library</b>: ranked for each slot, with print sharpness</sub></td>
    <td><img src="docs/screenshots/viewer-3d.webp" alt="3D preview of the Diwali postcard, turned at an angle" /><br /><sub><b>3D preview</b>: turn, flip and zoom any design or its envelope</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/paper-3d.webp" alt="Paper sizes in 3D: every size on a cutting mat with a real design, and the details of Classic 4x6 in" /><br /><sub><b>Paper sizes in 3D</b>: every size at true relative scale</sub></td>
    <td><img src="docs/screenshots/perf-monitor.webp" alt="Studio with the performance monitor open: main thread load, input delay, frames, memory, photos and storage" /><br /><sub><b>Performance monitor</b>: CPU, memory and responsiveness, live</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/phone-dark.webp" alt="The studio on a phone in the dark theme: a Holi postcard with the product switcher, stage and photo dock" width="260" /><br />
  <sub><b>On a phone, in the dark theme</b>: the whole studio from 360 px wide, with secondary actions in a More menu</sub>
</p>

## Get started

**Use it:**

- **Desktop app** (Windows, macOS): download the installer from
  [GitHub Releases](https://github.com/RVicky172/Chitthi/releases). It works offline, updates itself, and adds
  real CPU and memory figures to the performance monitor and the MCP server for AI agents.
- **Web app:** deploy the Docker image (below) or run it from source.

**Run it from source** (Node.js 20.19+ or 22.12+):

```bash
npm install
npm run dev              # web app at http://localhost:5173
npm run desktop:dev      # desktop app with hot reload (run `npm run fetch:fonts` once first)
```

**Deploy the web app** (nginx, non-root, read-only file system):

```bash
docker compose up -d --build     # http://localhost:8080, health check at /healthz
```

Put it behind an HTTPS reverse proxy: the service worker (offline use) needs HTTPS. Bump `APP_CACHE` in
`public/sw.js` with each release so returning visitors get the new version. Desktop releases are built by GitHub
Actions when a `v*` tag is pushed. Every script and the release process: [docs/BUILD.md](docs/BUILD.md).

**Free photo search** needs a free [Pexels](https://www.pexels.com/api/) API key, entered in **Settings** and kept on
the device only. For development, put `PEXELS_API_KEY=…` in `.env.local` and the dev server proxies searches. Licence
rules and a production proxy recipe: [docs/PEXELS.md](docs/PEXELS.md).

## AI writing and pictures

AI is optional and off until you choose a service in **Settings → AI**:

1. Under **Keys and services**, paste an API key and press **Save and test**, or run [Ollama](https://ollama.com) or
   LM Studio on your computer for free, private writing.
2. Choose the service and model that **Writes words** and the one that **Makes pictures**.
3. Optionally set daily **Limits** (200 writing and 30 picture requests by default), so a mistake can't run up a bill.

Then use **Write with AI** (greeting, quote, signature), **Write captions with AI** (all twelve calendar months from
their festivals), **Write the message with AI** (back of a postcard) and **Create a picture with AI** (in its own section of the Photos step: artwork in the
shape of the selected photo slot, with no people or lettering, credited as AI in the app, the print pack and the
printed credit line).

Each service bills your own account. Keys stay on your device: in browser storage on the web, encrypted by the
operating system in the desktop app, where the page can never read them back. Black Forest Labs, Replicate and
Ideogram refuse browser calls, so they work in the desktop app only. Details: [docs/AI.md](docs/AI.md).

## Photo & video studio

**Photo & video studio** (`#/instagram`; **Tools** on the site pages, **More** in the print studio) is an editor with
a tool rail, a canvas stage, an inspector and a timeline, in three modes:

- **Instagram photos**: up to 20 photos in one Instagram format (4:5, 1:1, 3:4, 1.91:1 or 9:16, 1080 px wide), batch
  size 2, 4, 10 or any number up to 20. Crop, rotate, filter and adjust each photo; add text in any of the app's fonts,
  shapes that hold words, emoji stickers and freehand drawing, moved, resized and turned right on the photo. Export
  JPEG or PNG files or a ZIP, or tap **Share to Instagram** on a phone, with your caption copied.
- **Reels & Shorts**: photos and video clips become a vertical MP4 for Instagram Reels and YouTube Shorts.
- **YouTube video**: load your clips and edit a 16:9 vlog, saved straight to a file and ready to upload.

The video timeline is direct: drag clips to reorder, drag their edges to trim, drag text and stickers to time them,
slide the music by its waveform, split and delete with S and Delete, zoom with Ctrl + wheel. Exports are H.264 MP4
with AAC sound and fast start, made on your device.

**Browser or desktop.** Video work in a browser tab is limited by its memory, so the browser handles Reels up to 90
seconds and YouTube videos up to 15 minutes at 1080p and 30 fps. The **desktop app is the full studio**: videos up to
3 hours, 1440p and 4K, 60 fps, files up to 50 GB, written straight to disk and encoded with your graphics card.
Details: [docs/MEDIA-STUDIO.md](docs/MEDIA-STUDIO.md).

## AI agents (MCP)

The desktop app is an [MCP](https://modelcontextprotocol.io) server with 34 tools, 5 workflow prompts and 5
resources: an agent can create designs, write the words, find Pexels photos or create pictures, check print quality,
render previews and export print packs, PDFs and quote requests.

In **Claude Code**, the plugin adds the server and six skills (festival postcard, year calendar, print quote, photo
sourcing, AI artwork, print samples):

```text
/plugin marketplace add RVicky172/Chitthi
/plugin install chitthi@chitthi
```

When asked, give the app's path (Windows: `%LOCALAPPDATA%\Programs\Chitthi Studio\Chitthi Studio.exe`, macOS:
`/Applications/Chitthi Studio.app/Contents/MacOS/Chitthi Studio`), then ask, for example, *"Make a Diwali postcard for my Nani in
Hindi with a Pexels photo and export the print pack"*. Files go to **Documents/Chitthi agent output**.

Other ways to connect:

- **Headless server only:** `claude mcp add chitthi -- "<path to Chitthi>" --mcp`
- **Live, in the open window:** turn on **Settings → AI → Let an agent work in this open window** and copy the command
  shown there; every change appears in the studio and can be undone.
- **Claude Desktop, VS Code, Cursor**, the tool reference and the security model: [docs/MCP.md](docs/MCP.md).

## Performance monitor

Open **More (⋯) → Performance monitor** in the studio (or search "performance" in **Find a feature**; **View →
Performance monitor** on desktop). A small panel shows, once a second while it is open:

| | Web | Desktop |
| --- | --- | --- |
| CPU | Main-thread load, estimated from long tasks (browsers don't report CPU) | Real CPU of every Chitthi process |
| Responsiveness | Input delay and frames per second | same |
| Memory | JavaScript heap (Chromium) | Whole-app memory, per process |
| Photos | Decoded photo memory and what the undo history holds | same |
| Page | Elements on the page, storage used | same |

Figures turn amber or red past sensible thresholds, and **Copy report** exports two minutes of samples as JSON to
compare runs or attach to an issue. What each figure means and the app's memory budgets:
[docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## Features in detail

<details>
<summary><b>Products, sizes and layouts</b></summary>

| Area | What you get |
| --- | --- |
| **Postcards** | 4×6 in, A6, India Post, 5×7, 6×9, 6×11 in, DL, square, Instax Mini / Square / Wide, A5, A4, custom. 25 layouts, including offset block, diagonal duo, scrapbook, film strip, minimal, twin arches and frosted glass. Postal back with message, address, PIN boxes and stamp box |
| **Calendars** | A4, A3, A5 desk, tabloid, 12×12 in, for **any year**. 12 months from any start month, a single month, or the whole year on one page. 9 layouts, including Frosted glass, Big number and Arch window. National days and festivals marked in red with their names (Government of India holiday lists for 2026 and 2027; fixed national days for any year), plus your own birthdays and anniversaries. Five ready-made styles; month title, dates and grid fully adjustable; a caption per month. Every page uses the same title size and a five-row grid, so the months line up when bound. Year-at-a-glance back |
| **Photo frames** | 4×6 up to 11×14 in, A4, A3, square. Thin, classic or wide mat. Single, caption, pair, triptych, grid and feature layouts. Dedication label for the back |
| **Fridge magnets** | 2×2, 2×3, 3×3, 3×4, 2.5×3.5, 4×6 in with rounded corners, 58 and 75 mm round button magnets. Full photo, caption, mini Polaroid, badge, two and four photo, and words-only layouts. Many to a sheet |
| **Envelopes** | The smallest standard size each design fits (C6, A7, DL, square…), dressed in the same occasion with a photo seal and the address; a print-on-envelope PDF and a fold-your-own template in every print pack; viewable in 3D |

</details>

<details>
<summary><b>Photos, words and occasions</b></summary>

| Area | What you get |
| --- | --- |
| **Occasions** | 16 festivals, 5 birthday styles and 5 seasons with drawn artwork and wishes in English, Hindi, Hinglish and regional scripts, or plain colours |
| **Smart photos** | Each photo is analysed once for shape, colour, brightness, contrast, sharpness and where its subject is. The library sorts by relevance to the selected slot with a match score, filters by colour, light, mood and print quality, and search understands words like *blue*, *warm* or *sky*. **Auto-arrange** and **Fill empty slots** place the best matches |
| **Photo editing** | Crop (free, 1:1 … 16:9, or the exact shape of the slot), rotate, mirror, zoom, drag, colour looks, print sharpness in dpi |
| **Free photos** | Pexels search from the Photos step with ideas from the occasion, product and month, filtered to the slot's shape. Follows the Pexels guidelines: linked credits everywhere, a `PHOTO-CREDITS.txt` in print packs, the hourly limit respected, and a warning before selling an unaltered photo |
| **Words** | 46 font families plus **your own fonts** (TTF, OTF, WOFF, WOFF2). Every text field has its own font: greeting, quote, signature, Instagram tag, message, From line, address, PIN, labels, captions, month titles and dates |

</details>

<details>
<summary><b>Print, preview and quotes</b></summary>

| Area | What you get |
| --- | --- |
| **Print files** | Print-shop PDF with bleed and crop marks; sheet PDFs (A4, A3, 13×19 in, Letter) lined up for double-sided printing; 300 dpi PNGs with dpi metadata; a print pack ZIP with a `PRINT-SPEC.txt`. A **print colours** soft proof shows how bright screen colours come out on paper |
| **Print quotes** | A specification PDF for print shops with paper, weight, finish and blank price grids, and a `QUOTE-REQUEST.pdf` in every print pack. From the gallery, one quote for several designs: an `ORDER-SHEET.csv`, a request each, the catalogue and the credits in one ZIP ([docs/print-quote](docs/print-quote/README.md)) |
| **3D preview** | Spin and flip any design or envelope. Calendars as a ring of twelve months or a wall calendar you page through |
| **Paper sizes in 3D** | Every size on a cutting mat at true relative scale with a real design, side by side, stacked or imposed on a print sheet, plus an **Actual size** view |
| **Sizes and layouts guide** | Every size with trim, bleed and safe area drawn to scale, pixel sizes, sheets per page, and every layout with the pixels each photo slot needs |

</details>

<details>
<summary><b>The studio</b></summary>

- Six steps (Photos, Layout, Occasion, Front, Back, Print) made of collapsible sections, with Collapse all / Expand all.
- **Find a feature** (`Ctrl+K` / `⌘K`) jumps straight to any setting or action.
- Gallery with sample designs, backup and restore, `.chitthi` design files, undo and redo, autosave.
- Warm cream light theme and grey dark theme with a saffron accent, both WCAG AA; full screen; offline support.
- Works from 1920 px down to 360 px wide: secondary actions fold into a **More** menu rather than overflowing.

| Key | Action |
| --- | --- |
| `Ctrl+K` / `⌘K` | Find a feature |
| `Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y` | Undo, redo |
| `Ctrl+S` | Save to gallery |
| `F` | Flip the card |
| Arrow keys, `+` / `−` | Move and zoom the photo in the selected slot |
| `Ctrl+,` (desktop) | Settings |

</details>

## Documentation

| Document | Contents |
| --- | --- |
| [HLD](docs/HLD.md) | High-level design: context, deployment, building blocks, key flows, storage, security, decisions |
| [LLD](docs/LLD.md) | Low-level design: modules, data model, store, rendering, export, responsive layout, styles, IPC |
| [PERFORMANCE](docs/PERFORMANCE.md) | The performance monitor, memory and CPU budgets, how to investigate a slowdown |
| [TECHNOLOGIES](docs/TECHNOLOGIES.md) | The stack and why each piece is used |
| [BUILD](docs/BUILD.md) | Scripts, web and Docker build, desktop packaging, releasing |
| [DESKTOP](docs/DESKTOP.md) | Desktop app: differences from web, data folder, signing, updates |
| [SPECIFICATIONS](docs/SPECIFICATIONS.md) | Print specifications, where they live, adding sizes, layouts and products |
| [PEXELS](docs/PEXELS.md) | The Pexels connection, API key, proxying, licensing |
| [MEDIA STUDIO](docs/MEDIA-STUDIO.md) | The photo & video studio: Instagram formats and limits with sources, layers, the timeline, Reels and YouTube export, browser vs desktop |
| [AI](docs/AI.md) | AI services, web vs desktop, keys and privacy, limits, credits, adding a provider |
| [MCP](docs/MCP.md) | The MCP server and plugin, tools, resources, prompts, security |
| [OPERATIONS](docs/OPERATIONS.md) | Running the web app in production: container, TLS and HSTS, headers, upgrade, rollback |
| [RELEASE](docs/RELEASE.md) | Release checklist, signing, and what to do when a release goes wrong |
| [TESTING](docs/TESTING.md) | The five test suites, what each covers, and how to add tests |
| [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) | Fixes for common problems with photos, saving, printing and installing |
| [ACCESSIBILITY](docs/ACCESSIBILITY.md) | Accessibility target, what is checked, known limits |
| [Print quotes](docs/print-quote/README.md) | Ready-to-send specification and quote PDFs for printers |
| [Claude Code plugin](plugins/chitthi/README.md) | The plugin and its skills |
| [SECURITY](SECURITY.md) · [PRIVACY](PRIVACY.md) | Reporting vulnerabilities; what data goes where |
| [CONTRIBUTING](CONTRIBUTING.md) · [CHANGELOG](CHANGELOG.md) | How to contribute; what changed in each release |

## Development

```text
src/
  main.tsx, App.tsx     Entry, screens (home / studio / sizes guide / paper sizes in 3D), routing, shortcuts
  types.ts              Shared types (Design, Photo, Layout, SizeDef, …)
  data/                 Specifications as data: products, sizes, layouts, themes, fonts, samples
  engine/               Framework-free: layout, rendering, photo processing, PDF / PNG / ZIP export
  state/                App store with undo/redo and autosave, user actions, photo slots, photo store
  lib/                  Storage, fonts, Pexels client, performance sampler, downloads, ZIP, toasts
  ai/                   AI service, prompt templates, provider adapters (loaded on demand), keys, transport
  agent/                Agent tools, MCP prompts and resources, and the page side of the MCP bridge
  platform/             Desktop bridge and menu commands
  components/           React UI: pages, studio, panes, stage, dialogs, 3D views, menus, performance monitor
  styles.css, styles/   The stylesheet, split by feature (numbered files keep the cascade order)
electron/               Desktop main process, preload bridge, AI requests and the MCP server
plugins/chitthi/        Claude Code plugin: MCP server config and skills
public/                 Service worker, manifest, icons, sample photos, landing renders
nginx/                  Web server config, security headers and CSP
scripts/                Build checks, downloaders, generators and renderers
docs/                   Design and operations documentation, screenshots
```

| Command | What it does |
| --- | --- |
| `npm run lint` | ESLint over the app, the Electron main process and the scripts |
| `npm run build` | Type check, production bundle, and a check that the start-up script stays under 350 KB with no AI code in it |
| `npm run test:unit` | Vitest unit tests: design loading, layout geometry, where API keys may be sent |
| `npm test` | Renders every product × size × orientation × layout (front, back, envelope), builds a print pack per product, and checks saved designs, festival dates, credits, AI (against a fake provider), every agent tool and the performance sampler, inside Electron |
| `npm run test:mcp` | Runs the MCP server end to end with the official MCP client |
| `npm run test:e2e` | Playwright browser tests of the production build at desktop and phone sizes, with an axe accessibility check |
| `npm run mcp` | The MCP server from source |

## Privacy and data

Designs, the photo library, uploaded fonts, settings and AI keys stay on the device: IndexedDB and `localStorage` in
the browser, JSON files in the app's data folder on desktop ([PRIVACY.md](PRIVACY.md) has the full policy). Nothing
syncs between devices; move designs with **Gallery → Back up gallery / Restore a backup**, or as `.chitthi` files.
The only network calls are fonts (web), Pexels search, the AI service you chose, and update checks (desktop). A
self-hosted deployment that uses a custom AI service must add its host to `connect-src` in
`nginx/security-headers.conf`.

## License

Chitthi is free for everyone to use, copy, change and share, including commercially, under the [MIT License](LICENSE).
Third-party parts (fonts, icons, libraries, sample photos) keep their own licences: see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Designs and files you make with Chitthi are yours.
