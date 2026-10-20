<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 501 — Studio design overview: one layout and type scale for every studio · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (D1 A, D2 A with the expandable rail expanded by default, D3 A; 2026-10-20, D-064, D-065) <!-- Draft | Approved -->

## Approach

501 is mostly a design document plus the groundwork the other Phase UI features stand on: tokens, shared panel parts and the media studio's left side moved to the print studio's measurements. It does not change what any panel contains (503–506) or the weights of text (502).

**§1 The design document.** `docs/DESIGN.md` (new) is the single description of the studio layout: top bar, rail, panel, stage, inspector, dock; their widths at phone (≤ 640 px), 1280, 1440 and ≥ 1920; the type scale (size, line height, weight, font for each role: page title, panel title, section title, label, body, hint, number); the spacing scale; the colour tokens in both themes, including three sound-kind colours that 505 uses; and the shared parts (§3). Screenshots of the print studio and of each media mode at 1440 × 900, before and after, go to `docs/screenshots/design/` (taken by hand in 501; 507 scripts them). AC-1.

**§2 The panel map.** A section of `DESIGN.md` lists every rail tool and inspector section of the photo, Reel and YouTube modes today, plus every panel planned in 210, 301–305 and 309, each placed by the rule *left: add and browse; right: change the selection; dock: time*. The rail groups tools under **Add** (Media, Text, Elements, Draw, Audio) and **Edit** (Transitions, Layers; later Markers, Colour, Captions), with a **More** menu below 720 px of height (spec Q2). The map is the input to 503–506 and to 210's spec. AC-2. The grouping itself is built here (§4) so the rail never scrolls at 720 px.

**§3 Shared panel parts.** A new folder `src/components/panel/` holds the parts both studios use:
- `PanelHeader`: eyebrow (e.g. "Step 1 of 6" or "Add"), title, one-line lead, optional actions (Collapse all). The print studio's `Pane` header and every media-studio panel's own `<h2>` are replaced by it.
- `FoldSection`: today's `Section` from `components/common.tsx`, moved unchanged in behaviour (remembered state, `revealSection` for the feature finder, `aria-expanded`). 503 adds the one-open-at-a-time group to it; 501 only moves it so there is one copy.
- `ListRow`: a row with a leading thumbnail or icon, a name that shortens with an ellipsis (full name as its accessible name and title), an optional detail line, and trailing controls that never wrap. 504–506 build their lists on it; 501 uses it for the Projects list.
- `EmptyState`: icon, title, text and an action; replaces `EmptyPhotoStage` / `EmptyStage`'s duplicated markup.
Every import of `Section` / `revealSection` moves to `components/panel` in the same task, so there is no re-export left in `common.tsx`. AC-3.

**§4 The media studio's left side on the print studio's measurements.** Layout tokens move to `:root` in `01-base.css`: `--rail-w: 88px`, `--panel-w` (shared, D1), `--insp-w` (D3). `03-shell.css` (print) and `36-media-studio.css` both read them, so the two left sides cannot drift. The media rail takes the print rail's style (the same button height, type, active state with the bar and soft fill) but keeps its icons, since its items are tools, not ordered steps (D2). The media panel's top uses `PanelHeader` with the print studio's spacing. AC-4, AC-5.

**§5 Tokens only.** `36-media-studio.css`, `35-instagram.css` and `41-projects.css` have about 50 raw colours and 48 raw font sizes. They are replaced by tokens from `01-base.css` (the existing colour tokens and the new `--fs-*` sizes from §1); colours used only on the dark stage become `--stage-*` tokens. A unit test (§Test Approach) keeps it that way. Weights are left as they are: 502 changes them using the same tokens.

