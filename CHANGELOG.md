# Changelog

Notable changes to Chitthi, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/). Each release's tag message has the full detail.

## [Unreleased]

### Added

- Photo editor: **Light** (exposure, contrast, highlights, shadows, whites, blacks) and **Colour** (temperature, tint,
  saturation) controls, with an eyedropper that sets the white balance from something grey or white in the photo.
  Exposure, white balance and the tone sliders work in linear light, like a camera, and run on the graphics card.
- Photo editor: **Tone curve** (RGB, red, green and blue, usable with the keyboard) and **Colour mixer** (hue,
  saturation and luminance for eight colour bands).
- Photo editor: **Detail** (sharpening with radius and masking, noise reduction) and more **Effects** (clarity,
  dehaze, grain), sized to look the same in the preview and the exported photo.
- Photo and video editors: **Presets and LUTs**. The looks are built-in presets, and **Import .cube** adds 3D LUTs
  (up to 65³) with an amount slider. Imported LUTs stay on the device until removed.
- Photo and video editors: **saved presets**. Save a photo's colour settings under a name, apply them in one click or
  to every photo of the batch, rename and delete them, and move them between devices as a preset file that carries
  the LUTs they use.
- Photo editor: **masks**. Paint where a set of settings applies (exposure, contrast, highlights, shadows, whites,
  blacks, temperature, tint, saturation, clarity, dehaze, sharpening, noise reduction) with a brush that has size,
  feather, flow and erase; invert, switch off and combine brush parts. Masks move, turn and mirror with the photo.
- Photo editor: **gradient and range masks**. Linear and radial gradients with handles on the photo, and colour and
  brightness ranges picked by clicking the photo; every setting also has a slider, so masks can be shaped from the
  keyboard.
- Photo and video editors: **image layers** (logos, frames, textures), a **blend mode** on every layer, and **layer
  masks** (a fade or a spot within the layer).

- Licensing policy for libraries, models and assets (`docs/LICENSING.md`) and `npm run check:licenses`, which runs in
  CI and before release builds.
- Planning folder (`docs/planning/`) with the editor roadmap and its implementation plan.
- README: every feature of both studios, requirements, web vs desktop, and screenshots of the photo & video studio.

### Changed

- Home page: Chitthi Studio as one studio for what you print and what you post. A new hero, the two studios side by
  side, a section per platform (Instagram posts and carousels, Reels and Shorts, YouTube) with its sizes, limits and
  formats beside the real editor, and the photo editor's new tools; the print sections follow under "Print studio".
- Photo & video studio: looks and colour sliders run on the graphics card (WebGPU, or WebGL2), with the same pixels as
  before: about 4× faster per frame on WebGPU and 2× on WebGL2. On by default; **Settings → Photo & video effects**
  turns it off. Browsers without GPU access keep the previous path.
- Photo and clip edits keep their colour settings in their own object, ready for curves, masks and LUTs (no visible
  change).
- Dependencies: React 19.3, lucide-react 1.51, TypeScript 7 for type checking and builds (about 10× faster; 5.9 stays
  only for typescript-eslint), Node 26 for CI, releases and the Docker build, nginx 1.31 in the web image, and the
  GitHub Actions on their Node 24 versions (checkout 7, setup-node 7, upload-artifact 7, download-artifact 8,
  action-gh-release 3).
- Print studio: the steps after Photos load when first needed, so the app starts with less to download (start-up
  script 326 KB, from 338 KB, even with React 19.3).

### Fixed

- Video editor: the browser limit for Reels showed as "2 minutes" instead of 90 seconds.

## [2.8.0] - 2026-10-02

A new look: Graphite themes, a redesigned print studio and home page, and a Hand-tinted photo look. Includes the 2.7.0
changes below, which were not published on their own.

### Added

- **Hand-tinted** photo look in the print studio and the photo & video studio: black and white on warm paper, with
  thin washes of colour kept only where the photo is strongly coloured, like a hand-painted studio photograph.
- Home page: a scroll journey from a photo to a card in the post, built from real Chitthi renders (no video); a product
  explorer with real examples, sizes and layouts; and a print-ready tool that draws any postcard size to one scale with
  bleed, trim and safe area, its pixels at 300 dpi and the print-pack file names.
