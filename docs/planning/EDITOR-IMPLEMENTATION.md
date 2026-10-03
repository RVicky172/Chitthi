# Photo & video editor: implementation plan

Status: plan, not started. Written 3 October 2026 against version 2.8.0. It turns
[EDITOR-ROADMAP.md](EDITOR-ROADMAP.md) (the what and why) into work items: which files change, in what order, how
each step is tested, and what must be true before the next phase starts. Every library it adds goes through
[LICENSING.md](../LICENSING.md) first.

## Progress

| Item | State | Notes |
| --- | --- | --- |
| P0.1 Edit model split | Done | `engine/adjust.ts` (`Adjustments`, `mergeAdjust()`), `IgEdit.adjust`, `mergeEdit()`; colour edits through `adjustPhoto` / `adjustClip` |

## How the work is organised

- **Four phases, each a release.** Phase 0 → 2.9.0, Phase 1 → 2.10.0, Phase 2 → 3.0.0 (the project format changes),
  Phase 3 → 3.1.0. A phase ends at its gate (see the roadmap); the next one doesn't start until it passes.
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
  [LICENSING.md](../LICENSING.md)).

### Definition of done for every work item

1. `npm run lint`, `typecheck`, `build`, `test:unit`, `test`, `test:mcp`, `test:e2e` and `check:licenses` pass.
2. Pure logic has Vitest tests; anything that renders has a self-test check (`src/dev/selftest.ts`).
3. The feature is reachable by agents: a tool in `src/agent/tools.ts` (or an extended one), covered by the self-test.
4. Docs updated: [MEDIA-STUDIO.md](../MEDIA-STUDIO.md) for behaviour, [LLD.md](../LLD.md) for structure,
   [LICENSING.md](../LICENSING.md) and THIRD_PARTY_NOTICES.md for any new dependency, CHANGELOG.
5. Works at phone width, with keyboard and screen reader (axe passes); respects `prefers-reduced-motion`.
6. Errors that are caught and shown to the user call `logError('handled', e)`.

## Phase 0: Foundation (GPU render graph)

Goal: the same pixels as today, produced by a GPU pipeline both editors share. Nothing new is visible to users.

| ID | Work item | Files | Tests |
| --- | --- | --- | --- |
| P0.1 | **Edit model split.** Move colour settings out of `IgEdit` into an `Adjustments` object (`engine/adjust.ts`) with a version number. Add `mergeEdit()` as the single validator for photo batches, video projects and presets, mapping today's fields (brightness, contrast, saturation, warmth, vignette, filter) to the new model | `engine/instagram.ts`, new `engine/adjust.ts`, `state/instagram.ts`, `state/video.ts` | Vitest: old saves load unchanged; unknown and out-of-range values are clamped or dropped |
| P0.2 | **GPU device layer.** Detect WebGPU, fall back to WebGL2, then to Canvas 2D. One interface: create textures, run a pass, read back. Lost-device recovery | new `engine/gpu/device.ts`, `gpu/webgpu.ts`, `gpu/webgl2.ts` | Self-test runs every check on each available backend |
| P0.3 | **Render graph.** Nodes (source, convert to linear, adjust, look, vignette, layers, output) built from the edit model; texture pool; 16-bit float intermediates; sRGB output | new `engine/gpu/graph.ts`, `gpu/nodes/*.ts` | Vitest for graph building (no GPU needed) |
| P0.4 | **Shaders for today's looks.** Port `lookPixels()` (`engine/photo.ts`) and `adjustPixels()` (`engine/instagram.ts`) to WGSL and GLSL, kept side by side per effect | new `engine/gpu/shaders/` | Golden-image parity (P0.6) |
| P0.5 | **Wire into the renderers.** `renderIg()` and `renderFrame()` (`engine/video.ts`) call the graph when `settings.gpu` is on; layers (`engine/layers.ts`) still draw with Canvas 2D on top. Video frames go to the GPU without a CPU copy (`importExternalTexture` / `texImage2D` with a `VideoFrame`) | `engine/instagram.ts`, `engine/video.ts`, `engine/videoExport.ts` | Export a Reel and a 1080p video with the flag on and off; compare |
| P0.6 | **Golden-image tests.** Render a fixed set of photos × looks × adjustment values with Canvas 2D and with each GPU backend; fail if any channel differs by more than 2 levels or the mean by more than 0.5 | `src/dev/selftest.ts`, sample photos (no people) in `public/samples/` | This is the phase gate |
| P0.7 | **Loading and budgets.** The GPU module loads with `import()` on first use of an editor; extend `scripts/check-bundle.mjs` with markers so shader code can't reach the entry chunk | `scripts/check-bundle.mjs` | `npm run build` |
| P0.8 | **Desktop frame path for big files.** Read large videos in chunks through IPC instead of a whole `File` in memory | `electron/main.cjs`, `lib/fileSink.ts`, new IPC handler | MCP smoke test with a 2 GB+ file (manual, recorded in TESTING.md) |
| P0.9 | **Switch over.** Turn `settings.gpu` on by default; keep Canvas 2D as the fallback when no GPU is available | settings, MEDIA-STUDIO.md | Full suite on Chrome, Firefox (WebGL2) and Electron |

