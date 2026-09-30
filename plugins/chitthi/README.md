# Chitthi plugin for Claude Code

Connects Claude Code to the Chitthi desktop app's MCP tools and adds six skills for common print jobs.

## Install

```text
/plugin marketplace add RVicky172/Chitthi
/plugin install chitthi@chitthi
```

When asked, give the path to the Chitthi app:

- Windows: `%LOCALAPPDATA%\Programs\Chitthi\Chitthi.exe`
- macOS: `/Applications/Chitthi.app/Contents/MacOS/Chitthi`

Install the Chitthi desktop app first from [GitHub Releases](https://github.com/RVicky172/Chitthi/releases). For AI
words and pictures, set up a service in Chitthi's Settings → AI; for Pexels photos, add a Pexels key there too.

## Skills

| Skill | Use it for | Example prompt |
| --- | --- | --- |
| `festival-postcard` | A festival or occasion postcard, words, check and print pack | "Make a Diwali postcard for my Nani in Hindi and export it" |
| `year-calendar` | A 12-month calendar with festivals, captions and a style | "Build an A4 wall calendar for 2027 with a festival photo each month" |
| `print-quote` | Quote requests and print files for a print shop | "Get my saved calendar and postcard ready for a print quote, 100 each" |
| `photo-sourcing` | Pexels photos by the license rules, sharp enough to print | "Find rangoli photos for the two slots, no people" |
| `ai-artwork` | AI pictures shaped for a slot, marked as AI | "Create a watercolour of kites over Jaipur for the photo" |
| `print-samples` | A set of samples across sizes for a test print | "Make 6 postcard samples, 3 sizes, vertical and horizontal" |

The skills use the tools listed in [docs/MCP.md](../../docs/MCP.md). Everything the agent makes is written to
**Documents/Chitthi agent output**.

## Develop

- Validate: `claude plugin validate .` from the repository root (checks the marketplace and this plugin).
- Test locally: `claude --plugin-dir ./plugins/chitthi`.
- The MCP server from source: `npm run mcp`; end-to-end check: `npm run test:mcp`.
