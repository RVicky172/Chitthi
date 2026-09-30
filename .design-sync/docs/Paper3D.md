---
category: Screens
---

The "Paper sizes in 3D" page (route `#/paper`): every size on a cutting mat at true relative scale, each showing a real design (postcards, calendars, frames, magnets, envelopes, print sheets, a bank card and coin for reference). Side by side / stacked / on a print sheet, drag to orbit, zoom, camera presets, actual size. Takes no props.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { Paper3D } = window.Chitthi;
<div style={{ height: '100vh' }}><Paper3D /></div>
```