New dependencies: none. Shaders are written by hand, like the rest of the colour maths.

**Gate:** exports match today's Canvas 2D output within the P0.6 tolerance on every backend; entry chunk under budget.

## Phase 1: Advanced photo editor

Goal: Lightroom-style global and local adjustments, presets and RAW on desktop.

| ID | Work item | Files | Tests |
| --- | --- | --- | --- |
| P1.1 | **Light and white balance.** Exposure, highlights, shadows, whites, blacks; temperature and tint; eyedropper on a neutral grey. Brightness and warmth map onto these for old saves | `engine/adjust.ts`, `gpu/nodes/light.ts`, `components/studio/PhotoWorkspace.tsx` | Vitest for the maths; golden images |
| P1.2 | **Tone curve and colour mixer.** Curve editor (RGB and per channel, as a 1D LUT texture); HSL for 8 bands | `gpu/nodes/curve.ts`, `gpu/nodes/hsl.ts`, new `components/ig/CurveEditor.tsx` | Curve keyboard control in e2e; golden images |
| P1.3 | **Detail and effects.** Sharpening (unsharp mask with edge masking), noise reduction (bilateral first), grain, clarity, dehaze | `gpu/nodes/detail.ts`, `gpu/nodes/effects.ts` | Golden images; 1080p timing in the self-test |
| P1.4 | **Looks become presets; LUT import.** Today's 7 looks as built-in presets. Parse `.cube` files ourselves (small text format, no library) into a 3D texture; validate size (up to 65³) | new `engine/lut.ts`, `gpu/nodes/lut.ts` | Vitest: parser rejects bad files; identity LUT changes nothing |
| P1.5 | **Saved presets.** Save, name, rename, delete; apply to one photo or the batch; export and import as JSON through `mergeEdit()`. Stored in IndexedDB on web and in the data folder on desktop (`lib/db.ts`) | new `state/presets.ts`, `lib/db.ts` | Vitest; e2e save → reload → apply |
| P1.6 | **Mask model and brush.** Masks as data (`engine/masks.ts`): kind, parameters, invert, combine mode, its own `Adjustments`. Brush reuses drawing strokes (`engine/layers.ts` `Stroke`), rendered to a single-channel texture with feather and flow | new `engine/masks.ts`, `gpu/nodes/mask.ts`, `components/ig/useLayerPointer.ts`, new `components/ig/MaskPanel.tsx` | Vitest for the model; self-test draws a known mask |
| P1.7 | **Gradient and range masks.** Linear and radial with on-canvas handles; colour and luminance range | `engine/masks.ts`, `gpu/nodes/mask.ts` | Golden images |
| P1.8 | **AI subject, sky and background masks.** On-device segmentation in a worker, loaded with `import()` on first use; model cached in OPFS (web) or the data folder (desktop); refine with the brush. Licence check of library and each model first; CSP for the model host (or self-host the model) | new `src/ai/segment/`, `nginx/security-headers.conf`, `electron/main.cjs` | Self-test with a fake segmenter; one real-model e2e on desktop project only |
| P1.9 | **RAW on desktop.** Helper program around LibRaw, started by the main process: demosaic, camera white balance, output 16-bit linear pixels. IPC handler validates the path and size. Web opens the embedded JPEG preview and says the full RAW needs the desktop app | new `electron/raw.cjs`, `extraResources` in `electron-builder.yml`, `src/platform/desktop.ts` | MCP smoke opens a sample DNG; licence exception recorded |
| P1.10 | **Layers: blend modes, image layers, layer masks.** Blend modes on all layers; a new `ImageLayer` kind for logos and overlays; layer masks reuse P1.6 | `engine/layers.ts`, `components/ig/LayerPanel.tsx` | Vitest for `scaleLayer`, hit tests; golden images |
| P1.11 | **Export formats.** PNG and WebP via canvas; AVIF only where the browser can encode it (otherwise hidden); 16-bit TIFF from RAW on desktop (written by our own small TIFF writer, like the PNG `pHYs` helper) | `engine/export.ts` or new `engine/photoExport.ts` | Unit test for the TIFF header; e2e downloads |
| P1.12 | **Agent tools and docs** for adjustments, masks and presets | `src/agent/tools.ts`, `docs/MCP.md`, `MEDIA-STUDIO.md` | MCP smoke test |

