import { AiError, httpError, sleep, type AiCtx, type ImageRequest, type ProviderModule } from '../types';

/*
 * fal.ai queue API (key header "Authorization: Key …"): submit to https://queue.fal.run/{model}, poll status_url
 * until COMPLETED, read response_url, then download images[].url from fal's media hosts (without the key).
 */

const SIZES: Record<string, string> = {
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

async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const sub = await ctx.http.fetch(`https://queue.fal.run/${ctx.model}`, {
    json: { prompt: req.prompt, image_size: SIZES[req.aspect] ?? 'square_hd', num_images: Math.min(4, req.n) },
    signal: ctx.signal,
  });
  if (!sub.ok) throw await httpError(sub, 'fal.ai');
  const { status_url, response_url } = (await sub.json()) as { status_url: string; response_url: string };
  for (let i = 0; i < 120; i++) {
    const st = await ctx.http.fetch(status_url, { signal: ctx.signal });
    if (!st.ok) throw await httpError(st, 'fal.ai');
    const { status } = (await st.json()) as { status: string };
    if (status === 'COMPLETED') break;
    if (i === 119) throw new AiError('fal.ai took too long. Try again.', 'network');
    await sleep(1500, ctx.signal);
  }
  const r = await ctx.http.fetch(response_url, { signal: ctx.signal });
  if (!r.ok) throw await httpError(r, 'fal.ai');
  const { images = [] } = (await r.json()) as { images?: { url: string }[] };
  const out: Blob[] = [];
  for (const im of images) {
    const res = im.url.startsWith('data:') ? await fetch(im.url) : await ctx.http.fetch(im.url, { noAuth: true, signal: ctx.signal });
    if (res.ok) out.push(await res.blob());
  }
  if (!out.length) throw new AiError('fal.ai returned no picture.', 'bad-output');
  return out;
}

export const image = { generate };
const mod: ProviderModule = { image };
export default mod;
