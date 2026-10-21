<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 506 — Layers panel: no overflow or cut-off items · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (D1–D3 A; 2026-10-21, D-071) <!-- Draft | Approved -->

## Approach

Today (after 501–505) the Layers tool's panel already shows only the list (`LayerList` in `ig/LayerPanel.tsx`) and the inspector shows the selected layer's properties in folding sections (`LayerProps` → `LayerProperties`, 503) in the photo, Reel and YouTube modes. What overflows is the row: `.lp-list li` (35-instagram.css) is a flex row of a name button and four 26 px buttons with no thumbnail, the name is cut to 24 characters by `layerName` (so the full name is never shown or announced), the video's start–end times sit inside the name, and there is no dragging and no Alt + ↑/↓. 506 rebuilds the row on 501's `ListRow` and adds reordering by dragging and keys.

**§1 The row (AC-1, AC-4).** `LayerList` moves to its own file, `ig/LayerList.tsx`, and draws each layer, front first, as a `ListRow`: lead = `LayerThumb` (D1), name = the layer's full name, detail = its times on a video ("0:02–0:05") and "Hidden" when hidden, controls = Show / Hide (a new `EyeIcon` in place of ●/○), Bring forward, Send back, Delete. `ListRow`'s contract does the fitting: the main button is `flex: 1; min-width: 0`, the name and detail shorten with an ellipsis, the controls are `flex: none` and never wrap; the full name is the button's accessible name and tooltip. The old `.lp-list li`, `.lp-name` and `.lp-list .pbtn` rules go; `.lp-list` keeps only the list's gap and `min-width: 0`. The forward / back buttons stay: they are the single-pointer way to reorder that WCAG 2.2's 2.5.7 (Dragging Movements) asks for. No lock control: none exists today (D2).

**§2 Full names (AC-1, AC-4).** `layerName` (engine/layers.ts) stops cutting text: it keeps the first line whole ("Text: <first line>", "<Shape>: <first line>", "Image: <file name>"); every place that shows it (the list, the inspector's name line, the timeline's layer bars, the timeline's live region) shortens with CSS or reads it out, so nothing widens. `layers.test.ts`'s name cases are updated.

**§3 Reordering (AC-4).** One pure move, `moveLayer(layers, id, to)` in engine/layers.ts (to = the stack index, 0 = back), and one store action each, `moveLayerTo(itemId, id, to)` (state/instagramLayers.ts) and `moveVLayerTo(id, to)` (state/videoLayers.ts), each one undo step; `LayerPanelProps` gains `onMove`. The list's own rules live in a pure module, `ig/layerListMoves.ts`: `layerListKey(event)` → forward / back / previous / next / none (Alt + ↑ forward, Alt + ↓ back, ↑ / ↓ move focus between rows as the Projects list does; Ctrl / Meta / Shift combinations and typing are left alone), `stackIndex(row, count)` (the list is front first, the stack back first), and `dropRow(y, rowEdges)` (where a dragged row lands). Keys are handled on the `<ol>` (rows carry `data-id`, as in the media pool) and focus stays on the moved row (refocused by id after the move). Dragging (D3) uses pointer events on the list, as the photo strip does: past a 4 px move a press becomes a drag, a line marks where the row will land, and release calls `onMove` once; a press without a move is a click and selects. Esc cancels a drag.

**§4 The list only (AC-3).** The all-in-one `LayerPanel` component (adding, list and properties in one column) is no longer used by either workspace and goes; `LayerPanel.tsx` keeps `AddText`, `AddElements`, `LayerProps`, `DrawPanel` and the shared `LayerPanelProps`. Both workspaces' Layers tool renders `LayerList` (the photo's with Copy these layers to every photo under it) and their inspector renders `LayerProps` for a selected layer; a source test holds this so a later change can't put properties back in the panel.

