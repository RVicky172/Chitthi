# 401 — AI models on this device: see and delete downloaded models

**Status:** Implemented <!-- Draft | Approved | In Progress | Implemented | Superseded --> **Roadmap phase:** Other
features (400+) · **Created:** 2026-10-07 · **Owner:** RVicky172

## Summary

Finding the sky in a photo (AI masks, P1.8) downloads the skyseg model once, 176 MB, into the origin's private file
system (OPFS; in the desktop app, inside its data folder). Today nothing in the app shows that it is there or lets the
user remove it: the only way is clearing the whole site's data, which also erases designs, the photo library and
presets. `src/ai/segment/index.ts` already has `forgetModel()`, but nothing calls it. This feature adds a small **AI
models on this device** section to Settings that lists each downloadable model, shows whether it is on the device and
how big it is, and deletes it with one button. A deleted model is simply downloaded again, after asking, the next time
it is needed.

## User Stories

- **US-1:** As a browser user, I want to see which AI models this app has downloaded and how much space they take, so
  that I know where my storage went.
- **US-2:** As a user short on space, I want to delete a downloaded model without losing my designs or photos, so that I
  can free 176 MB and get it back later if I need it.
- **US-3:** As a keyboard or screen reader user, I want the same section reachable and understandable without a mouse.

## Acceptance Criteria

- [x] **AC-1:** Settings › AI has a section **AI models on this device** listing every model that is downloaded rather
      than bundled (today: the sky model), each with its name, its size ("176 MB") and its state: "On this device" or
      "Not downloaded". Bundled models (the subject model, 4.6 MB) are listed as "Part of the app" with no button.
      _(e2e)_
- [x] **AC-2:** A downloaded model has a **Delete** button. Pressing it removes the file from the device
      (`modelOnDevice('sky')` is false afterwards, also after a reload) and the row changes to "Not downloaded" with a
      polite status message ("The sky model was deleted: 176 MB freed."). No other stored data changes: designs, the
      library and presets are all still there. _(e2e on web; self-test in the desktop app)_
- [x] **AC-3:** After a delete, the next sky mask asks to download again (the existing prompt and button in the mask
      panel) and works after the download. _(e2e with the download mocked, or self-test)_
- [x] **AC-4:** A delete while a model is in use (a sky search running) waits for it to finish or is refused with a
      message; it never breaks the running search. _(unit or e2e)_
- [x] **AC-5:** Where the browser has no private file system (the model only lives in memory for the session), the row
      says so ("Kept for this session only") and Delete forgets it from memory. _(unit)_
- [x] **AC-6:** Keyboard and screen reader: the buttons have names that include the model ("Delete the sky model"), the
      state is text (not colour only), axe reports no serious or critical issue, and 360 px wide has no sideways scroll.
      _(e2e + axe)_
- [x] **AC-7:** Docs: `docs/AI.md` (where models are kept and how to delete them) and the in-app docs say where the
      model lives (browser private storage / the desktop app's data folder) and that it can be deleted here;
      `CHANGELOG.md` Unreleased. _(manual check)_

## Non-Functional Requirements

- Performance: opening Settings doesn't load the AI code into the entry chunk (`check-bundle.mjs` still passes): the
  section reads the state through a dynamic `import()` of `ai/segment` or a small storage helper outside it.
- Privacy: nothing is sent anywhere; the section only reads and deletes local files.
- Compatibility: web (Chrome, Edge, Firefox, Safari) and the desktop app alike.

## Out of Scope

- Deleting other stored data (designs, library, fonts cache): that stays with the browser's own controls.
- An agent (MCP) tool to delete models (see Q3).
- Showing the file's path on disk: browsers keep OPFS under internal names, so there is no path a user could open.

## Open Questions

- **Q1** _(resolved)_ Ask "Delete the sky model (176 MB)? It is downloaded again when you next find a sky." before
  deleting, or delete at once? _Proposed:_ delete at once with the status message; it is easy to get back and costs
  nothing but a download. _Answer (accepted 2026-10-07):_ delete at once with the status message.
- **Q2** _(resolved)_ Should Delete also unload the model from the running worker, so it is truly gone from memory until
  the next download? _Proposed:_ yes: terminate the segmentation worker if it holds the model (`sent` set), so "deleted"
  means deleted in this session too. _Answer (accepted 2026-10-07):_ yes, the segmentation worker is ended when it holds
  the model.
- **Q3** _(resolved)_ Constitution XI (agents use the same code): add a `delete_ai_model` agent tool now? _Proposed:_
  no; listing and deleting local files isn't a creative task, and the gap is recorded here. _Answer (accepted
  2026-10-07):_ no agent tool; the gap is recorded here.
- **Q4** _(resolved)_ Also show the total storage the site uses (`navigator.storage.estimate()`), with the model's
  share? _Proposed:_ no, only the models; the estimate includes things this section can't delete. _Answer (accepted
  2026-10-07):_ no, only the models.

## Changelog

- 2026-10-07 — Created (maintainer's request while working on 202).
- 2026-10-07 — Q1–Q4 accepted as proposed and the feature approved by the maintainer ("yes add this option"); plan and
  tasks written with no open decisions; In Progress.
- 2026-10-07 — Implemented (all ACs; AC-3 checked to the download prompt, the download itself is P1.8's).
