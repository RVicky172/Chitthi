import Anthropic from '@anthropic-ai/sdk';
import { aiSettings } from '../settings';
import { AiError, parseJsonLoose, type AiCtx, type ProviderModule, type TextRequest } from '../types';

/*
 * Anthropic Claude, through the official SDK. In the browser the SDK needs dangerouslyAllowBrowser (the key is the
 * user's own, kept on their device); on desktop its requests go through the main process, which adds the key.
 * Structured output returns JSON matching the schema. Short greeting copy needs little thinking, so effort is low.
 * The server-side fallback (on by default, Settings → AI) retries a declined request on another Claude model.
 */

/**
 * The SDK client for one request (its requests go through the transport).
 * @param ctx the request context
 * @returns the client
 */
function client(ctx: AiCtx): Anthropic {
  return new Anthropic({ apiKey: ctx.sdkKey, dangerouslyAllowBrowser: true, fetch: ctx.http.sdkFetch, maxRetries: 1 });
}

/**
 * Structured words from Claude.
 * @param ctx the request context
 * @param req the prompts and schema
 * @returns the parsed JSON
 */
async function generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown> {
  const anthropic = client(ctx);
  const { fallbacks } = aiSettings();
  const params = {
    model: ctx.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user' as const, content: req.prompt }],
    output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: req.schema } },
  };
  let message: Anthropic.Beta.BetaMessage | Anthropic.Message;
  try {
    // The beta namespace carries the fallback parameter; the plain one is used when it's turned off.
    message = fallbacks
      ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }, { signal: ctx.signal })
      : await anthropic.messages.create(params, { signal: ctx.signal });
  } catch (error) {
    throw mapError(error);
  }
  if (message.stop_reason === 'refusal') throw new AiError('Claude declined this request. Try different words.', 'refused');
  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  if (!text) throw new AiError('Claude returned no text. Try again.', 'bad-output');
  return parseJsonLoose(text);
}

/**
 * The account's models.
 * @param ctx the request context
 * @returns the model ids
 */
async function listModels(ctx: AiCtx): Promise<string[]> {
  try {
    const models: string[] = [];
    for await (const model of client(ctx).models.list({ limit: 100 })) models.push(model.id);
    return models;
  } catch (error) {
    throw mapError(error);
  }
}

/**
 * Turns an SDK error into a message worth showing.
 * @param error what the SDK threw
 * @returns the error, with its kind
 */
function mapError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError)
    return new AiError('Anthropic didn’t accept the API key.', 'key');
  if (error instanceof Anthropic.RateLimitError) return new AiError('Anthropic’s rate limit was reached. Wait a little and try again.', 'limit');
  if (error instanceof Anthropic.APIUserAbortError) return new AiError('Cancelled.', 'cancelled');
  if (error instanceof Anthropic.BadRequestError) return new AiError(`Anthropic couldn’t use this request (${error.message.slice(0, 160)}).`, 'provider');
  if (error instanceof Anthropic.APIConnectionError) return new AiError('Couldn’t reach Anthropic. Check your connection.', 'network');
  if (error instanceof Anthropic.APIError) return new AiError(`Anthropic returned an error ${error.status ?? ''}.`, 'provider');
  return new AiError(error instanceof Error ? error.message : String(error), 'provider');
}

const providerModule: ProviderModule = { text: { generateJSON, listModels } };
export default providerModule;
export const text = providerModule.text;