New dependencies to clear in [LICENSING.md](../LICENSING.md) before their item starts: a segmentation runtime and
model (P1.8), LibRaw (P1.9, needs an exception).

**Gate:** masked edits stay at 30 fps preview at 1080p in Chrome on a mid-range laptop; RAW opens on Windows and macOS.

## Phase 2: Multi-track timeline

Goal: a real timeline with tracks, edit tools, keyframes, transitions, speed and audio.

| ID | Work item | Files | Tests |
| --- | --- | --- | --- |
| P2.1 | **Track model and migration.** Clips get an absolute `start` and a track; tracks have a kind (video, overlay, audio), mute, lock and height. Old projects become one video track and one music track. The project file gets a version and goes through a validator | `state/video.ts`, new `engine/timeline.ts`, `engine/video.ts` | Vitest: migration round-trips every 2.x project shape |
| P2.2 | **Edit operations** as pure functions on the model: ripple delete and trim, roll, slip, slide, magnetic main track, snapping. The UI only calls them | `engine/timeline.ts`, `components/studio/Timeline.tsx` | Vitest table tests for each operation, including edges (zero-length, locked tracks) |
| P2.3 | **Compositing many tracks.** `renderFrame()` draws every visible clip at `t`, bottom track first, with position, scale and opacity per clip (picture-in-picture) | `engine/video.ts` | Golden frames in the self-test |
| P2.4 | **Decoder pool.** Several `VideoDecoder`s with a look-ahead queue, needed for overlapping clips and transitions; frames closed promptly to avoid GPU memory leaks | new `engine/decoders.ts`, `engine/videoExport.ts` | Self-test: no leaked `VideoFrame`s after a 2-minute export |
| P2.5 | **Keyframes.** `Animated<T>` values with linear, ease and hold interpolation on any numeric property (position, scale, opacity, volume, mask, adjustments); keyframe lane in the timeline | new `engine/keyframes.ts`, `Timeline.tsx` | Vitest for interpolation |
| P2.6 | **Transitions.** Cross-dissolve, dip to colour, wipe, slide, zoom, as shaders that take two frames | `gpu/nodes/transition.ts` | Golden frames |
| P2.7 | **Speed.** Constant speed, reverse, freeze frame, then speed ramps (time remap curve). Sound re-timed for constant speed, muted for ramps and reverse at first | `engine/timeline.ts`, `engine/videoExport.ts` | Vitest for time remapping |
| P2.8 | **Audio tracks.** Several tracks, clip waveforms, volume keyframes, ducking (lower music under speech by measuring clip loudness), loudness target for YouTube and Instagram | `engine/videoExport.ts`, new `engine/audio.ts` | Vitest for the mix maths; listen test noted in TESTING.md |
| P2.9 | **Voice-over.** Record from the microphone; desktop needs a permission handler for media in `electron/main.cjs` | `components/studio/VideoWorkspace.tsx`, `electron/main.cjs` | e2e with a fake media stream |
| P2.10 | **Markers, in/out, export a range; text animations; compound clips and groups** | `engine/timeline.ts`, `engine/layers.ts` | Vitest; e2e |
| P2.11 | **Proxies and frame cache (desktop first).** Low-resolution proxies made with WebCodecs and Mediabunny (no new library), stored on disk; render-ahead cache for effect-heavy sections; raise desktop limits only after measuring | `engine/videoExport.ts`, new `engine/proxy.ts`, `electron/main.cjs` | MCP smoke: 4K project plays from proxies |
| P2.12 | **Agent tools and docs** for tracks, edits, keyframes and transitions | `src/agent/tools.ts`, docs | MCP smoke test |

