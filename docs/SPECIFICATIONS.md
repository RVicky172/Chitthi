# Print specifications: what they are and how to manage them

Chitthi's "specifications" are the facts a print shop cares about: the products, their trim sizes, the layouts
available at each size, bleed, safe area, resolution and how pieces are laid out on a sheet. They all live as plain
data in `src/data/` and a few constants in `src/engine/`. The renderer, the export, the studio and the in-app guide
read the same data, so changing a value in one place changes it everywhere.

The live, visual version of this document is inside the app: **Sizes and layouts** (ruler icon in the studio
header, the **Sizes** link on the home page, **View → Sizes and layouts** on desktop, or `#/sizes`). It shows each
size drawn to scale with its bleed and safe area, its pixel sizes, how many fit on a sheet, and every layout drawn
at that size with the pixels each photo slot needs.

## Where each specification lives

| Specification | File | Notes |
| --- | --- | --- |
| Products (postcard, calendar, frame, magnet) | `src/data/products.ts` → `PRODUCTS` | Name, switcher label, blurb, back-side label, paper advice for the print spec, default size / layout / export settings |
| Sizes | `src/data/sizes.ts` → `SIZES` | Long and short side in mm, group, which products offer it, corner radius or round shape, Instax photo window |
| Size groups (order in the UI) | `src/data/sizes.ts` → `SIZE_GROUPS` | |
| Layouts (ids, names, product) | `src/data/layouts.ts` → `LAYOUTS` | Order here is the order in the Layout step and the guide |
| Layout geometry | `src/engine/layout.ts` → `computeLayout()` | Photo slots, text zone, calendar title/grid, badge ring; one `case` per layout, horizontal and vertical |
| Bleed choices | `src/components/panes/PrintPane.tsx` | 0, 3 mm, ⅛ in (3.175 mm), 5 mm. Default 3 mm (`DEFAULT_DESIGN.exp` in `src/engine/design.ts`) |
| Resolution | `PrintPane.tsx`, `DEFAULT_DESIGN.exp.dpi` | 300 dpi (print) or 150 dpi (draft) |
| Safe area | `drawGuides()` in `src/engine/render.ts`, print spec in `src/engine/export.ts` | 4 mm inside the trim |
| Sheet sizes for imposition | `src/engine/export.ts` → `SHEETS` | A4, A3, 13×19 in, US Letter; 8 mm sheet margin; 10 mm gap with crop marks, 4 mm without |
| Photos per design | `src/engine/photo.ts` → `maxPhotos()` | 4 (24 for calendars: two per month) |
| Upload limits | `src/engine/photo.ts` | 25 MB per file, JPG / PNG / WebP, processed images capped at 16 MP |
| Calendar options | `CalendarSettings` in `src/types.ts`, defaults in `DEFAULT_DESIGN.cal` | Year, start month, 1 or 12 pages, week start, text placement, captions, title / date / grid style, month font |
| Print spec sheet text | `printSpec()` in `src/engine/export.ts` | The `PRINT-SPEC.txt` in every print pack |
| Envelope sizes | `STANDARD` in `src/engine/envelope.ts` | Standard envelopes by long × short side; each design takes the smallest with 5 mm room |
| Envelope template sheets | `TEMPLATE_SHEETS` in `src/engine/envelope.ts` | A4, Letter, A3, 13×19 in; 5 mm margin |
| Photo fit threshold | `fitsSlot()` in `src/state/photoFit.ts` | A photo suits a slot when the automatic crop keeps at least 80% of it |

## Terms

- **Trim size**: the finished size after cutting; the size the customer orders.
- **Bleed**: picture that runs past the trim on every side and is cut off, so a slightly-off cut shows no white
  edge. Files are exported at trim + 2 × bleed.
- **Safe area**: 4 mm inside the trim. Faces and words should stay inside it.
- **Resolution**: pixels = mm ÷ 25.4 × dpi. A 4×6 in postcard with 3 mm bleed at 300 dpi is 1,871 × 1,271 px.
- **Imposition (sheet PDF)**: as many pieces as fit on the chosen sheet, tried both ways round. Backs are mirrored
  column by column so they line up when printed double-sided and flipped on the long edge.

## Changing specifications

