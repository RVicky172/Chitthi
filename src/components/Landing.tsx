import { useState, type CSSProperties, type ReactNode } from 'react';
import { Bot, Box, Clapperboard, Cpu, Images, Layers, Mail, MonitorSmartphone, Printer, ShieldCheck, SlidersHorizontal, Smartphone, Sparkles, Type } from 'lucide-react';
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
  [<MonitorSmartphone key="p" />, 'Exact sizes for every platform', 'Instagram feed and Story, Reels and Shorts, YouTube up to 4K: each made at the size and in the format that platform asks for.'],
  [<Clapperboard key="v" />, 'A real video timeline', 'Trim, split and reorder clips, time your text and stickers, slide the music by its waveform, and export an MP4 on your device.'],
  [<SlidersHorizontal key="e" />, 'Pro-grade photo editing', 'Exposure, white balance, tone curve, colour mixer, sharpening, noise reduction, clarity, dehaze and grain, free for everyone.'],
  [<Cpu key="g" />, 'Fast, on your graphics card', 'Looks and adjustments run on the graphics card, with exactly the same result in the preview and the exported file.'],
  [<Printer key="r" />, 'Print-ready files', 'Bleed, crop marks, 300 dpi PNGs, sheet layouts and a quote request for the print shop, in one ZIP.'],
  [<Mail key="m" />, 'Matching envelopes', 'A standard envelope for every design, printed ready-made or folded from a template, and opened in 3D.'],
  [<Images key="i" />, 'One photo library', 'Every photo in one place for both studios, plus free photos from Pexels without leaving the app.'],
  [<Type key="t" />, 'Your own fonts', 'Upload a TTF, OTF or WOFF once and use it in any design or caption, alongside 46 fonts for Indian scripts.'],
  [<Box key="b" />, '3D preview', 'Spin any design, flip through a wall calendar, see all twelve months at once, or open the envelope.'],
  [<Sparkles key="a" />, 'AI with your own key', 'Greetings, calendar captions and artwork from Claude, OpenAI, Gemini, a local Ollama and more. Optional.'],
  [<Bot key="g2" />, 'Works with AI agents', 'The desktop app is an MCP server with 34 tools, and a Claude Code plugin adds six workflow skills.'],
  [<ShieldCheck key="s" />, 'Private and free', 'No account and no upload: your photos never leave your device. Free and open source, with no paid tier.'],
];

function CTAs({ open }: { open: (p: ProductId) => void }) {
  return (
    <div className="hero-cta">
      <button type="button" className="btn primary big" onClick={() => open('postcard')}>
        Start a postcard
      </button>
      <a className="btn primary big" href="#/instagram">
        Make an Instagram post
      </a>
      <a className="btn big" href="#/instagram/video">
        Edit a Reel
      </a>
      <a className="btn big" href="#/instagram/youtube">
        Edit a YouTube video
      </a>
      <button type="button" className="btn big" onClick={() => open('calendar')}>
        Make a calendar
      </button>
    </div>
  );
}

/**
 * The photo & video studio's three platforms, at the sizes the editors export (src/data/instagram.ts and
 * src/engine/video.ts: kept as text here so the landing page doesn't load the video engine). The screenshots are the
 * real editors (npm run build:showcase doesn't make them: they come from docs/screenshots/).
 */
