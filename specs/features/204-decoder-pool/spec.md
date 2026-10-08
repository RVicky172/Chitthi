# 204 — Decoder pool with look-ahead (P2.4)

**Status:** Draft <!-- Draft | Approved | In Progress | Implemented | Superseded -->
**Roadmap phase:** 2 — Multi-track timeline · **Created:** 2026-10-08 · **Owner:** RVicky172

## Summary

The video editor decodes one video at a time. The preview keeps a player for every video clip in the project
for the whole session and plays only the clip under the playhead. At each cut the next clip starts from cold, and
its picture can lag or freeze. A project with many video clips holds that many players in memory. The export
decodes clip after clip and never needs two pictures at once. Phase 2 needs more than this. Picture-in-picture
(`203`) shows up to several videos at the same moment, and transitions (`206`) need the last frames of one clip
and the first frames of the next together. This feature adds a **pool of video decoders** that both the preview and
the export use. It decodes every video visible at a time `t` together. It **looks ahead**, so the next clip's first
frame is ready before its cut. It holds a bounded number of decoders and decoded frames, however many clips the
project has. It releases every decoded frame as soon as it has been drawn, so long sessions and long exports don't
leak GPU memory. Its measurements set how many videos may be visible at once on the web and on the desktop app
(`203` Q6). For today's projects the result looks and sounds the same. Cuts play more smoothly, a paused preview
shows exactly the frame the export will encode, and memory no longer grows with the number of clips.

## User Stories

- **US-1:** As a video creator, I want playback to run through cuts between video clips without a freeze or a black
  flash, so that I can judge my edit's rhythm in the preview.
- **US-2:** As a video creator, I want the paused preview to show exactly the frame my exported video will have at
  that time, so that I can place a cut or a title on the right frame.
- **US-3:** As a creator with a long project (up to 60 clips on the web, 500 on the desktop app), I want the editor
  to stay responsive and not run out of memory as I add clips, play and export, so that I can finish long videos.
- **US-4:** As a video creator, I want to export a long video, cancel an export or hit a broken file without the app
  getting slower or crashing afterwards, so that I can export again in the same session.
- **US-5:** As a contributor building `203` (picture-in-picture) and `206` (transitions), I want one tested way to
  get the right frame of several videos at the same moment, with measured limits, so that compositing and
  transitions don't each manage decoders themselves.

## Acceptance Criteria

Fixtures are test clips made in memory by the self-test (a flat colour that encodes the source time, as `201`'s
checks do), at the stated size, 30 fps, with a key frame every 2 s (Q9) unless an AC says otherwise. "The development
machine" is the one the measurements in `201` and `203` are recorded on; the plan names it.

### Decoding several videos at once

- [ ] **AC-1:** For any set of up to the desktop limit (Q2) of video clips asked for the same timeline time `t`, the
      pool returns for each clip the source frame at that clip's source time (`in` + local time), the same frame
      the export uses for `t`. Checked at 30 times across 3 clips that overlap in time, including each clip's first
      and last frame and two clips from the **same file** at different source times. Every decoded colour matches
      the expected source time within ±8 levels per channel. _(self-test)_
- [ ] **AC-2:** Two adjacent clips on one track can be decoded for the same moment: the last 15 frames of the first
      and the first 15 frames of the second, as a transition of 0.5 s at 30 fps needs (`206`). All 30 pairs are the
      expected frames. _(self-test)_
- [ ] **AC-3:** Asking for frames out of order works and stays exact: 50 random times within 3 clips (seeks
      backwards and forwards, across key frames) each give the expected frame. _(self-test)_

### Preview

- [ ] **AC-4:** Paused, the preview shows the same source frame as the export at the same time. At 20 times
      across a project of 6 video clips at 9:16 and at 16:9, the clip's frame drawn by the preview equals the
      frame the export encodes for that time (decoded colours within ±8). Today a paused preview can be up to
      0.02 s off. _(self-test)_
- [ ] **AC-5:** Look-ahead: during playback the next video clip's first frame is decoded before its cut. Playing
      a 1080p 16:9 project of 20 video clips of 2 s each through in real time on the development machine, all 19
      cuts draw the new clip's first frame on the cut's frame (3 runs). No cut shows black or holds the
      previous clip for more than 1 frame. _(self-test timing, desktop; manual measurement in Chrome)_
- [ ] **AC-6:** If a frame isn't ready in time during playback, the preview holds that clip's last drawn frame
      (never black, never a frame from another clip) and the playhead keeps wall-clock time, as today (Q4). The
      number of held frames per playback is counted for the measurements. _(unit + self-test)_