### Add or change a size

1. Add an entry to `SIZES` in `src/data/sizes.ts`:

   ```ts
   { id: 'm2x4', grp: 'Fridge magnets', name: '2×4 in', L: 101.6, S: 50.8, inch: '2×4 in', products: ['magnet'], native: 'portrait', corner: 3 },
   ```

   - `L` / `S`: long and short side in mm. Orientation is chosen by the user; `native` sets the starting one.
   - `products`: which products list it (omitted means postcard only).
   - `corner` (mm) or `shape: 'circle'`: how the finished piece is cut. Corners show in previews only; the file
     stays rectangular for trimming. Round pieces are masked to a circle plus bleed.
   - `tag`: the small label in the size picker ("Most popular").
   - `instax`: only for Instax-style prints (the fixed photo window).
2. Keep `id` stable once released: saved designs store it. `mergeDesign()` falls back to the product's default
   size when an id disappears.
3. Run `npm run docs:specs` to refresh the tables below, then check the size in the guide (`#/sizes`).

### Add a layout

1. Add the id to the `LayoutId` union in `src/types.ts`.
2. Add `[id, 'Name', product]` to `LAYOUTS` in `src/data/layouts.ts`.
3. Add a `case` to `computeLayout()` in `src/engine/layout.ts`. Work in the card box `B` (canvas units):
   - `rs(x, y, w, h)` is a photo slot that bleeds off any edge it touches; `plain(rect, shape)` is an inset slot
     (`rect`, `round`, `circle` or `arch`).
   - Set `L.text` for the words, `L.onPhoto` when they sit on a photo, `L.frame` / `L.bg` for paper or occasion
     background, `L.ink = 'frame'` for dark ink on paper.
   - Handle both orientations (`land` is true for horizontal).
4. Open the Layout step and the guide at a few sizes (small magnet, A3) to check it scales.

### Add a product

1. Add the id to `ProductId` in `src/types.ts`, then an entry in `PRODUCTS` (`src/data/products.ts`) with its
   defaults and paper advice.
2. Give it sizes (`products: [...]`) and layouts.
3. TypeScript then lists every place that needs the new product (`Record<ProductId, …>` maps): icon, landing
   sample, route regex in `App.tsx`, and so on. Add back-side rendering in `renderCard()` if the default postal back
   doesn't fit, and a back pane in `BackPane.tsx`.
4. Add a gallery sample in `src/data/samples.ts` and update the landing page feature list.

### Checklist before releasing a specification change

- `npm run typecheck` and `npm run build` pass.
- The guide (`#/sizes`) shows the size with sensible sheet counts, and every layout renders at that size.
- A print pack exported at 300 dpi opens with the expected page size (trim + 2 × bleed) and crop marks.
- `npm run docs:specs` has been run so this document matches.
- Tell users about renamed or removed ids: old saved designs fall back to defaults.

## Current sizes

Generated from `src/data/sizes.ts` by `npm run docs:specs`. Do not edit between the markers.

<!-- sizes:start -->

### Postcard

