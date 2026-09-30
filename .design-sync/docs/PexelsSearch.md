---
category: Pickers and media
---

Free photo search on Pexels for the selected photo slot: search box, suggested searches from the occasion / month / product, results filtered to the slot's shape, each with a linked "Photo by … on Pexels" credit; picking one downloads it with its credit and puts it on the card. Needs the user's Pexels key (Settings); without one it explains how to add it. `wide` lays results out for the full-screen library.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { PexelsSearch } = window.Chitthi;
<div className="panel" style={{ width: 420 }}><PexelsSearch /></div>
```
