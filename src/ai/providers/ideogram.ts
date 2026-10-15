import { AiError, httpError, type AiCtx, type ImageRequest, type ProviderModule } from '../types';
import { fieldOf, listField, textField } from './read';

/*
 * Ideogram v3 (key header "Api-Key"): multipart POST to /v1/ideogram-v3/generate with the aspect as "WxH", then
 * download data[].url (temporary links) without the key. Good at lettering. Desktop app only (no CORS).
 */

/**
 * Pictures from Ideogram (only those it marks safe).
 * @param ctx the request context
 * @param req the prompt, aspect and how many (at most 4)
 * @returns the pictures
 */
async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const response = await ctx.http.fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
    method: 'POST',
    form: [
      ['prompt', req.prompt],
      ['aspect_ratio', req.aspect.replace(':', 'x')],
      ['num_images', String(Math.min(4, req.n))],
      ['rendering_speed', 'DEFAULT'],
    ],
    signal: ctx.signal,
  });
  if (!response.ok) throw await httpError(response, 'Ideogram');
  const pictures: Blob[] = [];
  for (const item of listField(await response.json(), 'data')) {
    const url = textField(item, 'url');
    if (!url || fieldOf(item, 'is_image_safe') === false) continue;
    const download = await ctx.http.fetch(url, { noAuth: true, signal: ctx.signal });
    if (download.ok) pictures.push(await download.blob());
  }
  if (!pictures.length) throw new AiError('Ideogram returned no picture it considered safe. Try a different description.', 'bad-output');
  return pictures;
}

export const image = { generate };
const providerModule: ProviderModule = { image };
export default providerModule;
