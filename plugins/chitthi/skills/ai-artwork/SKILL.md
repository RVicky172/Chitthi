---
name: ai-artwork
description: Create pictures for Chitthi photo slots with the user's own AI image service (OpenAI, Google Gemini, Stability, FLUX, Ideogram…), shaped for the slot, without lettering or real people, marked as AI-generated, and checked for print sharpness. Use when the user wants AI art, a generated background or illustration on a card or calendar.
---

# AI artwork for Chitthi

Use the Chitthi MCP tools (server `chitthi`). Pictures come from the image service the user chose in Chitthi's
Settings → AI, billed to their own account; Chitthi counts each request against a daily limit.

1. Choose the slot: `select_slot` (calendars: `set_calendar_page` first).
2. `generate_image` with a concrete `subject` ("diyas on a marigold-strewn doorstep at dusk") and a `style`:
   `photo`, `watercolour`, `illustration`, `papercut`, `pattern` or `madhubani`. The picture is shaped for the
   slot, leaves calm space where the words sit, and has no lettering, logos or real people (`people: true` allows
   generic people, never a real person).
3. `list_photos`: AI pictures are often 1–4 megapixels. Under 150 dpi in the slot prints soft: choose a smaller slot or
   size, or tell the user.
4. `render_preview` to check the words still read well; adjust with `set_words` (`textScale`) or another layout.

Chitthi names the picture "(AI / Provider model)", lists it in PHOTO-CREDITS.txt and the Print step. Tell the user
that AI pictures are made under their provider's terms and to disclose them where required.
