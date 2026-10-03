# Design — Chitthi Studio

Locked design system. Future Hallmark runs read this file first; screens defer to it. Amend it on purpose (add a
`## Variants` section) rather than overriding it on one screen.

Palette: the whole app (light, dark, system dark). Layout and voice adopted so far: the print studio (`#/studio`) and
the landing page (home). Still on the older layout (but already in the new colours): the photo & video studio (`.mst`),
the sizes and paper guides, and dialogs. Bring them over one at a time, reading this file first.

## System

- Genre · editorial, utilitarian register ("print shop", "the post")
- Theme · custom "Graphite": warm-neutral greys (chroma ≤ 0.006, hue 90), near-black actions in light mode and
  near-white actions in dark mode. The photos and festival artwork carry the colour, so the interface stays quiet.
  Marigold is the only interface hue, as the highlight on the dark stage. The airmail stripe (`--brand-red` /
  `--brand-ink`) and the postmark are brand details, never interactive.
- Axes · light paper / grotesk sans (Geist) / neutral accent
- Macrostructures
  - App screens · Workbench: tool index · settings column · matte stage, one continuous sheet divided by hairlines.
  - Landing · Narrative Workflow hero: a pinned scroll journey in five beats ("from a photo on your phone to a card in
    the post"), built from real renders and one `--p` scroll value (no video, no library). The hero card is
    `tinted-postcard` in src/data/showcase.ts: a real Chitthi design in own-colours mode (graphite ink, warm paper,
    ochre rule) with the Hand-tinted photo look, so the page shows output a visitor can actually make. Then hands-on sections
    that read the app's own data: a product explorer (tabs, real examples, real sizes and layouts) and a print-ready
    tool (a postcard size drawn to one shared scale with bleed, trim and safe area, its pixels at 300 dpi, and the
    print-pack file names), between Photographic bands of real renders on the `--stage` mat.
  - Content pages (guides) · Long Document.

## Tokens

`src/styles/01-base.css` is the source of truth (no separate `tokens.css`: the app already loads its tokens from
there, in light, dark and system-dark blocks). Every token is OKLCH. Never write a raw colour in a component
stylesheet: add a token.

- Paper and ink · `--bg`, `--panel`/`--glass`, `--sunk`, `--field`, `--text` (near-black), `--muted`, `--line`,
  `--line-strong`
- Accent · `--accent` (graphite: `oklch(22% 0.005 90)` light / `oklch(95% 0.003 90)` dark), `--accent-strong` (hover),
  `--on-accent`, `--accent-soft` (selection tint only)
- Brand only · `--brand-red`, `--brand-ink`: the airmail stripe. Never on buttons, links or selection.
- Stage (dark in both themes) · `--stage`, `--stage-2`, `--stage-rule`, `--stage-ink`, `--stage-muted`,
  `--stage-mark` (crop marks), `--stage-accent` (marigold), `--stage-on-accent`
- Paper sheet · `--sheet`, `--sheet-shadow`, `--sheet-drop` (cut-outs on the mat), `--paper-drop` (cut-outs on paper),
  `--postmark-ink`
- Type · `--font-head` Schibsted Grotesk, bundled with the app (src/assets/fonts, `@font-face` in 01-base.css) so it
  works offline: every heading in the product (landing, studio steps, dialogs, gallery, guides, media studio), 700–800,
  tight tracking: a newspaper grotesk, print heritage,
  `--font` Geist (UI and body), `--mono` Geist Mono (numbers, specs, file names), `--display` Instrument Serif
  (wordmark only)
- Shape and motion · `--r-sm` 8 / `--r-md` 12 / `--r-lg` 16, `--ease`, `--dur-fast` 150 ms, `--dur` 220 ms
- App icon · graphite tile (`#2b2a27` → `#151413`), cream ring, marigold चिट्ठी: `npm run build:favicons`.
- Shadows are never `none` in a token: use `0 0 0 0 transparent`, because tokens are combined in lists
  (`var(--elev-1), 0 0 0 1px …`) and `none` inside a list drops the whole declaration.

## Rules every screen shares

- Surfaces are flush. Columns and strips are separated by 1px `--line` hairlines; no floating cards, no gutters
  around the app frame, no backdrop blur, no glass.
- Primary action · flat `--accent` fill, `--on-accent` text; hover darkens to `--accent-strong`; no gradient, no glow,
  no hover lift. Secondary · `--field` with a `--line-strong` border, or an underlined text link beside the primary.
- Information notes and call-outs sit on `--sunk` (an accent left rule at most); `--accent-soft` is only for selected
  chips and similar small selected states. Red is reserved for errors (`--danger`) and the brand stripe.
- Selection · a 2px accent edge (border + 1px inset), never a pale halo. Current item in a list · 3px accent rule on
  its leading edge (bottom edge when the list runs horizontally).
- Numbers are mono and tabular: step index `01`–`06`, counts, sizes, the slug line under the stage.
- The artwork is the only thing that glows: the stage is a flat matte with crop marks at the card's trim; toolbars
  are outlined groups on `--stage-2`.
- Site nav (home, guides) · tool pages as plain links (current one underlined in the accent), the page's sections in one
  "On this page" dropdown, one primary button, and an airmail stripe (`--brand-red` / `--brand-ink`) along its bottom edge.
- Labels above headings are allowed only for real ordinals ("Step 2 of 6") and stack above the heading.
- Text on paper and sunk paper is at least 4.5:1 (axe runs in the e2e suite and fails the build otherwise).

## Motion stance

- Motion carries state only: the card flip, the progress rule, the snap track between steps, drag-target feedback,
  and the landing journey (scroll position drives it; it never plays by itself).
- No entrance animations on panes, no hover lifts on tiles, no scale on the current step.
- `prefers-reduced-motion: reduce` turns all of these off; the landing journey becomes a still card and a plain list.

## Exports

`01-base.css` is the source of truth. Ask "extend design.md with Tailwind exports" (or DTCG / shadcn) for other formats.
