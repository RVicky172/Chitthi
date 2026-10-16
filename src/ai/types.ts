import type { AiProviderDef } from '../data/aiProviders';
import { isRecord } from '../engine/guards';

/*
 * The contracts every AI provider adapter implements (Strategy pattern). An adapter never sees an API key: it asks
 * the transport (src/ai/transport.ts) to make requests, and the transport adds the key (web) or has the desktop main
 * process add it (desktop), only for that provider's own hosts.
 */

/** Request options for the transport. `json` is sent as the body; `form` as multipart/form-data. */
export interface AiInit {
  /** GET or POST (SDKs may use others); by default POST when there is a body. */
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  form?: [string, string | Blob][];
  /** Fetch a generated image from a result host: never send the key. */
  noAuth?: boolean;
  signal?: AbortSignal;
}

/** How adapters make requests (the transport adds the key). */
export interface AiHttp {
  fetch(url: string, init?: AiInit): Promise<Response>;
  /** A standard fetch function for SDKs (the Anthropic SDK takes a custom `fetch`). */
  sdkFetch: typeof fetch;
}

/** What an adapter gets for one call. */
export interface AiCtx {
  http: AiHttp;
  def: AiProviderDef;
  model: string;
  /** Base URL for OpenAI-compatible providers (with any user override applied). */
  base: string;
  /** On the web the key is available to SDKs that need it at construction; on desktop this is a placeholder. */
  sdkKey: string;
  signal?: AbortSignal;
}

/** JSON Schema for structured output (a small subset every provider accepts). */
export type JsonSchema = Record<string, unknown>;

/** A request for structured words. */
export interface TextRequest {
  system: string;
  prompt: string;
  schema: JsonSchema;
  /** Name for the schema (OpenAI-style structured outputs require one). */
  schemaName: string;
  maxTokens: number;
}

/** A picture's shape as providers name it. */
export type Aspect = '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16' | '5:4' | '4:5';

/** Every shape with its width / height. */
export const ASPECTS: [Aspect, number][] = [
  ['1:1', 1],
  ['5:4', 5 / 4],
  ['4:5', 4 / 5],
  ['4:3', 4 / 3],
  ['3:4', 3 / 4],
  ['3:2', 3 / 2],
  ['2:3', 2 / 3],
  ['16:9', 16 / 9],
  ['9:16', 9 / 16],
];

/**
 * The listed aspect nearest to width / height (on a log scale, so 2:1 and 1:2 are equally far from 1:1).
 * @param ratio width / height
 * @param allowed the shapes the provider makes
 * @returns the nearest of them (1:1 when none is allowed)
 */
export function nearestAspect(ratio: number, allowed: Aspect[] = ASPECTS.map(([aspect]) => aspect)): Aspect {
  let best: Aspect = allowed[0] ?? '1:1';
  let bestDistance = Infinity;
  for (const [aspect, aspectRatio] of ASPECTS) {
    if (!allowed.includes(aspect)) continue;
    const distance = Math.abs(Math.log(aspectRatio) - Math.log(ratio));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = aspect;
    }
  }
  return best;
}

/** A request for pictures. */
export interface ImageRequest {
  prompt: string;
  aspect: Aspect;
  /** Number of pictures (providers that can't make several are called once per picture). */
  n: number;
}

/** A provider's words adapter (Strategy). */
export interface TextAdapter {
  generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown>;
  listModels?(ctx: AiCtx): Promise<string[]>;
}

/** A provider's pictures adapter (Strategy). */
export interface ImageAdapter {
  generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]>;
  listModels?(ctx: AiCtx): Promise<string[]>;
}

/** What a provider module exports. */
export interface ProviderModule {
  text?: TextAdapter;
  image?: ImageAdapter;
}

/** A failure the user can act on: wrong key, limit reached, refused, offline… */
export class AiError extends Error {
  /**
   * @param message the message for the user
   * @param kind what went wrong
   */
  constructor(
    message: string,
    readonly kind: 'key' | 'limit' | 'refused' | 'network' | 'setup' | 'bad-output' | 'cancelled' | 'provider',
  ) {
    super(message);
  }
}

/**
 * The explanation in a provider's error body.
 * @param body the parsed body
 * @returns `error` (text or its message), `message` or `detail`, or ''
 */
function errorDetail(body: unknown): string {
  if (!isRecord(body)) return '';
  const { error, message, detail } = body;
  const errorMessage: unknown = isRecord(error) ? error.message : undefined;
  const detailText = typeof detail === 'string' ? detail : '';
  const found = typeof error === 'string' ? error : (errorMessage ?? message ?? detailText);
  if (typeof found === 'string') return found;
  // A number or flag reads as text; anything else says nothing useful.
  return (typeof found === 'number' || typeof found === 'boolean') && found ? String(found) : '';
}

/**
 * Turns an HTTP error from a provider into a message worth showing.
 * @param response the provider's answer
 * @param provider the provider's name
 * @returns the error, with its kind from the status
 */
export async function httpError(response: Response, provider: string): Promise<AiError> {
  let detail = '';
  try {
    detail = errorDetail(JSON.parse(await response.text()));
  } catch {
    /* not JSON */
  }
  const tail = detail ? ` (${detail.slice(0, 160)})` : '';
  if (response.status === 401 || response.status === 403) return new AiError(`${provider} didn’t accept the API key${tail}.`, 'key');
  if (response.status === 402) return new AiError(`${provider} says the account is out of credit${tail}.`, 'limit');
  if (response.status === 429) return new AiError(`${provider}’s rate limit was reached. Wait a little and try again${tail}.`, 'limit');
  if (response.status === 400 && /safety|policy|moderation|content/i.test(detail))
    return new AiError(`${provider} declined this request${tail}. Try different words.`, 'refused');
  return new AiError(`${provider} returned an error ${response.status}${tail}.`, 'provider');
}

/**
 * The text of the first triple-backtick fence (an optional "json" after the opening dropped, and the spaces after it).
 * @param text model text
 * @returns the fence's contents, or null when there is no closed fence
 */
function fencedText(text: string): string | null {
  const open = text.indexOf('```');
  if (open < 0) return null;
  let start = open + 3;
  if (text.slice(start, start + 4).toLowerCase() === 'json') start += 4;
  while (start < text.length && /\s/.test(text.charAt(start))) start++;
  const close = text.indexOf('```', start);
  return close < 0 ? null : text.slice(start, close);
}

/**
 * Pulls a JSON object out of model text that may wrap it in prose or triple-backtick fences.
 * @param text the model's answer
 * @returns the parsed value
 * @throws AiError when no JSON can be found
 */
export function parseJsonLoose(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = fencedText(trimmed);
  if (fenced !== null) {
    try {
      return JSON.parse(fenced);
    } catch {
      /* fall through */
    }
  }
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
  throw new AiError('The AI answer wasn’t in the expected format. Try again.', 'bad-output');
}

/**
 * A picture from base64.
 * @param base64 the bytes as base64
 * @param type the image type
 * @returns the picture
 */
export const blobFromBase64 = (base64: string, type = 'image/png'): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
};

/**
 * Waits, unless cancelled.
 * @param ms how long, in milliseconds
 * @param signal cancels the wait
 * @returns resolves after the wait; rejects with a 'cancelled' AiError when the signal aborts
 */
export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new AiError('Cancelled.', 'cancelled'));
    });
  });
