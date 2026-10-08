# Chitthi Studio — Roadmap

> Phased plan. Each phase is a set of feature specs. Update statuses as work moves.
> Status legend: ⬜ Not started · 📝 Spec drafted · ✅ Spec approved · 🚧 In progress · ✔️ Done

**Last updated:** 2026-10-06

The what and why for the editor phases is in [vision/editor-roadmap.md](vision/editor-roadmap.md); the original work
items (files, tests, notes and measurements for Phases 0–1) are in
[vision/editor-implementation.md](vision/editor-implementation.md). From Phase 2 on, each work item is a feature
folder here and this file holds its status. Numbers follow the work-item IDs: **P2.1 → 201**, **P3.4 → 304**.

---

## Baseline — what exists before SDD

_Goal:_ record the app as it stands (2.8.0 plus the unreleased editor Phases 0–1) and close the Phase 1 gate.

| #   | Feature | Spec | Status |
| --- | ------- | ---- | ------ |
| 000 | Baseline: print studio, photo & video studio, desktop app, MCP, AI, GPU render graph (editor P0.1–P0.9), advanced photo editor (P1.1–P1.12) | [spec](features/000-baseline/spec.md) | ✔️ |
| 001 | Phase 1 gate and 2.10.0 release: masked edits measured on a mid-range laptop in Chrome; first macOS build with Intel LibRaw; tag 2.10.0 | [spec](features/001-phase1-gate-release/spec.md) | 🚧 2.10.0 released 2026-10-06; post-release checks open (backlog) |

**Exit criteria:** every Definition-of-Done gate passes on a clean clone; the Phase 1 gate in
[editor-implementation.md](vision/editor-implementation.md#progress) is met and 2.10.0 is released.

## Phase 2 — Multi-track timeline (release 3.0.0)

_Goal:_ a real timeline with tracks, edit tools, keyframes, transitions, speed and audio.

| #   | Feature (work item) | Spec | Status | Needs |
| --- | ------------------- | ---- | ------ | --- |
| 201 | Track model and migration (P2.1) | [spec](features/201-track-model/spec.md) | ✔️ | — |
| 202 | Edit operations: ripple, roll, slip, slide, magnetic main track, snapping (P2.2) | [spec](features/202-edit-operations/spec.md) | 🚧 | 201 |
| 203 | Compositing many tracks, picture-in-picture (P2.3) | — | ⬜ | 201, 204 |
| 204 | Decoder pool with look-ahead (P2.4) | — | ⬜ | 201 |
| 205 | Keyframes: `Animated<T>`, keyframe lane (P2.5) | — | ⬜ | 201 |
| 206 | Transitions as shaders (P2.6) | — | ⬜ | 201, 204 |
| 207 | Speed: constant, reverse, freeze, ramps (P2.7) | — | ⬜ | 201 |
| 208 | Audio tracks, waveforms, ducking, loudness (P2.8) | — | ⬜ | 201, 205 |
| 209 | Voice-over (P2.9) | — | ⬜ | 208 |
| 210 | Markers, in/out, range export, text animations, compound clips (P2.10) | — | ⬜ | 201 |
| 211 | Proxies and frame cache, desktop first (P2.11) | — | ⬜ | 201 |
| 212 | Agent tools and docs for the timeline (P2.12) | — | ⬜ | 202, 203, 205, 206 |

**Exit criteria:** a 4K multi-track timeline (3 video and 2 audio tracks, transitions) plays smoothly on desktop;
every 2.x project opens unchanged.

## Phase 3 — Colour and finishing (release 3.1.0)

_Goal:_ a colour page with scopes, captions, retouching, and professional outputs on desktop.

| #   | Feature (work item) | Spec | Status | Needs |
| --- | ------------------- | ---- | ------ | --- |
| 301 | Primary grade: wheels, contrast, pivot (P3.1) | — | ⬜ | — |
| 302 | Grading curves and secondaries, HSL qualifier (P3.2) | — | ⬜ | 301 |
| 303 | Scopes: histogram, waveform, parade, vectorscope (P3.3) | — | ⬜ | — |
| 304 | Grade tools: copy/paste, timeline LUT, match clips (P3.4) | — | ⬜ | 301 |
| 305 | Auto captions, on-device speech model (P3.5) — licence check first | — | ⬜ | — |
| 306 | Spot heal and clone (P3.6) | — | ⬜ | — |
| 307 | Professional outputs on desktop: FFmpeg helper, 10-bit, HDR (P3.7) — licence exception first | — | ⬜ | — |
| 308 | AI object removal, desktop (P3.8) — model licence first | — | ⬜ | — |
| 309 | Agent tools and docs for grading, scopes, captions (P3.9) | — | ⬜ | 301, 303, 305 |

**Exit criteria:** none set yet (the editor roadmap marks it the last phase); the first Phase 3 spec proposes a
measurable one.

## Other features (400+)

Print studio, site and anything outside the editor phases take the next free number from 401.

| #   | Feature | Spec | Status | Needs |
| --- | ------- | ---- | ------ | --- |
| 401 | AI models on this device: see and delete downloaded models | [spec](features/401-ai-models-on-device/spec.md) | ✔️ | — |
| 402 | Software factory: agents run the spec-driven line, people decide (F1–F7 of [software-factory.md](software-factory.md)) | [spec](features/402-software-factory/spec.md) | 🚧 verified 2026-10-08 except AC-16 (T063 in backlog) | — |

## Backlog (unscheduled ideas)

- **Deferred 001 checks on the maintainer's hardware** (2026-10-06; 001 and the 2.10.0 release wait for them):
  the Phase 1 gate on a mid-range laptop in Chrome (`npm run measure:gate`, plus `npm test`'s timing and the
  performance monitor in the packaged app: 001 T022, T023); the Intel LibRaw build and RAW files in the arm64 and x64
  macOS apps (T030, T033). Then the release itself: T040 version and CHANGELOG, T041 merge into `main`, T042 dry run,
  T043 tag `v2.10.0`, T044–T047 clean installs, update from 2.8.0, web redeploy. How: the 👤 tasks in
  [001 tasks](features/001-phase1-gate-release/tasks.md).

- **Deferred 402 T063: parallel features in two worktrees** (2026-10-08): two scratch features, each with one tiny
  tooling task, run by the factory at the same time; both green, gate runs never overlap (run-file timestamps),
  worktrees removed after. Proves 402 AC-16. How: T063 in [402 tasks](features/402-software-factory/tasks.md).

- Firefox and Safari (WebKit) projects in Playwright ([testing-strategy.md](testing-strategy.md#not-automated-yet)).
- The media studio's own "Still to do" list in [docs/MEDIA-STUDIO.md](../docs/MEDIA-STUDIO.md).
