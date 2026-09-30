import { AI_LANGUAGES, providerDef, type AiKind, type AiProviderId } from '../data/aiProviders';
import { marksFor } from '../data/holidays';
import { MONTHS } from '../data/products';
import { themeById } from '../data/themes';
import { calPages, cardMM } from '../engine/design';
import { computeLayout } from '../engine/layout';
import { calMonth } from '../engine/render';
import { shortName } from '../lib/credits';
import type { Design, Photo } from '../types';
import { artPrompt, type ArtContext, type ArtStyle } from './prompts/artwork';
import { captionsPrompt, messagePrompt, wordsPrompt } from './prompts/words';
import { contextFor, loadProvider, runsHere } from './registry';
import { hasKeySync, keyStatus } from './secrets';
import { aiSettings, spend } from './settings';
import { AiError, nearestAspect, type Aspect } from './types';

/*
 * The one entry point for AI features (Facade): the studio, the agent tools and the MCP server call these functions
 * and never touch providers directly. Each call picks the provider chosen in Settings → AI, checks it can run here
 * and has a key, counts against the daily limit, and turns the design into a prompt with the right length budget.
 */

export interface Readiness {
  ready: boolean;
  provider?: AiProviderId;
  providerName?: string;
  model?: string;
  /** Why it isn't ready, in words for the user. */
  reason?: string;
}

/** Whether words (text) or pictures (image) can be made now, and with what. */
export function aiReady(kind: AiKind): Readiness {
  const s = aiSettings()[kind];
  if (!s.provider) return { ready: false, reason: `Choose an AI service for ${kind === 'text' ? 'words' : 'pictures'} in Settings → AI.` };
  const def = providerDef(s.provider);
  if (!def) return { ready: false, reason: 'The chosen AI service is no longer available. Choose another in Settings → AI.' };
  const base = { provider: def.id, providerName: def.name, model: s.model || (kind === 'text' ? def.textModels : def.imageModels)?.[0] };
  if (!runsHere(def)) return { ...base, ready: false, reason: `${def.name} works in the Chitthi desktop app only (it doesn’t allow calls from a web page).` };
  if (!hasKeySync(def.id)) return { ...base, ready: false, reason: `Add your ${def.name} API key in Settings → AI.` };
  return { ...base, ready: true };
}
/** Refreshes the key cache (desktop keys live in the main process), then reports readiness. */
export async function aiReadyAsync(kind: AiKind): Promise<Readiness> {
  await keyStatus();
  return aiReady(kind);
}

async function textCall(req: ReturnType<typeof wordsPrompt>, maxTokens: number, signal?: AbortSignal): Promise<unknown> {
  const r = aiReady('text');
  if (!r.ready || !r.provider) throw new AiError(r.reason ?? 'AI isn’t set up.', 'setup');
  spend('text');
  const { def, module } = await loadProvider(r.provider);
  if (!module.text) throw new AiError(`${def.name} can’t write words.`, 'setup');
  return module.text.generateJSON(contextFor(def, 'text', signal), { ...req, maxTokens });
}

/* ---------- words ---------- */

export interface WordsOption {
  greeting: string;
  quote: string;
  signature: string;
}
export interface WordsAsk {
  language: string;
  tone: string;
  recipient?: string;
  sender?: string;
  notes?: string;
  count?: number;
}

const langName = (id: string) => AI_LANGUAGES.find((l) => l.id === id)?.name ?? id;
const occasionOf = (d: Design) => (d.useOccasion ? themeById(d.themeId).name : 'a personal card');
const clampN = (n: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, n)));

/** Character budgets from the layout's text area (mm), at the sizes the renderer starts from. */
export function textBudget(d: Design): { greeting: number; quote: number; signature: number; caption: number } {
  const { w, h } = cardMM(d),
    L = computeLayout(d.layout, { x: 0, y: 0, w, h, e: 0 }, d),
    Z = L.text;
  if (!Z) return { greeting: 28, quote: 110, signature: 22, caption: 34 };
  const base = Math.min(Z.w * 0.15, Z.h * (L.textFill ?? 0.32)) * (d.textScale || 1),
    perLine = (px: number) => Z.w / Math.max(0.5, px * 0.5);
  return {
    greeting: clampN(perLine(base * 1.1) * 1.4, 12, 42),
    quote: clampN(perLine(base * 0.44) * 3, 40, 180),
    signature: clampN(perLine(base * 0.36) * 0.8, 10, 32),
    caption: clampN(perLine(Z.h * 0.72), 16, 48),
  };
}

