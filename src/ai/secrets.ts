import { providerDef, type AiProviderId } from '../data/aiProviders';
import { isRecord } from '../engine/guards';
import { desktop } from '../platform/desktop';
import { emitAiChange } from './settings';

/*
 * API keys (Repository pattern with two stores):
 *   - web: localStorage (or sessionStorage when "this session only" is chosen), on this device only, never sent
 *     anywhere except the provider itself;
 *   - desktop: encrypted by the operating system (Electron safeStorage) in the main process. The page can set,
 *     check and delete a key but never read it back: the main process adds it to requests (electron/ai.cjs).
 */

const STORAGE_KEY = 'chitthi-ai-keys';

/** Keys by provider id, as kept in web storage. */
type WebKeys = Partial<Record<string, string>>;

/**
 * The keys kept in one web store.
 * @param store localStorage or sessionStorage
 * @returns the keys (text values only)
 */
function webKeys(store: Storage): WebKeys {
  try {
    const stored: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? '{}');
    if (!isRecord(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch {
    return {};
  }
}

/**
 * Saves one web store's keys (or removes the entry when there are none).
 * @param store localStorage or sessionStorage
 * @param keys the keys
 */
function saveWebKeys(store: Storage, keys: WebKeys): void {
  try {
    if (Object.keys(keys).length) store.setItem(STORAGE_KEY, JSON.stringify(keys));
    else store.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * Removes a provider's key from both web stores.
 * @param id the provider
 */
function forgetWebKey(id: AiProviderId): void {
  for (const store of [localStorage, sessionStorage])
    saveWebKeys(store, Object.fromEntries(Object.entries(webKeys(store)).filter(([provider]) => provider !== id)));
}

/** Whether a provider has a key, and where it is kept. */
export interface KeyInfo {
  has: boolean;
  /** Where it's kept: 'device' (remembered), 'session' (this tab only) or 'encrypted' (desktop). */
  where?: 'device' | 'session' | 'encrypted';
}

/** Desktop: which providers had a key when last asked (the main process holds the keys). */
let desktopCache: Partial<Record<string, boolean>> | null = null;

/**
 * Which providers have a key (local providers never need one).
 * @returns the providers with a key, and where each is kept
 */
export async function keyStatus(): Promise<Partial<Record<AiProviderId, KeyInfo>>> {
  if (desktop?.ai) {
    const stored = await desktop.ai.keys();
    desktopCache = { ...stored };
    return Object.fromEntries(
      Object.entries(stored)
        .filter(([, has]) => has)
        .map(([provider]) => [provider, { has: true, where: 'encrypted' }]),
    );
  }
  const status: Partial<Record<string, KeyInfo>> = {};
  for (const [provider, key] of Object.entries(webKeys(localStorage))) if (key) status[provider] = { has: true, where: 'device' };
  for (const [provider, key] of Object.entries(webKeys(sessionStorage))) if (key) status[provider] = { has: true, where: 'session' };
  return status;
}

/**
 * Web only: the key for a request (the transport's business; desktop never exposes keys to the page).
 * @param id the provider
 * @returns the session key, else the remembered one, else ''
 */
export function webKeyFor(id: AiProviderId): string {
  return [webKeys(sessionStorage)[id], webKeys(localStorage)[id]].find((key) => !!key) ?? '';
}

/**
 * Whether the provider is ready: it has a key, or needs none. Uses the last known desktop state (sync).
 * @param id the provider
 * @returns true when calls can be made
 */
export function hasKeySync(id: AiProviderId): boolean {
  if (!providerDef(id)?.key) return true;
  if (desktop?.ai) return !!desktopCache?.[id];
  return !!webKeyFor(id);
}

/**
 * Saves a provider's key.
 * @param id the provider
 * @param key the key (trimmed)
 * @param options web: keep it for this session only; desktop: the base URL it may go to (custom services)
 */
export async function setKey(id: AiProviderId, key: string, options: { session?: boolean; base?: string } = {}): Promise<void> {
  const trimmed = key.trim();
  if (desktop?.ai) {
    await desktop.ai.setKey(id, trimmed, options.base ?? '');
    await keyStatus();
  } else {
    forgetWebKey(id);
    const store = options.session ? sessionStorage : localStorage;
    saveWebKeys(store, { ...webKeys(store), [id]: trimmed });
  }
  emitAiChange();
}

/**
 * Deletes a provider's key.
 * @param id the provider
 */
export async function deleteKey(id: AiProviderId): Promise<void> {
  if (desktop?.ai) {
    await desktop.ai.deleteKey(id);
    await keyStatus();
  } else forgetWebKey(id);
  emitAiChange();
}
