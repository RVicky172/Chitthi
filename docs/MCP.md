# Chitthi for AI agents (MCP)

Chitthi's desktop app is an [MCP](https://modelcontextprotocol.io) server. Agents such as Claude Code, Claude Desktop,
VS Code and Cursor can use its tools to build designs, write words, add photos, check print quality and export
print-ready files, and edit photos in the photo studio (colour, masks, presets, LUTs), through exactly the same code
as the studio. A Claude Code **plugin** adds the server and six
workflow **skills** in one step.

MCP needs the desktop app: a web page can't run a server. The web app has the same AI features in the studio.

## Two ways to connect

| | Headless | Live |
| --- | --- | --- |
| Start | The agent starts `Chitthi --mcp` | Settings → AI → **Let an agent work in this open window** |
| Window | None (a hidden page runs the tools) | The open studio: you watch every change and can Undo |
| Transport | stdio | Streamable HTTP on `127.0.0.1`, random port, bearer token |
| Use for | Batch jobs, sample sets, scripting | Designing together with an agent |

### Claude Code: the plugin (recommended)

```text
/plugin marketplace add RVicky172/Chitthi
/plugin install chitthi@chitthi
```

Claude Code asks once for the path to the Chitthi app:

- Windows: `%LOCALAPPDATA%\Programs\Chitthi Studio\Chitthi Studio.exe`
- macOS: `/Applications/Chitthi Studio.app/Contents/MacOS/Chitthi Studio`

The plugin starts `Chitthi --mcp` and adds the skills `festival-postcard`, `year-calendar`, `print-quote`,
`photo-sourcing`, `ai-artwork` and `print-samples` ([plugins/chitthi](../plugins/chitthi/README.md)).

### Claude Code: the server only

```bash
# Headless
claude mcp add chitthi -- "%LOCALAPPDATA%\Programs\Chitthi Studio\Chitthi Studio.exe" --mcp          # Windows
claude mcp add chitthi -- "/Applications/Chitthi Studio.app/Contents/MacOS/Chitthi Studio" --mcp       # macOS

# Live (copy the exact command, with the port and token, from Settings → AI)
claude mcp add --transport http chitthi-live http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

Add `--scope user` to use it in every project.

### Claude Desktop, VS Code, Cursor

```json
{
  "mcpServers": {
    "chitthi": { "type": "stdio", "command": "C:\\Users\\<you>\\AppData\\Local\\Programs\\Chitthi Studio\\Chitthi Studio.exe", "args": ["--mcp"] }
  }
}
```

Claude Desktop: `claude_desktop_config.json`. VS Code and Cursor: their MCP settings file, same `command` and `args`.

### From a source checkout

`npm run mcp` runs the server from source (its own Vite server and cache; stdout carries only the protocol):

```bash
claude mcp add chitthi-dev -- npm --prefix /path/to/Chitthi run --silent mcp
```

`npm run test:mcp` connects the official MCP client to it and runs a build, check, preview and export end to end, then
edits a sample photo in the photo studio and exports it.

## Tools

Read-only tools are annotated `readOnlyHint`; `save_design` is `destructiveHint` and needs `confirm: true` to
overwrite a saved design, as `delete_preset` does to delete a preset. Tools that call the user's AI or Pexels account are annotated `openWorldHint`.

| Group | Tool | What it does |
| --- | --- | --- |
| Catalogue | `list_products` | Products with their default size and layout |
| | `list_sizes` | Sizes of a product, trim in mm and inches |
| | `list_layouts` | Layouts for the current product and how many photos each holds |
| | `list_themes` | Occasion themes with colours, greetings and quotes |
| | `list_fonts` | Font families and their scripts |
| | `list_festivals` | National days and festivals marked on calendars for a year |
| Design | `get_design` | The current design, summarised |
| | `new_design` | Start a postcard, calendar, frame or magnet |
| | `set_size` | Size and orientation |
| | `set_layout` | Layout |
| | `set_theme` | Occasion theme, or `plain` |
| | `set_words` | Greeting, quote, signature, their fonts and text size |
| | `set_back` | Postcard message and address; frame dedication |
| | `set_calendar` | Year, first month, pages, captions, word placement, marked festivals, style preset |
| | `update_design` | Any other setting, validated like a saved design |
| Photos | `list_photos` | Photos with credits and print dpi |
| | `select_slot` | The slot the next photo goes into |
| | `set_calendar_page` | The month page that previews and photos act on |
| | `add_photo` | A JPG / PNG / WebP from a local path or an https URL. Local paths work only while an agent is connected (headless or live) |
| | `search_pexels` | Pexels search (the user's key), results with photographer |
| | `add_pexels_photo` | Add a result, keeping its credit |
| | `auto_arrange` | Match photos to slots and centre crops on subjects |
| AI | `write_words` | Greeting / quote / signature options from the user's AI service; `apply` one |
| | `write_calendar_captions` | One caption per month from its festivals and photo |
| | `generate_image` | A slot-shaped picture, marked as AI-generated |
| Checks and output | `check_design` | Empty slots, soft photos, unaltered Pexels photos, sheet fit, bleed, credits |
| | `render_preview` | PNG of the front or back (≤ 1024 px) |
| | `export_print_pack` | The print pack ZIP |
| | `export_pdf` | Print PDF or sheet PDF |
| | `export_quote_request` | QUOTE-REQUEST.pdf for print shops |
| | `print_specs` | Paper and finishing per product |
| Gallery | `list_saved` | Saved designs |
| | `open_saved` | Open one |
| | `save_design` | Save (copy, or overwrite with `confirm`) |
| Photo studio | `get_photo_batch` | Post format, file type, and each photo's id, framing, changed settings, masks |
| | `add_batch_photo` | A JPG / PNG / WebP or camera RAW (developed in 16 bits by LibRaw) from a local path or an https URL into the batch (up to 20) |
| | `remove_batch_photo` | One photo, or all |
| | `set_photo_options` | Post format (4:5, 1:1, 3:4, 1.91:1, 9:16), file type (JPEG, PNG, WebP, AVIF, 16-bit TIFF where the app can write it), quality, batch limit |
| | `frame_photo` | Fill or fit (with a colour or blurred background), zoom, position, turn, mirror |
| Colour | `adjust_photo` | Look, light, white balance, tone curve, colour mixer, detail, effects, vignette, LUT; one photo or `all` |
| | `white_balance_from_point` | The eyedropper: neutral grey at a point of the frame |
| Masks | `add_mask` | A local adjustment: brush, linear or radial gradient, colour or brightness range, or AI (subject, sky), with its own settings |
| | `edit_mask` | Name, on/off, invert, the mask's settings |
| | `set_mask_part` | Add or change a part (combine with add, subtract or intersect); brush strokes as points |
| | `remove_mask` | A mask or one part |
| | `find_with_ai` | Run the on-device model for a photo's AI parts (subject, sky); `allowDownload` only after the user agrees to the sky model's one-time 176 MB download |
| Presets | `list_presets` | Built-in looks and saved presets with their settings |
| | `apply_preset` | To one photo or `all` |
| | `save_preset` | A photo's colour settings under a name |
| | `delete_preset` | A saved preset (`confirm`) |
| | `export_presets` / `import_presets` | A preset file with the LUTs its presets use |
| | `list_luts` / `import_lut` | Imported 3D LUTs; import from `.cube` text or an https URL |
| Photo output | `render_photo_preview` | PNG of a photo as it will be posted (≤ 1024 px), optionally with a mask shown in red |
| | `export_photos` | Every photo at full size in the chosen format and file type |

Files a tool makes are written to **Documents/Chitthi agent output** and returned as paths.

**Photo studio coordinates.** Mask positions are shares of the photo's own width and height (0–1, before it is turned
or mirrored) and sizes are shares of its width, so masks stay put when the photo is framed differently. Points for
`white_balance_from_point` are shares of the post frame, as seen in `render_photo_preview`. Every setting goes through
the same validators as a loaded file (`mergeAdjust`, `mergeMasks`, `mergeEdit`): numbers are clamped to the panels'
ranges and unknown settings are reported back. In live mode the photo being changed is selected, and every change is
on the photo studio's Undo stack. Video clips get their tools with the multi-track timeline (P2.12).

**Resources:** `chitthi://design/current`, `chitthi://specs/sizes`, `chitthi://specs/layouts`,
`chitthi://print-specs`, `chitthi://rules/photos`.