- [ ] **AC-7:** Scrubbing (moving the playhead while paused) on a 1080p clip with key frames 2 s apart shows the
      exact frame at the new time within a median of 100 ms and a 95th percentile of 250 ms over 50 random seeks
      on the development machine. Faster moves replace slower ones: the frame shown at the end is the last one
      asked for. _(self-test timing)_
- [ ] **AC-8:** A clip's sound stays with its picture in the preview. On a generated sync clip (a white flash and
      a beep on the same frame every 2 s), the picture and the sound are at most 2 frames (67 ms) apart through 30 s
      of playback in the desktop app and in Chrome (Q5). _(manual measurement)_

### Export

- [ ] **AC-9:** The export uses the same decoding as the preview (Q1). For `201`'s fixtures and `202`'s gap
      fixture, the exported frames show the same source frames as before this feature (decoded colours within ±8
      at 10 times each), and the frame and sound plans are unchanged. All existing video self-test checks and video
      e2e tests pass unchanged. _(self-test + e2e)_
- [ ] **AC-10:** Export speed doesn't get worse. The `201` timing fixture (60 clips, 1080p) exports within 5 % of
      `202`'s time (fastest of 3 runs, as `201` AC-5). A 1080p project of 30 video clips of 4 s each exports no
      slower than before, with look-ahead opening each next clip during the current one. _(self-test timing)_

### Memory and leaks

- [ ] **AC-11:** No leaked frames. After a **2-minute 1080p 16:9 export** (Q9: 24 video clips of 5 s from 3
      source files, with cuts, a hidden-track span and a gap), no decoded frame and no decoder is left open. The
      same holds after 3 such exports in a row, after an export cancelled at 50 %, and after an export that fails
      on an unreadable clip at 1 minute. Any self-test can read the count of open frames and decoders at any moment,
      so `203` AC-13 and `206` reuse the same check. _(self-test)_
- [ ] **AC-12:** Bounded memory, whatever the project's size. While a 60-clip 1080p project (all video clips) plays
      through twice and is scrubbed at 100 random times, at no moment are more decoders open than Q3's number, or
      more decoded frames held than Q3's budget. After the user leaves the video editor, or removes a clip, its
      decoders and frames are released within 1 s. _(self-test)_
- [ ] **AC-13:** Idle costs nothing. With the preview paused and nothing changing for 2 s, the pool decodes no
      frames and holds at most one frame per visible clip. _(self-test)_

### Errors and older browsers

- [ ] **AC-14:** A clip the pool can't decode (unsupported codec, broken file) never stops the other clips. In the
      preview it falls back to how it previews today (Q6), with a note on the clip saying the export can't use it.
      The export refuses it with today's message (naming the file). The error is logged for reports. A browser
      without the decoding the pool needs (Q7) previews as today and exports as today. _(self-test + e2e)_

### Limits for picture-in-picture

- [ ] **AC-15:** The pool is measured with 1, 2, 3, 4 and 6 simultaneous 1080p30 videos (and 2 and 3
      simultaneous 4K30 videos on the desktop app): median and 95th percentile time to have every video's frame
      for a 30 fps step, over 300 steps, and frames held. The numbers are recorded in the plan and in the
      performance doc. The visible-video limits for the web and the desktop app follow from them by Q2's rule,
      before `203`'s plan is approved. At the limit, 300 steps of 1080p30 play in real time: median step ≤ 33 ms and
      95th percentile ≤ 50 ms on the development machine. _(self-test timing, desktop; manual measurement in
      Chrome)_

### Docs

- [ ] **AC-16:** `specs/lld.md` (the pool, look-ahead, frame release, the open-frame check), `docs/PERFORMANCE.md`
      (the AC-15 measurements and the limits), `docs/MEDIA-STUDIO.md` (limits, if they change what users see) and
      `CHANGELOG.md` describe the change. _(manual check)_

## Non-Functional Requirements

- Performance: AC-5, AC-7, AC-10, AC-15. Drawing a frame of a project without video clips costs no more than in
  `202`.
- Memory: AC-11 to AC-13. Open decoders and held frames are bounded by Q3, not by the project's clip count. Every
  decoded frame is released as soon as it has been drawn or encoded, including on cancel and on error.
- What you see is what you get (Constitution VIII): one decoding path for the preview and the export (Q1). The
  paused preview and the export show the same source frame.
- Compatibility: the same behaviour on the web and the desktop app, with lower limits on the web for memory reasons
  only (Constitution V). Browsers without the needed decoding keep today's behaviour (Q7).
- Budgets: the entry chunk is unchanged. The new decoding code loads only with the video editor or the export.
- Accessibility: no new controls. Any new note (AC-14) is text that screen readers announce. Smoother playback
  doesn't change `prefers-reduced-motion` behaviour.
- Privacy: decoding runs on the device. No new network destination.
- Licences: no new library, model or asset.

## Out of Scope

