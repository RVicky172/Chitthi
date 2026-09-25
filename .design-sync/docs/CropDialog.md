---
category: Overlays
---

Modal photo cropper: drag the crop box and its corner handles on the photo, shape presets, rotate left/right, mirror, reset, and apply. Takes no props; it opens for the photo whose id is in `ui.cropId` (e.g. `setUI({ cropId: getState().photos[0].id })`).

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { CropDialog, setPhotos, setUI, samplePhoto } = window.Chitthi;
const p = samplePhoto(0);
setPhotos([p]);
setUI({ cropId: p.id });
<CropDialog />
```
