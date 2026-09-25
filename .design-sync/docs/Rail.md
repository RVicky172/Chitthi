---
category: Screens
---

Vertical step rail (the `.rail` glass column): numbered stepper dots for Photos, Layout, Occasion, Front, Back, Print with passed steps checked, plus a Gallery button that opens the full-screen gallery. Takes no props. The current step is `ui.pane`; clicking a step calls `setUI({ pane })`.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

Designed for an 88px grid column (`.shell` is `88px 420px 1fr`); under 860px it becomes a horizontal scroller.

```jsx
const { Rail, setUI } = window.Chitthi;
setUI({ pane: 'occasion' });
<div style={{ width: 88, height: 560, display: 'flex' }}><Rail /></div>
```
