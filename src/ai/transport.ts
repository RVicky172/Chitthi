import HOSTS from '../../electron/ai-hosts.json';
import type { AiProviderId } from '../data/aiProviders';
import { isRecord } from '../engine/guards';
import { desktop, type DesktopBridge } from '../platform/desktop';
import { webKeyFor } from './secrets';
import { AiError, type AiHttp, type AiInit } from './types';

/*
 * How requests reach a provider (Bridge pattern). Adapters describe requests; the transport sends them:
 *   - web: the browser calls the provider and adds the key itself, only for the provider's hosts (ai-hosts.json);
 *   - desktop: the request goes to the main process (electron/ai.cjs), which adds the key there. The key never enters
 *     the page, and no CORS applies, so desktop-only providers work too.
 */

/** How a provider authenticates and which hosts may receive its key (one entry of ai-hosts.json). */
interface HostRule {
  /** The key's header ('' for none). */
  header: string;
  /** What goes before the key ("Bearer "). */
  prefix: string;
  /** The API hosts; ".example.com" means any host under it. */
  hosts: string[];
  /** Hosts that serve generated images: fetched without the key. */
  resultHosts?: string[];
  /** The user's own machine: the key may go only to the base URL's origin. */
  local?: boolean;
  /** A custom OpenAI-compatible service: likewise. */
  custom?: boolean;
}

/** A form field on its way to the main process (Blobs as bytes). */
type WireField = [string, string | { data: ArrayBuffer; type: string; name: string }];

/**
 * Whether a value is a list of texts.
 * @param value anything
 * @returns true for an array of strings
 */
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/**
 * Whether an entry of ai-hosts.json is a usable rule.
 * @param value the entry
 * @returns true when it has a header, a prefix and its hosts
 */
function isHostRule(value: unknown): value is HostRule {
  return (
    isRecord(value) &&
    typeof value.header === 'string' &&
    typeof value.prefix === 'string' &&
    isTextList(value.hosts) &&
    (value.resultHosts === undefined || isTextList(value.resultHosts))
  );
}

/** The rules by provider; a provider without a usable rule gets no key. */
const RULES: Partial<Record<string, HostRule>> = Object.fromEntries(
  Object.entries(HOSTS).filter((entry): entry is [string, HostRule] => isHostRule(entry[1])),
);

/**
 * Whether a host is one of a list.
 * @param host the URL's host name
 * @param list host names; ".example.com" matches any host ending with it
 * @returns true when it matches
 */
const matches = (host: string, list: string[] = []): boolean => list.some((listed) => (listed.startsWith('.') ? host.endsWith(listed) : host === listed));

/**
 * Whether this provider's key may go to `url` (its own API hosts, or the base URL of a local / custom service).
 * @param provider the provider
 * @param url the request's URL
 * @param base the base URL of a local or custom service
 * @returns true only for https URLs on the provider's hosts, or the base URL's origin for local / custom services
 */
export function keyAllowed(provider: AiProviderId, url: string, base: string): boolean {
  const rule = RULES[provider];
  if (!rule) return false;
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (rule.local || rule.custom) {
    try {
      return !!base && target.origin === new URL(base).origin;
    } catch {
      return false;
    }
  }
  return target.protocol === 'https:' && matches(target.hostname, rule.hosts);
}

/**
 * Whether a URL is on one of the provider's result hosts (generated images, fetched without the key).
 * @param provider the provider
 * @param url the URL
 * @returns true for https URLs on its result hosts
 */
export const isResultHost = (provider: AiProviderId, url: string): boolean => {
  try {
    const target = new URL(url);
    return target.protocol === 'https:' && matches(target.hostname, RULES[provider]?.resultHosts);
  } catch {
    return false;
  }
};

/**
 * A request's body for fetch.
 * @param init the request
 * @returns the body and its content type (form data sets its own)
 */
function bodyOf(init: AiInit): { body?: BodyInit; type?: string } {
  if (init.form) {
    const form = new FormData();
    for (const [name, value] of init.form) form.append(name, value);
    return { body: form };
  }
  if (init.json !== undefined) return { body: JSON.stringify(init.json), type: 'application/json' };
  return {};
}

/**
 * Serialises a request for the desktop bridge (Blobs become ArrayBuffers).
 * @param init the request
 * @returns its method, headers, JSON and form fields
 */
