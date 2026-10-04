# Troubleshooting

Common problems and how to fix them. AI messages have their own table in [AI.md → Troubleshooting](AI.md#troubleshooting).
If nothing here helps, open an [issue](https://github.com/RVicky172/Chitthi/issues/new/choose) and attach the error
report (below).

## Getting an error report

- **Error screen** ("Something went wrong"): click **Copy error report**, then **Reload Chitthi**. Your card is
  autosaved and comes back.
- **Anything else:** open **More → Performance monitor**, use the app until the problem happens, then **Copy report**.
  It includes recent errors.

Reports stay on your clipboard; nothing is sent automatically. Read one before you share it.

## Installing the desktop app

| Problem | Fix |
| --- | --- |
| Windows: "Windows protected your PC" (SmartScreen) | The build isn't code-signed yet. Check you downloaded it from the [official releases page](https://github.com/RVicky172/Chitthi/releases), then **More info → Run anyway** |
| macOS: "Chitthi is damaged" or "can't be checked" | The build isn't notarized yet. Check you downloaded it from the official releases page, then right-click the app → **Open** |
| Updates don't arrive | Help → **Check for updates…**. Updates come from GitHub Releases, so a network that blocks `github.com` blocks them |

## Photos

| Problem | Cause and fix |
| --- | --- |
| "… couldn't be read" or "HEIC photos … can't be opened" | JPG, PNG and WebP are supported (and camera RAW in the photo studio). On iPhone, save the photo as JPEG first, or set Settings › Camera › Formats › Most Compatible |
| A RAW file opens small or looks like the camera's JPEG | In a browser, a RAW file opens the JPEG preview stored inside it. The desktop app develops the full RAW in 16 bits |
| "The RAW developer isn't installed" (desktop, from source) | Run `npm run fetch:libraw` once; installed apps include it |
| A Sky mask asks to download a model | The sky model (176 MB) isn't shipped with the app. Choose **Download the sky model** once; it is kept on the device. Subject and background masks need no download |
| "The download stopped" or "The model couldn't be downloaded" | Check the connection and try again; a download that sends nothing for a minute is stopped. A self-hosted web app must allow `huggingface.co` and `*.hf.co` in its CSP |
| TIFF (16-bit) isn't in the export list | It needs graphics-card effects (**Settings → Photo & video effects**) on a GPU that can render in floats; otherwise use PNG |
| Photo effects are slow | Turn on **Settings → Photo & video effects** so they run on the graphics card |
| A photo prints soft | It has too few pixels for the size. The Photos step shows the dpi: aim for 300, accept 200 |
| Photo search asks for a key | Add a free Pexels key in **Settings**, or hide photo search there |
| "Pexels didn't accept that API key" | Copy the key again from your Pexels account; keys are case-sensitive |
| Pexels search stops for a while | Pexels allows a set number of searches an hour; Chitthi waits for the limit to reset |

## Saving and storage

| Problem | Cause and fix |
| --- | --- |
| The gallery isn't available in this browser | Private or incognito windows and some privacy settings block storage. Use a normal window, or the desktop app |
| Designs disappeared (web) | Clearing site data or browser cleanup tools delete them. Back up regularly with **Gallery → Back up gallery** |
| Saving fails | Delete photos you no longer need from the photo library, or move to the desktop app (no browser limit) |
| Moving designs to another computer | **Gallery → Back up gallery**, then **Restore a backup** on the other device; or save single `.chitthi` files |

## Video (Reels and YouTube)

| Problem | Fix |
| --- | --- |
| "… couldn't be played here" when adding a video | Usually an iPhone HEVC video on a computer without an HEVC decoder. Convert it to MP4 (H.264), or set Settings › Camera › Formats › Most Compatible on the phone |
| The browser says the video is too long, or a file too large | Browser limits: Reels 90 s, YouTube 15 min at 1080p. The desktop app allows up to 3 hours, 4K and 60 fps |
| Export is slow or stalls | Keep the tab in front (browsers slow down background tabs), close other heavy tabs, or use the desktop app, which uses the graphics card |
| No sound in the exported video | The clip's sound is muted or at 0% in its inspector, or the clip has no sound track; music added in Audio is mixed in |
| Firefox or Safari can't export | Video encoding there depends on the version. Use Chrome, Edge or the desktop app |

## Printing

| Problem | Fix |
| --- | --- |
| White edges after trimming | Send the files with bleed (the print pack's `*-print.pdf`), not the trim-size PNG |
| Colours look duller on paper | Screens are brighter than paper. Turn on **Print colours** above the preview (in the **View** menu on phones) for an approximate preview |
| The print shop asks for specifications | Each print pack includes `PRINT-SPEC.txt` and a quote request PDF |

## Web app on your own server

| Problem | Fix |
| --- | --- |
| Works offline only after a reload, or not at all | The service worker needs HTTPS on a real domain ([OPERATIONS.md](OPERATIONS.md#tls-and-hsts)) |
| A custom AI service is blocked | Add its origin to `connect-src` in `nginx/security-headers.conf` and rebuild |
| Ollama or LM Studio can't be reached from the web app | Allow the site's origin: start Ollama with `OLLAMA_ORIGINS` set to it, or turn on CORS in LM Studio |
