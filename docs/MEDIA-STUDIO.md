# Photo & video studio

The photo & video studio (`#/instagram`; **Tools → Photo & video studio** on the site pages, **More → Photo & video
studio** in the print studio, **View → Photo & video studio** on desktop) makes three things from the user's photos
and clips, all on the device:

| Mode | Route | Makes |
| --- | --- | --- |
| **Instagram photos** | `#/instagram` | Up to 20 photos in one Instagram format, with text, stickers and drawings; JPEG, PNG or WebP files (AVIF where the browser writes it), or shared to the Instagram app |
| **Reels & Shorts** | `#/instagram/video` | A vertical (or 4:5, 1:1) MP4 for Instagram Reels and YouTube Shorts, shared or downloaded |
| **YouTube video** | `#/instagram/youtube` | A 16:9 MP4 (a vlog or any YouTube video) edited on a timeline and saved straight to a file |

## The workspace

All three modes share one layout (`src/components/studio/`), built like a desktop editor:

| Area | What it holds |
| --- | --- |
| Top bar | The Chitthi Studio mark (home), **Projects**, the three modes, the save status, undo and redo, the format menu, **Export** |
| Tool rail | Under **Add**: Photos / Media, Text, Elements (shapes and stickers), Draw, Audio (video); under **Edit**: Masks (photo), Transitions (video), Layers. A second click hides the panel. **Compact rail** at its foot (or **Ctrl + \\**, Cmd + \ on a Mac) switches between icons with labels and icons only, remembered on this device for both studios. In a window 720 px tall or less, Draw moves into **More** (video) |
| Tool panel | The chosen tool: the project's media pool, text styles, shapes and stickers, brushes, sound and loudness, the layer list |
| Stage | The canvas on a dark surface, sized to fit; layers are edited right on it |
| Inspector | Whatever is selected: a layer's properties (and its timing on video), else the photo's or clip's settings |
| Dock | The photo strip (drag to reorder), or the video transport and timeline |
| Export | A sheet with the file settings, the caption, and the share, download or save buttons |

At 1280 px and wider every area has its own column; narrower windows put the tool panel and inspector in one column on
the right; phones stack the stage, the dock, the tools and the panels in one scrolling column.

**Sections fold, one open at a time.** The settings in a panel or the inspector are grouped in sections (Light,
Colour, Detail…; Timing, Speed, Position and size…; Add sound, Record voice, Recordings, Tracks, Loudness). Clicking a section's title
opens it and closes the others; clicking the open one closes it. Each panel remembers the section used last, for each
mode, on this device, and opens it again next time. A closed section's title shows a short summary when it holds
something ("Changed", "2×", "Music · 2 tracks"). What a panel is for (the media and mask lists, adding text) and what
the inspector is showing (the clip's or sound's name, a missing file) stay above the sections. A
section opens by itself when it is needed: **Shift + R** opens Record voice, choosing a mask opens Selected mask.
Section titles are buttons: **Tab** moves between them, **Enter** or **Space** opens or closes one. The print studio's
steps work the same way, with **Collapse all** to close the open one.

## Saved projects

Every photo post and every video is a **project**, saved on this device as you work; there is no Save button.

- **Autosave.** A change is saved 2 seconds after the last one (a drag or a slider saves once, when you let go), and at
  once when the tab is hidden, the window closes or the app quits. The top bar says **Saved**, **Saving…** or
  **Not saved:** and why. A save is all or nothing: after a crash or a power cut a project opens as it was at its last
  complete save, losing at most the last 2 seconds of edits.
- **Projects.** The **Projects** button at the left of the top bar lists a studio's projects, newest first, with a
  thumbnail, the kind (Reel, YouTube or photo post), the length or number of photos, when it last changed and the space
  it takes. **New**, **Open**, **Rename** (F2), **Duplicate** and **Delete** (it asks first and says how much space it
  frees). Arrow keys move through the list and Enter opens a project. A new project is named after its kind and the
  time ("Reel · 19 Oct 14:02"). Reels, Shorts and YouTube videos share one list; opening one switches the studio to its
  mode. Opening a studio reopens the project you used last; the home screen has **Continue:** with your latest one.
- **What a project keeps.** The video's clips, tracks, sounds, layers, transitions, keyframes, speed changes, loudness
  and settings, and where the playhead was; the photo batch with every edit, mask and layer, the caption and the export
  settings. Thumbnails, filmstrips, previews and waveforms are kept beside it, so a project opens complete without
  reading every file again (they are made again in the background if missing). Undo history starts empty.
- **Media.** In the browser each photo, video and sound file is copied into the site's own storage the first time it
  is added (once, however many projects use it). The desktop app doesn't copy your files: a project points to them
  where they are, and only files the app made itself go into its data folder. Deleting a project removes the copies no
  other project uses; your own files on disk are never deleted, moved or changed.
- **Space.** The list shows the space projects take and, in the browser, how much the browser allows this site. At
  90 % you are warned once. A file that doesn't fit is refused with the space left. Browsers may clear a site's storage
  when the device runs low: **Keep my projects** asks the browser not to.
