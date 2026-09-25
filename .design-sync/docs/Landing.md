---
category: Screens
---

The marketing home page: sticky glass nav, hero with three product CTAs, product cards rendered by the real card engine, "How it works" stepper, print-pack section and footer. Takes no props; buttons call `startProduct('postcard' | 'calendar' | 'frame')`, which switches `ui.screen` to `'studio'`.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

Full-page layout (max width 1200px, 24px gutters, collapses to one column under 960px). Render it as the page root, not inside a panel.

```jsx
const { Landing, installFontLinks } = window.Chitthi;
installFontLinks();
<Landing />
```
