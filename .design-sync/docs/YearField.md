---
category: Primitives
---

Year input with − and + steppers (1900-2200); a half-typed year is kept locally until complete. Controlled: `value`, `onChange(year)`, optional `label`.

```jsx
const { YearField } = window.Chitthi;
<YearField value={2027} onChange={setYear} />
```
