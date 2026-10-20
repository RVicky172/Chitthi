<!-- Generated from feature.json by `npm run specs:sync`. Edit feature.json (or use `npm run specs`), not this file. -->

# 501 — Studio design overview: one layout and type scale for every studio

**Status:** Implemented
**Roadmap phase:** Phase UI — Studio design and UX (release 3.0.0) · **Created:** 2026-10-20

## Summary

The print studio and the photo & video studio look like two products: the print studio has a numbered step rail with a wide panel of folding sections, the media studio an icon rail with a narrow panel where every section is open and the panel scrolls; type weights, spacing and headers differ between them. Phase 2 and 3 still add panels (markers, captions, colour, scopes …) that will not fit the media studio as it is. 501 is the **design overview** the rest of the phase builds on: one written layout for every studio (top bar, rail, panel, stage, inspector, dock), one type scale, one spacing scale and shared panel parts (panel header, folding section, list row, empty state), with a plan for where every planned panel goes. The print studio is the reference; the media studio moves to it.

## User Stories

- **US-1:** As a user who moves between print and media, I want both studios to look and work the same way, so that the app feels like one product.
- **US-2:** As a video creator, I want the left side for adding things and the right side for changing the selected thing, so that I always know where to look.
- **US-3:** As a maintainer, I want a written layout with room for the panels still planned (markers, captions, colour, scopes), so that new features fit without another redesign.

## Acceptance Criteria

### Design document

- [x] **AC-1:** A design document `docs/DESIGN.md` describes the shared studio layout (top bar, rail, panel, stage, inspector, dock), its widths at each breakpoint (phone, 1280, 1440, ≥ 1920), the type scale (sizes, weights, which text is a heading), the spacing scale, the colour tokens in both themes, and the shared panel parts; screenshots or sketches of each studio show it. The maintainer approves it before 502–506 are planned. _(manual)_
- [x] **AC-2:** The document has a **panel map**: every rail tool and inspector section of the photo, Reel and YouTube modes today, and every panel planned in Phases 2–3 (210 markers and in/out, 305 captions, 301–304 colour, 303 scopes), each placed in the layout (left: add and browse; right: change the selection; dock: time), with a rule for when the rail groups or folds tools so it never needs to scroll at 720 px tall. _(manual)_

### Shared parts

- [x] **AC-3:** The shared panel parts (panel header with title and optional actions, folding section, list row, empty state) exist once in `src/components/` and are used by the print studio and the media studio; the media studio no longer has its own copies (checked by a unit test over the components or a lint rule). _(unit)_

### Alignment

- [x] **AC-4:** The media studio's rail and panel use the print studio's widths, header style (step label, title, short description, Collapse all · Expand all where there are sections) and colour tokens, so the two left sides match; design tokens come from one place (`01-base.css` custom properties), checked by a unit test that the media-studio stylesheets use no raw colour or font-size values outside the tokens. _(unit)_
- [ ] **AC-5:** At 1440 × 900 and 1280 × 720 the left rail and panel of the print studio and of each media mode have the same widths and header positions within 2 px (deferred to 590). _(e2e)_

### Rail

- [x] **AC-6:** **Expandable rail** (both studios, D2): the rail has two widths, **expanded** (icon and label side by side, the Add / Edit group headings shown, about 184 px) and **compact** (icon only, about 64 px; the label is the button's accessible name and tooltip). A button at the foot of the rail (and Ctrl + \) switches between them, with a width animation that is skipped under reduced motion. The rail is **expanded by default** at every window width; when the user makes it compact (or expands it again) the choice is remembered on the device for both studios. Phones (rail across the bottom) are unaffected. Unit-tested on the pure rule that picks the width from the saved choice; the e2e check (both studios, both widths, the stage resizing with it) is deferred to 590. _(unit)_

## Non-Functional Requirements

- **Performance:** no new work on the preview or export path; the entry chunk stays ≤ 350 KB; panels open in under 100 ms.
- **Accessibility:** every control works from the keyboard with a visible focus ring and is announced; axe passes; text contrast ≥ 4.5:1 in the light and dark themes.
- **Compatibility:** web and desktop alike; phones (≤ 640 px) and laptops (1280 × 720) as well as wide screens; every saved project opens unchanged.
- **Free and open source:** no new dependency unless cleared in `specs/licensing.md` first.

## Out of Scope

- The landing page and docs page design.
- New features inside panels (each has its own feature).
- A new visual identity (logo, brand colours): the existing tokens are kept and tidied.

## Open Questions

- **Q1** _(resolved)_ Which studio is the reference? _Answer (accepted 2026-10-20):_ the print studio (numbered steps, wide panel, folding sections, Collapse all · Expand all); the media studio moves to it. Alternative: a new shared design that changes both.
- **Q2** _(resolved)_ Where do tools go when there are more than fit? _Answer (accepted 2026-10-20):_ the rail groups tools under two headings, **Add** (Media, Text, Elements, Draw, Audio) and **Edit** (Transitions, Layers, later Colour, Captions, Markers); below 720 px tall the less used ones move into a **More** menu. Alternative: a scrolling rail.
- **Q3** _(resolved)_ Inspector side? _Answer (accepted 2026-10-20):_ keep the inspector on the right in the media studio (the print studio has none: its panel is the inspector); its sections fold like the left panel's (503).
- **Q4** _(resolved)_ Order and release? _Answer (accepted 2026-10-20):_ build Phase UI next, before 210–212, so they land in the new layout; its test pass (590) runs just before 290, and both ship together as 3.0.0. Alternative: finish Phase 2 first and release Phase UI as 3.1.0 (Phase 3 moves to 3.2.0).

## Changelog

- 2026-10-20 — Created: draft spec with 5 acceptance criteria and 4 open questions with proposed answers (Phase UI, D-063).
- 2026-10-20 — Every proposed answer accepted by the maintainer; Approved.
- 2026-10-20 — Plan drafted (§1–§5, D1–D3 for the maintainer).
- 2026-10-20 — AC-6 added (plan D2, maintainer): the rail keeps the print studio's style with icons and can be expanded or made compact, following the window until the user chooses.
- 2026-10-20 — Plan D2 chosen: A plus the expandable rail (§6).
- 2026-10-20 — AC-6: the rail is expanded by default at every width (the maintainer); compact only when the user chooses it, remembered.
- 2026-10-20 — Plan D1 and D3: option A chosen by the maintainer (D-065); plan Approved; tasks written (T001–T091).
