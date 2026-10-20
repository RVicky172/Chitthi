# Changelog

Notable changes to Chitthi, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/). Each release's tag message has the full detail.

## [Unreleased]

### Added

- Video editor: **Recordings** in the Audio panel. Every voice take is listed, newest first, with its length, when it
  was recorded, the microphone it was recorded with and where it is used ("Voice at 0:12", "Not used"). Choose one to
  select it on the timeline, play it alone, rename it (with its clips, one undo step), add it again at the playhead or
  delete it (asking first when it is used). New takes keep when and with which microphone they were recorded, saved
  with the project on the device.
- Video editor: **Music, Voice and Effects** are told apart everywhere: each kind has its own colour on the track
  headers and the timeline's sound clips, and its name on a chip in the Audio panel and the sound inspector; the media
  pool names a sound by the kind of track it is used on.
- Video editor: a **media pool**. The Media panel lists every video, photo, sound file and voice recording in the
  project with a thumbnail (or waveform), its length and how often it is used; filter by kind and search by name.
  Files imported there wait in the pool until you put them on the timeline: double-click, Enter or **+** places one at
  the playhead (sound on the Music track, a recording on a Voice track), or drag it onto a track. Remove takes a file
  out of the project, asking first when clips use it (they go too; undo brings everything back). The pool is saved
  with the project, unused files included.
