import { AiError, httpError, type AiCtx, type ImageRequest, type ProviderModule } from '../types';

/*
 * Stability AI Stable Image (v2beta): POST a multipart form to /stable-image/generate/{core|ultra|sd3} with
 * Accept: image/* and get the picture back directly. One picture per request.
 */

/**
 * Pictures, one request each.
 * @param ctx the request context (model core, ultra or sd3; core otherwise)
 * @param req the prompt, aspect and how many (at most 4)
 * @returns the pictures
 */
async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const model = ['core', 'ultra', 'sd3'].includes(ctx.model) ? ctx.model : 'core';
  const pictures: Blob[] = [];
  for (let count = 0; count < Math.min(4, req.n); count++) {
    const response = await ctx.http.fetch(`https://api.stability.ai/v2beta/stable-image/generate/${model}`, {
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
    if (!response.ok) throw await httpError(response, 'Stability AI');
    pictures.push(await response.blob());
  }
  if (!pictures.length) throw new AiError('Stability AI returned no picture.', 'bad-output');
  return pictures;
}

export const image = { generate };
const providerModule: ProviderModule = { image };
export default providerModule;