- Home page: a section for the photo & video studio (Instagram posts, Reels and Shorts, YouTube videos).

### Changed

- Graphite light and dark themes across the app: warm-neutral greys, near-black actions in light mode and near-white in
  dark mode, a marigold highlight on the preview. Red is used only for errors and the airmail stripe. WCAG AA throughout.
- Headings use Schibsted Grotesk, bundled with the app so it also shows offline.
- Print studio: one flush layout with hairline dividers, a numbered step list, flat buttons, and crop marks around the
  card on a matte preview.
- Site navigation: the tool pages are plain links, the page's sections are in one "On this page" menu, and an airmail
  stripe runs under the bar.
- App icon: a graphite tile with a cream ring and a marigold चिट्ठी (browser tab, home screen and desktop app).
- Examples, gallery samples and photo search suggestions no longer show or suggest photos of people: places, festivals,
  flowers and objects only.

## [2.7.0] - 2026-10-01

Chitthi Studio: the photo & video studio (Instagram photos, Reels & Shorts, YouTube videos), and production hardening.

### Security

- Content Security Policy (web and desktop): `media-src 'self' blob:` and `worker-src 'self' blob:` for the video
  editor's local playback and encoder. `vite preview` now serves the production policy, so the browser tests run under it.
- Desktop: Electron fuses set in the packaged app: `NODE_OPTIONS` and `--inspect` are ignored, and the app archive is
  integrity-checked and the only place app code loads from. `RunAsNode` stays on for the MCP stdio relay.
- Desktop: every permission request (camera, microphone, notifications, location…) is refused except fullscreen and
  copying to the clipboard.
- Desktop: IPC calls are accepted only from the app's own page.
- Desktop: AI requests for Ollama and LM Studio may go only to this computer, and a custom service only to the base URL
  saved with its key, so the main process can't be used to fetch other sites.
- Desktop: reading a photo by file path (`agent:readPhoto`) works only while an agent is connected.
- AI requests that carry a key no longer follow redirects, so key headers can't be forwarded to another host.
- Web: AI keys are kept for the current tab unless "Remember on this device" is ticked.
- Docker: `.env` files and build output are no longer sent to the image build; base images pinned by digest; nginx
  1.27 → 1.30.
- Electron 44.4.5 → 44.5.1.

### Changed

- **The app is now Chitthi Studio** (was "Chitthi – Postcard Studio"): web title, desktop app, installers
  (`Chitthi-Studio-Setup-*.exe`, `Chitthi-Studio-*.dmg`), Docker image `chitthi-studio`, package `chitthi-studio`.
  The desktop app keeps its data in the same folder as before. MCP clients need the new app path
  (`%LOCALAPPDATA%\Programs\Chitthi Studio\Chitthi Studio.exe`, `/Applications/Chitthi Studio.app/...`).
- **Photo & video studio redesign**: an editor layout with a top bar (modes, undo, format, Export), a tool rail, a
  tool panel, a dark canvas stage, an inspector and a dock; export in a sheet; drag to reorder photos.

### Added

- **Interactive timeline** for video: a time ruler, filmstrips on clips, drag to reorder, drag edges to trim, one row
  per layer with draggable timing, music waveform with drag to slide the song, a draggable playhead, snapping, Ctrl +
  wheel zoom and Fit, split / duplicate / delete, keyboard shortcuts.
- **YouTube video** mode: 16:9 at 1080p (and 1440p, 4K in the desktop app), 30 or 60 fps (desktop), YouTube's
  recommended bitrates, saved straight to a chosen file with fast start; long videos stream to disk with constant
  memory, and sound is mixed in 10-second windows.
- **Desktop app as the full video studio**: Reels up to 3 minutes, YouTube videos up to 3 hours, 500 clips, 50 GB
  files, 60 fps, 4K, streaming saves through the main process. The browser editor says what it can't do and why.
- **Instagram photos** (`#/instagram`): up to 20 photos per batch (presets 2, 4 and 10, editable up to 20), edited for
  Instagram's formats (4:5, 1:1, 3:4, 1.91:1, 9:16 at 1080 px) with crop, zoom, rotate, mirror, filters, brightness,
  contrast, saturation, warmth and vignette, "apply to all", JPEG or PNG export as files or a ZIP, and sharing to the
  Instagram app through the system share sheet with the caption copied. Plan for video in docs/MEDIA-STUDIO.md.
