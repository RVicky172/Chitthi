---
category: Pickers and media
---

Grid of every photo uploaded in this browser (kept across cards in IndexedDB). Tap a photo to put it on the card in the selected slot; photos on the card show their slot badge; the × (tap twice) deletes from the store. Takes no props. Shows a hint when the store is empty.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

Photos enter the store through `addFiles(files)` or `storePhotos([{ name, url }])` (url = image data URL).

```jsx
const { PhotoStore } = window.Chitthi;
<div className="pane" style={{ width: 420 }}><PhotoStore /></div>
```