| Id | Name | Group | Trim (short × long) | Inches | File with 3 mm bleed | Pixels at 300 dpi | Shape | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `4x6` | Classic 4×6 in | Postcards | 101.6 × 152.4 mm | 4×6 in | 107.6 × 158.4 mm | 1,271 × 1,871 | Square | Most popular |
| `a6` | A6 | Postcards | 105 × 148 mm | 4.1 × 5.8 in | 111 × 154 mm | 1,311 × 1,819 | Square | Popular in India |
| `india` | India Post card | Postcards | 90 × 140 mm | 3.5 × 5.5 in | 96 × 146 mm | 1,134 × 1,724 | Square | Mailable size |
| `5x7` | 5×7 in | Postcards | 127 × 177.8 mm | 5×7 in | 133 × 183.8 mm | 1,571 × 2,171 | Square | Greeting card |
| `6x9` | Jumbo | Postcards | 152.4 × 228.6 mm | 6×9 in | 158.4 × 234.6 mm | 1,871 × 2,771 | Square |  |
| `6x11` | Oversized | Postcards | 152.4 × 279.4 mm | 6×11 in | 158.4 × 285.4 mm | 1,871 × 3,371 | Square |  |
| `dl` | DL slim | Postcards | 99 × 210 mm | 3.9 × 8.3 in | 105 × 216 mm | 1,240 × 2,551 | Square |  |
| `sq` | Square | Postcards | 139.7 × 139.7 mm | 5.5×5.5 in | 145.7 × 145.7 mm | 1,721 × 1,721 | Square |  |
| `imini` | Instax Mini | Instax style | 54 × 86 mm | 2.1 × 3.4 in | 60 × 92 mm | 709 × 1,087 | 3 mm corners | 9 on an A4 sheet, starts portrait |
| `isq` | Instax Square | Instax style | 72 × 86 mm | 2.8 × 3.4 in | 78 × 92 mm | 921 × 1,087 | 3 mm corners | 6 on an A4 sheet, starts portrait |
| `iwide` | Instax Wide | Instax style | 86 × 108 mm | 3.4 × 4.3 in | 92 × 114 mm | 1,087 × 1,346 | 3 mm corners | 4 on an A4 sheet, starts landscape |
| `a5` | A5 | Large and custom | 148 × 210 mm | 5.8 × 8.3 in | 154 × 216 mm | 1,819 × 2,551 | Square |  |
| `a4` | A4 | Large and custom | 210 × 297 mm | 8.3 × 11.7 in | 216 × 303 mm | 2,551 × 3,579 | Square | Poster card |

### Calendar

| Id | Name | Group | Trim (short × long) | Inches | File with 3 mm bleed | Pixels at 300 dpi | Shape | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `cal-a4` | A4 wall | Calendars | 210 × 297 mm | 8.3 × 11.7 in | 216 × 303 mm | 2,551 × 3,579 | Square | Most popular, starts portrait |
| `cal-a3` | A3 wall | Calendars | 297 × 420 mm | 11.7 × 16.5 in | 303 × 426 mm | 3,579 × 5,031 | Square | Big and bold, starts portrait |
| `cal-a5` | A5 desk | Calendars | 148 × 210 mm | 5.8 × 8.3 in | 154 × 216 mm | 1,819 × 2,551 | Square | Desk stand, starts landscape |
| `cal-11x17` | Tabloid | Calendars | 279.4 × 431.8 mm | 11×17 in | 285.4 × 437.8 mm | 3,371 × 5,171 | Square | starts portrait |
| `cal-sq12` | Square wall | Calendars | 304.8 × 304.8 mm | 12×12 in | 310.8 × 310.8 mm | 3,671 × 3,671 | Square |  |

### Photo frame

| Id | Name | Group | Trim (short × long) | Inches | File with 3 mm bleed | Pixels at 300 dpi | Shape | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `f4x6` | 4×6 in | Frame prints | 101.6 × 152.4 mm | 4×6 in | 107.6 × 158.4 mm | 1,271 × 1,871 | Square |  |
| `f5x7` | 5×7 in | Frame prints | 127 × 177.8 mm | 5×7 in | 133 × 183.8 mm | 1,571 × 2,171 | Square | Desk frame |
| `f8x10` | 8×10 in | Frame prints | 203.2 × 254 mm | 8×10 in | 209.2 × 260 mm | 2,471 × 3,071 | Square | Most popular |
| `f8x12` | 8×12 in | Frame prints | 203.2 × 304.8 mm | 8×12 in | 209.2 × 310.8 mm | 2,471 × 3,671 | Square |  |
| `f11x14` | 11×14 in | Frame prints | 279.4 × 355.6 mm | 11×14 in | 285.4 × 361.6 mm | 3,371 × 4,271 | Square |  |
| `fa4` | A4 | Frame prints | 210 × 297 mm | 8.3 × 11.7 in | 216 × 303 mm | 2,551 × 3,579 | Square |  |
| `fa3` | A3 | Frame prints | 297 × 420 mm | 11.7 × 16.5 in | 303 × 426 mm | 3,579 × 5,031 | Square | Wall frame |
| `fsq8` | Square | Frame prints | 203.2 × 203.2 mm | 8×8 in | 209.2 × 209.2 mm | 2,471 × 2,471 | Square |  |

### Fridge magnet