const MEDIA: { id: string; href: string; ratio: string; r: number; size: string; title: string; where: string; text: string; specs: string[]; shot: string; alt: string; cta: string; icon: ReactNode }[] = [
  {
    id: 'instagram',
    href: '#/instagram',
    ratio: '4 / 5',
    r: 4 / 5,
    size: '1080 × 1350',
    title: 'Instagram posts and carousels',
    where: 'Portrait 4:5, square, 3:4, landscape and Story 9:16',
    text: 'A batch of up to 20 photos, each with its own look, text, stickers, shapes and drawings, ready to share to Instagram from your phone.',
    specs: ['1080 px wide, the width Instagram shows', 'Up to 20 photos, the carousel limit', 'Caption counter: 2,200 characters, 30 hashtags', 'JPEG or PNG, or straight to the share sheet'],
    shot: '/showcase/studio-photo.webp',
    alt: 'The Instagram photo editor: a batch of four photos, a bowl of Holi colours with the words Happy Holi and a party sticker',
    cta: 'Make a post',
    icon: <InstagramIcon />,
  },
  {
    id: 'reels',
    href: '#/instagram/video',
    ratio: '9 / 16',
    r: 9 / 16,
    size: '1080 × 1920',
    title: 'Reels and Shorts',
    where: 'Instagram Reels and Stories, YouTube Shorts',
    text: 'Photos and clips on a timeline with movement, timed text and stickers, and music, exported as the MP4 Instagram asks for.',
    specs: ['9:16, 4:5 or 1:1 at 1080 px', 'H.264 and AAC with fast start, as Instagram requires', 'Up to 90 s in the browser, 3 min and 60 fps on desktop', 'Shared from your phone or saved to a file'],
    shot: '/showcase/studio-reel.webp',
    alt: 'The Reels editor: a vertical frame of Holi colours with the words Festival memories, and a timeline with four clips, text, a sticker and music',
    cta: 'Make a Reel',
    icon: <Smartphone />,
  },
  {
    id: 'youtube',
    href: '#/instagram/youtube',
    ratio: '16 / 9',
    r: 16 / 9,
    size: '1920 × 1080',
    title: 'YouTube videos',
    where: 'Full HD in the browser; 1440p and 4K in the desktop app',
    text: 'Trim, split and reorder on a timeline, add titles and music, and export straight into a file, however long the video is.',
    specs: ["YouTube's recommended bitrates for each size", 'Up to 15 min in the browser, 3 hours on desktop', '30 or 60 fps, encoded with your graphics card', 'Written straight to disk, ready to upload'],
    shot: '/showcase/studio-video.webp',
    alt: 'The YouTube editor: the title A week in Odisha over the Puri temple, and a timeline with five clips, a text layer and music',
    cta: 'Edit a video',
    icon: <Clapperboard />,
  },
];

