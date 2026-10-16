import { AiError, httpError, parseJsonLoose, type AiCtx, type ProviderModule, type TextRequest } from '../types';
import { fieldOf, listField, textField } from './read';

/*
 * Any service with an OpenAI-style Chat Completions API: OpenAI itself, OpenRouter, Groq, DeepSeek, Mistral,
 * Together, Ollama and LM Studio (local), or a custom base URL. Asks for JSON-schema output; services that reject it
 * get plain JSON mode, and the answer is parsed leniently either way.
 */

/** How the answer's JSON is asked for: a schema, JSON mode, or only in the prompt. */
type Format = 'schema' | 'object' | 'none';
const learned = new Map<string, Format>(); // what each base URL accepted, for the session

/**
 * The response_format for a way of asking.
 * @param format the way
 * @param req the request (its schema)
 * @returns the field, or undefined for none
 */
function responseFormat(format: Format, req: TextRequest): Record<string, unknown> | undefined {
  if (format === 'schema') return { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.schema, strict: true } };
  return format === 'object' ? { type: 'json_object' } : undefined;
}

/**
 * One Chat Completions call.
 * @param ctx the request context
 * @param req the prompts and schema
 * @param format how to ask for JSON
 * @returns the service's answer
 */
async function chat(ctx: AiCtx, req: TextRequest, format: Format): Promise<Response> {
  const response_format = responseFormat(format, req);
  return ctx.http.fetch(`${ctx.base}/chat/completions`, {
    json: {
      model: ctx.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: 'system', content: `${req.system}\n\nAnswer with JSON only, matching this JSON Schema:\n${JSON.stringify(req.schema)}` },
        { role: 'user', content: req.prompt },
      ],
      ...(response_format ? { response_format } : {}),
    },
    signal: ctx.signal,
  });
}

/**
 * Structured words; falls back to simpler ways of asking for JSON when the service refuses one.
 * @param ctx the request context
 * @param req the prompts and schema
 * @returns the parsed JSON
 */
export async function generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown> {
  if (!ctx.base) throw new AiError('Enter the service’s base URL in Settings → AI.', 'setup');
  if (!ctx.model) throw new AiError('Choose a model in Settings → AI.', 'setup');
  const order = [...new Set<Format>([learned.get(ctx.base) ?? 'schema', 'object', 'none'])];
  let response: Response | null = null;
  for (const format of order) {
    response = await chat(ctx, req, format);
    // 400 / 422: the service doesn't take this response_format; try a simpler one.
    if ((response.status === 400 || response.status === 422) && format !== 'none') continue;
    learned.set(ctx.base, format);
    break;
  }
  if (!response) throw new AiError(`${ctx.def.name} gave no answer.`, 'provider');
  if (!response.ok) throw await httpError(response, ctx.def.name);
  const message = fieldOf(listField(await response.json(), 'choices')[0], 'message');
  if (textField(message, 'refusal')) throw new AiError(`${ctx.def.name} declined this request. Try different words.`, 'refused');
  const content = textField(message, 'content');
  if (!content) throw new AiError(`${ctx.def.name} returned no text. Try again.`, 'bad-output');
  return parseJsonLoose(content);
}

/**
 * The service's models (OpenAI's `data[].id`, or Ollama's `models[].name`).
 * @param ctx the request context
 * @returns the model ids
 */
export async function listModels(ctx: AiCtx): Promise<string[]> {
  if (!ctx.base) return [];
  const response = await ctx.http.fetch(`${ctx.base}/models`, { signal: ctx.signal });
  if (!response.ok) throw await httpError(response, ctx.def.name);
  const answer: unknown = await response.json();
  const data = fieldOf(answer, 'data');
  const models = Array.isArray(data) ? data : listField(answer, 'models');
  return models.map((model) => [textField(model, 'id'), textField(model, 'name')].find(Boolean) ?? '').filter(Boolean);
}

export const text = { generateJSON, listModels };
const providerModule: ProviderModule = { text };
export default providerModule;
