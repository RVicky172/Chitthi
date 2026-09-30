import type { AiProviderDef } from '../data/aiProviders';

/*
 * The contracts every AI provider adapter implements (Strategy pattern). An adapter never sees an API key: it asks
 * the transport (src/ai/transport.ts) to make requests, and the transport adds the key (web) or has the desktop main
 * process add it (desktop), only for that provider's own hosts.
 */

/** Request options for the transport. `json` is sent as the body; `form` as multipart/form-data. */
export interface AiInit {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  json?: unknown;
  form?: [string, string | Blob][];
  /** Fetch a generated image from a result host: never send the key. */
  noAuth?: boolean;
  signal?: AbortSignal;
}

export interface AiHttp {
  fetch(url: string, init?: AiInit): Promise<Response>;
  /** A standard fetch function for SDKs (the Anthropic SDK takes a custom `fetch`). */
  sdkFetch: typeof fetch;
}

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

export interface TextRequest {
  system: string;
  prompt: string;
  schema: JsonSchema;
  /** Name for the schema (OpenAI-style structured outputs require one). */
  schemaName: string;
  maxTokens: number;
}

export type Aspect = '1:1' | '4:3' | '3:4' | '3:2' | '2:3' | '16:9' | '9:16' | '5:4' | '4:5';
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
/** The listed aspect nearest to width / height (on a log scale, so 2:1 and 1:2 are equally far from 1:1). */
export function nearestAspect(ratio: number, allowed: Aspect[] = ASPECTS.map(([a]) => a)): Aspect {
  let best = allowed[0],
    d = Infinity;
  for (const [a, r] of ASPECTS) {
    if (!allowed.includes(a)) continue;
    const e = Math.abs(Math.log(r) - Math.log(ratio));
    if (e < d) {
      d = e;
      best = a;
    }
  }
  return best;
}

export interface ImageRequest {
  prompt: string;
  aspect: Aspect;
  /** Number of pictures (providers that can't make several are called once per picture). */
  n: number;
}

export interface TextAdapter {
  generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown>;
  listModels?(ctx: AiCtx): Promise<string[]>;
}
export interface ImageAdapter {
  generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]>;
  listModels?(ctx: AiCtx): Promise<string[]>;
}
export interface ProviderModule {
  text?: TextAdapter;
  image?: ImageAdapter;
}

/** A failure the user can act on: wrong key, limit reached, refused, offline… */
export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'key' | 'limit' | 'refused' | 'network' | 'setup' | 'bad-output' | 'cancelled' | 'provider',
  ) {
    super(message);
  }
}

/** Turns an HTTP error from a provider into a message worth showing. */
export async function httpError(res: Response, provider: string): Promise<AiError> {
  let detail = '';
  try {
    const t = await res.text();
    const j = JSON.parse(t) as { error?: { message?: string } | string; message?: string; detail?: unknown };
    detail = (typeof j.error === 'string' ? j.error : j.error?.message) ?? j.message ?? (typeof j.detail === 'string' ? j.detail : '') ?? '';
  } catch {
    /* not JSON */
  }
  const tail = detail ? ` (${String(detail).slice(0, 160)})` : '';
  if (res.status === 401 || res.status === 403) return new AiError(`${provider} didn’t accept the API key${tail}.`, 'key');
  if (res.status === 402) return new AiError(`${provider} says the account is out of credit${tail}.`, 'limit');
  if (res.status === 429) return new AiError(`${provider}’s rate limit was reached. Wait a little and try again${tail}.`, 'limit');
  if (res.status === 400 && /safety|policy|moderation|content/i.test(detail))
    return new AiError(`${provider} declined this request${tail}. Try different words.`, 'refused');
  return new AiError(`${provider} returned an error ${res.status}${tail}.`, 'provider');
}

/** Pulls a JSON object out of model text that may wrap it in prose or ``` fences. */
export function parseJsonLoose(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const a = t.indexOf('{'),
    b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new AiError('The AI answer wasn’t in the expected format. Try again.', 'bad-output');
}

export const blobFromBase64 = (b64: string, type = 'image/png'): Blob => {
  const bin = atob(b64),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return new Blob([out], { type });
};

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, fail) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      fail(new AiError('Cancelled.', 'cancelled'));
    });
  });