export async function writeWords(d: Design, ask: WordsAsk, signal?: AbortSignal): Promise<WordsOption[]> {
  const count = ask.count ?? 4;
  const b = textBudget(d);
  const req = wordsPrompt({
    product: d.product,
    occasion: occasionOf(d),
    language: langName(ask.language),
    tone: ask.tone,
    budget: { greeting: b.greeting, quote: b.quote, signature: b.signature },
    recipient: ask.recipient || d.back.to || undefined,
    sender: ask.sender || d.back.from || undefined,
    notes: ask.notes,
    count,
  });
  const out = (await textCall(req, 1200, signal)) as { options?: Partial<WordsOption>[] };
  const opts = (out.options ?? [])
    .map((o) => ({ greeting: String(o.greeting ?? '').trim(), quote: String(o.quote ?? '').trim(), signature: String(o.signature ?? '').trim() }))
    .filter((o) => o.greeting || o.quote);
  if (!opts.length) throw new AiError('The AI didn’t suggest anything. Try again.', 'bad-output');
  return opts.slice(0, count);
}

/** Twelve captions (or one per page), in page order, using each month's festivals and photo. */
export async function writeCaptions(d: Design, photos: Photo[], ask: WordsAsk, signal?: AbortSignal): Promise<{ month: number; caption: string }[]> {
  const n = calPages(d);
  const months = Array.from({ length: n }, (_, p) => {
    const { year, month } = calMonth(d, p),
      festivals = [...marksFor(year, month, 'all').values()].flat().filter((m) => m.kind !== 'own').map((m) => m.name),
      ph = photos.length ? photos[(p * 1) % photos.length] : undefined;
    return { month, name: `${MONTHS[month]} ${year}`, festivals: [...new Set(festivals)], photo: ph ? shortName(ph.name).slice(0, 60) : undefined };
  });
  const req = captionsPrompt({
    year: d.cal.year,
    months,
    language: langName(ask.language),
    tone: ask.tone,
    theme: d.useOccasion ? themeById(d.themeId).name : 'a family calendar',
    budget: textBudget(d).caption,
    notes: ask.notes,
  });
  const out = (await textCall(req, 1500, signal)) as { captions?: unknown[] };
  const caps = (out.captions ?? []).map((c) => String(c ?? '').trim());
  if (!caps.some(Boolean)) throw new AiError('The AI didn’t write any captions. Try again.', 'bad-output');
  return months.map((m, i) => ({ month: m.month, caption: caps[i] ?? '' }));
}

/** Messages for the back of a postcard (or a frame's dedication). */
export async function writeMessages(d: Design, ask: WordsAsk, signal?: AbortSignal): Promise<string[]> {
  const req = messagePrompt({
    occasion: occasionOf(d),
    language: langName(ask.language),
    tone: ask.tone,
    recipient: ask.recipient || d.back.to || undefined,
    sender: ask.sender || d.back.from || undefined,
    notes: ask.notes,
    budget: d.product === 'frame' ? 160 : 220,
    count: ask.count ?? 3,
  });
  const out = (await textCall(req, 1000, signal)) as { messages?: unknown[] };
  const msgs = (out.messages ?? []).map((m) => String(m ?? '').trim()).filter(Boolean);
  if (!msgs.length) throw new AiError('The AI didn’t write any messages. Try again.', 'bad-output');
  return msgs;
}

/* ---------- pictures ---------- */

export interface ArtAsk {
  subject: string;
  style: ArtStyle;
  people: boolean;
  mood?: string;
  n?: number;
}

/** The shape and quiet area of a photo slot, so a picture fits it without awkward cropping. */
export function slotShape(d: Design, slot: number): { aspect: Aspect; ratio: number; space?: ArtContext['space'] } {
  const { w, h } = cardMM(d),
    L = computeLayout(d.layout, { x: 0, y: 0, w, h, e: 0 }, d),
    s = L.slots[Math.min(slot, L.slots.length - 1)] ?? { x: 0, y: 0, w, h },
    ratio = s.w / s.h;
  let space: ArtContext['space'];
  const Z = L.text;
  if (Z && L.onPhoto) {
    const cx = Z.x + Z.w / 2 - (s.x + s.w / 2),
      cy = Z.y + Z.h / 2 - (s.y + s.h / 2);
    space = Math.abs(cx) / s.w > Math.abs(cy) / s.h ? (cx > 0 ? 'right' : 'left') : d.vAlign === 'top' ? 'top' : d.vAlign === 'bottom' ? 'bottom' : cy > 0 ? 'bottom' : 'top';
  }
  return { aspect: nearestAspect(ratio), ratio, space };
}

