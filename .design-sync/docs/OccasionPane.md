---
category: Step panes
---

Step 3: the "Add an occasion" switch, then occasion themes grouped as Festivals / Birthdays / Seasons (painted theme tiles), artwork and decoration toggles, or custom plain colours when occasions are off. Takes no props; picking a theme calls `applyTheme(id)`.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { OccasionPane, applyTheme } = window.Chitthi;
applyTheme('diwali');
<div className="panel" style={{ width: 420 }}><OccasionPane /></div>
```
