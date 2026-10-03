# design-sync notes – Chitthi

Chitthi is an app, not a published component library. The sync ships it through a small library entry.

## Build

- Library entry: `src/index.ts` (re-exports components + the store/actions/helpers; never mounts the app – `src/main.tsx` does that and must never be bundled). Config `entry` points at it; esbuild bundles the TS directly.
- Types: `npm run build:lib` (`tsconfig.lib.json`) emits `.d.ts` to `dist-lib/types`; `package.json` `types` points there. **Re-run it before every sync** when source changed – the converter reads component props from those `.d.ts` files.
- Converter: `node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --out ./ds-bundle` (no `--entry` flag needed; it's in config).
- Render check / capture: no playwright browser download needed – install the `playwright` npm package into `.ds-sync` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and run with `DS_CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"` (Windows machine with Chrome).
- Windows/Git-Bash: long heredocs containing some characters fail to parse (`unexpected EOF`); write scripts with the editor and run them from a file.
- CSS: `src/styles.css` is only an ordered list of `@import`s of `src/styles/NN-*.css`. The converter copies
  `cssEntry` as-is (it does not inline imports), so `cssEntry` is `dist-lib/styles.css`, the flattened copy that
  `npm run build:lib` writes (`scripts/flatten-css.mjs`). Run `build:lib` before every sync, or the upload ships a
  stylesheet whose imports point at files that aren't there (every card unstyled).
- UI fonts come from the Google Fonts `@import` at the top of `src/styles.css` (moved there from `index.html` so designs get them too). Card fonts (46 families) load at runtime via `installFontLinks()` – no `@font-face` to ship. validate prints `[FONT_REMOTE]` for Geist/Hind/Mukta: expected.

## Previews

- Every store-driven preview starts with the clean-state reset (`localStorage.clear(); indexedDB.deleteDatabase('chitthi'); replaceCard(productDesign('postcard'), [], null)`). Capture reuses ONE page for all cards and the store persists to localStorage/IndexedDB, so without it a card inherits the previous card's design/photos and grades churn.
- Store setup happens at module top of the preview (before render); one cell per store-driven card (cells in one card share the store).
- `App` preview needs a full-height flex column wrapper and `location.hash = '#/studio'`; without the height the stage grows to ~2300px and the card is drawn off-screen.
- `Rail` needs a viewport ≥ 860px wide (below that the app's phone media query turns it horizontal) → override viewport `1000x660`.
- `Toast` is `position: fixed`; wrap it in a `transform: translateZ(0)` box so it stays inside the card.
- `samplePhoto()` (src/engine/sample.ts) is a canvas-backed Photo; it defines `naturalWidth/naturalHeight` on the canvas so CropDialog and colour looks work with it.
- `PhotoThumb` draws a fixed 116px canvas – don't clip it in a smaller box.
- Capture runs with a frozen clock (dates show May 2024 in gallery/calendar cards): expected.
- Docs: full usage docs for store-driven components and category-only stubs for primitives/icons/thumbs live in `.design-sync/docs/` (`docsDir`). Pane components keep the `panes` group from their src dir.

- `SampleGallery` is excluded (`componentSrcMap: null`): it loads the Pexels photos from the app's `public/samples/` (via `samples.json`), which is not part of the design-system upload, so in Claude Design it can only show its "not included" state. `Landing` falls back to painted `samplePhoto()` art there for the same reason (expected).
- AI previews (`AiWordsEntry`, `AiArtworkEntry`, `SettingsDialog`) seed `localStorage['chitthi-ai']` (a words and a picture service) and `localStorage['chitthi-ai-keys']` with the fake key `preview-key`, so the panels show their ready form instead of "choose a service". Nothing is sent unless someone presses Write/Create in Claude Design (which then fails on the fake key: expected). `AiWordsEntry` has no open prop: its `OpenPanel` cell clicks the button in a `useEffect`.
- The AI panels are `React.lazy` in the app; esbuild's IIFE bundle inlines them (and the Anthropic SDK) into `_ds_bundle.js`, so the bundle is larger than the app's start-up chunk. Expected.
- `PexelsSearch` renders its no-key state (a key and the network are needed to search); `PhotoLibrary` seeds the IndexedDB library with `storePhotos` and opens with `setUI` after the store resolves.
- `Section`, `YearField`, `PhotoCredit` need `cardMode: column` (their stories are wider than a grid cell).
- Icons are Lucide (`lucide-react`) since the clean-studio redesign; brand logos aren't in Lucide, so `InstagramIcon` stays hand-drawn in `icons.tsx`.

## Known render warns

- `[FONT_REMOTE]` Geist/Hind/Mukta – fonts load from Google Fonts at runtime (intended).

## Re-sync risks

- `src/index.ts` is hand-maintained: a new component or store action must be added there or it won't reach `window.Chitthi`. Not exported on purpose: `Landing3D` pieces, `PostmarkYear` (inside `EnvelopeSection`), `AiWords`/`AiArtwork`/`AiSettings` (reached through the entries and `SettingsDialog`), `StepLabel`, `SampleGallery`.
- `conventions.md` names colours, classes and setters by hand: after a visual redesign re-check it (the 2.5.0 sync found it still describing the old sky-blue theme and a removed `.products` class).
- AI previews depend on the `chitthi-ai` / `chitthi-ai-keys` storage format (`src/ai/settings.ts`, `src/ai/secrets.ts`) and provider ids `anthropic` / `openai`.
- `dist-lib/types` is gitignored build output – stale `.d.ts` (forgot `npm run build:lib`) silently ships old prop contracts.
- `cfg.dtsPropsFor` hand-writes props for `Seg`, `ThemeTile`, `LayoutThumb`, `PhotoThumb`, `PaneIcon` (generic/cross-file types). If those components' props change, update the config.
- Docs in `.design-sync/docs/*.md` describe store fields and UI text by hand (e.g. Viewer3D bar buttons, FontPicker categories) – re-check them when those components change.
- Previews depend on theme ids (`diwali`, `holi`, `bday`, `monsoon`, `parents`…), layout ids and `samplePhoto`; renaming any breaks the preview build (`! preview build failed`).
- Card fonts load from Google Fonts at runtime (network); an offline capture would render canvases in fallback fonts.
