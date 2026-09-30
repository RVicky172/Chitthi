---
name: print-quote
description: Prepare what to send a print shop for a quote and print run of Chitthi designs - quote request PDFs, print packs, paper and finishing specs - for the current design or saved designs. Use when the user asks for a print quote, price, order sheet, or files for a printer.
---

# Print quote with Chitthi

Use the Chitthi MCP tools (server `chitthi`).

1. **Which designs**: `get_design` for the open one, or `list_saved` and `open_saved` for each design to include.
2. **Check each**: `check_design`. Fix errors (empty slots, soft photos, sheet fit) before asking for prices; mention
   warnings to the user.
3. **Documents** for each design:
   - `export_quote_request`: previews, size, pages, paper, finishing and a blank price grid for 1–500 pieces;
   - `export_print_pack`: the files the shop prints (PDF with 3 mm bleed and crop marks, envelope files, credits).
4. **Specs**: `print_specs` gives the paper, weight, finish, colour sides and finishing per product. Quote them to the
   shop; for postcards, 300–350 gsm art card, 4/4; calendars, 170–250 gsm silk, 4/0, Wire-O bound.
5. **Summarise** for the user: which files to send, the quantity they want (ask if unknown), and what to ask the
   shop for (price per piece at each quantity, turnaround, proof charge, delivery and GST).

Several saved designs can also go in one ZIP from the app itself: Gallery → "Get one quote for several designs"
(an ORDER-SHEET.csv with a price column per quantity plus a quote request per design).
