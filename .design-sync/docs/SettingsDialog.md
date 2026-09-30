---
category: Overlays
---

Modal settings dialog: **Pexels photo search** (API key with test, search on/off), **AI writing and pictures** (keys and services per provider, the service and model that writes words and the one that makes pictures, Load my models, daily limits, connect an AI agent over MCP on desktop), **Your fonts** (upload TTF/OTF/WOFF/WOFF2, delete) and **About**. Takes no props; it opens when `ui.settings` is true and closes itself (✕ / Esc) by setting it false.

All Chitthi components share ONE app store. Drive them with the exported setters (`setUI`, `setDesign`, `setBack`, `setPhotos`, `switchProduct`, `applyTheme`) - not props. Call `installFontLinks()` once at startup so canvas card text renders in the card fonts.

```jsx
const { SettingsDialog, setUI } = window.Chitthi;
setUI({ settings: true });
<SettingsDialog />
```
