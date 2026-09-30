import { AiError, blobFromBase64, httpError, parseJsonLoose, type AiCtx, type ImageRequest, type JsonSchema, type ProviderModule, type TextRequest } from '../types';

/*
 * Google Gemini (generativelanguage.googleapis.com, key in x-goog-api-key). Words: generateContent with a JSON
 * response schema. Pictures: generateContent with image output and an aspect ratio; the image comes back as base64
 * inline data. Both read the documented response paths and tolerate the newer "interactions" shape.
 */

const API = 'https://generativelanguage.googleapis.com/v1beta';

/** Gemini's response schema is an OpenAPI subset: drop keywords it doesn't know. */
function geminiSchema(s: JsonSchema): JsonSchema {
  const { additionalProperties: _a, $schema: _s, ...rest } = s as Record<string, unknown>;
  const out: Record<string, unknown> = { ...rest };
  if (rest.properties && typeof rest.properties === 'object')
    out.properties = Object.fromEntries(Object.entries(rest.properties as Record<string, JsonSchema>).map(([k, v]) => [k, geminiSchema(v)]));
  if (rest.items && typeof rest.items === 'object') out.items = geminiSchema(rest.items as JsonSchema);
  return out;
}

type Part = { text?: string; inlineData?: { data: string; mimeType?: string }; inline_data?: { data: string; mime_type?: string } };
interface GenResponse {
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  output_image?: { data?: string; mime_type?: string };
}

async function call(ctx: AiCtx, body: unknown): Promise<GenResponse> {
  const res = await ctx.http.fetch(`${API}/models/${encodeURIComponent(ctx.model)}:generateContent`, { json: body, signal: ctx.signal });
  if (!res.ok) throw await httpError(res, 'Google Gemini');
  const j = (await res.json()) as GenResponse;
  if (j.promptFeedback?.blockReason) throw new AiError('Gemini declined this request. Try different words.', 'refused');
  return j;
}

async function generateJSON(ctx: AiCtx, req: TextRequest): Promise<unknown> {
  const j = await call(ctx, {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    generationConfig: { maxOutputTokens: req.maxTokens, responseMimeType: 'application/json', responseSchema: geminiSchema(req.schema) },
  });
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!text) throw new AiError('Gemini returned no text. Try again.', 'bad-output');
  return parseJsonLoose(text);
}

async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let i = 0; i < Math.min(4, req.n); i++) {
    const j = await call(ctx, {
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: req.aspect } },
    });
    const parts = j.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const d = p.inlineData ?? (p.inline_data ? { data: p.inline_data.data, mimeType: p.inline_data.mime_type } : null);
      if (d?.data) out.push(blobFromBase64(d.data, d.mimeType || 'image/png'));
    }
    if (j.output_image?.data) out.push(blobFromBase64(j.output_image.data, j.output_image.mime_type || 'image/png'));
  }
  if (!out.length) throw new AiError('Gemini returned no picture. Try a different description.', 'bad-output');
  return out;
}

async function listModels(ctx: AiCtx): Promise<string[]> {
  const res = await ctx.http.fetch(`${API}/models?pageSize=200`, { signal: ctx.signal });
  if (!res.ok) throw await httpError(res, 'Google Gemini');
  const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
}

export const text = { generateJSON, listModels: async (ctx: AiCtx) => (await listModels(ctx)).filter((m) => !/image|embedding|tts|audio/i.test(m)) };
export const image = { generate, listModels: async (ctx: AiCtx) => (await listModels(ctx)).filter((m) => /image/i.test(m)) };
const mod: ProviderModule = { text, image };
export default mod;
