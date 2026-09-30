# Chitthi for AI agents (MCP)

Chitthi's desktop app is an [MCP](https://modelcontextprotocol.io) server. Agents such as Claude Code, Claude Desktop,
VS Code and Cursor can use its tools to build designs, write words, add photos, check print quality and export
print-ready files, through exactly the same code as the studio. A Claude Code **plugin** adds the server and six
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

- Windows: `%LOCALAPPDATA%\Programs\Chitthi\Chitthi.exe`
- macOS: `/Applications/Chitthi.app/Contents/MacOS/Chitthi`

The plugin starts `Chitthi --mcp` and adds the skills `festival-postcard`, `year-calendar`, `print-quote`,
`photo-sourcing`, `ai-artwork` and `print-samples` ([plugins/chitthi](../plugins/chitthi/README.md)).

### Claude Code: the server only

```bash
# Headless
claude mcp add chitthi -- "%LOCALAPPDATA%\Programs\Chitthi\Chitthi.exe" --mcp          # Windows
claude mcp add chitthi -- /Applications/Chitthi.app/Contents/MacOS/Chitthi --mcp       # macOS

# Live (copy the exact command, with the port and token, from Settings → AI)
claude mcp add --transport http chitthi-live http://127.0.0.1:<port>/mcp --header "Authorization: Bearer <token>"
```

Add `--scope user` to use it in every project.

### Claude Desktop, VS Code, Cursor

```json
{
  "mcpServers": {
    "chitthi": { "type": "stdio", "command": "C:\\Users\\<you>\\AppData\\Local\\Programs\\Chitthi\\Chitthi.exe", "args": ["--mcp"] }
  }
}
```

Claude Desktop: `claude_desktop_config.json`. VS Code and Cursor: their MCP settings file, same `command` and `args`.

### From a source checkout

`npm run mcp` runs the server from source (its own Vite server and cache; stdout carries only the protocol):

```bash
claude mcp add chitthi-dev -- npm --prefix /path/to/Chitthi run --silent mcp
```

`npm run test:mcp` connects the official MCP client to it and runs a build, check, preview and export end to end.

## Tools

Read-only tools are annotated `readOnlyHint`; `save_design` is `destructiveHint` and needs `confirm: true` to
overwrite a saved design. Tools that call the user's AI or Pexels account are annotated `openWorldHint`.

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
| | `add_photo` | A JPG / PNG / WebP from a local path or an https URL |
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

Files a tool makes are written to **Documents/Chitthi agent output** and returned as paths.

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
- Files are written only to the agent output folder; photos are read only if they are JPG / PNG / WebP under 25 MB.
- Overwriting a saved design needs `confirm: true`.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| The server doesn't start from Claude Code | Check the app path (`claude mcp list`); run `"<path>" --mcp` in a terminal to see errors on stderr |
| "The Chitthi agent tools didn’t start" | The hidden page didn't load within 60 s: reinstall, or run `npm run mcp` from source to see page errors |
| Live mode: 401 | The token changes each time live mode is turned on: copy the command again |
| AI tools say "Choose an AI service…" | Set up a service in Chitthi's Settings → AI (the agent uses the same settings) |
| `search_pexels` fails | Add a Pexels key in Settings, or wait for the hourly limit to reset |
