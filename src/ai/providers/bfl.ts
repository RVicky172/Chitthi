import { AiError, httpError, sleep, type AiCtx, type ImageRequest, type ProviderModule } from '../types';

/*
 * Black Forest Labs FLUX (key header "x-key"): POST https://api.bfl.ai/v1/{model} with the size, poll the returned
 * polling_url until "Ready", then download result.sample (a signed URL valid for about 10 minutes) without the key.
 * No browser (CORS) support, so this runs in the desktop app only.
 */

/** Width and height for an aspect, about 2 megapixels, multiples of 32. */
function dims(aspect: string): { width: number; height: number } {
  const [w, h] = aspect.split(':').map(Number),
    k = Math.sqrt(2_000_000 / (w * h)),
    r = (n: number) => Math.max(256, Math.round((n * k) / 32) * 32);
  return { width: r(w), height: r(h) };
}

async function one(ctx: AiCtx, req: ImageRequest): Promise<Blob> {
  const sub = await ctx.http.fetch(`https://api.bfl.ai/v1/${ctx.model}`, { json: { prompt: req.prompt, ...dims(req.aspect) }, signal: ctx.signal });
  if (!sub.ok) throw await httpError(sub, 'Black Forest Labs');
  const { polling_url } = (await sub.json()) as { id: string; polling_url: string };
  for (let i = 0; i < 150; i++) {
    await sleep(1200, ctx.signal);
    const res = await ctx.http.fetch(polling_url, { signal: ctx.signal });
    if (!res.ok) throw await httpError(res, 'Black Forest Labs');
    const j = (await res.json()) as { status: string; result?: { sample?: string } };
    if (j.status === 'Ready' && j.result?.sample) {
      const img = await ctx.http.fetch(j.result.sample, { noAuth: true, signal: ctx.signal });
      if (!img.ok) throw await httpError(img, 'Black Forest Labs');
      return img.blob();
    }
    if (/error|failed|moderated/i.test(j.status)) throw new AiError(`Black Forest Labs couldn’t make this picture (${j.status}).`, /moderat/i.test(j.status) ? 'refused' : 'provider');
  }
  throw new AiError('Black Forest Labs took too long. Try again.', 'network');
}

async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const out: Blob[] = [];
  for (let i = 0; i < Math.min(4, req.n); i++) out.push(await one(ctx, req));
  return out;
}

export const image = { generate };
const mod: ProviderModule = { image };
export default mod;
