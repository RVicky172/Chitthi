---
category: Pickers and media
---

Font dropdown: a button showing the current family in its own face, opening a panel with category filters (All, Hindi & Indian, Regional scripts, Display, Script, Serif & sans) and a live-sample list. Controlled: pass `value` and `onChange`. `weight` picks the heading (`'hw'`) or body (`'bw'`) weight for the samples; `only` restricts the list (e.g. `HANDWRITING`).

Call `installFontLinks()` once so the samples render in their fonts.

```jsx
const { FontPicker, installFontLinks } = window.Chitthi;
installFontLinks();
const [font, setFont] = React.useState('Rozha One');
<FontPicker label="Greeting font" value={font} sample="Happy Diwali" weight="hw" onChange={setFont} />
```
