---
category: Overlays
---

Full-screen 3D card viewer on a dark gradient: the card turns slowly and can be dragged to rotate, with a gloss sweep and floor shadow. Bar controls: Flip card, Turn slowly, Reset view, Close (Esc also closes). Takes no props; it opens when `ui.viewer` holds `{ front, back, w, h, round }` (image URLs + card mm). `open3D()` renders the current design and opens it.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { Viewer3D, open3D } = window.Chitthi;
open3D();
<Viewer3D />
```
