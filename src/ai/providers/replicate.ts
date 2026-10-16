import { AiError, httpError, sleep, type AiCtx, type ImageRequest, type ProviderModule } from '../types';
import { fieldOf, textField } from './read';

/*
 * Replicate: POST /v1/models/{owner}/{name}/predictions with "Prefer: wait" (up to 60 s), poll urls.get if it
 * isn't finished, then download the output URL(s) from replicate.delivery without the key. Desktop app only (no CORS).
 */

/** The states a prediction ends in. */
const DONE = ['succeeded', 'failed', 'canceled'];

/**
 * Polls a prediction until it ends (up to 120 checks, 1.5 s apart, while it has a URL to poll).
 * @param ctx the request context
 * @param prediction the prediction as first answered
 * @returns the last answer
 */
async function settled(ctx: AiCtx, prediction: unknown): Promise<unknown> {
  let latest = prediction;
  for (let check = 0; check < 120 && !DONE.includes(textField(latest, 'status') ?? ''); check++) {
    await sleep(1500, ctx.signal);
    const pollUrl = textField(fieldOf(latest, 'urls'), 'get');
    if (!pollUrl) break;
    const polled = await ctx.http.fetch(pollUrl, { signal: ctx.signal });
    if (!polled.ok) throw await httpError(polled, 'Replicate');
    latest = await polled.json();
  }
  return latest;
}

/**
 * A finished prediction's picture URLs.
 * @param prediction the prediction
 * @returns the URLs (output is one URL or a list)
 */
function outputUrls(prediction: unknown): string[] {
  const output = fieldOf(prediction, 'output');
  if (Array.isArray(output)) return output.filter((url): url is string => typeof url === 'string');
  return typeof output === 'string' && output ? [output] : [];
}

/**
 * Pictures from a model's prediction.
 * @param ctx the request context
 * @param req the prompt, aspect and how many (at most 4)
 * @returns the pictures
 */
async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const response = await ctx.http.fetch(`https://api.replicate.com/v1/models/${ctx.model}/predictions`, {
    headers: { Prefer: 'wait=60' },
    json: { input: { prompt: req.prompt, aspect_ratio: req.aspect, num_outputs: Math.min(4, req.n), output_format: 'png' } },
    signal: ctx.signal,
  });
  if (!response.ok) throw await httpError(response, 'Replicate');
  const prediction = await settled(ctx, await response.json());
  if (textField(prediction, 'status') !== 'succeeded') {
    const error = textField(prediction, 'error');
    throw new AiError(`Replicate couldn’t make this picture${error ? ' (' + error.slice(0, 120) + ')' : ''}.`, 'provider');
  }
  const pictures: Blob[] = [];
  for (const url of outputUrls(prediction)) {
    const download = await ctx.http.fetch(url, { noAuth: true, signal: ctx.signal });
    if (download.ok) pictures.push(await download.blob());
  }
  if (!pictures.length) throw new AiError('Replicate returned no picture.', 'bad-output');
  return pictures;
}

export const image = { generate };
const providerModule: ProviderModule = { image };
export default providerModule;
