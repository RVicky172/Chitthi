import { useState, type CSSProperties, type ReactNode } from 'react';
import { Bot, Box, Clapperboard, Images, Mail, Ruler, Search, Smartphone, Sparkles, Type } from 'lucide-react';
import { FONTS } from '../data/fonts';
import { LAYOUTS } from '../data/layouts';
import { PRODUCTS } from '../data/products';
import type { ShowcaseImage, ShowcaseRender } from '../data/showcase';
import SHOWCASE_JSON from '../data/showcase.json';
import { SIZES } from '../data/sizes';
import { TH } from '../data/themes';
import { isDesktop } from '../platform/desktop';
import { startProduct } from '../state/actions';
import { setUI } from '../state/store';
import type { ProductId } from '../types';
import { EnvelopeScene, SpinCard } from './Landing3D';
import { ProductExplorer, PrintReady } from './LandingInteractive';
import { Journey } from './LandingJourney';
import { GalleryIcon, InstagramIcon, ProductIcon } from './icons';
import { SiteNav } from './SiteNav';

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

const FEATURES: [ReactNode, string, string][] = [
  [<Images key="i" />, 'Photo library', 'Every photo in one place, filtered to the shape of the slot you are filling, with a sharpness check for print.'],
  [<Search key="s" />, 'Free photos from Pexels', 'Search millions of free photos without leaving the studio. Suggestions follow your occasion and calendar month.'],
  [<Mail key="m" />, 'Matching envelopes', 'A standard envelope for every design, printed ready-made or folded from a template, and opened in 3D.'],
  [<Type key="t" />, 'Your own fonts', 'Upload a TTF, OTF or WOFF once and use it in any design, alongside 46 fonts for Indian scripts.'],
  [<Ruler key="r" />, 'Sizes and layouts guide', 'Every size drawn to scale with bleed and safe area, pixels needed, and how many fit on a sheet.'],
  [<Box key="b" />, '3D preview', 'Spin any design, flip through a wall calendar, see all twelve months at once, or open the envelope.'],
  [<Sparkles key="a" />, 'AI with your own key', 'Greetings, calendar captions and slot-shaped artwork from Claude, OpenAI, Gemini, a local Ollama and more. Optional.'],
  [<Bot key="g" />, 'Works with AI agents', 'The desktop app is an MCP server with 34 tools, and a Claude Code plugin adds six workflow skills.'],
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

/**
 * The photo & video studio's three kinds of work, at the sizes the editors export (src/data/instagram.ts and
 * src/engine/video.ts: kept as text here so the landing page doesn't load the video engine).
 */
const MEDIA: { href: string; ratio: string; r: number; size: string; title: string; where: string; text: string; cta: string; icon: ReactNode }[] = [
  {
    href: '#/instagram',
    ratio: '4 / 5',
    r: 4 / 5,
    size: '1080 × 1350',
    title: 'Instagram posts',
    where: 'Portrait, square, 3:4, landscape and Story',
    text: 'A batch of photos with text, stickers, shapes and drawings, exported as feed-ready JPEGs.',
    cta: 'Make a post',
    icon: <InstagramIcon />,
  },
  {
    href: '#/instagram/video',
    ratio: '9 / 16',
    r: 9 / 16,
    size: '1080 × 1920',
    title: 'Reels and Shorts',
    where: 'Instagram Reels and Stories, YouTube Shorts',
    text: 'Clips and photos on a timeline with music, captions and stickers, exported as an MP4 you can share.',
    cta: 'Make a Reel',
    icon: <Smartphone />,
  },
  {
    href: '#/instagram/youtube',
    ratio: '16 / 9',
    r: 16 / 9,
    size: '1920 × 1080',
    title: 'YouTube videos',
    where: 'Full HD, plus 1440p and 4K in the desktop app',
    text: 'Trim, split and reorder on a timeline, then export straight into a file, however long the video is.',
    cta: 'Edit a video',
    icon: <Clapperboard />,
  },
];

type Filter = 'all' | ProductId;

export function Landing() {
  const open = (p: ProductId) => startProduct(p);
  const [filter, setFilter] = useState<Filter>('all');
  const examples = SHOTS.filter((s) => s.render === 'front' && (filter === 'all' || s.product === filter));
  return (
    <div className="landing ld">
      <SiteNav
        isHome
        links={[
          { label: 'Products', href: '#products' },
          { label: 'Photo & video', href: '#media' },
          { label: 'Examples', href: '#examples' },
          { label: 'Print-ready files', href: '#export' },
          { label: '3D preview', href: '#in3d' },
          { label: 'Features', href: '#features' },
        ]}
        actions={[{ key: 'gallery', label: 'Gallery', icon: <GalleryIcon />, onSelect: () => setUI({ gallery: true }) }]}
      />

      <main>
        <Journey front={shot('tinted-postcard')} back={shot('tinted-postcard', 'back')} envelope={shot('tinted-postcard', 'envelope-front')}>
          <h1>Your photos, made to hold.</h1>
          <p className="hero-sub">
            Postcards, calendars, framed prints and fridge magnets with Indian festival and season themes, a matching envelope,
            and print-ready files with bleed. Posts, Reels and YouTube videos too.
          </p>
          <CTAs open={open} />
          <p className="hero-note">
            {isDesktop ? 'On your computer' : 'In your browser'} · Free · No account · Your photos never leave this{' '}
            {isDesktop ? 'computer' : 'browser'}
          </p>
        </Journey>

        <section id="products" className="lsec ld-products-sec">
          <div className="ld-sec-head">
            <h2>Four things to print</h2>
            <p className="lsec-sub">Each has its own sizes, layouts and options. They share your photos, occasions and fonts.</p>
          </div>
          <ProductExplorer shots={SHOTS} open={open} />
        </section>

        <section id="media" className="lsec ld-media">
          <div className="ld-media-head">
            <h2>Posts, Reels and YouTube videos, too</h2>
            <p className="lsec-sub">
              The photo &amp; video studio edits for the screen the way the print studio edits for paper: on your device, at the
              exact size each platform asks for.
            </p>
          </div>
          <ul className="ld-formats">
            {MEDIA.map((m) => (
              <li key={m.href} style={{ '--r': m.r } as CSSProperties}>
                <a className="ld-format" href={m.href}>
                  <span className="ld-frame" style={{ aspectRatio: m.ratio }}>
                    <span className="ld-frame-ico">{m.icon}</span>
                    <span className="ld-frame-size">{m.size}</span>
                  </span>
                  <b>{m.title}</b>
                  <small>{m.where}</small>
                  <span className="ld-format-text">{m.text}</span>
                  <span className="ld-go">{m.cta}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>

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

        <section id="export" className="lsec ld-ready-sec">
          <div className="ld-sec-head">
            <h2>Print-ready, whatever the size</h2>
            <p className="lsec-sub">
              Pick a size and a bleed. This is the exact geometry the studio exports: trim, bleed and safe area, the pixels a
              300 dpi print needs, and the files the print shop gets in one ZIP, with crop marks in the PDF.
            </p>
          </div>
          <PrintReady />
        </section>

        <section className="lsec ld-env ld-mat">
          <EnvelopeScene
            front={shot('tinted-postcard', 'envelope-front')}
            body={shot('tinted-postcard', 'envelope-body')}
            flap={shot('tinted-postcard', 'envelope-flap')}
            liner={shot('tinted-postcard', 'envelope-liner')}
            card={shot('tinted-postcard')}
          />
          <div>
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
          <SpinCard front={shot('tinted-postcard')} back={shot('tinted-postcard', 'back')} />
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
