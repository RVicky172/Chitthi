# Third-party notices

Chitthi's own code is under the [MIT License](LICENSE): free for everyone to use, copy, change and share,
including commercially. It includes or uses the following, each under its own licence. The rules for adding to this
list are in [specs/licensing.md](specs/licensing.md).

| Component | Licence | Notes |
| --- | --- | --- |
| [React](https://react.dev) (`react`, `react-dom`) | MIT | UI library |
| [jsPDF](https://github.com/parallax/jsPDF) | MIT | PDF export |
| [Lucide](https://lucide.dev) icons (`lucide-react`) | ISC | Interface icons |
| [Electron](https://www.electronjs.org), electron-updater | MIT | Desktop app |
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (`@anthropic-ai/sdk`) | MIT | Claude requests for AI writing |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) (`@modelcontextprotocol/sdk`) | MIT | MCP server in the desktop app |
| [Zod](https://zod.dev) | MIT | Used by the MCP SDK |
| [Mediabunny](https://mediabunny.dev) | [MPL-2.0](https://www.mozilla.org/MPL/2.0/) | Video export (MP4 encoding and video decoding). Used unmodified; its source is at https://github.com/Vanilagy/mediabunny |
| [ONNX Runtime Web](https://onnxruntime.ai) (`onnxruntime-web`), with onnxruntime-common, flatbuffers, long, protobufjs, guid-typescript, platform | MIT (flatbuffers, long: Apache-2.0; protobufjs: BSD-3-Clause; guid-typescript: ISC) | Runs the AI mask models on the device |
| [U²-Net-p](https://github.com/xuebinqin/U-2-Net) model (`src/ai/segment/models/u2netp.onnx`) | [Apache-2.0](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE) | Subject masks. Weights by Xuebin Qin et al.; ONNX file from [rembg](https://github.com/danielgatis/rembg) (MIT). Unmodified |
| [skyseg](https://huggingface.co/JianyuanWang/skyseg) model | MIT | Sky masks. Not shipped: downloaded once by the app when the user agrees, from a pinned revision |
| [LibRaw](https://www.libraw.org) 0.22.2 (`dcraw_emu`, desktop app only) | LGPL-2.1 or CDDL-1.0 | Develops camera RAW files. Shipped unmodified as a separate program in the app's `resources/libraw` folder, with its licences and a note on its exact source (https://www.libraw.org/data/LibRaw-0.22.2.tar.gz); you may replace it with your own build |
| Card and UI fonts from [Google Fonts](https://fonts.google.com) | SIL Open Font License 1.1 (a few Apache 2.0) | Bundled in the desktop app; free to use in printed work |
| Sample photos in `public/samples/` | [Pexels License](https://www.pexels.com/license/) | Photographers are credited in `public/samples/samples.json` and in the app |
| Landing page example photos in `showcase-src/` (and their renders in `public/showcase/`) | [Pexels License](https://www.pexels.com/license/) | Photographers are credited in `showcase-src/photos.json` and on the landing page |
| [Hallmark](https://github.com/nutlope/hallmark) Claude Code skill (`.claude/skills/hallmark/`) | MIT | Design guidance for contributors' AI agents. In the repository only, not shipped in the app; licence in the folder |

## Your designs and photos

Designs, photos and files you make with Chitthi are yours. The MIT License covers the software only.

- **Photos found with the Pexels search** are free to use, including in prints you sell, under the Pexels License.
  Don't sell unaltered copies of the photos themselves, and don't suggest that people or brands shown endorse you.
- **AI pictures and words** come from the service you chose, under its terms and your account with it. Chitthi marks
  AI pictures in credits; disclose them as AI-generated where the service or the law requires.
- **Emoji stickers** are drawn with your device's own emoji font (Segoe UI Emoji, Apple Color Emoji or Noto Color
  Emoji), so they look as they do elsewhere on your device.
- **Music you add to a video** must be yours to use; Instagram may mute recognised copyrighted songs.
- **Fonts you upload** stay on your device. Check that their licence allows use in print (most free fonts do).
- **Occasion artwork** drawn by Chitthi (diyas, rangoli, confetti and the rest) is part of the MIT-licensed software, so
  it can be used freely in anything you print.