**Prompts:** `festival_postcard`, `year_calendar`, `print_quote`, `photo_sourcing`, `ai_artwork`: each walks an agent
through a whole job with the tools.

## How it works

```
MCP client ──stdio──► relay (Electron binary in Node mode, electron/mcp-stdio.cjs)
                          │ HTTP POST 127.0.0.1 + token
                          ▼
               electron/mcp.cjs (official MCP SDK, Streamable HTTP, JSON responses)
                          │ IPC 'agent:call' / 'agent:reply'
                          ▼
               page: src/agent/bridge.ts → src/agent/tools.ts → store actions and engine
```

- **One tool registry** (`src/agent/tools.ts`, Command pattern) describes every tool with a JSON Schema and a handler
  that calls existing store actions and engine functions. Calls run one at a time, so parallel agent calls can't
  interleave design edits; in live mode every change is on the Undo stack.
- **Headless**: Electron's main process can't read stdin on Windows, so `Chitthi --mcp` serves MCP on loopback HTTP and
  starts a dependency-free relay with Electron's own binary in Node mode (`ELECTRON_RUN_AS_NODE=1`), which inherits the
  real stdin/stdout. The relay is unpacked from the app archive. The process exits when the client disconnects.
- **Live**: the same server, stateless (a fresh server and transport per request), driving the open window.

## Security

- Loopback only (`127.0.0.1`), a random 192-bit bearer token per session compared in constant time, requests with a
  browser `Origin` or a non-loopback `Host` refused (DNS rebinding), 5 MB request limit. Live mode is off by default
  and stops when turned off or when Chitthi closes.
- No tool returns API keys. AI tools use the keys the user saved in Settings, through the main process.
- Files are written only to the agent output folder; photos are read only if they are JPG / PNG / WebP under 25 MB, or
  camera RAW files under 300 MB.
  LUTs and preset files are passed as text, so no other file can be read by path.
- Overwriting a saved design needs `confirm: true`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The server doesn't start from Claude Code | Check the app path (`claude mcp list`); run `"<path>" --mcp` in a terminal to see errors on stderr |
| "The Chitthi agent tools didn’t start" | The hidden page didn't load within 60 s: reinstall, or run `npm run mcp` from source to see page errors |
| Live mode: 401 | The token changes each time live mode is turned on: copy the command again |
| AI tools say "Choose an AI service…" | Set up a service in Chitthi's Settings → AI (the agent uses the same settings) |
| `search_pexels` fails | Add a Pexels key in Settings, or wait for the hourly limit to reset |
