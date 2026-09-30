import { providerDef, type AiProviderId } from '../data/aiProviders';
import { desktop } from '../platform/desktop';
import { emitAiChange } from './settings';

/*
 * API keys (Repository pattern with two stores):
 *   - web: localStorage (or sessionStorage when "this session only" is chosen), on this device only, never sent
 *     anywhere except the provider itself;
 *   - desktop: encrypted by the operating system (Electron safeStorage) in the main process. The page can set,
 *     check and delete a key but never read it back: the main process adds it to requests (electron/ai.cjs).
 */

const LS = 'chitthi-ai-keys';

function webKeys(store: Storage): Partial<Record<AiProviderId, string>> {
  try {
    return JSON.parse(store.getItem(LS) ?? '{}');
  } catch {
    return {};
  }
}
function saveWebKeys(store: Storage, keys: Partial<Record<AiProviderId, string>>): void {
  try {
    if (Object.keys(keys).length) store.setItem(LS, JSON.stringify(keys));
    else store.removeItem(LS);
  } catch {
    /* storage blocked */
  }
}

export interface KeyInfo {
  has: boolean;
  /** Where it's kept: 'device' (remembered), 'session' (this tab only) or 'encrypted' (desktop). */
  where?: 'device' | 'session' | 'encrypted';
}

let desktopCache: Partial<Record<AiProviderId, boolean>> | null = null;

/** Which providers have a key (local providers never need one). */
export async function keyStatus(): Promise<Partial<Record<AiProviderId, KeyInfo>>> {
  if (desktop?.ai) {
    const s = await desktop.ai.keys();
    desktopCache = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, !!v])) as Partial<Record<AiProviderId, boolean>>;
    return Object.fromEntries(Object.entries(s).filter(([, v]) => v).map(([k]) => [k, { has: true, where: 'encrypted' }]));
  }
  const out: Partial<Record<AiProviderId, KeyInfo>> = {};
  for (const [k, v] of Object.entries(webKeys(localStorage))) if (v) out[k as AiProviderId] = { has: true, where: 'device' };
  for (const [k, v] of Object.entries(webKeys(sessionStorage))) if (v) out[k as AiProviderId] = { has: true, where: 'session' };
  return out;
}

/** True when the provider is ready: it has a key, or needs none. Uses the last known desktop state (sync). */
export function hasKeySync(id: AiProviderId): boolean {
  if (!providerDef(id)?.key) return true;
  if (desktop?.ai) return !!desktopCache?.[id];
  return !!(webKeys(sessionStorage)[id] || webKeys(localStorage)[id]);
}

export async function setKey(id: AiProviderId, key: string, opts: { session?: boolean; base?: string } = {}): Promise<void> {
  const k = key.trim();
  if (desktop?.ai) {
    await desktop.ai.setKey(id, k, opts.base ?? '');
    await keyStatus();
  } else {
    for (const store of [localStorage, sessionStorage]) {
      const keys = webKeys(store);
      delete keys[id];
      saveWebKeys(store, keys);
    }
    const store = opts.session ? sessionStorage : localStorage;
    saveWebKeys(store, { ...webKeys(store), [id]: k });
  }
  emitAiChange();
}

export async function deleteKey(id: AiProviderId): Promise<void> {
  if (desktop?.ai) {
    await desktop.ai.deleteKey(id);
    await keyStatus();
  } else
    for (const store of [localStorage, sessionStorage]) {
      const keys = webKeys(store);
      delete keys[id];
      saveWebKeys(store, keys);
    }
  emitAiChange();
}

/** Web only: the key for a request (the transport's business; desktop never exposes keys to the page). */
export function webKeyFor(id: AiProviderId): string {
  return webKeys(sessionStorage)[id] || webKeys(localStorage)[id] || '';
}
