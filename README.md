y

# Chitthi – Postcard Studio (React 19.2 + TypeScript)

Design postcards and Instax-style prints for Indian festivals, birthdays and seasons, then download files that go straight to a printer.

Everything runs in the browser. There is no backend; photos never leave the user's device.

## Run with Docker

```bash
docker compose up -d --build
```

Open http://localhost:8080.

Without Compose:

```bash
docker build -t chitthi-postcard-studio .
docker run -d --name chitthi -p 8080:8080 --read-only --tmpfs /tmp chitthi-postcard-studio
```

The image builds the app with Node 22, then serves it from an unprivileged nginx on port 8080. `GET /healthz` returns `ok` and is used by the Docker health check. To use another port, change the left side of the mapping, for example `-p 3000:8080`.

## Develop locally

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck  # strict TypeScript check
npm run build      # production build in dist/
npm run preview    # serve dist/ on http://localhost:8080
```

## Project structure

```
src/
  main.tsx              Entry: loads fonts, mounts <App>, registers the service worker
  App.tsx               Shell, keyboard shortcuts, start-up effects
  styles.css            All styles (light and dark)
  types.ts              Shared types (Design, Photo, Theme, Layout…)
  data/                 Static data: sizes, themes and wishes, fonts, layouts
  engine/               Framework-free drawing and export code
    color.ts              Colour maths and small drawing helpers
    patterns.ts           Procedural occasion artwork (diyas, toran, rangoli…)
    design.ts             Defaults, card size, theme resolution
    layout.ts             Photo slots and text zones for the 18 layouts
    render.ts             Draws the front and back of a card onto a canvas
    photo.ts              File checks, crop / rotate / looks at full resolution
    export.ts             Print PDF, sheet PDF and 300 dpi PNG (jsPDF, lazy-loaded)
  state/
    store.ts              Small external store (useSyncExternalStore), undo/redo, autosave
    actions.ts            User actions: themes, photos, export, gallery, backup
  lib/                  Fonts loader, IndexedDB, downloads, toasts
  components/           React UI: header, step rail, stage, panes, crop tool, 3D viewer
public/                 Service worker, web manifest and icons
nginx/                  Server config and security headers
```

## Features

- **Sizes:** 4×6 in, A6, India Post card, 5×7 in, 6×9 in, 6×11 in, DL, square, Instax Mini, Square and Wide, A5, A4 and custom; horizontal or vertical
- **Occasions:** 16 festivals, 5 birthday styles and 5 seasons with drawn artwork and wishes in English, Hindi, Hinglish and regional scripts, or a plain card with your own colours
- **Layouts:** 18 layouts with vertical and horizontal versions, previewed with your own photos
- **Photos:** file type and size checks with clear messages; crop, rotate, mirror, zoom, drag to position; looks (vivid, warm, cool, black & white, vintage); print-sharpness check in dpi
- **Text:** 46 font families including Gurmukhi, Gujarati, Bengali, Tamil, Malayalam, Kannada, Telugu and Odia
- **Back of card:** message, address lines, PIN code boxes and stamp box
- **Print files:** print-shop PDF with bleed and crop marks; sheet PDF (A4, A3, 13×19 in, Letter) lined up for double-sided printing; PNG at 300 dpi
- **Also:** 3D preview, gallery with backup and restore, undo and redo, automatic saving of the current card including photos, offline support

Keyboard shortcuts: Ctrl+Z undo, Ctrl+Shift+Z redo, Ctrl+S save to gallery, F flip the card.

## Where user data lives

Saved designs, the current card and settings stay in each user's own browser (IndexedDB and localStorage). Clearing browser data removes them, and they don't sync between devices. Users can move designs with **Gallery → Back up gallery / Restore a backup**. Backups from the earlier single-file version can be restored too.

## Internet access and HTTPS

Fonts load from Google Fonts; the first visit needs internet, and after that the service worker keeps the fonts that were used. Browsers only allow the service worker on HTTPS or `localhost`, so put the container behind a reverse proxy with HTTPS (Nginx, Caddy, Traefik) when deploying to a domain.

## Updating

After changing the code, bump `APP_CACHE` in `public/sw.js` (for example `chitthi-app-v5`) so returning users get the new version, then rebuild:

```bash
docker compose up -d --build
```
# Chitthi
