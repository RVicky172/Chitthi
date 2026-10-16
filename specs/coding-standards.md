# Coding Standards

**Version:** 1.0.0 · **Adopted:** 2026-10-14 (feature 407, AC-4)

How code is written in Chitthi Studio. It applies to the shipped code (`src/`, `electron/`) and to all new code in
`scripts/` and `tools/` (their older code is cleaned up in 408). ESLint enforces what it can (`eslint.config.js`,
407 plan §4); the rest is checked in review. `npm run standards` counts the findings per folder and rule.

Each rule has a short **good** / **bad** example, taken from this codebase where possible.

---

## 1. Names

A name says **what the value holds**, not its type or a letter. Write words out.

- Allowed one-letter names: `_` for a value that is deliberately unused, and `x` / `y` for a point's coordinates.
  Nothing else: `index` not `i`, `clip` not `c`, `context` not `ctx`, `width` / `height` not `W` / `H`, `error` not
  `e`, `event` not `e` (Q3). The lint rule is `id-length`.
- No unclear abbreviations: `duration` not `dur`, `previous` not `prev`, `frame` not `f`. Well-known ones
  (`id`, `url`, `fps`, `rgb`, `pdf`) are fine.
- Booleans read as a question: `isPlaying`, `hasAudio`, `canUndo`.
- Functions say what they return or do: `valueAt`, `clampValue`, `endOf`; event handlers are `onX` / `handleX`.
- Constants that are tables or limits are `UPPER_SNAKE` (`CLIP_RANGES`, `KEY_LIMITS`).
- **Saved fields keep their names.** Persisted document fields (a keyframe's `t` / `v`, a box's `x` / `w`, a
  transition's `dur`) are part of the saved-project format: renaming them changes saved files. Keep them in the type,
  with a doc comment, and destructure them into descriptive names in code.

```ts
// Bad
const endOf = (c: TimedClip) => c.start + clipLength(c);
catch (e) { logError('handled', e); }

// Good
const endOf = (clip: TimedClip) => clip.start + clipLength(clip);
catch (error) { logError('handled', error); }

// A saved field keeps its short name; the code reading it doesn't
const { t: seconds, v: value } = keys[index];
```

## 2. JSDoc

Every exported function, class, React component, interface and type has a JSDoc comment (lint: `eslint-plugin-jsdoc`).

- First sentence: **what it is or does**, in plain words. Then anything a caller must know (units, ranges, what
  `null` means, side effects).
- `@param` for each parameter and `@returns` for any value, saying what they mean, not their type.
- `@throws` when it throws on purpose.
- **No types in JSDoc** (`{number}`): TypeScript has them. (Plain `.mjs` scripts are the exception: there JSDoc
  types are the types.)
- Interface fields that aren't obvious get a `/** … */` line each (units, ranges).

```ts
// Bad: says nothing the signature doesn't
/** Gets value. */
export function valueAt(keys: readonly Keyframe[], t: number): number

// Good
/**
 * The value of animated keys at a time: exact at a key, the first value before the first key and the last after the
 * last; between two keys, eased by the first one's ease.
 * @param keys the keys, sorted by time, at least one
 * @param seconds the time, from the start of the keys' clip or layer
 * @returns the value, in the property's own units
 */
export function valueAt(keys: readonly Keyframe[], seconds: number): number
```

## 3. SOLID, as it applies here

No class hierarchies for their own sake: most of this code is functions over plain data. SOLID here means (Q7):

- **S — one job per module.** A module does one thing and starts with a short header comment saying what it is for.
  When a file mixes jobs, split it by job (e.g. the video store becomes store core and history, clip edits, keyframe
  actions, transition actions, media and export). Import the new modules directly; no barrel files.
- **O — data-driven.** Products, sizes, layouts, themes, formats and kinds are table entries in `src/data/`. Adding
  one means adding an entry, not a new `if` branch in the renderer.
- **L — implementations honour their interface.** Where one interface has several implementations (frame sources, AI
  providers, file sinks), each does all of it, with the same meaning; callers never check which one they have.
- **I — small interfaces.** Props and options interfaces carry what that function or component needs, not one large
  shared object. Use `Pick<>` to take part of a bigger type.
- **D — layers depend downwards** (§9). Platform differences sit behind `platform/` and `lib/`, not in `if (desktop)`
  spread through the engine.

```ts
// Bad (illustrative): a new product is a new branch in drawing code
if (product === 'magnet') drawRoundedCorners(context, 3);

// Good: the product's data says it, the renderer reads it
drawCorners(context, PRODUCTS[product].cornerRadiusMm);
```

## 4. Sizes and complexity

Length is a proxy; what matters is one job per module, short functions and low complexity (Q4, Q12).

| Measure | Limit | Lint |
| --- | --- | --- |
| Function (`.ts`) | 80 lines (blank lines and comments not counted) | `max-lines-per-function`, error |
| React component (`.tsx`) | 250 lines | `max-lines-per-function`, error |
| Cognitive complexity | 15 per function | `sonarjs/cognitive-complexity`, error |
| File | over 800 lines asks for a review | `max-lines`, **warning** only |

A long file that is one cohesive job (one renderer) may stay long; a long file that mixes jobs is split. Data-only
files (`src/data/`) and tests are exempt from the size rules.

To bring complexity down: return early instead of nesting, give a condition a name (`const isPastEnd = …`), move a
branch's body into a named function, and replace `switch` chains over kinds with a lookup table (§3 O).

```ts
// Bad: nested
if (clip) { if (clip.track === track) { if (time >= clip.start) { … } } }

// Good: early returns
if (!clip || clip.track !== track) return null;
if (time < clip.start) return null;
…
```

## 5. React

The code follows the Rules of React that the React Compiler relies on (`eslint-plugin-react-hooks`
`recommended-latest`, AC-12):

- **Pure render.** Rendering computes from props and state; it doesn't change anything, read refs or call
  `Math.random()` / `Date.now()`.
- **No mutation** of props, state, or values a hook returned. Make a new object.
- **Effects only sync with things outside React**: a canvas, a decoder, a timer, a DOM listener, the store's
  subscription. Values derived from props or state are computed in render (or `useMemo` when measured slow), not
  copied into state by an effect. Responses to a click go in the click handler, not in an effect watching state.
- **Effect dependencies are complete.** If that would re-run it too often, the effect is doing too much or a value
  should be a ref.
- **Small components** (≤ 250 lines, §4) with a named `interface XProps`; a panel that grows is split into child
  components. Components are defined at the top level of a module, never inside another component.
- Read stores with their selector hooks; a selector returns stored values or primitives, never a new object or array
  each time (it re-renders forever: `memory/learnings.md`, 2026-10-13).

```tsx
// Bad: state copied from props by an effect (an extra render, and out of date for one frame)
const [label, setLabel] = useState('');
useEffect(() => setLabel(formatTime(clip.start)), [clip.start]);

// Good: derived in render
const label = formatTime(clip.start);
```

## 6. Types

Types do the checking, not casts (typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, AC-13).

- **Object shapes are named `interface`s** (`consistent-type-definitions: interface`), not inline object types in
  parameters. Use `type` for unions, mapped and utility types.
- **Narrow, don't cast.** Replace `as` with a type guard, `in` / `typeof` checks, a discriminated union or a better
  declared type. Replace `!` with a check that handles the missing case. A cast that has to stay carries a comment
  saying why it is safe; `as unknown as` needs a very good reason.
- **Indexed reads may be undefined** (`noUncheckedIndexedAccess`, on for `src/` by the end of 407): check the result
  of `array[index]` and `record[key]`, or use a loop that can't go out of range.
- **Utility types for real relations** (`Pick`, `Omit`, `Partial`, `Readonly`): when one type is derived from
  another, say so instead of copying fields.
- **`readonly`** on arrays and fields that aren't changed (undo snapshots, tables in `src/data/`).
- No `any`. External data enters through a validating gate (e.g. `mergeDesign()` for designs) that turns `unknown`
  into a typed value.

```ts
// Bad
const range = on === 'clip' ? CLIP_RANGES[prop as ClipKeyProp] : LAYER_RANGES[prop as LayerKeyProp];
const first = keys[0]!;

// Good
const isClipProp = (prop: string): prop is ClipKeyProp => prop in CLIP_RANGES;
const range = isClipProp(prop) ? CLIP_RANGES[prop] : LAYER_RANGES[prop];
const first = keys[0];
if (!first) return fallback;
```

## 7. Errors

- An error caught and shown to the user (a toast, a message) calls `logError('handled', error)` (`src/lib/errors.ts`),
  so it is in the error report the user can copy. Then say what happened in plain words and what to do.
- Don't swallow errors silently. A `catch` that deliberately ignores one says why in a comment.
- Throw `Error` objects with a message saying what was wrong and with which value; never throw strings.
- Validate at the edges (files, IPC, agent tool arguments, AI responses), then trust typed data inside.

```ts
// Bad
try { await storePhotos([photo]); } catch {}

// Good
try {
  await storePhotos([photo]);
} catch (error) {
  logError('handled', error);
  toast('That picture couldn’t be added. Try again.');
}
```

## 8. Performance

- **Measure before optimizing** and after (Q8): the timing checks (preview frame time, export speed, the decoder
  pool's timings, the print renderer per page). An optimization goes in only with at least a 10 % gain on its path and
  no loss elsewhere. Readability changes must not slow anything.
- **No allocation per frame** on the drawing and decoding paths (`renderFrame`, the frame stack, the decoder pool,
  the sound mix): no new arrays, objects or closures in a per-frame loop; reuse buffers, canvases and scratch objects.
- `for` loops are fine (and preferred) on hot paths; `map` / `filter` chains are fine elsewhere.
- **Indexed reads in per-pixel and per-sample loops** (407 T072, D-047): guards cost there. On arrays of objects,
  check with `=== undefined` (not `?.` / `??` / truthiness). On typed arrays, `?? 0` is the default; only where it
  measures slower may the reads use `!`, inside an `eslint-disable` block that says why the indices are in range and
  gives the numbers (the blur passes in `engine/detail.ts`).
- Large or optional code loads with `import()` (AI providers, the video encoder, screens); the entry chunk budget is
  350 KB (`npm run build`).
- Close what you open: `VideoFrame.close()`, decoders, object URLs, listeners.

## 9. Layers and imports

The code depends downwards only (lint: `no-restricted-imports` per folder):

```
data  →  engine  →  state  →  components
```

- `src/data/` imports nothing of the app.
- `src/engine/` never imports `state/` or `components/` (no React, no stores).
- `src/state/` never imports `components/`.
- `lib/` and `platform/` hold helpers and platform differences. A `lib/` module the engine uses must not import
  `state/` or `components/`.
- Import a module directly (`./keyframes`), no barrel `index.ts` files. Tests import the app through `@/`
  (`@/engine/keyframes`).
- App code never imports `tests/` (`scripts/check-structure.mjs`; only `main.tsx`'s development self-test may).

## 10. Comments

- A module starts with a short header: what it is for, and the feature or decision that set it up (`205`, `D-017`).
- Comments say **why**, or what isn't visible: units, ranges, an edge case, a browser quirk, a link to a learning or
  decision. They don't repeat the code.
- No commented-out code, and no `TODO` without a feature or task number.
- Keep comments true: change them with the code.

```ts
// Bad
// increment index
index += 1;

// Good
// The last key at or before the time: keys[low].t <= time < keys[high].t.
```

## 11. Tests

- **Where** (407, Q1): `tests/unit/` mirrors `src/` (one module: `tests/unit/engine/keyframes.test.ts`);
  `tests/integration/` drives several modules together (the stores, the decoder pool with its fake decoder, the
  preview sound); `tests/e2e/` holds the Playwright tests; `tests/support/` the shared fixtures and fakes
  (`timeline.testkit.ts`, `fakeDecoder.ts`); `tests/selftest/` the in-app self-test. Never a test under `src/`.
- **Naming:** a file is named after the module it tests (`keyframes.test.ts`). `describe` names the unit; each `it`
  reads as a sentence about one behaviour (`it('holds the first value before the first key and the last after the
  last')`).
- **One behaviour per `it`**, with its own fixture; no test depends on another's order or state.
- Share fakes through `tests/support/`, don't copy them between files.
- A test for a bug fails without the fix (check by breaking the code once).
- Which suite runs when: `specs/testing-strategy.md` and the constitution's Definition of Done.
