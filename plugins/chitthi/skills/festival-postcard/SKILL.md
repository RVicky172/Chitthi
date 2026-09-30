---
name: festival-postcard
description: Design a postcard for an Indian festival or personal occasion (Diwali, Holi, Eid, Raksha Bandhan, a birthday…) in the Chitthi app, write its words, check it for print and export the print pack. Use when the user asks for a festival card, greeting postcard or wishes card to print or post.
---

# Festival postcard with Chitthi

Use the Chitthi MCP tools (server `chitthi`). Work in this order and show the user a preview before exporting.

1. **Start**: `new_design` with `product: "postcard"`. Call `list_themes` and `set_theme` with the closest occasion
   (e.g. `diwali`, `holi`, `eid`, `rakhi`, `bday`). If nothing fits, use `plain`.
2. **Size and layout**: 4×6 in (`set_size` `4x6`) is the Indian standard; A6 and India Post card also post well.
   `list_layouts` shows how many photos each layout holds; pick one that fits the photos you have.
3. **Photos**, in this order of preference:
   - the user's own files: `add_photo` with a path (desktop app);
   - free photos: `search_pexels` then `add_pexels_photo` (credits are kept);
   - AI art: `generate_image` (marked as AI-generated).
   Never use photos of real, identifiable people in a bad light or implying endorsement. Don't print a Pexels photo
   unaltered for sale: the words and layout must change it. See the `photo-sourcing` skill.
4. **Words**: `write_words` (pass `language`, e.g. `hi`, `hinglish`, `ta`, and a `tone`) and choose an option with
   `apply`, or write them yourself with `set_words`. Keep the greeting short; the quote one or two sentences. If the
   words are in a non-Latin script, keep fonts that support it (`list_fonts` category `ind` / `reg`).
5. **Back**: `set_back` with a short message, To, address and PIN if the user gave them. Otherwise leave the message
   empty: it prints ruled lines to write by hand.
6. **Check**: `check_design` and fix every error. `render_preview` for the front and the back; fix unreadable text
   (try `set_words` with `textScale`, another layout, or a calmer photo) and awkward crops (`auto_arrange`).
7. **Export**: `export_print_pack` and give the user the file path. It contains the print PDF with bleed and crop
   marks, the quote request and photo credits. `save_design` with a clear name.

Tell the user the print spec in one line: 300–350 gsm card, full colour both sides, 3 mm bleed included.
