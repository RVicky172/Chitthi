---
category: Step panes
---

Step 4 "Front": greeting, quote and signature (each with a show checkbox and theme suggestion chips), the Instagram username (the @ is stripped; drawn at the photo's bottom-right), greeting/quote font pickers, text size, vertical/horizontal alignment, custom text colour, darken-photo and ornament toggles. Takes no props.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { WordsPane, setDesign } = window.Chitthi;
setDesign({ insta: 'meera.clicks' });
<div className="panel" style={{ width: 420 }}><WordsPane /></div>
```
