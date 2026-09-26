import { useState, type ReactNode } from 'react';
import { Box, Images, Mail, Ruler, Search, Type } from 'lucide-react';
import { FONTS } from '../data/fonts';
import { LAYOUTS, layoutsFor } from '../data/layouts';
import { PRODUCTS, sizesFor } from '../data/products';
import type { ShowcaseImage, ShowcaseRender } from '../data/showcase';
import SHOWCASE_JSON from '../data/showcase.json';
import { SIZES } from '../data/sizes';
import { TH } from '../data/themes';
import { isDesktop } from '../platform/desktop';
import { startProduct } from '../state/actions';
import { setUI } from '../state/store';
import type { ProductId } from '../types';
import { canFullscreen, toggleFullscreen, useFullscreen } from '../lib/fullscreen';
import { EnvelopeScene, SpinCard, TiltStage } from './Landing3D';
import { FullscreenIcon, GalleryIcon, Logo, ProductIcon, SearchIcon, SettingsIcon } from './icons';

/*
 * Landing page. Every picture is a real Chitthi render made ahead of time (npm run build:showcase) and served as a
 * small static WebP from public/showcase/, so the page shows real output without drawing anything as it loads.
 */

const SHOTS = SHOWCASE_JSON as ShowcaseImage[];
const shot = (id: string, render: ShowcaseRender = 'front') => SHOTS.find((s) => s.id === id && s.render === render);

function Shot({ img, className, eager }: { img?: ShowcaseImage; className?: string; eager?: boolean }) {
  if (!img) return null;
  return (
    <img
      className={`shot${className ? ` ${className}` : ''}`}
      src={img.src}
      width={img.w}
      height={img.h}
      alt={`${img.title}: a ${PRODUCTS.find((p) => p.id === img.product)?.name.toLowerCase()} made with Chitthi`}
      loading={eager ? 'eager' : 'lazy'}
      fetchPriority={eager ? 'high' : undefined}
      decoding="async"
    />
  );
}

/** The example each product card shows. */
const PRODUCT_SHOT: Record<ProductId, string> = {
  postcard: 'jaipur-stamp',
  calendar: 'ladakh-calendar',
  frame: 'dadi-frame',
  magnet: 'temple-polaroid-magnet',
};

const STEPS = [
  ['Add photos', 'Upload once, or find free photos on Pexels. The photo library shows which ones suit each photo slot.'],
  ['Pick size and layout', 'Real print sizes for every product, with layouts for one to four photos. Compare them all in the sizes guide.'],
  ['Theme and words', 'Festivals, birthdays and seasons, or your own colours. Your own fonts too, and a caption for every calendar month.'],
  ['Download the print pack', 'Fronts, backs and a matching envelope, a print PDF with bleed and crop marks, and a spec sheet.'],
];

const FEATURES: [ReactNode, string, string][] = [
  [<Images key="i" />, 'Photo library', 'Every photo in one place, filtered to the shape of the slot you are filling, with a sharpness check for print.'],
  [<Search key="s" />, 'Free photos from Pexels', 'Search millions of free photos without leaving the studio. Suggestions follow your occasion and calendar month.'],
  [<Mail key="m" />, 'Matching envelopes', 'A standard envelope for every design, printed ready-made or folded from a template, and opened in 3D.'],
  [<Type key="t" />, 'Your own fonts', 'Upload a TTF, OTF or WOFF once and use it in any design, alongside 46 fonts for Indian scripts.'],
  [<Ruler key="r" />, 'Sizes and layouts guide', 'Every size drawn to scale with bleed and safe area, pixels needed, and how many fit on a sheet.'],
  [<Box key="b" />, '3D preview', 'Spin any design, flip through a wall calendar, see all twelve months at once, or open the envelope.'],
];

function CTAs({ open }: { open: (p: ProductId) => void }) {
  return (
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
      <button type="button" className="btn big" onClick={() => open('magnet')}>
        Make a magnet
      </button>
    </div>
  );
}

type Filter = 'all' | ProductId;

