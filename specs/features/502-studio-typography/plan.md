<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 502 — Typography: bold only for headings · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (D1 A, D2 A, D3 A; 2026-10-20, D-067) <!-- Draft | Approved -->

## Approach

502 changes weights only: which text is bold, never sizes, colours or layout (501 set those). On 2026-10-20 about 90 rules outside the landing page set a weight above 500 (`font-weight` 600/700 or a `font` shorthand), plus the browser's own bold for `h1`–`h4`, `th`, `b` and `strong`.

**§1 The weights, by role (spec Q1, Q2).** Four tokens already exist in `01-base.css`: `--fw-body` 400, `--fw-label` 500, `--fw-head` 600, `--fw-strong` 700. The roles: body text and hints `--fw-body`; labels, buttons, tabs, list items, timeline text and selected states `--fw-label`; panel titles and section titles `--fw-head` in `--font-head`; dialog titles and the empty stage's title `--fw-strong`. Section titles (`FoldSection`'s `.sec-h`, the print panes' `.pane h3`, the media studio's `.igs h3`) leave capitals and letter spacing for sentence case in `--font-head` 600; their text in the components is already sentence case, so only CSS changes. `docs/DESIGN.md` §3 is updated (it gives the panel title 700 today).

**§2 One list of allowed selectors.** `docs/DESIGN.md` §3 gets a fenced block listing every selector allowed above 500 (headings, plus D3's values if chosen). A unit test (`tests/unit/styles/weights.test.ts`) reads that block and every stylesheet under `src/styles/` except the landing page's (D1), and fails on any rule that sets a weight above 500 (number, `bold`, `bolder`, a `--fw-head` / `--fw-strong` token, or the weight in a `font` shorthand) whose selector is not in the list. The list lives in the document, so the test and the design cannot drift.

**§3 The browser's own bold.** `01-base.css` sets `h1`–`h4` to `--fw-head` and `th` to `--fw-label`, so an unstyled heading follows the scale; `b` and `strong` become `--fw-head` (§5).

**§4 The sweep.** File by file (print studio, media studio and timeline, dialogs, guides and docs page), each rule the test finds either moves to its role's token or, for a heading, joins the list. Selected states (current step, pressed segment, open rail tool, checked menu row) lose their weight change and keep their bar, fill or tick (D2). The `.tray-add` plus sign (300) moves to 400.

**§5 Inline `<b>` and `<strong>` (AC-2).** 26 components use them. Each use is kept only for a value the user must notice (a limit, a count, a size) and otherwise becomes plain text or a `<span>` with a class. A unit test (`tests/unit/components/inlineBold.test.ts`) lists the component files that still contain `<b>` / `<strong>` and compares the list with a second fenced block in `DESIGN.md` §3, one line per file saying what it marks.

**§6 Fonts (AC-3).** The fonts load the weights in use and no others; every stylesheet counts, the landing page's too, since it loads the same fonts. Measured on 2026-10-20 (T030): Geist is drawn at 400–700 (the landing page uses 500–700, the recording countdown 700), Geist Mono at 400–600 (the performance readings are 600), Schibsted Grotesk at 600–800 (the landing page uses 800). So the Google Fonts URL (`index.html`, the `@import` in `styles.css`, `scripts/fetch-fonts.mjs` for the desktop app's offline copy) narrows Geist from `300..700` to `400..700` (300 was used only by the tray's plus sign, now 400), Geist Mono stays `400..600`, and the local `@font-face` for Schibsted declares `600 800` (was `500 800`). A unit test (`tests/unit/styles/fonts.test.ts`) checks that the three URLs are the same and that each family's loaded range runs exactly from its lightest to its heaviest weight in use, so no weight is synthesised and none is fetched unused. Hind and Mukta (Devanagari fallbacks) keep their weights.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `docs/DESIGN.md` | modify | §3 weights by role (panel title 600), sentence-case section titles, the allowed-selectors and inline-bold lists the tests read (§1, §2, §5) |
| `src/styles/01-base.css` | modify | Base weights for `h1`–`h4`, `th`, `b`, `strong`; Schibsted `@font-face` declares 600–700 (§3, §6) |
| `src/styles/42-panel.css`, `04-controls.css`, `35-instagram.css` | modify | Section titles in sentence case, `--font-head` 600; panel title 600 (§1) |
| `src/styles/*.css` (about 25 files, not the landing page) | modify | Every weight above 500 moved to its role token or listed as a heading (§4) |
| `index.html`, `src/styles.css`, `scripts/fetch-fonts.mjs` | modify | Geist 400..700 in the font URL (300 unused) (§6) |
| Components using `<b>` / `<strong>` (26 files) | modify | Keep them only for values the user must notice (§5) |
| `tests/unit/styles/weights.test.ts`, `tests/unit/styles/fonts.test.ts`, `tests/unit/components/inlineBold.test.ts` | new | AC-1, AC-3, AC-2 |

## Data Structures & Interfaces

No code interfaces change. Two fenced blocks in `docs/DESIGN.md` §3, read by the tests, each found by its marker comment, one entry per line, the first field the selector or file:

```text
<!-- weights-allowed: selectors that may set a weight above 500 -->
.panel-head h2        600  panel title
.dhead h2             700  dialog title
...
```

```text
<!-- inline-bold: components that may use <b> or <strong> -->
src/components/SizeGuide.tsx   sizes in mm and px
...
```

## Techniques

- **CSS read as text, no parser dependency:** the tests split each stylesheet into rules with a small brace-matching loop (comments removed, `@media` blocks entered), as `tokens.test.ts` does.
- **Weights through tokens:** a heading uses `var(--fw-head)` or `var(--fw-strong)`, never a number, so the test recognises four forms (number, keyword, token, shorthand).
- **Variable fonts:** one Geist file serves the whole range; narrowing the URL's range gives a smaller file, and a weight outside it shows up in the test rather than as a synthesised glyph.

## Test Approach

| AC | Test | Kind |
| --- | --- | --- |
| AC-1 | `tests/unit/styles/weights.test.ts`: no weight above 500 outside `DESIGN.md`'s allowed list, in every stylesheet but the landing page's; proven to fail by adding `font-weight: 600` to a label rule | unit |
| AC-2 | `tests/unit/components/inlineBold.test.ts`: the files using `<b>` / `<strong>` equal `DESIGN.md`'s list; proven to fail by adding a `<b>` to a panel | unit |
| AC-3 | `tests/unit/styles/fonts.test.ts`: the three font URLs match; every used weight is inside its family's loaded range | unit |
| AC-4 | Before/after screenshots of each studio in both themes, the maintainer's approval (deferred to 590, with 501's T001 / T042 set) | manual (590) |