async function wire(init: AiInit): Promise<{ method: string; headers: Record<string, string>; json?: unknown; form?: WireField[] }> {
  const form = init.form
    ? await Promise.all(
        init.form.map(async ([name, value]): Promise<WireField> => {
          if (typeof value === 'string') return [name, value];
          const fileName = value instanceof File ? value.name : '';
          return [name, { data: await value.arrayBuffer(), type: value.type, name: fileName || 'file' }];
        }),
      )
    : undefined;
  const method = init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET');
  return { method, headers: init.headers ?? {}, json: init.json, form };
}

/**
 * The error for a cancelled request.
 * @returns the error
 */
const cancelled = () => new AiError('Cancelled.', 'cancelled');

/**
 * Sends a request through the main process, which adds the key.
 * @param ai the desktop bridge's AI channel
 * @param request the provider, URL, base URL and whether to leave the key out
 * @param init the request
 * @returns the provider's answer
 */
async function sendFromDesktop(
  ai: NonNullable<DesktopBridge['ai']>,
  request: { provider: AiProviderId; url: string; base: string; noAuth: boolean },
  init: AiInit,
): Promise<Response> {
  const answer = await ai.fetch({ ...request, ...(await wire(init)) });
  if (init.signal?.aborted) throw cancelled();
  if (answer.error) throw new AiError(answer.error, answer.kind === 'key' ? 'key' : 'network');
  return new Response(answer.body, { status: answer.status, statusText: answer.statusText, headers: answer.headers });
}

/**
 * Sends a request from the page, adding the key only when it is allowed to go there.
 * @param provider the provider
 * @param url the request's URL (already checked against the provider's hosts)
 * @param init the request
 * @param isKeyless true for a result host or a request that asks for no key
 * @returns the provider's answer
 */
async function sendFromWeb(provider: AiProviderId, url: string, init: AiInit, isKeyless: boolean): Promise<Response> {
  const { body, type } = bodyOf(init);
  const headers: Record<string, string> = { ...(type ? { 'content-type': type } : {}), ...init.headers };
  const rule = RULES[provider];
  const isKeyed = !isKeyless && !!rule?.header;
  if (isKeyed) {
    const key = webKeyFor(provider);
    if (!key) throw new AiError('Add your API key for this provider in Settings → AI.', 'key');
    headers[rule.header] = rule.prefix + key;
  }
  try {
    // A request carrying a key never follows a redirect: custom key headers would go along to the new host.
    return await fetch(url, { method: init.method ?? (body ? 'POST' : 'GET'), headers, body, signal: init.signal, redirect: isKeyed ? 'error' : 'follow' });
  } catch (error) {
    if (init.signal?.aborted) throw cancelled();
    const reason = error instanceof Error && error.message ? ' (' + error.message + ')' : '';
    const local = rule?.local ? ', and that the local AI server is running and allows this site' : '';
    throw new AiError(`Couldn’t reach the provider${reason}. Check your connection${local}.`, 'network');
  }
}

/**
 * A fetch-compatible request's URL.
 * @param input a URL, its text or a Request
 * @returns the URL as text
 */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/**
 * The transport for one provider.
 * @param provider the provider
 * @param base the base URL of a local or custom service ('' otherwise)
 * @returns fetch for adapters, and a fetch-compatible function for SDKs
 */
export function transportFor(provider: AiProviderId, base: string): AiHttp {
  const send = async (url: string, init: AiInit = {}): Promise<Response> => {
    if (init.signal?.aborted) throw cancelled();
    const isResult = isResultHost(provider, url);
    if (!isResult && !keyAllowed(provider, url, base)) throw new AiError(`Chitthi won’t send requests for this provider to ${new URL(url).host}.`, 'setup');
    if (desktop?.ai) return sendFromDesktop(desktop.ai, { provider, url, base, noAuth: isResult || !!init.noAuth }, init);
    return sendFromWeb(provider, url, init, isResult || !!init.noAuth);
  };
  // A fetch-compatible function for SDKs: their own headers and body pass through the same checks.
  const sdkFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const keyHeader = RULES[provider]?.header.toLowerCase();
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => {
      // On desktop the SDK carries a placeholder key; the main process puts the real one in.
      if (!(desktop?.ai && name.toLowerCase() === keyHeader)) headers[name] = value;
    });
    const json: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    return send(urlOf(input), { method: init?.method ?? 'GET', headers, json, signal: init?.signal ?? undefined });
  };
  return { fetch: send, sdkFetch };
}