export function Landing() {
  const open = (p: ProductId) => startProduct(p);
  const [filter, setFilter] = useState<Filter>('all');
  const full = useFullscreen();
  const examples = SHOTS.filter((s) => s.render === 'front' && (filter === 'all' || s.product === filter));
  return (
    <div className="landing ld">
      <nav className="lnav" aria-label="Main">
        <a className="lbrand" href="#" onClick={(e) => e.preventDefault()}>
          <Logo />
          <span>Chitthi</span>
        </a>
        <div className="lnav-links">
          <a href="#examples">Examples</a>
          <a href="#products">Products</a>
          <a href="#features">Features</a>
          <a href="#in3d">3D</a>
          <a href="#how">How it works</a>
          <a href="#/sizes">Sizes</a>
        </div>
        <button type="button" className="btn icon ghost" title="Find a feature (Ctrl+K)" aria-label="Find a feature" onClick={() => setUI({ finder: true })}>
          <SearchIcon />
        </button>
        {canFullscreen() && (
          <button
            type="button"
            className="btn icon ghost"
            title={full ? 'Leave full screen' : 'Full screen'}
            aria-label={full ? 'Leave full screen' : 'Full screen'}
            aria-pressed={full}
            onClick={() => void toggleFullscreen()}
          >
            <FullscreenIcon on={full} />
          </button>
        )}
        <button type="button" className="btn icon ghost" title="Settings" aria-label="Settings" onClick={() => setUI({ settings: true })}>
          <SettingsIcon />
        </button>
        <button type="button" className="btn ghost" onClick={() => setUI({ gallery: true })}>
          <GalleryIcon />
          <span className="lbl">Gallery</span>
        </button>
        <button type="button" className="btn primary" onClick={() => setUI({ screen: 'studio' })}>
          Open studio
        </button>
      </nav>

      <main>
        <header className="ld-hero">
          <div className="ld-hero-copy">
            <p className="kicker">{isDesktop ? 'Print studio on your computer' : 'Print studio in your browser'}</p>
            <h1>
              Your photos, <em>made to hold.</em>
            </h1>
            <p className="hero-sub">
              Postcards, calendars, framed prints and fridge magnets with Indian festival and season themes, a matching
              envelope, and print-ready files with bleed, all in one click.
            </p>
            <CTAs open={open} />
            <p className="hero-note">
              Free for everyone · No account · Your photos never leave this {isDesktop ? 'computer' : 'browser'}
            </p>
          </div>
          <div className="ld-stage-wrap" aria-hidden="true">
            <TiltStage className="ld-stage">
              <Shot img={shot('ladakh-calendar')} className="s-cal" eager />
              <Shot img={shot('diwali-postcard', 'envelope-back')} className="s-env" eager />
              <Shot img={shot('diwali-postcard')} className="s-card" eager />
              <Shot img={shot('eid-magnet')} className="s-mag" eager />
              <Shot img={shot('puppy-badge')} className="s-badge" eager />
            </TiltStage>
          </div>
        </header>

        <dl className="ld-stats">
          <div>
            <dt>{SIZES.filter((x) => x.id !== 'custom').length}</dt>
            <dd>print sizes</dd>
          </div>
          <div>
            <dt>{LAYOUTS.length}</dt>
            <dd>layouts</dd>
          </div>
          <div>
            <dt>{TH.length}</dt>
            <dd>occasions</dd>
          </div>
          <div>
            <dt>{FONTS.length}+</dt>
            <dd>fonts, plus your own</dd>
          </div>
        </dl>

        <section id="examples" className="lsec">
          <div className="ld-head">
            <div>
              <h2>Made with Chitthi</h2>
              <p className="lsec-sub">Every example here was designed and drawn by Chitthi, with free photos from Pexels.</p>
            </div>
            <div className="chips" role="group" aria-label="Show examples of">
              {(
                [
                  ['all', 'All'],
                  ['postcard', 'Postcards'],
                  ['calendar', 'Calendars'],
                  ['frame', 'Photo frames'],
                  ['magnet', 'Magnets'],
                ] as [Filter, string][]
              ).map(([k, l]) => (
                <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <ul className="ld-gallery">
            {examples.map((s) => (
              <li key={s.id}>
                <figure>
                  <button type="button" className="ld-shot" onClick={() => open(s.product)} aria-label={`Make a ${s.product} like “${s.title}”`}>
                    <Shot img={s} />
                  </button>
                  <figcaption>
                    <b>{s.title}</b>
                    <span className="ld-pill">
                      <ProductIcon id={s.product} />
                      {PRODUCTS.find((p) => p.id === s.product)?.name}
                    </span>
                    <small>
                      Photo{s.credits.length > 1 ? 's' : ''}:{' '}
                      {s.credits.map((c, i) => (
                        <span key={c.url}>
                          {i ? ', ' : ''}
                          <a href={c.url} target="_blank" rel="noopener noreferrer">
                            {c.name}
                          </a>
                        </span>
                      ))}{' '}
                      on Pexels
                    </small>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>

        <section id="products" className="lsec">
          <h2>Four things to print</h2>
          <p className="lsec-sub">Each has its own sizes, layouts and options. They share your photos, themes and fonts.</p>
          <div className="ld-products">
            {PRODUCTS.map((p) => (
              <article key={p.id} className="ld-product">
                <button type="button" className="ld-product-art" onClick={() => open(p.id)} aria-label={`Start a ${p.name.toLowerCase()}`}>
                  <Shot img={shot(PRODUCT_SHOT[p.id])} />
                </button>
                <h3>
                  <span className="product-ico">
                    <ProductIcon id={p.id} />
                  </span>
                  {p.name}
                </h3>
                <p>{p.blurb}</p>
                <p className="ld-meta">
                  {sizesFor(p.id).filter((s) => s.id !== 'custom').length} sizes · {layoutsFor(p.id).length} layouts ·{' '}
                  <a href={`#/sizes/${p.id}`}>compare</a>
                </p>
                <button type="button" className="btn primary" onClick={() => open(p.id)}>
                  Design a {p.name.toLowerCase()}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="lsec ld-env">
          <EnvelopeScene
            front={shot('diwali-postcard', 'envelope-front')}
            body={shot('diwali-postcard', 'envelope-body')}
            flap={shot('diwali-postcard', 'envelope-flap')}
            liner={shot('diwali-postcard', 'envelope-liner')}
            card={shot('diwali-postcard')}
          />
          <div>
            <p className="kicker">New</p>
            <h2>An envelope for every design</h2>
            <p className="lsec-sub">
              Each design picks the smallest standard envelope it fits (C6, A7, DL, square and more) and dresses it in the same
              occasion: artwork, greeting, your photo in the seal, the address from the back of your card, and the Chitthi mark.
            </p>
            <ul className="checks">
              <li>Print on a ready-made envelope, or fold your own from the template</li>
              <li>Cut and fold lines, on the smallest sheet it fits</li>
              <li>Added to the print pack automatically</li>
              <li>Open it in 3D and watch the card slide out</li>
            </ul>
          </div>
        </section>

        <section id="in3d" className="lsec ld-3d">
          <div>
            <p className="kicker">3D preview</p>
            <h2>Turn it over before you print</h2>
            <p className="lsec-sub">
              Every design can be spun and flipped in 3D, front and back, with the paper's thickness. Calendars show all twelve
              months as a ring or as a wall calendar you page through, and the envelope opens to let the card out.
            </p>
            <ul className="checks">
              <li>Drag to turn, tap to flip</li>
              <li>All twelve calendar months at once</li>
              <li>A spiral-bound wall calendar, page by page</li>
              <li>The matching envelope, opening in 3D</li>
            </ul>
            <button type="button" className="btn primary" onClick={() => open('postcard')}>
              Try it in the studio
            </button>
          </div>
          <SpinCard front={shot('diwali-postcard')} back={shot('diwali-postcard', 'back')} />
        </section>

        <section id="features" className="lsec">
          <h2>Everything in one studio</h2>
          <p className="lsec-sub">From the first photo to the envelope it goes in.</p>
          <ul className="features">
            {FEATURES.map(([icon, t, x]) => (
              <li key={t}>
                <span className="feat-ico">{icon}</span>
                <b>{t}</b>
                <p>{x}</p>
              </li>
            ))}
          </ul>
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
              <li className="dir">envelope/</li>
              <li>chitthi-diwali-4x6-envelope-print.pdf</li>
              <li>chitthi-diwali-4x6-envelope-template-a4.pdf</li>
              <li className="spec">chitthi-diwali-4x6-PRINT-SPEC.txt</li>
            </ul>
            <pre>
              {`Trim (final) size:    152.4 × 101.6 mm
  Bleed:                3 mm on every edge
  Document size:        158.4 × 107.6 mm
  Safe area:            144.4 × 93.6 mm
  Resolution:           300 dpi → 1871 × 1271 px
  Envelope:             C6, 162 × 114 mm`}
            </pre>
          </div>
        </section>

        <section className="lsec final">
          <h2>Make something to hold</h2>
          <CTAs open={open} />
          <p className="hint">
            Not sure which size? <a href="#/sizes">See every size and layout</a>.
          </p>
        </section>
      </main>

      <footer className="lfoot">
        <span>Chitthi · चिट्ठी</span>
        <span>Everything is made and stored {isDesktop ? 'on your computer' : 'in your browser'}. Nothing is uploaded.</span>
        <span>
          Free and open source under the{' '}
          <a href="https://github.com/RVicky172/Chitthi/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
            MIT License
          </a>
          . <a href="#/sizes">Sizes guide</a> ·{' '}
          <a href="https://github.com/RVicky172/Chitthi" target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </span>
      </footer>
    </div>
  );
}