| Id | Name | Group | Trim (short × long) | Inches | File with 3 mm bleed | Pixels at 300 dpi | Shape | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `m2x3` | 2×3 in | Fridge magnets | 50.8 × 76.2 mm | 2×3 in | 56.8 × 82.2 mm | 671 × 971 | 3 mm corners | Most popular, starts portrait |
| `m2x2` | Small square | Fridge magnets | 50.8 × 50.8 mm | 2×2 in | 56.8 × 56.8 mm | 671 × 671 | 3 mm corners |  |
| `m3x3` | Square | Fridge magnets | 76.2 × 76.2 mm | 3×3 in | 82.2 × 82.2 mm | 971 × 971 | 3 mm corners | Instagram square |
| `m25x35` | Card | Fridge magnets | 63.5 × 88.9 mm | 2.5×3.5 in | 69.5 × 94.9 mm | 821 × 1,121 | 3 mm corners | starts portrait |
| `m3x4` | 3×4 in | Fridge magnets | 76.2 × 101.6 mm | 3×4 in | 82.2 × 107.6 mm | 971 × 1,271 | 3 mm corners | starts portrait |
| `m4x6` | Photo magnet | Fridge magnets | 101.6 × 152.4 mm | 4×6 in | 107.6 × 158.4 mm | 1,271 × 1,871 | 3 mm corners | Big photo, starts landscape |
| `mr58` | Round 58 mm | Fridge magnets | 58 × 58 mm | 2.3 × 2.3 in | 64 × 64 mm | 756 × 756 | Round | Button magnet |
| `mr75` | Round 75 mm | Fridge magnets | 75 × 75 mm | 3 × 3 in | 81 × 81 mm | 957 × 957 | Round | Big badge |

Every product also offers **Custom** (`custom`): any width and height from 40 to 420 mm.

<!-- sizes:end -->

## Current layouts

Generated from `src/data/layouts.ts`. The number of photo slots can depend on orientation and size (for example
Instax and Year strip); the guide in the app shows the exact slots and pixel sizes.

<!-- layouts:start -->

| Product | Layout id | Name |
| --- | --- | --- |
| Postcard | `full` | Full photo |
| Postcard | `magazine` | Cover |
| Postcard | `band` | Photo and band |
| Postcard | `textfirst` | Words first |
| Postcard | `split` | Split |
| Postcard | `sandwich` | Sandwich |
| Postcard | `polaroid` | Polaroid |
| Postcard | `instax` | Instax frame |
| Postcard | `photobooth` | Photo strip |
| Postcard | `arch` | Jharokha arch |
| Postcard | `window` | Window |
| Postcard | `circle` | Circle |
| Postcard | `stamp` | Postage stamp |
| Postcard | `collage2` | Two photos |
| Postcard | `collage3` | Three photos |
| Postcard | `mosaic` | Mosaic |
| Postcard | `collage4` | Four photos |
| Postcard | `offset` | Offset block |
| Postcard | `diagonal` | Diagonal duo |
| Postcard | `scrapbook` | Scrapbook |
| Postcard | `filmstrip` | Film strip |
| Postcard | `minimal` | Minimal |
| Postcard | `twin-arch` | Twin arches |
| Postcard | `text` | Text only |
| Calendar | `cal-top` | Photo above |
| Calendar | `cal-side` | Photo beside |
| Calendar | `cal-full` | Full photo |
| Calendar | `cal-duo` | Two photos |
| Calendar | `cal-plain` | Dates only |
| Calendar | `cal-strip` | Year strip |
| Photo frame | `frame-single` | Single photo |
| Photo frame | `frame-caption` | Photo and caption |
| Photo frame | `frame-duo` | Pair |
| Photo frame | `frame-trio` | Triptych |
| Photo frame | `frame-grid` | Grid of four |
| Photo frame | `frame-feature` | Feature and two |
| Fridge magnet | `mag-full` | Full photo |
| Fridge magnet | `mag-caption` | Photo and caption |
| Fridge magnet | `mag-polaroid` | Mini Polaroid |
| Fridge magnet | `mag-badge` | Badge |
| Fridge magnet | `mag-duo` | Two photos |
| Fridge magnet | `mag-grid` | Four photos |
| Fridge magnet | `mag-quote` | Words only |

<!-- layouts:end -->