## Risks & Mitigations

- **Text loses emphasis where weight was the only cue** (a selected item, a total). Mitigation: §4 changes a selected state only where it has another cue (bar, fill, tick); D2 and D3 for the maintainer; 590's before/after screenshots in both themes (AC-4).
- **Dark-theme text looks thin at 400.** Mitigation: body text stays 15 px at 400 (as most text is today); labels go to 500, not 400; checked in 590's dark-theme screenshots (US-2).
- **Narrowing the font URL misses a weight in use** (e.g. 700 in a guide), which the browser then synthesises. Mitigation: `fonts.test.ts` derives the used weights from the stylesheets, so the URL cannot be narrowed below them.
- **Sentence-case section titles wrap in a 320 px panel.** Mitigation: they lose letter spacing, so they are no wider than before; checked by eye at 1280 in each print step and media tool.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Spec approved 2026-10-20; plan approved 2026-10-20 (D1–D3 A, D-067). |
| II. Test-gated delivery | ✅ | AC-1–AC-3 unit tests, each proven to fail; AC-4 manual in 590 (D-033). |
| III. Small dependencies | ✅ | No new dependency; the tests read CSS as text. |
| IV. Memory maintained | ✅ | D1–D3 go into `memory/decisions.md` when chosen. |
| V. Free and open source | ✅ | Same for everyone. |
| VI. On device, no backend | ✅ | The font URL gets smaller; no new request. |
| VII. Permissive licences | ✅ | Same fonts (SIL OFL), fewer weights. |
| VIII. WYSIWYG, one code path | ✅ | UI text only; text drawn on designs and frames uses its own fonts and weights, untouched. |
| IX. Secure desktop shell | ✅ | No Electron change; `fetch-fonts.mjs` fetches the same families. |
| X. Budgets and accessibility | ✅ | CSS only, no entry growth; contrast unchanged (weights only); headings keep their elements. |
| XI. Agents use the same code | ✅ | No agent tool changes. |

## Decisions for the maintainer

**D1 Which stylesheets the weight test covers.** _Chosen (the maintainer, 2026-10-20):_ A. The spec puts the landing page out of scope but AC-1 says every stylesheet. **A (recommended)** every stylesheet except the landing page's (`07-landing`, `23-landing-showcase`, `27-landing-3d`, `38-landing-studios`), listed by name in the test; the sizes and paper guides and the docs page follow the scale too. **B** only the studio stylesheets (print, media, timeline, dialogs); the guides and docs keep their own weights. **C** every stylesheet, the landing page included.

**D2 Selected states.** _Chosen (the maintainer, 2026-10-20):_ A. The current print step, a pressed segment, the open rail tool and a checked menu row are 600 today. **A (recommended)** 500 like any label: each already has a stronger cue (the accent bar, a fill, a tick). **B** allow 600 for selected states as a named group in the list.

**D3 Values that must be noticed.** _Chosen (the maintainer, 2026-10-20):_ A. A few rules make a number bold: the timeline's time (`.tl-time b`), the recording countdown and level warning (`.rv-countdown`, `.rv-count`, `.rv-loud`), the performance monitor's values, count badges. **A (recommended)** allow 600 for these as a short named `value` group in the list (the countdown keeps 700: it is display-sized); everything else in the sweep goes to 500. **B** no exceptions: values are 500 and stand out by size and colour.
