# Photo & video editor: implementation plan

Status: **in progress**: Phase 0 is done and merged; Phase 1's work items are all done (12 of 12); its gate is still to confirm. Written 3 October 2026
against version 2.8.0; this page is updated as each item lands. It turns [editor-roadmap.md](editor-roadmap.md) (the
what and why) into work items: which files change, in what order, how each step is tested, and what must be true before
the next phase starts. Every library it adds goes through [licensing.md](../licensing.md) first.

## Progress

> Since 6 October 2026 work follows the spec-driven workflow ([workflow.md](../workflow.md)): Phase 2 and 3 items
> become features `2xx` / `3xx` in [roadmap.md](../roadmap.md), which tracks their status; their spec, plan and
> tasks live in `specs/features/`. The tables below stay as the original breakdown and the record of Phases 0–1.

Each work item's state is in the **Status** column of its phase table below: **Done**, **Next** (being worked on),
**To do**, or **Not needed** (with the reason in the notes). Update the column, this summary and the notes in the same
change that finishes an item.

| Phase | Done | Branch / PR | Gate | Release |
| --- | --- | --- | --- | --- |
| 0. Foundation (GPU render graph) | 9 of 9 | Merged in #18 | Met: exports match Canvas 2D on every backend; entry chunk under budget | 2.10.0 (with Phase 1; 2.9.0 was never tagged) |
| 1. Advanced photo editor | 12 of 12 | P1.1–P1.3 merged in #21; P1.4–P1.12 on `feat/editor-phase-1-continued` | To confirm: masked edits measured at 22–29 ms a frame while painting or dragging a gradient at 1080 × 1350 on the desktop app (still to check on a mid-range laptop in Chrome); RAW and 16-bit TIFF done (P1.9) | 2.10.0 |
| 2. Multi-track timeline | 0 of 12 | — | Not started | 3.0.0 |
| 3. Colour and finishing | 0 of 9 | — | Not started | 3.1.0 |