**§5 Agent tools.** None: there are no layer tools today; moving a layer joins the video editor's agent tools feature (D-069 D5).

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/components/ig/LayerList.tsx` | new | The list: a `ListRow` per layer, `LayerThumb`, keys, dragging (§1, §3) |
| `src/components/ig/layerListMoves.ts` | new | `layerListKey`, `stackIndex`, `dropRow` (§3) |
| `src/components/ig/LayerPanel.tsx` | modify | `LayerList` moves out; the all-in-one `LayerPanel` goes; `onMove` on `LayerPanelProps` (§3, §4) |
| `src/engine/layers.ts` | modify | `moveLayer`; `layerName` keeps the whole first line (§2, §3) |
| `src/state/instagramLayers.ts`, `src/state/videoLayers.ts` | modify | `moveLayerTo`, `moveVLayerTo` (§3) |
| `src/components/studio/PhotoWorkspace.tsx`, `src/components/studio/VideoWorkspace.tsx` | modify | Import `LayerList` from its file; pass `onMove` (§3, §4) |
| `src/components/icons.tsx` | modify | `EyeIcon` for Show / Hide (§1) |
| `src/styles/35-instagram.css`, `src/styles/42-panel.css` | modify | Old row rules out; the thumbnail, drop line and dragged row (§1, §3) |
| `tests/unit/components/ig/{layerList,layerStructure,layerListMoves}.test.ts`, `tests/unit/engine/layers.test.ts`, `tests/integration/state/layerMoves.test.ts` | new / modify | AC-1, AC-3, AC-4 |
| `docs/MEDIA-STUDIO.md`, `docs/DESIGN.md`, `specs/lld.md`, `CHANGELOG.md` | modify | The Layers list, reordering by dragging and Alt + ↑/↓; `ListRow` used by Layers; `LayerList.tsx` |

## Data Structures & Interfaces

```ts
// engine/layers.ts
export function moveLayer(layers: Layer[], id: string, to: number): Layer[]; // same array when nothing moves
export function layerName(layer: Layer): string;                         // now the whole first line

// state/instagramLayers.ts, state/videoLayers.ts
export function moveLayerTo(itemId: string, layerId: string, to: number): void; // one undo step
export function moveVLayerTo(id: string, to: number): void;

// components/ig/LayerPanel.tsx
export interface LayerPanelProps { /* … */ onMove: (id: string, to: number) => void }

// components/ig/layerListMoves.ts (new, pure)
export type LayerListKey = 'forward' | 'back' | 'previous' | 'next' | null;
export function layerListKey(event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): LayerListKey;
export const stackIndex = (row: number, count: number): number => count - 1 - row;
/** The row a dragged row lands on, from the pointer's y and the rows' top edges (and the last row's bottom). */
export function dropRow(y: number, rowEdges: readonly number[]): number;
export const DRAG_START_PX = 4;

// components/ig/LayerList.tsx (new)
export function LayerList(props: Readonly<LayerListProps>): JSX.Element; // ListRow per layer, keys, drag
function LayerThumb({ layer }: Readonly<{ layer: Layer }>): JSX.Element;  // D1