- **Photo editor layers** on Instagram photos: text (six styles, any font, outline, background, shadow), shapes that
  hold words (box, label, circle, speech bubble, burst, ribbon) plus star, heart, arrow and line, 40 emoji stickers,
  and freehand drawing (pen, marker, highlighter, neon). Drag, resize, turn, reorder, hide, duplicate and delete on the
  preview; copy layers to every photo; undo and redo (Ctrl+Z / Ctrl+Y).
- **Reels & Shorts** video editor: photos and video clips on a timeline (up to 20 clips, 90 seconds),
  trim and split, pan and zoom, fades, framing and colour per clip, timed text, shapes, stickers and drawings, music
  with volume and start point; live preview; MP4 export (H.264 30 fps, AAC 48 kHz, fast start) in 9:16, 4:5 or 1:1,
  shared to Instagram or saved. Encoding uses Mediabunny (MPL-2.0), loaded only on export.
- AI pictures have their own **Create pictures with AI** section in the Photos step, apart from the Pexels search.
- Site navigation: the page links are grouped under **Explore** and the tool pages (sizes guide, paper sizes in 3D,
  photo & video studio) under **Tools**, on every site page, so the bar never overflows; below 1100 px both fold into
  **Menu**, with dividers between groups.
- Error screen with **Reload** and **Copy error report** instead of a blank page after a render error; recent errors
  are included in the performance monitor's report.
- CI on every pull request (lint, type check, build, unit tests, self-test, MCP smoke test, Docker image), CodeQL and
  Dependabot. Workflow actions pinned by commit SHA.
- ESLint (`npm run lint`), Vitest unit tests (`npm run test:unit`) and Playwright browser tests with an accessibility
  check (`npm run test:e2e`).
- SECURITY.md, PRIVACY.md, CONTRIBUTING.md, this changelog, and docs for operations, releasing, testing,
  troubleshooting and accessibility; issue and pull request templates.

## [2.6.0] - 2026-09-30

- Responsive header and navigation from 1920 to 360 px, with a More menu and one shared site nav.
- Performance monitor: CPU per process (desktop), main-thread load, input delay, frames, memory, storage; Copy report.
- Memory guards: undo history capped at 320 MB of photo canvases, lighter sample gallery, capped search caches.
- Stylesheet split into feature files.

## [2.5.0] - 2026-09-30

- AI writing and pictures with your own key: 16 services, daily limits, credited AI pictures.
- Desktop keys encrypted with the OS key store and sent only to each provider's listed hosts.
- MCP server in the desktop app (34 tools, 5 prompts, 5 resources), headless or live, and a Claude Code plugin.

## [2.4.0] - 2026-09-28

- Rebuilt calendar styles, festivals and your own dates, fonts for every text field.
- Paper sizes in 3D at true relative scale.
- Multi-design quote packs, print-colour preview, Pexels compliance (credits, rate limit, licence notice).

## [2.3.0] - 2026-09-26

- Photo dock with slot suggestions and drag to swap; faster photo library with thumbnails; interactive 3D view.

## [2.2.0] - 2026-09-26

- Photo analysis and auto-arrange, six new postcard layouts, envelopes, print specification and quote PDFs, new
  landing page, MIT License.

## [2.1.0] - 2026-09-26

- Calendar text zones and year strip, 3D year views, fridge magnets, Pexels photo search.

## [2.0.0] - 2026-09-25

- Desktop app for Windows and macOS (Electron) with auto-updates from GitHub Releases.

[Unreleased]: https://github.com/RVicky172/Chitthi/compare/v2.7.0...HEAD
[2.7.0]: https://github.com/RVicky172/Chitthi/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/RVicky172/Chitthi/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/RVicky172/Chitthi/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/RVicky172/Chitthi/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/RVicky172/Chitthi/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/RVicky172/Chitthi/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/RVicky172/Chitthi/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/RVicky172/Chitthi/releases/tag/v2.0.0
