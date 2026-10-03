# Photo & video editor: advanced features plan

Status: in progress (Phase 0 done; Phase 1 under way); the status of each work item is tracked in
[EDITOR-IMPLEMENTATION.md](EDITOR-IMPLEMENTATION.md#progress). Written 2 October 2026 against version 2.8.0. Living copy with the drawings:
[Claude doc](https://claude.ai/code/artifact/685d86eb-2eba-4f4d-b6f2-08559f401907). What exists today is in
[MEDIA-STUDIO.md](../MEDIA-STUDIO.md). How to build it, step by step: [EDITOR-IMPLEMENTATION.md](EDITOR-IMPLEMENTATION.md).
Licence rules for every library it adds: [LICENSING.md](../LICENSING.md).

**Free and open source, always.** "Advanced" here means professional-grade tools, not a paid edition. Every feature in
this plan ships to everyone, free, under the MIT License, in the web app and the desktop app alike: no subscription,
no paid tier, no account, no feature locked behind a payment. Where something is desktop-only, that is because a
browser can't do it well (memory, codecs, native libraries), and the desktop app is free too.

## Summary

Move both editors onto one GPU rendering pipeline first: every advanced feature asked for (masks, colour grading, LUTs,
scopes, transitions, real-time preview at 4K) depends on it, and today all pixel work runs on the CPU. After that,
build in three phases: an advanced photo editor (masks and local adjustments, curves, HSL, RAW on desktop), a real
multi-track timeline (tracks, ripple and roll edits, keyframes, transitions, speed), and a colour page (wheels, curves,
LUTs, scopes).

The browser can do almost all of it on modern Chrome and Edge: WebGPU and WebGL2 for pixels, WebCodecs for decoding
and encoding, on-device AI for subject and sky masks. What only the desktop app can do well: camera RAW at full
quality, ProRes and other professional codecs, 10-bit HDR delivery, projects over a few GB, proxies on disk and hours-long
timelines. That split decides what each phase ships where.

Top recommendations:

1. A shared GPU render graph (WebGPU with a WebGL2 fallback) used by preview, export, photos and video alike, as
   `renderFrame()` is shared today.
2. Non-destructive edits stored as parameters, so every adjustment, mask and grade stays editable and exports match
   the preview.
3. Masks as a first-class layer type: brush, linear and radial gradients, then AI subject and sky masks run on the
   device.
4. A track-based timeline model (video, overlay and audio tracks) before adding more clip features to the current
   single track.
5. Desktop-only parts where the web truly can't follow (RAW, ProRes, HDR, large media), stated in the editor as the
   limits are today.

## Where the editors are today

Both editors are solid social-media tools in version 2.8.0: batch Instagram photos, Reels and Shorts, and YouTube
videos with layers, a one-track timeline and fast, hardware-encoded exports. Their ceiling is the rendering: every
pixel effect runs on the CPU through Canvas 2D, and the timeline holds one video track.

| Area | What exists (2.8.0) | Main limit |
| --- | --- | --- |
| Photo adjustments | 7 looks (incl. Hand-tinted), brightness, contrast, saturation, warmth, vignette; crop, zoom, rotate, mirror | Global only: no masks, curves, HSL, sharpening or noise reduction; CPU pixel loops (`getImageData`) |
| Photo layers | Text (6 styles, 46 fonts + own), shapes, stickers, freehand drawing; move, resize, rotate, opacity, order | No blend modes, no layer masks, no image layers |
| Batch | Up to 20 photos, "apply this look to all", 80-step undo | No presets saved across sessions |
| Video timeline | One video track (clips and photos), one music track, timed layers; trim, reorder, split, duplicate, snapping, zoom, frame stepping | No extra video or audio tracks, ripple/roll edits, keyframes, transitions or speed changes |
| Video per clip | Volume, Ken Burns movement, fade from black, framing, the same looks and four adjustments | No colour grading tools, scopes or LUTs |
| Audio | Clip sound + one music track with waveform and fade-out | No voice-over, ducking, EQ or clip waveforms |
| Export | H.264 + AAC MP4 with fast start; Reels in memory; YouTube streamed to disk; up to 4K60 on desktop | 8-bit SDR only; no HEVC, ProRes or image-sequence output |
| Limits | Web: Reels 90 s, YouTube 15 min, 1080p30. Desktop: 3 h, 500 clips, 50 GB files, 4K60 | Set by tab memory and background throttling |

The source for all of this is [MEDIA-STUDIO.md](../MEDIA-STUDIO.md) and the engines in `src/engine/` (`instagram.ts`,
`layers.ts`, `video.ts`, `videoExport.ts`). Its own "Still to do" list already names cross-fades, speed and reverse,
more audio tracks, clip waveforms and text animations.

## What professional tools offer

Chitthi's users make greetings, Reels and vlogs, not feature films, so the bar is Lightroom and CapCut quality on the
everyday tools, with selected depth from Resolve and Premiere. The table marks which of their features matter for them.

| Feature group | Where professional tools have it | Priority for Chitthi | Why |
| --- | --- | --- | --- |
| Local adjustments with masks (brush, gradient, subject, sky) | Lightroom, Photoshop, Resolve | High | The biggest gap between a filter app and a professional photo editor |
| Tone curve, HSL / colour mixer, white balance, sharpening, noise reduction | Lightroom, Photoshop | High | Basic expectations of anyone who edits photos seriously |
| Healing and spot removal | Lightroom, Photoshop | Medium | Common for portraits and travel photos; hard to do well |
| RAW development | Lightroom, Capture One, darktable | Medium, desktop | Photographers shoot RAW; the web can't decode it well (see the capability map) |
| Presets that save and sync | Lightroom, CapCut | High | Cheap to build on the parameter model; makes batches fast |
| Multi-track timeline, ripple and roll edits | Premiere, Final Cut, Resolve, CapCut | High | Needed for B-roll, picture-in-picture, titles over cuts |
| Keyframes on any property | All professional editors | High | Unlocks motion titles, zooms and animated masks |
| Transitions, speed ramps, reverse | Premiere, CapCut | High | Already on the editor's own to-do list |
| Colour grading (wheels, curves, qualifiers, LUTs) | Resolve, Premiere Lumetri | Medium-high | Makes footage from different phones match; LUTs are a quick win |
| Scopes (waveform, vectorscope, histogram) | Resolve, Premiere, Final Cut | Medium | Grading without scopes is guesswork |
| Auto captions | CapCut, Premiere | High | Expected for Reels and Shorts; on-device speech models now exist |
| Audio: multiple tracks, voice-over, ducking, noise removal | Premiere, CapCut | Medium | Vlogs need clean speech under music |
| Proxies and media cache | Premiere, Resolve, Final Cut | Desktop | Smooth editing of 4K and long timelines |
| HDR, 10-bit, ProRes delivery | Resolve, Final Cut | Low, desktop | Few Chitthi users deliver HDR; keep it on the desktop roadmap |

Feature groups and where they appear come from the tools' public feature lists as generally known; no figures here
depend on a specific version.

## Web vs desktop capability map

The browser handles every editing feature in this plan on current Chrome and Edge; the desktop app is needed for RAW,
professional codecs, HDR delivery and large media. Firefox and desktop Safari are the weak spots: Firefox has no WebGPU, and
neither has the File System Access API, so they get a WebGL2 path and in-memory exports.

| Capability | Web (Chrome / Edge) | Web (Firefox / Safari) | Desktop app (Electron) | Limiting technology |
| --- | --- | --- | --- | --- |
| GPU effects: curves, HSL, masks, LUTs, grading, transitions | Yes, WebGPU (Chrome/Edge 113+) | WebGL2 fallback; WebGPU partial in Safari 26 on macOS, off in Firefox | Yes, WebGPU in Chromium | [WebGPU support](https://caniuse.com/webgpu) |
| Real-time 1080p playback with effects | Yes | Yes on WebGL2, slower | Yes, plus 4K | GPU and decoder speed |
| Decode and encode H.264 / AAC | Yes, WebCodecs (94+) | Firefox 130+, Safari full from 26 | Yes | [WebCodecs support](https://caniuse.com/webcodecs) |
| HEVC / ProRes / DNxHR input | Partial: depends on the OS decoders; ProRes not supported | Mostly no | Yes, via a bundled native FFmpeg | Browser codec lists |
| 10-bit HDR (PQ / HLG) delivery | Not dependable for editing and export | No | Yes, with a native encoder | Canvas and encoder are 8-bit SDR in practice |
| Camera RAW (CR3, NEF, ARW, DNG) | Embedded JPEG preview only; WASM decode is possible but slow | Same | Full quality via LibRaw (LGPL 2.1 or CDDL) | [LibRaw](https://www.libraw.org/about) |
| AI subject, sky and hair masks | Yes, on-device (MediaPipe Image Segmenter, Apache 2.0 code) | Yes, on WebGL / WASM | Yes, faster | [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter) |
| Auto captions (speech to text) | Possible with an on-device model; large download | Same | Yes, can bundle a model | Model size and memory |
| Streaming long exports to a file | Yes, File System Access API (Chrome/Edge 105+) | No: built in memory | Yes, through the main process | [File System Access](https://caniuse.com/native-filesystem-api) |
| Large projects and media cache | Tab memory; files over about 2 GB need care | Same, tighter | Disk-backed, 50 GB files today | Tab memory; OPFS helps for caches |
| Proxies (low-res copies for editing) | Possible in OPFS, limited by quota | Same | Yes, on disk | Storage quota |
| FFmpeg filters and remux | ffmpeg.wasm: 2 GB hard input limit, much slower than native | Same | Native FFmpeg | [ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq) |
| Background work | Throttled when the tab is hidden | Same | Not throttled | Browser scheduling |

Rule for the roadmap: build every editing feature once, on the GPU pipeline, for both. Gate only inputs and outputs
(RAW, professional codecs, HDR, very long or large projects) to the desktop app, and say so in the editor as today's limits do.

## Photo editor plan

The photo editor becomes a non-destructive developer: a stack of adjustments, each optionally limited by a mask,
rendered on the GPU and stored as parameters with the batch. Masks are the centrepiece; everything else feeds them.

**Adjustments (global, then per mask)**

| Tool | What it adds | Web | Desktop |
| --- | --- | --- | --- |
| Light | Exposure, highlights, shadows, whites, blacks (replacing brightness) | Yes | Yes |
| Tone curve | RGB and per-channel curves with points | Yes | Yes |
| Colour mixer (HSL) | Hue, saturation, luminance for 8 colour bands | Yes | Yes |
| White balance | Temperature and tint, eyedropper on a neutral grey | Yes | Yes |
| Detail | Sharpening (amount, radius, masking), noise reduction | Yes, GPU | Yes |
| Effects | Vignette (exists), grain, clarity / texture, dehaze | Yes | Yes |
| Looks and LUTs | Today's 7 looks become presets; import `.cube` LUTs | Yes | Yes |
| Presets | Save, name and reuse a full stack; apply to the batch | Yes | Yes |

**Masks**

1. Brush: paint to add or erase, with size, feather and flow; uses the existing drawing strokes.
2. Linear and radial gradients: draggable on the canvas, for skies and spotlights.
3. Colour and luminance range: select by picked colour or brightness band.
4. AI subject, sky and background: on-device segmentation, refined with the brush. Chitthi's no-people rule covers its
   own samples and examples, not the photos users bring.
5. Combine masks: add, subtract, intersect, invert.

Every mask can carry its own adjustment stack, so "brighten the subject, darken the sky" is two masks with one slider
each.

**Retouching (phase 3)**

- Spot heal and clone: content-aware fill is hard to match; start with clone and a patch-based heal.
- Object removal by AI inpainting: desktop first, where a larger model fits.

**RAW (desktop)**

- Decode with LibRaw in the main process (or a native worker): demosaic, camera white balance, wide-gamut working
  space, then hand linear pixels to the same GPU pipeline.
- Web: open RAW files using their embedded JPEG preview, and say the full RAW needs the desktop app.

**Layers and export**

- Blend modes and opacity on layers; image layers (logos, overlays); layer masks reuse the mask tools.
- Export: JPEG (exists), PNG, WebP and AVIF; 16-bit TIFF from RAW on desktop.

## Video editor plan

The video editor moves from one track to a real multi-track timeline, then gains keyframes, transitions and a colour
page. Each step reuses the photo editor's GPU adjustments and masks, so a clip can be graded with the same tools as a
photo.

**Timeline**

| Feature | What it means | Web | Desktop |
| --- | --- | --- | --- |
| Tracks | Several video/overlay tracks (B-roll, picture-in-picture, titles) and several audio tracks | Yes, fewer by default | Yes |
| Edit tools | Ripple delete and trim, roll, slip and slide; magnetic main track like Final Cut and CapCut | Yes | Yes |
| Markers and in/out | Mark beats and ranges; export a range | Yes | Yes |
| Keyframes | Animate any property (position, scale, opacity, volume, mask, grade) with easing curves | Yes | Yes |
| Transitions | Cross-dissolve, dip, wipe, slide, zoom; need two decoded frames at once | Yes | Yes |
| Speed | Constant speed, ramps, reverse, freeze frame; sound re-timed or muted | Yes, up to the decoder's speed | Yes |
| Compound clips and groups | Nest clips; move a group together | Yes | Yes |
| Text animation | In and out animations on the existing timed layers | Yes | Yes |

**Colour page**

1. Primary grade: lift, gamma, gain and offset wheels; temperature, tint, contrast and pivot.
2. Curves: RGB, hue vs saturation, hue vs hue, luma vs saturation.
3. Secondary: masks and qualifiers (HSL key) per clip, tracked over time on desktop.
4. LUTs: import `.cube`, apply per clip or to the whole timeline; built-in creative looks.
5. Scopes: histogram, waveform, RGB parade and vectorscope, computed on the GPU from the preview frame.
6. Copy and paste grades, and match one clip's look to another.

**Audio**

- More audio tracks, voice-over recording, clip waveforms (already on the to-do list).
- Ducking: lower the music automatically under speech; volume keyframes.
- Noise reduction and EQ with the Web Audio API; loudness target for YouTube and Instagram.

**Captions and AI**

- Auto captions with an on-device speech model, styled with the existing text layers; desktop can bundle a larger,
  more accurate model.
- Background removal and subject tracking for overlays, desktop first.

**Performance and media (desktop first)**

- Proxies: low-resolution copies generated on import for smooth editing of 4K and long timelines.
- A frame cache and render-ahead for effects-heavy sections.
- Professional inputs (HEVC, ProRes, DNxHR) through a bundled native FFmpeg; 10-bit HEVC or ProRes export for HDR.

## Architecture

Everything in this plan runs through one GPU render graph that both editors and every export share, the way
`renderFrame()` is shared today. Edits stay parameters; pixels are produced only when the graph runs.

```mermaid
flowchart LR
  model["Edit model, non-destructive<br/>adjustments, masks, keyframes, tracks"]
  photos["Photos<br/>JPG, PNG, WebP"] --> graph
  video["Video<br/>decoded by WebCodecs"] --> graph
  raw["RAW and professional codecs<br/>desktop: LibRaw, FFmpeg"] --> graph
  ai["On-device AI<br/>masks and captions"] --> graph
  model --> graph
  subgraph graph["GPU render graph (WebGPU, WebGL2 fallback)"]
    direction TB
    g1["Convert to linear colour"] --> g2["Adjustments and curves"] --> g3["Masks: brush, gradient, AI"] --> g4["Grade and LUT"] --> g5["Layers, text, transitions"]
  end
  graph --> preview["Preview<br/>live canvas, same pixels"]
  graph --> scopes["Scopes<br/>waveform, vectorscope"]
  graph --> web["Export, web<br/>H.264 MP4, Mediabunny"]
  graph --> desk["Export, desktop<br/>HDR, ProRes via FFmpeg"]
```

- **Render graph.** WGSL shaders on WebGPU, the same effects as GLSL on WebGL2 where WebGPU is missing. Work in linear
  light, 16-bit float textures, convert to sRGB at the end (or PQ/HLG for desktop HDR).
- **Decode.** WebCodecs `VideoDecoder` frames go to the GPU without a CPU copy (`importExternalTexture` on WebGPU). The
  desktop adds RAW (LibRaw) and professional codecs (native FFmpeg) in a worker or the main process, handing frames over the
  same way.
- **Export.** The graph renders each frame, then WebCodecs encodes it and Mediabunny writes the MP4, as today. Desktop
  adds a native FFmpeg encoder for HEVC 10-bit and ProRes.
- **Models.** Segmentation and speech models load on first use with `import()`, cache in OPFS, and run in a worker so
  the editor stays responsive.
- **Budgets.** Preview at 30 fps for 1080p on web and 4K on desktop; the entry bundle stays under the 350 KB check
  because the pipeline, shaders and models load on demand.

## Phased roadmap

Four phases, about 34 to 42 weeks for one full-time developer, each ending at a gate that must pass before the next
starts. Phase 0 delivers nothing visible but is what makes every later phase cheap.

The **Progress** column is updated as work lands; every work item's own status is in
[EDITOR-IMPLEMENTATION.md](EDITOR-IMPLEMENTATION.md#progress).

| Phase | Progress | Effort (estimate, one developer) | Web and desktop | Desktop only | Gate to the next phase |
| --- | --- | --- | --- | --- | --- |
| 0. Foundation | **Done** (9 of 9; merged in #18) | about 6 to 8 weeks | GPU render graph with WebGL2 fallback; today's looks ported to shaders; golden-image parity tests | Native frame path for big files | Exports match today's Canvas 2D output |
| 1. Advanced photo | **In progress** (6 of 12: light and white balance, tone curve and colour mixer, detail and effects, presets and LUTs, saved presets, brush masks) | about 8 to 10 weeks | Light, curves, HSL, white balance; detail, LUTs, saved presets; brush, gradient and AI masks | RAW via LibRaw; 16-bit TIFF export | Masked edits stay smooth at 1080p on the web |
| 2. Timeline | To do (0 of 12) | about 10 to 12 weeks | Tracks, ripple and roll edits; keyframes, transitions, speed; audio tracks, voice-over, ducking | Proxies and frame cache; longer, larger projects | A 4K multi-track timeline plays smoothly on desktop |
| 3. Colour and finish | To do (0 of 9) | about 10 to 12 weeks | Wheels, curves, qualifiers, LUTs; scopes and auto captions; spot heal and clone | HEVC 10-bit, ProRes, HDR; AI object removal | Last phase |

Each phase ships as its own release with docs, self-test checks and MCP tools for its features. The efforts are
estimates from the size of the current engines, not measured; refine them after Phase 0, when the shader pattern is
known.

## Risks, licensing and open questions

The largest risk is the rendering rewrite: it touches every export, so it must ship behind the existing Canvas 2D path
and match it pixel for pixel before switching over.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| GPU pipeline differs from the Canvas 2D output | Exports change look; print files drift | Golden-image tests in the self-test; keep Canvas 2D as fallback until parity |
| WebGPU missing (Firefox, older Safari) | Effects unavailable | WebGL2 backend for the same shaders; CPU path for exports only |
| Bundle size (shaders, AI models) | Entry chunk over the 350 KB budget | Load the pipeline and models with `import()` on first use, as AI code is today |
| On-device models are large | Slow first use on mobile data | Download on demand with progress; cache in OPFS; desktop bundles them |
| Memory with many 4K clips in a tab | Tab crashes | Keep web limits; proxies and disk cache on desktop |
| Masking and healing quality expectations set by Adobe | Users judge harshly | Ship brush and gradient masks first; label AI masks as refinable |
| New features in agent tools | MCP tools fall behind the UI | Add tools in the same change, as for existing features |

**Licensing to check before adding a dependency** (the full policy and checklist are in [LICENSING.md](../LICENSING.md))

- LibRaw: LGPL 2.1 or CDDL 1.0. Link dynamically in the desktop app and ship its notices.
- FFmpeg: use an LGPL build only (no GPL encoders such as x264) to stay compatible with the MIT app; hardware encoders
  via the OS.
- MediaPipe: Apache 2.0 code; check each model's own card before bundling.
- Mediabunny: MPL-2.0, already in use.

**Open questions**

- Should the web keep feature parity with desktop for editing, with only inputs and outputs gated, as proposed?
- Is HDR delivery wanted at all, or only SDR with better grading?
- Which speech model for captions, and is Hindi and Hinglish accuracy good enough?
- Do presets and LUTs need to sync between devices, given there is no server?

## Sources

Opened on 2 October 2026.

- [Can I use: WebGPU](https://caniuse.com/webgpu)
- [Can I use: WebCodecs](https://caniuse.com/webcodecs)
- [Can I use: File System Access API](https://caniuse.com/native-filesystem-api)
- [MediaPipe Image Segmenter](https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter)
- [LibRaw: about and licensing](https://www.libraw.org/about)
- [ffmpeg.wasm FAQ](https://ffmpegwasm.netlify.app/docs/faq)
- Chitthi's own [MEDIA-STUDIO.md](../MEDIA-STUDIO.md) and `src/engine/` (version 2.8.0)
