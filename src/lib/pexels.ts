import { themeById } from '../data/themes';
import { calPages, cardMM } from '../engine/design';
import { computeLayout } from '../engine/layout';
import { calMonth } from '../engine/calendarDraw';
import { isObjectLike } from '../engine/guards';
import type { Design } from '../types';
import { pexelsName } from './credits';

/*
 * Pexels photo search (https://www.pexels.com/api/).
 * Two ways in, tried in this order:
 *   1. a key the user pasted, kept in this browser only, calling api.pexels.com directly;
 *   2. the same-origin proxy at ./api/pexels/ (the Vite dev and preview servers add PEXELS_API_KEY from .env.local
 *      on the server side, so the key never ships in the bundle).
 * When neither is available the search asks for a key.
 */

/** A photo in a search result (the fields Chitthi uses). */
export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  /** The photo's page on Pexels. */
  url: string;
  alt: string;
  avg_color: string;
  photographer: string;
  photographer_url: string;
  /** The photo at several sizes. */
  src: { original: string; large2x: string; large: string; medium: string; small: string; tiny: string };
}

/** One page of search results. */
interface SearchResult {
  photos: PexelsPhoto[];
  page: number;
  total_results: number;
  next_page?: string;
}

/** The shape of photo asked for. */
export type PexelsOrientation = 'landscape' | 'portrait' | 'square';

/** No way to reach Pexels: no proxy on this server and no key saved (or the key was refused). */
export class PexelsKeyError extends Error {
  /** @param refused true when Pexels refused the saved key (false: there is no key and no proxy) */
  constructor(readonly refused = false) {
    super(refused ? 'Pexels didn’t accept that API key.' : 'A Pexels API key is needed to search.');
  }
}

/** Where the user's key is kept (this browser only). */
const KEY = 'chitthi-pexels-key';
/** The event sent when the key or the search setting changes. */
const CHANGE_EVENT = 'chitthi:pexels';

/**
 * The key the user pasted.
 * @returns the key, or '' when there is none
 */
export function pexelsKey(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Saves the user's key (or removes it) and forgets the results found with the old one.
 * @param key the key; '' removes it
 */
export function setPexelsKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the key lasts for this page only */
  }
  cache.clear();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The user can hide photo search from the Photos step (Settings). */
const HIDE = 'chitthi-pexels-hidden';

/**
 * Whether the user hid photo search.
 * @returns true when hidden
 */
export function pexelsHidden(): boolean {
  try {
    return localStorage.getItem(HIDE) === '1';
  } catch {
    return false;
  }
}

/**
 * Hides or shows photo search.
 * @param hidden true to hide it
 */
export function setPexelsHidden(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDE, '1');
    else localStorage.removeItem(HIDE);
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Listens for changes of the saved key or the search setting.
 * @param listener called on each change
 * @returns a function that stops listening
 */
export const onPexelsKey = (listener: () => void): (() => void) => {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
};

/** How photo search reaches Pexels right now. */
export type PexelsAccess = 'key' | 'server' | 'none';

/**
 * Checks a key with one tiny search, straight to api.pexels.com.
 * @param key the key to check
 * @returns whether it works, was refused, couldn't be checked, or is over its limit
 */
export async function testPexelsKey(key: string): Promise<'ok' | 'refused' | 'offline' | 'limit'> {
  try {
    const response = await fetch('https://api.pexels.com/v1/search?query=nature&per_page=1', { headers: { Authorization: key.trim() } });
    if (response.status === 401 || response.status === 403) return 'refused';
    if (response.status === 429) return 'limit';
    return response.ok ? 'ok' : 'offline';
  } catch {
    return 'offline';
  }
}

/**
 * How search reaches Pexels: your saved key wins; otherwise the server's proxy, if this build has one.
 * @returns the way in, or 'none'
 */
export async function pexelsAccess(): Promise<PexelsAccess> {
  if (pexelsKey()) return 'key';
  try {
    const response = await fetch(new URL('api/pexels/v1/search?query=nature&per_page=1', location.href));
    return response.ok && (response.headers.get('content-type') ?? '').includes('json') ? 'server' : 'none';
  } catch {
    return 'none';
  }
}

// Results are kept for the session: moving between steps or months doesn't spend the hourly request allowance.
const cache = new Map<string, Promise<SearchResult>>();

/**
 * Searches Pexels (24 photos a page); results are kept for the session.
 * @param query the search words
 * @param orientation the shape of photo, or null for any
 * @param page the page, from 1
 * @returns the page of results
 */
