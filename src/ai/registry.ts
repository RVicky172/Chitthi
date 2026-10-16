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

/** Loads a provider's adapter module. */
type Loader = () => Promise<ProviderModule>;

const openaiCompat: Loader = () => import('./providers/openaiCompat');
/** Each provider's loader. */
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
/**
 * Registers a fake provider (self-test only).
 * @param def its description
 * @param module its adapters
 */
export function registerTestProvider(def: AiProviderDef, module: ProviderModule): void {
  extra.set(def.id, { def, module });
}

const cache = new Map<string, Promise<ProviderModule>>();

/**
 * A provider's description and adapters, loading its module once.
 * @param id the provider
 * @returns its description and module
 * @throws AiError for an unknown provider
 */
export async function loadProvider(id: AiProviderId): Promise<{ def: AiProviderDef; module: ProviderModule }> {
  const testProvider = extra.get(id);
  if (testProvider) return testProvider;
  const def = providerDef(id);
  if (!def) throw new AiError(`Unknown AI provider “${id}”.`, 'setup');
  let moduleLoad = cache.get(id);
  if (!moduleLoad) {
    moduleLoad = LOADERS[id]();
    cache.set(id, moduleLoad);
    moduleLoad.catch(() => cache.delete(id));
  }
  return { def, module: await moduleLoad };
}

/**
 * Whether a provider can run here: desktop-only providers need the desktop app.
 * @param def the provider
 * @returns true when it can be called from here
 */
export const runsHere = (def: AiProviderDef): boolean => def.web === 'direct' || !!desktop?.ai;

/**
 * The model a request uses.
 * @param model the model asked for ('' or undefined for none)
 * @param kind words or pictures
 * @param def the provider
 * @returns that model, else the one chosen in Settings, else the provider's first suggestion
 */
function modelOr(model: string | undefined, kind: AiKind, def: AiProviderDef): string {
  if (model) return model;
  return modelFor(kind, def.id);
}

/**
 * Everything an adapter needs for one request.
 * @param def the provider
 * @param kind words or pictures
 * @param signal cancels the request
 * @param model the model (default: the one chosen in Settings, else the provider's first suggestion)
 * @returns the context
 */
export function contextFor(def: AiProviderDef, kind: AiKind, signal?: AbortSignal, model?: string): AiCtx {
  const base = baseFor(def.id);
  return {
    http: transportFor(def.id, base),
    def,
    model: modelOr(model, kind, def),
    base,
    // Desktop: a placeholder the main process replaces; web: the key itself (for SDKs that want one).
    sdkKey: desktop?.ai ? 'desktop-managed' : webKeyFor(def.id) || 'no-key',
    signal,
  };
}
