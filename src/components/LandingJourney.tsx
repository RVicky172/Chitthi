import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ShowcaseImage } from '../data/showcase';

/*
 * The landing hero: "from a photo on your phone to a card in the post", told by scrolling. The section is tall and its
 * stage stays pinned while the page scrolls through it; scroll position becomes one number, --p (0 to 1), and CSS turns
 * that into the five beats below (styles/23-landing-showcase.css, "journey"). Every picture is a real Chitthi render.
 * No video and no library: with reduced motion the stage stays on the finished card and the steps read as a list.
 */

const BEATS: [string, string][] = [
  ['A photo on your phone', 'Start from a photo you already have, or find a free one on Pexels without leaving the studio.'],
  ['Becomes a card', 'Pick a size, a layout and an occasion: festivals, birthdays, seasons, or your own colours and fonts.'],
  ['With a proper back', 'Write the message and the address on a postal back laid out like the real thing.'],
  ['In a matching envelope', 'The smallest standard envelope it fits, dressed in the same occasion, with your photo in the seal.'],
  ['Ready for the post', 'Download a print pack with bleed and crop marks, print it at any shop, and send it.'],
];

/** A postmark: two rings, the name around the edge, and the wavy cancellation lines beside it. */
function Postmark() {
  return (
    <svg className="jn-postmark" viewBox="0 0 220 120" aria-hidden="true">
      <defs>
        <path id="jn-ring" d="M60 60 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0" />
      </defs>
      <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="60" cy="60" r="30" fill="none" stroke="currentColor" strokeWidth="2" />
      <text fontSize="11" fontWeight="700" letterSpacing="3" fill="currentColor">
        <textPath href="#jn-ring">CHITTHI · PRINTED AT HOME ·</textPath>
      </text>
      <text x="60" y="66" textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">
        चिट्ठी
      </text>
      {[34, 48, 62, 76, 90].map((y) => (
        <path key={y} d={`M122 ${y} q12 -7 24 0 t24 0 t24 0 t24 0`} fill="none" stroke="currentColor" strokeWidth="3" />
      ))}
    </svg>
  );
}

export function Journey({
  front,
  back,
  envelope,
  children,
}: {
  front?: ShowcaseImage;
  back?: ShowcaseImage;
  envelope?: ShowcaseImage;
  /** The headline, introduction and calls to action, shown above the steps. */
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect(),
        run = Math.max(1, r.height - innerHeight),
        p = Math.min(1, Math.max(0, -r.top / run));
      el.style.setProperty('--p', p.toFixed(4));
      setStep(Math.min(BEATS.length - 1, Math.floor(p * BEATS.length)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const apply = () => {
      setStill(reduce.matches);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      if (reduce.matches) {
        el.style.removeProperty('--p');
        return;
      }
      addEventListener('scroll', onScroll, { passive: true });
      addEventListener('resize', onScroll);
      update();
    };
    apply();
    reduce.addEventListener('change', apply);
    return () => {
      cancelAnimationFrame(raf);
      reduce.removeEventListener('change', apply);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, []);

  /** Scroll to the middle of a beat, so the steps work as a table of contents too. */
  const goTo = (i: number) => {
    const el = ref.current;
    if (!el || still) return;
    const run = el.offsetHeight - innerHeight;
    const top = el.getBoundingClientRect().top + scrollY + (run * (i + 0.6)) / BEATS.length;
    window.scrollTo({ top, behavior: 'smooth' });
  };

  const credit = front?.credits[0];
  return (
    <section ref={ref} className={`ld-journey${still ? ' still' : ''}`} aria-label="From a photo to a card in the post">
      <div className="jn-pin">
        <div className="jn-copy">
          {children}
          <ol className="jn-steps">
            {BEATS.map(([t, d], i) => (
              <li key={t} aria-current={!still && i === step ? 'step' : undefined}>
                <button type="button" onClick={() => goTo(i)} tabIndex={still ? -1 : undefined}>
                  <span className="jn-n" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <b>{t}</b>
                </button>
                <p>{d}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="jn-stage" aria-hidden="true">
          {front && back && envelope && (
            <div className="jn-objects" style={{ aspectRatio: `${front.w} / ${front.h}` }}>
              <div className="jn-card">
                <div className="jn-flip">
                  <img className="jn-front" src={front.src} width={front.w} height={front.h} alt="" fetchPriority="high" decoding="async" />
                  <img className="jn-back" src={back.src} width={back.w} height={back.h} alt="" loading="lazy" decoding="async" />
                </div>
              </div>
              <img className="jn-env" src={envelope.src} width={envelope.w} height={envelope.h} alt="" loading="lazy" decoding="async" />
              <Postmark />
            </div>
          )}
          <p className="jn-hint">Scroll to turn this photo into a card</p>
          {credit && (
            <p className="jn-file">
              <span>Photo: {credit.name} on Pexels</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
