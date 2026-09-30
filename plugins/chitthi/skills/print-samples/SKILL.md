---
name: print-samples
description: Produce a set of Chitthi sample designs for a print shop test run - several sizes and orientations of postcards and calendars with festival photos, blank backs, matching envelopes and quote documents. Use when the user wants samples, a test print batch, or to compare print shops.
---

# Print samples for a test run

Use the Chitthi MCP tools (server `chitthi`). A good sample set covers each size and orientation the user sells.

1. Agree the set with the user, for example: postcards 4×6, A6 and 5×7, each vertical and horizontal; calendars
   A4, A3 and A5 desk, each vertical and horizontal.
2. For each sample:
   - `new_design`, `set_size` (with `orient`), `set_theme` or a calendar `style`;
   - photos by the `photo-sourcing` or `ai-artwork` skill;
   - words by `write_words` / `write_calendar_captions`;
   - leave postcard backs blank (`set_back` with an empty message) so the shop prints the ruled postal back;
   - envelopes: `update_design` with `{"env": {"on": true}}` to include the matching envelope in the pack;
   - `check_design`, `render_preview`, then `export_print_pack` and `save_design` with a name like
     "P1 Diwali 4x6 vertical".
3. Quotes: `export_quote_request` per sample, or in the app Gallery → "Get one quote for several designs" for one
   order sheet covering all of them.
4. Summarise the files and the paper spec per product (`print_specs`) for the user to send to print shops.

Developers can rebuild the repository's full sample folder with `npm run build:print-samples`.
