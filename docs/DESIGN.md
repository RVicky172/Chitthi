# Studio design

How every Chitthi studio is laid out: the print studio (`#/studio`) and the photo & video studio (`#/instagram`,
`#/instagram/video`, `#/instagram/youtube`). This page covers the layout, the sizes, the type and spacing scales,
the colour tokens and the shared panel parts. It is the reference for Phase UI (features 501–507), and new panels
follow it.

The visual identity (palette, voice, what the accent may be used for) is in [design.md](../design.md). This page
does not repeat it. Both pages read their values from one source, `src/styles/01-base.css`.

## 1. The layout

Every studio is one sheet divided by hairlines, with six parts. The print studio is the reference; the media studio
follows its left side.

| Part          | What it holds                                                             | Print studio                           | Media studio              |
| ------------- | ------------------------------------------------------------------------- | -------------------------------------- | ------------------------- |
| **Top bar**   | Home, modes or products, save state, undo, export                         | `.bar`                                 | `.mst-top`                |
| **Rail**      | Where you are: numbered steps (print) or tools under Add and Edit (media) | `Rail.tsx` in `RailFrame`              | `ToolRail` in `RailFrame` |
| **Panel**     | The open step or tool: a `PanelHeader`, then its sections                 | `.panel` (the steps' panes)            | `.mst-panel`              |
| **Stage**     | The design or frame on a dark surface                                     | the stage                              | `.mst-stage`              |
| **Inspector** | Settings for the selected thing                                           | none: the print panel is the inspector | `.mst-inspector`          |
| **Dock**      | Time and sequence: the photo strip or the video timeline                  | none (phones: the photo dock)          | `.mst-dock`               |

The rule for where things go:

- **Left (rail and panel): add and browse.** Bring things in, pick from lists and libraries.
- **Right (inspector): change the selection.** Settings for whatever is selected on the stage or the timeline.
- **Bottom (dock): time.** The order of photos, the timeline, markers.

### Wide screens

```
┌──────────────────────────── top bar ────────────────────────────┐
│ rail │  panel   │            stage             │   inspector    │
│ 184  │ 320–420  │          the rest            │    280–340     │
│ / 64 │          │                              │  (media only)  │
├──────┴──────────┴───── dock (media only) ──────┴────────────────┤
└─────────────────────────────────────────────────────────────────┘
```

From 1280 px wide the media studio shows the four columns side by side. The print studio has three: rail, panel,
stage. With no tool open, the media panel folds to 0 and the stage takes its width.

### Narrower screens

- **761–1279 px (media):** the panel and inspector share one column on the right (`rail · stage · side`), the open
  tool's panel above the inspector.
- **Up to 860 px (print) / 760 px (media), phones:** everything stacks and the page scrolls. The print studio puts the
  top bar, stage, steps (one row) and panel in that order. The media studio puts the top bar, stage, dock, tools (one
  row of icons over labels), panel and inspector in that order. The rail cannot be made compact here, and the Add and
  Edit headings and the More menu are hidden.

### Widths

Measured in Chromium on 2026-10-20 (`getBoundingClientRect`, CSS px). The rail is wide / compact; the stage is given
for the wide rail and, in brackets, for the compact rail.

| Window          | Top bar (print · media) | Rail                  | Panel      | Stage, print | Stage, media         | Inspector  | Dock, media (photo · video) |
| --------------- | ----------------------- | --------------------- | ---------- | ------------ | -------------------- | ---------- | --------------------------- |
| Phone 390 × 844 | 111 · 152 tall          | one row, 61 · 54 tall | full width | full width   | full width, 490 tall | full width | 105 · 255 tall              |
| 1280 × 720      | 61 · 61                 | 184 / 64              | 320        | 776 (896)    | 496 (616)            | 280        | 105 · 234                   |
| 1440 × 900      | 61 · 61                 | 184 / 64              | 346        | 910 (1030)   | 622 (742)            | 288        | 105 · 234                   |
| 1920 × 1080     | 61 · 61                 | 184 / 64              | 420        | 1316 (1436)  | 976 (1096)           | 340        | 105 · 234                   |

The tokens behind them, in `01-base.css`:

| Token             | Value                                                     | Read by                                 |
| ----------------- | --------------------------------------------------------- | --------------------------------------- |
| `--rail-w-wide`   | 184px                                                     | both studios' grids, through `--rail-w` |
| `--rail-w-narrow` | 64px                                                      | both studios' grids, through `--rail-w` |
| `--rail-w`        | set by `RailFrame` on the studio's grid to one of the two | `03-shell.css`, `36-media-studio.css`   |
| `--panel-w`       | `clamp(320px, 24vw, 420px)`                               | both studios                            |
| `--top-h`         | 60px                                                      | both top bars                           |
| `--panel-pad`     | 28px 24px 40px                                            | the print panes and the media panel     |
| `--insp-w`        | `clamp(280px, 20vw, 340px)`                               | the media studio                        |

Both top bars read `--top-h` (60 px; the print grid draws a 1 px rule under its bar, the media bar its own border),
so the rail and panel start 61 px down in every studio. Both panels read `--panel-pad` (28 px top, 24 px sides,
40 px bottom), so a panel's eyebrow and title sit at the same place: at 1280 × 720 and 1440 × 900 the title is at
(208, 125) in the print studio and in all three media modes (measured 2026-10-20). Between 761 and 1279 px wide the
media panel shares a column with the inspector and takes its padding (12 / 14 px) instead.

## 2. The rail

One part, `RailFrame` (`src/components/panel/RailFrame.tsx`), wraps both rails.

- **Two widths.** **Wide** (184 px, the default): the icon or step number beside the label, and the Add and Edit
  headings. **Compact** (64 px): the icon or number alone. The label is still the button's accessible name and
  tooltip.
- **Switching.** The button at the rail's foot (_Compact rail_, pressed when compact) or **Ctrl + \\** (Cmd + \\ on
  a Mac). The shortcut is ignored while typing in a field. The grid slides to the new width over `--dur`, with no
  animation under reduced motion, and the stage re-fits.
