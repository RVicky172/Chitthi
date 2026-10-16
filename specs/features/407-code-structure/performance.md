# 407 — Performance review (T072, AC-10)

Measured 2026-10-16 on the maintainer's Windows machine, in the Electron renderer (`npm test`'s dev-server page).
Baseline: `main` at `3d08be7` (before 407), in a `git worktree` with a junction to `node_modules`.

## How it was measured

- **`CHITTHI_TEST_ONLY=perf npm test`** (`tests/selftest/perfTiming.ts`): microbenchmarks of the hot paths of plan §7,
  self-contained so the same file runs in a worktree of `main`. One warm-up round, then 7 rounds; the median round.
  Run on the branch and on `main` back to back.
- **Interleaved A/B** (temporary, removed after): `main`'s `src/` copied into the repo and both versions imported into
  one page, rounds alternating old / new, 11 rounds, medians. Back-to-back runs swing ±15 % here; the interleaved
  numbers are the ones decisions rest on.
- The existing timing checks (export timing, the pool's playback and seek timings, `measure:gate`) are run with the
  rest of 407's Definition of Done (T091), against `baseline.md`.

## Results

Back to back, branch after T072 against `main` (median per call):

| Path | `main` | 407 | |
| --- | --- | --- | --- |
| `frameStack`, 50 clips on 2 tracks | 0.0007 ms | 0.0005 ms | same (timer resolution) |
| `renderStack` 1920 × 1080, 30 frames (10 in transitions, `drawPair`) | 23.2 ms | 23.6 ms | same |
| `gainCurve`, 10 s window, 8 keys | 0.104 ms | 0.114 ms (spread 0.094–0.144) | same in the A/B below |
| Export with sound (6 × 4 s clips, 5 dissolves, volume keys, 640 × 360; `mixWindow`, the decoder pool) | 1.93 s | 1.93 s | same |
| `adjustPixels` 1080 × 1350, light + white balance + basic | 104.2 ms | 105.1 ms | same |
| `adjustPixels`, the same with a look | 104.9 ms | 128.2 ms | see "The look path" |
| `detailPixels` 1080 × 1350, clarity + sharpen + dehaze + noise | 789.7 ms | 775.3 ms | same |
| `renderCard` postcard / calendar / magnet, front + back at 300 dpi, per page | 6.3 / 27.3 / 2.8 ms | 6.6 / 28.5 / 3.0 ms | same |
| `buildPDF` postcard | 87.3 ms | 87.9 ms | same |

The print renderer had no timing before (baseline.md); these are its first numbers.

## Regressions found and fixed

Before T072 the interleaved A/B showed four paths slower than `main`. Each fix restores code that 407's clean-ups made
slower; none changes behaviour (`npm run check`, the engine's unit tests).

Each A/B column is one run: `main` → 407.

| Path | A/B before T072 | A/B after T072 | Cause → fix |
| --- | --- | --- | --- |
| `gainCurve` | 0.102 → 0.116 ms (+14 %) | 0.104 → 0.103 ms (−1 %) | `valueAt`'s binary search read `keys.at(i)` / `keys[i]?.t ?? Infinity`, ~50 % slower in isolation; now `keys[i]` with `=== undefined` checks. `clampValue` called `Object.hasOwn` twice per sample; now one table lookup. |
| `detailPixels` clarity | 169 → 198 ms (+17 %) | 174 → 173 ms (−1 %) | `?? 0` on the 9 typed-array reads in the blur's two passes (T070, `noUncheckedIndexedAccess`). Now `!` there, the one lint exception (D-047). |
| `detailPixels` sharpen | 66 → 89 ms (+34 %) | 71 → 64 ms (−10 %) | the same blur reads |
| `detailPixels` dehaze | 220 → 210 ms (−5 %) | 220 → 212 ms (−3 %) | unchanged |
| `detailPixels` noise | 363 → 361 ms (−1 %) | 415 → 407 ms (−2 %) | unchanged |

Tried and dropped: `=== undefined` checks on the blur's reads (clarity and sharpen +55 %); `=== undefined` on the
chain's pixel reads (no gain).

## The look path: an accepted exception

`adjustPixels` with a look (the Canvas 2D colour chain, used when WebGPU is missing or fails; the GPU path and
`gpuColour` are not affected) depends on what ran before it in the page:

| Order in the page | warm | bw | tinted |
| --- | --- | --- | --- |
| a photo without a look first, then looks | +16 % to +21 % | +13 % to +22 % | +14 % to +16 % |
| looks first, without a look last | −7 % | −9 % | +1 % |
| one look only | −6 % | −3 % | — |

Cause: before 407, `chainPixels` was one ~100-line function with the look and the light maths inline. T035 split it
(`chainPixel` → `lightInto`, `finishPixel`), keeping the light-only path within 0–6 %. With a look, Electron's V8
(15.2; Node 24's 13.6 behaves differently) decides what to inline by its budget of 920 bytecodes per optimised
function, and the decision depends on which loop warmed up first: when the light-only loop is optimised first,
`lightInto` is inlined into the look loop but `linFast` / `srgbFast` (six calls a pixel) are not
(`--trace-turbo-inlining` in Electron's node mode). Seven structures were tried: the look in a loop of its own, a flat
loop, one function per look, a single loop for every case, the look through `chainPixel`, a local scratch object,
the old `lookPixel`. None fixed the none-first order without making another order or no look slower, and none
measured ≥ 10 % better than the committed code overall, so the code stays as T035 left it. The maintainer accepted
this as the one exception to "no timing check gets slower" (spec Changelog, 2026-10-16).

## Not changed

No path measured a ≥ 10 % gain worth a change beyond the regressions above: the frame stack and drawing, the decoder
pool, the sound mix and the print renderer match `main`.
