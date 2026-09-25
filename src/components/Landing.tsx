import { useEffect, useMemo, useRef, useState } from 'react';
import { PRODUCTS } from '../data/products';
import { SAMPLES, buildSample, sampleCredits } from '../data/samples';
import { themeById } from '../data/themes';
import { cardMM, productDesign } from '../engine/design';
import { renderCard } from '../engine/render';
import { samplePhoto } from '../engine/sample';
import { ensureFonts, fontsFor } from '../lib/fonts';
import { startProduct } from '../state/actions';
import { setUI, useApp } from '../state/store';
import type { Design, Photo, ProductId } from '../types';
import { GalleryIcon, Logo, ProductIcon } from './icons';

/** The sample design each product card shows. */
function sampleDesign(p: ProductId): Design {
  const d = productDesign(p);
  if (p === 'postcard') {
    const t = themeById('diwali');
    return { ...d, themeId: 'diwali', heading: t.heads[0], quote: t.quotes[0], headFont: t.hf, quoteFont: t.qf, insta: 'yourname' };
  }
  if (p === 'calendar') {
    const t = themeById('monsoon');
    return { ...d, themeId: 'monsoon', headFont: t.hf, quoteFont: t.qf, cal: { ...d.cal, start: new Date().getMonth(), months: 12 } };
  }
  const t = themeById('parents');
  return { ...d, layout: 'frame-caption', themeId: 'parents', heading: 'Maa & Papa, 1998', showQuote: false, showSig: false, headFont: t.hf, quoteFont: t.qf, mat: 'classic', frame: 'cream' };
}

/** Which gallery sample each landing card shows (real Pexels photos); painted stand-ins until they load. */
const SAMPLE_FOR: Record<ProductId, string> = { postcard: 'diwali-arch', calendar: 'year-calendar', frame: 'family-frame' };

