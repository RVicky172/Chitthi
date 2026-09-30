import { providerDef, type AiKind, type AiProviderDef, type AiProviderId } from '../data/aiProviders';
import { desktop } from '../platform/desktop';
import { webKeyFor } from './secrets';
import { baseFor, modelFor } from './settings';
import { transportFor } from './transport';
import { AiError, type AiCtx, type ProviderModule } from './types';

/*
 * Provider registry (Registry + lazy factories). Each entry loads its adapter module only when first used, so no
 * AI code is downloaded until someone asks for words or a picture. To add a provider: describe it in
 * src/data/aiProviders.ts and electron/ai-hosts.json, write src/ai/providers/<name>.ts, and add one line here.
 */

type Loader = () => Promise<ProviderModule>;

const openaiCompat: Loader = () => import('./providers/openaiCompat');
const LOADERS: Record<AiProviderId, Loader> = {
  anthropic: () => import('./providers/anthropic'),
  openai: () => import('./providers/openai'),
  gemini: () => import('./providers/gemini'),
  openrouter: openaiCompat,
  groq: openaiCompat,
  deepseek: openaiCompat,
  mistral: openaiCompat,
  together: openaiCompat,
  ollama: openaiCompat,
  lmstudio: openaiCompat,
  custom: openaiCompat,
  stability: () => import('./providers/stability'),
  fal: () => import('./providers/fal'),
  bfl: () => import('./providers/bfl'),
  replicate: () => import('./providers/replicate'),
  ideogram: () => import('./providers/ideogram'),
};

// Tests (npm test) register a fake provider here so the whole flow runs without real API calls.
const extra = new Map<string, { def: AiProviderDef; module: ProviderModule }>();
export function registerTestProvider(def: AiProviderDef, module: ProviderModule): void {
  extra.set(def.id, { def, module });
}

const cache = new Map<string, Promise<ProviderModule>>();
export async function loadProvider(id: AiProviderId): Promise<{ def: AiProviderDef; module: ProviderModule }> {
  const x = extra.get(id);
  if (x) return x;
  const def = providerDef(id);
  if (!def) throw new AiError(`Unknown AI provider “${id}”.`, 'setup');
  let p = cache.get(id);
  if (!p) {
    p = LOADERS[id]();
    cache.set(id, p);
    p.catch(() => cache.delete(id));
  }
  return { def, module: await p };
}

/** Whether a provider can run here: desktop-only providers need the desktop app. */
export const runsHere = (def: AiProviderDef): boolean => def.web === 'direct' || !!desktop?.ai;

/** Everything an adapter needs for one request. */
export function contextFor(def: AiProviderDef, kind: AiKind, signal?: AbortSignal, model?: string): AiCtx {
  const base = baseFor(def.id);
  return {
    http: transportFor(def.id, base),
    def,
    model: model || modelFor(kind, def.id),
    base,
    // Desktop: a placeholder the main process replaces; web: the key itself (for SDKs that want one).
    sdkKey: desktop?.ai ? 'desktop-managed' : webKeyFor(def.id) || 'no-key',
    signal,
  };
}