/** A starting description from the design: the occasion, or the calendar month's festival. */
export function suggestSubject(d: Design, page: number): string {
  if (d.product === 'calendar') {
    const { year, month } = calMonth(d, page),
      fest = [...marksFor(year, month, 'all').values()].flat().find((m) => m.kind === 'festival');
    return fest ? `${fest.name} celebrations in India, festive details` : `${MONTHS[month]} in India, seasonal landscape`;
  }
  if (!d.useOccasion) return 'a warm, joyful scene';
  const t = themeById(d.themeId);
  return t.g === 'Festivals' ? `${t.name} festival in India, traditional decorations` : `${t.name}, celebratory scene`;
}

let queue: Promise<unknown> = Promise.resolve();

/** Makes pictures for a slot. One picture job runs at a time; each is counted against the daily limit. */
export function generateArt(d: Design, slot: number, ask: ArtAsk, signal?: AbortSignal): Promise<{ blobs: Blob[]; prompt: string; provider: string; model: string }> {
  const job = queue.then(async () => {
    const r = aiReady('image');
    if (!r.ready || !r.provider) throw new AiError(r.reason ?? 'AI pictures aren’t set up.', 'setup');
    const { def, module } = await loadProvider(r.provider);
    if (!module.image) throw new AiError(`${def.name} can’t make pictures.`, 'setup');
    const shape = slotShape(d, slot);
    const t = d.useOccasion ? themeById(d.themeId) : null;
    const prompt = artPrompt({ subject: ask.subject, style: ask.style, space: shape.space, people: ask.people, mood: ask.mood, colours: t ? [t.bg1, t.accent] : undefined });
    const n = Math.min(4, Math.max(1, ask.n ?? 2));
    for (let i = 0; i < n; i++) spend('image');
    const ctx = contextFor(def, 'image', signal);
    const blobs = await module.image.generate(ctx, { prompt, aspect: shape.aspect, n });
    return { blobs, prompt, provider: def.name, model: ctx.model };
  });
  queue = job.catch(() => undefined);
  return job;
}

/** The stored name of an AI picture: a short description plus its provenance, "(AI / Provider model)". */
export const aiPhotoName = (subject: string, provider: string, model: string) =>
  `${subject.replace(/\s+/g, ' ').replace(/[()]/g, '').trim().slice(0, 60) || 'AI picture'} (AI / ${provider.replace(/[()]/g, '')} ${model.replace(/[()]/g, '')})`;

/** A generated picture as a JPEG data URL for the photo library (smaller than PNG, same print quality). */
export async function blobToJpegDataUrl(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  cv.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  const url = cv.toDataURL('image/jpeg', 0.93);
  cv.width = cv.height = 0; // free the canvas memory now
  return url;
}

/** A small preview (long side ≤ 320 px) for choosing between candidates, as an object URL the caller revokes. */
export async function thumbUrl(blob: Blob): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k);
  cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close();
  const small = await new Promise<Blob>((ok) => cv.toBlob((b) => ok(b ?? blob), 'image/jpeg', 0.85));
  return URL.createObjectURL(small);
}

/** Lists the account's models for a provider (for the Settings picker). */
export async function listModels(id: AiProviderId, kind: AiKind): Promise<string[]> {
  const { def, module } = await loadProvider(id);
  const a = kind === 'text' ? module.text : module.image;
  if (!a?.listModels) return (kind === 'text' ? def.textModels : def.imageModels) ?? [];
  return a.listModels(contextFor(def, kind));
}

/** A tiny request to check a key works (costs a few tokens on text providers; image providers list models only). */
export async function testProvider(id: AiProviderId): Promise<string> {
  const { def, module } = await loadProvider(id);
  if (module.text?.listModels || module.image?.listModels) {
    const models = await listModels(id, module.text ? 'text' : 'image');
    return `${def.name} works: ${models.length} model${models.length === 1 ? '' : 's'} available.`;
  }
  return `${def.name} is set up. It will be checked on the first picture.`;
}
