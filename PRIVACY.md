# Privacy policy

Chitthi has no accounts, no servers that hold your data, no analytics and no tracking. Your designs, photos and keys
stay on your device. The app talks to other services only for the features listed below, and only when you use them.

*Last updated: 1 October 2026.*

## What stays on your device

| Data | Web app | Desktop app |
| --- | --- | --- |
| Designs, gallery, the card in progress | Browser storage (IndexedDB, `localStorage`) | JSON files in the app's data folder |
| Photos you add, and the photo library | Browser storage (IndexedDB) | JSON files in the app's data folder |
| Fonts you upload | Browser storage | Browser storage inside the app |
| Settings | `localStorage` | `localStorage` inside the app |
| AI and Pexels API keys | This tab only by default, or the browser's `localStorage` if you choose to remember them (not encrypted) | Encrypted by the operating system's key store |

Nothing syncs between devices. To move designs, use **Gallery → Back up gallery** or save a `.chitthi` file. Videos
you export are written only to the file you choose; the photos, clips and music you edit stay where they are on your
device.

## What leaves your device, and when

| Service | When | What is sent |
| --- | --- | --- |
| Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | Web app: every visit, to load the interface and card fonts. Desktop app: only if it was built without bundled fonts | Your IP address and browser details, as with any web request. Google's [privacy policy](https://policies.google.com/privacy) applies |
| Pexels (`api.pexels.com`, `images.pexels.com`) | Only when you search for photos | Your search words and your Pexels key; photos you pick are downloaded to your device. [Pexels privacy policy](https://www.pexels.com/privacy-policy/) |
| The AI service you chose (Anthropic, OpenAI, Google and others) | Only when you ask AI to write words or make a picture | The occasion, language, tone and notes you give, calendar months and festivals, and the names of your photos. **Your photos are not sent.** Picture requests send only the description. The provider's own privacy terms apply |
| Ollama or LM Studio | Only when you use them | The same request, to the server on your own computer |
| The app you pick in the share sheet (for example Instagram) | Only when you tap **Share to Instagram** in Instagram posts | The photos you prepared, handed over by your phone or computer's share sheet. In the desktop app, and where sharing isn't available, the photos are saved to your device and instagram.com opens; nothing is uploaded until you post it there yourself |
| YouTube | Only when you click **Open YouTube upload** after an export | Nothing from Chitthi Studio: it opens youtube.com/upload in your browser, where you choose the file yourself |
| GitHub Releases | Desktop app: on start and when you check for updates | Your IP address and the app version, to find an update |

Chitthi sends nothing else: no usage statistics, no crash reports, no identifiers.

## Error reports

If the app hits an error, it can show an error screen with a **Copy error report** button, and the performance monitor
has **Copy report**. Each report contains the app version, your browser or OS details, recent error messages and
performance figures. It is copied to your clipboard only; nothing is sent. Share it only if you choose to.

## AI agents (MCP)

The desktop app can let an AI agent such as Claude Code drive it: when started with `--mcp`, or when you turn on
**Settings → AI → Let an agent work in this open window**. The agent then sees your designs and can add photos you point
it to. What the agent sends to its own AI provider is governed by that agent and provider, not by Chitthi.

## Deleting your data

- **Web app:** clear this site's data in your browser settings (cookies and site data). This removes designs, photos,
  fonts, settings and keys.
- **Desktop app:** remove keys in **Settings → AI**, then delete the data folder: `%APPDATA%\Chitthi` on Windows,
  `~/Library/Application Support/Chitthi` on macOS. Uninstalling the app does not delete it.

## Self-hosted copies

Anyone may host Chitthi under the MIT License. A self-hosted copy may change what is sent where; this policy covers
the code in [this repository](https://github.com/RVicky172/Chitthi).

## Contact

Questions about privacy: open an issue at https://github.com/RVicky172/Chitthi/issues. Security problems: see
[SECURITY.md](SECURITY.md).
