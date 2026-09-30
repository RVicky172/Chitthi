---
category: Overlays
---

Full-screen photo library: every photo on the device with search, sort (most relevant, newest, oldest, best fit for the slot, most pixels, name), filters by shape, source, colour, light and print quality, and "Fits this slot"; each photo shows its match and print sharpness and can be put on the card, cropped or deleted. Tabs: `ui.libraryTab` = `'mine'` (your photos), `'pexels'` (free photo search) or `'ai'` (create a picture with AI). Takes no props; opens when `ui.library` is true.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { PhotoLibrary, setUI } = window.Chitthi;
setUI({ library: true, libraryTab: 'mine' });
<PhotoLibrary />
```
