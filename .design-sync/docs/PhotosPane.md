---
category: Step panes
---

Step 1 of the studio: the upload drop zone, how many photos the layout holds, the Photo store grid, the card's photo list (zoom, look filter, crop, reset, make first, remove) and the photo-quality guide. Takes no props.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

Panes are 420px-wide scrolling columns (`.pane` inside the glass `.panel`); each ends with a dark "Next" button that calls `setUI({ pane })`.

```jsx
const { PhotosPane, setPhotos, samplePhoto } = window.Chitthi;
setPhotos([samplePhoto(0), samplePhoto(2)]);
<div className="panel" style={{ width: 420 }}><PhotosPane /></div>
```
