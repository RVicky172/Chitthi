import HOSTS from '../../electron/ai-hosts.json';
import type { AiProviderId } from '../data/aiProviders';
import { desktop } from '../platform/desktop';
import { webKeyFor } from './secrets';
import { AiError, type AiHttp, type AiInit } from './types';

/*
 * How requests reach a provider (Bridge pattern). Adapters describe requests; the transport sends them:
 *   - web: the browser calls the provider and adds the key itself, only for the provider's hosts (ai-hosts.json);
 *   - desktop: the request goes to the main process (electron/ai.cjs), which adds the key there. The key never enters
 *     the page, and no CORS applies, so desktop-only providers work too.
 */

interface HostRule {
  header: string;
  prefix: string;
  hosts: string[];
  resultHosts?: string[];
  local?: boolean;
  custom?: boolean;
}
const RULES = HOSTS as unknown as Record<string, HostRule>;

const matches = (host: string, list: string[] = []) => list.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h));

/** Whether this provider's key may go to `url` (its own API hosts, or the base URL of a local / custom service). */
export function keyAllowed(provider: AiProviderId, url: string, base: string): boolean {
  const r = RULES[provider];
  if (!r) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (r.local || r.custom) {
    try {
      return !!base && u.origin === new URL(base).origin;
    } catch {
      return false;
    }
  }
  return u.protocol === 'https:' && matches(u.hostname, r.hosts);
}
export const isResultHost = (provider: AiProviderId, url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && matches(u.hostname, RULES[provider]?.resultHosts);
  } catch {
    return false;
  }
};

function bodyOf(init: AiInit): { body?: BodyInit; type?: string } {
  if (init.form) {
    const f = new FormData();
    for (const [k, v] of init.form) f.append(k, v);
    return { body: f };
  }
  if (init.json !== undefined) return { body: JSON.stringify(init.json), type: 'application/json' };
  return {};
}

/** Serialises a request for the desktop bridge (Blobs become ArrayBuffers). */
async function wire(init: AiInit): Promise<{ method: string; headers: Record<string, string>; json?: unknown; form?: [string, string | { data: ArrayBuffer; type: string; name: string }][] }> {
  const form = init.form
    ? await Promise.all(
        init.form.map(async ([k, v]) => [k, typeof v === 'string' ? v : { data: await v.arrayBuffer(), type: v.type, name: (v as File).name || 'file' }] as [string, string | { data: ArrayBuffer; type: string; name: string }]),
      )
    : undefined;
  return { method: init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET'), headers: init.headers ?? {}, json: init.json, form };
}

export function transportFor(provider: AiProviderId, base: string): AiHttp {
  const send = async (url: string, init: AiInit = {}): Promise<Response> => {
    if (init.signal?.aborted) throw new AiError('Cancelled.', 'cancelled');
    const result = isResultHost(provider, url);
    if (!result && !keyAllowed(provider, url, base)) throw new AiError(`Chitthi won’t send requests for this provider to ${new URL(url).host}.`, 'setup');
    if (desktop?.ai) {
      const w = await wire(init);
      const r = await desktop.ai.fetch({ provider, url, base, noAuth: result || !!init.noAuth, ...w });
      if (init.signal?.aborted) throw new AiError('Cancelled.', 'cancelled');
      if (r.error) throw new AiError(r.error, r.kind === 'key' ? 'key' : 'network');
      return new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
    }
    const { body, type } = bodyOf(init);
    const headers: Record<string, string> = { ...(type ? { 'content-type': type } : {}), ...init.headers };
    const rule = RULES[provider];
    const keyed = !result && !init.noAuth && !!rule?.header;
    if (keyed) {
      const key = webKeyFor(provider);
      if (!key) throw new AiError('Add your API key for this provider in Settings → AI.', 'key');
      headers[rule.header] = rule.prefix + key;
    }
    try {
      // A request carrying a key never follows a redirect: custom key headers would go along to the new host.
      return await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, signal: init.signal, redirect: keyed ? 'error' : 'follow' });
    } catch (e) {
      if (init.signal?.aborted) throw new AiError('Cancelled.', 'cancelled');
      throw new AiError(
        `Couldn’t reach the provider${e instanceof Error && e.message ? ` (${e.message})` : ''}. Check your connection${RULES[provider]?.local ? ', and that the local AI server is running and allows this site' : ''}.`,
        'network',
      );
    }
  };
  // A fetch-compatible function for SDKs: their own headers and body pass through the same checks.
  const sdkFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => {
      // On desktop the SDK carries a placeholder key; the main process puts the real one in.
      if (!(desktop?.ai && k.toLowerCase() === RULES[provider]?.header.toLowerCase())) headers[k] = v;
    });
    const raw = init?.body;
    const json = typeof raw === 'string' ? JSON.parse(raw) : undefined;
    return send(url, { method: (init?.method as 'GET' | 'POST') ?? 'GET', headers, json, signal: init?.signal ?? undefined });
  }) as typeof fetch;
  return { fetch: send, sdkFetch };
}
