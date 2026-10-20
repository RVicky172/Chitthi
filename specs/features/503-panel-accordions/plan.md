<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 503 — Folding panel sections: one open at a time · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (D1–D4 A; 2026-10-20, D-068) <!-- Draft | Approved -->

## Approach

503 changes how sections fold, never what they contain (Out of Scope). Today the print studio's steps use 501's `FoldSection` (`components/panel/FoldSection.tsx`), where each section folds on its own and remembers itself under `chitthi-sections`; the media studio's panels and inspectors are plain `<div className="ig-group"><h3>…</h3>` blocks, all open.

**§1 One open per group: pure logic (AC-1).** A new `components/panel/foldGroups.ts`, framework-free like `railWidth.ts`: a group's state is the id of its open section or `null`. `toggleFold(open, id, allowNone)` opens `id` (closing the rest) or, when `id` is already open, closes it if the group allows none. `resolveFold(saved, present, fallback)` gives the section to show: the saved one if it is on screen, else the group's default (its first section unless the panel names one), or `null` when `null` was saved in a group that allows none. Tested without React.

**§2 Remembered per panel and mode (AC-2).** A small store in the same folder (`useSyncExternalStore`, like the rail width) keeps `{ [group]: sectionId | null }` in `localStorage` under a new key `chitthi-folds`, per viewer; storage blocked = it still works, just not remembered. The old per-section key `chitthi-sections` means nothing under one-open and is removed on the first write. Nothing goes into designs or projects, so every saved project opens unchanged.

**§3 `FoldGroup` and `FoldSection`.** `FoldGroup` (new, replacing `FoldScope`) gives its sections a group id, `allowNone` and an optional default. `FoldSection` keeps its props (`id`, `title`, `note`) and gains: `actions` (controls drawn beside the title button, not in it: the keyframe arrows in `kf-head` titles today, since a button cannot hold a button) and `openWhen` (a boolean: when it turns true the section opens itself, AC-2). Its title stays `<h3><button aria-expanded aria-controls>` (AC-4); `note` is the one-line summary in the title row (e.g. "Music · 2 tracks"), shown open or closed. A `FoldSection` outside any group is a group of one that allows none, so dialogs keep working. `revealSection` (the feature finder) opens a section through the store; section ids stay unique across the app.

**§4 Group ids.** The shell wraps its panel slot in `FoldGroup id={`${mode}:${tool}`}` and the inspector slot in `${mode}:inspector:${kind}` (clip, layer, sound, transition, project), so each panel and each kind of inspector remembers its own section, per mode (photo, reel, vlog). The print studio's `Pane` wraps its step in `print:${title}`.

**§5 The panels (AC-3).** Each titled `ig-group` with an `<h3>` becomes a `FoldSection`. Panels (and the clip / layer / sound inspectors) with one section keep it plain. Per panel, as built in the tasks: Media (D1 lead + its groups), Text / Elements / Draw / Layers (`ig/LayerPanel.tsx`: Image, Shapes, Stickers, Brush; the layer properties), Transitions (Cut, the chosen transition), Audio (Record voice, Sound tracks with each track's settings inside, Loudness; Add sound per D1), the photo editor (Light, Colour, Detail, Effects, Presets and LUTs, Tone curve, Colour mixer), Masks (`ig/MaskPanel.tsx`, D3), the clip inspector (the clip, Speed, Position and size, Frame, Colour), the sound inspector, the layer inspector. Contextual cases open themselves with `openWhen`: Record voice when `openRecordVoice()` asks for it (Shift + R, a Voice track's record button, the recovery bar), the selected mask's section when a mask is chosen, the transition's section when a cut is clicked.

**§6 The print studio (Q1).** Its steps already use `FoldSection`; they become one group per step with `allowNone` (D2). `Pane` keeps **Collapse all** (sets the group to `null`) and drops **Expand all**. The feature finder still opens the section it names.

