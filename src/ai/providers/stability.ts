import { AiError, httpError, type AiCtx, type ImageRequest, type ProviderModule } from '../types';

/*
 * Stability AI Stable Image (v2beta): POST a multipart form to /stable-image/generate/{core|ultra|sd3} with
 * Accept: image/* and get the picture back directly. One picture per request.
 */

async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const model = ['core', 'ultra', 'sd3'].includes(ctx.model) ? ctx.model : 'core';
  const out: Blob[] = [];
  for (let i = 0; i < Math.min(4, req.n); i++) {
    const res = await ctx.http.fetch(`https://api.stability.ai/v2beta/stable-image/generate/${model}`, {
      method: 'POST',
      headers: { accept: 'image/*' },
      form: [
        ['prompt', req.prompt],
        ['aspect_ratio', req.aspect],
        ['output_format', 'png'],
        ['negative_prompt', 'text, watermark, signature, logo, people, faces'],
      ],
      signal: ctx.signal,
    });
    if (!res.ok) throw await httpError(res, 'Stability AI');
    out.push(await res.blob());
  }
  if (!out.length) throw new AiError('Stability AI returned no picture.', 'bad-output');
  return out;
}

export const image = { generate };
const mod: ProviderModule = { image };
export default mod;
