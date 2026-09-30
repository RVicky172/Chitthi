---
name: photo-sourcing
description: Find and add suitable photos for a Chitthi design from Pexels while following the Pexels license and API guidelines (credits, no unaltered resale, people and endorsement rules), and check they print sharply. Use whenever a design needs stock photos.
---

# Photos from Pexels, by the rules

Use the Chitthi MCP tools (server `chitthi`). Pexels search needs the user's own Pexels key in Chitthi's Settings.

## Steps

1. `get_design` and `list_layouts` to know how many slots there are and their shapes.
2. For each slot: `select_slot`, then `search_pexels` with specific words (e.g. "diwali diya lamps", "holi colour
   powder bowls") and the slot's orientation (`landscape`, `portrait` or `square`).
3. Pick the best result and `add_pexels_photo` with its id. Chitthi keeps "Photo by X on Pexels" with the photo and
   writes PHOTO-CREDITS.txt into the print pack.
4. `list_photos`: replace any photo under 150 dpi in its slot (search again, or pick a larger original).

## Rules (Pexels license and API guidelines)

- Credit photographers: never remove or change the credit Chitthi keeps.
- Don't sell unaltered copies of a photo as a print, poster or physical product. A design with words, a layout or
  artwork around the photo is fine; a bare full-bleed photo for sale is not. `check_design` warns about it.
- Identifiable people must not be shown in a bad light, and must not seem to endorse anything. Prefer photos without
  people unless the user asks; for festivals, objects (diyas, rangoli, kites, lanterns) and places work well.
- Don't use photos as a logo or trademark, and don't redistribute them on stock or wallpaper sites.
- Search sparingly: the key allows about 200 requests an hour. Reuse results instead of repeating searches.

Full rules: the `chitthi://rules/photos` resource.
