# Performance and memory

Chitthi handles large photos (up to 16 MP each, 24 on a calendar) and renders print files in the browser, so it keeps
explicit budgets for memory and CPU. This page covers the built-in **performance monitor**, what its figures mean,
and the rules the code follows.

## Performance monitor

Open it from **More (⋯) → Performance monitor** in the studio header, **Find a feature** (search "performance"), or
**View → Performance monitor** in the desktop app. It floats at the bottom right; click its title to shrink it to one
line, **×** to close it. The choice is remembered on the device.

It samples once a second **only while it is open**, pauses while the tab is hidden, and never sends anything.

| Figure | Web | Desktop | What to look for |
| --- | --- | --- | --- |
| **CPU (whole app)** | — | CPU of all Chitthi processes as a share of the machine, with a breakdown per process type (Browser = main, Tab = the page, GPU, Utility) in % of one core | Idle should be near 0%. Sustained > 40% turns amber, > 75% red |
| **Main thread busy (estimate)** | Share of the last second spent in *long tasks* (work that blocked the page ≥ 50 ms) | — | Browsers don't expose CPU use; this is the closest honest signal. > 20% amber, > 50% red |
| **Input delay** | Worst lateness of a 100 ms timer in the last second: how long a click or key press would have waited | same | < 50 ms feels instant; > 200 ms (red) feels stuck |
| **Frames per second** | Frames the browser managed to draw | same | Drops while dragging a photo or turning the 3D view mean the page is busy |
| **Memory (whole app)** | — | Working set of every Chitthi process | Compare with the computer's memory shown under it |
| **JavaScript memory** | JS heap in use (Chromium only) | same | Should fall back after closing a dialog; steady growth over identical actions suggests a leak |
| **Photos** | Photos on the design, their decoded size (4 bytes a pixel), and the undo history's steps and extra photo memory | same | Amber past 400 MB, red past 900 MB |
| **Elements** | DOM nodes on the page | same | Amber past 4,000 |
| **Storage / Saved data** | Browser storage used by the site, and the quota | same | Photos and designs are stored as data URLs |

**Copy report** puts a JSON report on the clipboard: environment (browser, screen), a summary (averages and peaks)
and up to 120 one-second samples. To compare two versions or two devices, run the same steps with the monitor open
(for example: add 4 photos, crop one, open the 3D view, export a print pack), copy the report after each run, and
compare `summary`. Paste `samples` into a spreadsheet to chart them.

Typical figures (Chrome, 1440 × 900, one 1600 px photo on a postcard): main thread 0% busy at rest, input delay
under 10 ms, JS heap 40–50 MB, 7 MB of decoded photo pixels, about 1,100 page elements.

## Memory rules

| Where | Rule | Code |
| --- | --- | --- |
| Photos | Uploads up to 25 MB; the prepared copy is capped at 16 MP; an unedited photo shares its original image | `engine/photo.ts` |
| Undo history | Up to 100 steps. Each crop, rotation or colour look makes a new canvas, and undo keeps the old ones; once canvases only the history holds pass **320 MB**, the oldest steps go (at least 10 stay) | `state/store.ts` (`commit`, `historyStats`) |
| Sample gallery | Keeps two small JPEG thumbnails per sample; the decoded photos are dropped after drawing and reloaded for **Use this** (they used to stay in memory: ~7 MB each, 14 samples) | `components/SampleGallery.tsx`, `data/samples.ts` |
| Pexels | Last 60 searches cached (JSON only); photos download one at a time when chosen | `lib/pexels.ts` |
| Paper sizes in 3D | One ≤ 420 px JPEG per size, drawn once (about 3 MB in all) | `components/Paper3D.tsx` |
| AI pictures | One job at a time; candidates are `Blob`s with ≤ 320 px object-URL thumbnails, revoked on close; only the chosen one becomes a JPEG | `ai/service.ts`, `components/ai/AiArtwork.tsx` |
| Desktop AI requests | Responses capped at 40 MB, 180 s, 2 at a time | `electron/ai.cjs` |
| Agent previews | `render_preview` ≤ 1024 px; exports go to disk, not into the reply | `agent/tools.ts` |
| Small caches | Photo keys and the agent's seen Pexels photos are capped at 500 entries | `lib/photoKey.ts`, `agent/tools.ts` |

Every `addEventListener`, `setInterval`, `requestAnimationFrame`, `ResizeObserver` and `IntersectionObserver` in a
component is undone in its cleanup (checked across `src/` for this page).

## CPU rules

- Animation loops run only while needed: the 3D viewer while open; the landing page's turning cards only while on
  screen; the hero tilt only while it eases towards the pointer (it used to restyle every frame).
- Only the current step pane and its neighbours are mounted; layout and month thumbnails redraw from deferred values.
- Screens, dialogs, AI code, jsPDF and the monitor itself load on demand. `npm run build` fails if the start-up script
  passes 350 KB or contains AI code (`scripts/check-bundle.mjs`).
- The preview draws each photo from a GPU texture (~2 ms a render for 12 MP photos in Chrome).

## Investigating a slowdown

1. Open the monitor, reproduce the slow action, and watch **Main thread busy** / **CPU** and **Input delay**.
2. If memory grows with each repeat of the same action, compare **JavaScript memory** and **Photos** before and after:
   growth in Photos is the undo history (bounded above); growth in JS memory alone points at a listener or cache.
3. For detail, use the browser's Performance panel (web) or **View → Toggle Developer Tools** in a development build
   of the desktop app, and attach the copied report to the issue.
