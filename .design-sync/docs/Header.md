---
category: Screens
---

Studio top bar (a `.bar` glass strip): logo + wordmark (goes home), the product switcher (Postcard / Calendar / Photo frame), theme toggle, undo/redo, "Save to gallery" and the primary "Print pack" download. Takes no props.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

Place it first in a full-height column (`#root` is a flex column); it is 64px tall with 12px margins. The active product comes from `design.product` - change it with `switchProduct('calendar')`.

```jsx
const { Header, switchProduct } = window.Chitthi;
switchProduct('calendar');
<Header />
```
