---
category: Screens
---

The "Sizes and layouts" page (route `#/sizes`): every size of every product with search and shape/scale filters, trim, bleed and safe area drawn to scale, pixel sizes, sheets per print page, and every layout at the chosen size with the pixels each photo slot needs. Takes no props; reads the current product from the store.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { SizeGuide } = window.Chitthi;
<div style={{ height: '100vh', overflow: 'auto' }}><SizeGuide /></div>
```
