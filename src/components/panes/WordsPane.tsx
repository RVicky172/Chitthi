import { resolveTheme } from '../../engine/design';
import { setDesign, setUI, useApp } from '../../state/store';
import type { HAlign, VAlign } from '../../types';
import { Check, Pane, Section, Seg } from '../common';
import { FontPicker } from '../FontPicker';
import { InstagramIcon } from '../icons';
import { AiWordsEntry } from '../ai/AiEntry';
import { CalendarFront } from './CalendarFront';
import { PostmarkYear } from './EnvelopeSection';

export function WordsPane() {
  const product = useApp((s) => s.design.product);
  return product === 'calendar' ? <CalendarFront /> : <CardWords />;
}

/** Postcards, frames and magnets: greeting, quote and signature, each with its own font. */
function CardWords() {
  const d = useApp((s) => s.design);
  const t = resolveTheme(d);
  return (
    <Pane
      title="Front"
      lead={
        d.product === 'frame'
            ? 'Words show under the photo with the “Photo and caption” layout. The Instagram tag shows on every layout.'
            : d.product === 'magnet'
              ? 'Keep it short: a name, a place or a date reads best on a magnet. Two-photo and four-photo layouts are photos only.'
              : undefined
      }
      next="back"
      onNext={() => setUI({ pane: 'back' })}
    >
      <Section id="words.text" title="Greeting, quote and signature">
      <AiWordsEntry mode="card" />
      <Check checked={d.showHeading} onChange={(showHeading) => setDesign({ showHeading })}>
        Greeting
      </Check>
      <input type="text" aria-label="Greeting" value={d.heading} onChange={(e) => setDesign({ heading: e.target.value })} />
      <div className="chips">
        {t.heads.map((x) => (
          <button key={x} type="button" className="chip" onClick={() => setDesign({ heading: x, showHeading: true })}>
            {x}
          </button>
        ))}
      </div>
      <FontPicker
        label="Greeting font"
        value={d.headFont}
        sample={d.heading || 'Happy Diwali'}
        weight="hw"
        onChange={(headFont) => setDesign({ headFont })}
      />
      <Check checked={d.showQuote} onChange={(showQuote) => setDesign({ showQuote })}>
        Quote or wish
      </Check>
      <textarea rows={3} aria-label="Quote" value={d.quote} onChange={(e) => setDesign({ quote: e.target.value })} />
      <details>
        <summary className="hint" style={{ cursor: 'pointer' }}>
          Suggested quotes
        </summary>
        <div className="quotes">
          {t.quotes.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => setDesign({ quote: q, showQuote: true })}>
              {q}
            </button>
          ))}
        </div>
      </details>
      <FontPicker
        label="Quote font"
        value={d.quoteFont}
        sample={d.quote || 'Wish you were here'}
        weight="bw"
        onChange={(quoteFont) => setDesign({ quoteFont })}
      />
      <Check checked={d.showSig} onChange={(showSig) => setDesign({ showSig })}>
        Signature line
      </Check>
      <input type="text" aria-label="Signature" value={d.sig} onChange={(e) => setDesign({ sig: e.target.value })} />
      <FontPicker
        label="Signature font"
        value={d.sigFont || d.quoteFont}
        sample={d.sig || 'With love'}
        weight="bw"
        onChange={(f) => setDesign({ sigFont: f === d.quoteFont ? '' : f })}
      />
      </Section>
      {d.layout === 'stamp' && (
        <Section id="words.postmark" title="Postmark" note={String(d.postYear || new Date().getFullYear())}>
          <PostmarkYear />
        </Section>
      )}
      <Section id="words.insta" title="Instagram tag" note={d.insta ? `@${d.insta}` : undefined} defaultOpen={false}>
      <label className="f">
        Instagram (shown in the photo’s bottom-right corner)
        <span className="ig">
          <InstagramIcon />
          <input
            type="text"
            placeholder="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={d.insta}
            onChange={(e) => setDesign({ insta: e.target.value.replace(/[@\s]/g, '') })}
          />
        </span>
      </label>
      <FontPicker
        label="Tag font"
        value={d.instaFont || 'Hind'}
        sample={d.insta || 'username'}
        weight="hw"
        onChange={(f) => setDesign({ instaFont: f === 'Hind' ? '' : f })}
      />
      </Section>
      <Section id="words.fonts" title="Text size" note={`${Math.round(d.textScale * 100)}%`}>
      <label className="f">
        Text size
        <input
          type="range"
          min={0.6}
          max={1.6}
          step={0.05}
          value={d.textScale}
          onChange={(e) => setDesign({ textScale: +e.target.value })}
        />
      </label>
      </Section>
      <Section id="words.place" title="Position and colour">
      <div className="inline">
        <Seg<VAlign>
          label="Vertical position"
          value={d.vAlign}
          options={[
            ['top', 'Top'],
            ['middle', 'Middle'],
            ['bottom', 'Bottom'],
          ]}
          onChange={(vAlign) => setDesign({ vAlign })}
        />
        <Seg<HAlign>
          label="Alignment"
          value={d.hAlign}
          options={[
            ['left', 'Left'],
            ['center', 'Center'],
            ['right', 'Right'],
          ]}
          onChange={(hAlign) => setDesign({ hAlign })}
        />
      </div>
      <div className="inline">
        <Check checked={d.customColor} onChange={(customColor) => setDesign({ customColor })}>
          Custom text colour
        </Check>
        <input
          type="color"
          aria-label="Text colour"
          value={d.color}
          onChange={(e) => setDesign({ color: e.target.value, customColor: true })}
        />
      </div>
      <Check checked={d.scrim} onChange={(scrim) => setDesign({ scrim })}>
        Darken the photo behind text
      </Check>
      <Check checked={d.ornament} onChange={(ornament) => setDesign({ ornament })}>
        Ornament between greeting and quote
      </Check>
      </Section>
    </Pane>
  );
}
