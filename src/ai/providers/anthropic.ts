import Anthropic from '@anthropic-ai/sdk';
import { aiSettings } from '../settings';
import { AiError, parseJsonLoose, type AiCtx, type ProviderModule, type TextRequest } from '../types';

/*
 * Anthropic Claude, through the official SDK. In the browser the SDK needs dangerouslyAllowBrowser (the key is the
 * user's own, kept on their device); on desktop its requests go through the main process, which adds the key.
 * Structured output returns JSON matching the schema. Short greeting copy needs little thinking, so effort is low.
 * The server-side fallback (on by default, Settings → AI) retries a declined request on another Claude model.
 */

function client(ctx: AiCtx): Anthropic {
  return new Anthropic({ apiKey: ctx.sdkKey, dangerouslyAllowBrowser: true, fetch: ctx.http.sdkFetch, maxRetries: 1 });
}

async function generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown> {
  const c = client(ctx);
  const fallbacks = aiSettings().fallbacks;
  const params = {
    model: ctx.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user' as const, content: req.prompt }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: req.schema } },
    ...(fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } : {}),
  };
  let msg: Anthropic.Beta.BetaMessage | Anthropic.Message;
  try {
    // The beta namespace carries the fallback parameter; the plain one is used when it's turned off.
    msg = fallbacks
      ? await c.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming, { signal: ctx.signal })
      : await c.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming, { signal: ctx.signal });
  } catch (e) {
    throw mapError(e);
  }
  if (msg.stop_reason === 'refusal') throw new AiError('Claude declined this request. Try different words.', 'refused');
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  if (!text) throw new AiError('Claude returned no text. Try again.', 'bad-output');
  return parseJsonLoose(text);
}

async function listModels(ctx: AiCtx): Promise<string[]> {
  try {
    const out: string[] = [];
    for await (const m of client(ctx).models.list({ limit: 100 })) out.push(m.id);
    return out;
  } catch (e) {
    throw mapError(e);
  }
}

function mapError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return new AiError('Anthropic didn’t accept the API key.', 'key');
  if (e instanceof Anthropic.RateLimitError) return new AiError('Anthropic’s rate limit was reached. Wait a little and try again.', 'limit');
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('Cancelled.', 'cancelled');
  if (e instanceof Anthropic.BadRequestError) return new AiError(`Anthropic couldn’t use this request (${e.message.slice(0, 160)}).`, 'provider');
  if (e instanceof Anthropic.APIConnectionError) return new AiError('Couldn’t reach Anthropic. Check your connection.', 'network');
  if (e instanceof Anthropic.APIError) return new AiError(`Anthropic returned an error ${e.status ?? ''}.`, 'provider');
  return new AiError(e instanceof Error ? e.message : String(e), 'provider');
}

const mod: ProviderModule = { text: { generateJSON, listModels } };
export default mod;
export const text = mod.text;
