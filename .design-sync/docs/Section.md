---
category: Primitives
---

Collapsible section of a step pane: a heading button with an optional status `note` and a chevron, and a body. Open/closed state is remembered per `id` (and follows Collapse all / Expand all). Build every pane from Sections.

```jsx
const { Section } = window.Chitthi;
<Section id="words-greeting" title="Greeting" note="Shown">…controls…</Section>
```