/** A real render of a product: the gallery sample's design and photos, or painted photos as a fallback. */
function Sample({ product, side = 'front', long = 420 }: { product: ProductId; side?: 'front' | 'back'; long?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fontTick = useApp((s) => s.ui.fontTick);
  const fallback = useMemo(
    () => ({
      d: sampleDesign(product),
      photos: [0, 1, 2, 3].map((i) => samplePhoto(i + (product === 'frame' ? 2 : product === 'calendar' ? 1 : 0))),
    }),
    [product],
  );
  const [inp, setInp] = useState<{ d: Design; photos: Photo[] }>(fallback);
  useEffect(() => {
    let live = true;
    const def = SAMPLES.find((x) => x.id === SAMPLE_FOR[product]);
    void sampleCredits().then(async (c) => {
      if (!c || !def || !live) return;
      try {
        const s = await buildSample(def, c);
        if (live) setInp({ d: s.design, photos: s.photos });
      } catch {
        /* keep the painted fallback */
      }
    });
    return () => {
      live = false;
    };
  }, [product]);
  const { w, h } = cardMM(inp.d);
  useEffect(() => {
    const draw = () => ref.current && renderCard(ref.current, side, (long * Math.min(2, devicePixelRatio || 1)) / Math.max(w, h), 0, inp);
    draw();
    void ensureFonts(fontsFor(inp.d)).then(draw);
  }, [inp, side, long, w, h, fontTick]);
  return <canvas ref={ref} className="sample" style={{ aspectRatio: `${w}/${h}` }} aria-hidden="true" />;
}

const STEPS = [
  ['Add photos', 'Drop in your photos once. They stay in your photo store, ready for any card, calendar or frame.'],
  ['Pick size and layout', 'Standard postcard, calendar and frame sizes, with layouts for one to four photos.'],
  ['Theme and words', 'Festivals, birthdays and seasons, or your own colours. Add a greeting and your Instagram tag.'],
  ['Download the print pack', 'Front and back as separate files, a print PDF with bleed and crop marks, and a spec sheet.'],
];

export function Landing() {
  const open = (p: ProductId) => startProduct(p);
  return (
    <div className="landing">
      <nav className="lnav" aria-label="Main">
        <a className="lbrand" href="#" onClick={(e) => e.preventDefault()}>
          <Logo />
          <span>Chitthi</span>
        </a>
        <div className="lnav-links">
          <a href="#products">Products</a>
          <a href="#how">How it works</a>
          <a href="#export">Print pack</a>
        </div>
        <button type="button" className="btn ghost" onClick={() => setUI({ gallery: true })}>
          <GalleryIcon />
          <span className="lbl">Gallery</span>
        </button>
        <button type="button" className="btn primary" onClick={() => setUI({ screen: 'studio' })}>
          Open studio
        </button>
      </nav>

      <main>
        <header className="hero">
          <div className="hero-copy">
            <p className="kicker">Print studio in your browser</p>
            <h1>
              Postcards, calendars and framed prints, <em>ready for the print shop.</em>
            </h1>
            <p className="hero-sub">
              Design with your own photos, Indian festival and season themes, and real print sizes. Download front and back
              files, a PDF with bleed, and a print spec in one click.
            </p>
            <div className="hero-cta">
              <button type="button" className="btn primary big" onClick={() => open('postcard')}>
                Start a postcard
              </button>
              <button type="button" className="btn big" onClick={() => open('calendar')}>
                Make a calendar
              </button>
              <button type="button" className="btn big" onClick={() => open('frame')}>
                Frame a photo
              </button>
            </div>
            <p className="hero-note">Free. No account. Your photos never leave this browser.</p>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="fan f1">
              <Sample product="calendar" long={360} />
            </div>
            <div className="fan f2">
              <Sample product="frame" long={320} />
            </div>
            <div className="fan f3">
              <Sample product="postcard" long={420} />
            </div>
          </div>
        </header>

        <section id="products" className="lsec">
          <h2>Three things to print</h2>
          <p className="lsec-sub">Each one has its own sizes, layouts and options, and they share your photos and themes.</p>
          <div className="products">
            {PRODUCTS.map((p) => (
              <article key={p.id} className="product">
                <button type="button" className="product-art" onClick={() => open(p.id)} aria-label={`Start a ${p.name.toLowerCase()}`}>
                  <Sample product={p.id} long={360} />
                </button>
                <h3>
                    <span className="product-ico">
                      <ProductIcon id={p.id} />
                    </span>
                    {p.name}
                  </h3>
                <p>{p.blurb}</p>
                <ul>
                  {p.id === 'postcard' && (
                    <>
                      <li>4×6, A6, India Post, 5×7 and Instax-style sizes</li>
                      <li>18 layouts, from full photo to four-photo collage</li>
                      <li>Postal back with stamp box, address and PIN</li>
                    </>
                  )}
                  {p.id === 'calendar' && (
                    <>
                      <li>A4, A3, tabloid, square wall and A5 desk sizes</li>
                      <li>Single month or 12 months from any start month</li>
                      <li>Sunday or Monday weeks, year-at-a-glance back</li>
                    </>
                  )}
                  {p.id === 'frame' && (
                    <>
                      <li>4×6 up to 11×14 in, A4, A3 and square</li>
                      <li>Thin, classic or wide mat in white, cream or black</li>
                      <li>Single, pair, triptych and grid layouts</li>
                    </>
                  )}
                </ul>
                <button type="button" className="btn primary" onClick={() => open(p.id)}>
                  Design a {p.name.toLowerCase()}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="lsec">
          <h2>How it works</h2>
          <ol className="how">
            {STEPS.map(([t, s], i) => (
              <li key={t}>
                <span className="dot">{i + 1}</span>
                <b>{t}</b>
                <p>{s}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="export" className="lsec split">
          <div>
            <h2>A print pack the shop can use</h2>
            <p className="lsec-sub">
              Every export is a single ZIP. Fronts and backs are separate full-resolution PNGs at the full document size,
              tagged with their dpi. The PDF has every page in order with crop marks, and the spec sheet tells the printer exactly
              what they are looking at.
            </p>
            <ul className="checks">
              <li>Bleed of 3 mm, ⅛ in or 5 mm on every edge</li>
              <li>300 dpi, with a sharpness check for every photo</li>
              <li>Single-page PDFs or sheets of A4, A3 and 13×19 in</li>
              <li>Double-sided sheets with the backs mirrored</li>
            </ul>
          </div>
          <div className="files" aria-label="Example print pack">
            <p className="files-name">chitthi-diwali-4x6-print-pack.zip</p>
            <ul>
              <li className="dir">front/</li>
              <li>chitthi-diwali-4x6-front.png</li>
              <li className="dir">back/</li>
              <li>chitthi-diwali-4x6-back.png</li>
              <li>chitthi-diwali-4x6-print.pdf</li>
              <li className="spec">chitthi-diwali-4x6-PRINT-SPEC.txt</li>
            </ul>
            <pre>
              {`Trim (final) size:    152.4 × 101.6 mm
  Bleed:                3 mm on every edge
  Document size:        158.4 × 107.6 mm
  Safe area:            144.4 × 93.6 mm
  Resolution:           300 dpi → 1871 × 1271 px
  Sides:                flip on the LONG edge`}
            </pre>
          </div>
        </section>

        <section className="lsec final">
          <h2>Make something to hold</h2>
          <div className="hero-cta">
            <button type="button" className="btn primary big" onClick={() => open('postcard')}>
              Start a postcard
            </button>
            <button type="button" className="btn big" onClick={() => open('calendar')}>
              Make a calendar
            </button>
            <button type="button" className="btn big" onClick={() => open('frame')}>
              Frame a photo
            </button>
          </div>
        </section>
      </main>

      <footer className="lfoot">
        <span>Chitthi · चिट्ठी</span>
        <span>Everything is made and stored in your browser. Nothing is uploaded.</span>
      </footer>
    </div>
  );
}
