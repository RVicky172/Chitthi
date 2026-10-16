import { afterEach, describe, expect, it, vi } from 'vitest';
// electron/ai.cjs loads in plain Node: `require('electron')` there is only the binary's path, so `app` and
// `safeStorage` are undefined, which is fine for requests that carry no key.
import * as aiBridge from '../../../electron/ai.cjs';

/** A request to the desktop AI bridge, as the page sends it over IPC. */
interface BridgeRequest {
  provider: string;
  url: string;
  noAuth?: boolean;
  form?: [string, string | { data: ArrayBuffer; type: string; name?: string }][];
  json?: unknown;
}

/** The desktop AI bridge's answer. */
interface BridgeResponse {
  status: number;
  error?: string;
  kind?: string;
}

/** The bridge's request function, typed for the tests. */
const aiRequest = aiBridge.aiRequest as unknown as (req: BridgeRequest) => Promise<BridgeResponse>;

/**
 * Stubs `fetch` with an empty 200 answer.
 * @returns the stub, to read what was sent
 */
function stubFetch() {
  const fetchStub = vi.fn(() => Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 })));
  vi.stubGlobal('fetch', fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('electron/ai.cjs request', () => {
  it('sends form fields: text as text, files as files (Stability, Ideogram)', async () => {
    const fetchStub = stubFetch();
    const answer = await aiRequest({
      provider: 'stability',
      url: 'https://api.stability.ai/v2beta/stable-image/generate/core',
      noAuth: true,
      form: [
        ['prompt', 'a red postbox'],
        ['image', { data: new Uint8Array([9]).buffer, type: 'image/png', name: 'photo.png' }],
      ],
    });
    expect(answer.status).toBe(200);
    const init = (fetchStub.mock.calls[0] as unknown as [string, RequestInit])[1];
    const form = init.body as FormData;
    expect(init.method).toBe('POST');
    expect(form.get('prompt')).toBe('a red postbox');
    expect((form.get('image') as File).name).toBe('photo.png');
  });

  it('sends JSON with a JSON content type', async () => {
    const fetchStub = stubFetch();
    await aiRequest({ provider: 'openai', url: 'https://api.openai.com/v1/models', noAuth: true, json: { hello: 1 } });
    const init = (fetchStub.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.body).toBe('{"hello":1}');
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('refuses another host without calling fetch', async () => {
    const fetchStub = stubFetch();
    const answer = await aiRequest({ provider: 'openai', url: 'https://evil.example/v1', noAuth: true });
    expect(answer.status).toBe(0);
    expect(answer.kind).toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
