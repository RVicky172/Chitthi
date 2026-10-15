import { AI_LANGUAGES, providerDef, type AiKind, type AiProviderId } from '../data/aiProviders';
import { marksFor } from '../data/holidays';
import { MONTHS } from '../data/products';
import { themeById } from '../data/themes';
import { calPages, cardMM } from '../engine/design';
import { isRecord } from '../engine/guards';
import { computeLayout } from '../engine/layout';
import { calMonth } from '../engine/calendarDraw';
import { shortName } from '../lib/credits';
import type { Design, Photo, Rect } from '../types';
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

/** Whether an AI feature can run now, and with what. */
export interface Readiness {
  ready: boolean;
  provider?: AiProviderId;
  providerName?: string;
  model?: string;
  /** Why it isn't ready, in words for the user. */
  reason?: string;
}

/**
 * The first of some texts that isn't empty.
 * @param texts the candidates, in order
 * @returns the first non-empty one, or undefined
 */
const firstText = (...texts: (string | undefined)[]): string | undefined => texts.find((text) => !!text);

/**
 * Whether words (text) or pictures (image) can be made now, and with what.
 * @param kind words or pictures
 * @returns the provider and model, or why not
 */
export function aiReady(kind: AiKind): Readiness {
  const chosen = aiSettings()[kind];
  if (!chosen.provider) return { ready: false, reason: `Choose an AI service for ${kind === 'text' ? 'words' : 'pictures'} in Settings → AI.` };
  const def = providerDef(chosen.provider);
  if (!def) return { ready: false, reason: 'The chosen AI service is no longer available. Choose another in Settings → AI.' };
  const suggested = kind === 'text' ? def.textModels : def.imageModels;
  const base = { provider: def.id, providerName: def.name, model: firstText(chosen.model) ?? suggested?.[0] };
  if (!runsHere(def)) return { ...base, ready: false, reason: `${def.name} works in the Chitthi desktop app only (it doesn’t allow calls from a web page).` };
  if (!hasKeySync(def.id)) return { ...base, ready: false, reason: `Add your ${def.name} API key in Settings → AI.` };
  return { ...base, ready: true };
}

/**
 * Refreshes the key cache (desktop keys live in the main process), then reports readiness.
 * @param kind words or pictures
 * @returns the readiness
 */
export async function aiReadyAsync(kind: AiKind): Promise<Readiness> {
  await keyStatus();
  return aiReady(kind);
}

/**
 * Asks the chosen words provider for structured output (counted against the daily limit).
 * @param request the prompt and schema
 * @param maxTokens the answer's limit
 * @param signal cancels the call
 * @returns the parsed answer (unchecked)
 */
async function textCall(request: ReturnType<typeof wordsPrompt>, maxTokens: number, signal?: AbortSignal): Promise<unknown> {
  const readiness = aiReady('text');
  if (!readiness.ready || !readiness.provider) throw new AiError(readiness.reason ?? 'AI isn’t set up.', 'setup');
  spend('text');
  const { def, module } = await loadProvider(readiness.provider);
  if (!module.text) throw new AiError(`${def.name} can’t write words.`, 'setup');
  return module.text.generateJSON(contextFor(def, 'text', signal), { ...request, maxTokens });
}

/**
 * A list in a model's answer.
 * @param answer the parsed answer
 * @param field the list's name
 * @returns the list, or none
 */
const listIn = (answer: unknown, field: string): unknown[] => {
  const list = isRecord(answer) ? answer[field] : undefined;
  return Array.isArray(list) ? list : [];
};

/**
 * A value of a model's answer as trimmed text.
 * @param value anything
 * @returns text as is, numbers and flags as text, anything else ''
 */
const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
};

/* ---------- words ---------- */

/** One set of front words. */
export interface WordsOption {
  greeting: string;
  quote: string;
  signature: string;
}

/** What the user asks words for. */
export interface WordsAsk {
  language: string;
  tone: string;
  recipient?: string;
  sender?: string;
  notes?: string;
  count?: number;
}

/**
 * A language's name.
 * @param id its id (AI_LANGUAGES)
 * @returns its name, or the id
 */
const languageName = (id: string): string => AI_LANGUAGES.find((language) => language.id === id)?.name ?? id;

