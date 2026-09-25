---
category: Step panes
---

Step 5 "Back", per product: postcards get message, handwriting font, from, to, address, PIN, stamp box and "Post card" heading; calendars get the year-at-a-glance title; photo frames get an optional dedication label. Takes no props; the variant follows `design.product`.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { BackPane, setBack } = window.Chitthi;
setBack({ message: 'Dear Nani,\nHappy Diwali from all of us!', from: 'Meera', to: 'Nani' });
<div className="panel" style={{ width: 420 }}><BackPane /></div>
```