export function searchPexels(query: string, orientation: PexelsOrientation | null, page = 1): Promise<SearchResult> {
  const params = new URLSearchParams({ query, page: String(page), per_page: '24' });
  if (orientation) params.set('orientation', orientation);
  const id = params.toString();
  let hit = cache.get(id);
  if (!hit) {
    hit = request(params);
    cache.set(id, hit);
    // Keep the last 60 searches (a few hundred KB of JSON); the oldest go first.
    const oldest = cache.keys().next();
    if (cache.size > 60 && !oldest.done) cache.delete(oldest.value);
    hit.catch(() => cache.delete(id));
  }
  return hit;
}

/*
 * The hourly allowance (200 requests by default). Pexels reports what's left in X-Ratelimit-Remaining and when it
 * resets in X-Ratelimit-Reset (Unix seconds). Once it reaches zero, searches wait for the reset instead of sending
 * requests that would be refused: Pexels asks apps not to work around the limit.
 */
let limit: { remaining: number; reset: number } | null = null;

/**
 * The allowance Pexels last reported.
 * @returns the requests left and when they reset (Unix seconds), or null before the first search
 */
export const pexelsQuota = (): typeof limit => limit;

/**
 * The message shown once the allowance is used up.
 * @param reset when it resets, Unix seconds
 * @returns the message, with the minutes to wait
 */
const limitMessage = (reset: number): string => {
  const minutes = Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000));
  return `The Pexels search limit for this hour is used up. It resets in about ${minutes} minute${minutes > 1 ? 's' : ''}.`;
};

/** The message for any other failed search. */
const SEARCH_FAILED = 'The Pexels search didn’t work. Try again.';

/**
 * Whether a value from the search results has the fields Chitthi uses.
 * @param value one entry of `photos`
 * @returns true for a usable photo
 */
function isPexelsPhoto(value: unknown): value is PexelsPhoto {
  return (
    isObjectLike(value) &&
    typeof value.id === 'number' &&
    typeof value.width === 'number' &&
    typeof value.height === 'number' &&
    isObjectLike(value.src) &&
    typeof value.src.original === 'string'
  );
}

/**
 * The search results in a response's JSON.
 * @param json the parsed body
 * @returns the results, with only the usable photos
 * @throws when the body isn't a page of results
 */
function searchResultOf(json: unknown): SearchResult {
  if (!isObjectLike(json) || !Array.isArray(json.photos)) throw new Error(SEARCH_FAILED);
  return {
    photos: json.photos.filter(isPexelsPhoto),
    page: typeof json.page === 'number' ? json.page : 1,
    total_results: typeof json.total_results === 'number' ? json.total_results : 0,
    ...(typeof json.next_page === 'string' ? { next_page: json.next_page } : {}),
  };
}

/**
 * Turns a failed search into the error to show, and notes a used-up allowance.
 * @param response Pexels' (or the proxy's) answer
 * @param hasKey whether the search used the user's key
 * @throws PexelsKeyError when there is no way in or the key was refused; Error for a used-up allowance or a failure
 */
function checkResponse(response: Response, hasKey: boolean): void {
  const isJson = (response.headers.get('content-type') ?? '').includes('json');
  // No proxy here: a 404, or the app's own index.html from a single-page-app fallback.
  if (!hasKey && (!isJson || response.status === 404)) throw new PexelsKeyError();
  if (response.status === 401 || response.status === 403) throw new PexelsKeyError(hasKey);
  if (response.status === 429) {
    const reset = limit && limit.reset * 1000 > Date.now() ? limit.reset : Math.round(Date.now() / 1000) + 15 * 60;
    limit = { remaining: 0, reset };
    throw new Error(limitMessage(reset));
  }
  if (!response.ok || !isJson) throw new Error(SEARCH_FAILED);
}

/**
 * Notes the allowance Pexels reports with a response.
 * @param response a successful search's answer
 */
function noteAllowance(response: Response): void {
  const left = Number(response.headers.get('X-Ratelimit-Remaining') ?? NaN);
  const reset = Number(response.headers.get('X-Ratelimit-Reset') ?? NaN);
  if (Number.isFinite(left) && Number.isFinite(reset)) limit = { remaining: left, reset };
}

/**
 * Sends one search, with the user's key or through the proxy.
 * @param params the search's query string
 * @returns the page of results
 */
async function request(params: URLSearchParams): Promise<SearchResult> {
  if (limit && limit.remaining <= 0 && limit.reset * 1000 > Date.now()) throw new Error(limitMessage(limit.reset));
  const key = pexelsKey();
  let response: Response;
  try {
    response = key
      ? await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key } })
      : await fetch(new URL(`api/pexels/v1/search?${params}`, location.href));
  } catch {
    if (key) throw new Error('Pexels couldn’t be reached. Check your internet connection.');
    throw new PexelsKeyError();
  }
  checkResponse(response, !!key);
  noteAllowance(response);
  return searchResultOf(await response.json());
}

