# Photo & video studio

The photo & video studio (`#/instagram`; **Tools → Photo & video studio** on the site pages, **More → Photo & video
studio** in the print studio, **View → Photo & video studio** on desktop) makes three things from the user's photos
and clips, all on the device:

| Mode | Route | Makes |
| --- | --- | --- |
| **Instagram photos** | `#/instagram` | Up to 20 photos in one Instagram format, with text, stickers and drawings; JPEG or PNG files, or shared to the Instagram app |
| **Reels & Shorts** | `#/instagram/video` | A vertical (or 4:5, 1:1) MP4 for Instagram Reels and YouTube Shorts, shared or downloaded |
| **YouTube video** | `#/instagram/youtube` | A 16:9 MP4 (a vlog or any YouTube video) edited on a timeline and saved straight to a file |

## The workspace

All three modes share one layout (`src/components/studio/`), built like a desktop editor:

| Area | What it holds |
| --- | --- |
| Top bar | The Chitthi Studio mark (home), the three modes, undo and redo, the format menu, **Export** |
| Tool rail | Photos / Media, Text, Elements (shapes and stickers), Draw, Audio (video), Layers; a second click hides the panel |
| Tool panel | The chosen tool: add media, text styles, shapes and stickers, brushes, music, the layer list |
| Stage | The canvas on a dark surface, sized to fit; layers are edited right on it |
| Inspector | Whatever is selected: a layer's properties (and its timing on video), else the photo's or clip's settings |
| Dock | The photo strip (drag to reorder), or the video transport and timeline |
| Export | A sheet with the file settings, the caption, and the share, download or save buttons |

At 1280 px and wider every area has its own column; narrower windows put the tool panel and inspector in one column on
the right; phones stack the stage, the dock, the tools and the panels in one scrolling column.

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

Files are JPEG (default; sRGB, quality 60–100, default 92) or PNG. The app warns when a file is over 8 MB, the limit of
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
position by dragging or arrow keys, rotate, mirror, six filters (the same looks as the print studio), and brightness,
contrast, saturation, warmth and vignette. **Apply this look to all photos** copies the frame, background, filter and
adjustments, but not the position or rotation. The first photo is the cover; drag photos in the strip to reorder them
(or Alt + ← / → on a focused thumbnail).

**Text, Elements and Layers** (rail). Layers over the photo, edited in the inspector when selected:

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
| Formats, limits, filters | `src/data/instagram.ts` |
| Colour settings (look, sliders, vignette) as parameters, and `mergeAdjust()` to validate them | `src/engine/adjust.ts` |
| Placement, applying the colour, drawing a post (no UI); `mergeEdit()` validates edits from outside the app | `src/engine/instagram.ts` |
| Batch state, adding photos, rendering and zipping | `src/state/instagram.ts` |
| Layers: text, shapes, stickers, drawings; drawing, picking, handles | `src/data/layers.ts`, `src/engine/layers.ts` |
| Layer editing on a preview, layer panels (shared by photos and video) | `src/components/ig/useLayerPointer.ts`, `src/components/ig/LayerPanel.tsx` |
| Video formats, limits, timeline maths and frame drawing; MP4 export | `src/engine/video.ts`; `src/engine/videoExport.ts` |
| Video state: kind, clips, layers, music, playhead, undo, export | `src/state/video.ts` |
| Streaming a file to disk (desktop IPC, File System Access) | `src/lib/fileSink.ts`; `desktop:openWrite` / `write` / `closeWrite` in `electron/main.cjs` |
| Workspace: shell, photo editor, video editor, timeline, export sheet | `src/components/studio/` (`Shell.tsx`, `PhotoWorkspace.tsx`, `VideoWorkspace.tsx`, `Timeline.tsx`, `Dialog.tsx`), `src/components/InstagramStudio.tsx` (routes the modes) |
| Styles | `src/styles/36-media-studio.css` (workspace, timeline), `src/styles/35-instagram.css` (panels and controls) |

The preview, the thumbnails and the exported files all go through `renderIg()` and `drawLayers()`, so the files match
the preview. Layer positions are shares of the frame and sizes are shares of its width, so layers keep their place at
any preview size and in every export.

**Memory.** Each photo keeps its original file (compressed) and a preview copy of at most 1080 px; 20 photos stay
around 100 MB. Full-size pixels exist only while one photo is being exported. The batch lasts for the session; the
format, batch size and file settings are remembered.

**Tests.** Unit: `src/engine/instagram.test.ts` (formats, limits, placement, colour maths) and
`src/engine/layers.test.ts` (layer scaling, rotation, timing, drawing strokes, the video timeline, motion and fades).
Browser: `e2e/instagram.e2e.ts` (batch limit, edit, reorder, ZIP of 1080 px JPEGs, posting flow, caption, accessibility)
and `e2e/editors.e2e.ts` (layers, drawing, undo, delete; a Reel exported with text and music and checked for `ftyp`,
`moov` before `mdat`, H.264, AAC and 1080 × 1920; timeline trim and reorder by dragging, split and delete; a YouTube
video streamed into a stand-in for the save picker and checked for fast start and 1920 × 1080; accessibility).

