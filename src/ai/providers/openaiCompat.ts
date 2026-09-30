import { AiError, httpError, parseJsonLoose, type AiCtx, type ProviderModule, type TextRequest } from '../types';

/*
 * Any service with an OpenAI-style Chat Completions API: OpenAI itself, OpenRouter, Groq, DeepSeek, Mistral,
 * Together, Ollama and LM Studio (local), or a custom base URL. Asks for JSON-schema output; services that reject it
 * get plain JSON mode, and the answer is parsed leniently either way.
 */

type Format = 'schema' | 'object' | 'none';
const learned = new Map<string, Format>(); // what each base URL accepted, for the session

async function chat(ctx: AiCtx, req: TextRequest, format: Format): Promise<Response> {
  const response_format =
    format === 'schema'
      ? { type: 'json_schema', json_schema: { name: req.schemaName, schema: req.schema, strict: true } }
      : format === 'object'
        ? { type: 'json_object' }
        : undefined;
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

export async function generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown> {
  if (!ctx.base) throw new AiError('Enter the service’s base URL in Settings → AI.', 'setup');
  if (!ctx.model) throw new AiError('Choose a model in Settings → AI.', 'setup');
  const order: Format[] = [learned.get(ctx.base) ?? 'schema', 'object', 'none'].filter((f, i, a) => a.indexOf(f) === i) as Format[];
  let res: Response | null = null;
  for (const f of order) {
    res = await chat(ctx, req, f);
    // 400 / 422: the service doesn't take this response_format; try a simpler one.
    if ((res.status === 400 || res.status === 422) && f !== 'none') continue;
    learned.set(ctx.base, f);
    break;
  }
  if (!res || !res.ok) throw await httpError(res!, ctx.def.name);
  const j = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string }; finish_reason?: string }[] };
  const m = j.choices?.[0]?.message;
  if (m?.refusal) throw new AiError(`${ctx.def.name} declined this request. Try different words.`, 'refused');
  if (!m?.content) throw new AiError(`${ctx.def.name} returned no text. Try again.`, 'bad-output');
  return parseJsonLoose(m.content);
}

export async function listModels(ctx: AiCtx): Promise<string[]> {
  if (!ctx.base) return [];
  const res = await ctx.http.fetch(`${ctx.base}/models`, { signal: ctx.signal });
  if (!res.ok) throw await httpError(res, ctx.def.name);
  const j = (await res.json()) as { data?: { id: string }[]; models?: { id?: string; name?: string }[] };
  return (j.data ?? j.models ?? []).map((m) => ('id' in m && m.id) || ('name' in m && m.name) || '').filter(Boolean) as string[];
}

export const text = { generateJSON, listModels };
const mod: ProviderModule = { text };
export default mod;
