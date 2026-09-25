import { useEffect, useState } from 'react';
import { PRODUCTS } from '../data/products';
import { SAMPLES, buildSample, sampleCredits, type SampleCredit, type SampleDef } from '../data/samples';
import { cardMM } from '../engine/design';
import { renderCard } from '../engine/render';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { open3D, openSample } from '../state/actions';
import type { Design, Photo } from '../types';
import { CubeIcon, ProductIcon } from './icons';

interface Rendered {
  def: SampleDef;
  design: Design;
  photos: Photo[];
  credits: SampleCredit[];
  front: string;
  back: string;
  w: number;
  h: number;
}

// Renders are kept for the session: reopening the gallery is instant.
const cache = new Map<string, Rendered>();

async function renderSample(def: SampleDef, credits: SampleCredit[]): Promise<Rendered> {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const s = await buildSample(def, credits);
  await ensureFonts(fontsFor(s.design));
  const { w, h } = cardMM(s.design),
    px = 640 / Math.max(w, h),
    face = (side: 'front' | 'back') => {
      const cv = document.createElement('canvas');
      renderCard(cv, side, px, 0, { d: s.design, photos: s.photos });
      return cv.toDataURL('image/jpeg', 0.86);
    };
  const r = { def, ...s, front: face('front'), back: face('back'), w, h };
  cache.set(def.id, r);
  return r;
}

function Credit({ credits }: { credits: SampleCredit[] }) {
  const [first, ...rest] = credits;
  if (!first) return null;
  return (
    <small className="credit">
      Photo{rest.length ? 's' : ''}:{' '}
      <a href={first.photographerUrl} target="_blank" rel="noopener noreferrer">
        {first.photographer}
      </a>
      {rest.length ? ` +${rest.length} more` : ''} on{' '}
      <a href={first.pexelsUrl} target="_blank" rel="noopener noreferrer">
        Pexels
      </a>
    </small>
  );
}

function SampleCard({ r }: { r: Rendered }) {
  const view = () => void open3D({ front: r.front, back: r.back, w: r.w, h: r.h, round: false, title: r.def.title });
  return (
    <article className="gcard">
      <button type="button" className="gthumb" title="Open in 3D" onClick={view}>
        <div className="flipper" style={{ width: r.w >= r.h ? '100%' : `${(r.w / r.h) * 100}%`, aspectRatio: `${r.w}/${r.h}` }}>
          <img src={r.front} alt={`Front of the ${r.def.title} sample`} />
          <img className="b" src={r.back} alt="" />
        </div>
      </button>
      <b>{r.def.title}</b>
      <Credit credits={r.credits} />
      <div className="acts">
        <button type="button" className="sbtn accent" onClick={() => void openSample(r.design, r.photos)}>
          Use this
        </button>
        <button type="button" className="sbtn" onClick={view}>
          <CubeIcon />
          3D
        </button>
      </div>
    </article>
  );
}

/** Ready-made postcards, calendars and frames built from Pexels photos, grouped by product. */
export function SampleGallery() {
  const [state, setState] = useState<'loading' | 'missing' | 'ready'>('loading');
  const [done, setDone] = useState<Rendered[]>(() => SAMPLES.map((d) => cache.get(d.id)).filter((r): r is Rendered => !!r));

  useEffect(() => {
    let live = true;
    void (async () => {
      const credits = await sampleCredits();
      if (!live) return;
      if (!credits) {
        setState('missing');
        return;
      }
      setState('ready');
      // One at a time, yielding between samples, so the dialog stays responsive while they render.
      for (const def of SAMPLES) {
        try {
          const r = await renderSample(def, credits);
          if (!live) return;
          setDone((cur) => (cur.some((x) => x.def.id === def.id) ? cur : [...cur, r]));
        } catch {
          /* a photo failed to load: skip this sample */
        }
        await new Promise((res) => setTimeout(res, 0));
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  if (state === 'missing')
    return <div className="empty">Sample designs aren’t included in this build.</div>;

  return (
    <>
      {PRODUCTS.map((p) => {
        const defs = SAMPLES.filter((s) => s.product === p.id);
        return (
          <section key={p.id} className="galgroup" aria-label={`${p.name} samples`}>
            <h3>
              <span className="grp-ico">
                <ProductIcon id={p.id} />
              </span>
              {p.name}s <small>{defs.length}</small>
            </h3>
            <div className="gal">
              {defs.map((def) => {
                const r = done.find((x) => x.def.id === def.id);
                return r ? (
                  <SampleCard key={def.id} r={r} />
                ) : (
                  <div key={def.id} className="gcard" aria-busy="true">
                    <span className="skel gthumb-skel" />
                    <span className="skel line-skel" />
                    <span className="skel line-skel short" />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <p className="hint credit-foot">
        Sample photos from{' '}
        <a href="https://www.pexels.com" target="_blank" rel="noopener noreferrer">
          Pexels
        </a>
        , free to use under the{' '}
        <a href="https://www.pexels.com/license/" target="_blank" rel="noopener noreferrer">
          Pexels license
        </a>
        . Credits are on each card.
      </p>
    </>
  );
}
