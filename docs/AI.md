# AI writing and pictures

Chitthi can write greetings, quotes, signatures, back messages and the twelve calendar captions, and make pictures for
photo slots, using **the user's own account** with an AI service (bring your own key). There is no Chitthi AI server:
requests go straight from the app to the service the user chose. AI is optional and off until a service is chosen in
**Settings → AI**.

- In the studio: **Write with AI** (Front: greeting, quote, signature), **Write captions with AI** (calendar Front),
  **Write the message with AI** (Back), and **Create a picture with AI** (Photos step, and the library's
  **Create with AI** tab).
- For agents: the same features as MCP tools (`write_words`, `write_calendar_captions`, `generate_image`). See
  [MCP.md](MCP.md).

## Services

| Service | Words | Pictures | Web app | Desktop app | Notes |
| --- | --- | --- | --- | --- | --- |
| Anthropic Claude | ✓ | — | ✓ | ✓ | Official Anthropic SDK; default model `claude-opus-5-5`; structured JSON output; server-side fallback on refusals (can be turned off) |
| OpenAI | ✓ | ✓ | ✓ | ✓ | Chat Completions (JSON schema) and the Images API |
| Google Gemini | ✓ | ✓ | ✓ | ✓ | `generateContent` with a response schema; image models with an aspect ratio |
| OpenRouter, Groq, DeepSeek, Mistral, Together | ✓ | — | ✓ | ✓ | OpenAI-compatible adapter |
| Ollama, LM Studio (on your computer) | ✓ | — | ✓* | ✓ | Free and private. *Web: allow the site in the server's CORS setting (`OLLAMA_ORIGINS`) |
| Other OpenAI-compatible service | ✓ | — | ✓* | ✓ | Enter its base URL. *Web: its host must be in the deployment's CSP |
| Stability AI | — | ✓ | ✓ | ✓ | Stable Image core / ultra / sd3 |
| fal.ai (FLUX and others) | — | ✓ | ✓ | ✓ | Queue API |
| Black Forest Labs (FLUX) | — | ✓ | — | ✓ | No browser (CORS) support |
| Replicate | — | ✓ | — | ✓ | No browser (CORS) support |
| Ideogram | — | ✓ | — | ✓ | Good at lettering. No browser (CORS) support |

Web availability was checked with CORS preflight requests against each API. Services that refuse browser calls
work in the desktop app, where requests run in the main process. Model names in Settings are suggestions:
**Load my models** lists the account's real models from services that offer a models endpoint, and any model name
can be typed.

## Keys and privacy

| | Web app | Desktop app |
| --- | --- | --- |
| Where keys live | This browser's `localStorage`, or `sessionStorage` with "Keep it for this tab only" | `userData/ai-keys.json`, encrypted by the operating system (Electron `safeStorage`). If the OS offers no encryption, keys are kept for the session only |
| Who sends them | The page, adding the key only for the provider's own hosts | The main process (`electron/ai.cjs`). The page can set, check and delete a key but **never read it back** |
| Where keys may go | Only the hosts listed for that provider in `electron/ai-hosts.json` (HTTPS), or the base URL of a local or custom service | Same list, enforced in the main process |

- Only the words the user asks about are sent: the occasion, language, tone, notes, the calendar's months and their
  festivals, and the names of the photos (not the photos). Picture requests send the description only.
- Generated pictures come back to the device and are saved in the photo library like uploads.
- Keys are never in saved designs, backups, `.chitthi` files or print packs.

## Costs and limits

- Each service bills the user's own account. Chitthi shows which service and model it will use before each request.
- **Daily limits** (Settings → AI → Limits, default 200 writing and 30 picture requests) stop a mistake or a runaway
  agent from running up a bill. Usage resets each day.
- Rate-limit replies (HTTP 429) are shown as "wait and try again". Chitthi never switches keys to get round a limit.

## How it is built

