---
name: year-calendar
description: Build a 12-month wall or desk calendar in the Chitthi app with Indian festival dates marked, a photo and caption per month, and a modern style, then export it for printing. Use when the user wants a calendar for a year, a family photo calendar, or a festival calendar.
---

# Year calendar with Chitthi

Use the Chitthi MCP tools (server `chitthi`).

1. **Start**: `new_design` with `product: "calendar"`. `set_size`: `cal-a4` (wall, most popular), `cal-a3`
   (big wall), `cal-a5` (desk), or others from `list_sizes`.
2. **Year and style**: `set_calendar` with `year`, `pages: 12`, `marks: "all"` (national days and festivals) and a
   `style` (`modern` suits most; `classic`, `minimal`, `elegant`, `bold` also exist). Layouts: `cal-bold`
   (big month number, default), `cal-glass`, `cal-arch`, `cal-top`, `cal-full` and more (`list_layouts`).
3. **Festivals**: `list_festivals` for the year. Festival dates are built in for some years only; for others, only
   fixed national days show. Tell the user if their year has no festival data. Eid and Muharram can move by a day.
4. **Photos, month by month**: for each month, `set_calendar_page` (1–12) and add a photo that matches that month's
   festival or season (`add_photo`, `search_pexels` + `add_pexels_photo`, or `generate_image`). Follow the rules in
   the `photo-sourcing` skill. Prefer festival objects and landscapes over people.
5. **Captions**: `write_calendar_captions` (language and tone as the user wants), or `set_calendar` with
   `captions` (January first) for exact wording. Keep each short: it prints above the month.
6. **Check**: `check_design`; `render_preview` on two or three months (`set_calendar_page`) and the back
   (`render_preview` with `side: "back"`, the year at a glance). Fix low-dpi photos (under 150 dpi).
7. **Export**: `export_print_pack` (13 pages: 12 months and the year-at-a-glance back) and `save_design`.

Print spec: 170–250 gsm silk or matt pages, card back page, Wire-O binding on the top edge (desk: on a tent stand).
