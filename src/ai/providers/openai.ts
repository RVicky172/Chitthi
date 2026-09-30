import { AiError, blobFromBase64, httpError, nearestAspect, type AiCtx, type ImageRequest, type ProviderModule } from '../types';
import { generateJSON, listModels } from './openaiCompat';

/*
 * OpenAI: words through Chat Completions (shared with the OpenAI-compatible adapter) and pictures through the
 * Images API. GPT image models return base64 images in one of three sizes; the aspect picks the nearest.
 */

const SIZES: Record<string, string> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };

async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const aspect = nearestAspect(ratioOf(req.aspect), ['1:1', '3:2', '2:3']);
  const res = await ctx.http.fetch(`${ctx.base || 'https://api.openai.com/v1'}/images/generations`, {
    json: { model: ctx.model, prompt: req.prompt, n: Math.min(4, req.n), size: SIZES[aspect], quality: 'high' },
    signal: ctx.signal,
  });
  if (!res.ok) throw await httpError(res, 'OpenAI');
  const j = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const out: Blob[] = [];
  for (const d of j.data ?? []) {
    if (d.b64_json) out.push(blobFromBase64(d.b64_json, 'image/png'));
    else if (d.url) {
      const r = await ctx.http.fetch(d.url, { noAuth: true, signal: ctx.signal });
      if (r.ok) out.push(await r.blob());
    }
  }
  if (!out.length) throw new AiError('OpenAI returned no picture. Try a different description.', 'bad-output');
  return out;
}

const ratioOf = (a: string) => {
  const [w, h] = a.split(':').map(Number);
  return w / h;
};

export const text = { generateJSON, listModels };
export const image = { generate, listModels: async (ctx: AiCtx) => (await listModels(ctx)).filter((m) => /image|dall-e/i.test(m)) };
const mod: ProviderModule = { text, image };
export default mod;
