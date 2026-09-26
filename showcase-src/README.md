# Landing page example photos

Source photos for the examples on the landing page, from [Pexels](https://www.pexels.com) under the
[Pexels License](https://www.pexels.com/license/). Photographers are credited in `photos.json` and on the landing
page. These files are **not shipped** with the app: only the rendered examples in `public/showcase/` are.

Refresh or change the set:

```bash
npm run fetch:showcase      # downloads the photos listed in scripts/fetch-showcase.mjs (needs PEXELS_API_KEY)
npm run dev                 # in another terminal
npm run build:showcase      # renders src/data/showcase.ts into public/showcase/*.webp and src/data/showcase.json
```

The designs themselves (layout, theme, words, which photos) are defined in `src/data/showcase.ts`.
