---
category: Overlays
---

Command palette (Ctrl+K / ⌘K): a search box over every setting and action in the studio (steps, sections, exports, 3D, photo tools, AI writing and pictures, settings); Enter or click jumps to the feature and opens its section. Takes no props; opens when `ui.finder` is true.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { FeatureFinder, setUI } = window.Chitthi;
setUI({ finder: true });
<FeatureFinder />
```
