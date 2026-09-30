---
category: AI
---

"Write with AI" button that opens the AI writing panel under it: language (English, Hindi, Hinglish, regional scripts), tone and notes, then 3-5 suggestions sized to the layout; picking one applies it (Undo works). `mode`: `'card'` (greeting, quote, signature), `'captions'` (one caption per calendar month) or `'message'` (the postcard back). Uses the user's own AI service from Settings → AI; without one the panel says how to set it up. The panel and AI code load only when the button is clicked.

```jsx
const { AiWordsEntry } = window.Chitthi;
<AiWordsEntry mode="card" />
```