New dependencies: none planned.

**Gate:** a 4K multi-track timeline (3 video and 2 audio tracks, transitions) plays smoothly on desktop; every 2.x
project opens unchanged.

## Phase 3: Colour and finishing

Goal: a colour page with scopes, captions, retouching, and professional outputs on desktop.

| ID | Work item | Files | Tests |
| --- | --- | --- | --- |
| P3.1 | **Primary grade.** Lift, gamma, gain and offset wheels; contrast and pivot; reuses P1 nodes | new `components/studio/ColourPage.tsx`, `gpu/nodes/grade.ts` | Golden frames |
| P3.2 | **Grading curves and secondaries.** Hue vs saturation, hue vs hue, luma vs saturation; HSL qualifier per clip | `gpu/nodes/grade.ts` | Golden frames |
| P3.3 | **Scopes.** Histogram, waveform, RGB parade, vectorscope; compute shaders on WebGPU, a downsampled read-back on WebGL2 | new `engine/gpu/scopes.ts` | Vitest on the bucketing maths; self-test on known images |
| P3.4 | **Grade tools.** Copy and paste grades, apply a LUT to the whole timeline, match one clip to another (statistics transfer) | `engine/adjust.ts` | Vitest |
| P3.5 | **Auto captions.** On-device speech model in a worker, loaded on demand; words become timed text layers in the existing styles; desktop can use a larger model. Check Hindi and Hinglish accuracy before choosing a model | new `src/ai/captions/` | Self-test with a fake recogniser; accuracy sample noted in the plan |
| P3.6 | **Spot heal and clone** (photo first): clone stamp, then patch-based heal | `gpu/nodes/heal.ts`, `engine/masks.ts` | Golden images |
| P3.7 | **Professional outputs on desktop.** LGPL FFmpeg helper program for HEVC 10-bit and professional inputs (HEVC, DNxHR); hardware encoders from the OS; PQ / HLG output path. ProRes only after the licence review in LICENSING.md | new `electron/ffmpeg.cjs`, `extraResources` | MCP smoke: export and probe a 10-bit file |
| P3.8 | **AI object removal (desktop).** Inpainting model in a helper or worker; model licence must allow commercial use | `src/ai/inpaint/` | Self-test with a fake model |
| P3.9 | **Agent tools and docs** for grading, scopes and captions | `src/agent/tools.ts`, docs | MCP smoke test |

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
| Performance | Self-test timings | 1080p preview frame time on web; 4K on desktop; recorded per release in [PERFORMANCE.md](../PERFORMANCE.md) |

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
| Which segmentation model for AI masks | P1.8 | The first one whose code and weights pass LICENSING.md |
| HDR delivery wanted, or SDR only | P3.7 | SDR only; HEVC 10-bit SDR on desktop |
| Which speech model, and is Hindi / Hinglish good enough | P3.5 | Ship English first, others when accuracy is acceptable |
| Presets and LUTs sync between devices without a server | P1.5 | Export and import files only |
