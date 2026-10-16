import { AiError, httpError, sleep, type AiCtx, type ImageRequest, type ProviderModule } from '../types';
import { fieldOf, textField } from './read';

/*
 * Black Forest Labs FLUX (key header "x-key"): POST https://api.bfl.ai/v1/{model} with the size, poll the returned
 * polling_url until "Ready", then download result.sample (a signed URL valid for about 10 minutes) without the key.
 * No browser (CORS) support, so this runs in the desktop app only.
 */

/**
 * Width and height for an aspect, about 2 megapixels, multiples of 32.
 * @param aspect "W:H"
 * @returns the size in pixels (at least 256 each)
 */
function sizeFor(aspect: string): { width: number; height: number } {
  const [aspectWidth = 1, aspectHeight = 1] = aspect.split(':').map(Number);
  const scale = Math.sqrt(2_000_000 / (aspectWidth * aspectHeight));
  const pixels = (side: number) => Math.max(256, Math.round((side * scale) / 32) * 32);
  return { width: pixels(aspectWidth), height: pixels(aspectHeight) };
}

/**
 * One picture: submit, poll (up to 150 times, 1.2 s apart), download.
 * @param ctx the request context
 * @param req the prompt and aspect
 * @returns the picture
 */
async function one(ctx: AiCtx, req: ImageRequest): Promise<Blob> {
  const submitted = await ctx.http.fetch(`https://api.bfl.ai/v1/${ctx.model}`, { json: { prompt: req.prompt, ...sizeFor(req.aspect) }, signal: ctx.signal });
  if (!submitted.ok) throw await httpError(submitted, 'Black Forest Labs');
  const pollingUrl = textField(await submitted.json(), 'polling_url') ?? '';
  for (let check = 0; check < 150; check++) {
    await sleep(1200, ctx.signal);
    const polled = await ctx.http.fetch(pollingUrl, { signal: ctx.signal });
    if (!polled.ok) throw await httpError(polled, 'Black Forest Labs');
    const answer: unknown = await polled.json();
    const status = textField(answer, 'status') ?? '';
    const sample = textField(fieldOf(answer, 'result'), 'sample');
    if (status === 'Ready' && sample) {
      const picture = await ctx.http.fetch(sample, { noAuth: true, signal: ctx.signal });
      if (!picture.ok) throw await httpError(picture, 'Black Forest Labs');
      return picture.blob();
    }
    if (/error|failed|moderated/i.test(status))
      throw new AiError(`Black Forest Labs couldn’t make this picture (${status}).`, /moderat/i.test(status) ? 'refused' : 'provider');
  }
  throw new AiError('Black Forest Labs took too long. Try again.', 'network');
}

/**
 * Pictures, one request each.
 * @param ctx the request context
 * @param req the prompt, aspect and how many (at most 4)
 * @returns the pictures
 */
async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const pictures: Blob[] = [];
  for (let count = 0; count < Math.min(4, req.n); count++) pictures.push(await one(ctx, req));
  return pictures;
}

export const image = { generate };
const providerModule: ProviderModule = { image };
export default providerModule;
