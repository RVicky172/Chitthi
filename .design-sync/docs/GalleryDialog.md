---
category: Overlays
---

Full-screen modal gallery of saved designs (from IndexedDB): name + Save / Save copy bar, filter chips per layout, designs grouped by layout newest first (hover flips a card to its back), and new-card / backup / restore in the footer. Takes no props; it opens when `ui.gallery` is true and closes itself (✕ / Esc) by setting it false.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { GalleryDialog, setUI } = window.Chitthi;
setUI({ gallery: true });
<GalleryDialog />
```