/** What the photo editor offers (P1.1–P1.3 of docs/planning/EDITOR-IMPLEMENTATION.md). */
const EDITOR: [string, string][] = [
  ['Light and white balance', 'Exposure, highlights, shadows, whites and blacks, in linear light like a camera; pick a grey to fix the colour.'],
  ['Tone curve and colour mixer', 'An RGB curve and one per channel, and hue, saturation and luminance for eight colours.'],
  ['Detail and effects', 'Sharpening that skips smooth skin and sky, noise reduction, clarity, dehaze and grain.'],
  ['Layers on top', 'Text in any of 46 fonts or your own, shapes that hold words, stickers and freehand drawing.'],
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
          { label: 'Two studios', href: '#studios' },
          { label: 'For each platform', href: '#platforms' },
          { label: 'Photo editor', href: '#editor' },
          { label: 'Print', href: '#products' },
          { label: 'Examples', href: '#examples' },
          { label: 'Features', href: '#features' },
        ]}
        actions={[{ key: 'gallery', label: 'Gallery', icon: <GalleryIcon />, onSelect: () => setUI({ gallery: true }) }]}
      />

      <main>
        <Journey front={shot('tinted-postcard')} back={shot('tinted-postcard', 'back')} envelope={shot('tinted-postcard', 'envelope-front')}>
          <h1>One studio for what you print and what you post.</h1>
          <p className="hero-sub">
            Postcards, calendars, framed prints and fridge magnets, print-ready with bleed. Instagram posts, Reels and Shorts,
            and YouTube videos, each made to its platform&rsquo;s exact size, in a photo and video editor built for them.
          </p>
          <CTAs open={open} />
          <p className="hero-note">
            {isDesktop ? 'On your computer' : 'In your browser'} · Free · No account · Your photos never leave this{' '}
            {isDesktop ? 'computer' : 'browser'}
          </p>
        </Journey>

        <section id="studios" className="lsec ld-studios">
          <div className="ld-sec-head">
            <h2>Two studios, one app</h2>
            <p className="lsec-sub">They share your photos, fonts and looks. Everything is made on your device, free.</p>
          </div>
          <div className="ld-pillars">
            <article className="ld-pillar">
              <span className="ld-pillar-tag">
                <Printer /> Print studio
              </span>
              <h3>Made to hold</h3>
              <Shot img={shot('tinted-postcard')} className="ld-pillar-shot" />
              <p>Postcards, calendars, framed prints and fridge magnets with Indian festival and season themes, and an envelope to match.</p>
              <ul className="checks">
                <li>{SIZES.filter((x) => x.id !== 'custom').length} print sizes and {LAYOUTS.length} layouts</li>
                <li>Print-ready PDFs with bleed and crop marks</li>
                <li>A print pack and quote request for the shop</li>
              </ul>
              <button type="button" className="btn primary" onClick={() => open('postcard')}>
                Start a postcard
              </button>
            </article>
            <article className="ld-pillar">
              <span className="ld-pillar-tag">
                <Layers /> Photo &amp; video studio
              </span>
              <h3>Made to post</h3>
              <img
                className="shot ld-pillar-shot ld-screen"
                src="/showcase/studio-editor.webp"
                width={1600}
                height={1000}
                alt="The photo editor: marigolds with a tone curve and the colour mixer open beside them"
                loading="lazy"
                decoding="async"
              />
              <p>Instagram posts and carousels, Reels and Shorts, and YouTube videos, each at the size and in the format its platform asks for.</p>
              <ul className="checks">
                <li>Photo editing with curves, colour mixer and detail</li>
                <li>A video timeline with text, stickers and music</li>
                <li>MP4s ready for Instagram and YouTube</li>
              </ul>
              <a className="btn primary" href="#/instagram">
                Open the photo &amp; video studio
              </a>
            </article>
          </div>
        </section>

        <section id="platforms" className="lsec ld-platforms">
          <div className="ld-sec-head">
            <h2>Made for each platform</h2>
            <p className="lsec-sub">
              Every platform wants something different. The photo &amp; video studio knows the sizes, limits and file formats,
              so what you export is ready to post.
            </p>
          </div>
          <ul className="ld-platform-list">
            {MEDIA.map((m) => (
              <li key={m.id} id={m.id} className="ld-platform" style={{ '--r': m.r } as CSSProperties}>
                <div className="ld-platform-text">
                  <span className="ld-pillar-tag">
                    {m.icon} {m.size}
                  </span>
                  <h3>{m.title}</h3>
                  <small>{m.where}</small>
                  <p>{m.text}</p>
                  <ul className="checks">
                    {m.specs.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <a className="btn primary" href={m.href}>
                    {m.cta}
                  </a>
                </div>
                <img className="shot ld-screen" src={m.shot} width={1600} height={1000} alt={m.alt} loading="lazy" decoding="async" />
              </li>
            ))}
          </ul>
        </section>

        <section id="editor" className="lsec ld-editor ld-mat">
          <div>
            <h2>A photo editor, not a filter app</h2>
            <p className="lsec-sub">
              The tools of a professional photo editor, free for everyone, in the browser and the desktop app. They run on your
              graphics card, and the preview, the exported photo and every video frame come out exactly the same.
            </p>
            <dl className="ld-editor-list">
              {EDITOR.map(([t, x]) => (
                <div key={t}>
                  <dt>{t}</dt>
                  <dd>{x}</dd>
                </div>
              ))}
            </dl>
            <a className="btn primary" href="#/instagram">
              Edit a photo
            </a>
          </div>
          <img
            className="shot ld-screen"
            src="/showcase/studio-editor.webp"
            width={1600}
            height={1000}
            alt="The photo editor with a tone curve and the colour mixer, on a photo of marigolds"
            loading="lazy"
            decoding="async"
          />
        </section>
        <p className="ld-credit">Sample photos in the editor screenshots: Pexels.</p>

        <div className="ld-divider" id="print">
          <span className="ld-pillar-tag">
            <Printer /> Print studio
          </span>
        </div>

        <section id="products" className="lsec ld-products-sec">
          <div className="ld-sec-head">
            <h2>Four things to print</h2>
            <p className="lsec-sub">Each has its own sizes, layouts and options. They share your photos, occasions and fonts.</p>
          </div>
          <ProductExplorer shots={SHOTS} open={open} />
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
          <p className="lsec-sub">From the first photo to the envelope it goes in, or the post it ends up in.</p>
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
          <h2>Make something to hold, or to post</h2>
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
          . <a href="#/docs">Documentation</a> · <a href="#/sizes">Sizes guide</a> ·{' '}
          <a href="https://github.com/RVicky172/Chitthi" target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </span>
      </footer>
    </div>
  );
}
