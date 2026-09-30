import { providerDef, type AiKind, type AiProviderId } from '../data/aiProviders';

/*
 * AI settings that aren't secret: which provider and model to use for words and for pictures, base URLs for local
 * and custom services, daily limits and today's usage. Kept in localStorage (both web and desktop). API keys are
 * separate (src/ai/secrets.ts).
 */

export interface AiSettings {
  text: { provider: AiProviderId | ''; model: string };
  image: { provider: AiProviderId | ''; model: string };
  /** Base URL overrides for ollama, lmstudio and custom. */
  bases: Partial<Record<AiProviderId, string>>;
  /** Requests allowed per day (a guard against runaway cost). */
  limits: { text: number; image: number };
  usage: { day: string; text: number; image: number };
  /** Anthropic: let the API retry a declined request on another Claude model (server-side fallback). */
  fallbacks: boolean;
}

const KEY = 'chitthi-ai',
  EVT = 'chitthi:ai';
const DEFAULTS: AiSettings = {
  text: { provider: '', model: '' },
  image: { provider: '', model: '' },
  bases: {},
  limits: { text: 200, image: 30 },
  usage: { day: '', text: 0, image: 0 },
  fallbacks: true,
};

export function aiSettings(): AiSettings {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<AiSettings>;
    return { ...DEFAULTS, ...s, text: { ...DEFAULTS.text, ...s.text }, image: { ...DEFAULTS.image, ...s.image }, bases: { ...s.bases }, limits: { ...DEFAULTS.limits, ...s.limits }, usage: { ...DEFAULTS.usage, ...s.usage } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}
export function setAiSettings(patch: Partial<AiSettings>): void {
  const next = { ...aiSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: settings last for this page */
  }
  window.dispatchEvent(new Event(EVT));
}
export const onAiSettings = (fn: () => void) => {
  window.addEventListener(EVT, fn);
  return () => window.removeEventListener(EVT, fn);
};
export const emitAiChange = () => window.dispatchEvent(new Event(EVT));

/** The base URL for a provider: the user's override, else the provider's default. */
export const baseFor = (id: AiProviderId): string => (aiSettings().bases[id] ?? providerDef(id)?.base ?? '').replace(/\/+$/, '');

/** The model to use: the chosen one, else the provider's first suggestion. */
export function modelFor(kind: AiKind, id: AiProviderId): string {
  const s = aiSettings()[kind],
    def = providerDef(id);
  if (s.provider === id && s.model) return s.model;
  return (kind === 'text' ? def?.textModels : def?.imageModels)?.[0] ?? '';
}

const today = () => new Date().toISOString().slice(0, 10);

/** Counts one request against today's limit; throws when the limit is reached. */
export function spend(kind: AiKind): void {
  const s = aiSettings(),
    u = s.usage.day === today() ? s.usage : { day: today(), text: 0, image: 0 };
  if (u[kind] >= s.limits[kind])
    throw new Error(`Today’s limit of ${s.limits[kind]} AI ${kind === 'text' ? 'writing' : 'picture'} requests is used up. Change it in Settings → AI.`);
  setAiSettings({ usage: { ...u, [kind]: u[kind] + 1 } });
}
export function usageToday(): { text: number; image: number } {
  const u = aiSettings().usage;
  return u.day === today() ? { text: u.text, image: u.image } : { text: 0, image: 0 };
}
