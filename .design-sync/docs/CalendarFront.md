---
category: Step panes
---

The calendar's Front step, in collapsible sections: **Style** (Classic, Modern, Minimal, Elegant, Bold presets), **Year** (typed or − / +), **Month title** (font, size, alignment, year on/off), **Dates** (font or the title font, size, bold, Sundays in colour, corner or centred, grid rows / boxes / tiles / none), **Festivals and your dates**, **Words on the months** (a caption per month, Write captions with AI), and **On the photo**. Use it when `design.product === 'calendar'`. Takes no props.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { CalendarFront, switchProduct } = window.Chitthi;
switchProduct('calendar');
<div className="panel" style={{ width: 420 }}><CalendarFront /></div>
```
