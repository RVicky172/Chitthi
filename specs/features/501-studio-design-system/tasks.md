<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 501 — Studio design overview: one layout and type scale for every studio · Tasks

**Plan:** `./plan.md`
Legend: `[P]` = can run in parallel with the previous task; 👤 = needs a person. Each task lists files and the proving test.
Test-first: each "failing" task must fail before its paired implementation makes it pass. Tasks run one at a time in the main session.
Tasks are proven by unit tests only (D-033); AC-5 and AC-6's browser checks are listed in `590` ("Deferred checks collected from the phase").
When a task is done, record a **Result (YYYY-MM-DD):** note with `npm run specs -- done 501 Txxx --result "…"`.

## Setup

Before pictures first, so every later change can be compared.

- [ ] **T001** — Before screenshots: the six print steps at 1280 × 720, 1440 × 900 and 1920 × 1080, and the photo, Reel and YouTube modes with a sample project (each rail tool open) at 1280 × 720 and 1440 × 900, light and dark, taken with a throwaway Playwright script against `npm run dev`; kept in `docs/screenshots/design/before/` (WebP). · files: `docs/screenshots/design/before/*.webp` · test: recorded in the result note (no committed test)

## Tokens

§4, §5: one source for widths, sizes, spacing and colours.

- [ ] **T010** — Failing test: no raw colour (hex, rgb, hsl, oklch) and no raw `font-size` outside custom-property definitions in `03-shell.css`, `35-instagram.css`, `36-media-studio.css`, `41-projects.css`, `42-panel.css`; `--rail-w-wide`, `--rail-w-narrow`, `--panel-w`, `--insp-w` defined once, in `01-base.css`, and read by `03-shell.css` and `36-media-studio.css`. Exceptions listed by name with the reason. · files: `tests/unit/styles/tokens.test.ts` · test: `tests/unit/styles/tokens.test.ts` (fails first)
- [ ] **T011** — New tokens in `01-base.css` for both themes: `--rail-w-wide` 184 px, `--rail-w-narrow` 64 px, `--panel-w: clamp(320px, 24vw, 420px)` (D1), `--insp-w: clamp(280px, 20vw, 340px)` (D3), `--fs-*`, `--fw-*`, `--sp-*`, `--sound-music` / `--sound-voice` / `--sound-fx`, and the `--stage-*` colours the media studio uses raw today (same values, so nothing changes colour). Contrast of each text token against its background noted for DESIGN.md. · files: `src/styles/01-base.css` · test: `tests/unit/styles/tokens.test.ts` (the definitions part passes)
- [ ] **T012** — Raw colours and font sizes in `36-media-studio.css` replaced by tokens (same rendered values); `.mst` reads the shared width tokens instead of its own `--rail-w` / `--panel-w` / `--insp-w`. · files: `src/styles/36-media-studio.css` · test: `tests/unit/styles/tokens.test.ts`
- [ ] **T013** — The same for `35-instagram.css`, `41-projects.css` and `03-shell.css`; the print shell's `88px 420px` grid reads `--rail-w` and `--panel-w`. Then the print steps compared with T001's pictures at the three widths (photo grids, calendar captions, envelope, print pack): anything that breaks at the narrower panel is fixed here. `tokens.test.ts` passes. · files: `src/styles/35-instagram.css`, `src/styles/41-projects.css`, `src/styles/03-shell.css`, `src/styles/04-controls.css` · test: `tests/unit/styles/tokens.test.ts`; screenshots compared in the result note

## Shared parts

§3: one copy of each panel part, used by both studios.

