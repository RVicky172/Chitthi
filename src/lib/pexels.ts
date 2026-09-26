import { themeById } from '../data/themes';
import { calPages, cardMM } from '../engine/design';
import { computeLayout } from '../engine/layout';
import { calMonth } from '../engine/render';
import type { Design } from '../types';

/*
 * Pexels photo search (https://www.pexels.com/api/).
 * Two ways in, tried in this order:
 *   1. a key the user pasted, kept in this browser only, calling api.pexels.com directly;
 *   2. the same-origin proxy at ./api/pexels/ (the Vite dev and preview servers add PEXELS_API_KEY from .env.local
 *      on the server side, so the key never ships in the bundle).
 * When neither is available the search asks for a key.
 */

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  alt: string;
  avg_color: string;
  photographer: string;
  photographer_url: string;
  src: { original: string; large2x: string; large: string; medium: string; small: string; tiny: string };
}
interface SearchResult {
  photos: PexelsPhoto[];
  page: number;
  total_results: number;
  next_page?: string;
}
export type PexelsOrientation = 'landscape' | 'portrait' | 'square';

/** No way to reach Pexels: no proxy on this server and no key saved (or the key was refused). */
export class PexelsKeyError extends Error {
  constructor(readonly refused = false) {
    super(refused ? 'Pexels didn’t accept that API key.' : 'A Pexels API key is needed to search.');
  }
}

const KEY = 'chitthi-pexels-key',
  EVT = 'chitthi:pexels';
export function pexelsKey(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}
export function setPexelsKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the key lasts for this page only */
  }
  cache.clear();
  window.dispatchEvent(new Event(EVT));
}
export const onPexelsKey = (fn: () => void) => {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
};

// Results are kept for the session: moving between steps or months doesn't spend the hourly request allowance.
const cache = new Map<string, Promise<SearchResult>>();

export function searchPexels(query: string, orientation: PexelsOrientation | null, page = 1): Promise<SearchResult> {
  const params = new URLSearchParams({ query, page: String(page), per_page: '24' });
  if (orientation) params.set('orientation', orientation);
  const id = params.toString();
  let hit = cache.get(id);
  if (!hit) {
    hit = request(params);
    cache.set(id, hit);
    hit.catch(() => cache.delete(id));
  }
  return hit;
}

async function request(params: URLSearchParams): Promise<SearchResult> {
  const key = pexelsKey();
  let res: Response;
  try {
    res = key
      ? await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key } })
      : await fetch(new URL(`api/pexels/v1/search?${params}`, location.href));
  } catch {
    if (key) throw new Error('Pexels couldn’t be reached. Check your internet connection.');
    throw new PexelsKeyError();
  }
  const json = (res.headers.get('content-type') ?? '').includes('json');
  // No proxy here: a 404, or the app's own index.html from a single-page-app fallback.
  if (!key && (!json || res.status === 404)) throw new PexelsKeyError();
  if (res.status === 401 || res.status === 403) throw new PexelsKeyError(!!key);
  if (res.status === 429) throw new Error('The Pexels search limit for this hour is used up. Try again a little later.');
  if (!res.ok || !json) throw new Error('The Pexels search didn’t work. Try again.');
  return (await res.json()) as SearchResult;
}

/** A print-sized copy (long side up to 3000 px, never larger than the original). */
export function printUrl(p: PexelsPhoto): string {
  const long = Math.min(3000, Math.max(p.width, p.height));
  return `${p.src.original}?auto=compress&cs=tinysrgb&${p.width >= p.height ? 'w' : 'h'}=${long}`;
}

/** Downloads a photo as a data URL, so it keeps working offline and in saved designs like an upload. */
export async function fetchPexels(p: PexelsPhoto): Promise<{ name: string; url: string }> {
  const res = await fetch(printUrl(p));
  if (!res.ok) throw new Error('download failed');
  const blob = await res.blob();
  const url = await new Promise<string>((ok, fail) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result));
    fr.onerror = () => fail(fr.error);
    fr.readAsDataURL(blob);
  });
  const alt = (p.alt || 'Photo').replace(/\s+/g, ' ').trim().slice(0, 60);
  return { name: `${alt} (Pexels / ${p.photographer})`, url };
}

/* ---------- suggestions from the design ---------- */

/** Search words for each occasion theme (theme names alone find too many unrelated photos). */
const THEME_WORDS: Record<string, string> = {
  diwali: 'diwali diya lights',
  holi: 'holi colours',
  rakhi: 'raksha bandhan rakhi',
  eid: 'eid moon lanterns',
  navratri: 'navratri garba',
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
  kids: 'kids birthday party balloons',
  parents: 'parents smiling together',
  friends: 'friends laughing',
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
  frame: ['family portrait', 'mountain landscape', 'couple wedding'],
  magnet: ['cute puppy', 'family smiling', 'travel landmark', 'flowers close up'],
};

/** Search ideas for the current design: the month (calendars), the occasion, then the product. */
export function pexelsSuggestions(d: Design, page: number): string[] {
  const out: string[] = [];
  if (d.product === 'calendar' && d.layout !== 'cal-strip') out.push(MONTH_WORDS[calMonth(d, Math.min(page, calPages(d) - 1)).month]);
  if (d.useOccasion) out.push(THEME_WORDS[d.themeId] ?? themeById(d.themeId).name.toLowerCase());
  out.push(...PRODUCT_WORDS[d.product]);
  return [...new Set(out)].slice(0, 5);
}

/** The shape of a photo slot in the current layout, so results fit it without heavy cropping. */
export function slotOrientation(d: Design, slot: number): PexelsOrientation | null {
  const { w, h } = cardMM(d),
    L = computeLayout(d.layout, { x: 0, y: 0, w, h, e: 0 }, d),
    s = L.slots[Math.min(slot, L.slots.length - 1)];
  if (!s) return null;
  const r = s.w / s.h;
  return r > 1.2 ? 'landscape' : r < 0.83 ? 'portrait' : 'square';
}
