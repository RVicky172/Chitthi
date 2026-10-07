# 401 — AI models on this device: see and delete downloaded models · Implementation Plan

**Spec:** `./spec.md` · **Status:** Approved (2026-10-07, with the spec: no open decisions) <!-- Draft | Approved -->

## Approach

**§1 The model's state and its deletion (`src/ai/segment/`).** `models.ts` gets a pure `modelRow(state)` that
gives a row's status text and whether it can be deleted (unit-tested, AC-1, AC-5). `index.ts` gets
`modelState(target)` (`'bundled' | 'stored' | 'session' | 'none'`: bundled, a full-size file in OPFS `models/`, only
in memory, or absent) and `deleteModel(target)`, which replaces the unused `forgetModel`. It returns null, or why it
refused: a bundled model, or a search running (a `busy` count around `run()`, which covers the download too: AC-4).
Otherwise it drops the in-memory copy, removes `models/<id>.onnx` from OPFS and, if the worker holds the model
(`sent`), ends the worker (Q2); the next search starts a new one.

**§2 The Settings section (`components/ai/AiSettings.tsx`).** A `<details>` **AI models on this device**, like
"Keys and services": one row per model in `SEG_MODELS` with its title, size (`sizeText`), status from `modelRow`, and
for a deletable model a **Delete** button named "Delete the sky model". `ai/segment` is loaded with `import()` when the
section opens, so neither the entry chunk nor Settings' first paint carries it. A polite `role="status"` line reports
"The sky model was deleted: 176 MB freed." or the refusal.

**§3 Proof.** Unit (`segment.test.ts`): `modelRow` for every state; `modelState` / `deleteModel` with stubbed OPFS,
`fetch`, `Worker` and canvas (vitest runs in Node): stored → deleted → none; refused while a search runs; the worker
ended when it held the model. e2e (`instagram.e2e.ts`, desktop project): a 176 MB file of the right size is put into
OPFS (a sparse file through `truncate`, no download), Settings shows "On this device", Delete frees it, the row says
"Not downloaded" after a reload too, a `localStorage` value and the photo studio's state are untouched, and the next
sky mask shows the download prompt again; axe and 360 px.

## Files

| File | Change | Purpose |
| --- | --- | --- |
| `src/ai/segment/models.ts` | modify | `ModelState`, `modelRow()` |
| `src/ai/segment/index.ts` | modify | `modelState()`, `deleteModel()` (replaces `forgetModel`), `busy` count |
| `src/ai/segment/segment.test.ts` | modify | unit tests §3 |
| `src/components/ai/AiSettings.tsx` | modify | the section (§2) |
| `e2e/instagram.e2e.ts` | modify | AC-1–AC-3, AC-6 |
| `docs/AI.md`, `src/data/docs.ts`, `CHANGELOG.md` | modify | AC-7 |

## Data Structures & Interfaces

```ts
// models.ts
export type ModelState = 'bundled' | 'stored' | 'session' | 'none';
export function modelRow(state: ModelState): { status: string; canDelete: boolean };
// index.ts
export async function modelState(target: AiTarget): Promise<ModelState>;
export async function deleteModel(target: AiTarget): Promise<string | null>; // null = deleted
```

## Test Approach

| AC | Test | Type |
| --- | --- | --- |
| AC-1 | `modelRow` table; e2e rows and states | unit + e2e |
| AC-2 | unit stored → none; e2e Delete, message, reload, other data kept | unit + e2e |
| AC-3 | e2e: the sky mask asks to download again after a delete (the download itself is P1.8's, unchanged) | e2e |
| AC-4 | unit: refused while a search runs | unit |
| AC-5 | `modelRow('session')`; unit: no OPFS + memory → deletable | unit |
| AC-6 | e2e button names, axe, 360 px | e2e |
| AC-7 | docs reviewed | manual |

## Risks & Mitigations

- **A 176 MB fixture in e2e.** → `createWritable()` + `truncate(bytes)` makes a sparse file without writing data;
  `storedFile` checks only the size.
- **Ending the worker mid-search.** → Delete is refused while any search runs (AC-4), so the worker is idle.

## Constitution Check

| Principle | Status | Notes |
| --- | --- | --- |
| I. Spec before code | ✅ | Approved 2026-10-07 |
| II. Test-gated delivery | ✅ | Unit first, then e2e |
| III. Small dependencies | ✅ | None |
| IV. Memory maintained | ✅ | progress / MEMORY at the end |
| V. Free and open source | ✅ | Same on web and desktop |
| VI. On device, no backend | ✅ | Only local files |
| VII. Permissive licences | ✅ | Nothing new |
| VIII. WYSIWYG, one code path | ✅ | Not about rendering |
| IX. Secure desktop shell | ✅ | No IPC; OPFS works the same in Electron |
| X. Budgets and accessibility | ✅ | Lazy `import()`; named buttons, status region, axe, 360 px |
| XI. Agents use the same code | ⚠️ | No agent tool (Q3), recorded |
