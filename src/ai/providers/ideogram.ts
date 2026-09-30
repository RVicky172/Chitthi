import { AiError, httpError, type AiCtx, type ImageRequest, type ProviderModule } from '../types';

/*
 * Ideogram v3 (key header "Api-Key"): multipart POST to /v1/ideogram-v3/generate with the aspect as "WxH", then
 * download data[].url (temporary links) without the key. Good at lettering. Desktop app only (no CORS).
 */

async function generate(ctx: AiCtx, req: ImageRequest): Promise<Blob[]> {
  const res = await ctx.http.fetch('https://api.ideogram.ai/v1/ideogram-v3/generate', {
    method: 'POST',
    form: [
      ['prompt', req.prompt],
      ['aspect_ratio', req.aspect.replace(':', 'x')],
      ['num_images', String(Math.min(4, req.n))],
      ['rendering_speed', 'DEFAULT'],
    ],
    signal: ctx.signal,
  });
  if (!res.ok) throw await httpError(res, 'Ideogram');
  const { data = [] } = (await res.json()) as { data?: { url?: string; is_image_safe?: boolean }[] };
  const out: Blob[] = [];
  for (const d of data) {
    if (!d.url || d.is_image_safe === false) continue;
    const r = await ctx.http.fetch(d.url, { noAuth: true, signal: ctx.signal });
    if (r.ok) out.push(await r.blob());
  }
  if (!out.length) throw new AiError('Ideogram returned no picture it considered safe. Try a different description.', 'bad-output');
  return out;
}

export const image = { generate };
const mod: ProviderModule = { image };
export default mod;