**§6 Expandable rail (D2, AC-6).** One `RailFrame` part in `components/panel/` wraps both rails (print steps, media tools). It has two widths: **expanded** (`--rail-w-wide`, ~184 px: icon or step number beside the label, group headings shown) and **compact** (`--rail-w-narrow`, ~64 px: icon or number only, label as `aria-label` and tooltip). The width comes from a pure rule, `railWidth(saved)`: the saved choice if there is a valid one, else expanded (the default). The choice is stored per device in `localStorage` (`chitthi-rail`, wrapped in try/catch; the rail still works when storage is blocked) and shared by both studios, so moving between them keeps the same rail. The toggle is a button at the foot of the rail plus **Ctrl + \**. The shell grid reads `--rail-w`, which the frame sets from the state, and animates `grid-template-columns` over `--dur` (none under `prefers-reduced-motion`); the stage's `useFit` ResizeObserver already re-fits the canvas as the stage column changes. On phones the rail is the bottom bar and the toggle is hidden.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `docs/DESIGN.md` | new | The layout, breakpoints, type, spacing and colour scales, shared parts and the panel map (§1, §2) |
| `docs/screenshots/design/*.webp` | new | Before/after screenshots of each studio at 1440 × 900 for the document (§1) |
| `src/styles/01-base.css` | modify | Layout, type-size, weight, spacing and sound-kind tokens in both themes (§4, §5) |
| `src/components/panel/PanelHeader.tsx`, `FoldSection.tsx`, `ListRow.tsx`, `EmptyState.tsx`, `index.ts` | new | The shared panel parts (§3) |
| `src/components/panel/RailFrame.tsx`, `railWidth.ts` | new | The expandable rail shared by both studios: width rule, toggle, Ctrl + \, remembered choice (§6) |
| `src/components/Rail.tsx` | modify | The print steps inside `RailFrame`: number + label when wide, number only when narrow (§6) |
| `src/styles/42-panel.css` | new | Styles for the shared parts, moved from `04-controls.css` (`.pane-top`, `.sec`) and `36-media-studio.css` (`.mst-empty`); imported last in `src/styles.css` |
| `src/components/common.tsx` | modify | `Pane` uses `PanelHeader`; `Section` / `revealSection` move to `panel/FoldSection.tsx` (§3) |
| `src/components/panes/*.tsx`, `src/components/FeatureFinder.tsx`, `src/components/ig/*.tsx` | modify | Import `FoldSection` / `revealSection` from `components/panel` (§3) |
| `src/components/studio/Shell.tsx` | modify | Rail groups (Add, Edit), More menu, `PanelHeader` at the top of the panel from the rail item (§2, §4) |
| `src/components/studio/VideoWorkspace.tsx`, `PhotoWorkspace.tsx` | modify | Rail items get `group`, `minor`, `lead` (§2) |
| `src/components/studio/VideoPanels.tsx`, `PhotoPanels.tsx`, `AudioPanel.tsx`, `TransitionPanel.tsx`, `ProjectsPanel.tsx`, `src/components/ig/LayerPanel.tsx` | modify | Drop their own `<h2>` titles (the shell's `PanelHeader` shows it); empty stages use `EmptyState`; Projects list uses `ListRow` (§3) |
| `src/styles/03-shell.css`, `36-media-studio.css`, `35-instagram.css`, `41-projects.css` | modify | Read the shared width tokens; media rail in the print rail's style; raw colours and font sizes replaced by tokens (§4, §5) |
| `tests/unit/styles/tokens.test.ts`, `tests/unit/components/panel/sharedParts.test.ts`, `tests/unit/components/studio/railGroups.test.ts` | new | AC-2–AC-4 |
| `specs/features/590-phase-ui-test-pass/feature.json` | modify | AC-5's e2e check listed (already in its deferred checks) |
| `specs/lld.md`, `specs/architecture.md` | modify | `components/panel/` in the module map; tokens as the styling rule |
| `tests/unit/components/panel/railWidth.test.ts` | new | AC-6 |

## Data Structures & Interfaces

```ts
// src/components/panel/PanelHeader.tsx
export interface PanelHeaderProps {
  /** Small label above the title: "Step 1 of 6", "Add", "Edit". */
  eyebrow?: string;
  title: string;
  /** One short sentence under the title. */
  lead?: ReactNode;
  /** Right-aligned actions on the eyebrow line (Collapse all). */
  actions?: ReactNode;
}
export function PanelHeader(props: Readonly<PanelHeaderProps>): JSX.Element;

// src/components/panel/FoldSection.tsx  (today's Section, moved)
export interface FoldSectionProps { id: string; title: ReactNode; note?: ReactNode; defaultOpen?: boolean; children: ReactNode }
export function FoldSection(props: Readonly<FoldSectionProps>): JSX.Element;
export function revealSection(id: string): void;

// src/components/panel/ListRow.tsx
export interface ListRowProps {
  /** Thumbnail, icon or colour chip. */
  lead?: ReactNode;
  name: string;
  /** Second line: length, kind, "Not used". */
  detail?: ReactNode;
  /** Buttons that stay visible; they never wrap. */
  controls?: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
}
export function ListRow(props: Readonly<ListRowProps>): JSX.Element;

// src/components/panel/EmptyState.tsx
export interface EmptyStateProps { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; tone?: 'stage' | 'panel' }
export function EmptyState(props: Readonly<EmptyStateProps>): JSX.Element;

// src/components/panel/railWidth.ts (pure, unit-tested)
export type RailWidth = 'wide' | 'narrow';
/** The saved choice; anything else (null, unreadable storage) gives the default, wide. */
export function railWidth(saved: unknown): RailWidth;

// src/components/panel/RailFrame.tsx
export interface RailFrameProps { label: string; children: ReactNode; /** e.g. Gallery in the print studio */ foot?: ReactNode }
export function RailFrame(props: Readonly<RailFrameProps>): JSX.Element; // owns the width state, the toggle and Ctrl + \

// src/components/studio/Shell.tsx
export interface RailItem<T extends string> {
  id: T; label: string; icon: ReactNode;
  /** The rail heading it sits under (§2). */
  group: 'add' | 'edit';
  /** Shown in More when the window is under 720 px tall. */
  minor?: boolean;
  /** The panel's lead (PanelHeader). */
  lead?: string;
}
```

```css
/* src/styles/01-base.css, :root — new tokens (values settled in DESIGN.md) */
--rail-w-wide: 184px; --rail-w-narrow: 64px; /* --rail-w is set by RailFrame from the state (§6) */
--panel-w: clamp(320px, 24vw, 420px); /* D1 */
--insp-w: clamp(280px, 20vw, 340px);  /* D3 */
--fs-xs: 0.75rem; --fs-sm: 0.8125rem; --fs-md: 0.875rem; --fs-base: 0.9375rem; --fs-lg: 1.125rem; --fs-xl: 1.5rem;
--fw-body: 400; --fw-label: 500; --fw-head: 600;
--sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-5: 24px;
--sound-music: …; --sound-voice: …; --sound-fx: …; /* both themes */
```

## Techniques

- **CSS custom properties as the single source.** Layout widths, sizes, spacing and colours are tokens on `:root` with dark-theme values in the existing `prefers-color-scheme` and `[data-theme]` blocks; component stylesheets only read them. No CSS-in-JS, no new library.
- **`clamp()` widths** let the shared panel width follow the window without new breakpoints; the existing breakpoints in `36-media-studio.css` (< 1280 folds panel and inspector into one column, phones stack) stay.
- **Rail grouping without measuring in JS:** the rail is a flex column with two labelled groups; a `@media (max-height: 720px)` rule hides `minor` items and shows the **More** button, whose menu lists them. No ResizeObserver.
- **Moving `Section` without changing behaviour:** the `localStorage` key `chitthi-sections` and the ids stay, so users' open/closed sections survive; the feature finder's `revealSection` keeps its signature.
- **Static checks as unit tests** (Vitest has no DOM here): tests read the stylesheet and component source files as text, as `npm run check`'s structure check already does, and assert the token and shared-part rules. They are fast and need no browser.
- **Performance:** CSS and markup only; no new work in render loops; the new parts are small and in the studio chunks, so the entry chunk does not grow (checked by `npm run build` at the end of the feature).
- **Rail width as state, not media queries:** the rule is a pure function so it is unit-tested; no resize listener is needed (the width changes only when the user toggles it). Ctrl + \ is ignored while typing in a field, like the studio's other shortcuts.

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `docs/DESIGN.md` reviewed and approved by the maintainer (layout, breakpoints, type and spacing scales, tokens, parts, screenshots) | manual (in 501, before 502–506 are planned) |
| AC-2 | The panel map section of `DESIGN.md` reviewed with AC-1; `tests/unit/components/studio/railGroups.test.ts`: every rail item of the three modes has a group, the Add and Edit groups hold the tools the map lists, and at most 6 non-minor items per mode | manual + unit |
| AC-3 | `tests/unit/components/panel/sharedParts.test.ts`: no file under `src/components/studio`, `src/components/ig` or `src/components/panes` defines its own panel title (`<h2`), empty state (`mst-empty`) or folding section (`aria-expanded` toggles outside `panel/`); `common.tsx` exports no `Section`; both studios import from `components/panel` | unit |
| AC-4 | `tests/unit/styles/tokens.test.ts`: `35-instagram.css`, `36-media-studio.css`, `41-projects.css`, `03-shell.css` and the new panel styles contain no raw colour (hex, rgb, hsl, oklch) and no raw `font-size` outside custom-property definitions; `--rail-w` and `--panel-w` are defined once, in `01-base.css`, and read by both studios' layouts. Proven to fail by adding one raw colour | unit |
| AC-5 | Deferred to 590: Playwright at 1440 × 900 and 1280 × 720 measures the rail and panel boxes and the panel title's position in `#/studio`, `#/instagram`, `#/instagram/video`, `#/instagram/youtube` (within 2 px) | e2e (590) |
| AC-6 | `tests/unit/components/panel/railWidth.test.ts`: wide by default, a saved narrow or wide choice is kept, an unknown value or unreadable storage gives wide. The e2e check (toggle, Ctrl + \, both studios, the stage re-fitting, reduced motion) is deferred to 590 | unit + e2e (590) |

## Risks & Mitigations

- **The print studio looks different after the width change (D1 A).** Its panes were laid out for 420 px. Mitigation: the first task takes before/after screenshots of all six print steps at 1280, 1440 and 1920 and checks photo grids, calendar captions and the envelope section; a narrow pane that breaks is fixed in the same task.
- **Moving `Section` loses users' folded state or breaks the feature finder.** Mitigation: same `localStorage` key and ids; `revealSection` keeps its signature; the existing feature-finder unit tests run unchanged.
- **Replacing ~100 raw values changes colours by accident.** Mitigation: each raw value maps to the token with the same value where one exists; a new `--stage-*` token is added where none does, so the rendered colour doesn't change; before/after screenshots compared at the end.
- **Static source checks are brittle** (they match text, not behaviour). Mitigation: they check only clear markers (`<h2`, `mst-empty`, raw colour syntax) and list exceptions by name, with the reason, in the test.
- **E2e and selectors:** existing e2e tests may find panel titles by their `<h2>` text. Mitigation: `PanelHeader` renders the title as an `<h2>` with the same text, so role/name queries keep working; 590 runs the suite.
- **The print studio's rail changes too** (it gets the toggle and a compact width). Mitigation: its steps keep their numbers in both widths and `aria-current="step"`; the phone layout (rail across the top, scrolling sideways) is untouched.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Spec approved 2026-10-20; this plan waits for approval (D1–D3). |
| II. Test-gated delivery | ✅ | AC-2–AC-4 unit tests written with the code; AC-1 manual review in 501; AC-5 e2e deferred to 590 (D-033). |
| III. Small dependencies | ✅ | No new dependency: CSS custom properties and React only. |
| IV. Memory maintained | ✅ | D1–D3 go into `memory/decisions.md` when chosen; progress per session. |
| V. Free and open source | ✅ | Same design for everyone, web and desktop. |
| VI. On device, no backend | ✅ | No network use. |
| VII. Permissive licences | ✅ | No new fonts or assets; screenshots use sample media already cleared (no photos of people). |
| VIII. WYSIWYG, one code path | ✅ | UI only; preview and export drawing are untouched. |
| IX. Secure desktop shell | ✅ | No Electron or IPC change. |
| X. Budgets and accessibility | ✅ | No entry-chunk growth (checked by `npm run build`); `PanelHeader` keeps one `<h2>` per panel; `FoldSection` keeps `aria-expanded`/`aria-controls`; contrast of new tokens ≥ 4.5:1 in both themes, noted in DESIGN.md; axe in 590. |
| XI. Agents use the same code | ✅ | No agent tool changes; tools act on state, not on panels. |

## Decisions for the maintainer

**D1 One panel width for both studios.** _Chosen (the maintainer, 2026-10-20):_ A. The print panel is 420 px; the media panel is 300 px, beside a 320 px inspector the print studio doesn't have. A shared 420 px would leave the video stage about 450 px wide at 1280. Options: **A (recommended)** one token `clamp(320px, 24vw, 420px)`: 346 px at 1440, 420 px at 1750 and wider, in both studios; the print panel gets narrower on laptops (its photo grids already wrap). **B** keep the print studio at 420 px and give the media studio 420 px only from 1750 px, which fails AC-5's "same width" at 1280 and 1440. **C** 360 px fixed for both.

**D2 Rail style.** _Chosen (the maintainer, 2026-10-20):_ A, with the rail expandable and compact in both studios, expanded by default (§6, AC-6). **A** the media rail takes the print rail's width, spacing, type and active state but keeps icons (tools have no order); the print rail keeps its numbers. **B** both rails show icons. **C** the media rail shows numbers too (no meaning for tools).

**D3 Inspector width.** _Chosen (the maintainer, 2026-10-20):_ A. **A (recommended)** `clamp(280px, 20vw, 340px)`: 288 px at 1440, wider on large screens, so the stage keeps room at 1280–1440. **B** keep 320 px fixed.