**§7 Keyboard (AC-4).** The title is a native `<button type="button">`, so Enter and Space toggle it and Tab reaches the titles in document order with the existing focus ring; a closed section's body is `hidden`, so Tab skips its fields. No arrow-key roving (the ARIA accordion pattern makes it optional).

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/components/panel/foldGroups.ts` | new | Open-state rules and storage (§1, §2) |
| `src/components/panel/FoldSection.tsx`, `src/components/panel/index.ts` | modify | `FoldGroup` (replaces `FoldScope`), `actions`, `openWhen`, one open per group, `revealSection` through the store (§3) |
| `src/components/studio/Shell.tsx` | modify | Panel and inspector slots wrapped in their `FoldGroup` (§4) |
| `src/components/common.tsx` | modify | `Pane`: `FoldGroup`, Collapse all only (§6) |
| `src/components/studio/{AudioPanel,VideoPanels,PhotoPanels,PhotoEditPanel,TransitionPanel,ClipInspector,SoundInspector,SpeedGroup}.tsx`, `src/components/ig/{LayerPanel,LayerProperties,MaskPanel}.tsx` | modify | Titled `ig-group`s → `FoldSection`; `openWhen` for Record voice, the selected mask, a clicked cut (§5) |
| `src/styles/42-panel.css` | modify | `.sec` in the media studio's panels and inspector; `actions` beside the title |
| `tests/unit/components/panel/{foldGroups,foldCoverage,foldMarkup}.test.ts` | new | AC-1, AC-2, AC-3, AC-4 |
| `docs/DESIGN.md`, `docs/MEDIA-STUDIO.md`, `CHANGELOG.md` | modify | The folding rule and the panel map; what users see |

## Data Structures & Interfaces

```ts
// components/panel/foldGroups.ts (pure)
/** A group's open section, or null for none. */
export type FoldOpen = string | null;
export function toggleFold(open: FoldOpen, id: string, allowNone: boolean): FoldOpen;
export function resolveFold(saved: FoldOpen | undefined, present: readonly string[], fallback: FoldOpen): FoldOpen;
export const FOLDS_KEY = 'chitthi-folds';
export function readFolds(storage?: FoldStorage): Record<string, FoldOpen>;
export function saveFold(group: string, open: FoldOpen, storage?: FoldStorage): void;

