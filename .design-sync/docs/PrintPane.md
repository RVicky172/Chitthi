---
category: Step panes
---

Step 6 "Print and export": the Print pack call-out (one ZIP: separate front/back PNGs, the print PDF and a PRINT-SPEC.txt), bleed and resolution, PDF quality, crop marks, include-back, PDF type (print-shop / sheet / PNG only), sheet size, a live size summary, and printing tips. Takes no props.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { PrintPane, setExp } = window.Chitthi;
setExp({ bleed: '3', format: 'pdf' });
<div className="panel" style={{ width: 420 }}><PrintPane /></div>
```