/**
 * A print-sized copy (long side up to 3000 px, never larger than the original).
 * @param photo the photo
 * @returns its address at print size
 */
export function printUrl(photo: PexelsPhoto): string {
  const long = Math.min(3000, Math.max(photo.width, photo.height));
  const side = photo.width >= photo.height ? 'w' : 'h';
  return `${photo.src.original}?auto=compress&cs=tinysrgb&${side}=${long}`;
}

/**
 * Downloads a photo as a data URL, so it keeps working offline and in saved designs like an upload.
 * @param photo the photo
 * @returns its name (with its credit) and its data URL
 */
export async function fetchPexels(photo: PexelsPhoto): Promise<{ name: string; url: string }> {
  const response = await fetch(printUrl(photo));
  if (!response.ok) throw new Error('download failed');
  const blob = await response.blob();
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('download failed'));
    reader.readAsDataURL(blob);
  });
  return { name: pexelsName(photo.alt, photo.photographer, photo.id), url };
}

/* ---------- suggestions from the design ---------- */

/** Search words for each occasion theme (theme names alone find too many unrelated photos). */
const THEME_WORDS: Record<string, string> = {
  diwali: 'diwali diya lights',
  holi: 'holi colours',
  rakhi: 'raksha bandhan rakhi',
  eid: 'eid moon lanterns',
  navratri: 'navratri dandiya sticks',
  ganesh: 'ganesh chaturthi',
  janmashtami: 'krishna flute',
  lohri: 'bonfire night',
  baisakhi: 'wheat field punjab',
  gurpurab: 'golden temple',
  india: 'indian flag tricolour',
  sankranti: 'kites sky',
  pongal: 'pongal kolam',
  onam: 'onam pookalam flowers',
  christmas: 'christmas lights',
  bday: 'birthday cake candles',
  kids: 'colourful balloons',
  parents: 'flowers bouquet',
  friends: 'string lights polaroids',
  milestone: 'celebration confetti',
  spring: 'spring blossom',
  monsoon: 'monsoon rain green',
  autumn: 'autumn leaves',
  summer: 'summer beach',
  winter: 'snow mountains',
};

/** A photo idea for each month, so a calendar gets seasonal suggestions page by page. */
const MONTH_WORDS = [
  'snowy mountains winter',
  'spring flowers',
  'holi colours',
  'summer fields',
  'mango summer',
  'monsoon rain',
  'green tea plantation',
  'kites sky',
  'lotus pond',
  'autumn festival lights',
  'diya lamps',
  'christmas winter',
];

const PRODUCT_WORDS: Record<Design['product'], string[]> = {
  postcard: ['india travel', 'beach sunset', 'old city street'],
  calendar: ['landscape nature', 'india travel'],
  frame: ['mountain landscape', 'botanical flowers', 'architecture detail'],
  magnet: ['cute puppy', 'travel landmark', 'flowers close up', 'colourful pattern'],
};

/**
 * Search ideas for the current design: the month (calendars), the occasion, then the product.
 * @param design the design
 * @param page the calendar page shown
 * @returns up to five search phrases
 */
export function pexelsSuggestions(design: Design, page: number): string[] {
  const ideas: string[] = [];
  if (design.product === 'calendar' && design.layout !== 'cal-strip') {
    const monthWords = MONTH_WORDS[calMonth(design, Math.min(page, calPages(design) - 1)).month];
    if (monthWords) ideas.push(monthWords);
  }
  if (design.useOccasion) ideas.push(THEME_WORDS[design.themeId] ?? themeById(design.themeId).name.toLowerCase());
  ideas.push(...PRODUCT_WORDS[design.product]);
  return [...new Set(ideas)].slice(0, 5);
}

/**
 * The shape of a photo slot in the current layout, so results fit it without heavy cropping.
 * @param design the design
 * @param slot the slot (the last slot for a larger number)
 * @returns the slot's shape, or null when the layout has no photo slots
 */
export function slotOrientation(design: Design, slot: number): PexelsOrientation | null {
  const { w, h } = cardMM(design);
  const { slots } = computeLayout(design.layout, { x: 0, y: 0, w, h, e: 0 }, design);
  const box = slots.at(Math.min(slot, slots.length - 1));
  if (!box) return null;
  const ratio = box.w / box.h;
  if (ratio > 1.2) return 'landscape';
  return ratio < 0.83 ? 'portrait' : 'square';
}