// components/panel/FoldSection.tsx
interface FoldGroupProps { id: string; allowNone?: boolean; defaultOpen?: string; children: ReactNode }
interface FoldSectionProps {
  id: string; title: ReactNode;
  note?: ReactNode;      // one-line summary in the title row
  actions?: ReactNode;   // beside the title button (keyframe arrows)
  openWhen?: boolean;    // opens the section when it turns true
  children: ReactNode;
}
export function foldAll(group: string, open: false): void; // Collapse all
export function revealSection(id: string): void;            // unchanged signature
```

Stored (per viewer, `localStorage`): `chitthi-folds` = `{ "reel:audio": "audio-record", "photos:edit": "edit-light", "print:Photos": null }`.

## Techniques

- **Pure logic, thin component:** the open-state rules live in `foldGroups.ts` (tested in node); the component only reads the store and renders, as `railWidth.ts` does for the rail.
- **Rendering checked without a DOM:** the unit tests run in node (no jsdom); AC-4's markup is checked with `react-dom/server`'s `renderToStaticMarkup` from a `.ts` test using `createElement`, already a dependency. No new library.
- **Coverage as a source scan:** like 501's `sharedParts.test.ts`, the coverage test reads `src/components/{studio,ig,panes}` and fails on a panel heading (`<h3`) that is not a `FoldSection`, with a short exception list (export dialogs) each with a reason.
- **Rising edge for `openWhen`:** the section opens when the value goes from false to true, not while it stays true, so the user can still close it.

## Test Approach

| AC | Test | Kind |
| --- | --- | --- |
| AC-1 | `tests/unit/components/panel/foldGroups.test.ts`: opening closes the others, toggling the open one with and without `allowNone`, the default section | unit |
| AC-2 | `foldGroups.test.ts`: saved per group, restored, a saved section no longer on screen falls back, blocked storage still toggles, the old key removed; `openWhen` rising edge | unit |
| AC-3 | `tests/unit/components/panel/foldCoverage.test.ts`: no panel component in `studio/`, `ig/`, `panes/` keeps an `<h3>` section of its own (exceptions listed with reasons and still needed); `Pane` has no Expand all; proven to fail by putting an `ig-group` `<h3>` back | unit |
| AC-4 | `tests/unit/components/panel/foldMarkup.test.ts`: `renderToStaticMarkup` of a group of three: each title is a `<button type="button">` with `aria-expanded` and an `aria-controls` naming its body, one body not `hidden`, titles in order, `actions` outside the button | unit |
| AC-5 | At 1280 × 720 each media panel with its default section open has no panel scroll (lists scroll inside) | e2e (590) |

## Risks & Mitigations

- **Photo editing gets slower when Light and Colour are both used** (one open at a time, Q2). Mitigation: the last section is remembered; the titles are one click; revisited after 590's manual check, as Q2 says.
- **A control reached from elsewhere is hidden in a closed section** (Shift + R, the recovery bar, the feature finder, a clicked cut, agent tools that expect a field). Mitigation: `openWhen` and `revealSection` open it; the agent tools change data through `src/agent/tools.ts`, not the panels, so they are unaffected.
- **Fields in a closed section are unmounted or hidden, losing local state** (a half-typed number, the open recorder). Mitigation: bodies are `hidden`, not unmounted, as `FoldSection` does today; the recorder closes the microphone when its section closes, as it does when the panel closes (209 AC-7).
- **The print studio loses sections users kept open.** Mitigation: Q1 accepted; the first open step section is the remembered one or the first; Collapse all stays.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec Approved 2026-10-20; this plan waits for D1–D4. |
| II. Test-Gated Delivery | ✅ | AC-1–AC-4 unit tests, test-first; AC-5 deferred to 590. |
| III. Simplicity and Small Dependencies | ✅ | No new dependency; `react-dom/server` is part of `react-dom`. |
| IV. Memory Is Maintained | ✅ | Decisions D1–D4 into `memory/decisions.md` when chosen. |
| V. Free and Open Source | ✅ | Same in web and desktop. |
| VI. On the User's Device | ✅ | No network; state in `localStorage`. |
| VII. Permissive Licences Only | ✅ | Nothing new. |
| VIII. What You See Is What You Get | ✅ | No preview or export code changes; no design data changes. |
| IX. Secure Desktop Shell | ✅ | No `electron/` changes. |
| X. Budgets and Accessibility | ✅ | Native buttons with `aria-expanded` / `aria-controls`; panel code is lazy, entry chunk unchanged (checked at close). |
| XI. Agents Use the Same Code | ✅ | A viewing preference, not a feature: agent tools act on data, unaffected; no new tool. |

## Decisions for the maintainer

_Chosen (the maintainer, 2026-10-20): A for all four (D-068)._

**D1 A panel's untitled top.** Some panels start with an untitled group: Add sound (Audio), the media list and add button (Media), Add text / the layer list (Layers). **A (recommended)** it stays above the sections, always visible: it is the panel's main action or list. **B** it becomes a section of its own ("Add sound") and folds like the rest.

**D2 Can a group have none open?** **A (recommended)** yes, everywhere: clicking the open title closes it (the print studio's Collapse all needs this anyway), and "none" is remembered. **B** only in the print studio; in the media studio one section is always open.

**D3 Masks.** `MaskPanel` shows type settings only for the selected mask (Brush, Linear / Radial gradient, Colour / Brightness range, Found by AI). **A (recommended)** sections: Selected mask (with its type's settings inside, under a smaller title) and Found by AI; the selected mask's section opens itself when a mask is chosen. **B** every type group is its own section.

**D4 The inspector's first section.** The clip inspector's first group ("Clip 2 · video": name, missing-file note, timing, fade) holds warnings. **A (recommended)** the name and any warning stay above the sections, always visible; the timing and fade become a "Timing" section. **B** the whole group folds like the rest.
