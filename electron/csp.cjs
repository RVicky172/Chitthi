/*
 * The Content Security Policy of the desktop app's page (served with every app:// HTML file by main.cjs). Its own
 * module so the unit tests can read it without starting Electron.
 */

// Google Fonts stay allowed as a fallback for builds made without `npm run fetch:fonts`.
const CSP = [
  "default-src 'self'",
  // AI masks run their model with WebAssembly (ONNX Runtime Web), which needs 'wasm-unsafe-eval' (no JavaScript eval).
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Pexels photo search (with the user's own key) and the photos it downloads.
  "img-src 'self' data: blob: https://images.pexels.com",
  // ...and the sky model, downloaded once from Hugging Face (its CDN is *.hf.co) when the user agrees. Saved
  // projects' media is read (decoded) from chitthi-media:, served by electron/media.cjs (408).
  "connect-src 'self' data: blob: chitthi-media: https://api.pexels.com https://images.pexels.com https://huggingface.co https://*.hf.co",
  // The video editor plays local clips and music from blob: URLs, and saved projects' media from chitthi-media:; the
  // video encoder starts blob: workers.
  "media-src 'self' blob: chitthi-media:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ');

module.exports = { CSP };
