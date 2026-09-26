# Technologies

Chitthi is a client-side app: all design, rendering and file generation runs on the user's device. The stack is
kept small on purpose. The one runtime library besides React is jsPDF, and it is only loaded when a PDF is made.

## Application

| Technology | Version | Used for | Why |
| --- | --- | --- | --- |
| **TypeScript** | 5.9 | All app code, strict mode | One typed `Design` model shared by UI, renderer and export; the compiler finds every place a new product or layout must be handled |
| **React** | 19.2 | UI components | `useSyncExternalStore` for the app store, `useDeferredValue` so thumbnails redraw at low priority |
| **Canvas 2D API** | browser | Every card face, thumbnail and print file | One renderer for preview and print: what you see is exactly what prints. Resolution-independent (drawn in mm × pixels-per-mm) |
| **jsPDF** | 4.2 | Print PDF and sheet PDF | Loaded with `import()` only when exporting, so it costs nothing at start-up |
| **lucide-react** | 1.48 | Interface icons | One consistent 24 px line icon set |
| **Google Fonts** | — | 46 card font families (Latin, Devanagari, Gurmukhi, Bengali, Tamil, …) and the UI fonts | Loaded on demand per family (`src/lib/fonts.ts`); bundled offline in the desktop app |
| **IndexedDB** | browser | Gallery, photo store, current card's photos (web) | Holds large data-URL photos that don't fit in `localStorage` |
| **localStorage** | browser | Current design, per-product last design, settings (Pexels key, search on/off, theme) | Small, synchronous values |
| **Service Worker** | browser | Offline use of the web app, font caching | `public/sw.js`, network-first for pages, cache-first for hashed assets |
| **CSS** | — | One stylesheet, light and dark themes via custom properties | No CSS framework; `color-mix`, container-friendly grids, `prefers-reduced-motion` handled |
| **CSS 3D transforms** | browser | 3D viewer: card flip, ring of months, wall calendar, opening envelope | No WebGL dependency; images are the rendered faces |
| **FontFace API** | browser | Fonts the user uploads | Registers stored font files so the canvas draws with them; no server needed |

Hand-written helpers instead of libraries: ZIP writer with CRC-32 (`src/lib/zip.ts`) for the print pack, PNG `pHYs`
chunk injection so printers read the dpi (`src/engine/export.ts`), procedural festival artwork
(`src/engine/patterns.ts`), colour maths (`src/engine/color.ts`).

## External services

| Service | Used for | Required? |
| --- | --- | --- |
| **Pexels API** (`api.pexels.com`, `images.pexels.com`) | In-app photo search; sample gallery photos (downloaded at build time) | Optional. See [PEXELS.md](PEXELS.md) |
| **Google Fonts** | Card and UI fonts on the web | Web: first visit. Desktop: no (bundled) |
| **GitHub Releases** | Desktop installers and auto-update feed | Desktop updates only |

There is no Chitthi backend, account system or analytics.

## Build and tooling

| Technology | Version | Used for |
| --- | --- | --- |
| **Node.js** | 20.19+ / 22.12+ (CI: 22) | Build tooling, scripts. `npm run docs:specs` needs 22.18+ (runs `.ts` directly) |
| **Vite** | 8.3 | Dev server with hot reload, production bundle, dev/preview proxy for Pexels |
| **@vitejs/plugin-react** | 6.1 | JSX / React Fast Refresh |
| **tsc (project references)** | 5.9 | `npm run typecheck`; `tsconfig.lib.json` emits `.d.ts` for the design-system sync |

## Desktop

| Technology | Version | Used for |
| --- | --- | --- |
| **Electron** | 44 | Windows and macOS app; serves `dist/` from a private `app://chitthi` origin with a strict CSP |
| **electron-builder** | 26 | NSIS installer (Windows x64), DMG + ZIP (macOS x64 and arm64), `.chitthi` file association |
| **electron-updater** | 6.8 | Auto-updates from GitHub Releases (`latest.yml`, `latest-mac.yml`) |

## Delivery

| Technology | Used for |
| --- | --- |
| **Docker** (multi-stage) | `node:22-alpine` builds, `nginxinc/nginx-unprivileged:1.27-alpine` serves on port 8080, read-only root file system |
| **nginx** | Static hosting, long-lived caching of hashed assets, security headers and CSP (`nginx/`) |
| **GitHub Actions** | `.github/workflows/desktop-release.yml`: builds both desktop platforms in parallel on a `v*` tag and publishes one release |

## Browser support

Current Chrome, Edge, Firefox and Safari. The app relies on Canvas 2D (`roundRect`, `letterSpacing` where available,
with fallbacks), `<dialog>`, IndexedDB, `ResizeObserver` and CSS `:has()`. HEIC photos from iPhones must be
converted to JPG first, because browsers can't decode HEIC.