- [ ] **T020** — Failing test: no file in `src/components/{studio,ig,panes}` defines its own panel title (`<h2`), empty state (`mst-empty`) or folding toggle (`aria-expanded` on a section title outside `components/panel/`); `components/common.tsx` exports no `Section` or `revealSection`; the print `Pane`, `StudioShell` and the empty stages import from `components/panel`. Exceptions listed by name with the reason (dialogs keep their own titles). · files: `tests/unit/components/panel/sharedParts.test.ts` · test: `tests/unit/components/panel/sharedParts.test.ts` (fails first)
- [ ] **T021** — `Section` and `revealSection` move from `common.tsx` to `components/panel/FoldSection.tsx` (exported as `FoldSection`, same storage key `chitthi-sections`, same ids, same reveal behaviour); every import moved (panes, feature finder, `ig/`); `.sec` styles move from `04-controls.css` to the new `42-panel.css`, imported last in `src/styles.css`. · files: `src/components/panel/FoldSection.tsx`, `src/components/panel/index.ts`, `src/components/common.tsx`, `src/components/panes/*.tsx`, `src/components/FeatureFinder.tsx`, `src/styles/42-panel.css`, `src/styles/04-controls.css`, `src/styles.css` · test: the existing feature-finder and section unit tests, unchanged
- [ ] **T022** — `PanelHeader` (eyebrow, title as `<h2>`, lead, actions); the print `Pane` draws its top with it (Step n of 6, Collapse all · Expand all); `.pane-top` / `.pane h2` / `.lead` styles move to `42-panel.css`. · files: `src/components/panel/PanelHeader.tsx`, `src/components/common.tsx`, `src/styles/42-panel.css`, `src/styles/04-controls.css` · test: `sharedParts.test.ts` (Pane part)
- [ ] **T023** — `StudioShell` draws a `PanelHeader` at the top of the panel from the rail item (eyebrow Add / Edit, label, `lead`); the media panels drop their own `<h2>` titles and opening sentence (moved to the rail items' `lead`): Media, Text, Elements, Draw, Transitions, Audio, Layers, Photos, Masks. · files: `src/components/studio/Shell.tsx`, `src/components/studio/VideoWorkspace.tsx`, `src/components/studio/PhotoWorkspace.tsx`, `src/components/studio/VideoPanels.tsx`, `src/components/studio/PhotoPanels.tsx`, `src/components/studio/AudioPanel.tsx`, `src/components/studio/TransitionPanel.tsx`, `src/components/ig/LayerPanel.tsx`, `src/components/ig/MaskPanel.tsx` · test: `sharedParts.test.ts` (panel titles part)
- [ ] **T024** — `EmptyState` (icon, title, text, action; `tone` stage or panel); `EmptyPhotoStage` and `EmptyStage` use it; `.mst-empty` styles move to `42-panel.css`. · files: `src/components/panel/EmptyState.tsx`, `src/components/studio/PhotoPanels.tsx`, `src/components/studio/VideoPanels.tsx`, `src/styles/42-panel.css`, `src/styles/36-media-studio.css` · test: `sharedParts.test.ts` (empty-state part)
- [ ] **T025** — `ListRow` (lead, name with ellipsis and full name as title and accessible name, detail, controls that never wrap, selected); the Projects list uses it. `sharedParts.test.ts` passes. · files: `src/components/panel/ListRow.tsx`, `src/components/studio/ProjectsPanel.tsx`, `src/styles/42-panel.css`, `src/styles/41-projects.css` · test: `tests/unit/components/panel/sharedParts.test.ts`

## Rail

§2, §6: the expandable rail (expanded by default) and the Add / Edit groups.

- [ ] **T030** — Failing test, then `railWidth(saved)`: wide by default; a saved `narrow` or `wide` is kept; any other value (null, garbage, storage that throws) gives wide. Plus the storage helpers (`readRailWidth`, `saveRailWidth`, try/catch). · files: `tests/unit/components/panel/railWidth.test.ts`, `src/components/panel/railWidth.ts` · test: `tests/unit/components/panel/railWidth.test.ts`
- [ ] **T031** — `RailFrame`: holds the width state (from `railWidth`), sets `--rail-w` on the studio root, the toggle at the rail's foot (Expand rail / Collapse rail, `aria-pressed`), Ctrl + \ (ignored while typing), labels hidden but kept as `aria-label` and `title` when narrow, the width animated over `--dur` and not under `prefers-reduced-motion`; hidden on phones. · files: `src/components/panel/RailFrame.tsx`, `src/styles/42-panel.css` · test: `railWidth.test.ts` (logic); the UI is checked in 590
- [ ] **T032** — The print studio's `Rail` inside `RailFrame`: number beside the label when wide, number only when narrow; Gallery as the frame's foot; the phone layout (steps across the top) unchanged. · files: `src/components/Rail.tsx`, `src/styles/03-shell.css` · test: checked in 590 (AC-6 e2e)
- [ ] **T033** — Failing test: every rail item of the photo, Reel and YouTube modes has a `group` (`add` / `edit`) and a `lead`; Add and Edit hold the tools the panel map lists (DESIGN.md §2); at most 6 non-`minor` items per mode. · files: `tests/unit/components/studio/railGroups.test.ts` · test: `tests/unit/components/studio/railGroups.test.ts` (fails first)
- [ ] **T034** — The media rail in `RailFrame` with the print rail's look (button height, type, active bar and soft fill) and its icons; Add / Edit headings when wide (a divider when narrow); `minor` tools go into a **More** menu below 720 px of height (CSS only). `railGroups.test.ts` passes. · files: `src/components/studio/Shell.tsx`, `src/components/studio/VideoWorkspace.tsx`, `src/components/studio/PhotoWorkspace.tsx`, `src/styles/36-media-studio.css` · test: `tests/unit/components/studio/railGroups.test.ts`

## Design document

§1, §2. The maintainer's review (T043) comes before 502–506 are planned.

- [ ] **T040** — `docs/DESIGN.md`: the layout (top bar, rail, panel, stage, inspector, dock) and its widths at phone, 1280, 1440, ≥ 1920 with the rail wide and narrow; the type scale (role, size, line height, weight, font), spacing scale and colour tokens in both themes with their contrast; the shared parts and when to use each; the rail (groups, More, expanded by default). Linked from `docs/` index and the README's docs list. · files: `docs/DESIGN.md` · test: reviewed in T043
- [ ] **T041** — The panel map in `DESIGN.md`: every rail tool and inspector section of the three modes today and every planned panel (210 markers, in/out, compound clips; 301–304 colour; 303 scopes; 305 captions; 309), each placed left / right / dock by the rule, in the Add or Edit group, with which are `minor`. · files: `docs/DESIGN.md` · test: reviewed in T043; `railGroups.test.ts` matches today's part
- [ ] **T042** — After screenshots matching T001's set in `docs/screenshots/design/after/`, with the rail wide and narrow; a before/after table in `DESIGN.md`. · files: `docs/screenshots/design/after/*.webp`, `docs/DESIGN.md` · test: reviewed in T043
- [ ] **T043** 👤 — The maintainer reviews `DESIGN.md` (layout, scales, panel map) and the before/after screenshots and approves them, or lists changes (done before 502–506 are planned). · test: the maintainer's approval, dated in the result note

## Close

- [ ] **T090** — `specs/lld.md` (module map: `components/panel/`, `42-panel.css`) and `specs/architecture.md` (styling rule: tokens in `01-base.css`, shared panel parts); `docs/MEDIA-STUDIO.md` mentions the rail toggle and Ctrl + \. · files: `specs/lld.md`, `specs/architecture.md`, `docs/MEDIA-STUDIO.md` · test: link check in the result note
- [ ] **T091** — Close: `npm run check`, `npm run build` (entry ≤ 350 KB, no growth expected), `npm run lint:full`, `npm run check:licenses`; tick the ACs the unit tests and T043 prove (AC-5 and AC-6's e2e stay in 590); status Implemented; `memory/progress.md`, `memory/MEMORY.md`. · test: `npm run build`

## AC coverage

| AC | Tasks |
| --- | --- |
| AC-1 | T040, T042, T043, T091 |
| AC-2 | T033, T034, T041, T043, T091 |
| AC-3 | T020, T021, T022, T023, T024, T025, T091 |
| AC-4 | T010, T011, T012, T013, T091 |
| AC-5 | T013 |
| AC-6 | T030, T031, T032, T034, T091 |
