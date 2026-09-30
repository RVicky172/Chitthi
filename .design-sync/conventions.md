# Chitthi – how to build with it

Chitthi is a print studio for postcards, calendars, framed photo prints and fridge magnets (warm paper look: cream cards `--panel` on a warm cream ground `--bg`, umber-brown accent `--accent`; the dark theme is grey with a saffron accent). Everything is on `window.Chitthi`.

## Setup (do this first)

- `styles.css` loads everything: the UI fonts (Geist, Instrument Serif, Hind via Google Fonts) and the app stylesheet. Without it components render as unstyled HTML.
- Call `installFontLinks()` once at startup. Card artwork is drawn on `<canvas>` in 46 card fonts (Rozha One, Kalam, Baloo 2…) that load on demand; skip this and card text falls back to system fonts.
- **Components take (almost) no props: they all read ONE shared app store.** Put data in with the setters, before rendering:
  `setDesign({...})`, `setBack({...})`, `setExp({...})`, `setPhotos([...])`, `setUI({ pane, side, screen, gallery, slot })`, `applyTheme('diwali' | 'holi' | 'bday' | 'monsoon' | …)`, `switchProduct('postcard' | 'calendar' | 'frame' | 'magnet')`.
- The store persists to localStorage/IndexedDB. Start a mockup from a clean card: `replaceCard(productDesign('postcard'), [], null)`.
- Need photos? `samplePhoto(0..3)` returns ready-made landscape photos for `setPhotos`.
- The full studio (`App`, or `Header` + `Rail` + a pane + `Stage`) must sit in a **full-height flex column** (`height: 100vh; display: flex; flex-direction: column`) – otherwise the stage grows past the viewport and the card is drawn off-screen. `App` also syncs `location.hash` (`#/studio` = studio, empty = landing).
- Dialogs are driven by state, not rendered open: `setUI({ gallery: true })` → `GalleryDialog`; `setUI({ settings: true })` → `SettingsDialog`; `setUI({ library: true, libraryTab: 'mine' | 'pexels' | 'ai' })` → `PhotoLibrary`; `setUI({ finder: true })` → `FeatureFinder`; `setUI({ cropId })` → `CropDialog`; `open3D()` → `Viewer3D`; `toast('…')` → `Toast`.
- Step panes are stacks of collapsible `Section`s (`<Section id title note>`). For calendars use `CalendarFront` as the Front step (after `switchProduct('calendar')`).
- AI is optional and uses the user's own key: `AiWordsEntry mode="card" | "captions" | "message"` and `AiArtworkEntry` are the "✦ Write with AI" / "Create a picture with AI" buttons that open their panels; place them under the fields they fill. Without a service chosen in Settings → AI the panels explain how to set one up.

## Styling idiom: CSS classes + CSS custom properties

Use the app's classes for your own layout glue; never hard-code colours – use the tokens.

| Family | Classes |
|---|---|
| Surfaces | `.panel` (white card column), `.pane` (padded step content), `.bar` (top bar), `.stage` (dark slate preview box), `.pill` (dark chip on the stage) |
| Buttons | `.btn`, `.btn.primary` (umber gradient `--grad`, cream text `--on-accent`), `.btn.ghost`, `.btn.icon`, `.btn.big`, `.btn.next` (dark "Next: …") |
| Controls | `.seg` (segmented), `.switch`, `.check`, `label.f` (label above input), `.chip` / `.chips` |
| Layout | `.grid` (auto-fill tiles), `.row` (two columns), `.inline` (wrapping row), `.sec` (a `Section`) |
| Tiles | `.tile` + `.theme` / `.layout` / `.size`, `aria-pressed="true"` = selected |
| Text | `.eyebrow`, `.lead`, `.hint`, `.kicker`, `.summary`, `.tips`, `.empty`, `.wordmark` |
| Landing | `.lsec`, `.product` |

Tokens: `--bg --panel --glass --glass-hi --glass-edge --glass-shadow --sunk --field --field-hover --text --muted --line --line-strong --accent --on-accent --accent-soft --grad --glow --ink --danger --good --warn --stage --shadow --elev-1 --elev-2 --elev-3 --r-lg --r-md --r-sm --ease --dur-fast --dur --font --display --mono` (`--glass*` are solid card colours now). Text on an `--accent` fill uses `--on-accent`. Landing and brand headings use `font-family: var(--display)` (Instrument Serif); studio titles and body text use `var(--font)` (Geist).

Icons (`DownloadIcon`, `SaveIcon`, `GalleryIcon`, `ProductIcon id="calendar"`, `PaneIcon id="photos"`, `ArrowIcon`, `TrashIcon`…) are Lucide line icons in `currentColor`, 24px by default: inside a `.btn` they shrink to 17px, inside `.sbtn` to 14px; elsewhere set width/height on a wrapper.

## Where the truth lives

`styles.css` → `_ds_bundle.css` is the complete app stylesheet (tokens are at the top, light and dark). Each component's `<Name>.prompt.md` says which store fields drive it.

## Example

```jsx
const { Pane, Seg, Check, DownloadIcon, setExp } = window.Chitthi;
function ExportStep() {
  const [bleed, setBleed] = React.useState('3');
  const [marks, setMarks] = React.useState(true);
  return (
    <div className="panel" style={{ width: 420 }}>
      <Pane title="Print and export" lead="One ZIP for the print shop.">
        <Seg label="Bleed" value={bleed} options={[['0', 'None'], ['3', '3 mm'], ['3.175', '⅛ in']]}
             onChange={(v) => { setBleed(v); setExp({ bleed: v }); }} />
        <Check checked={marks} onChange={setMarks}>Crop marks</Check>
        <button className="btn primary" type="button"><DownloadIcon />Print pack</button>
      </Pane>
    </div>
  );
}
```
