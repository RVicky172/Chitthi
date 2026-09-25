---
category: Step panes
---

Step 2: orientation, the layout grid (live thumbnails with a photo-count badge), product options (calendar year / start month / 12-or-1 months / week start; frame mat width), frame / mat / paper colour, and the size grid for the current product. Takes no props; content depends on `design.product`.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { LayoutPane, switchProduct } = window.Chitthi;
switchProduct('frame');
<div className="panel" style={{ width: 420 }}><LayoutPane /></div>
```
