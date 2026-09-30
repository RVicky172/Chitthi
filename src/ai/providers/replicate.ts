import { AiError, httpError, sleep, type AiCtx, type ImageRequest, type ProviderModule } from '../types';

/*
 * Replicate: POST /v1/models/{owner}/{name}/predictions with "Prefer: wait" (up to 60 s), poll urls.get if it
 * isn't finished, then download the output URL(s) from replicate.delivery without the key. Desktop app only (no CORS).
 */

interface Prediction {
  status: string;
  output?: string | string[];
  error?: string;
  urls?: { get?: string };
}

async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const res = await ctx.http.fetch(`https://api.replicate.com/v1/models/${ctx.model}/predictions`, {
    headers: { Prefer: 'wait=60' },
    json: { input: { prompt: req.prompt, aspect_ratio: req.aspect, num_outputs: Math.min(4, req.n), output_format: 'png' } },
    signal: ctx.signal,
  });
  if (!res.ok) throw await httpError(res, 'Replicate');
  let p = (await res.json()) as Prediction;
  for (let i = 0; i < 120 && !['succeeded', 'failed', 'canceled'].includes(p.status); i++) {
    await sleep(1500, ctx.signal);
    if (!p.urls?.get) break;
    const r = await ctx.http.fetch(p.urls.get, { signal: ctx.signal });
    if (!r.ok) throw await httpError(r, 'Replicate');
    p = (await r.json()) as Prediction;
  }
  if (p.status !== 'succeeded') throw new AiError(`Replicate couldn’t make this picture${p.error ? ` (${String(p.error).slice(0, 120)})` : ''}.`, 'provider');
  const urls = Array.isArray(p.output) ? p.output : p.output ? [p.output] : [];
  const out: Blob[] = [];
  for (const u of urls) {
    const r = await ctx.http.fetch(u, { noAuth: true, signal: ctx.signal });
    if (r.ok) out.push(await r.blob());
  }
  if (!out.length) throw new AiError('Replicate returned no picture.', 'bad-output');
  return out;
}

export const image = { generate };
const mod: ProviderModule = { image };
export default mod;
