---
category: Step panes
---

The Envelope section of the Print step: "Make a matching envelope" (the smallest standard size the design fits - C6, A7, DL, square…), address-side and flap-side previews dressed in the occasion, See it in 3D, flap style (pointed / straight / curved), envelope paper (occasion / cream / white / kraft), occasion artwork and photo-seal toggles, the postmark year and the return address (plus From / To / address for products without a postal back). The envelope PDFs go into the print pack automatically. Takes no props; settings live in `design.env`.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { EnvelopeSection } = window.Chitthi;
<div className="panel" style={{ width: 420 }}><EnvelopeSection /></div>
```