- Video editor: **voice-over recording**. **Record voice** in the Audio panel (or the record button on a Voice
  track, or Shift + R) counts in, plays the video from the playhead and records your voice onto a Voice track; Stop,
  Space or the end of the video ends the take. The take is an ordinary sound clip, in sync with the picture (a
  Recording offset per microphone fixes hardware that misreports its delay), and a take over earlier sound on the
  track replaces just that part (punch-in), as one undo step. Choose the microphone, watch the level meter (Too
  loud), turn on Voice clean-up, hear the video on headphones, pick a count-in of Off, 3 or 5 s. The microphone is on
  only while the recording controls are open, and recordings stay on the device. A take is saved every second, so if
  the app closes mid-take the project offers to recover it. Works in the browser and the desktop app (which now asks
  macOS for the microphone; the web app's Permissions-Policy allows the microphone for its own page only).
- Video editor: **Add sound** takes WebM sound files (`.webm`, `.weba`), such as a voice take saved as a file.
- Photo and video studios: **saved projects**. Every photo post and video is saved as you work (2 s after a change,
  and at once when the tab is hidden or the app closes; the top bar says Saved / Saving… / Not saved: why). The
  **Projects** button lists them with New, Open, Rename, Duplicate and Delete; opening a studio reopens the last one,
  and the home screen has **Continue**. In the browser media is copied once into the site's own storage; the desktop
  app uses your files where they are and never copies, moves or deletes them, with **Find file…** for files that
  moved. Deleting a project frees the media no other project uses; one project is open in one window at a time.
  Agent tools: `list_projects`, `new_project`, `open_project`, `rename_project`, `delete_project`.
- Video editor: **overlay tracks** for picture-in-picture and B-roll. Add a track with **+** at the top left of the
  timeline (up to 4 picture tracks in the browser, 8 in the desktop app); drop photos or videos on a track's row, or on
  the time ruler for a new track; drag a clip up or down to another track, or use **Move to**. Higher tracks are drawn
  on top; each overlay track can be renamed, moved up or down, deleted, hidden, muted and locked.
- Video editor: place a clip on the preview: drag its box to move it (snapping to the centre lines and edges), its
  corner to resize, its top handle to turn it; arrow keys move it 1 % (Shift: 10 %). The inspector's **Position and
  size** has Full frame, four corner presets, and X, Y, size, rotation, opacity and corner radius fields. The export
  draws exactly what the preview shows.
- Video editor: **keyframes**. Animate a clip's position, size, rotation, opacity and corner radius, its sound
  volume, and a layer's position, size, turn and opacity: press the diamond next to a value in the inspector, move the
  playhead, change the value. Interpolations: Linear, Ease in, Ease out, Ease in and out, Hold. The selected clip or
  layer shows its keyframes in a lane on the timeline (drag, Delete, a menu for the interpolation); K sets keyframes
  at the playhead, Alt + [ / ] jump between them. The export matches the preview frame for frame, sound included.
- Video editor: **transitions** between clips: Cross-dissolve, Dip to black or white, Wipe and Slide (four
  directions) and Zoom, from **Transitions** in the tool rail or by clicking a cut on the timeline; **Apply to every
  cut**; drag a transition's edges to change its length (0.1–3 s). They are centred on the cut and play the clips past
  their ends, so the video's length never changes; the sound cross-fades with them. The export matches the preview.
- Video editor: **speed**. In the clip inspector's Speed group, set a video clip's speed from 0.1× to 10× (presets
  0.25×–4×), play it in **Reverse**, or give it a **speed ramp** (Montage, Hero, Bullet, Jump cut, Flash in, Flash out,
  or your own curve of 2–10 points). **Freeze frame** (the transport, or Shift + F) holds the frame at the playhead for
  2 s. The clip keeps its part of the video and changes length; Magnetic moves the clips after it. The sound keeps its
  pitch from 0.5× to 2× and is silent otherwise, reversed or ramped. Clips at speed show a badge on the timeline; the
  export matches the preview frame for frame.
- Video editor: the number of videos on screen at once is limited (3 in the browser, 5 in the desktop app); an edit
  that would show more says so.
- Video editor: **audio tracks**. Up to 8 tracks (Music, then Audio 2 …), each with a role (Music, Voice, Effects),
  a volume up to 200 %, Mute, Solo (preview only) and Lock. **Add sound** puts several files at the playhead; sound
  clips are moved, trimmed, split, duplicated and deleted with the edit tools, and have fades (drag their top
  corners), a volume line, volume keyframes and **Play to the end of the video**. A selected sound clip has its own
  inspector.
- Video editor: **waveforms** on every sound clip and under every video clip with sound, measured in the background
  and drawn as they will be heard; silent clips say why.
- Video editor: **ducking**: **Lower music under voice** turns the music down while someone speaks in a clip or on a
  Voice track (3–30 dB, with a threshold), with the curve drawn on the music.
- Video editor: a **loudness target** for the export: YouTube · Instagram (−14 LUFS, the default for new projects),
  Quiet (−16 LUFS), a custom level or Off, with the mix's measured loudness in the Audio panel and a true-peak limiter
  at −1 dBTP. The preview plays at the same loudness as the export.

- Roadmap dashboard (development tool): copyable task briefs, phase filtering, prerequisite and dependent links,
  feature outcome summaries, the recorded update date and clearer next-task states.
- Video editor: **edit tools** on the timeline. **Roll** moves a cut between two clips without changing the video's
  length, **Slip** picks which part of a video clip plays without moving it, and **Slide** moves a clip between its
  neighbours. Pick them from the transport or with V / R / Y / U.
- Video editor: a **Magnetic** switch (on by default, as before). Switched off, deleting or trimming a clip leaves a
  **gap** and clips can be dropped at any time; gaps play and export as black with the layers on top. Shift + Delete
  and Shift-drag still ripple; switching Magnetic back on closes every gap in one undo step.
- Video editor: a **Snap** switch, and Alt held while dragging skips snapping; unsnapped moves land on a frame.
- Video editor: keyboard editing with the timeline focused: Alt + ← / → nudges the selected clip a frame with the
  current tool (Shift + Alt: a second), Q / W trim its start / end to the playhead. Each change is announced to
  screen readers.
- Video editor: a clip the browser can play but not decode frame by frame (some HEVC video, the format iPhones record
  by default) says so: **"This clip can’t be exported here"** with the reason, on the clip (tooltip and screen-reader
  name) and in the inspector. It still previews and the other clips are unaffected; convert the file to H.264 MP4 to
  export it.

### Changed

- Video editor: the **Audio panel** folds into Add sound, Record voice, Recordings, Tracks (was Sound tracks) and
  Loudness. Opening Record voice turns the microphone on and closing it turns it off; when it opens because it was the
  section used last, it shows Record voice… instead, so the microphone never turns on unasked.
- Both studios share one design (`docs/DESIGN.md`): the photo & video studio's rail and panel now match the print
  studio's widths, header and spacing. The rail can be **expanded** (icons with labels, the default) or made
  **compact** (icons only) with the button at its foot or **Ctrl + \\**, remembered for both studios. The media rail
  groups its tools under **Add** and **Edit**; in a window 720 px tall or less, Draw moves into **More**. Every panel
  starts with the same header (Add / Edit or the step number, the title and one sentence), and field borders are
  darker in the light theme and lighter in the dark one so their edges are easier to see (3:1 contrast).
- Calmer text in every studio, dialog and guide: only headings are bold. Panel and section titles are semi-bold in the
  heading face, section titles are in sentence case (no more small capitals), and labels, buttons, list items and the
  selected step or tool are medium weight, marked by their bar or fill instead. Bold in running text is kept for
  values to notice (a count, a limit, the playhead time). The web fonts load only the weights in use.
- Shorter panels: the settings in every panel and inspector of both studios fold into sections, **one open at a time**
  (Light, Colour, Detail…; Timing, Speed, Position and size…; Record voice, Sound tracks, Loudness). Each panel
  remembers the section used last, per mode, on this device; a closed section shows a short summary ("Changed", "2×",
  "Music · 2 tracks"). The panel's main action or list and the selected item's name and warnings stay in view above
  the sections. Shift + R opens Record voice and choosing a mask opens Selected mask. The print studio's steps keep
  **Collapse all**; Expand all is gone.
- A message shown twice in a row is shown (and announced) again.
- Video editor: the preview and the export decode clips through one **decoder pool**. Playback is smoother: the next
  clip is opened before its cut, so cuts no longer stall or flash black, and a late frame holds the last one while the
  playhead keeps time. Paused or scrubbing, the preview shows exactly the frame the export will encode. Exports are as
  fast as before. Decoders and decoded frames stay within fixed limits (256 MB of frames on the web, 1 GB in the
  desktop app) however many clips a project has, and are released on leaving the editor. Browsers without WebCodecs
  video decoding (Firefox before 130, Safari before 26) keep today's preview and export.
- Video editor: a clip's sound in the preview stays within a frame of its picture.

## [2.10.0] - 2026-10-06

### Added

- Settings › AI: **AI models on this device** shows whether the sky model for AI masks is downloaded (176 MB) and
  deletes it, without touching designs, photos or presets. It is downloaded again, after asking, when next needed.
- Video editor: **track headers** on the timeline. **Hide** the video track (black frames with the layers, in the
  preview and the export), **Mute** the music, **Lock** a track so its clips can't be moved, trimmed, split,
  duplicated or deleted, and choose each track's height (Small, Medium, Large). Hide, Mute and Lock can be undone.
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
- Photo editor: export as **WebP**, and **AVIF** where the browser can write it, besides JPEG and PNG.
- Photo editor: **AI masks**. **Find: Subject, Background, Sky** makes a mask from what an AI model finds in the
  photo, on the device (photos never leave it); paint over it to refine it. The subject model ships with the app; the
  sky model (176 MB) is downloaded once, only after you agree, and kept on the device.
- Photo editor: **camera RAW files** (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2 and more). The desktop app develops them
  with LibRaw in 16 bits; the web app opens the JPEG preview stored in the file.
- Photo editor: export as **TIFF (16-bit)**, keeping a RAW file's precision through every edit, wherever the graphics
  card can render in floats.
- MCP: 22 tools for the photo studio, so agents can add photos, frame them, set every colour setting (one photo or
  all), set the white balance from a point, add and shape masks, apply, save, export and import presets, import LUTs,
  look at a preview (with a mask shown) and export the batch; AI masks too (`find_with_ai` asks before the sky
  model's download).

- Licensing policy for libraries, models and assets (`docs/LICENSING.md`) and `npm run check:licenses`, which runs in
  CI and before release builds.
- Planning folder (`docs/planning/`) with the editor roadmap and its implementation plan.
- README: every feature of both studios, requirements, web vs desktop, and screenshots of the photo & video studio.
- **Documentation in the app** (`#/docs`, **Docs** in the site menu, the footer and **Find a feature**): getting
  started, the print studio, the photo and video editors, AI, questions and fixes; and for developers, AI agents and
  their use cases, self-hosting, building and extending. Works on phones, with the keyboard and screen readers.
- README: use cases, the advanced photo editor, AI masks, RAW and 16-bit TIFF, 56 agent tools; every screenshot remade
  from the current app by `npm run screenshots` (new: AI masks, the documentation).

### Changed

- Video editor: a project is now made of tracks with clips at a start time, the groundwork for the multi-track
  timeline; videos look and sound exactly as before (checked frame by frame against 2.x). The Music row is as tall as
  the Video row (64 px).
- CI runs once per release instead of on every pull request and push to `main`: the Desktop release workflow runs
  every check (lint, licences, build, unit, self-test, MCP, browser tests, Docker image) first, and builds and
  publishes the installers only if they pass; a manual run is the release's dry run. Day-to-day checks are local.
  CodeQL still scans pull requests.
- Spec-driven development: engineering docs moved from `docs/` to `specs/` (HLD → `architecture.md`, LLD →
  `lld.md`, TECHNOLOGIES → `tech-stack.md`, TESTING → `testing-strategy.md`, `licensing.md`, `build.md`,
  `release.md`), the editor plans from `docs/planning/` to `specs/vision/`, with a constitution, workflow, roadmap,
  feature templates, `/spec-*` commands and a committed `memory/` folder. `docs/` keeps the product and user docs.
  New `npm run check` (typecheck, lint, unit tests).
- Site nav (home, guides, docs): redrawn. Both studios are in the bar as a pair of buttons (**Print studio** and
  **Photo & video**, **Print** and **Post** on phones) instead of one "Open studio"; a light/dark theme switch; the
  bar and its airmail edge span the window; links and tools fold into the Menu in two steps, so the bar never
  crowds. On tablets and phones the home page opens on its headline and buttons, with the scroll demo below.
- Home page: the photo editor's newer tools (AI masks, presets, RAW, 16-bit TIFF) and up-to-date screenshots.

- Home page: Chitthi Studio as one studio for what you print and what you post. A new hero, the two studios side by
  side, a section per platform (Instagram posts and carousels, Reels and Shorts, YouTube) with its sizes, limits and
  formats beside the real editor, and the photo editor's new tools; the print sections follow under "Print studio".
- Photo & video studio: looks and colour sliders run on the graphics card (WebGPU, or WebGL2), with the same pixels as
  before: about 4× faster per frame on WebGPU and 2× on WebGL2. On by default; **Settings → Photo & video effects**
  turns it off. Browsers without GPU access keep the previous path.
- Photo and clip edits keep their colour settings in their own object, ready for curves, masks and LUTs (no visible
  change).
- Dependencies: React 19.3, lucide-react 1.51, TypeScript 7 for type checking and builds (about 10× faster; 6.0 stays
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

[Unreleased]: https://github.com/RVicky172/Chitthi/compare/v2.10.0...HEAD
[2.10.0]: https://github.com/RVicky172/Chitthi/compare/v2.8.0...v2.10.0
[2.8.0]: https://github.com/RVicky172/Chitthi/compare/v2.7.0...v2.8.0
[2.7.0]: https://github.com/RVicky172/Chitthi/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/RVicky172/Chitthi/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/RVicky172/Chitthi/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/RVicky172/Chitthi/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/RVicky172/Chitthi/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/RVicky172/Chitthi/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/RVicky172/Chitthi/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/RVicky172/Chitthi/releases/tag/v2.0.0