/**
 * What a design is for.
 * @param design the design
 * @returns its theme's name, or "a personal card"
 */
const occasionOf = (design: Design): string => (design.useOccasion ? themeById(design.themeId).name : 'a personal card');

/**
 * A number rounded into a range.
 * @param value the number
 * @param low the smallest
 * @param high the largest
 * @returns the rounded, clamped number
 */
const clampRound = (value: number, low: number, high: number): number => Math.round(Math.min(high, Math.max(low, value)));

/**
 * Character budgets from the layout's text area (mm), at the sizes the renderer starts from.
 * @param design the design
 * @returns how many characters each kind of words may have
 */
export function textBudget(design: Design): { greeting: number; quote: number; signature: number; caption: number } {
  const { w: width, h: height } = cardMM(design);
  const layout = computeLayout(design.layout, { x: 0, y: 0, w: width, h: height, e: 0 }, design);
  const area = layout.text;
  if (!area) return { greeting: 28, quote: 110, signature: 22, caption: 34 };
  const scale = design.textScale ? design.textScale : 1;
  const base = Math.min(area.w * 0.15, area.h * (layout.textFill ?? 0.32)) * scale;
  const perLine = (size: number) => area.w / Math.max(0.5, size * 0.5);
  return {
    greeting: clampRound(perLine(base * 1.1) * 1.4, 12, 42),
    quote: clampRound(perLine(base * 0.44) * 3, 40, 180),
    signature: clampRound(perLine(base * 0.36) * 0.8, 10, 32),
    caption: clampRound(perLine(area.h * 0.72), 16, 48),
  };
}

/**
 * Greeting, quote and signature options that fit the layout.
 * @param design the design
 * @param ask language, tone, names, notes and how many options
 * @param signal cancels the call
 * @returns the options with a greeting or a quote
 * @throws AiError when the model suggests nothing usable
 */
export async function writeWords(design: Design, ask: WordsAsk, signal?: AbortSignal): Promise<WordsOption[]> {
  const count = ask.count ?? 4;
  const budget = textBudget(design);
  const request = wordsPrompt({
    product: design.product,
    occasion: occasionOf(design),
    language: languageName(ask.language),
    tone: ask.tone,
    budget: { greeting: budget.greeting, quote: budget.quote, signature: budget.signature },
    recipient: firstText(ask.recipient, design.back.to),
    sender: firstText(ask.sender, design.back.from),
    notes: ask.notes,
    count,
  });
  const options = listIn(await textCall(request, 1200, signal), 'options')
    .filter(isRecord)
    .map((option) => ({ greeting: textOf(option.greeting), quote: textOf(option.quote), signature: textOf(option.signature) }))
    .filter((option) => option.greeting || option.quote);
  if (!options.length) throw new AiError('The AI didn’t suggest anything. Try again.', 'bad-output');
  return options.slice(0, count);
}

/**
 * Twelve captions (or one per page), in page order, using each month's festivals and photo.
 * @param design the calendar
 * @param photos its photos
 * @param ask language, tone and notes
 * @param signal cancels the call
 * @returns one caption per page ('' where the model gave none)
 * @throws AiError when the model writes no caption
 */
export async function writeCaptions(design: Design, photos: Photo[], ask: WordsAsk, signal?: AbortSignal): Promise<{ month: number; caption: string }[]> {
  const months = Array.from({ length: calPages(design) }, (_, page) => {
    const { year, month } = calMonth(design, page);
    const festivals = [...marksFor(year, month, 'all').values()]
      .flat()
      .filter((mark) => mark.kind !== 'own')
      .map((mark) => mark.name);
    const photo = photos.length ? photos.at(page % photos.length) : undefined;
    return { month, name: `${MONTHS[month] ?? ''} ${year}`, festivals: [...new Set(festivals)], photo: photo ? shortName(photo.name).slice(0, 60) : undefined };
  });
  const request = captionsPrompt({
    year: design.cal.year,
    months,
    language: languageName(ask.language),
    tone: ask.tone,
    theme: design.useOccasion ? themeById(design.themeId).name : 'a family calendar',
    budget: textBudget(design).caption,
    notes: ask.notes,
  });
  const captions = listIn(await textCall(request, 1500, signal), 'captions').map(textOf);
  if (!captions.some(Boolean)) throw new AiError('The AI didn’t write any captions. Try again.', 'bad-output');
  return months.map((month, index) => ({ month: month.month, caption: captions[index] ?? '' }));
}