## Video editor: Reels, Shorts and YouTube

**Reels & Shorts** and **YouTube video** are one editor with two kinds of project. Switching between them keeps the
clips, layers and music and changes the frame and limits.

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

### The timeline

| Action | How |
| --- | --- |
| Seek | Click the ruler or an empty part of a track; drag to scrub; drag the red playhead |
| Reorder clips | Drag a clip along the video track; a marker shows where it will land |
| Trim | Drag a clip's left or right edge (videos: in and out points; photos: how long they show) |
| Time a layer | Drag its bar to move it in time, or its ends to change when it appears and disappears |
| Slide the music | Drag the music bar to choose which part of the song plays; its waveform shows the loudness |
| Split, duplicate, delete | Transport buttons, or S and Delete with the timeline focused |
| Zoom | Ctrl + wheel over the timeline, the zoom slider, + / −, or **Fit** |
| Play | The play button or Space; the timeline follows the playhead |
| Step | ← / → one frame, Shift + ← / → one second, Home / End |

Moves snap to clip edges, layer edges and the playhead. Video clips show a filmstrip of eight frames taken from the
part in use; photos show their thumbnail. Each clip also has **Starts at** / **Ends at** sliders in the inspector, the
full-size equivalent of the trim handles.

Per clip, in the inspector: duration (photos) or trim and sound volume (videos), movement for photos (still, zoom in
or out, pan four ways), fade in from black, framing (fill or whole picture with a blurred background, zoom, position)
and colour (six filters, brightness, contrast, saturation, warmth). Layers are the same text, shapes, stickers and
drawings as photos, each with **Appears at** and **Disappears at** times; new ones start at the playhead.

### In the browser and in the desktop app

Video work in a browser tab is limited by the tab's memory and by browsers slowing down tabs in the background, so the
app tells users so and sends long or demanding projects to the desktop app:

| | Browser | Desktop app |
| --- | --- | --- |
| Reels & Shorts | Up to 90 s, 20 clips, 300 MB per video file, 30 fps | Up to 3 min, 50 clips, 4 GB files, 30 or 60 fps |
| YouTube video | Up to 15 min, 60 clips, 4 GB files, 1080p, 30 fps | Up to 3 hours, 500 clips, 50 GB files, 1080p / 1440p / 4K, 30 or 60 fps |
| Saving long videos | Streamed to a file in Chrome and Edge (File System Access API); built in memory elsewhere | Streamed to a file through the main process |
| Encoding | WebCodecs, hardware-accelerated where the browser allows | WebCodecs in Electron, using the graphics card's encoder |

Limits live in `limitsFor()` (`src/engine/video.ts`); the notes in the editor read from it.

### How exports stay small in memory

`src/engine/videoExport.ts` (loaded only when exporting, together with [Mediabunny](https://mediabunny.dev), MPL-2.0):

- **Frames** are drawn one at a time with the same `renderFrame()` as the preview and handed to the encoder. Video
  clips are decoded frame by frame at exactly the times needed, no wider than the frame needs.
- **Sound** is decoded and mixed in 10-second windows (`OfflineAudioContext`): each clip's own track at its volume,
  with short ramps at the cuts, plus the music with its fade-out. Windows are added just ahead of the frames, so the two
  tracks interleave in the file.
- **Long videos** stream to disk. Space for the index is reserved at the front of the file (Mediabunny's `reserve`
  fast start, sized from the exact number of video frames and AAC packets), so even a 3-hour 4K video gets fast start
  without being held in memory. Reels are built in memory, because sharing needs the whole file.

Measured on this release: a 6-second 1080 × 1920 Reel exports in about 2 s in Chrome; a 6-second 4K YouTube video
streams to disk in about 4 s in the desktop app (Windows, hardware encoder).

### Still to do

The longer plan for advanced features (masks, curves, multi-track timeline, keyframes, colour grading, RAW) is in
[planning/EDITOR-ROADMAP.md](planning/EDITOR-ROADMAP.md), with the work items in
[planning/EDITOR-IMPLEMENTATION.md](planning/EDITOR-IMPLEMENTATION.md).

| Next | Why it isn't in this version |
| --- | --- |
| Cross-fades between clips | Needs two decoded frames at once; fade-in from black covers most uses |
| Speed changes and reverse | Needs re-timing the clip's sound as well |
| Several music tracks, voice-over recording | One track covers the common Reel and vlog |
| Clip waveforms | Music shows its waveform; clips would need their sound decoded on import |
| Direct upload to YouTube or Instagram | Needs sign-in and a server (OAuth, hosting); exports go to the share sheet, a file, or the upload page |
| Firefox and Safari checks | Encoding support varies by version; check before relying on them |
| Text animations (slide, pop, typewriter) | The layer timing is in place; animations are a separate design |