- **Remembered** on this device in `localStorage` (`chitthi-rail`), shared by both studios. If storage is blocked,
  the rail is wide and still switches.
- **Print rail:** the numbered steps, then Gallery and the toggle at the foot. The open step has an accent bar on its
  left edge and a soft fill.
- **Media rail:** tools under **Add** (bring things in) and **Edit** (change what is there), in that order, with the
  same rows, bar and fill as the print rail. A tool's group and its panel's one-sentence lead live with the tool in
  `src/components/studio/railTools.tsx`. The panel's header shows the group as its eyebrow, the tool's label as its
  title and the lead under it.
- **Never scrolls at 720 px tall.** A rail shows at most 6 tools itself (`railGroups.test.ts`). Tools marked `minor`
  move into a **More** menu at the end of the rail when the window is 720 px tall or less (CSS only: both are always
  rendered). Today the only minor tool is Draw, in the Reel and YouTube editors.

## 3. Type

Body text is 15 px Geist. Headings use Schibsted Grotesk (`--font-head`); numbers in step indexes and eyebrows use
Geist Mono. The brand name in the media top bar is Instrument Serif (`--display`). Sizes are `rem` tokens on a 16 px
root.

| Token              | Size                              | Used for                                             |
| ------------------ | --------------------------------- | ---------------------------------------------------- |
| `--fs-3xs`         | 9 px                              | tiny badges on thumbnails                            |
| `--fs-2xs`         | 11 px                             | rail headings, phone rail labels, timeline ruler     |
| `--fs-xs`          | 12 px                             | eyebrows, section titles, rail labels, panel actions |
| `--fs-sm`          | 13 px                             | list details, small buttons, timeline text           |
| `--fs-md`          | 14 px                             | panel leads, mode buttons, media section titles      |
| `--fs-base`        | 15 px                             | body text                                            |
| `--fs-lg`          | 17 px                             | the title of an empty panel                          |
| `--fs-xl`          | 20 px                             | the brand name                                       |
| `--fs-2xl`         | 24 px                             | media dialog titles, the recording count-in          |
| `--fs-panel-title` | 28 px (25.6 px up to 860 px wide) | a panel's title                                      |
| `--fs-3xl`         | 32 px                             | an empty stage's title                               |
| `--fs-display`     | 64 px                             | not used yet                                         |

Weights are tokens too: `--fw-body` 400, `--fw-label` 500, `--fw-head` 600, `--fw-strong` 700. Bold (700) is for
headings only (502).