```
UI (AiWords, AiArtwork, AiSettings)    agent tools (src/agent/tools.ts)
                 └──────────────┬──────────────┘
             src/ai/service.ts  (Facade: writeWords, writeCaptions, writeMessages, generateArt)
                                │  prompts: src/ai/prompts/{words,artwork}.ts (versioned templates)
             src/ai/registry.ts (Registry: lazy import of one adapter per provider)
                                │
             src/ai/providers/*.ts (Strategy/Adapter: TextAdapter.generateJSON, ImageAdapter.generate)
                                │
             src/ai/transport.ts (Bridge: browser fetch with the key, or desktop IPC → electron/ai.cjs)
```

- **Adapters** implement `TextAdapter` / `ImageAdapter` (`src/ai/types.ts`). They describe requests; they never see a
  key. Structured JSON is requested from every text service (JSON schema, JSON mode, or a lenient parse).
- **Prompts** are data with a version string. Word prompts carry a character budget from the layout's text area
  (`textBudget`), so suggestions fit without shrinking. Picture prompts carry the slot's aspect (`slotShape`), where
  the words sit, and a rule against lettering, logos and real people.
- **Memory**: no AI code loads until an AI feature is used (`npm run build` fails if it reaches the start-up bundle).
  Pictures stay as `Blob`s; the chooser shows ≤ 320 px previews; the chosen picture is saved as JPEG and the rest are
  released; one picture job runs at a time; the desktop main process allows 2 requests at once, 40 MB and 3 minutes
  per response.

## Photo credits and disclosure

A generated picture is named `Description (AI / Provider model)`, like Pexels photos carry `(Pexels / Name #id)`.
The library and Photos step show "AI picture · Provider model", the print pack's `PHOTO-CREDITS.txt` lists it, the
Print step explains the provider's terms and disclosure, and postcard backs and frame labels can print
"AI-generated picture" in small type.

- Pictures are generated with no real people's likeness, brands, logos or lettering by default.
- The user's provider terms govern use of the pictures; disclose them as AI-generated where required.
- Pexels rules still apply to Pexels photos: see [PEXELS.md](PEXELS.md).

## Adding a provider

1. `src/data/aiProviders.ts`: add an entry (id, name, kinds, `web: 'direct' | 'desktop'` after a CORS check, key URL,
   suggested models) and the id to `AiProviderId`.
2. `electron/ai-hosts.json`: its auth header and prefix, API hosts, and any result-image hosts.
3. `src/ai/providers/<name>.ts`: export `text` and/or `image` adapters. OpenAI-compatible services need no new file:
   point the registry at `openaiCompat`.
4. `src/ai/registry.ts`: one line in `LOADERS`.
5. Web: add its hosts to `connect-src` in `nginx/security-headers.conf`.
6. `npm test` (the fake-provider checks exercise the service), then a real call from Settings → AI → **Save and test**.

## Troubleshooting

| Message | Cause | Fix |
| --- | --- | --- |
| "Choose an AI service for words in Settings → AI" | No service chosen | Settings → AI → **Writes words** / **Makes pictures** |
| "… works in the Chitthi desktop app only" | The service refuses browser calls | Use the desktop app, or pick another service |
| "… didn’t accept the API key" | Wrong or revoked key | Settings → AI → Keys and services → replace the key |
| "… rate limit was reached" / "out of credit" | Provider limit or balance | Wait, or add credit with the provider |
| "Today’s limit of N … requests is used up" | Chitthi's daily guard | Raise it in Settings → AI → Limits |
| "Couldn’t reach the provider" (Ollama / LM Studio) | Server not running, or CORS | Start it; web app: allow the site's origin |
| "Chitthi won’t send requests for this provider to …" | A URL outside the provider's hosts | Check the base URL (custom services) |
| Picture prints soft | Generated pictures are often 1–4 MP | Use a smaller slot or size; the Photos step shows the dpi |
