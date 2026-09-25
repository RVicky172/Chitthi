---
category: Screens
---

The complete Chitthi app: the landing page, or (when `ui.screen` is `'studio'`) the studio with the step rail, the step panes and the live preview, plus every overlay (gallery, crop, 3D viewer, toast). Takes no props.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

It also syncs `ui.screen` with the URL hash (`#/studio`, `#/studio/calendar`), so mounting it changes `location.hash`. Use it for full-app mockups; for a single screen compose `Header`, `Rail`, `Stage` and a pane instead.

```jsx
const { App, setUI, setPhotos, samplePhoto, installFontLinks } = window.Chitthi;
installFontLinks();
setPhotos([samplePhoto(0), samplePhoto(1)]);
setUI({ screen: 'studio', pane: 'layout' });
<App />
```