| Role                         | Font                  | Size               | Line height | Weight              | Notes                                                                   |
| ---------------------------- | --------------------- | ------------------ | ----------- | ------------------- | ----------------------------------------------------------------------- |
| Empty stage title            | `--font-head`         | `--fs-3xl`         | 1.1         | 700                 | `EmptyState`, stage tone                                                |
| Panel title                  | `--font-head`         | `--fs-panel-title` | 1.08        | 700                 | `PanelHeader`, letter spacing −0.035em                                  |
| Panel eyebrow                | `--mono`              | `--fs-xs`          | 1.2         | 500                 | the step number or Add / Edit, muted                                    |
| Panel lead                   | `--font`              | `--fs-md`          | 1.5         | 400                 | muted, one sentence                                                     |
| Section title                | `--font`              | `--fs-xs`          | 1.5         | 600                 | `FoldSection`: upper case, letter spacing 0.06em, muted                 |
| Section title, media (today) | `--font`              | `--fs-md`          | 1.5         | 600                 | `.igs h3`; 503 moves these to `FoldSection`                             |
| Rail heading                 | `--font`              | `--fs-2xs`         | 1           | 500                 | upper case, letter spacing 0.06em, muted                                |
| Rail label                   | `--font`              | `--fs-xs`          | 1.15        | 500 (600 when open) |                                                                         |
| Label                        | `--font`              | 13 px              | 1.5         | 500                 | `label.f`, muted                                                        |
| Body                         | `--font`              | `--fs-base`        | 1.5         | 400                 |                                                                         |
| Hint                         | `--font`              | 13 px              | 1.5         | 400                 | `.hint`, muted                                                          |
| Number                       | as the text around it |                    |             |                     | `font-variant-numeric: tabular-nums` for times, counts and step numbers |

Labels and hints in `04-controls.css` still use raw sizes (0.82rem). They are not in AC-4's list of stylesheets, and
502 moves them to `--fs-sm`.

## 4. Spacing

A 4 px base. The tokens exist, but most rules still write their spacing in px (on 2026-10-20 only the rail toggle
reads one). New rules use the tokens, and older ones move to them as each stylesheet is touched (503–506); values
that fall between steps, such as the media panel's 14 px side padding, snap to the nearest.

| Token    | Size  | Use                                              |
| -------- | ----- | ------------------------------------------------ |
| `--sp-1` | 4 px  | icon to text in small controls                   |
| `--sp-2` | 8 px  | between controls in a row; the rail toggle's gap |
| `--sp-3` | 12 px | between fields in a section; panel padding       |
| `--sp-4` | 16 px | between groups                                   |
| `--sp-5` | 24 px | around empty states                              |
| `--sp-6` | 32 px | page margins on wide screens                     |

Radii are `--r-sm` 8 px, `--r-md` 12 px and `--r-lg` 16 px; motion is `--dur-fast` 150 ms and `--dur` 220 ms on
`--ease`.

## 5. Colour

Every colour is a token in `01-base.css`, in OKLCH, defined three times: light, dark when the system asks for it
(`prefers-color-scheme`), and dark when chosen (`data-theme="dark"`). Component stylesheets never write a raw colour;
`tests/unit/styles/tokens.test.ts` checks `03-shell.css`, `35-instagram.css`, `36-media-studio.css`, `41-projects.css`
and `42-panel.css`.

Contrast, measured in Chromium on 2026-10-20 (WCAG 2 ratio). Text needs 4.5:1; marks and control edges need 3:1.

| Foreground on background         | Light   | Dark | Use                                                        |
| -------------------------------- | ------- | ---- | ---------------------------------------------------------- |
| `--text` on `--bg`               | 17.3    | 16.6 | body text                                                  |
| `--text` on `--panel`            | 18.1    | 15.6 | panel text                                                 |
| `--muted` on `--panel`           | 6.0     | 6.8  | labels, hints, leads                                       |
| `--muted` on `--sunk`            | 5.3     | 7.4  | muted text on sunk fills (the open rail item, field wells) |
| `--muted` on `--bg`              | 5.8     | 7.2  |                                                            |
| `--accent` on `--panel`          | 17.4    | 15.6 | links, the open tool's icon, the rail bar                  |
| `--on-accent` on `--accent`      | 16.9    | 16.5 | primary buttons                                            |
| `--danger` on `--panel`          | 6.6     | 6.3  | errors                                                     |
| `--good` on `--panel`            | 6.5     | 9.5  | done, saved                                                |
| `--warn` on `--panel`            | 5.6     | 10.3 | warnings                                                   |
| `--stage-ink` on `--stage`       | 15.6    | 17.5 | text on the stage                                          |
| `--stage-muted` on `--stage`     | 7.9     | 8.2  |                                                            |
| `--stage-ink-dim` on `--stage`   | 9.2     | 9.8  | the empty stage's text                                     |
| `--stage-ink-faint` on `--stage` | 6.1     | 6.3  | the stage hint                                             |
| `--stage-accent` on `--stage`    | 10.2    | 11.5 | marigold, the stage highlight                              |
| `--sound-music` on `--panel`     | 4.8     | 5.4  | Music clips and labels (505)                               |
| `--sound-voice` on `--panel`     | 5.2     | 7.8  | Voice clips and labels (505)                               |
| `--sound-fx` on `--panel`        | 5.6     | 6.6  | Effects clips and labels (505)                             |
| `--line-strong` on `--panel`     | 3.6     | 3.6  | field and control edges, ruler ticks, dividers             |
| `--layer-sticker` on `--panel`   | **1.6** | 11.0 | sticker bars on the timeline (a fill, with text on it)     |