/**
 * Messages for the back of a postcard (or a frame's dedication).
 * @param design the design
 * @param ask language, tone, names, notes and how many
 * @param signal cancels the call
 * @returns the messages
 * @throws AiError when the model writes none
 */
export async function writeMessages(design: Design, ask: WordsAsk, signal?: AbortSignal): Promise<string[]> {
  const request = messagePrompt({
    occasion: occasionOf(design),
    language: languageName(ask.language),
    tone: ask.tone,
    recipient: firstText(ask.recipient, design.back.to),
    sender: firstText(ask.sender, design.back.from),
    notes: ask.notes,
    budget: design.product === 'frame' ? 160 : 220,
    count: ask.count ?? 3,
  });
  const messages = listIn(await textCall(request, 1000, signal), 'messages').map(textOf).filter(Boolean);
  if (!messages.length) throw new AiError('The AI didn’t write any messages. Try again.', 'bad-output');
  return messages;
}

/* ---------- pictures ---------- */

/** What the user asks a picture of. */
export interface ArtAsk {
  subject: string;
  style: ArtStyle;
  people: boolean;
  mood?: string;
  n?: number;
}

/**
 * Where words printed over a photo sit, so the picture keeps that side calm.
 * @param text the text area
 * @param slot the photo slot
 * @param vAlign the design's vertical alignment of the words
 * @returns the side of the slot the words are on
 */
function quietSide(text: Rect, slot: Rect, vAlign: Design['vAlign']): NonNullable<ArtContext['space']> {
  const offsetX = text.x + text.w / 2 - (slot.x + slot.w / 2);
  const offsetY = text.y + text.h / 2 - (slot.y + slot.h / 2);
  if (Math.abs(offsetX) / slot.w > Math.abs(offsetY) / slot.h) return offsetX > 0 ? 'right' : 'left';
  if (vAlign === 'top' || vAlign === 'bottom') return vAlign;
  return offsetY > 0 ? 'bottom' : 'top';
}

/**
 * The shape and quiet area of a photo slot, so a picture fits it without awkward cropping.
 * @param design the design
 * @param slot the slot (the last slot for a larger number)
 * @returns the nearest aspect, the slot's ratio and, when words sit on the photo, their side
 */
export function slotShape(design: Design, slot: number): { aspect: Aspect; ratio: number; space?: NonNullable<ArtContext['space']> } {
  const { w: width, h: height } = cardMM(design);
  const layout = computeLayout(design.layout, { x: 0, y: 0, w: width, h: height, e: 0 }, design);
  const box = layout.slots.at(Math.min(slot, layout.slots.length - 1)) ?? { x: 0, y: 0, w: width, h: height };
  const ratio = box.w / box.h;
  const space = layout.text && layout.onPhoto ? quietSide(layout.text, box, design.vAlign) : undefined;
  return { aspect: nearestAspect(ratio), ratio, space };
}

/**
 * A starting description from the design: the occasion, or the calendar month's festival.
 * @param design the design
 * @param page the calendar page shown
 * @returns the description
 */
