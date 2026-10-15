import { AiError, httpError, sleep, type AiCtx, type Aspect, type ImageRequest, type ProviderModule } from '../types';
import { listField, textField } from './read';

/*
 * fal.ai queue API (key header "Authorization: Key …"): submit to https://queue.fal.run/{model}, poll status_url
 * until COMPLETED, read response_url, then download images[].url from fal's media hosts (without the key).
 */

/** fal's image sizes, by aspect. */
const SIZES: Record<Aspect, string> = {
  '1:1': 'square_hd',
  '4:3': 'landscape_4_3',
  '16:9': 'landscape_16_9',
  '3:4': 'portrait_4_3',
  '9:16': 'portrait_16_9',
  '3:2': 'landscape_4_3',
  '2:3': 'portrait_4_3',
  '5:4': 'landscape_4_3',
  '4:5': 'portrait_4_3',
};

/**
 * Waits until a queued request is done (up to 120 checks, 1.5 s apart).
 * @param ctx the request context
 * @param statusUrl the request's status URL
 * @throws AiError when it takes too long
 */
async function waitFor(ctx: AiCtx, statusUrl: string): Promise<void> {
  for (let check = 0; check < 120; check++) {
    const status = await ctx.http.fetch(statusUrl, { signal: ctx.signal });
    if (!status.ok) throw await httpError(status, 'fal.ai');
    if (textField(await status.json(), 'status') === 'COMPLETED') return;
    if (check === 119) break;
    await sleep(1500, ctx.signal);
  }
  throw new AiError('fal.ai took too long. Try again.', 'network');
}

/**
 * Pictures from fal's queue.
 * @param ctx the request context
 * @param req the prompt, aspect and how many (at most 4)
 * @returns the pictures
 */
async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const submitted = await ctx.http.fetch(`https://queue.fal.run/${ctx.model}`, {
    json: { prompt: req.prompt, image_size: SIZES[req.aspect], num_images: Math.min(4, req.n) },
    signal: ctx.signal,
  });
  if (!submitted.ok) throw await httpError(submitted, 'fal.ai');
  const queued: unknown = await submitted.json();
  await waitFor(ctx, textField(queued, 'status_url') ?? '');
  const result = await ctx.http.fetch(textField(queued, 'response_url') ?? '', { signal: ctx.signal });
  if (!result.ok) throw await httpError(result, 'fal.ai');
  const pictures: Blob[] = [];
  for (const picture of listField(await result.json(), 'images')) {
    const url = textField(picture, 'url') ?? '';
    const download = url.startsWith('data:') ? await fetch(url) : await ctx.http.fetch(url, { noAuth: true, signal: ctx.signal });
    if (download.ok) pictures.push(await download.blob());
  }
  if (!pictures.length) throw new AiError('fal.ai returned no picture.', 'bad-output');
  return pictures;
}

export const image = { generate };
const providerModule: ProviderModule = { image };
export default providerModule;