Every text pair passes 4.5:1 in both themes, and every control edge 3:1:

- **`--line-strong`** is the border of text and number fields (`04-controls.css`). It was 2.5:1 in light and 2.1:1
  in dark, under WCAG 1.4.11's 3:1 for the edge of a control; on 2026-10-20 it moved to `oklch(62% 0.005 90)` in light
  and `oklch(54% 0.005 90)` in dark (the maintainer, D-066). That is at least 3.1:1 on every surface a field sits on
  (light: 3.2 on `--sunk`, 3.3 on `--field-hover`; dark: 3.1 on `--field-hover`, 3.4 on `--field`).
- **`--layer-sticker` in light** is below 3:1 (1.6), and that is fine. The sticker bars on the timeline are a pale mix of it with a 55 % border of it. They
  hold their own text in `--text`, and the bar is told apart by its label, so this is a fill, not a control edge.

The three sound kinds are the colours 505 uses to tell Music, Voice and Effects apart.

## 6. Shared panel parts

They live in `src/components/panel/` and are styled in `src/styles/42-panel.css`. Use them rather than a studio's
own copy; `tests/unit/components/panel/sharedParts.test.ts` checks that both studios do.

| Part          | What it is                                                                                                                                                                                       | Use it for                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PanelHeader` | Eyebrow and actions on one line, the title, then a one-sentence lead                                                                                                                             | The top of every panel: the print steps (eyebrow = the step number, actions = Collapse all · Expand all) and the media tools (eyebrow = Add or Edit, title = the rail label, lead = the tool's lead) |
| `FoldSection` | A titled group of settings that folds; each remembers its state on this device. `foldAll(scope, open)` and `revealSection(id)`                                                                   | Any group of settings in a panel or inspector. Its `id` must be unique across the app                                                                                                                |
| `ListRow`     | One row of a list: a lead (thumbnail or icon), the name shortened with an ellipsis (the full name is its accessible name and tooltip), a detail line, controls that never wrap, a selected state | Projects today; the media pool (504), the Recordings list (505), Layers (506)                                                                                                                        |
| `EmptyState`  | An icon, a title, a sentence or two and the action that fills it; tone `stage` (large, on the dark stage) or `panel` (quiet, in a list)                                                          | An empty stage, an empty list                                                                                                                                                                        |
| `RailFrame`   | The rail's frame: width, the toggle, Ctrl + \\, the foot                                                                                                                                         | Both rails; a new studio's rail goes inside it too                                                                                                                                                   |

A new panel is a `PanelHeader` followed by `FoldSection`s, with lists built from `ListRow` and an `EmptyState` when
there is nothing yet.

## 7. Panel map

Where every tool and setting lives, today and once Phases 2 and 3 are built. The rule from §1 places each one:
**left** (rail and panel) to add and browse, **right** (inspector) to change the selection, **bottom** (dock) for time.
Edit tools sit on the left too: their panel lists or browses what is there (transitions, layers, masks), and the
selected item's settings open in the inspector.

### The rail today

`src/components/studio/railTools.tsx`; `tests/unit/components/studio/railGroups.test.ts` checks this table.

| Mode             | Add                                | Edit                | Minor (in More at ≤ 720 px tall) |
| ---------------- | ---------------------------------- | ------------------- | -------------------------------- |
| Photo            | Photos, Text, Elements, Draw       | Masks, Layers       | none                             |
| Reel and YouTube | Media, Text, Elements, Draw, Audio | Transitions, Layers | Draw                             |

### The inspector today

What the inspector shows depends on what is selected, in this order (the first that applies).

| Mode             | Selected            | Sections                                                                                                                                           |
| ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Photo            | nothing             | "Nothing selected yet."                                                                                                                            |
| Photo            | a mask (Masks open) | Selected mask; the mask's shape (Brush, Linear gradient, Radial gradient, Colour range, Brightness range, Found by AI); the mask's own adjustments |
| Photo            | a layer             | the layer's properties (by kind: text, shape, sticker, drawing, image)                                                                             |
| Photo            | a photo             | Photo (name and size), Light, Colour, Detail, Effects, Presets and LUTs, Tone curve, Colour mixer                                                  |
| Reel and YouTube | a sound             | the track and sound, Source, volume, fades and keyframes                                                                                           |
| Reel and YouTube | a layer             | the layer's properties, with keyframes                                                                                                             |
| Reel and YouTube | a cut               | Cut, then the transition's settings                                                                                                                |
| Reel and YouTube | a clip              | the clip (name and size, timing), Speed, Position and size, Frame, Colour                                                                          |
| Reel and YouTube | nothing             | Project                                                                                                                                            |

The dock holds the photo strip (photo) or the timeline: transport, edit tools, tracks (Reel and YouTube).

### Planned panels

| Feature  | Panel or setting                                 | Place                                                           | Rail group | Minor |
| -------- | ------------------------------------------------ | --------------------------------------------------------------- | ---------- | ----- |
| 210      | Markers: placing them                            | dock (ruler, M key)                                             |            |       |
| 210      | Markers: the list, to name and jump              | left: Markers tool                                              | Edit       | yes   |
| 210      | In / out points                                  | dock (ruler range, I and O)                                     |            |       |
| 210      | Range export                                     | the Export dialog (top bar)                                     |            |       |
| 210      | Text animations (in, out)                        | right: a section of a text layer's properties                   |            |       |
| 210      | Compound clips: make, open, close                | dock (timeline actions)                                         |            |       |
| 210      | Compound clip settings                           | right: the clip's sections                                      |            |       |
| 211      | Proxies and the frame cache                      | no panel: a status in the media pool (504) and a setting        |            |       |
| 212, 309 | Agent tools                                      | no panel                                                        |            |       |
| 301      | Primary grade: wheels, contrast, pivot           | right: sections of the selected clip (folded)                   |            |       |
| 302      | Curves, secondaries, HSL qualifier               | right: sections of the selected clip (folded)                   |            |       |
| 303      | Scopes: histogram, waveform, parade, vectorscope | left: the top of the Colour panel, beside the inspector's grade | Edit       | no    |
| 304      | Copy / paste grade, timeline LUT, match clips    | left: the Colour panel, under the scopes                        | Edit       | no    |
| 305      | Auto captions: make them, the list of lines      | left: Captions tool                                             | Edit       | no    |
| 305      | A caption's style and timing                     | right: text layer properties                                    |            |       |
| 306      | Spot heal and clone (photo)                      | left: Heal tool; the brush in the inspector, as Masks           | Edit       | no    |
| 307      | 10-bit, HDR, professional formats                | the Export dialog (desktop)                                     |            |       |
| 308      | AI object removal (photo, desktop)               | left: inside the Heal tool                                      |            |       |

### The rail once they are built

| Mode             | Add                                | Edit                                           | Shown | Minor                              |
| ---------------- | ---------------------------------- | ---------------------------------------------- | ----- | ---------------------------------- |
| Photo            | Photos, Text, Elements, Draw       | Masks, Heal, Layers                            | 6     | Layers                             |
| Reel and YouTube | Media, Text, Elements, Draw, Audio | Colour, Captions, Transitions, Layers, Markers | 6     | Draw, Transitions, Layers, Markers |

Agreed by the maintainer on 2026-10-20 (D-066). Minor tools are the ones whose items can also be reached elsewhere: drawings, layers, cuts and markers are all
selected on the stage or the timeline. A rail shows at most 6 tools itself (the test's limit).

### When the rail needs More

The rail must never scroll. With every tool shown, it needs

> 48 px × tools + 23 px × headings + 40 px (the toggle)

Today's video rail needs 48 × 7 + 46 + 40 = 422 px. At 1280 × 720 the media rail is 425 px tall (the window less the
61 px top bar and the 234 px timeline), so the More threshold at **720 px** leaves room, and the photo rail (6 tools,
374 px of a 554 px rail) never needs it. Checked in Chromium at 700, 720, 721 and 722 px tall: the video rail never
scrolls. Each tool added to a rail raises the height it needs by 48 px. When the video rail grows to 10 tools
(566 px), all ten fit only from a window about 860 px tall, so the `max-height` query in `36-media-studio.css` must
move with it (to 860 px) in the feature that adds the eighth tool (D-066). The 6-tool limit keeps the rail with More
open at 6 × 48 + 46 + 48 + 40 = 422 px, so it fits at 720 px.