export function suggestSubject(design: Design, page: number): string {
  if (design.product === 'calendar') {
    const { year, month } = calMonth(design, page);
    const festival = [...marksFor(year, month, 'all').values()].flat().find((mark) => mark.kind === 'festival');
    return festival ? `${festival.name} celebrations in India, festive details` : `${MONTHS[month] ?? ''} in India, seasonal landscape`;
  }
  if (!design.useOccasion) return 'a warm, joyful scene';
  const theme = themeById(design.themeId);
  return theme.g === 'Festivals' ? `${theme.name} festival in India, traditional decorations` : `${theme.name}, celebratory scene`;
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Makes pictures for a slot. One picture job runs at a time; each picture is counted against the daily limit.
 * @param design the design
 * @param slot the photo slot
 * @param ask subject, style, people, mood and how many (1–4, default 2)
 * @param signal cancels the call
 * @returns the pictures, the prompt and the provider and model that made them
 */
export function generateArt(
  design: Design,
  slot: number,
  ask: ArtAsk,
  signal?: AbortSignal,
): Promise<{ blobs: Blob[]; prompt: string; provider: string; model: string }> {
  const job = queue.then(async () => {
    const readiness = aiReady('image');
    if (!readiness.ready || !readiness.provider) throw new AiError(readiness.reason ?? 'AI pictures aren’t set up.', 'setup');
    const { def, module } = await loadProvider(readiness.provider);
    if (!module.image) throw new AiError(`${def.name} can’t make pictures.`, 'setup');
    const shape = slotShape(design, slot);
    const theme = design.useOccasion ? themeById(design.themeId) : null;
    const prompt = artPrompt({
      subject: ask.subject,
      style: ask.style,
      space: shape.space,
      people: ask.people,
      mood: ask.mood,
      colours: theme ? [theme.bg1, theme.accent] : undefined,
    });
    const count = Math.min(4, Math.max(1, ask.n ?? 2));
    for (let picture = 0; picture < count; picture++) spend('image');
    const context = contextFor(def, 'image', signal);
    const blobs = await module.image.generate(context, { prompt, aspect: shape.aspect, n: count });
    return { blobs, prompt, provider: def.name, model: context.model };
  });
  queue = job.catch(() => undefined);
  return job;
}

/**
 * The stored name of an AI picture: a short description plus its provenance, "(AI / Provider model)".
 * @param subject what the picture shows
 * @param provider the provider's name
 * @param model the model
 * @returns the name
 */
export const aiPhotoName = (subject: string, provider: string, model: string): string => {
  const description = subject.replace(/\s+/g, ' ').replace(/[()]/g, '').trim().slice(0, 60) || 'AI picture';
  return `${description} (AI / ${provider.replace(/[()]/g, '')} ${model.replace(/[()]/g, '')})`;
};

/**
 * A picture drawn on a canvas.
 * @param blob the picture
 * @param longSide the canvas's long side at most, in pixels (default: the picture's own size)
 * @returns the canvas
 */
async function canvasOf(blob: Blob, longSide = Infinity): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new AiError('The picture couldn’t be drawn.', 'setup');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

/**
 * A generated picture as a JPEG data URL for the photo library (smaller than PNG, same print quality).
 * @param blob the picture
 * @returns its data URL
 */
export async function blobToJpegDataUrl(blob: Blob): Promise<string> {
  const canvas = await canvasOf(blob);
  const url = canvas.toDataURL('image/jpeg', 0.93);
  canvas.width = canvas.height = 0; // free the canvas memory now
  return url;
}

/**
 * A small preview (long side ≤ 320 px) for choosing between candidates.
 * @param blob the picture
 * @returns an object URL the caller revokes
 */
export async function thumbUrl(blob: Blob): Promise<string> {
  const canvas = await canvasOf(blob, 320);
  const small = await new Promise<Blob>((resolve) => {
    canvas.toBlob((thumb) => resolve(thumb ?? blob), 'image/jpeg', 0.85);
  });
  return URL.createObjectURL(small);
}

/**
 * Lists the account's models for a provider (for the Settings picker).
 * @param id the provider
 * @param kind words or pictures
 * @returns the models (the suggested ones when the provider can't list them)
 */
export async function listModels(id: AiProviderId, kind: AiKind): Promise<string[]> {
  const { def, module } = await loadProvider(id);
  const adapter = kind === 'text' ? module.text : module.image;
  if (!adapter?.listModels) return (kind === 'text' ? def.textModels : def.imageModels) ?? [];
  return adapter.listModels(contextFor(def, kind));
}

/**
 * A tiny request to check a key works (costs a few tokens on text providers; image providers list models only).
 * @param id the provider
 * @returns a line for the user
 */
export async function testProvider(id: AiProviderId): Promise<string> {
  const { def, module } = await loadProvider(id);
  if (module.text?.listModels || module.image?.listModels) {
    const models = await listModels(id, module.text ? 'text' : 'image');
    return `${def.name} works: ${models.length} model${models.length === 1 ? '' : 's'} available.`;
  }
  return `${def.name} is set up. It will be checked on the first picture.`;
}
