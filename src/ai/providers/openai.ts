import { AiError, blobFromBase64, httpError, nearestAspect, type AiCtx, type Aspect, type ImageRequest, type ProviderModule } from '../types';
import { generateJSON, listModels } from './openaiCompat';
import { listField, textField } from './read';

/*
 * OpenAI: words through Chat Completions (shared with the OpenAI-compatible adapter) and pictures through the
 * Images API. GPT image models return base64 images in one of three sizes; the aspect picks the nearest.
 */

/** The image sizes the model makes, by aspect. */
const SIZES: Partial<Record<Aspect, string>> = { '1:1': '1024x1024', '3:2': '1536x1024', '2:3': '1024x1536' };

/**
 * An aspect's width / height.
 * @param aspect "W:H"
 * @returns the ratio
 */
const ratioOf = (aspect: string): number => {
  const [width = 1, height = 1] = aspect.split(':').map(Number);
  return width / height;
};

/**
 * Pictures from the Images API.
 * @param ctx the request context
 * @param req the prompt, aspect and how many (at most 4)
 * @returns the pictures
 */
async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const aspect = nearestAspect(ratioOf(req.aspect), ['1:1', '3:2', '2:3']);
  const response = await ctx.http.fetch(`${ctx.base || 'https://api.openai.com/v1'}/images/generations`, {
    json: { model: ctx.model, prompt: req.prompt, n: Math.min(4, req.n), size: SIZES[aspect], quality: 'high' },
    signal: ctx.signal,
  });
  if (!response.ok) throw await httpError(response, 'OpenAI');
  const pictures: Blob[] = [];
  for (const item of listField(await response.json(), 'data')) {
    const base64 = textField(item, 'b64_json');
    const url = textField(item, 'url');
    if (base64) pictures.push(blobFromBase64(base64, 'image/png'));
    else if (url) {
      const download = await ctx.http.fetch(url, { noAuth: true, signal: ctx.signal });
      if (download.ok) pictures.push(await download.blob());
    }
  }
  if (!pictures.length) throw new AiError('OpenAI returned no picture. Try a different description.', 'bad-output');
  return pictures;
}

export const text = { generateJSON, listModels };
export const image = {
  generate,
  /** The models that make images (GPT Image, DALL·E). */
  listModels: async (ctx: AiCtx) => (await listModels(ctx)).filter((model) => /image|dall-e/i.test(model)),
};
const providerModule: ProviderModule = { text, image };
export default providerModule;