- Compositing several tracks and picture-in-picture (`203`), and enforcing the visible-video limit in editing
  (`203` AC-9). 204 only measures and sets the numbers.
- Transitions (`206`); speed, reverse and freeze frames (`207`). Playing backwards smoothly isn't a goal here.
- Proxies, a frame cache on disk and render-ahead of effects (`211`); the Phase 2 4K gate (`203` Q13, after `211`).
- Sound: the export's windowed sound decoding and mixing, and audio tracks (`208`). Q5 covers preview sync only.
- Photos (decoded images are handled as today), filmstrip thumbnails and reading a clip's length on import.
- New codecs or professional formats (HEVC 10-bit, ProRes: `307`).
- Agent tools (Q8).

## Open Questions

- **Q1** [NEEDS CLARIFICATION] Does the pool serve the preview as well as the export, or only the export (the
  work item names only the export)? _Proposed:_ both. `203` needs several videos drawn together in the preview
  (its AC-12), which separate players can't keep in step. Constitution VIII asks for one path, and a paused preview
  becomes frame-exact (AC-4). The export moves onto the pool in the same feature, so the leak check (AC-11) covers
  the code both use.
- **Q2** [NEEDS CLARIFICATION] How are the visible-video limits set from the measurements? _Proposed:_ the limit is
  the largest count at which 1080p30 meets AC-15's bar (median ≤ 33 ms, 95th percentile ≤ 50 ms) on the
  development machine, minus one for slower machines. It is capped at `203` Q6's proposals of **3 on the web** and
  **6 on the desktop app**, and is never below 2 (main + one overlay) on either. Photos don't count. The numbers
  join the per-platform limits the editor already shows. If the web can't reach 2, `203`'s plan is reconsidered
  before approval.
- **Q3** [NEEDS CLARIFICATION] The memory bounds. _Proposed:_ at most (visible-video limit + 2) decoders open at once.
  That is the visible clips plus the next clip to start within the look-ahead, and one spare for scrubbing. Each
  open clip holds at most 4 decoded frames ahead. Decoded frames held at once stay under **256 MB on the web** and
  **1 GB on the desktop app** (at 4 bytes a pixel, a 1080p frame is about 8 MB and a 4K frame about 33 MB). The
  least recently used decoder is closed first.
- **Q4** [NEEDS CLARIFICATION] What happens when decoding can't keep up? _Proposed:_ preview: hold that clip's last
  frame and keep the playhead on wall-clock time (frames are skipped, never slowed down), as players do. Export:
  wait. The export never skips or repeats a frame because of speed, only where the source itself ends (today's
  "hold the last frame").
- **Q5** [NEEDS CLARIFICATION] Preview sound. Today each clip's sound plays from its own player, resynced when it
  drifts more than 0.3 s. _Proposed:_ how sound plays in the preview isn't redesigned in 204 (audio tracks are
  `208`), but picture and sound must stay within 2 frames (AC-8), tighter than today's 0.3 s.
- **Q6** [NEEDS CLARIFICATION] A clip the pool can't decode, though the browser can play it (some HEVC files, for
  example). _Proposed:_ the preview falls back to today's player for that clip only, with a note "This clip can't be
  exported here" and the reason. The export refuses it with today's message. Nothing that previews today stops
  previewing.
- **Q7** [NEEDS CLARIFICATION] Browsers without the needed decoding (Firefox before 130, Safari before 26).
  _Proposed:_ keep today's preview and export there. No new minimum browser version. The limit for those browsers
  is 1 visible video. `203` then tells the user why it can't add an overlay video clip there.
- **Q8** [NEEDS CLARIFICATION] Constitution XI (agent tools). _Proposed:_ none. 204 adds no user-facing operation,
  only smoother playback, exact frames and limits. The agent's existing export tool gets the same benefits. `212`
  exposes the limits with the timeline tools.
- **Q9** [NEEDS CLARIFICATION] The leak-test fixture and its cost to `npm test`. _Proposed:_ a 2-minute 1080p30 16:9
  YouTube project (Reels on the web stop at 90 s). It has 24 clips of 5 s cut from 3 source clips of 10 s, each
  with a key frame every 2 s like phone video, all made in memory. It also has one hidden-track span and one 1.5 s
  gap. It adds at most 90 s to `npm test` on the development machine. If it adds more, the plan may lower the
  source clips (not the export) to 720p, with the maintainer's agreement.
- **Q10** [NEEDS CLARIFICATION] How far ahead to look. _Proposed:_ the next clip on each track is opened and its
  first frame decoded when its start is less than **2 s** of playback away, or when the playhead is paused within
  2 s before it. The export looks ahead by one clip. Both share Q3's limits.

## Changelog

- 2026-10-08 — Created (Draft).