Next up: the Phase 1 gate (masked edits on a mid-range laptop in Chrome) and the first macOS release build, which compiles the Intel Mac LibRaw for the first time; then the 2.10.0 release and Phase 2. These are feature [001](../features/001-phase1-gate-release/spec.md); its hardware checks are deferred to the [roadmap backlog](../roadmap.md#backlog-unscheduled-ideas) (2026-10-06), and the measuring script for the gate is ready (`npm run measure:gate`). P1.12's tools grew with P1.8 (AI mask parts, `find_with_ai`) and P1.9 (RAW by path, TIFF export).

### Notes on finished items

What was built, decisions taken along the way, and measurements, so later work can rely on them.

| Item | State | Notes |
| --- | --- | --- |
| P0.1 Edit model split | Done | `engine/adjust.ts` (`Adjustments`, `mergeAdjust()`), `IgEdit.adjust`, `mergeEdit()`; colour edits through `adjustPhoto` / `adjustClip` |
| P0.2 GPU device layer | Done | `engine/gpu/` (`types.ts`, `webgpu.ts`, `webgl2.ts`, `device.ts`): upload, pass, present, read; explicit WebGPU bind group layouts; self-test runs every backend the machine offers. Dev-only types: `@webgpu/types` (BSD-3-Clause) |
| P0.3 Render graph | Done | `engine/gpu/graph.ts`: `GraphNode`, `runNodes()` ping-pongs pooled textures (`TexturePool`; two spares per size at first, six since P1.3). Phase 0 graphs are a straight line |
| P0.4 Shaders for today's looks | Done | `engine/gpu/colour.ts`: all 7 looks and the 4 sliders in WGSL and GLSL; `colourNodes()` builds the nodes. Kept in today's 0–255 sRGB maths, rounding to 8 bits after the look as the CPU does, so output matches; linear light arrives with Phase 1's new tools. Self-test: worst 2 levels, mean 0.041 on both backends |
| P0.5 Wire into the renderers | Done | `renderIg()` (and so `renderFrame()` and every export) runs the colour step on the GPU when the media studio has opened a device (`engine/gpu/apply.ts`), else on the CPU; any GPU failure falls back for that frame. Setting: **Settings → Photo & video effects** (`lib/gpuSetting.ts`), off by default. Layers and vignette stay on Canvas 2D. Found and fixed: the layer canvas must use the same mode on both paths, or photo edges rasterise differently |
| P0.6 Golden-image tests | Done | Self-test renders 4 real photos × 7 looks × 4 edits (fill and whole photo, blurred background, rotation, mirror, vignette) through `renderIg()` on Canvas 2D and on each backend: worst 2 levels, mean 0.067, 112 frames each on WebGPU and WebGL2. e2e: setting in Settings, photo ZIP and Reel MP4 export with it on, no console errors |
| P0.7 Loading and budgets | Done | GPU code is in the media studio's chunk; backends load with `import()`. `check-bundle.mjs` fails if shader code reaches the entry chunk |
| P0.8 Desktop frame path for big files | Not needed | Video clips are already read lazily from disk: export uses Mediabunny's `BlobSource` over the picked `File` (reads only the byte ranges it needs) and playback uses `blob:` URLs, which the browser streams. Only music is read whole, for its waveform. Revisit with proxies (P2.11) |
| P0.9 Switch over | Done | GPU effects on by default; off is remembered. Measured per 1080 × 1350 frame with a look: Canvas 2D 23–25 ms, WebGL2 11 ms, WebGPU 6 ms (self-test note) |
| P1.1 Light and white balance | Done | `engine/light.ts`: exposure, highlights, shadows, whites, blacks, temperature, tint in linear light, and the eyedropper (`neutralise()`, closed form). `LIGHT_PROGRAM` on the GPU. Look and light round to 8 bits once, together: rounding in between was magnified up to 7 levels by strong shadow lifts. Brightness and warmth were **not** remapped (no saved edits exist and remapping would change their look): they keep working and show in the photo inspector only when set. Parity: worst 2, mean 0.035 (chart) and 0.057 (photos, 140 frames) |
| P1.2 Tone curve and colour mixer | Done | `engine/curve.ts` (monotone cubic spline, 129-sample table per channel shared by CPU and GPU, so they agree by construction) and `engine/hsl.ts` (8 bands blended by hue, greys untouched). `components/ig/CurveEditor.tsx` (pointer and keyboard) and `ColourMixer.tsx`. The CPU chain moved to `engine/chain.ts`: look → light → curve → mixer, one rounding at the end; on the GPU every chain step but the last skips rounding. Curve tables travel as uniforms (98 vec4), so no float textures were needed. Parity: worst 2, mean 0.037 (chart) and 0.054 (168 photo frames) |
| P1.3 Detail and effects | Done | `engine/detail.ts` (reference and Canvas 2D path) and `engine/gpu/detail.ts`: noise reduction (5×5 bilateral), dehaze (blurred dark channel), clarity, unsharp-mask sharpening with radius and edge masking, grain (integer-hash value noise, identical on both paths). Sizes are for 1080 px wide and scale with the frame. Blurs are separable, alpha-weighted (no dark halo at a whole photo's edge), at most 33 taps. The render graph now lets a node read any earlier output (`NodeInput`), freeing textures after their last use; the pool keeps 6 spares per size (2 made every detail frame allocate). **Tolerance:** GPU intermediates are 16-bit floats (32-bit would double memory at 4K), so chained detail effects are held to 3 levels (colour-only edits stay at 2): worst 3, mean 0.061 over 252 frames. GPU cost about 1–2 ms per 1080 × 1350 frame; the Canvas 2D fallback about 0.8 s with clarity, sharpening and noise reduction |
| P1.4 Looks as presets; LUT import | Done | `data/presets.ts`: a `Preset` is a name and a partial `Adjustments`; applying one sets only what it holds, so the 7 built-in presets (the looks) keep every slider, as before. `engine/lut.ts`: our own `.cube` parser (3D only, 2–65 per side, `DOMAIN_MIN/MAX`, `LUT_3D_INPUT_RANGE`, unknown keywords skipped, `LutError` messages shown to the user), **tetrahedral** interpolation (exact for linear tables, greys stay grey), id = content hash. `Adjustments.lut` holds the id and `lutAmount` the strength (`ADJUST_VERSION` 5); tables live in memory, so edits and undo stay small, and an unloaded id counts as no LUT. The LUT runs last in the chain (look → light → curve → mixer → LUT). **Not a 3D texture:** the table is packed into a 2D RGBA16F texture (one tile per blue slice, 585 × 520 at 65³) read with `texelFetch` / `textureLoad`, so the device contract gains only `uploadData()` and both backends keep one binding kind; the pool keeps up to 4 such data textures by key (`DataInput`), so video frames don't re-upload. Found: every GPU step clamps to 0–1 as it writes, so the CPU must clamp before the LUT too, or partial amounts drift up to 20 levels after a look. Imported LUTs: own IndexedDB (`lib/userLuts.ts`, like uploaded fonts), names on open, tables on first use. Parity: worst 2, mean 0.034 (chart, incl. 17³ and 65³) and 0.059 (308 photo frames); identity LUT changes nothing on either path. Agent tools for presets and LUTs come with P1.12, as for P1.1–P1.3 |
| P1.5 Saved presets | Done | A saved preset holds the **full** `Adjustments` of the photo or clip it was saved from (choosing groups to save can come later); applying it replaces them, and it shows as applied while they match. `engine/presets.ts`: `mergePreset()` is the gate for anything stored (colour through `mergeAdjust()`, the colour part of `mergeEdit()`, so no position or crop travels in a preset); names trimmed to 60 characters and made unique ("Warm (2)"). Storage through `lib/db.ts`: IndexedDB `chitthi` v5 store `presets` on web, `library/presets/<id>.json` on desktop (new IPC `db:presetAll` / `presetPut` / `presetDel`; the main process checks id, name, shape and a 64 KB size). **Sync decided: files only** (the open decision's default). The preset file (`chitthi-presets`, version 1) carries the LUTs its presets use as base64 32-bit floats (`lutToJson` / `lutFromJson`, same checks as `.cube`, id recomputed), so a preset with a LUT works on another device; a damaged LUT is left out and its presets still load. Import skips a preset with the same name and settings. Apply to the batch: `adjustAll()` in `state/instagram.ts`, one undo step. Desktop storage checked by driving the built app with Playwright's Electron launcher (put, list, four kinds of bad record refused, delete); no self-test check, as nothing new renders |
| P1.6 Mask model and brush | Done | `engine/masks.ts`: `Mask` (name, on, invert, parts, its own `Adjustments`), parts with a kind (`brush` now), `combine` (add, subtract, intersect; the first part always adds) and invert; `mergeMasks()` the gate (16 masks, 8 parts, 400 strokes, 8,000 numbers per stroke). Masks live in `IgEdit.masks` (photo edits; clip edits carry an empty list), not in `Adjustments`, so presets and "apply to all" don't copy them. **Photo coordinates:** stroke points are shares of the photo's own width and height before turning, sizes shares of its width, so masks follow pan, zoom, rotation and mirror (`frameToPhoto()`, `photoPlace()`). **Brush:** not the drawing layers' `Stroke` after all (that one is frame-relative and drawn by Canvas 2D, whose antialiasing differs between canvases): a stroke's shape is the brush swept along its points with a smoothstep feather, one pass = the largest coverage (no build-up within a stroke), flow combines passes (m + c(1 − m), erase m(1 − c)). Rasterised in plain code at 256 / 512 / 1024 / 2048 px by how big the photo is shown, then sampled onto the frame as one byte per pixel (`frameMask()`); the Canvas 2D path reads those bytes and the GPU uploads them as an R8 texture (`uploadMask()`, new in the device contract), so both use the same mask. **Speed:** first version 67–70 ms per painted frame (an image built, upscaled and read back through Canvas 2D, and the whole stroke repainted on every move). Now the stroke's shape is kept between moves and only the new segment is swept (thinning is prefix-stable; the tail to the newest point is drawn apart), rasters are cached by the mask's parts (a slider move does no mask work, and the GPU keeps the texture), and the frame mask by placement (stage and thumbnails don't evict each other). Vitest checks the cached raster equals painting from nothing through a drag, added strokes and undo. Rendering: the picture so far with the mask's settings (colour and detail nodes) is mixed by `MASK_MIX_PROGRAM` / `maskPixels()`. Parity on 3 photos × 5 mask cases (inverted, combined parts, turned and mirrored, on a look): worst 2, 3 with detail effects, mean 0.033. Gate measurement (desktop app, Windows): 1080 × 1350 with two masks 6.2 ms WebGPU, 9.5 ms WebGL2; while painting 23–24 ms; Canvas 2D about 0.4 s. UI: **Masks** rail tool (`components/ig/MaskPanel.tsx`), red overlay and brush circle on the stage; `components/ig/Slider.tsx` now shared. Painting is pointer-only; keyboard shaping comes with gradient handles (P1.7). Agent tools in P1.12 |
| P1.7 Gradient and range masks | Done | Four more part kinds in `engine/masks.ts`, rasterised by `rasterShape()` into the same photo-space raster, so nothing changed on the GPU: **linear** (centre, angle, fade length; smoothstep from full to empty), **radial** (centre, two radii as shares of the photo's width, angle, feather; a feather of 0 still gets 1.5 raster pixels of softening), **colour range** (a picked 8-bit colour, distance in OKLab with lightness at half weight so a colour in shade still counts; range 1–100) and **brightness range** (Rec. 709 luma of the photo's sRGB values between a darkest and lightest, with soft edges). Ranges read the photo **as it is, before its settings** (`photoSample()`, cached per photo and size; OKLab per sample cached), so they don't shift while the photo is edited; their rasters are keyed by the sample. Later range parts intersect by default. **Handles:** `partHandles()` and `dragPart()` (centre moves; the end sets a linear fade's angle and length; the first radius sets width and angle, the second height; a drag off the handles draws a new gradient), drawn on the stage with the photo's turn and mirror. **Keyboard:** every gradient and range setting is a slider in the panel, and a click picks a range's colour or brightness. **Speed:** dragging a gradient rasterises a whole part per move: 34–39 ms at first; now a linear fade is only worked out in its band (rows filled outside it) and a radial one only inside its bounding box, without a square root in its core: 26–29 ms per 1080 × 1350 frame with two masks. A test checks the fast loops against the plain formulas at every pixel for 80 random gradients. Parity: 27 masked frames (gradients, ranges, turned, mirrored, inverted): worst 2, 3 with detail effects, mean 0.025 |
| P1.8 AI subject, sky and background masks | Done | A new mask part kind `ai` with a `target` (`subject`, `sky`; the background is the subject inverted). The part stays data: the model's map is kept per picture source in `engine/segments.ts` (like range parts' photo samples), `photoSample()` carries it and its version keys the caches, and `rasterShape()` reads it bilinearly into the same photo-space raster, so nothing changed on the GPU; a map not made yet draws as an empty part, so rendering never waits. `src/ai/segment/`: ONNX Runtime Web 1.30 (MIT) on WebAssembly in a module worker, one thread (the threaded build needs cross-origin isolation), loaded with `import()` on first use; maps are stretched to 0–1 as the models' reference code does (U²-Net-p peaks at 0.08 on a busy lotus photo). **Models:** U²-Net-p (Apache-2.0, 4.6 MB) bundled as a hashed asset; skyseg (MIT) turned out to be the full U²-Net, **176 MB, not 2 MB** as researched, so (decided) it is downloaded on first use after the user agrees, from a pinned Hugging Face revision, size- and SHA-256-checked, and kept in OPFS (in the desktop app that is inside its data folder; one code path, no new IPC). CSP: `'wasm-unsafe-eval'` and `huggingface.co`, `*.hf.co` (nginx and Electron); Electron serves `.wasm` as `application/wasm`. Vite: ES workers, and `onnxruntime-web` excluded from dependency pre-bundling (pre-bundling it on first use reloaded the dev page mid self-test). UI: **Find: Subject, Background, Sky** and AI parts in the Masks panel, a status line (working, download prompt with size and licence, error with Try again); painting over an AI part adds a brush part that adds (Paint) or subtracts (Erase). Export makes missing maps first and shares them with the full-size image. Agents: AI parts in `add_mask` / `set_mask_part`, which wait for the map, and `find_with_ai` with `allowDownload` for the consent step. Measured: first subject mask 1.2 s with model load (Electron, one thread); skyseg about 3 s per photo in Node. Tests: Vitest (gate, targets, raster from a map, bilinear reads, cache version, stretching, pinned models); self-test (a stand-in sky map darkens only the sky and inverts; the real U²-Net-p finds a disc in its worker; the sky model never downloads without consent; agent tools); e2e on the desktop project (real model under the production CSP, refine by painting, the sky download prompt, no request to Hugging Face, axe) |
| P1.9 RAW on desktop, 16-bit TIFF | Done | **RAW:** `electron/raw.cjs` runs LibRaw 0.22.2's own `dcraw_emu` (`-6 -g 1 1 -w -o 1 -h -Z -`: 16-bit linear, camera white balance, sRGB primaries, half size, a 16-bit PPM on stdout) on the file's **bytes**, written to a private temp folder and deleted (no path from the page is ever read); IPC `raw:available` / `raw:develop` check size (300 MB) and extension, output capped, 120 s timeout. `scripts/fetch-libraw.mjs` (`npm run fetch:libraw`, in CI and the release workflow) takes LibRaw's official Windows x64 and macOS arm64 builds and, decided, cross-compiles the Intel Mac copy from the source release with clang `-arch x86_64` (LibRaw publishes none; **untested until the release workflow runs on macOS**); all archives SHA-256-pinned; `extraResources` per `${platform}-${arch}` with LICENSE.LGPL, LICENSE.CDDL, COPYRIGHT and SOURCE.txt. The page keeps only the file: an 8-bit preview from the developed pixels (`rawToRgba8()`, averaged in linear light), and each export develops again. **Web:** the largest complete JPEG inside the file (`embeddedJpeg()`, walked marker by marker), with a note. **16-bit TIFF (decided: full 16-bit now):** `engine/deep.ts` places the photo in floats from a linear source (developed RAW, or the 8-bit file decoded; block-shrunk then bilinear), runs the same colour, detail and mask programs with every rounding left out (`colourNodes/detailNodes/maskNodes(…, deep)`, `MASK_MIX_DEEP_PROGRAM`), reads back floats (`readFloat()` and `floatTargets`, new in the device contract; WebGL2 needs EXT_color_buffer_float), and composes background (`drawBackground()`, split out of `renderIg()`) and vignette (`vignetteAt()`) by renderIg's rules; layers are added as their 8-bit difference, so every blend mode works. Since the photo studio exports at post size, the 16-bit work is at most 1080 × 1920, never the whole RAW. Our own TIFF writer (`engine/tiff.ts`), which also writes the tests' synthetic DNG (RGGB patches and a ramp, `syntheticDng()`). TIFF is offered wherever floats work, web included. Tests: Vitest (TIFF tags and strip, synthetic DNG, embedded JPEG incl. one ending the file, linear-light preview, deep nodes unrounded); self-test (half-float read-back on both backends; 16-bit vs 8-bit within 3.8 levels, mean 0.40, on softened photos away from edges, since resampling fine detail differs by method; a shadow ramp pushed 3 stops keeps 930 tones against 57); MCP smoke (synthetic DNG by path → LibRaw → 96 × 64 → 16-bit TIFF); e2e (a DNG's preview on the web, TIFF export under the production CSP) |
| P1.10 Blend modes, image layers, layer masks | Done | `engine/layers.ts`: `blend` on every layer (the 16 Canvas 2D composite operations that blend colours) and `mask` (`LayerMask`: parts from `engine/masks.ts`, positioned in shares of the layer's own box, so it moves, turns and grows with the layer). A masked layer is drawn on a frame-size scratch canvas, cut with its mask (`frameMask()` with the layer box as the "photo", then `destination-in`), and laid on with its opacity and blend; so its opacity becomes a group opacity, and anything drawn outside its box (a drawing's glow) is cut. **ImageLayer** (`image` id, `h`, `name`): pictures kept in memory per session by id (`addLayerImage()`), downscaled to 2048 px, so undo snapshots and "copy layers to every photo" stay small, like the batch itself. **Scope:** layer masks offer a fade (linear) and a spot (radial), shaped by sliders (`PartSettings`, shared with the Masks panel); brush and range parts on layer masks are left for later (the model accepts them). Layers stay on Canvas 2D (not the GPU graph), as before, so the "golden images" are self-test checks of known pixels: multiply and screen against their formulas, a fade from full to none and turned with its layer, inverted, and an image layer in place. Shared with the video editor's layer panel |
| P1.11 Export formats | Done (web formats) | `engine/photoExport.ts`: JPEG, PNG, WebP, AVIF. `canvas.toBlob()` silently writes PNG for a type it can't, so each type is probed once with a 2 × 2 canvas and every export checks the type it got (`encodePhoto()` throws otherwise). The Export panel lists only what this browser writes and resets a remembered choice it can't; quality applies to every lossy type. Measured: Chromium (e2e) and the desktop app write JPEG, PNG and WebP; AVIF is hidden in both. **16-bit TIFF moves to P1.9**: it only makes sense with RAW's 16-bit pixels, and the writer belongs with that pipeline |
| P1.12 Agent tools and docs | Done | `src/agent/photoTools.ts`: 21 MCP tools for the photo studio (22 since P1.8 added `find_with_ai`), in the same registry as the print tools (shared helpers moved to `agent/common.ts`): the batch (`get_photo_batch`, `add_batch_photo`, `remove_batch_photo`, `set_photo_options`, `frame_photo`), colour (`adjust_photo` for one photo or `all`, with the schema built from `ADJUST_RANGES`; partial tone curves and colour mixers merge into the photo's own; `white_balance_from_point`, the eyedropper), masks (`add_mask`, `edit_mask`, `set_mask_part`, `remove_mask`; brush strokes as point lists in photo shares), presets and LUTs (`list_presets`, `apply_preset`, `save_preset`, `delete_preset` with `confirm`, `export_presets` / `import_presets`, `list_luts`, `import_lut` from `.cube` text or an https URL), and output (`render_photo_preview`, optionally with a mask in red; `export_photos`). Every value goes through `mergeAdjust`, `mergeMasks` (only the changed mask, so the others keep their cached rasters) or `mergeEdit`; unknown settings are reported back. "All photos" with per-photo merging is one undo step (`adjustEach()` in `state/instagram.ts`). LUTs and preset files travel as text, so no new IPC reads files by path. Self-test: every tool on a generated photo, checked in pixels (exposure brightens, a linear mask darkens only its side and inverts, the mask shows red, the white balance neutralises the picked colour, a red–blue swap LUT applies) and in data (clamping, partial curve and mixer, presets in and out with their LUT, export at 1080 × 1080 PNG, tool errors for unknown ids). MCP smoke: a sample photo by path, colour, a radial mask, a preview, a preset and the export over stdio. Video clip tools come with P2.12 |

## How the work is organised

- **Four phases, released at their gates.** Phases 0 and 1 → 2.10.0 together (2.9.0 was never tagged), Phase 2 →
  3.0.0 (the project format changes), Phase 3 → 3.1.0. A phase ends at its gate (see the roadmap); the next one doesn't start until it passes.
- **Work items are small pull requests** into the phase branch, each with its tests, MCP tool changes and docs. The
  IDs (P0.1, P1.4 …) are used in commit messages and the CHANGELOG.
- **Behind a setting until the gate.** New rendering runs behind `settings.gpu` (off by default) until it matches the
  Canvas 2D output; new editor tools appear only when their engine is complete.
- **Same rules as today.** Engines stay free of React (`src/engine/`); preview and export share one code path; stores
  keep their own undo; loaded data goes through a validator (as `mergeDesign()` does for print designs); the entry
  chunk stays under 350 KB; CSP changes go in both `nginx/security-headers.conf` and `electron/main.cjs`; every IPC
  handler uses `electron/ipc.cjs` and validates its arguments.

- **Free for everyone.** Chitthi stays open source under MIT with no subscription, paid tier, licence key, account or
  usage limit added by us. No work item adds a payment check, a locked feature or a "pro" edition. Desktop-only items
  are limited by technology, not price. A dependency that would need a paid or per-user licence is replaced (see
  [licensing.md](../licensing.md)).

### Definition of done for every work item

1. `npm run lint`, `typecheck`, `build`, `test:unit`, `test`, `test:mcp`, `test:e2e` and `check:licenses` pass.
2. Pure logic has Vitest tests; anything that renders has a self-test check (`src/dev/selftest.ts`).
3. The feature is reachable by agents: a tool in `src/agent/tools.ts` (or an extended one), covered by the self-test.
4. Docs updated: [MEDIA-STUDIO.md](../../docs/MEDIA-STUDIO.md) for behaviour, [lld.md](../lld.md) for structure,
   [licensing.md](../licensing.md) and THIRD_PARTY_NOTICES.md for any new dependency, CHANGELOG.
5. Works at phone width, with keyboard and screen reader (axe passes); respects `prefers-reduced-motion`.
6. Errors that are caught and shown to the user call `logError('handled', e)`.

## Phase 0: Foundation (GPU render graph)

Goal: the same pixels as today, produced by a GPU pipeline both editors share. Nothing new is visible to users.

| ID | Status | Work item | Files | Tests |
| --- | --- | --- | --- | --- |
| P0.1 | Done | **Edit model split.** Move colour settings out of `IgEdit` into an `Adjustments` object (`engine/adjust.ts`) with a version number. Add `mergeEdit()` as the single validator for photo batches, video projects and presets, mapping today's fields (brightness, contrast, saturation, warmth, vignette, filter) to the new model | `engine/instagram.ts`, new `engine/adjust.ts`, `state/instagram.ts`, `state/video.ts` | Vitest: old saves load unchanged; unknown and out-of-range values are clamped or dropped |
| P0.2 | Done | **GPU device layer.** Detect WebGPU, fall back to WebGL2, then to Canvas 2D. One interface: create textures, run a pass, read back. Lost-device recovery | new `engine/gpu/device.ts`, `gpu/webgpu.ts`, `gpu/webgl2.ts` | Self-test runs every check on each available backend |
| P0.3 | Done | **Render graph.** Nodes (source, convert to linear, adjust, look, vignette, layers, output) built from the edit model; texture pool; 16-bit float intermediates; sRGB output | new `engine/gpu/graph.ts`, `gpu/nodes/*.ts` | Vitest for graph building (no GPU needed) |
| P0.4 | Done | **Shaders for today's looks.** Port `lookPixels()` (`engine/photo.ts`) and `adjustPixels()` (`engine/instagram.ts`) to WGSL and GLSL, kept side by side per effect | new `engine/gpu/shaders/` | Golden-image parity (P0.6) |
| P0.5 | Done | **Wire into the renderers.** `renderIg()` and `renderFrame()` (`engine/video.ts`) call the graph when `settings.gpu` is on; layers (`engine/layers.ts`) still draw with Canvas 2D on top. Video frames go to the GPU without a CPU copy (`importExternalTexture` / `texImage2D` with a `VideoFrame`) | `engine/instagram.ts`, `engine/video.ts`, `engine/videoExport.ts` | Export a Reel and a 1080p video with the flag on and off; compare |
| P0.6 | Done | **Golden-image tests.** Render a fixed set of photos × looks × adjustment values with Canvas 2D and with each GPU backend; fail if any channel differs by more than 2 levels or the mean by more than 0.5 | `src/dev/selftest.ts`, sample photos (no people) in `public/samples/` | This is the phase gate |
| P0.7 | Done | **Loading and budgets.** The GPU module loads with `import()` on first use of an editor; extend `scripts/check-bundle.mjs` with markers so shader code can't reach the entry chunk | `scripts/check-bundle.mjs` | `npm run build` |
| P0.8 | Not needed | **Desktop frame path for big files.** Read large videos in chunks through IPC instead of a whole `File` in memory | `electron/main.cjs`, `lib/fileSink.ts`, new IPC handler | MCP smoke test with a 2 GB+ file (manual, recorded in testing-strategy.md) |
| P0.9 | Done | **Switch over.** Turn `settings.gpu` on by default; keep Canvas 2D as the fallback when no GPU is available | settings, MEDIA-STUDIO.md | Full suite on Chrome, Firefox (WebGL2) and Electron |

New dependencies: none. Shaders are written by hand, like the rest of the colour maths.

**Gate:** exports match today's Canvas 2D output within the P0.6 tolerance on every backend; entry chunk under budget.

## Phase 1: Advanced photo editor

Goal: Lightroom-style global and local adjustments, presets and RAW on desktop.

| ID | Status | Work item | Files | Tests |
| --- | --- | --- | --- | --- |
| P1.1 | Done | **Light and white balance.** Exposure, highlights, shadows, whites, blacks; temperature and tint; eyedropper on a neutral grey. Brightness and warmth map onto these for old saves | `engine/adjust.ts`, `gpu/nodes/light.ts`, `components/studio/PhotoWorkspace.tsx` | Vitest for the maths; golden images |
| P1.2 | Done | **Tone curve and colour mixer.** Curve editor (RGB and per channel, as a 1D LUT texture); HSL for 8 bands | `gpu/nodes/curve.ts`, `gpu/nodes/hsl.ts`, new `components/ig/CurveEditor.tsx` | Curve keyboard control in e2e; golden images |
| P1.3 | Done | **Detail and effects.** Sharpening (unsharp mask with edge masking), noise reduction (bilateral first), grain, clarity, dehaze | `gpu/nodes/detail.ts`, `gpu/nodes/effects.ts` | Golden images; 1080p timing in the self-test |
| P1.4 | Done | **Looks become presets; LUT import.** Today's 7 looks as built-in presets. Parse `.cube` files ourselves (small text format, no library) into a 3D texture; validate size (up to 65³) | new `engine/lut.ts`, `gpu/nodes/lut.ts` | Vitest: parser rejects bad files; identity LUT changes nothing |
| P1.5 | Done | **Saved presets.** Save, name, rename, delete; apply to one photo or the batch; export and import as JSON through `mergeEdit()`. Stored in IndexedDB on web and in the data folder on desktop (`lib/db.ts`) | new `state/presets.ts`, `lib/db.ts` | Vitest; e2e save → reload → apply |
| P1.6 | Done | **Mask model and brush.** Masks as data (`engine/masks.ts`): kind, parameters, invert, combine mode, its own `Adjustments`. Brush reuses drawing strokes (`engine/layers.ts` `Stroke`), rendered to a single-channel texture with feather and flow | new `engine/masks.ts`, `gpu/nodes/mask.ts`, `components/ig/useLayerPointer.ts`, new `components/ig/MaskPanel.tsx` | Vitest for the model; self-test draws a known mask |
| P1.7 | Done | **Gradient and range masks.** Linear and radial with on-canvas handles; colour and luminance range | `engine/masks.ts`, `gpu/nodes/mask.ts` | Golden images |
| P1.8 | Done | **AI subject, sky and background masks.** On-device segmentation in a worker, loaded with `import()` on first use; model cached in OPFS (web) or the data folder (desktop); refine with the brush. Licence check of library and each model first; CSP for the model host (or self-host the model) | new `src/ai/segment/`, `nginx/security-headers.conf`, `electron/main.cjs` | Self-test with a fake segmenter; one real-model e2e on desktop project only |
| P1.9 | Done | **RAW on desktop.** Helper program around LibRaw, started by the main process: demosaic, camera white balance, output 16-bit linear pixels; 16-bit TIFF export (our own writer, moved here from P1.11). IPC handler validates the path and size. Web opens the embedded JPEG preview and says the full RAW needs the desktop app | new `electron/raw.cjs`, `extraResources` in `electron-builder.yml`, `src/platform/desktop.ts` | MCP smoke opens a sample DNG; licence exception recorded |
| P1.10 | Done | **Layers: blend modes, image layers, layer masks.** Blend modes on all layers; a new `ImageLayer` kind for logos and overlays; layer masks reuse P1.6 | `engine/layers.ts`, `components/ig/LayerPanel.tsx` | Vitest for `scaleLayer`, hit tests; golden images |
| P1.11 | Done | **Export formats.** PNG and WebP via canvas; AVIF only where the browser can encode it (otherwise hidden); 16-bit TIFF from RAW on desktop (written by our own small TIFF writer, like the PNG `pHYs` helper) | `engine/export.ts` or new `engine/photoExport.ts` | Unit test for the TIFF header; e2e downloads |
| P1.12 | Done | **Agent tools and docs** for adjustments, masks and presets | `src/agent/tools.ts`, `docs/MCP.md`, `MEDIA-STUDIO.md` | MCP smoke test |

New dependencies to clear in [licensing.md](../licensing.md) before their item starts: a segmentation runtime and
model (P1.8, cleared and recorded), LibRaw (P1.9, exception approved).

**Gate:** masked edits stay at 30 fps preview at 1080p in Chrome on a mid-range laptop; RAW opens on Windows and macOS.

## Phase 2: Multi-track timeline

Goal: a real timeline with tracks, edit tools, keyframes, transitions, speed and audio.

| ID | Status | Work item | Files | Tests |
| --- | --- | --- | --- | --- |
| P2.1 | To do | **Track model and migration.** Clips get an absolute `start` and a track; tracks have a kind (video, overlay, audio), mute, lock and height. Old projects become one video track and one music track. The project file gets a version and goes through a validator | `state/video.ts`, new `engine/timeline.ts`, `engine/video.ts` | Vitest: migration round-trips every 2.x project shape |
| P2.2 | To do | **Edit operations** as pure functions on the model: ripple delete and trim, roll, slip, slide, magnetic main track, snapping. The UI only calls them | `engine/timeline.ts`, `components/studio/Timeline.tsx` | Vitest table tests for each operation, including edges (zero-length, locked tracks) |
| P2.3 | To do | **Compositing many tracks.** `renderFrame()` draws every visible clip at `t`, bottom track first, with position, scale and opacity per clip (picture-in-picture) | `engine/video.ts` | Golden frames in the self-test |
| P2.4 | To do | **Decoder pool.** Several `VideoDecoder`s with a look-ahead queue, needed for overlapping clips and transitions; frames closed promptly to avoid GPU memory leaks | new `engine/decoders.ts`, `engine/videoExport.ts` | Self-test: no leaked `VideoFrame`s after a 2-minute export |
| P2.5 | To do | **Keyframes.** `Animated<T>` values with linear, ease and hold interpolation on any numeric property (position, scale, opacity, volume, mask, adjustments); keyframe lane in the timeline | new `engine/keyframes.ts`, `Timeline.tsx` | Vitest for interpolation |
| P2.6 | To do | **Transitions.** Cross-dissolve, dip to colour, wipe, slide, zoom, as shaders that take two frames | `gpu/nodes/transition.ts` | Golden frames |
| P2.7 | To do | **Speed.** Constant speed, reverse, freeze frame, then speed ramps (time remap curve). Sound re-timed for constant speed, muted for ramps and reverse at first | `engine/timeline.ts`, `engine/videoExport.ts` | Vitest for time remapping |
| P2.8 | To do | **Audio tracks.** Several tracks, clip waveforms, volume keyframes, ducking (lower music under speech by measuring clip loudness), loudness target for YouTube and Instagram | `engine/videoExport.ts`, new `engine/audio.ts` | Vitest for the mix maths; listen test noted in testing-strategy.md |
| P2.9 | To do | **Voice-over.** Record from the microphone; desktop needs a permission handler for media in `electron/main.cjs` | `components/studio/VideoWorkspace.tsx`, `electron/main.cjs` | e2e with a fake media stream |
| P2.10 | To do | **Markers, in/out, export a range; text animations; compound clips and groups** | `engine/timeline.ts`, `engine/layers.ts` | Vitest; e2e |
| P2.11 | To do | **Proxies and frame cache (desktop first).** Low-resolution proxies made with WebCodecs and Mediabunny (no new library), stored on disk; render-ahead cache for effect-heavy sections; raise desktop limits only after measuring | `engine/videoExport.ts`, new `engine/proxy.ts`, `electron/main.cjs` | MCP smoke: 4K project plays from proxies |
| P2.12 | To do | **Agent tools and docs** for tracks, edits, keyframes and transitions | `src/agent/tools.ts`, docs | MCP smoke test |

New dependencies: none planned.

**Gate:** a 4K multi-track timeline (3 video and 2 audio tracks, transitions) plays smoothly on desktop; every 2.x
project opens unchanged.

## Phase 3: Colour and finishing

Goal: a colour page with scopes, captions, retouching, and professional outputs on desktop.

| ID | Status | Work item | Files | Tests |
| --- | --- | --- | --- | --- |
| P3.1 | To do | **Primary grade.** Lift, gamma, gain and offset wheels; contrast and pivot; reuses P1 nodes | new `components/studio/ColourPage.tsx`, `gpu/nodes/grade.ts` | Golden frames |
| P3.2 | To do | **Grading curves and secondaries.** Hue vs saturation, hue vs hue, luma vs saturation; HSL qualifier per clip | `gpu/nodes/grade.ts` | Golden frames |
| P3.3 | To do | **Scopes.** Histogram, waveform, RGB parade, vectorscope; compute shaders on WebGPU, a downsampled read-back on WebGL2 | new `engine/gpu/scopes.ts` | Vitest on the bucketing maths; self-test on known images |
| P3.4 | To do | **Grade tools.** Copy and paste grades, apply a LUT to the whole timeline, match one clip to another (statistics transfer) | `engine/adjust.ts` | Vitest |
| P3.5 | To do | **Auto captions.** On-device speech model in a worker, loaded on demand; words become timed text layers in the existing styles; desktop can use a larger model. Check Hindi and Hinglish accuracy before choosing a model | new `src/ai/captions/` | Self-test with a fake recogniser; accuracy sample noted in the plan |
| P3.6 | To do | **Spot heal and clone** (photo first): clone stamp, then patch-based heal | `gpu/nodes/heal.ts`, `engine/masks.ts` | Golden images |
| P3.7 | To do | **Professional outputs on desktop.** LGPL FFmpeg helper program for HEVC 10-bit and professional inputs (HEVC, DNxHR); hardware encoders from the OS; PQ / HLG output path. ProRes only after the licence review in licensing.md | new `electron/ffmpeg.cjs`, `extraResources` | MCP smoke: export and probe a 10-bit file |
| P3.8 | To do | **AI object removal (desktop).** Inpainting model in a helper or worker; model licence must allow commercial use | `src/ai/inpaint/` | Self-test with a fake model |
| P3.9 | To do | **Agent tools and docs** for grading, scopes and captions | `src/agent/tools.ts`, docs | MCP smoke test |

New dependencies to clear first: a speech model and runtime (P3.5), FFmpeg LGPL build (P3.7, needs an exception),
an inpainting model (P3.8).

## Testing strategy across phases

| Layer | Tool | What it covers |
| --- | --- | --- |
| Pure logic | Vitest (`src/**/*.test.ts`) | Edit model and migration, timeline operations, keyframes, LUT parser, colour maths, audio mix |
| Pixels | Self-test (`npm test`) | Golden images and frames on every GPU backend, with a fixed tolerance; no leaked frames |
| UI | Playwright (`npm run test:e2e`) | Panels, curve and wheel controls by keyboard, presets, timeline edits; axe on each new panel; phone width |
| Agents | `npm run test:mcp` | New tools end to end against the desktop app |
| Licences | `npm run check:licenses` | Every shipped package's licence; imports of unlisted packages |
| Performance | Self-test timings | 1080p preview frame time on web; 4K on desktop; recorded per release in [PERFORMANCE.md](../../docs/PERFORMANCE.md) |

## Risks to watch while building

- **Pixel drift during Phase 0.** Never switch the default renderer before P0.6 passes on every backend.
- **GPU memory.** Close every `VideoFrame`, reuse textures from the pool, and test long exports for leaks (P2.4).
- **Project format changes** in Phase 2 are the one breaking change; the validator must open every older project.
- **Model and binary sizes.** Load on demand, show progress, cache; never in the entry chunk or the base installer
  unless small.
- **Licences.** A dependency whose licence can't be cleared is replaced or written in-house; the work item waits,
  not the rule.

## Open decisions (from the roadmap)

To settle before the phase that needs them:

| Decision | Needed by | Default if not decided |
| --- | --- | --- |
| Web keeps editing parity with desktop; only inputs and outputs gated | Phase 1 | Yes, parity |
| Which segmentation model for AI masks | P1.8 | **Decided (4 October 2026):** U²-Net-p for subject and background, bundled; skyseg for sky, downloaded on first use after the user agrees (it is 176 MB); ONNX Runtime Web |
| HDR delivery wanted, or SDR only | P3.7 | SDR only; HEVC 10-bit SDR on desktop |
| Which speech model, and is Hindi / Hinglish good enough | P3.5 | Ship English first, others when accuracy is acceptable |
| Presets and LUTs sync between devices without a server | P1.5 | **Decided:** export and import files only (P1.5) |

### P1.8 licence research (4 October 2026, decided the same day)

Findings, from the sources linked; nothing is added to the app until this is approved.

| Candidate | Use | Code | Weights | Size | Concerns |
| --- | --- | --- | --- | --- | --- |
| MediaPipe Image Segmenter models | People, hair, a few objects | Apache 2.0 | Per model card | small | Selfie, hair and multiclass models are people only; DeepLab-v3 adds only cats, dogs and potted plants. **No sky, no general subject.** Doesn't fit P1.8 |
| U²-Net-p (`u2netp`) | General subject / background (salient object) | Apache 2.0 | No separate statement; the repository is Apache 2.0 | 4.7 MB, 320 × 320 input | Weights' licence only implied by the repository; trained on DUTS, whose own terms aren't stated |
| BiRefNet (general, lite) | Subject / background, sharper edges | MIT | MIT on its model card | Tens to a hundred-plus MB | Large for the web; could be the desktop option |
| skyseg (U²-Net trained for sky) | Sky | MIT (repository) | MIT, "derived from" the repository | **176 MB** (the full U²-Net; "about 2 MB" here was wrong) | Training data not stated; the author's better model is closed |
| Runtime: ONNX Runtime Web | Runs the ONNX models in a worker | MIT | — | about 10 MB of WebAssembly | CSP needs `'wasm-unsafe-eval'` in `script-src` (nginx and Electron) |

Proposal: ONNX Runtime Web in a worker, loaded with `import()` on first use; U²-Net-p for subject and background
(background = inverted subject) and skyseg for sky, both **self-hosted** with the app (about 7 MB of models, no new
external host; the desktop installer bundles them), each refinable with the brush. To decide: whether the implied
weight licences (U²-Net-p, skyseg) and unstated training data are acceptable under licensing.md's model rules, or whether
to wait for models with explicit weight licences (BiRefNet for subject, desktop first; no permissive sky model found
yet). Sources: [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter),
[U-2-Net](https://github.com/xuebinqin/U-2-Net), [Open background removal models](https://withoutbg.com/models),
[skyseg](https://huggingface.co/JianyuanWang/skyseg),
[Sky-Segmentation-and-Post-processing](https://github.com/xiongzhu666/Sky-Segmentation-and-Post-processing).