// components/icons.tsx
export function EyeIcon({ open }: Readonly<{ open: boolean }>): JSX.Element;
```

Saved projects: unchanged (no new fields; a move only reorders `layers`).

## Techniques

- **One row part:** the row is `ListRow` (501), whose class contract already fits any name; 506 removes the Layers list's own row CSS rather than patching it.
- **CSS shortens, data doesn't:** names are whole in the data and shortened only on screen, so the tooltip and the accessible name are the full name.
- **Pure rules, thin component:** keys, index conversion and the drop position are pure functions tested in Node; the component wires pointer and key events to them.
- **Pointer events with a threshold** (as `PhotoStrip`): works with mouse, pen and touch; a press under 4 px stays a click. Pointer capture keeps the drag when the pointer leaves the list.
- **Every drag has a click and a key:** forward / back buttons and Alt + ↑/↓ do what dragging does (WCAG 2.5.7, 2.1.1).

## Test Approach

| AC | Test | Kind |
| --- | --- | --- |
| AC-1 | `tests/unit/components/ig/layerList.test.ts`: `renderToStaticMarkup` of `LayerList` with 40 layers with 80-character names (photo and video props): each row is `li.list-row` with `button.list-row-main` (lead, name) and `span.list-row-controls` holding the four controls, in that order; a CSS check that `.list-row-main` has `flex: 1` and `min-width: 0`, `.list-row-name` has `white-space: nowrap` and `text-overflow: ellipsis`, `.list-row-controls` is `flex: none` with no `flex-wrap`, and the old `.lp-list li` / `.lp-name` rules are gone | unit |
| AC-2 | 40 layers with 80-character names at 1280 × 720, 1440 × 900 and 390 × 844: no element wider than the panel, every control clickable | e2e (590, already listed there) |
| AC-3 | `tests/unit/components/ig/layerStructure.test.ts` (source scan): `LayerList.tsx` doesn't import `LayerProperties`; `LayerPanel` (all-in-one) isn't exported; in `PhotoWorkspace.tsx` and `VideoWorkspace.tsx` the Layers tool renders `LayerList` / `LayersPanel` and the inspector's `layer` kind renders `LayerProps`; `foldCoverage.test.ts` already holds `LayerProperties`' folding sections | unit |
| AC-4 | `tests/unit/components/ig/layerListMoves.test.ts`: `layerListKey` (Alt + ↑/↓, ↑/↓, Ctrl / Meta / Shift ignored), `stackIndex`, `dropRow` (above the first row, between rows, below the last); `tests/unit/engine/layers.test.ts`: `moveLayer` to the front, the back, the same place, an unknown id, out of range; `layerName` keeps an 80-character first line whole; `tests/integration/state/layerMoves.test.ts`: `moveLayerTo` / `moveVLayerTo` are one undo step and keep the selection; `layerList.test.ts`: each row's main button's `aria-label` and `title` are the full name, rows carry `data-id`. Dragging with a mouse and with touch is checked in 590 | unit |

## Risks & Mitigations

- **A drag swallows clicks, or a click starts a drag.** Mitigation: a press becomes a drag only past 4 px (`DRAG_START_PX`, as the photo strip); `dropRow` and the threshold are unit-tested; 590 checks it by hand with a mouse and touch.
- **Dragging on a phone stops the list scrolling.** Mitigation: D3 A, touch drags only from the thumbnail; the rest of the row keeps `touch-action` as is.
- **Focus is lost after Alt + ↑/↓** (the row moves in the DOM). Mitigation: rows are keyed by layer id so React moves the node; the list refocuses the row by `data-id` after the move anyway.
- **Whole names widen other places** (the timeline's layer bars, the inspector's name line, live-region announcements). Mitigation: each is checked while building §2 and shortened with CSS where it isn't yet; announcements reading a full name is wanted (AC-4).
- **Alt + ↑/↓ clashes with a shortcut** (the timeline's keys, the desktop app's Alt menu key). Mitigation: handled only on the list's rows and `preventDefault`ed there; the timeline's Alt keys act on its own focus.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec Before Code | ✅ | Spec Approved 2026-10-20; plan Approved 2026-10-21 (D-071). |
| II. Test-Gated Delivery | ✅ | AC-1, AC-3, AC-4 unit tests, test-first; AC-2 and dragging by hand deferred to 590 (already listed there). |
| III. Simplicity and Small Dependencies | ✅ | No new dependency; reuses `ListRow` and the photo strip's pointer pattern. |
| IV. Memory Is Maintained | ✅ | D1–D3 recorded as D-071. |
| V. Free and Open Source | ✅ | Same on web and desktop. |
| VI. On the User's Device | ✅ | No network. |
| VII. Permissive Licences Only | ✅ | Nothing new; `EyeIcon` drawn in-house. |
| VIII. What You See Is What You Get | ✅ | No preview or export path changes; a move only reorders `layers`, drawn by the same `drawLayers`. |
| IX. Secure Desktop Shell | ✅ | No `electron/` changes. |
| X. Budgets and Accessibility | ✅ | In the studio's lazy chunk; rows keyboard-reachable, full names announced, a click and a key for every drag (WCAG 2.5.7); fit checked in 590. |
| XI. Agents Use the Same Code | ⚠️ | No layer agent tools yet; moving a layer joins the video editor's agent tools feature (D-069 D5). |

## Decisions for the maintainer

_Chosen (the maintainer, 2026-10-21): A for all three (D-071)._

**D1 The row's thumbnail.** **A (recommended)** a picture of the kind, drawn without rendering the frame: a sticker's emoji, an image layer's picture, a shape's outline (the Elements panel's `ShapeIcon`), "Aa" in a text layer's font and colour, a brush for a drawing; cheap for 40 rows and legible at 32 px. **B** the layer itself drawn small (`drawLayers` into a 32 px canvas per row, redrawn on each change): truer, but text is unreadable at that size and 40 canvases redraw while dragging a slider.

**D2 A lock control.** The spec's summary names "lock" among the row's controls, but layers have no lock today and no criterion asks for one. **A (recommended)** no lock in 506 (four controls: show / hide, forward, back, delete); a lock, if wanted, is a feature of its own (the stage would have to skip locked layers). **B** add a lock now (a `locked` field through the gate, the stage's pointer skips it, a fifth control).

**D3 How a row is dragged.** **A (recommended)** pointer events: a mouse or pen drags from anywhere on the row; a finger drags from the thumbnail only (`touch-action: none` there), so swiping over the names still scrolls the list on a phone. **B** HTML drag and drop (`draggable`, as the media pool): less code, but no touch dragging on most phones (the buttons and keys would be the only way there).
