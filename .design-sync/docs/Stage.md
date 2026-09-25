---
category: Screens
---

The live card preview (dark glass lightbox): Front/Back toggle, print-guides toggle, 3D view, a month switcher for calendars, the rendered card canvas and the `PhotoTray` filmstrip. Takes no props - it renders `design` and `photos` from the store at the side in `ui.side`. Drag a photo on the canvas to reposition it; wheel to zoom.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

Give it a sized box (it fits the card to its container). Typical: the `1fr` column of `.shell`, or a fixed height on phones.

```jsx
const { Stage, setPhotos, samplePhoto, applyTheme } = window.Chitthi;
applyTheme('holi');
setPhotos([samplePhoto(1)]);
<div style={{ height: 620, display: 'flex' }}><Stage /></div>
```