- **Missing files.** A file that moved, changed or was deleted shows as a hatched placeholder with its name; the
  project still opens and the rest plays, but exporting waits until the files are back. In the desktop app, **Find
  file…** (in the clip's inspector, or the bar over the timeline) asks where it is now; other missing files in the same
  folder are found with it.
- **One window at a time.** Opening a project in a second tab or window takes it over: the first one stops saving and
  says **This project is open in another window**, with **Open here again**.
- **Moving projects** to another computer (a project file with its media) comes later (409). The print studio's
  gallery is separate and unchanged.

## Instagram photos: formats

One batch uses one format, because Instagram crops every photo of a carousel to the first photo's shape. Every format
is 1080 px wide.

| Format | Ratio | Pixels | Use |
| --- | --- | --- | --- |
| Portrait (default) | 4:5 | 1080 × 1350 | Feed posts and carousels; the most space in the feed |
| Square | 1:1 | 1080 × 1080 | Feed posts and carousels |
| Tall portrait | 3:4 | 1080 × 1440 | Feed posts and carousels in the newer shape that matches the profile grid |
| Landscape | 1.91:1 | 1080 × 566 | Feed posts and carousels |
| Story | 9:16 | 1080 × 1920 | Stories and Reel covers, not feed carousels |

Files are JPEG (default; sRGB, quality 60–100, default 92), PNG, WebP, AVIF or **TIFF (16-bit)**. WebP and AVIF are
for websites and messages (post JPEG to Instagram) and are offered only where the browser can write them, found by
encoding a tiny picture (`src/engine/photoExport.ts`); every file is checked to be the type asked for. TIFF is for
printing and further editing: 16 bits per channel, uncompressed (about 9 MB for 1080 × 1350), offered where the graphics
card can render in floats (WebGPU, or WebGL2 with float targets), on the web and in the desktop app. Chrome, Edge, Firefox and the
desktop app write WebP; AVIF stays hidden until a browser writes it. The app warns when a file is over 8 MB, the limit of
Instagram's publishing API. Data: `src/data/instagram.ts`.

| Limit | Value | Where it shows |
| --- | --- | --- |
| Photos in a carousel | 20 | Batch size: presets 2, 4 and 10, or any number from 1 to 20 |
| Caption | 2,200 characters, about 125 shown before "more" | Counter under the caption |
| Hashtags | 30 | Counter under the caption (turns red above 30) |

Sources, checked on 1 October 2026: [Instagram Graph API: IG User Media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/)
(publishing specs), [Sked Social size guide](https://skedsocial.com/blog/best-instagram-image-and-video-size-recommendations),
[Instacarousel 2026 specs](https://instacarousel.com/blog/instagram-carousel-size-dimensions-2026/) (20-photo carousels,
the 3:4 format), [Outfy character limits](https://www.outfy.com/blog/instagram-character-limit/) (caption and
hashtags). Re-check these when Instagram changes its app; only `src/data/instagram.ts` needs updating.

## Editing

The Photos editor's tools are in the rail; the selected photo or layer is edited in the inspector.

**The photo** (inspector, when no layer is selected). **Fill the frame** (cropped) or **Whole photo** (with a colour or blurred-photo background), zoom (1–4×),
position by dragging or arrow keys, rotate, mirror, then:

- **Presets and LUTs:** the print studio's looks (Vivid, Warm, Cool, Black and white, Hand-tinted, Vintage) as
  built-in presets; a preset sets only what it holds, so these change the look and keep every slider. **Import .cube**
  adds a 3D LUT (the Adobe / Resolve `.cube` format, 2 to 65 points per side, up to 16 MB), applied with an amount
  slider; it runs last in the colour chain, after the mixer. Imported LUTs stay on this device (IndexedDB, in the
  browser and the desktop app) for every photo and clip, until removed. Files that aren't a usable 3D LUT (a 1D LUT,
  a wrong number of values, a size over 65) are refused with the reason (`src/engine/lut.ts`).
- **Saved presets:** **Save as preset** keeps every colour setting of the photo (or clip) under a name; saved presets
  join the built-in ones and apply in one click. **Your presets** renames them, deletes them, applies one to every
  photo of the batch (**To all**, one undo step), and exports or imports them as a preset file (JSON). A preset file
  carries the LUTs its presets use, so they work on another device; importing the same preset twice adds it once, and
  a taken name gets a number. Presets are kept on this device: IndexedDB in the browser, `library/presets/` in the
  desktop app's data folder. There is no syncing between devices; the file is how presets travel
  (`src/engine/presets.ts`, `src/state/presets.ts`).
- **Light:** exposure (±4 stops), contrast, highlights, shadows, whites and blacks.
- **Colour:** temperature and tint, with **Pick a neutral grey** (click something that should be grey or white and the
  white balance is set from it; Escape cancels), and saturation.
- **Tone curve:** an RGB curve and one each for red, green and blue. Click the graph to add a point and drag it,
  double-click a point to remove it; or Tab to a point, move it with the arrow keys (Shift for bigger steps) and remove it
  with Delete. Points are joined by a smooth curve that never overshoots them (`src/engine/curve.ts`).
- **Colour mixer:** hue, saturation and luminance for eight colour bands (red, orange, yellow, green, aqua, blue,
  purple, magenta). Colours between two bands get a blend of both, and greys are never changed (`src/engine/hsl.ts`).
- **Detail:** sharpening (with radius and edge masking, which leaves smooth areas such as skin and sky alone) and noise
  reduction (an edge-preserving filter).
- **Effects:** clarity (local contrast in the mid-tones), dehaze (removes or adds haze), vignette and grain.

Detail and effect sizes are set for a frame 1080 px wide and scaled to the frame being drawn, so the preview, the
exported photo and a 4K video frame look the same (`src/engine/detail.ts`). On the graphics card they add about 1–2 ms
to a 1080 × 1350 frame; without one (Canvas 2D) clarity, sharpening and noise reduction together take about 0.8 s, so
the preview follows the sliders slowly there.

Exposure, white balance and the four tone sliders work in linear light (`src/engine/light.ts`): exposure behaves like
the camera's, white balance like changing the light, and the tone sliders move the brightness of all three channels
together so colours keep their hue. Brightness and warmth from 2.8 still work (the video editor and older edits use
them) and appear in the photo inspector only when set. **Apply this look to all photos** copies the frame, background,
preset, LUT and adjustments, but not the position or rotation. The first photo is the cover; drag photos in the strip to reorder them
(or Alt + ← / → on a focused thumbnail).

**Masks** (rail). Local adjustments: a mask limits its own settings to part of the photo. A new mask starts as one of
five kinds (shown in red while the tool is open; **Show the mask in red** turns that off):

- **Brush:** drag on the photo to paint. Size (shown as a circle at the pointer), feather (hard edge to soft) and flow
  (how much one pass adds; passes build up); **Erase** takes away.
- **Linear gradient:** full on one side, fading to nothing across its length (a sky). Drag on the photo to draw it from
  where it is full to where it ends, or drag its centre or end handle.
- **Radial gradient:** full inside an ellipse, fading out over its feather (a spotlight; invert it for a vignette).
  Drag to draw a circle, or drag its centre and its two radius handles (the first also turns it).
- **Colour range:** the photo's colours near one picked by clicking the photo, in light and in shade (OKLab distance),
  with how wide a range.
- **Brightness range:** the photo's tones between a darkest and a lightest, with soft edges; a click on the photo
  picks the tones around that brightness.

**Found by AI** (**Find: Subject, Background, Sky**). An AI model on this device finds the photo's main subject or its
sky; the background is the subject inverted. Photos never leave the device. To refine the result, paint on the photo:
Paint adds a brush part that adds to the mask, Erase one that takes away. **Subject** and **Sky** can also be added as
parts of any mask (a sky narrowed by a brightness range, say). The subject model (U²-Net-p, 4.6 MB) ships with the
app and takes about a second per photo. The sky model (skyseg, 176 MB) is too big to ship: the first sky mask asks
before downloading it from Hugging Face, the file is checked against its SHA-256, and it is kept on the device (the
browser's private file storage; in the desktop app, inside its data folder), so it downloads once. **Settings › AI ›
AI models on this device** shows whether it is there and deletes it to free the space; it is downloaded again, after
asking, when a sky mask next needs it. Each map is made
once per photo and kept for the session; the export uses it at full size. The models find one main subject well; in
a busy scene with many small things (a field of flowers) the subject mask may cover only some of them, and a photo
without sky can still get a faint sky mask, so check the red overlay (`src/ai/segment/`, `src/engine/segments.ts`).

Gradient and range settings are sliders in the panel too, so a mask can be shaped entirely from the keyboard. Ranges
select by the photo's own colours, before its settings, so editing the photo doesn't move them. A mask's settings are in the inspector: exposure, contrast, highlights, shadows,
whites, blacks, temperature, tint, saturation, clarity, dehaze, sharpening and noise reduction, applied on top of the
photo's own settings only where the mask is. A mask can be inverted, switched off, renamed or deleted; it is made of
parts (**Add a brush part**), each joining the parts before it by adding, subtracting or intersecting, and each
invertible; a range added as a later part intersects by default, so it narrows the shape (the dark tones of the sky).
Up to 16 masks per photo, 8 parts per mask. Masks belong to the photo, not the frame: moving, zooming,
turning or mirroring the photo takes them along. Painting is undone stroke by stroke. Masks stay with their photo
(**Apply this look to all photos** and presets don't copy them).

**Text, Elements and Layers** (rail). Layers over the photo, edited in the inspector when selected:

**Images, blend modes and layer masks.** **Elements → Add an image** puts a picture over the photo as a layer (a logo,
a frame, a texture; PNG transparency kept; kept at up to 2048 px for the session). Every layer has a **Blend** mode
(multiply, screen, overlay, soft and hard light, darken, lighten, colour dodge and burn, difference, exclusion, hue,
saturation, colour, luminosity) and can have a **mask**: a **Fade** (linear) or a **Spot** (radial), placed within the
layer so it moves, turns and grows with it, set by sliders and invertible. A masked layer shows only inside its own box
(a drawing's glow beyond it is cut). These work the same in the video editor's layers.

| Layer | What it offers |
| --- | --- |
| Text | Six one-tap styles (Classic, Outline, Label, Elegant, Script, Handwritten); any of the 46 fonts or the user's own; size, box width, alignment, bold, italic, colour, outline, background and shadow |
| Shapes | Rounded box, box, label, circle, speech bubble, burst and ribbon (each holds words, with its own font, size and colour), plus star, heart, arrow and line; fill, border and height |
| Stickers | 40 emoji, drawn with the device's own emoji font |
| Drawings | Freehand strokes (Draw tab), moved and resized as one layer |

Every layer can be dragged, resized from its corner handle, turned from its top handle (snapping to right angles),
nudged with the arrow keys, sized with + and −, made transparent, hidden, moved forward or back, duplicated and
deleted (Delete key). Double-clicking text jumps to its text box. **Copy these layers to every photo** puts the same
title or sticker on the whole batch.

**Draw.** Pen, marker, highlighter and neon brushes, any colour, 0.5–4× size. Strokes go into the selected drawing,
so a drawing stays one layer; **Start a new drawing** begins another. Draw over shapes to write or sketch on them.

**Undo and redo** (buttons, Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z) cover every edit in the batch, 80 steps deep. A drag or
a slider movement is one step.

Photos come from the device (file picker or drag and drop) or from the photo library. JPG, PNG and WebP up to 25 MB,
the same checks as the print studio.

## RAW photos

Camera RAW files (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW and more; up to 300 MB) can be added to the batch.

- **Desktop app:** the file is developed by LibRaw (its `dcraw_emu` program, run by the main process: camera white
  balance, sRGB primaries, linear 16 bits, half size, which is still well over the 1920 px a post needs). The editor
  shows an 8-bit preview made from it and edits it like any photo; each export develops it again, so the batch holds
  only the file. Exported as **TIFF (16-bit)**, the photo keeps the RAW's precision through every edit: a deep shadow
  pushed three stops keeps about 930 tones where an 8-bit file keeps 57. The page sends LibRaw the file's bytes, never
  a path, and the file is developed in a private temporary folder that is deleted straight after (`electron/raw.cjs`).
- **Web app:** a browser can't run LibRaw, so the RAW file opens the full-size JPEG preview every camera stores inside it
  (`embeddedJpeg()`), with a note that the desktop app opens the full RAW.

**How the 16-bit TIFF is made** (`src/engine/deep.ts`). The photo is placed on the frame in floats from its linear
source (the developed RAW, or an 8-bit photo decoded), then goes through the same colour, detail and mask programs as
the preview on the graphics card, with every rounding step left out (half-float intermediates), and is read back as
floats. The background and the vignette follow the 8-bit picture's own rules; text, stickers and image layers are added
as the difference they make to the 8-bit picture, so every blend mode works and the photo under them keeps its
precision. The self-test holds the 16-bit picture to the 8-bit one within 4 levels on both GPU backends. The TIFF
writer is our own (`src/engine/tiff.ts`).

## Export and posting

- **Download all (ZIP)**: `chitthi-instagram-4x5-01.jpg` … in one ZIP. Desktop: a save dialog.
- **Download as separate files** (web only): one download per photo.
- **Post to Instagram** works in two taps, because rendering takes a moment and the system share sheet needs a fresh
  tap: **Prepare N photos**, then **Share to Instagram**. The caption is copied to the clipboard (Instagram doesn't
  take a caption from the share sheet), then:
  - where the browser can share files (phones; Chrome and Edge on Windows): the system share sheet, where the user
    picks Instagram;
  - otherwise, and in the desktop app: the photos are saved as a ZIP and instagram.com opens, where the user chooses
    **Create (+)**.
  - Some phones refuse to share more than 10 files at once; the app then saves the photos instead and says so.

Direct publishing through Meta's Graph API was considered and left out: it needs a Meta developer app, a Business or
Creator account, an Instagram login, and photos hosted on a public server for Instagram to download, and it allows only
10 items per carousel and JPEG only. Chitthi has no server. If that changes, publishing would slot in beside the share
step.

## How it works

| Part | File |
| --- | --- |
| Formats, limits, looks; built-in presets | `src/data/instagram.ts`, `src/engine/presets.ts` |
| `.cube` parser, tetrahedral lookup and the LUTs loaded this session; imported LUTs on the device | `src/engine/lut.ts`; `src/lib/userLuts.ts` |
| Saved presets: validation (`mergePreset`) and the preset file; the list and its storage | `src/engine/presets.ts`; `src/state/presets.ts` |
| Masks: model, `mergeMasks()`, the brush raster, laying a mask on the frame; on the GPU | `src/engine/masks.ts`, `maskGate.ts`, `maskBrush.ts`, `maskRaster.ts`, `maskPlace.ts`; `src/engine/gpu/mask.ts` |
| Masks panel and the mask's settings (inspector) | `src/components/ig/MaskPanel.tsx` |
| AI masks: the models, their download and check, the worker (ONNX Runtime Web); the maps kept per photo; panel status | `src/ai/segment/`; `src/engine/segments.ts`; `src/components/ig/useAiMask.ts` |
| RAW files: developing with LibRaw (desktop); RAW names, the embedded preview, 8-bit previews from 16-bit data | `electron/raw.cjs`, `scripts/fetch-libraw.mjs`; `src/engine/raw.ts` |
| The 16-bit render and the TIFF writer | `src/engine/deep.ts`; `src/engine/tiff.ts` |
| Presets, LUTs and saved presets panel (both editors) | `src/components/ig/LookPicker.tsx` |
| Colour settings (look, sliders, vignette) as parameters, and `mergeAdjust()` to validate them | `src/engine/adjust.ts` |
| Placement, applying the colour, drawing a post (no UI); `mergeEdit()` validates edits from outside the app | `src/engine/instagram.ts` |
| Batch state, adding photos, rendering and zipping | `src/state/instagram.ts` (state, undo, edits); `instagramLayers.ts`, `instagramMedia.ts`, `instagramExport.ts` |
| Layers: text, shapes, stickers, drawings; drawing, picking, handles | `src/data/layers.ts`, `src/engine/layers.ts`, `layerDraw.ts`, `layerPick.ts`, `layerGate.ts` |
| Layer editing on a preview, layer panels (shared by photos and video) | `src/components/ig/useLayerPointer.ts`, `src/components/ig/LayerPanel.tsx` (adding, the list, the brush), `LayerProperties.tsx` (the selected layer), `LayerControls.tsx` (swatches, range) |
| Video formats and limits; frame drawing; MP4 export (frames from `framePlan`, sound from `audioPlan`) | `src/engine/videoFormats.ts`; `src/engine/video.ts`; `src/engine/videoExport.ts` |
| Decoder pool (lanes, look-ahead, frame and byte limits) and its frames from Mediabunny; the preview's picture source, the fallback note, clip sound | `src/engine/decodePool.ts`, `src/engine/frameSource.ts`; `src/components/studio/previewFrame.ts`, `src/components/studio/previewSound.ts` |
| Video project as tracks: clips at a start time, gaps, hide / mute / lock, the frame and sound plans, the project document and its validator `mergeProject()` (layers through `mergeLayers()`) | `src/engine/timeline.ts`, `tracks.ts`, `soundPlan.ts`, `projectDoc.ts`, `projectGate.ts`; `src/engine/layerGate.ts` |
| Edit operations: ripple delete, lift, close gaps, trim, roll, slip, slide, move to a time, reorder, nudge, snapping, `checkTrack` | `src/engine/edits.ts` |
| Video state: kind, tracks (hide / mute / solo / lock, heights), Magnetic, edit tool, Snap, clips, layers, sound clips, loudness, playhead, undo, lock guards, export | `src/state/videoStore.ts` (state, history, `change`); actions in `videoTracks.ts`, `videoClips.ts`, `videoBox.ts`, `videoKeys.ts`, `videoLayers.ts`, `videoTransitions.ts`, `videoMedia.ts`, `videoSound.ts`, `videoExportJob.ts`; the background scans in `soundScan.ts` |
| Sound (208): sound clip edits, the gain chain, scans and waveforms, ducking, loudness and the limiter; the export's sound | `src/engine/soundClips.ts`, `mixGain.ts`, `soundScan.ts`, `ducking.ts`, `loudness.ts`, `loudnessTargets.ts`, `limiter.ts`; `src/engine/exportSound.ts` |
| Streaming a file to disk (desktop IPC, File System Access) | `src/lib/fileSink.ts`; `desktop:openWrite` / `write` / `closeWrite` in `electron/main.cjs` |
| Workspace: shell, photo editor, video editor, timeline, export sheet | `src/components/studio/` (`Shell.tsx`, `PhotoWorkspace.tsx` with `PhotoStage.tsx`, `PhotoEditPanel.tsx`, `PhotoPanels.tsx`, `PhotoStrip.tsx`, `PhotoExport.tsx`, `VideoWorkspace.tsx` with `VideoStage.tsx`, `ClipInspector.tsx`, `VideoPanels.tsx`, `VideoExport.tsx`, `AudioPanel.tsx`, `SoundInspector.tsx`, `Timeline.tsx` with `PictureRow.tsx`, `SoundRow.tsx`, `CutMarks.tsx`, `TimelineBars.tsx`, `TrackHead.tsx`, `Transport.tsx`, `Dialog.tsx`), `src/components/InstagramStudio.tsx` (routes the modes) |
| Styles | `src/styles/36-media-studio.css` (workspace, timeline), `src/styles/35-instagram.css` (panels and controls) |
| Agent tools for the photo studio (MCP): batch, framing, colour, masks, presets, LUTs, preview, export | `src/agent/photoTools.ts` |

The preview, the thumbnails and the exported files all go through `renderIg()` and `drawLayers()`, so the files match
the preview. Layer positions are shares of the frame and sizes are shares of its width, so layers keep their place at
any preview size and in every export.

**Graphics card.** The looks and colour sliders run on the graphics card (WebGPU, or WebGL2 where WebGPU is missing)
through `src/engine/gpu/`: the photo is placed on a layer with Canvas 2D, its colour is processed on the GPU, and layers
and the vignette are drawn on top with Canvas 2D. It is on by default (**Settings → Photo & video effects**) and gives
the same pixels as the Canvas 2D path, which is used when it is off, when the browser has no GPU access, or if the GPU
fails on a frame. The self-test compares the two on real photos (at most 2 levels apart, 0.067 on average). A LUT
goes to the GPU packed into a 2D texture (one tile per blue slice; 585 × 520 for 65³), uploaded once and kept while it
is in use, and is read texel by texel with the same tetrahedral interpolation as the Canvas 2D path.

**Masks on the GPU.** A mask is rasterised once, in plain code, at a size that follows how big the photo is shown
(256 to 2048 px on its longer side), then laid on the frame as one byte per pixel; both paths read those bytes, so
they get the same mask. The picture so far, with the mask's settings applied, is mixed in by the mask. Rasters are
cached by the mask's shape, so moving a mask's slider costs no mask work, and while painting only the newest piece of
the stroke is drawn; gradients are worked out only where they change. Measured on a 1080 × 1350 frame with two
masks: 6–9 ms per frame on the GPU, 22–27 ms while painting, 26–29 ms while dragging a gradient (both backends,
desktop app on Windows); about 0.45 s on Canvas 2D. A 1080 ×
1350 frame with a look takes about 6 ms on WebGPU and 11 ms on WebGL2, against 24 ms on Canvas 2D (desktop app, Windows).

**Agents.** The desktop app's MCP server ([MCP.md](MCP.md)) can edit photos too: add them to the batch, set any
colour setting, add and shape masks, use and save presets, import LUTs, look at a preview and export. The tools call
the same store actions as the panels and pass the same validators (`mergeAdjust`, `mergeMasks`, `mergeEdit`), so an
agent can set nothing a panel couldn't; in a live session each change is selected and on the Undo stack.

**Memory.** Each photo keeps its original file (compressed) and a preview copy of at most 1080 px; 20 photos stay
around 100 MB. Full-size pixels exist only while one photo is being exported. The batch lasts for the session; the
format, batch size and file settings are remembered.

**Tests.** Unit: `tests/unit/engine/instagram.test.ts` (formats, limits, placement, colour maths) and
`tests/unit/engine/layers.test.ts` (layer scaling, rotation, timing, drawing strokes, the video timeline, motion and fades;
`mergeLayers`), `tests/unit/engine/timeline.test.ts` (the track model against the frozen 2.x code in `tests/support/timeline.testkit.ts`:
clip placement, frames and sound sources for every 2.x shape; hide, mute and lock; the project document, its round
trips and 36 malformed documents), `tests/unit/engine/edits.test.ts` (every edit at its limits, Magnetic on equal to 2.x's
edits, 1,000 seeded random edits per operation through `checkTrack` and `mergeProject`, each operation under 2 ms on
500 clips) and `tests/integration/state/video.test.ts` (the store's edits, undo steps and Magnetic).
Browser: `tests/e2e/instagram.e2e.ts` (batch limit, edit, reorder, ZIP of 1080 px JPEGs, posting flow, caption, accessibility)
and `tests/e2e/editors.e2e.ts` (layers, drawing, undo, delete; a Reel exported with text and music and checked for `ftyp`,
`moov` before `mdat`, H.264, AAC and 1080 × 1920; timeline trim and reorder by dragging, split and delete; a YouTube
video streamed into a stand-in for the save picker and checked for fast start and 1920 × 1080; clips placed end to
end; the track headers: Hide, Mute, Lock and its refusals, heights by keyboard, undo, axe and 360 px; the edit tools:
Magnetic and gaps, Shift ripples, Roll, Slip and Slide by drag and keys, Q / W, snapping on, off and with Alt, the
tool keys, a locked track refusing each, announcements, axe and 360 px; accessibility).
Self-test: 200 preview frames (4 formats × 5 projects × 10 times) drawn through the 2.x placement and the track model
are compared byte for byte; exports with the video track hidden (decoded: black with the layers), the music muted
(no sound track) and a 1.5 s gap (45 black frames with the layers, the photos either side). Agents:
the self-test draws an AI mask from a stand-in map, runs the real subject model in its worker and checks the sky model
is never downloaded without consent; `tests/e2e/instagram.e2e.ts` finds a subject with the real model under the production
CSP (desktop project). RAW and 16-bit: Vitest checks the TIFF writer, the embedded-preview reader and a synthetic DNG
(`syntheticDng()`, made by the tests, so no camera file or licence is involved); the self-test checks float read-back
and holds the 16-bit render to the 8-bit picture on each backend; `npm run test:mcp` develops the synthetic DNG with
LibRaw and exports a 16-bit TIFF; e2e opens a RAW's preview on the web and exports a TIFF. The self-test also drives
every photo tool on a generated photo (settings and their clamping, white balance, masks seen in
the preview, a LUT, presets in and out, export), and `npm run test:mcp` edits a sample photo over MCP.

## Video editor: Reels, Shorts and YouTube

**Reels & Shorts** and **YouTube video** are one editor with two kinds of project. Switching between them keeps the
clips, layers and sound and changes the frame and limits.

| | Reels & Shorts | YouTube video |
| --- | --- | --- |
| Formats | 9:16 (1080 × 1920), 4:5 (1080 × 1350), 1:1 (1080 × 1080) | 16:9 Full HD 1080p; 2K 1440p and 4K 2160p in the desktop app |
| Frame rate | 30 fps; 60 in the desktop app | 30 fps; 60 in the desktop app |
| Bitrate (standard / high) | 5 / 7.5 Mbit/s | YouTube's recommended SDR uploads: 8 Mbit/s at 1080p30, 12 at 60, 16 / 24 at 1440p, 40 / 60 at 4K; high is half as much again |
| Export | Built in memory, then **Share to Instagram** (share sheet), **Save and open Instagram**, or download | Written straight to a file the user chooses, then **Open YouTube upload** |
| Shortest | 3 seconds (Instagram's minimum) | 1 second |

Every MP4 is H.264 with AAC sound at 48 kHz stereo (128 kbit/s) and its index (`moov`) at the front ("fast start"),
which Instagram requires and YouTube processes fastest. Instagram's requirements, from the
[publishing API specs](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/):
MP4, `moov` at the front, no edit lists; H.264, progressive, 4:2:0, 23–60 fps; AAC at most 48 kHz, mono or stereo;
3 seconds to 15 minutes; at most 300 MB. YouTube's bitrates are from its
[recommended upload encoding settings](https://support.google.com/youtube/answer/1722171).

### The media pool

The **Media** tool lists every file in the project: videos, photos, sound files and voice recordings, each with a
thumbnail (a sound shows a small waveform), its name, its length (video and sound), its kind and how often it is used
("Used 2×", "Not used"). A sound's kind is the kind of the track its first use is on (**Music**, **Voice** or
**Effects**); a recording is **Voice**, a sound nothing uses **Sound**.

- **Importing:** the Media panel's drop zone or **Choose videos, photos or sound** (or **Use the photos from Photos**)
  puts files in the pool only, as one undo step. The empty stage's **Add videos or photos** and files dropped on the
  timeline still go straight onto the timeline, and show in the pool too.
- **Finding:** filter **All · Video · Photo · Sound · Recordings** (recordings are sound too) and search by name.
- **Adding:** double-click a file, press **Enter** on it, or its **+** button to put it at the playhead: a video or photo
  on the main video track, a sound on the Music track, a recording on a Voice track (made when there is none). Or drag
  it onto a track at the time you want (above the top track for a new overlay track). Each is one undo step.
- **Removing:** the bin button takes a file out of the project. A file in use asks first and names the clips that use it,
  which go with it; Ctrl + Z brings everything back.
- A file that is missing (moved, changed or cleared) says so and offers **Find file…** in the desktop app.
- The pool is saved with the project: files nothing uses are kept and reopen with it, and a recording stays listed as
  a recording. Projects from before the pool open with every file they use in it.

### The timeline

| Action | How |
| --- | --- |
| Seek | Click the ruler or an empty part of a track; drag to scrub; drag the red playhead |
| Reorder or place clips | Drag a clip along the video track (Select tool); a marker shows where it will land: its place in the order with **Magnetic** on, the time it goes to with Magnetic off |
| Trim | Drag a clip's left or right edge (videos: in and out points; photos: how long they show); Shift ripples with Magnetic off |
| Roll, Slip, Slide | Pick the tool (V / R / Y / U), then drag a cut, a video clip, or a clip between its neighbours (below) |
| Time a layer | Drag its bar to move it in time, or its ends to change when it appears and disappears |
| Sound clips | Drag a sound clip like a picture clip; its top corners fade it, its volume line sets its volume ([below](#audio-tracks-sound-clips-and-the-mix)) |
| Split, duplicate, delete | Transport buttons, or S and Delete with the timeline focused; Shift + Delete ripple-deletes |
| Nudge, trim to the playhead | Alt + ← / → moves the selected clip a frame with the tool (Shift + Alt: a second); Q / W trim its start / end to the playhead |
| Keyframes | K sets keyframes at the playhead for the selected clip's or layer's animated values (or removes the ones there); Alt + [ / ] jump to its previous / next keyframe; its keyframe lane is under its row (below) |
| Transitions | Click a cut between two touching clips (or press Enter on it) to choose one; drag a transition's edges to change its length; Delete removes it (below) |
| Speed, freeze frame | The selected video clip's **Speed** in the inspector; **Freeze** in the transport or Shift + F holds the frame at the playhead (below) |
| Zoom | Ctrl + wheel over the timeline, the zoom slider, + / −, or **Fit** |
| Play | The play button or Space; the timeline follows the playhead |
| Step | ← / → one frame, Shift + ← / → one second, Home / End |

Moves snap to clip edges, gap edges, layer edges, the playhead, the start and the end, within 8 px at the current
zoom; with **Snap** off, or Alt held while dragging, they follow the pointer to the frame. Video clips show a filmstrip
of eight frames taken from the part in use; photos show their thumbnail. Each clip also has **Starts at** / **Ends at**
sliders in the inspector, the full-size equivalent of the trim handles.

### Edit tools, Magnetic and gaps

The transport has a tool picker (Select, Roll, Slip, Slide; a radio group, so arrow keys move between them) and two
switches, **Magnetic** and **Snap**. With the timeline focused, V / R / Y / U pick the tool.

| Tool | Drag a clip | Drag an edge | Alt + ← / → (clip selected) |
| --- | --- | --- | --- |
| **Select** (V) | Magnetic on: reorder; off: put it at a time (the nearest free spot where it fits, or refused: "No room here") | Trim; ripple with Magnetic on or Shift | Magnetic on: one place in the order; off: a frame in time |
| **Roll** (R) | Selects it | Moves the cut between this clip and its neighbour: one gets longer as the other gets shorter, the video's length stays | Moves the clip's end cut |
| **Slip** (Y) | A video clip plays a later (right) or earlier (left) part of its source, in the same place and length; refused on a photo | As dragging the clip | Slips; with nothing selected, slips the song on the Music track |
| **Slide** (U) | Moves the clip between its neighbours: the one before ends later, the one after starts later, nothing else moves | As dragging the clip | Slides |

**Magnetic** (on by default) keeps the video track end to end, as before: deleting or trimming a clip pulls the later
ones along (the Video track only). Switched off, edits leave **gaps**: Delete lifts a clip and leaves its length empty, trims move only the
clip, and a clip can be dropped at any time. A gap plays black with the layers on top and the music going on, and
exports as black frames for exactly its length. Gaps are buttons in the video row ("Gap, 1.5 s, from 0:03.0"): click
one and press Delete to close it. Switching Magnetic back on closes every gap in one undo step (undoing it brings the
gaps back with Magnetic off). Magnetic belongs to the project and is kept when switching Reel ↔ YouTube; the tool and
Snap are view settings for the session. Layers and sound clips keep their own times when clips ripple.

Every edit is one undo step (a drag is one step however long), stops at 0.3 s, at a video's source and at the
project's length limit, and is refused with the reason on a locked track. A polite announcement tells screen readers
what changed ("Clip 2, 2.0 s to 4.0 s").

### Tracks

The timeline has a **Video** track (the main clips), any **overlay tracks** above it, and up to 8 **audio tracks**
(the **Music** track first); text,
shapes, stickers and drawings keep a row each, timed by **Appears at** and **Disappears at**. Each track's header, at
the left of the timeline, has:

| Control | What it does |
| --- | --- |
| **Hide** (Video, overlays) | The clips aren't drawn in the preview or the export (the Video track: black frames with the layers on top; an overlay: the tracks below show). Their own sound still plays (lower a clip's volume to silence it). |
| **Mute** (overlays, audio tracks) | The track is silent in the preview and the export; its pictures still show. The Video track's sound is set per clip. |
| **Solo** (audio tracks) | Only the soloed audio tracks play in the preview; the export plays every track that isn't muted. |
| **Lock** | The track's clips can't be selected, dragged, trimmed, split, duplicated or deleted, and the inspector shows them read-only; the editor says why. A locked track still plays and exports. |
| **Height** | Small (40 px), Medium (64 px) or Large (96 px), from a menu (arrow keys, Home / End, Enter, Escape). An overlay or audio track's menu also has **Move up**, **Move down** and **Delete** (asking first when the track holds clips). |
| **Name** (overlays, audio tracks) | Click it to rename the track (1–40 characters): Enter keeps the name, Escape cancels. |

Hide, Mute and Lock are undo steps; the height is a view setting that lasts for the session. Each control is a button
with a name for screen readers, usable from the keyboard; hidden and muted rows are dimmed, locked clips show a lock.

Behind this, a project is a set of tracks with clips at a start time (`src/engine/timeline.ts`, tracks in `tracks.ts`). With Magnetic on the
main video track places its clips end to end exactly as before, so every video looks and sounds the same as in 2.x;
with it off it keeps gaps. A project also has a document form (JSON, version 1, with `magnetic`) and one validator,
`mergeProject()`, which reads any document (a 2.x project without a version is converted; with Magnetic off, a clip
overlapping the one before is moved after it) and is the single way in for project data, ready for saving projects
later. The edits themselves are pure functions on the clips (`src/engine/edits.ts`), so agent tools can reuse them.

### Overlay tracks and picture-in-picture

Overlay tracks put clips **over** the Video track: B-roll over a talking clip, a face-cam in a corner, a logo, a photo.
Tracks higher in the timeline are drawn on top.

- **Add a track** with **+** at the top left of the timeline (above the track headers). A project holds up to 4 picture
  tracks in the browser and 8 in the desktop app, counting the Video track; at the limit the button says why.
- **Add clips to a track** by dropping photos or videos on its row (they land at the drop time) or on the time ruler
  (a new overlay track is made for them). A clip dragged up or down onto another row moves to that track; **Move to**
  in the toolbar does the same from the keyboard.
- **Place a clip** on the preview: select it (click it on the preview or the timeline), then drag its box to move it,
  the corner handle to resize it (it keeps its shape), the top handle to turn it (Shift: 15° steps). Moves snap to
  the frame's centre lines and edges (Snap off, or Alt held: no snapping). With the preview focused, the arrow keys
  move it 1 % of the frame, 10 % with Shift. Each drag is one undo step, and each change is announced to screen
  readers.
- **Position and size**, in the inspector: **Full frame** and four corner presets (35 % of the frame width, 4 % from
  the edges), and fields for X and Y (the box's centre, % of the frame), size (% of the frame width), rotation,
  opacity and corner radius.
- Overlay clips never ripple or close gaps (Magnetic applies to the Video track only): an overlay's gaps are
  see-through. A clip's **Fade in from black** fades an overlay clip in from see-through.
- **Videos on screen at once** are limited (3 in the browser, 5 in the desktop app, photos don't count): an edit that
  would show more is refused with the limit, so playback stays smooth.

The preview and the export draw the same stack of clips (`frameStack`, `src/engine/stack.ts`; `renderStack`,
`src/engine/video.ts`), so the file matches the preview. Each clip's box is saved with the project; a project without
overlays is drawn and exported exactly as before.

Per clip, in the inspector: duration (photos) or trim and sound volume (videos), movement for photos (still, zoom in
or out, pan four ways), fade in from black, framing (fill or whole picture with a blurred background, zoom, position)
and colour (the presets and LUTs of the photo editor, brightness, contrast, saturation, warmth). Layers are the same text, shapes, stickers and
drawings as photos, each with **Appears at** and **Disappears at** times; new ones start at the playhead.

### Keyframes

Keyframes animate a value over time: a clip moving across the frame, a picture-in-picture growing, a title flying in
and fading out, the sound dipping under a voice. What can be animated: a picture clip's **X, Y, size, rotation,
opacity and corner radius** (Position and size), a video clip's **Clip sound** (0–100 %), and a layer's **position,
size, turn and opacity**. A layer's size scales it whole, as the Size slider does (a title's font grows with it).

- **Start animating** with the diamond next to a value in the inspector (the layers' Position diamond animates X and Y
  together). An empty diamond: not animated; filled: a keyframe at the playhead; half filled: animated, between
  keyframes. Pressing it starts the animation with a keyframe holding today's value, adds a keyframe at the playhead,
  or removes the one there. Its menu has **Remove animation**, which keeps the value shown at the playhead.
- **Once a value is animated, any change at the playhead sets a keyframe there**: typing in a field, dragging the
  clip or layer on the preview, the arrow keys, the presets. The fields show the value at the playhead. To change the
  whole animation at once, remove it and start again.
- **Previous / next keyframe** buttons sit in the heading of the clip's Position and size group and of the layer's
  settings; Alt + [ / ] do the same with the timeline focused.
- **The keyframe lane**: under the selected clip's or layer's row, when it is animated, one row of diamonds shows its
  keyframe times; **Keys** in the timeline's header column shows a row per value as well. Click a diamond to select
  it, drag it to move it (it snaps to frames, the playhead and the clip's ends; Alt: to frames only), ← / → move it a
  frame (Shift: a second), Delete removes it. Enter, the context-menu key or a right click opens its menu: the
  interpolation, and **Delete keyframe**. K sets or removes keyframes at the playhead for every animated value.
- **Interpolations**: **Linear**, **Ease in**, **Ease out**, **Ease in and out** (what new keyframes get) and **Hold**
  (the value jumps at the next keyframe). A keyframe's interpolation shapes the change that starts at it, and the
  diamond's shape shows it: rounded for an ease, square for Hold, pointed for Linear.
- **Keyframes belong to their clip or layer**, timed from its start: moving it moves its animation, and so do Slip
  and a trim of its end. Trimming its start (or dragging a layer's start, or a Roll or Slide that moves a clip's
  start) keeps the keyframes where they are on the timeline, so the motion doesn't jump; keyframes outside the clip
  are kept but don't act. Split gives each part the keyframes on its side, with one at the cut, so nothing changes on
  screen.
- **Limits**: 100 keyframes per value and 5,000 per project; a change past them is refused with the reason. Every
  change is one undo step (a drag is one step) and is announced to screen readers.

A photo's movement (zoom in, pan …) still moves the picture inside its box; keyframes move the box. The preview, the
stage and the export evaluate keyframes with the same code (`src/engine/keyframes.ts`), so the file shows exactly
what the preview shows, frame for frame; the clip's sound follows its volume keyframes in the export through a
volume curve with a point at least every 5 ms. Projects without keyframes are saved, drawn and exported exactly as
before.

### Transitions

A transition blends one clip into the next at a cut, instead of a hard cut. It goes on any cut between two clips that
touch on the same picture track: the Video track or an overlay track.

| Transition | What it does | Options |
| --- | --- | --- |
| **Cross-dissolve** | The first clip fades out as the second fades in | |
| **Dip to colour** | The first clip fades to the colour, then the second fades in from it | Black or white |
| **Wipe** | An edge moves across the frame and reveals the second clip | Left, right, up, down |
| **Slide** | The second clip pushes the first out of the frame | Left, right, up, down |
| **Zoom** | The first clip grows (1× to 1.3×) as it dissolves into the second | |

- **Add one** from **Transitions** in the tool rail: choosing a kind puts it on the selected cut, or, with a clip
  selected, on the cut at its end (at its start for the last clip). **Apply … to every cut** puts it on every cut of
  that track where it fits. On the timeline every cut between touching clips is a small button (shown when the row is
  hovered, or focused from the keyboard): click it, or press Enter on it, to choose a transition for that cut.
- **On the timeline** a transition is a block over its cut, as wide as it is long. Click it to see it in the inspector
  (kind, direction or colour, length, **Remove transition**); drag either edge to change its length on both sides of
  the cut; with it focused, ← / → change its length by a frame (Shift: 0.5 s) and Delete removes it.
- **Timing**: a transition is centred on its cut, 0.5 s by default, from 0.1 s to 3 s in whole frames. The first clip
  goes on playing past its end and the second starts before its start, from their files (a video's first or last
  frame is held where its file runs out), so adding or removing a transition never changes the video's length or
  moves anything. A transition fits in its clips: two transitions on one clip never overlap.
- **Sound**: the clips' sound blends across the transition with equal loudness (an equal-power cross-fade); a dip
  goes through silence at the cut, as the picture goes through the colour. Clip volumes and volume keyframes still
  apply.
- **Edits keep them**: a transition stays on its cut while its two clips still touch, shortened if a trim leaves less
  room; when an edit separates them (a gap, a delete, a move, a reorder) it is removed, the change is announced, and
  undo brings it back. Split keeps a clip's transition at its end; Duplicate keeps it at the old cut.
- **Videos at once**: while a transition between two videos plays, both count towards the videos-at-once limit (3 in
  the browser, 5 in the desktop app); a transition that would go over it is refused with the reason.

Transitions are drawn on the same 2D canvas as the rest of the video (D-035), with the same code for the preview and
the export (`src/engine/transitions.ts`), so the file shows what the preview shows. Projects without transitions are
saved, drawn and exported exactly as before.

### Speed, reverse and freeze frames

A video clip can play faster or slower, backwards, with a speed that changes over the clip (a ramp), or stop on one
frame. Photos have no speed: their length is how long they show.

- **Constant speed**: in the clip inspector's **Speed** group, pick **Constant** and set the speed from 0.1× to 10×
  (in 0.01× steps) with the field, the slider, or the presets 0.25×, 0.5×, 0.75×, 1×, 1.5×, 2×, 4×. The clip keeps
  the part of its video it uses (its in and out points) and gets shorter or longer: at 2× a 10 s part lasts 5 s. On
  the Video track with **Magnetic** on the later clips move with it; elsewhere a clip that would run into the next
  one is refused, with how much room there is. A change that would make the video longer than its platform allows,
  or the clip shorter than 0.1 s, is refused too. Slowed clips repeat frames; there is no frame blending.
- **Reverse**: plays the clip from its out point back to its in point, at any constant speed. On the timeline, its
  left edge trims the end of the video (what plays first) and its right edge the start.
- **Speed ramps**: pick **Ramp** for a curve of speed over the clip, 2 to 10 points, each a place along the clip and a
  speed from 0.1× to 10×, joined smoothly without overshooting. Presets give a start: **Montage** (fast, slow, fast,
  slow, fast), **Hero** (slow in the middle), **Bullet** (fast, very slow in the middle, fast), **Jump cut** (a short
  fast burst), **Flash in** (fast into normal), **Flash out** (normal into fast). In the curve editor drag a point,
  double-click to add one, Delete to remove one; from the keyboard Tab to a point, ← / → move it along the clip and
  ↑ / ↓ change its speed (Shift: larger steps). A ramp always plays forwards: turning on Reverse sets the clip back
  to a constant speed and choosing a ramp turns Reverse off (each says so). Trimming or splitting a ramped clip keeps
  the curve where it was, so every frame left plays as before.
- **Freeze frame**: **Freeze** in the transport, or Shift + F with the timeline focused, splits the video clip under
  the playhead and puts a still of that exact frame between the two parts (before or after the clip at its first or
  last frame). It lasts 2 s, from 0.1 s to 60 s (drag its end, or **On screen for** in the inspector), keeps the
  clip's box, framing and look, and has no sound. Magnetic moves the later clips; elsewhere it is refused when it
  doesn't fit.
- **Sound**: at a constant speed from 0.5× to 2× the clip's sound plays faster or slower at the same pitch; outside
  that range, reversed, with a ramp and on a freeze frame it is silent, and the inspector says why. Clip volume,
  volume keyframes and transition fades work as before.
- **Edits keep them**: a clip's keyframes stay at the same places along the clip when its speed changes, so an
  animation keeps its shape; transitions keep their length, shortened (and announced) if the clip no longer has room.
  Trimming a sped-up clip uses source at its speed (a 1 s drag at 2× uses 2 s more video); Roll, Slip, Slide and split
  keep each part's speed. Every change is one undo step, a slider or point drag included; **Reset speed** goes back to
  1× forwards.
- **On the timeline** a sped-up, slowed, reversed or ramped clip shows a badge ("2×", "0.5×", "◀ 1×", "Ramp") and a
  freeze frame shows "Still"; filmstrips show the frames that actually play. Speed changes are announced ("Clip 2:
  0.5×, now 8.4 s").

The preview and the export pick each frame with the same function (`src/engine/speed.ts`), so the file shows the
frames the preview shows. Fast clips skip from key frame to key frame in the export instead of decoding the whole
video; reversed clips decode in short chunks backwards (the preview may drop frames in their first second); a freeze
frame is decoded once. The preview keeps the pitch with the browser's own stretching and the export with its own
(WSOLA), so the two sound alike but not sample for sample. Projects without speed changes are saved and exported
exactly as before.

### Audio tracks, sound clips and the mix

A video's sound is its clips' own sound plus any number of **sound clips** on **audio tracks**: a song, a second song
after it, sound effects on the cuts, an ambience bed, a recorded voice.

- **Add sound** from **Audio** in the tool rail: MP3, M4A, AAC, WAV, OGG, Opus, WebM or FLAC files up to 100 MB each,
  several at once. They go at the playhead on the chosen track, or the first audio track with room there, or a new
  one. A song longer than the video, added as the first clip on the Music track, plays **to the end of the video**.
- **Audio tracks**: every project has the **Music** track; **+** (the second button at the top left of the timeline)
  adds **Audio 2**, **Audio 3** … up to 8, in the browser and the desktop app alike. Each has a header like the other
  tracks (name, **Mute**, **Solo**, **Lock**, height, Move up / down, Delete, asking first when it holds sounds) and a
  settings button with its **role** (**Music**, **Voice** or **Effects**), its **volume** (0–200 %) and its ducking.
  **Solo** plays only the soloed audio tracks in the preview, to check one layer of the mix; the export always plays
  every track that isn't muted.
- **Sound clips** are edited like picture clips: drag to move (onto another audio row to change track), drag an edge
  to trim (Shift: ripple the later clips on the track), and Roll, Slip and Slide with the edit tools, within their own
  track. Moves snap to clip, layer and sound clip edges and the playhead. S splits the selected sound clip at the
  playhead, Delete removes it, Alt + ← / → nudges it with the tool. Sound clips never overlap on a track and stay
  inside their file; an edit that would break that is refused with the reason. Magnetic belongs to the Video track
  only: sound clips keep their time when picture clips ripple.
- **On the bar**: the clip's name, its **waveform**, its **fade handles** at the top corners (drag, or ← / → with one
  focused: 0.1 s, Shift 1 s), its **volume line** (drag it up and down, or ↑ / ↓: 5 %, Shift 25 %), and, on a ducked
  track, the ducking curve. Sound past the end of the video is hatched: it isn't heard and doesn't lengthen the video.
- **The inspector** of a selected sound clip: **Volume** (0–200 %) with its keyframe diamond, **Fade in** and **Fade
  out** (0–10 s each, together no longer than the clip), **Play to the end of the video**, where it **plays its file
  from**, and **Remove sound**. With volume keyframes, the clip's keyframe lane shows under its row (the diamonds, keys
  and interpolations of [Keyframes](#keyframes)). A clip that plays to the end stops at the next sound on its track
  if that comes first; moved to or past the end of the video it keeps its length and the switch turns off. **Add
  sound** never puts a sound where it would cut such a clip short (it uses another track).
- **Waveforms** show on every sound clip and, under the filmstrip, on every video clip with sound. They are measured
  once per file in the background after import (100 peaks a second; the import isn't slower) and drawn through the
  clip's trim, speed, volume, fades, keyframes, track volume and ducking, so their shape is what is heard. A silent
  clip (a muted track, a volume of 0, a reversed or ramped clip, a freeze frame) draws a flat line and says why in its
  tooltip and to screen readers.
- **Ducking** lowers a Music or Effects track while someone speaks. **Lower music under voice** in the Audio panel
  turns it on for every Music track; each track can set it itself: **Lowered by** 3–30 dB (12 by default) and **Voice
  louder than** −60 to −20 dBFS (−40 by default). The voice is the sound of Voice tracks plus the clips' own sound
  (**Counts as voice** leaves a track out). The music fades down over 0.3 s before speech starts and back up over
  0.8 s after it, with pauses under 0.5 s bridged so it doesn't pump between words. "Speaking" means louder than the
  threshold (there is no speech recognition), so the threshold is how to tune it. The curve follows every edit at once.
- **Loudness**: the export can be turned up or down to a target, measured as YouTube and Instagram measure it (ITU-R
  BS.1770-4 / EBU R 128): **Off**, **YouTube · Instagram** (−14 LUFS, the default for new projects), **Quiet**
  (−16 LUFS) or a custom −24 to −9 LUFS. The Audio panel shows the mix's measurement ("−18.4 LUFS, peak −2.1 dBTP; the
  export will be turned up 4.4 dB"), taken in the background half a second after the last change. A true-peak
  **limiter** keeps peaks at or below −1 dBTP; the panel warns when it would turn the loudest moments down by more
  than 6 dB. Projects from before this version keep Off, so they sound as they did.
- **Kinds and colours**: sound is shown by its kind, the track's role, everywhere: **Music** teal, **Voice** orange,
  **Effects** violet (lighter in the dark theme). A sound track's header has a colour bar at its left edge and says its
  kind to screen readers ("Audio 2 track, Voice"), its sound clips take its colour on the timeline, and the Audio
  panel's track settings and the sound inspector ("Music 1 · Music") show the kind as a chip with its name. The colour
  is never the only sign: the name is always written beside it.
- **The Audio panel** folds into five sections: **Add sound** (open by default), **Record voice**, **Recordings** (the
  voice takes, see [Voice-over](#voice-over)), **Tracks** (Lower music under voice and each sound track's role, volume
  and ducking) and **Loudness**.
- **The preview plays the export's mix**: every sound goes through the same gains (volume × fades × keyframes × track
  volume × ducking), then the loudness gain and the limiter (an AudioWorklet; where it can't load, the browser's own
  compressor stands in).

Every change is one undo step (a drag or a slider is one step) and is announced to screen readers ("Audio 2: Whoosh,
fade in 0.5 s"). Audio tracks, sound clips, their keyframes, roles, volumes, ducking and the loudness target are saved
with the project; the validator clamps every value and drops overlapping clips with the reason. The gains are
multiplied in one place (`src/engine/mixGain.ts`) for the preview and the export; scans in `src/engine/soundScan.ts`
(a Worker, `src/state/soundScan.worker.ts`), ducking in `ducking.ts`, loudness in `loudness.ts`, the limiter in
`limiter.ts`.

### Voice-over

Record your voice over the video while it plays: the take is an ordinary sound clip on a Voice track, in sync with
the picture it was spoken over.

- **Record voice** is a section of the Audio panel: opening it with its title opens the microphone, and closing it (or
  opening another section) closes it. When it is open because it was the section used last, it shows **Record voice…**
  instead, so the microphone never opens unasked. Each Voice track's header also has a record button that opens it with
  that track chosen. The take goes onto that track, else the selected sound clip's Voice track, else the first Voice track;
  with none, a track named **Voice** is added (refused with the reason when there are already 8 audio tracks).
- **The controls**: **Microphone** (the system default first; names show once the browser has been allowed to use
  it), a **level meter** (−60 to 0 dBFS, 30 readings a second, **Too loud** for 2 s after a peak at −1 dBFS or above),
  **Voice clean-up** (the browser's echo cancellation, noise suppression and automatic gain: off by default, because
  it dulls the voice; turn it on for laptop speakers or a noisy room), **Hear the video while recording (use
  headphones)** (off by default, so the speakers aren't recorded; the track being recorded is never played),
  **Count-in** (Off, 3 s or 5 s, shown on the stage, silent) and **Recording offset**. The choices are remembered on
  this device, the offset per microphone.
- **Recording**: **Record** (or **Shift + R**) counts in, then plays the preview from the playhead and records until
  **Stop** (Shift + R or Space), the end of the video, or 60 minutes. Esc or Stop during the count-in records nothing.
  While recording a red **Recording** sign with the time shows on the stage and on the track.
- **The take** is named Voice 1, Voice 2 … and starts where the playhead was when recording began. It has a waveform,
  moves, trims, splits, fades and takes keyframes like any sound clip, counts as voice for ducking, is saved with the
  project as its own media (408) and is in the export. The file is what the browser records: Opus in WebM (Chrome,
  Edge, Firefox and the desktop app) or AAC in M4A (Safari), mono, about 1 MB a minute; a take saved as a file can be
  added again with **Add sound** (a WebM's length is read from its packets when its header has none).
- **Recordings** (a section of the Audio panel) lists every take of the project, newest first: its name, length, when
  it was recorded, the microphone it was recorded with ("—" for takes from before this version), and where it is used
  ("Voice at 0:12", "Voice at 0:12 and 1 more", "Not used"). Choosing a take selects its first clip and scrolls the
  timeline to it. **Play** plays the whole take alone (the video pauses; starting the video stops it), **Rename** names
  the take and all its clips (Enter keeps, Esc cancels; one undo step), **+** adds it again at the playhead on a Voice
  track, and the bin deletes it from the project, asking first when it is used. When and with which microphone a take
  was recorded is saved with the project, on the device only.
- **Punch-in**: a take recorded over earlier sound on the same track replaces just the part it covers (clips inside
  it are deleted, clips over its edges trimmed, a clip around it split), so a fluffed sentence is re-recorded without
  redoing the rest. Other tracks are untouched. The take and what it replaced are one undo step.
- **Sync** is worked out from the latencies the browser reports (the microphone's input latency, else the audio
  context's). Some hardware misreports them (Bluetooth headsets most of all): move the **Recording offset** (−250 to
  +250 ms) until a clap lands on its frame.
- **Privacy**: the microphone is on only while the recording controls are open (for the meter) or a take records.
  Closing them, choosing another tool, leaving the editor or hiding the tab (when not recording) turns it off at once,
  and the browser's own recording sign goes out with it. Recordings stay on the device and are never uploaded. The
  web app may use the microphone for its own page only; the desktop app allows its own page the microphone, audio
  only, and refuses the camera and the screen.
- **If the app closes mid-take**, nothing more than the last 2 s is lost: a take is written to the device every second
  (IndexedDB, in the browser and the desktop app). The next time its project opens, a bar over the timeline says so;
  **Recover…** opens the Audio panel, where each take is listed with its length and when it was recorded: **Add to the
  timeline** puts it where it was recorded (with punch-in, one undo step), **Save as file** downloads it, **Discard**
  deletes it. Takes left alone are deleted after 30 days.
- **When it can't record**, it says why and what to do: the microphone not allowed (in the browser's site settings;
  on Windows under Settings → Privacy & security → Microphone; on macOS under System Settings → Privacy & Security →
  Microphone), no microphone, the microphone in use by another app, a page not served over https, or a browser that
  can't record. A microphone unplugged mid-take keeps what was recorded ("Voice 3 kept: 41.2 s, the microphone
  stopped."); unplugging the chosen microphone otherwise falls back to the default and says so. On a phone, locking
  the screen or leaving the tab stops the take, which is kept.
- **Screen readers** hear the count-in ("Recording in 3", "2", "1"), the start ("Recording on Voice"), Too loud at
  most every 5 s, and the result ("Voice 2 added at 0:12.4, 8.6 s; replaced 2.1 s of Voice 1"). The meter has a text
  value.

The recorder is `src/state/voiceRecorder.ts` (loaded only when Record voice opens), the placement and punch-in
`src/engine/voiceTake.ts` and `soundClips.ts` (`punchIn`, `placeTake`), the microphone `src/lib/microphone.ts`, the
take store for recovery `src/lib/takeStore.ts`, and the controls `src/components/studio/RecordVoice.tsx`; the Recordings list is `src/state/videoTakes.ts` and
`src/components/studio/TakeList.tsx`.

### The preview

The preview decodes video clips the way the export does, through one **decoder pool** (`src/engine/decodePool.ts`):

- **Playback** decodes a few frames ahead and opens the next clip about 2 s before its cut, so cuts don't stall or
  flash black. If a frame isn't ready in time, the clip holds its last frame and the playhead keeps real time.
- **Paused or scrubbing**, the preview shows the exact frame the export will encode at that time (the time is put on
  the project's frame grid, as the export does). When scrubbing fast, the last position asked for wins.
- **Sound** comes from the clip itself (audio-only elements, at most for the clip under the playhead and the next one
  to start) and is kept within a frame of the picture; sound clips play from the file, through the export's gains,
  the loudness gain and the limiter.

**"This clip can’t be exported here: <reason>".** Some files a browser can play can't be decoded frame by frame (such as
some HEVC video, the format iPhones record by default, or a damaged file). Such a clip still previews, from the
browser's own player, and the other clips are unaffected, but the export refuses it with a message naming the file. The
note shows in the clip's tooltip on the timeline (with ⚠ on the clip), in its name for screen readers, and in the
inspector. To use the clip, convert the file to **H.264 MP4** (most video converters and phone export settings offer it)
and add it again.

Browsers without WebCodecs' video decoding (Firefox before 130, Safari before 26) don't use the pool: their preview
and export work as before.

### In the browser and in the desktop app

Video work in a browser tab is limited by the tab's memory and by browsers slowing down tabs in the background, so the
app tells users so and sends long or demanding projects to the desktop app:

| | Browser | Desktop app |
| --- | --- | --- |
| Reels & Shorts | Up to 90 s, 20 clips, 300 MB per video file, 30 fps | Up to 3 min, 50 clips, 4 GB files, 30 or 60 fps |
| YouTube video | Up to 15 min, 60 clips, 4 GB files, 1080p, 30 fps | Up to 3 hours, 500 clips, 50 GB files, 1080p / 1440p / 4K, 30 or 60 fps |
| Saving long videos | Streamed to a file in Chrome and Edge (File System Access API); built in memory elsewhere | Streamed to a file through the main process |
| Encoding | WebCodecs, hardware-accelerated where the browser allows | WebCodecs in Electron, using the graphics card's encoder |
| Videos on screen at once (main + overlay video clips) | 3 (1 in browsers without WebCodecs' video decoding) | 5 |

Limits live in `limitsFor()` (`src/engine/videoFormats.ts`); the notes in the editor read from it. Videos on screen at once
is measured (see [PERFORMANCE.md](PERFORMANCE.md#videos-on-screen-at-once)) and counts the main track's and the
overlay tracks' video clips showing at the same moment, hidden tracks included (so showing a track can't break it).
Photos don't count.

### How exports stay small in memory

`src/engine/videoExport.ts` (loaded only when exporting, together with [Mediabunny](https://mediabunny.dev), MPL-2.0):

- **Frames** are drawn one at a time with the same `renderFrame()` as the preview and handed to the encoder. Video
  clips are decoded through the export's own decoder pool, frame by frame at exactly the times needed, no wider than
  the frame needs; each frame is released as soon as the next replaces it, and the next clip opens while the current
  one is encoded. The pool is released when the export ends, is cancelled or fails.
- **Sound** is decoded and mixed in 10-second windows (`OfflineAudioContext`): each clip's own sound and every sound
  clip with its full gain curve (volume, fades, keyframes, track volume, ducking), then the loudness gain and the
  limiter. Memory is the same whatever the number of tracks. Windows are added just ahead of the frames, so the two
  tracks interleave in the file. With a loudness target the mix is measured first (the Audio panel's measurement is
  reused when nothing changed).
- **Long videos** stream to disk. Space for the index is reserved at the front of the file (Mediabunny's `reserve`
  fast start, sized from the exact number of video frames and AAC packets), so even a 3-hour 4K video gets fast start
  without being held in memory. Reels are built in memory, because sharing needs the whole file.

Measured on this release: a 6-second 1080 × 1920 Reel exports in about 2 s in Chrome; a 6-second 4K YouTube video
streams to disk in about 4 s in the desktop app (Windows, hardware encoder).

### Still to do

The longer plan for advanced features (masks, curves, multi-track timeline, keyframes, colour grading, RAW) is in
[specs/vision/editor-roadmap.md](../specs/vision/editor-roadmap.md), with the work items in
[specs/vision/editor-implementation.md](../specs/vision/editor-implementation.md).

| Next | Why it isn't in this version |
| --- | --- |
| Sound for reversed and ramped clips, and pitch-kept sound outside 0.5×–2× | Needs more audio work; those clips are silent for now |
| Reverse together with a speed ramp; frame blending for slow motion | Rare, and doubles the cases to get right; slowed clips repeat frames |
| Take lanes (keeping every attempt at a voice-over), pre-roll before a punch-in, a guided sync check | Re-recording replaces the take's span (undo brings it back); the Recording offset fixes sync by hand |
| Moving a project to another computer, or between the browser and the desktop app | Needs a project file that carries gigabytes of media (409) |
| A clip's sound as its own clip (J and L cuts), sound linked to a picture clip | Changes how clips and their sound are linked; with compound clips (210) |
| Pan, track volume keyframes, EQ and noise removal | Reels and Shorts are mostly heard on phones; the loudness target is the master volume |
| Agent tools for audio tracks, ducking and loudness | With the other timeline tools (212) |
| Direct upload to YouTube or Instagram | Needs sign-in and a server (OAuth, hosting); exports go to the share sheet, a file, or the upload page |
| Firefox and Safari checks | Encoding support varies by version; check before relying on them |
| Text animation presets (slide, pop, typewriter) | Keyframes animate a title by hand; presets and text style animation are a separate design (210) |
