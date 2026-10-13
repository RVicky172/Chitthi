# 407 — Baselines (2026-10-13)

What “unchanged” is measured against (AC-9, AC-10), taken on `feat/407-code-structure` after merging `main` `3d08be7`
(205, 206 and the fixes below), before any 407 change, on the maintainer's machine: Windows 10.0.26300, Intel Core
Ultra 9 285K (24 threads), 127 GB RAM, NVIDIA (Blackwell, WebGPU), Chrome 154 / Electron. Each later task compares
with these, on the same machine.

**Found while taking them:** the first e2e run had 22 failures. The video editor crashed as soon as a clip was selected
(a store selector returning a new object, from 203 T054), 206's cut buttons took the drag from the clips' trim edges,
and touch targets under 24 px (203, 205, 206) failed axe. Fixed on `fix/clip-inspector-render-loop` and merged into
`main` (`8a365b9`, `354ec80`, merge `3d08be7`) before these numbers. See `memory/learnings.md` (2026-10-13).

## Tests

| Check | Command | Result |
| --- | --- | --- |
| Unit and integration tests | `npm run test:unit` | 1,672 passed in 48 files |
| E2e | `npm run test:e2e` | 84 passed, 16 skipped, 0 failed (desktop and phone projects) |
| Self-test | `npm test` | 6,203 checks passed, 0 failed (216 s) |
| MCP | `npm run test:mcp` | passed, 23 checks |

## Build

| What | Size |
| --- | --- |
| Entry chunk (`index-*.js`) | 327 KB (budget 350 KB), 334.78 kB / 108.23 kB gzip as Vite reports it |
| Studio chunk (`InstagramStudio-*.js`) | 187.66 kB / 61.07 kB gzip |
| Mediabunny chunk (`frameSource-*.js`) | 410.38 kB / 104.56 kB gzip |

## Timings

| Path | Command | Result |
| --- | --- | --- |
| Preview frame (60 clips, 24 s, 1920 × 1080, WebGPU) | `npm test` | median 11.9 ms (runs 11.7, 12.1, 11.9) |
| Export of the same | `npm test` | median 2.90 s (runs 3.06, 2.90, 2.87) |
| 2-minute 1080p exports on the pool | `npm test` | 12.5, 12.3, 12.8 s |
| 2-minute 1080p export, main + 2 overlays (203 AC-13) | `npm test` | 13.0 s, peak 40 MB of frames |
| 201's 60-clip export | `CHITTHI_TEST_ONLY=timing npm test` | fastest 2.69 s (runs 2.77, 2.69, 2.70) |
| 30 × 4 s 1080p video export | `CHITTHI_TEST_ONLY=timing npm test` | fastest 13.46 s (runs 13.46, 13.72, 13.84) |
| Playback through cuts (204 AC-5) | `CHITTHI_TEST_ONLY=pooltiming npm test` | 19 / 19 cuts on time, 0 frames over 1 behind, 0 holds, 3 runs |
| Seek latency (204 AC-7) | same | median 52 ms, p95 73 ms, max 107 ms |
| Pool load (204 AC-12) | same | at most 5 decoders, 5 readers, 19 frames, 150 MB |
| Sound − picture (204 AC-8) | same | 30 s clip mean 38 ms, worst 51 ms; through a cut mean −2 ms, worst 38 ms |
| Masked photo edits, preview update interval (Phase 1 gate) | `npm run measure:gate` | paint median 16.6 ms, p95 18.6 ms; drag median 16.6 ms, p95 18.7 ms (3 runs) |
| Print renderer, time per page | — | no timing check exists yet: T072 measures it first |

## Code (the standards, `src/`, tests left out)

| Measure | Value |
| --- | --- |
| Names declared (variables, parameters, functions) | 16,459, of which one letter 5,593 (34 %) |
| Exported functions | 880, of which without JSDoc 333 (38 %) |
| Functions over 80 lines | 103 |
| Files over 600 lines | 19 (largest `engine/render.ts` 1,443, `state/video.ts` 1,330, `components/studio/Timeline.tsx` 1,321) |
| React `recommended-latest` findings | 27 in 16 files (set-state-in-effect 8, refs 6, exhaustive-deps 5, preserve-manual-memoization 3, immutability 2, purity 2, use-memo 1) |
| Type assertions (`as`, not `as const`) | 379 (13 `as unknown as`) |
| Non-null assertions (`!`) | 177 |
| `any` | 0 |
| Functions taking inline object types | 121 |
| `noUncheckedIndexedAccess` errors | 1,400 |
| `useEffect` | 106; `useMemo` / `useCallback` 19, `memo` 3 |
