---
category: Overlays
---

Bottom-centre pill notification (dark frosted glass) that slides up for a few seconds. Takes no props; show a message with `toast('Saved to your gallery.')`.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { Toast, toast } = window.Chitthi;
<Toast />  // then: toast('Downloading chitthi-diwali-4x6-print-pack.zip')
```
