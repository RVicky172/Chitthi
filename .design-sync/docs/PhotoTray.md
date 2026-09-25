---
category: Screens
---

Filmstrip of photos for the front of the card: on multi-photo layouts, numbered slot buttons (tap to choose the slot to fill), then the card's photos and the rest of the photo store (tap to put one in the selected slot instantly), and a "+" upload tile. Takes no props; renders nothing on layouts without photo slots.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

It is styled for the dark `Stage` background (translucent white on dark). `Stage` already includes it; render it alone only on a dark surface.

```jsx
const { PhotoTray, setDesign, setPhotos, samplePhoto } = window.Chitthi;
setDesign({ layout: 'collage3' });
setPhotos([samplePhoto(0), samplePhoto(1), samplePhoto(2)]);
<div style={{ background: 'var(--stage)', padding: 12 }}><PhotoTray /></div>
```
