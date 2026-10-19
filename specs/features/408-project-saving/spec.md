<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 408 — Saved photo and video projects

**Status:** Implemented
**Roadmap phase:** Other features (400+) · **Created:** 2026-10-19

## Summary

The print studio autosaves the card in progress and keeps a gallery, but the photo and video studios keep nothing: a reload, a closed tab, a crash or quitting the desktop app throws away a whole Reel edit or a batch of edited photos, and an hour of timeline work can't be put down and picked up tomorrow. As the video editor grows (tracks, keyframes, audio, and next voice-over, whose recordings exist nowhere else, 209), that loss gets worse. 408 makes photo batches and video projects **saved projects**: saved automatically as you work, listed so you can keep several, reopened exactly as you left them. Storage follows how each version of the app already stores the print gallery (docs/DESKTOP.md): the **browser** keeps projects and copies of their media in the browser's own storage on this device, because a web page can't open a file by its path again; the **desktop app** keeps projects as files in its data folder and remembers where each photo, video and sound file is on disk instead of copying it, because desktop videos can be 50 GB. The two libraries stay separate, as the print galleries are today. Nothing is uploaded.

## User Stories

- **US-1:** As a creator editing a Reel, I want my work saved as I go, so that a reload, a crash or closing the app never loses it.
- **US-2:** As a creator, I want to keep several projects (this week's Reel, a YouTube video, a photo carousel) and switch between them, so that I can work on more than one thing.
- **US-3:** As a browser user, I want a reopened project to have its photos, videos and sounds without picking the files again, and to know how much space my projects take on this device.
- **US-4:** As a desktop user with large video files, I want projects to point to my files where they are instead of copying gigabytes, and to be helped to find a file I moved.
- **US-5:** As a creator, I want to delete a project and get its space back, without the app ever deleting my own original files.
- **US-6:** As a keyboard or screen-reader user, I want to create, open, rename and delete projects without a mouse and hear what happened.

## Acceptance Criteria

### Saving

- [x] **AC-1:** **Autosave**: the video project and the photo batch are saved within 2 s of the last change (a drag or slider saves once it ends), and at once when the tab is hidden, the window closes or the app quits. There is no Save button to forget; the top bar shows “Saved” / “Saving…” / “Not saved: <reason>”. A crash or power cut loses at most the last 2 s of edits, and a project is never left half-written: after an interrupted save the project opens as it was at the last complete save. _(unit)_
- [ ] **AC-2:** **Everything comes back**: reopening a project (after a reload, in a new tab, after restarting the app or the computer) restores every saved setting: for video the format, tracks, clips, gaps, layers, keyframes, transitions, speed and ramps, audio tracks, sound clips, ducking, loudness, export settings and the playhead; for photos every photo, its order, edits, masks, layers, the post format and export settings. For the fixture projects of 201–208 and of the photo editor, the reopened project's saved document is identical to the one saved, and its export is byte-identical to the export before reopening. The undo history starts empty (Q2). _(unit)_

### Projects

- [x] **AC-3:** **Several projects**: each studio (photo, video) has a **Projects** list (Q6): **New**, **Open**, **Rename**, **Duplicate** and **Delete** (asks first). Each entry shows its name, a thumbnail, its kind (Reel / Short / YouTube / photo post), its length or photo count, when it was last changed and the space it takes on this device; newest first. A new project is named after its kind and time (“Reel · 19 Oct 14:02”) and can be renamed (1–80 characters). Opening the studio reopens the last project used; the first visit starts a new one. There is no limit on the number of projects other than the device's storage. _(unit)_

### Media in the browser

- [x] **AC-4:** **Browser storage**: every photo, video and sound a project uses is copied once into the browser's storage on this device when it is added (Q3), so a reopened project needs no file to be picked again. A file used by several projects, or added twice, is stored once. Copying runs in the background with progress and never blocks editing; until it finishes the project says the file isn't kept yet. The app asks the browser to keep its storage (persistent storage, so it isn't cleared to free space) and, if the browser refuses, says that projects may be removed when the device runs low. A file that wouldn't fit in the space the browser allows is refused with the reason and the space left (“This 2.1 GB video doesn't fit: 1.4 GB left for projects in this browser”). _(unit)_

### Media in the desktop app

- [x] **AC-5:** **Desktop storage**: projects are files in the app's data folder (`library/projects/`). Photo, video and sound files the user added are **not copied**: the project remembers each one's location, size and modification time (Q4). Files the app itself made and that exist nowhere else (209's voice recordings, generated music, AI images, Pexels downloads, pasted images) are kept in the data folder (`library/media/`). Opening a project whose file was moved, renamed, changed or deleted still opens: the missing clip shows a placeholder with **Find file…**; choosing the file reconnects it (refused with the reason when it isn't the same kind of media or is shorter than the clip needs), and other missing files of the project found in the same folder reconnect at once. _(unit)_

### Safety

- [x] **AC-6:** **Loading is validated**: every project read from storage goes through the existing validators (the project document's and the photo edits'): a damaged project, one from a newer version of the app, or one with values out of range opens with everything that is valid, clamped where needed, and says what was left out; it never crashes the studio or loses the rest of the list. A project that can't be read at all stays in the list marked “can't be opened” with **Delete**, and its media is kept until it is deleted. _(unit)_
- [x] **AC-7:** **Deleting gives the space back, and never touches the user's files**: deleting a project removes it and any stored media no other project uses (the browser's copies; on desktop only the app-made files in `library/media/`). A user's own files on disk are never deleted, moved or changed by the app. The list shows the space a delete will free before asking. _(unit)_
- [x] **AC-8:** **One project, one editor at a time** (Q15): opening a project already open in another tab or window takes it over there: the other one stops saving at once and says “This project is open in another window” with **Open here again**. Two windows never overwrite each other's edits silently. _(unit)_

### Storage

- [x] **AC-9:** **Space on the device**: the Projects list shows the total used and, in the browser, the space the browser allows (“Projects use 3.2 GB; about 41 GB free for this site”). At 90 % of the allowed space it warns once per session; when a save fails because storage is full, the project stays open in memory, the top bar says “Not saved: storage is full”, and saving resumes once space is freed. The print studio's gallery, photo store and autosave are unchanged and share nothing with projects (Q8). _(unit)_

### Speed

- [ ] **AC-10:** **Saving and opening don't slow editing**: saving a 500-clip video project or a 20-photo batch blocks the page for under 50 ms on the reference laptop; opening a 60-clip project shows its timeline within 2 s (thumbnails, filmstrips and waveforms may fill in after, from what was saved, Q14) and plays within 3 s; the entry chunk stays ≤ 350 KB (the projects code loads with `import()`). (Measured in 290.) _(timing)_

### Keyboard and screen readers

- [ ] **AC-11:** The Projects list and every action in it work from the keyboard (arrow keys move, Enter opens, F2 renames, Delete asks to delete) and are announced (“Opened Reel · 19 Oct 14:02, 24 clips”, “Deleted Holiday carousel, 210 MB freed”); the save status is a polite live region announced only on a failure; axe finds no violations with the list open. (Proven in 290.) _(e2e)_

### Web and desktop

- [ ] **AC-12:** End to end in the browser (desktop and phone layouts): make a Reel with a video, a photo, text and a sound, reload, and it is all back and exports the same file; delete it and the browser's stored size goes back to what it was. In the desktop app on Windows and macOS: the same after quitting and restarting; a moved file reconnects with Find file…. (Proven in 290.) _(e2e)_

### Agents

- [ ] **AC-13:** **Agent tools** (Constitution XI, Q10): `list_projects`, `new_project`, `open_project`, `rename_project` and `delete_project` for both studios, going through the same code as the UI; a deleted project needs `confirm: true`. Covered by the self-test and `test:mcp`, documented in `docs/MCP.md`. (Run in 290.) _(selftest)_

### Docs

- [ ] **AC-14:** `docs/MEDIA-STUDIO.md` (projects, autosave, storage, Find file…), `docs/DESKTOP.md` (the `projects/` and `media/` folders, the separate libraries), `docs/TROUBLESHOOTING.md` (storage full, a project that can't be opened, browser storage cleared), `specs/architecture.md` §6 (the storage table), `specs/lld.md`, `docs/MCP.md`, `CHANGELOG.md` and the in-app docs describe the change. _(review)_

## Non-Functional Requirements

- **Reliability:** at most 2 s of edits lost to a crash; never a half-written project; a damaged project never takes the others down (AC-1, AC-6).
- **Performance:** saving blocks the page < 50 ms; media copying and loading run in the background; the projects code loads with `import()`, entry chunk ≤ 350 KB (AC-10).
- **Privacy:** everything stays on the device; nothing is uploaded (Constitution VI). Desktop keeps file locations only in its own data folder.
- **Security (desktop):** reading the user's files by location goes through validated IPC registered with `electron/ipc.cjs`, only for files the user added to a project or chose with Find file…; the page never gets arbitrary file access.
- **Compatibility:** browser and desktop alike in behaviour, each with its own storage (AC-4, AC-5); Chromium, Firefox and Safari; existing print data untouched; projects made by this version open in later ones (versioned documents through the validators).
- **Accessibility:** keyboard and screen reader for every action; axe passes (AC-11).
- **Free and open source:** no limit on projects other than the device's space; no account or cloud.

## Out of Scope

- Project files for moving or sharing a project, with or without media (Q7, follow-up 409); copying a desktop project's files into one folder.
- Sync between devices, between the browser and the desktop app, or any cloud storage.
- Saving the undo history (Q2); version history or snapshots of a project.
- Merging edits made in two windows (Q15).
- Changes to the print studio's gallery, photo store or autosave (Q8).

## Open Questions

- **Q1** _(resolved)_ One autosaved project per studio, or a list? _Answer (accepted 2026-10-19):_ a list (AC-3): creators run several Reels at once, and a single autosave slot would make **New** throw the old one away. The last one used reopens, so for someone with one project it feels like a single autosave.
- **Q2** _(resolved)_ Save the undo history? _Answer (accepted 2026-10-19):_ no: it starts empty when a project is reopened. Saving it would multiply what is written on every change, and the print studio doesn't either.
- **Q3** _(resolved)_ How does the browser keep media? _Answer (accepted 2026-10-19):_ copy each file into the browser's own storage for this site (AC-4), in every browser. The alternative, keeping a handle to the original file (Chrome and Edge only), needs the user to grant access again on every visit and fails when the file moves, so it isn't used. The cost is space, so files are stored once however many projects use them, and the size is shown.
- **Q4** _(resolved)_ How does the desktop app keep media? _Answer (accepted 2026-10-19):_ remember where the user's files are and never copy them (AC-5): desktop videos can be up to 50 GB and copying would double the disk used. Files only the app has (recordings, generated or downloaded media) go into the data folder, so nothing exists only in memory. A **Copy files into the project** option (for moving to another computer) is left for project files (Q7).
- **Q5** _(resolved)_ How large can the browser's projects get? _Answer (accepted 2026-10-19):_ as large as the browser allows for the site (Chrome allows up to 60 % of the disk, Firefox up to 50 % of free space, Safari asks past ~1 GB), with the space shown and a clear refusal when a file wouldn't fit; no limit of our own. The existing per-file limits (4 GB video on the web) stay.
- **Q6** _(resolved)_ Where is the Projects list? _Answer (accepted 2026-10-19):_ a **Projects** button at the left of each studio's top bar (next to the mark) opening a panel with the list and New; plus a **Continue: <project>** link on the home screen when there is a recent project. No separate screen.
- **Q7** _(resolved)_ Project files (`.chitthi` for a video or photo project, with or without its media) to move a project between computers or between the browser and the desktop app? _Answer (accepted 2026-10-19):_ not in 408: it needs packing gigabytes of media into one file and streaming it, which is its own feature (a follow-up, 409). 209's AC-8 drops its `.chitthi` clause until then.
- **Q8** _(resolved)_ Do projects share anything with the print studio? _Answer (accepted 2026-10-19):_ no: the print gallery, photo store and card autosave stay as they are (AC-9). A photo used in a print card and in a photo project is stored for each, as today.
- **Q9** _(resolved)_ What is a photo project? _Answer (accepted 2026-10-19):_ the photo studio's batch (up to the batch limit), with its format, edits and export settings: each saved batch is a project. RAW files are kept as the original file (browser: copied; desktop: referenced) so they can be developed again.
- **Q10** _(resolved)_ Agent tools? _Answer (accepted 2026-10-19):_ yes, the five of AC-13, because every user-facing feature must be reachable by agents (Constitution XI) and agents already build Reels and photo posts through the MCP server.
- **Q11** _(resolved)_ When are 408's e2e, self-test and timing checks run? _Answer (accepted 2026-10-19):_ in 290, the Phase 2 test pass, with Phase 2's (D-033), and 408 ships in the 3.0.0 release with Phase 2, since 209 depends on it.
- **Q12** _(resolved)_ How do 209's voice recordings relate? _Answer (accepted 2026-10-19):_ a recording is project media made by the app: in the browser stored like any copied file, on desktop in `library/media/`; 209's own take store then keeps only takes in progress, for crash recovery (D-058).
- **Q13** _(resolved)_ How quickly is a change saved? _Answer (accepted 2026-10-19):_ within 2 s of the last change, and at once when the tab is hidden or the window closes (AC-1); the document is written whole each time (it is small: media is stored separately), media only when added.
- **Q14** _(resolved)_ Are thumbnails, filmstrips and waveform peaks saved? _Answer (accepted 2026-10-19):_ yes, with the project (small: tens of KB to a few MB), so a reopened project looks complete at once instead of re-reading every file; they are rebuilt in the background if missing or if the file changed.
- **Q15** _(resolved)_ Two tabs or windows on the same project? _Answer (accepted 2026-10-19):_ the latest one opened takes over and the other stops saving and says so (AC-8), on the web across tabs and on desktop across windows. Merging edits from two windows is out of scope.

## Changelog

- 2026-10-19 — Created: draft spec with 14 acceptance criteria and 15 open questions with proposed answers; storage separate for the browser (device storage, media copied) and the desktop app (data folder, media referenced), as the maintainer asked.
- 2026-10-19 — Q1–Q15: every proposed answer accepted by the maintainer; Approved.
- 2026-10-19 — Plan drafted (§1–§11, D1–D6 for the maintainer).
- 2026-10-19 — Plan approved (D1–D6 as recommended, D-059).
- 2026-10-19 — Tasks written (T001–T112).
