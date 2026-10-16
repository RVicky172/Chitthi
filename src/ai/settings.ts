import { providerDef, type AiKind, type AiProviderId } from '../data/aiProviders';
import { isRecord } from '../engine/guards';

/*
 * AI settings that aren't secret: which provider and model to use for words and for pictures, base URLs for local
 * and custom services, daily limits and today's usage. Kept in localStorage (both web and desktop). API keys are
 * separate (src/ai/secrets.ts).
 */

/** The provider and model chosen for words or for pictures. */
export interface AiChoice {
  /** A provider id, '' for none; a stored id may name a provider no longer offered (aiReady says so). */
  provider: string;
  model: string;
}

/** The AI settings. */
export interface AiSettings {
  text: AiChoice;
  image: AiChoice;
  /** Base URL overrides for ollama, lmstudio and custom. */
  bases: Partial<Record<string, string>>;
  /** Requests allowed per day (a guard against runaway cost). */
  limits: { text: number; image: number };
  /** Today's requests (`day` is the ISO date they were counted on). */
  usage: { day: string; text: number; image: number };
  /** Anthropic: let the API retry a declined request on another Claude model (server-side fallback). */
  fallbacks: boolean;
}

const KEY = 'chitthi-ai';
/** The event sent when the settings or keys change. */
const CHANGE_EVENT = 'chitthi:ai';
const DEFAULTS: AiSettings = {
  text: { provider: '', model: '' },
  image: { provider: '', model: '' },
  bases: {},
  limits: { text: 200, image: 30 },
  usage: { day: '', text: 0, image: 0 },
  fallbacks: true,
};

/**
 * A stored text.
 * @param value the stored value
 * @param fallback the default
 * @returns the value when it is text, else the default
 */
const storedText = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

/**
 * A stored number.
 * @param value the stored value
 * @param fallback the default
 * @returns the value when it is a number, else the default
 */
const storedNumber = (value: unknown, fallback: number): number => (typeof value === 'number' ? value : fallback);

/**
 * A stored provider and model.
 * @param stored the stored group
 * @returns the choice ('' for anything missing)
 */
function choiceOf(stored: unknown): AiChoice {
  const group = isRecord(stored) ? stored : {};
  return { provider: storedText(group.provider, ''), model: storedText(group.model, '') };
}

/**
 * A stored pair of numbers for words and pictures.
 * @param stored the stored group
 * @param defaults the defaults
 * @returns the numbers
 */
function perKindOf(stored: unknown, defaults: { text: number; image: number }): { text: number; image: number } {
  const group = isRecord(stored) ? stored : {};
  return { text: storedNumber(group.text, defaults.text), image: storedNumber(group.image, defaults.image) };
}

/**
 * Stored settings made whole: each field of the right type kept, the defaults for the rest.
 * @param stored the parsed localStorage value
 * @returns the settings
 */
export function mergeAiSettings(stored: unknown): AiSettings {
  const saved = isRecord(stored) ? stored : {};
  const bases = isRecord(saved.bases) ? Object.fromEntries(Object.entries(saved.bases).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};
  return {
    text: choiceOf(saved.text),
    image: choiceOf(saved.image),
    bases,
    limits: perKindOf(saved.limits, DEFAULTS.limits),
    usage: { day: storedText(isRecord(saved.usage) ? saved.usage.day : undefined, ''), ...perKindOf(saved.usage, DEFAULTS.usage) },
    fallbacks: typeof saved.fallbacks === 'boolean' ? saved.fallbacks : DEFAULTS.fallbacks,
  };
}

/**
 * The AI settings.
 * @returns the stored settings, with defaults for anything missing
 */
export function aiSettings(): AiSettings {
  try {
    return mergeAiSettings(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/**
 * Changes some settings and tells the app.
 * @param patch the settings to change
 */
export function setAiSettings(patch: Partial<AiSettings>): void {
  const next = { ...aiSettings(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: settings last for this page */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Listens for changes of the settings or keys.
 * @param listener called on each change
 * @returns a function that stops listening
 */
export const onAiSettings = (listener: () => void): (() => void) => {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
};

/** Tells the app the settings or keys changed. */
export const emitAiChange = (): void => {
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

/**
 * The base URL for a provider: the user's override, else the provider's default.
 * @param id the provider
 * @returns the base URL without trailing slashes
 */
export const baseFor = (id: AiProviderId): string => {
  const base = aiSettings().bases[id] ?? providerDef(id)?.base ?? '';
  let end = base.length;
  while (end > 0 && base[end - 1] === '/') end--;
  return base.slice(0, end);
};

/**
 * The model to use: the chosen one, else the provider's first suggestion.
 * @param kind words or pictures
 * @param id the provider
 * @returns the model, or '' when the provider suggests none
 */
export function modelFor(kind: AiKind, id: AiProviderId): string {
  const chosen = aiSettings()[kind];
  const def = providerDef(id);
  if (chosen.provider === id && chosen.model) return chosen.model;
  return (kind === 'text' ? def?.textModels : def?.imageModels)?.[0] ?? '';
}

/**
 * Today's date, as stored with the usage.
 * @returns the ISO date
 */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Counts one request against today's limit.
 * @param kind words or pictures
 * @throws Error when the limit is reached
 */
export function spend(kind: AiKind): void {
  const settings = aiSettings();
  const usage = settings.usage.day === today() ? settings.usage : { day: today(), text: 0, image: 0 };
  if (usage[kind] >= settings.limits[kind])
    throw new Error(`Today’s limit of ${settings.limits[kind]} AI ${kind === 'text' ? 'writing' : 'picture'} requests is used up. Change it in Settings → AI.`);
  setAiSettings({ usage: { ...usage, [kind]: usage[kind] + 1 } });
}

/**
 * Today's requests so far.
 * @returns words and picture requests counted today
 */
export function usageToday(): { text: number; image: number } {
  const { usage } = aiSettings();
  return usage.day === today() ? { text: usage.text, image: usage.image } : { text: 0, image: 0 };
}
