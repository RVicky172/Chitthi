import { useEffect, useState } from 'react';
import { PRODUCTS } from '../data/products';
import { SAMPLES, type SampleCredit, type SampleDef } from '../data/samples';
import { cardMM } from '../engine/design';
import { renderCard } from '../engine/render';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { open3D, openSample } from '../state/actions';
import { buildSample, sampleCredits } from '../state/samples';
import { CubeIcon, ProductIcon } from './icons';

interface Rendered {
  def: SampleDef;
  credits: SampleCredit[];
  /** Credits the sample was built from, to rebuild it (with its photos) for "Use this". */
  all: SampleCredit[];
  front: string;
  back: string;
  w: number;
  h: number;
}

// Renders (two small JPEG data URLs each) are kept for the session, so reopening the gallery is instant. The decoded
// photos are not: they are dropped once the thumbnails are drawn and reloaded when a sample is used.
const cache = new Map<string, Rendered>();

async function renderSample(def: SampleDef, credits: SampleCredit[]): Promise<Rendered> {
  const hit = cache.get(def.id);
  if (hit) return hit;
  const sample = await buildSample(def, credits);
  await ensureFonts(fontsFor(sample.design));
  const { w, h } = cardMM(sample.design),
    px = 640 / Math.max(w, h),
    face = (side: 'front' | 'back') => {
      const cv = document.createElement('canvas');
      renderCard(cv, side, px, 0, { d: sample.design, photos: sample.photos });
      return cv.toDataURL('image/jpeg', 0.86);
    };
  const rendered = { def, credits: sample.credits, all: credits, front: face('front'), back: face('back'), w, h };
  cache.set(def.id, rendered);
  return rendered;
}

async function applySample(rendered: Rendered): Promise<void> {
  const sample = await buildSample(rendered.def, rendered.all);
  await openSample(sample.design, sample.photos);
}

/** A sample's photo credits. */
interface CreditProps {
  credits: SampleCredit[];
}

/**
 * The first photographer and Pexels, with how many more.
 * @param props the credits
 */
function Credit({ credits }: Readonly<CreditProps>) {
  const first = credits.at(0),
    rest = credits.slice(1);
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

/** A rendered sample. */
interface SampleCardProps {
  sample: Rendered;
}

/**
 * A sample's card: its front (turning to the back on hover), title, credits, Use this and 3D.
 * @param props the rendered sample
 */
function SampleCard({ sample }: Readonly<SampleCardProps>) {
  const view = () =>
    void open3D({
      front: sample.front,
      back: sample.back,
      w: sample.w,
      h: sample.h,
      round: false,
      title: sample.def.title,
    });
  return (
    <article className="gcard">
      <button type="button" className="gthumb" title="Open in 3D" onClick={view}>
        <div
          className="flipper"
          style={{
            width: sample.w >= sample.h ? '100%' : `${(sample.w / sample.h) * 100}%`,
            aspectRatio: `${sample.w}/${sample.h}`,
          }}
        >
          <img src={sample.front} alt={`Front of the ${sample.def.title} sample`} />
          <img className="b" src={sample.back} alt="" />
        </div>
      </button>
      <span className="text-label">{sample.def.title}</span>
      <Credit credits={sample.credits} />
      <div className="acts">
        <button type="button" className="sbtn accent" onClick={() => void applySample(sample)}>
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
  const [done, setDone] = useState<Rendered[]>(() =>
    SAMPLES.map((definition) => cache.get(definition.id)).filter((rendered): rendered is Rendered => !!rendered),
  );

  useEffect(() => {
    const closed = new AbortController(),
      isClosed = () => closed.signal.aborted;
    void (async () => {
      const credits = await sampleCredits();
      if (isClosed()) return;
      if (!credits) {
        setState('missing');
        return;
      }
      setState('ready');
      // One at a time, yielding between samples, so the dialog stays responsive while they render.
      for (const def of SAMPLES) {
        try {
          const rendered = await renderSample(def, credits);
          if (isClosed()) return;
          setDone((shown) => (shown.some((other) => other.def.id === def.id) ? shown : [...shown, rendered]));
        } catch {
          /* a photo failed to load: skip this sample */
        }
        await new Promise((res) => setTimeout(res, 0));
      }
    })();
    return () => {
      closed.abort();
    };
  }, []);

  if (state === 'missing') return <div className="empty">Sample designs aren’t included in this build.</div>;

  return (
    <>
      {PRODUCTS.map((product) => {
        const defs = SAMPLES.filter((sample) => sample.product === product.id);
        return (
          <section key={product.id} className="galgroup" aria-label={`${product.name} samples`}>
            <h3>
              <span className="grp-ico">
                <ProductIcon id={product.id} />
              </span>
              {product.name}s <small>{defs.length}</small>
            </h3>
            <div className="gal">
              {defs.map((def) => {
                const rendered = done.find((x) => x.def.id === def.id);
                return rendered ? (
                  <SampleCard key={def.id} sample={rendered} />
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
